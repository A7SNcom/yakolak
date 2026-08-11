extends SceneTree

# TURN-UI-08 narrow regression: the visual indicator must follow only accepted
# authoritative turn/lifecycle events and never camera/process polling.

class FakeOnline:
	extends Node
	var active: bool = true
	var reconnecting: bool = false
	var room: Dictionary = {}
	var identity: Dictionary = {}

	func submit_move(_cell: int, _size_name: String) -> void:
		pass

	func request_rematch() -> void:
		pass

	func deactivate(_clear_location: bool = false) -> void:
		active = false


var failures: Array[String] = []
var intro: Node
var game: Node
var hud: Node
var online: FakeOnline


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	intro = preload("res://scenes/intro.tscn").instantiate()
	root.add_child(intro)
	await process_frame
	game = intro.get_node_or_null("PostIntroGameplay")
	hud = intro.get_node_or_null("TurnClarityHUD")
	_expect(game != null, "authoritative gameplay controller exists")
	_expect(hud != null, "single turn indicator exists")
	if game == null or hud == null:
		await _finish()
		return

	intro.call("_restart_intro")
	intro.call("_snap_final")
	intro.set("playing", false)
	intro.call("_publish_complete")
	for _frame in range(8):
		await process_frame

	online = FakeOnline.new()
	online.name = "TurnIndicatorAuthoritativeTransport"
	intro.add_child(online)
	game.set("online", online)

	# Initial authoritative turn: p4 is this client, p1 owns the room turn.
	_accept(_room_state(1, "playing", 1, 0, false, {}))
	_expect(_indicator_visible(), "initial authoritative turn is visible")
	_expect(_indicator_text() == "دور لاعب 1", "initial remote turn uses player 1")
	_expect(_western_digits_only(_indicator_text()), "initial turn uses Western digits only")
	_expect(_legacy_turn_hidden(), "legacy turn banner stays hidden")
	_expect(_indicator_ignores_pointer(), "indicator cannot steal board touches")
	var initial_revision: int = int(game.get("authoritative_turn_revision"))
	for _frame in range(18):
		await process_frame
	_expect(int(game.get("authoritative_turn_revision")) == initial_revision, "process/camera frames do not update turn state")

	# P3 -> P4 is two authoritative room snapshots; no animation state participates.
	_accept(_room_state(6, "playing", 1, 2, false, {}))
	_expect(_indicator_text() == "دور لاعب 3", "player 3 authoritative turn is shown")
	_accept(_room_state(7, "playing", 1, 3, false, {}))
	_expect(_indicator_text() == "دورك", "p3 to p4 shows local authoritative turn exactly once")
	var p4_revision: int = int(game.get("authoritative_turn_revision"))

	# Reconnect clears the potentially stale turn immediately, and connectivity
	# alone never resurrects it. The accepted room snapshot hydrates it again.
	online.reconnecting = true
	game.call("_on_connection_state_changed", "reconnecting", "turn-ui-test")
	_expect(not _indicator_visible(), "reconnect pre-hydration hides stale turn")
	_expect(_indicator_text().is_empty(), "reconnect clears stale copy")
	online.reconnecting = false
	game.call("_on_connection_state_changed", "connected", "turn-ui-test")
	_expect(not _indicator_visible(), "connected transport alone is not turn authority")
	_accept(_room_state(7, "playing", 1, 3, false, {}))
	_expect(_indicator_visible() and _indicator_text() == "دورك", "accepted reconnect snapshot restores p4 turn")
	var rehydrated_revision: int = int(game.get("authoritative_turn_revision"))
	_expect(rehydrated_revision > p4_revision, "reconnect lifecycle creates a fresh authoritative presentation state")
	_accept(_room_state(7, "playing", 1, 3, false, {}))
	_expect(int(game.get("authoritative_turn_revision")) == rehydrated_revision, "duplicate room snapshot cannot flicker or rewrite turn")

	# Round end has no valid turn; result UI may exist, but the turn indicator must
	# disappear so the two surfaces never compete.
	_accept(_room_state(8, "finished", 1, 3, false, {"seat": "p4", "color": "blue"}))
	_expect(not _indicator_visible(), "round end hides turn indicator")
	_expect(_indicator_text().is_empty(), "round end leaves no stale turn text")
	_expect(_result_visible(), "round result surface owns the round-end state")

	# The next accepted round snapshot is the only thing that may show a new turn.
	_accept(_room_state(9, "playing", 2, 0, false, {}))
	_expect(_indicator_visible(), "next round restores turn indicator")
	_expect(_indicator_text() == "دور لاعب 1", "next round uses the new authoritative starter")
	_expect(_western_digits_only(_indicator_text()), "next round keeps Western digits")

	# Match end again has no valid turn and cannot retain the previous starter.
	_accept(_room_state(10, "finished", 2, 0, true, {"seat": "p1", "color": "green"}))
	_expect(not _indicator_visible(), "match end hides turn indicator")
	_expect(_indicator_text().is_empty(), "match end clears turn copy")

	# Rematch hydration starts clean rather than resurrecting the match-end state.
	_accept(_room_state(11, "playing", 1, 1, false, {}))
	_expect(_indicator_visible(), "rematch accepted snapshot restores one turn indicator")
	_expect(_indicator_text() == "دور لاعب 2", "rematch shows its authoritative starter without stale text")

	await _finish()


func _accept(room_state: Dictionary) -> void:
	online.identity = {"token": "turn-ui-p4", "seat": "p4", "code": "61"}
	online.room = room_state.duplicate(true)
	game.call("_on_online_room_changed", online.room, online.identity)


func _room_state(version: int, status: String, round_number: int, turn_index: int, match_complete: bool, winner: Dictionary) -> Dictionary:
	return {
		"code": "61",
		"version": version,
		"status": status,
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
		"board": {},
		"round": round_number,
		"completedRounds": maxi(round_number - 1, 0),
		"scores": {"p1": 0, "p2": 0, "p3": 0, "p4": 0},
		"winner": winner.duplicate(true),
		"draw": false,
		"lastMove": {},
		"moveNumber": maxi(version - 1, 0),
		"matchComplete": match_complete,
		"matchWinner": winner.get("seat", null) if match_complete else null,
		"matchWinners": [winner.get("seat", "")] if match_complete and not winner.is_empty() else [],
		"rematch": {"p1": false, "p2": false, "p3": false, "p4": false},
	}


func _indicator_visible() -> bool:
	var control: Variant = hud.get("indicator_root")
	return control is Control and (control as Control).visible


func _indicator_text() -> String:
	var label: Variant = hud.get("indicator_label")
	return str((label as Label).text) if label is Label else ""


func _legacy_turn_hidden() -> bool:
	var label: Variant = game.get("turn_label")
	return label is Label and not (label as Label).visible


func _indicator_ignores_pointer() -> bool:
	var control: Variant = hud.get("indicator_root")
	return control is Control and (control as Control).mouse_filter == Control.MOUSE_FILTER_IGNORE


func _result_visible() -> bool:
	var button: Variant = game.get("result_button")
	return button is Button and (button as Button).visible


func _western_digits_only(value: String) -> bool:
	for arabic_digit: String in ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"]:
		if value.contains(arabic_digit):
			return false
	return true


func _expect(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)


func _finish() -> void:
	if intro != null and is_instance_valid(intro):
		intro.queue_free()
		await process_frame
		await process_frame
	if failures.is_empty():
		print("YAKOLAK_AUTHORITATIVE_TURN_INDICATOR_OK")
		quit(0)
		return
	for failure: String in failures:
		push_error(failure)
	quit(1)
