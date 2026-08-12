extends SceneTree

# ONLINE-02 originally protected the p3 -> p4 owner boundary. UX-TURN-33 turns
# that into a general production regression for p1 -> p2 and p3 -> p4: accepted
# authoritative ownership must permit real pointer input even while the visual
# camera tween is intentionally paused forever. The client may never advance a
# turn itself, and the existing exactly-once pending guard must still win.

const INPUT_BOUND_MS: int = 100
const COLORS: Array[String] = ["green", "marble", "gold", "blue"]

class FakeOnline:
	extends Node
	var submit_count: int = 0
	var last_cell: int = -1
	var last_size: String = ""
	var room: Dictionary = {}
	var identity: Dictionary = {}
	var reconnecting: bool = false

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
	await _exercise_transition("p2", 0, 1, 21, "P1->P2")
	await _exercise_transition("p4", 2, 3, 31, "P3->P4")
	if failures.is_empty():
		print("YAKOLAK_UX_TURN_33_INPUT_READINESS_OK")
		quit(0)
		return
	for failure: String in failures:
		push_error(failure)
	quit(1)


func _exercise_transition(target_seat: String, from_index: int, to_index: int, version: int, label: String) -> void:
	await _bootstrap(target_seat)
	if game == null:
		await _teardown()
		return

	var before: Dictionary = _room_state(version, from_index, maxi(0, version - 20))
	var after: Dictionary = _room_state(version + 1, to_index, maxi(1, version - 19))

	_accept(before, target_seat)
	_expect(int(game.get("current_player_index")) == from_index, label + " begins on the authoritative previous owner")
	_expect(not bool(game.call("_authoritative_online_pointer_ready")), label + " target seat cannot act before ownership")
	_expect(not bool(game.get("gameplay_ready")), label + " target seat remains blocked out of turn")
	var revision_before: int = int(game.get("authoritative_turn_revision"))

	_accept(after, target_seat)
	var revision_after: int = int(game.get("authoritative_turn_revision"))
	_expect(revision_after == revision_before + 1, label + " publishes exactly one authoritative turn advance")
	_expect(int(game.get("current_player_index")) == to_index, label + " applies the authoritative next owner")
	_expect(str(game.call("_current_mode")) == "local", label + " accepted seat ownership becomes the one local mover")
	var snapshot: Dictionary = game.call("authoritative_turn_snapshot") as Dictionary
	_expect(bool(snapshot.get("valid", false)), label + " authoritative snapshot is valid")
	_expect(bool(snapshot.get("local_turn", false)), label + " authoritative snapshot marks only this seat local")
	_expect(str(snapshot.get("seat", "")) == target_seat, label + " snapshot owner matches the accepted identity")
	_expect(bool(game.call("_authoritative_online_pointer_ready")), label + " input is ready from authority before visuals finish")
	_expect(bool(game.get("camera_transition")), label + " camera presentation is still transitioning")
	_expect(bool(game.get("turn_camera_active")), label + " turn-camera tween is genuinely active")

	var first_turn_tween: Tween = game.get("camera_tween") as Tween
	_expect(first_turn_tween != null and first_turn_tween.is_valid(), label + " has a live visual tween to stall")
	if first_turn_tween != null and first_turn_tween.is_valid():
		first_turn_tween.pause()

	# Re-delivering the same accepted room state cannot manufacture another turn
	# edge or another camera transition.
	_accept(after, target_seat)
	_expect(int(game.get("authoritative_turn_revision")) == revision_after, label + " duplicate room does not advance authority twice")
	_expect(game.get("camera_tween") == first_turn_tween, label + " duplicate room does not start a second turn tween")

	var dispatch_before: int = int(game.get("authoritative_input_dispatch_count"))
	var visual_before: int = int(game.get("authoritative_input_visual_motion_count"))
	var started_msec: int = Time.get_ticks_msec()
	_press_current_piece(label)
	var first_input_msec: int = int(game.get("authoritative_input_last_dispatch_msec"))
	var elapsed_msec: int = first_input_msec - started_msec
	_expect(first_input_msec >= started_msec, label + " records the first legal pointer dispatch")
	_expect(elapsed_msec >= 0 and elapsed_msec <= INPUT_BOUND_MS, label + " first legal input is bounded to %dms" % INPUT_BOUND_MS)
	_expect(int(game.get("selected_index")) >= 0, label + " real pointer input selects a legal current-owner piece")
	_expect(int(game.get("authoritative_input_dispatch_count")) == dispatch_before + 1, label + " dispatches the first pointer exactly once")
	_expect(int(game.get("authoritative_input_visual_motion_count")) == visual_before + 1, label + " accepts input while presentation motion is unfinished")
	_expect(bool(game.get("camera_transition")) and bool(game.get("turn_camera_active")), label + " input does not falsify or finish visual motion")

	var selected_size: String = str(game.call("_selected_size"))
	var first_cell: int = int(game.call("_first_legal_cell_for_size", selected_size))
	_expect(first_cell >= 0, label + " selected piece has a legal target")
	if first_cell >= 0:
		_press_cell(first_cell, label)
	_expect(online.submit_count == 1, label + " submits exactly one legal move while the camera tween is stalled")
	_expect(bool(game.get("online_move_commit_pending")), label + " exactly-once pending guard arms after the first submit")
	_expect(int(game.get("current_player_index")) == to_index, label + " client input cannot advance authoritative turnIndex")
	_expect(int(game.get("authoritative_turn_revision")) == revision_after, label + " client input cannot invent an authoritative revision")

	var second_cell: int = _second_legal_cell(selected_size, first_cell)
	_expect(second_cell >= 0, label + " has a second legal target for duplicate-input proof")
	if second_cell >= 0:
		_press_cell(second_cell, label)
	_expect(online.submit_count == 1, label + " duplicate input while move is pending cannot submit twice")
	_expect(int(game.get("current_player_index")) == to_index, label + " duplicate input cannot repeat the turn transition")
	_expect(bool(game.get("camera_transition")) and bool(game.get("turn_camera_active")), label + " visual tween remains independently stalled after input")

	await _teardown()


func _bootstrap(target_seat: String) -> void:
	intro = preload("res://scenes/intro.tscn").instantiate()
	root.add_child(intro)
	await process_frame
	game = intro.get_node_or_null("PostIntroGameplay")
	_expect(game != null, target_seat + " production gameplay controller exists")
	if game == null:
		return

	intro.call("_restart_intro")
	intro.call("_snap_final")
	intro.set("playing", false)
	intro.call("_publish_complete")
	for _frame in range(6):
		await process_frame
	_expect(bool(game.get("waiting_for_setup")), target_seat + " explicit handoff initializes gameplay")

	online = FakeOnline.new()
	online.name = "UXTurn33Transport_" + target_seat
	intro.add_child(online)
	game.set("online", online)


func _accept(room_state: Dictionary, seat: String) -> void:
	online.identity = {"token": "ux33-" + seat, "seat": seat, "code": str(room_state.get("code", "33"))}
	online.room = room_state.duplicate(true)
	game.call("_on_online_room_changed", online.room, online.identity)


func _press_current_piece(label: String) -> void:
	var records: Array = game.get("piece_records") as Array
	var direction: String = str(game.call("_current_direction"))
	var piece_index: int = -1
	for index: int in range(records.size()):
		var record: Dictionary = records[index] as Dictionary
		if bool(record.get("played", false)):
			continue
		if str(record.get("dir", "")) == direction and str(record.get("type", "")) == "large":
			piece_index = index
			break
	_expect(piece_index >= 0, label + " finds a legal current-owner large piece")
	if piece_index < 0:
		return
	var record: Dictionary = records[piece_index] as Dictionary
	var mesh: MeshInstance3D = record.get("mesh") as MeshInstance3D
	var camera: Camera3D = game.get("camera") as Camera3D
	_expect(mesh != null and camera != null, label + " has live piece mesh and camera")
	if mesh == null or camera == null:
		return
	var screen: Vector2 = camera.unproject_position(mesh.to_global(Vector3(17.0, 0.0, 9.5)))
	var viewport_size: Vector2 = game.get_viewport().get_visible_rect().size
	_expect(screen.x >= 0.0 and screen.x <= viewport_size.x and screen.y >= 0.0 and screen.y <= viewport_size.y, label + " first legal piece remains inside current board framing")
	_press(screen)


func _press_cell(cell: int, label: String) -> void:
	var target: Node3D = intro.get_node_or_null("BoardTarget_%d" % cell) as Node3D
	var camera: Camera3D = game.get("camera") as Camera3D
	_expect(target != null and camera != null, label + " has live legal target and camera")
	if target == null or camera == null:
		return
	var screen: Vector2 = camera.unproject_position(target.global_position)
	_press(screen)


func _press(position: Vector2) -> void:
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = true
	event.position = position
	game.call("_input", event)


func _second_legal_cell(size_name: String, excluded: int) -> int:
	for cell: int in range(9):
		if cell == excluded:
			continue
		if bool(game.call("_is_legal_cell", cell, size_name)):
			return cell
	return -1


func _room_state(version: int, turn_index: int, move_number: int) -> Dictionary:
	var board: Dictionary = {}
	for cell: int in range(9):
		board[str(cell)] = {}
	var players: Array[Dictionary] = [
		{"seat": "p1", "color": COLORS[0]},
		{"seat": "p2", "color": COLORS[1]},
		{"seat": "p3", "color": COLORS[2]},
		{"seat": "p4", "color": COLORS[3]},
	]
	var previous_index: int = (turn_index + players.size() - 1) % players.size()
	var last_move: Dictionary = {}
	if move_number > 0:
		last_move = {
			"cell": previous_index,
			"size": "small",
			"color": str(players[previous_index].get("color", "")),
			"seat": str(players[previous_index].get("seat", "")),
		}
	return {
		"code": "33",
		"version": version,
		"status": "playing",
		"targetPlayers": 4,
		"targetRounds": 3,
		"winsToMatch": 3,
		"players": players,
		"turnIndex": turn_index,
		"board": board,
		"round": 1,
		"completedRounds": 0,
		"scores": {"p1": 0, "p2": 0, "p3": 0, "p4": 0},
		"winner": {},
		"draw": false,
		"lastMove": last_move,
		"moveNumber": move_number,
		"matchComplete": false,
		"matchWinner": null,
		"matchWinners": [],
		"rematch": {"p1": false, "p2": false, "p3": false, "p4": false},
	}


func _teardown() -> void:
	if intro != null and is_instance_valid(intro):
		intro.queue_free()
		await process_frame
		await process_frame
	intro = null
	game = null
	online = null


func _expect(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)