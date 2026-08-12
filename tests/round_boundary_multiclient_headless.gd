extends SceneTree

# ROUND-END-24: the server transition is authoritative, but every client must
# hydrate it as a clean round boundary. Keep this focused on state that is
# allowed to reset at round end; score and room identity are match-scoped.

class FakeOnline:
	extends Node
	var room: Dictionary = {}
	var identity: Dictionary = {}
	func submit_move(_cell: int, _size_name: String) -> void:
		pass

const TransportScript = preload("res://scripts/online_session_reconnect_hydration.gd")

var failures: Array[String] = []
var intro: Node
var game: Node
var online: FakeOnline
var phase: String = "boot"
var pre_boundary: Dictionary = {}
var post_boundary: Dictionary = {}


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	intro = preload("res://scenes/intro.tscn").instantiate()
	root.add_child(intro)
	await process_frame
	game = intro.get_node_or_null("PostIntroGameplay")
	_expect(game != null, "production gameplay controller exists")
	if game == null:
		await _finish()
		return

	intro.call("_restart_intro")
	intro.call("_snap_final")
	intro.set("playing", false)
	intro.call("_publish_complete")
	for _frame in range(6):
		await process_frame

	online = FakeOnline.new()
	online.name = "RoundBoundaryFakeOnline"
	intro.add_child(online)
	game.set("online", online)

	for player_count: int in [2, 3, 4]:
		await _run_player_count(player_count)

	await _finish()


func _run_player_count(player_count: int) -> void:
	var scores: Dictionary = {}
	for index: int in range(player_count):
		scores["p%d" % (index + 1)] = 0
	var version: int = 40 + player_count * 20
	for round_number: int in [1, 2]:
		phase = "%dp-round-%d-pre" % [player_count, round_number]
		var starter: int = (round_number - 1) % player_count
		var playing: Dictionary = _room_state(player_count, version, "playing", round_number, starter, scores, {}, null, 0)
		_accept_for("p1", playing)
		var selected: int = int(game.call("_find_unplayed_piece", str(game.get("players")[0].get("direction", "right")), "small"))
		if selected >= 0:
			game.call("_open_piece_tray", selected)
		_expect(bool(game.get("tray_open")), phase + " can seed a round-scoped selection")

		scores["p1"] = int(scores.get("p1", 0)) + 1
		version += 1
		var winning_board: Dictionary = {
			"0": {"small": "marble"},
			"1": {"small": "marble"},
			"2": {"small": "marble"},
		}
		var winner: Dictionary = {"seat": "p1", "color": "marble"}
		var finished: Dictionary = _room_state(player_count, version, "finished", round_number, starter, scores, winning_board, winner, 3)
		pre_boundary = finished.duplicate(true)
		_accept_for("p1", finished)
		_expect(bool(game.get("round_complete")), phase + " shows exactly one round result state")
		_expect(not bool(game.get("tray_open")), phase + " finished snapshot closes piece tray")
		_expect(int(game.get("selected_index")) == -1, phase + " finished snapshot clears selection")
		_expect((game.get("result_button") as Button).visible, phase + " round result is visible at boundary")
		_expect(int(game.get("scores").get("right", -1)) == int(scores["p1"]), phase + " score increment hydrates once")

		# Reconnect while all clients are at the boundary: the same authoritative
		# result must be idempotent and preserve this tab's room identity.
		_accept_for("p1", finished)
		_expect(str(game.get("online_identity").get("code", "")) == "61", phase + " reconnect preserves room code")
		_expect(str(game.get("online_identity").get("seat", "")) == "p1", phase + " reconnect preserves seat")
		_expect(int(game.get("scores").get("right", -1)) == int(scores["p1"]), phase + " reconnect cannot double score")

		# Seed a real transport-level pending move from the old authoritative
		# version. A newer round snapshot must drop it before any deferred retry.
		var transport: Node = TransportScript.new()
		transport.set("active", true)
		transport.set("identity", {"token": "round-end-24-p1", "seat": "p1", "code": "61"})
		transport.set("room", finished.duplicate(true))
		transport.set("pending_mutation_kind", "move")
		transport.set("pending_mutation_payload", {
			"action": "move",
			"code": "61",
			"version": version,
			"cell": 8,
			"size": "large",
			"mutationId": "roundend24pendingmove000000000001",
		})
		transport.set("pending_mutation_attempts", 1)

		version += 1
		phase = "%dp-round-%d-post" % [player_count, round_number]
		var next_round: Dictionary = _room_state(player_count, version, "playing", round_number + 1, round_number % player_count, scores, {}, null, 0)
		post_boundary = next_round.duplicate(true)
		transport.call("_accept_room", next_round)
		_expect(str(transport.get("pending_mutation_kind")) == "", phase + " newer round snapshot clears stale pending move synchronously")
		transport.free()

		_accept_for("p1", next_round)
		_expect(not bool(game.get("round_complete")), phase + " next round is active")
		_expect(not bool(game.get("tray_open")), phase + " tray does not survive next-round hydration")
		_expect(int(game.get("selected_index")) == -1, phase + " selection does not survive next-round hydration")
		_expect((game.get("occupied_slots") as Dictionary).is_empty(), phase + " piece placement map is clean")
		_expect(int(game.get("move_count")) == 0, phase + " move count resets")
		_expect(not (game.get("result_button") as Button).visible, phase + " stale round result does not survive into gameplay")
		_expect(str(game.get("round_winner")) == "", phase + " stale winner status is cleared")
		_expect(int(game.get("round_number")) == round_number + 1, phase + " client advances exactly one round")
		_expect(int(game.get("current_player_index")) == round_number % player_count, phase + " authoritative next starter hydrates")
		_expect(int(game.get("scores").get("right", -1)) == int(scores["p1"]), phase + " match score persists")
		_expect(str(game.get("online_identity").get("code", "")) == "61", phase + " room identity persists")
		for record_value: Variant in game.get("piece_records"):
			var record: Dictionary = record_value as Dictionary
			_expect(not bool(record.get("played", false)), phase + " all round-scoped played flags reset")


func _accept_for(seat: String, room_state: Dictionary) -> void:
	online.identity = {"token": "round-end-24-" + seat, "seat": seat, "code": "61"}
	online.room = room_state.duplicate(true)
	game.call("_on_online_room_changed", online.room, online.identity)


func _room_state(player_count: int, version: int, status: String, round_number: int, turn_index: int, scores: Dictionary, board: Dictionary, winner: Variant, move_number: int) -> Dictionary:
	var colors: Array[String] = ["marble", "blue", "gold", "green"]
	var players: Array[Dictionary] = []
	var rematch: Dictionary = {}
	for index: int in range(player_count):
		var seat: String = "p%d" % (index + 1)
		players.append({"seat": seat, "color": colors[index]})
		rematch[seat] = false
	return {
		"protocol": 5,
		"code": "61",
		"version": version,
		"status": status,
		"targetPlayers": player_count,
		"targetRounds": 5,
		"winsToMatch": 5,
		"players": players,
		"turnIndex": turn_index,
		"board": board.duplicate(true),
		"round": round_number,
		"completedRounds": round_number if status == "finished" else maxi(round_number - 1, 0),
		"scores": scores.duplicate(true),
		"winner": winner if winner != null else {},
		"draw": false,
		"lastMove": {"cell": 2, "size": "small", "color": "marble", "seat": "p1"} if status == "finished" else null,
		"moveNumber": move_number,
		"matchComplete": false,
		"matchWinner": null,
		"matchWinners": [],
		"rematch": rematch,
	}


func _expect(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)


func _finish() -> void:
	if intro != null and is_instance_valid(intro):
		intro.queue_free()
		await process_frame
		await process_frame
	if failures.is_empty():
		print("YAKOLAK_ROUND_BOUNDARY_MULTICLIENT_OK")
		quit(0)
		return
	push_error("ROUND_END_24_CLIENT_FAILURE_SNAPSHOT phase=%s pre=%s post=%s" % [phase, JSON.stringify(pre_boundary), JSON.stringify(post_boundary)])
	for failure: String in failures:
		push_error(failure)
	quit(1)
