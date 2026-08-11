extends SceneTree

# Regression for ONLINE-02. The server trace for room 61 proved v7/turnIndex=3
# reached p4 on every tab; this test keeps that authoritative ownership distinct
# from the visual turn-camera tween so p4 cannot be stranded before submit_move.

class FakeOnline:
	extends Node
	var submit_count: int = 0
	var last_cell: int = -1
	var last_size: String = ""
	var room: Dictionary = {}
	var identity: Dictionary = {}

	func submit_move(cell: int, size_name: String) -> void:
		submit_count += 1
		last_cell = cell
		last_size = size_name

var failures: Array[String] = []
var intro: Node
var game: Node
var online: FakeOnline


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
	_expect(bool(game.get("waiting_for_setup")), "explicit intro handoff initializes gameplay before online state")

	online = FakeOnline.new()
	online.name = "OnlinePlayer4BoundaryTransport"
	intro.add_child(online)
	game.set("online", online)

	var p3_room: Dictionary = _room_state(
		6,
		2,
		2,
		{
			"4": {"large": "green"},
			"5": {"medium": "marble"},
		},
		{"cell": 5, "size": "medium", "color": "marble", "seat": "p2"}
	)
	var p4_room: Dictionary = _room_state(
		7,
		3,
		3,
		{
			"4": {"large": "green"},
			"5": {"medium": "marble"},
			"0": {"small": "gold"},
		},
		{"cell": 0, "size": "small", "color": "gold", "seat": "p3"}
	)

	# Reproduce the production boundary: this tab is p4, while the accepted room
	# first says p3 owns v6 and then advances once to p4 at v7.
	_accept_for("p4", p3_room)
	_expect(int(game.get("current_player_index")) == 2, "v6 is owned by player 3")
	_expect(str(game.call("_current_mode")) == "online", "p4 remains blocked while p3 owns the turn")
	_expect(not bool(game.get("gameplay_ready")), "p4 cannot act out of turn")

	_accept_for("p4", p4_room)
	_expect(int(game.get("current_player_index")) == 3, "player 3 advances exactly once to player 4")
	_expect(str(game.call("_current_mode")) == "local", "authoritative p4 seat becomes the local owner")
	_expect(bool(game.get("gameplay_ready")), "p4 ownership is ready before camera completion")
	_expect(bool(game.get("camera_transition")), "the visual camera transition may still be running")
	var first_turn_tween: Variant = game.get("camera_tween")

	# A repeated copy of the same authoritative v7 must not start a second turn
	# transition or manufacture a second ownership edge.
	_accept_for("p4", p4_room)
	_expect(game.get("camera_tween") == first_turn_tween, "duplicate v7 does not advance p4 twice")
	_expect(int(game.get("current_player_index")) == 3, "duplicate v7 keeps the same authoritative turn")

	# All four client identities converge on the exact same v7/turnIndex=3. Only
	# p4 may become locally actionable; p1-p3 remain blocked before transport.
	for seat: String in ["p1", "p2", "p3"]:
		_accept_for(seat, p4_room)
		_expect(int(online.room.get("version", -1)) == 7, seat + " sees authoritative version 7")
		_expect(int(game.get("current_player_index")) == 3, seat + " sees authoritative player 4 turn")
		_expect(not bool(game.get("gameplay_ready")), seat + " remains blocked out of turn")
		game.call("_play_one_move_for_test")
		_expect(online.submit_count == 0, seat + " cannot submit p4's move")

	_accept_for("p4", p4_room)
	_expect(int(online.room.get("version", -1)) == 7, "p4 converges on authoritative version 7")
	_expect(bool(game.get("gameplay_ready")), "p4 stays actionable on the same authoritative state")
	game.call("_play_one_move_for_test")
	_expect(online.submit_count == 1, "p4 submits exactly one legal move")
	_expect(online.last_cell >= 0 and online.last_cell <= 8, "p4 submission uses a legal board cell")
	_expect(["small", "medium", "large"].has(online.last_size), "p4 submission uses a legal piece size")
	game.call("_play_one_move_for_test")
	_expect(online.submit_count == 1, "p4 cannot manufacture a second move from the same turn")

	# Model the single authoritative acknowledgement after p4's move. Every tab
	# must converge on v8/turnIndex=0, and p4 must become out-of-turn immediately.
	var v8_room: Dictionary = _room_state(
		8,
		0,
		4,
		{
			"4": {"large": "green"},
			"5": {"medium": "marble"},
			"0": {"small": "gold"},
			"8": {"large": "blue"},
		},
		{"cell": 8, "size": "large", "color": "blue", "seat": "p4"}
	)
	for seat: String in ["p1", "p2", "p3", "p4"]:
		_accept_for(seat, v8_room)
		_expect(int(online.room.get("version", -1)) == 8, seat + " converges on authoritative version 8")
		_expect(int(game.get("current_player_index")) == 0, seat + " converges on player 1 after p4")
	_expect(not bool(game.get("gameplay_ready")), "p4 is blocked once authoritative ownership leaves p4")
	game.call("_play_one_move_for_test")
	_expect(online.submit_count == 1, "out-of-turn p4 remains unable to submit")

	await _finish()


func _accept_for(seat: String, room_state: Dictionary) -> void:
	online.identity = {"token": "test-" + seat, "seat": seat, "code": "61"}
	online.room = room_state.duplicate(true)
	game.call("_on_online_room_changed", online.room, online.identity)


func _room_state(version: int, turn_index: int, move_number: int, board: Dictionary, last_move: Dictionary) -> Dictionary:
	return {
		"code": "61",
		"version": version,
		"status": "playing",
		"targetPlayers": 4,
		"targetRounds": 3,
		"winsToMatch": 3,
		"players": [
			{"seat": "p1", "color": "green"},
			{"seat": "p2", "color": "marble"},
			{"seat": "p3", "color": "gold"},
			{"seat": "p4", "color": "blue"},
		],
		"turnIndex": turn_index,
		"board": board.duplicate(true),
		"round": 1,
		"completedRounds": 0,
		"scores": {"p1": 0, "p2": 0, "p3": 0, "p4": 0},
		"winner": {},
		"draw": false,
		"lastMove": last_move.duplicate(true),
		"moveNumber": move_number,
		"matchComplete": false,
		"matchWinner": null,
		"matchWinners": [],
		"rematch": {"p1": false, "p2": false, "p3": false, "p4": false},
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
		print("YAKOLAK_ONLINE_PLAYER4_OWNER_BOUNDARY_OK")
		quit(0)
		return
	for failure: String in failures:
		push_error(failure)
	quit(1)
