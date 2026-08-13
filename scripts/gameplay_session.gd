extends "res://scripts/gameplay.gd"

# Match controller used by local players, bots, and the online transport.  The
# board/piece interaction remains in gameplay.gd; this file owns turns, rules,
# rounds, camera, and the minimal HUD.

const WIN_LINES: Array = [
	[0, 1, 2], [3, 4, 5], [6, 7, 8],
	[0, 3, 6], [1, 4, 7], [2, 5, 8],
	[0, 4, 8], [2, 4, 6],
]
const SIZE_ORDER: Array[String] = ["small", "medium", "large"]
const DIRECTION_VECTORS: Dictionary = {
	"right": Vector3(1.0, 0.0, 0.0),
	"back": Vector3(0.0, 0.0, -1.0),
	"left": Vector3(-1.0, 0.0, 0.0),
	"front": Vector3(0.0, 0.0, 1.0),
}
const COLOR_TO_DIRECTION: Dictionary = {
	"marble": "right",
	"blue": "back",
	"gold": "left",
	"green": "front",
}
const COLOR_NAMES: Dictionary = {
	"marble": "أبيض",
	"blue": "أزرق",
	"gold": "ذهبي",
	"green": "أخضر",
}
const ARABIC_FONT = preload("res://assets/fonts/DejaVuSans.ttf")
const BOT_ROUND_SKILL: Array[float] = [0.94, 0.56, 0.86, 0.68, 0.78]
const BOT_DIRECTION_POWER: Dictionary = {
	"right": 0.74,
	"back": 0.88,
	"left": 0.66,
	"front": 0.80,
}
const CAMERA_TRANSITION: float = 0.48
const ROUND_RESET_DURATION: float = 0.56
const TRAY_OPEN_DURATION: float = 0.28
const TRAY_LIFT_STEP: float = 19.0

var setup: Node
var online: Node
var players: Array[Dictionary] = []
var scores: Dictionary = {}
var match_initialized: bool = false
var waiting_for_setup: bool = false
var current_player_index: int = 0
var round_starter_index: int = 0
var round_number: int = 1
var total_rounds: int = 3
var turn_deadline_msec: int = 0
var round_complete: bool = false
var match_complete: bool = false
var round_winner: String = ""
var winning_piece_indices: Array[int] = []
var action_in_progress: bool = false
var tutorial_active: bool = false
var tutorial_complete: bool = false
var bot_due_msec: int = 0
var bot_scheduled: bool = false
var camera_transition: bool = false
var camera_tween: Tween
var home_transforms: Array[Transform3D] = []
var home_materials: Array[Material] = []
var online_active: bool = false
var online_waiting: bool = false
var online_identity: Dictionary = {}
var online_turn_key: String = ""
var online_last_move_number: int = -1
var online_target_players: int = 0
var pending_online_configuration: Dictionary = {}
var restoring_online: bool = false
var online_cancelled: bool = false
var tray_open: bool = false
var tray_side: int = 0
var tray_indices: Array[int] = []
var tray_tween: Tween
var intro_runtime_suspended: bool = false

var hud_layer: CanvasLayer
var turn_label: Label
var score_label: Label
var result_button: Button
var turn_style: StyleBoxFlat
var hud_canvas_scale: float = 1.0


func _ready() -> void:
	super._ready()
	_build_hud()
	call_deferred("_connect_setup")


func _connect_setup() -> void:
	setup = intro.get_node_or_null("SessionSetup")
	if setup != null and not setup.is_connected("configuration_ready", Callable(self, "_on_configuration_ready")):
		setup.connect("configuration_ready", Callable(self, "_on_configuration_ready"))
	online = intro.get_node_or_null("OnlineSession")
	if online != null and not online.is_connected("room_state_changed", Callable(self, "_on_online_room_changed")):
		online.connect("room_state_changed", Callable(self, "_on_online_room_changed"))
		online.connect("online_error", Callable(self, "_on_online_error"))


func _process(delta: float) -> void:
	super._process(delta)
	if not match_initialized:
		return
	if camera_transition or round_complete or move_active:
		return

	if _current_mode() == "bot":
		var now: int = Time.get_ticks_msec()
		if not bot_scheduled:
			bot_scheduled = true
			bot_due_msec = now + 540
			# Keep human input locked while the bot thinks, but do not gate its
			# own timer on gameplay_ready.
			gameplay_ready = false
			_publish_match_state("bot-thinking")
		elif now >= bot_due_msec:
			_perform_bot_move()
		return

func _input(event: InputEvent) -> void:
	if not match_initialized:
		return
	var pointer_press: bool = false
	var pointer_position: Vector2 = Vector2.ZERO
	if event is InputEventScreenTouch:
		var touch_event := event as InputEventScreenTouch
		pointer_press = touch_event.pressed
		pointer_position = touch_event.position
	elif event is InputEventMouseButton:
		var mouse_event := event as InputEventMouseButton
		pointer_press = mouse_event.pressed and mouse_event.button_index == MOUSE_BUTTON_LEFT
		pointer_position = mouse_event.position
	if round_complete:
		# _input runs before Control GUI input.  Let the visible round-action
		# button receive taps inside its rect; consume only taps outside it so
		# Intro's replay hook cannot restart the animation behind the result.
		if pointer_press and result_button != null and result_button.visible and result_button.get_global_rect().has_point(pointer_position):
			return
		if pointer_press:
			get_viewport().set_input_as_handled()
		return
	if _current_mode() != "local" or not gameplay_ready or move_active or camera_transition:
		# Web touch input can be followed by a synthetic mouse event.  Once a
		# match owns input, consume that duplicate too; otherwise Intro's
		# unhandled-input replay hook restarts the animation mid-move.
		if pointer_press:
			get_viewport().set_input_as_handled()
		return
	super._input(event)


func _enable_gameplay() -> void:
	# This session layer can be called directly by tests/legacy subclasses, so it
	# must claim the same explicit generation token as the top production layer.
	if not _begin_intro_handoff_application():
		return
	# Keep the board inert until the user has answered the short setup.
	move_active = false
	gameplay_ready = false
	_hide_markers()
	_capture_home_state()
	_publish_gameplay_state("setup")
	# The token is already consumed at this point. Stop correction workers only
	# after explicit ownership transfer; visual clock flags are not consulted.
	call_deferred("_suspend_intro_runtime")
	if setup == null or online == null:
		_connect_setup()
	if online != null and bool(online.call("restore_from_location")):
		waiting_for_setup = false
		restoring_online = true
		online_active = true
		online_waiting = true
		turn_label.text = "استعادة الغرفة…"
		score_label.text = ""
		_end_intro_handoff_application()
		return
	waiting_for_setup = true
	if setup != null:
		setup.call("show_after_intro")
	_end_intro_handoff_application()


func _reset_for_intro() -> void:
	_resume_intro_runtime()
	_reset_tray_state()
	super._reset_for_intro()
	match_initialized = false
	waiting_for_setup = false
	players.clear()
	scores.clear()
	current_player_index = 0
	round_starter_index = 0
	round_number = 1
	total_rounds = 3
	turn_deadline_msec = 0
	round_complete = false
	match_complete = false
	round_winner = ""
	winning_piece_indices.clear()
	action_in_progress = false
	tutorial_active = false
	tutorial_complete = false
	bot_scheduled = false
	bot_due_msec = 0
	camera_transition = false
	home_transforms.clear()
	home_materials.clear()
	online_active = false
	online_waiting = false
	online_identity.clear()
	online_turn_key = ""
	online_last_move_number = -1
	online_target_players = 0
	pending_online_configuration.clear()
	restoring_online = false
	online_cancelled = false
	if camera_tween != null and camera_tween.is_valid():
		camera_tween.kill()
	if result_button != null:
		result_button.visible = false
	if setup != null:
		setup.call("reset_for_intro")
	_update_hud()


func _suspend_intro_runtime() -> void:
	# Intro runtime may be suspended only after the explicit current-generation
	# handoff token was consumed. `intro.playing` is a visual clock, not authority.
	if not _intro_handoff_ready():
		return
	var viewport: Viewport = get_viewport()
	var intro_fit := Callable(intro, "_fit_camera")
	if viewport.size_changed.is_connected(intro_fit):
		viewport.size_changed.disconnect(intro_fit)
	var corrections: Node = intro.get_node_or_null("ExistingIntroCorrections")
	if corrections != null:
		var correction_fit := Callable(corrections, "_center_camera")
		if viewport.size_changed.is_connected(correction_fit):
			viewport.size_changed.disconnect(correction_fit)
		corrections.set_process(false)
	var smooth: Node = intro.get_node_or_null("SmoothIntroTimeline")
	if smooth != null:
		smooth.set_process(false)
	intro_runtime_suspended = true


func _resume_intro_runtime() -> void:
	if not intro_runtime_suspended or intro == null:
		return
	var viewport: Viewport = get_viewport()
	var intro_fit := Callable(intro, "_fit_camera")
	if not viewport.size_changed.is_connected(intro_fit):
		viewport.size_changed.connect(intro_fit)
	var corrections: Node = intro.get_node_or_null("ExistingIntroCorrections")
	if corrections != null:
		var correction_fit := Callable(corrections, "_center_camera")
		if not viewport.size_changed.is_connected(correction_fit):
			viewport.size_changed.connect(correction_fit)
		corrections.set_process(true)
	var smooth: Node = intro.get_node_or_null("SmoothIntroTimeline")
	if smooth != null:
		smooth.set_process(true)
	intro_runtime_suspended = false


func _on_configuration_ready(configuration: Dictionary) -> void:
	if not waiting_for_setup:
		return
	waiting_for_setup = false
	var join_code: String = str(configuration.get("online_join_code", ""))
	if not join_code.is_empty():
		_start_online_join(configuration, join_code)
		return
	if _has_online_mode(configuration) and not _should_host_online(configuration):
		waiting_for_setup = true
		if setup != null:
			setup.call("show_setup_error", "للدعوة: أنا محلي وبقية اللاعبين دعوة أونلاين.")
		return
	if _should_host_online(configuration):
		_start_online_host(configuration)
		return
	online_active = false
	online_waiting = false
	players.clear()
	var configured_players: Array = configuration.get("players", []) as Array
	for player_value: Variant in configured_players:
		players.append((player_value as Dictionary).duplicate(true))
	total_rounds = int(configuration.get("rounds", 3))
	tutorial_active = bool(configuration.get("tutorial", false))
	tutorial_complete = not tutorial_active
	if players.is_empty():
		return

	match_initialized = true
	round_number = 1
	round_starter_index = 0
	current_player_index = 0
	round_complete = false
	match_complete = false
	round_winner = ""
	scores.clear()
	for player: Dictionary in players:
		scores[str(player["direction"])] = 0
	_sync_active_sides()
	if result_button != null:
		result_button.visible = false
	_start_turn()
	_publish_match_state("ready")
	print("YAKOLAK_MATCH_READY players=%d rounds=%d" % [players.size(), total_rounds])


func _should_host_online(configuration: Dictionary) -> bool:
	var configured_players: Array = configuration.get("players", []) as Array
	if configured_players.size() < 2:
		return false
	var host: Dictionary = configured_players[0] as Dictionary
	if str(host.get("mode", "local")) != "local":
		return false
	for index: int in range(1, configured_players.size()):
		var player: Dictionary = configured_players[index] as Dictionary
		if str(player.get("mode", "local")) != "online":
			return false
	return true


func _has_online_mode(configuration: Dictionary) -> bool:
	var configured_players: Array = configuration.get("players", []) as Array
	for player_value: Variant in configured_players:
		var player: Dictionary = player_value as Dictionary
		if str(player.get("mode", "local")) == "online":
			return true
	return false


func _start_online_host(configuration: Dictionary) -> void:
	if online == null:
		_connect_setup()
	if online == null:
		_on_online_error("online_unavailable")
		return
	online_active = true
	online_waiting = true
	pending_online_configuration = configuration.duplicate(true)
	turn_label.text = "تجهيز غرفة أونلاين…"
	score_label.text = ""
	online.call("host_match", configuration)


func _start_online_join(configuration: Dictionary, code: String) -> void:
	if online == null:
		_connect_setup()
	if online == null:
		_on_online_error("online_unavailable")
		return
	var configured_players: Array = configuration.get("players", []) as Array
	if configured_players.is_empty():
		_on_online_error("invalid_player_count")
		return
	var player: Dictionary = configured_players[0] as Dictionary
	online_active = true
	online_waiting = true
	pending_online_configuration = configuration.duplicate(true)
	turn_label.text = "دخول الغرفة…"
	score_label.text = ""
	online.call("join_match", code, str(player.get("color", "")))


func _on_online_error(code: String) -> void:
	if tray_open:
		_close_piece_tray(-1, true)
	elif selected_index >= 0:
		super._clear_selection()
	online_active = false
	online_waiting = false
	match_initialized = false
	gameplay_ready = false
	waiting_for_setup = true
	turn_deadline_msec = 0
	if turn_label != null:
		turn_label.text = ""
	if score_label != null:
		score_label.text = ""
	if restoring_online:
		restoring_online = false
		pending_online_configuration.clear()
		if online != null:
			online.call("deactivate", true)
		if setup != null:
			setup.call("reset_for_intro")
			setup.call_deferred("show_after_intro")
		return
	if not str(pending_online_configuration.get("online_join_code", "")).is_empty() and setup != null:
		setup.call("show_online_error", code)
	elif setup != null:
		setup.call("show_setup_error", "تعذر الأونلاين. حاول مرة أخرى.")
	pending_online_configuration.clear()


func _on_online_room_changed(remote: Dictionary, identity: Dictionary) -> void:
	if remote.is_empty():
		return
	restoring_online = false
	online_active = true
	online_identity = identity.duplicate(true)
	_apply_online_room(remote)


func _apply_online_room(remote: Dictionary) -> void:
	var remote_players: Array = remote.get("players", []) as Array
	if remote_players.is_empty():
		return
	if home_transforms.size() != piece_records.size():
		_capture_home_state()
	players.clear()
	scores.clear()
	for index: int in range(remote_players.size()):
		var remote_player: Dictionary = remote_players[index] as Dictionary
		var color: String = str(remote_player.get("color", ""))
		var direction: String = str(COLOR_TO_DIRECTION.get(color, "right"))
		var seat: String = str(remote_player.get("seat", ""))
		players.append({
			"seat": seat,
			"label": "أنا" if seat == str(online_identity.get("seat", "")) else "لاعب %d" % (index + 1),
			"mode": "local" if seat == str(online_identity.get("seat", "")) else "online",
			"color": color,
			"color_name": str(COLOR_NAMES.get(color, color)),
			"direction": direction,
		})
		var remote_scores: Dictionary = remote.get("scores", {}) as Dictionary
		scores[direction] = int(remote_scores.get(seat, 0))
	_sync_active_sides()

	match_initialized = true
	total_rounds = int(remote.get("targetRounds", 3))
	online_target_players = int(remote.get("targetPlayers", remote_players.size()))
	round_number = int(remote.get("round", 1))
	current_player_index = clampi(int(remote.get("turnIndex", 0)), 0, players.size() - 1)
	_apply_online_board(remote.get("board", {}) as Dictionary)

	var status: String = str(remote.get("status", "waiting"))
	if status == "waiting":
		online_cancelled = false
		online_waiting = true
		round_complete = false
		match_complete = false
		gameplay_ready = false
		turn_deadline_msec = 0
		_update_hud()
		_publish_match_state("online-waiting")
		return
	if status == "cancelled":
		online_waiting = false
		online_cancelled = true
		round_complete = true
		gameplay_ready = false
		turn_deadline_msec = 0
		if result_button != null:
			result_button.text = "انتهت الغرفة\nعودة للإعداد"
			result_button.visible = true
		_update_hud()
		return
	if status == "finished":
		online_waiting = false
		online_cancelled = false
		round_complete = true
		gameplay_ready = false
		turn_deadline_msec = 0
		match_complete = bool(remote.get("matchComplete", false))
		var winner_data: Dictionary = remote.get("winner", {}) as Dictionary
		round_winner = str(COLOR_TO_DIRECTION.get(str(winner_data.get("color", "")), ""))
		_update_hud()
		_show_round_result()
		_publish_match_state("match-complete" if match_complete else "round-complete")
		return

	online_waiting = false
	online_cancelled = false
	round_complete = false
	match_complete = false
	round_winner = ""
	if result_button != null:
		result_button.visible = false
	var turn_key: String = "%s:%d:%d" % [status, round_number, current_player_index]
	if turn_key != online_turn_key:
		online_turn_key = turn_key
		_transition_to_current_player()
	else:
		gameplay_ready = _current_mode() == "local"
		turn_deadline_msec = 0
		_update_hud()
		_publish_match_state("turn")


func _apply_online_board(board: Dictionary) -> void:
	_reset_tray_state()
	occupied_slots.clear()
	move_count = 0
	selected_index = -1
	selected_original_material = null
	_hide_markers()
	for index: int in range(piece_records.size()):
		var record: Dictionary = piece_records[index] as Dictionary
		record["played"] = false
		piece_records[index] = record
		var piece: MeshInstance3D = record["mesh"] as MeshInstance3D
		if index < home_transforms.size():
			piece.transform = home_transforms[index]
		if index < home_materials.size():
			piece.material_override = home_materials[index]
	for cell: int in range(CELL_COORDS.size()):
		var slots: Dictionary = board.get(str(cell), {}) as Dictionary
		for size_name: String in SIZE_ORDER:
			var color: String = str(slots.get(size_name, ""))
			if color.is_empty():
				continue
			var direction: String = str(COLOR_TO_DIRECTION.get(color, ""))
			if direction.is_empty():
				continue
			var piece_index: int = _find_unplayed_piece(direction, size_name)
			if piece_index < 0:
				continue
			var record: Dictionary = piece_records[piece_index] as Dictionary
			record["played"] = true
			piece_records[piece_index] = record
			var piece: MeshInstance3D = record["mesh"] as MeshInstance3D
			piece.position = CELL_COORDS[cell] * U
			piece.scale = Vector3.ONE * U
			occupied_slots[_slot_key(cell, size_name)] = piece_index
			move_count += 1


func _sync_active_sides() -> void:
	var active: Dictionary = {}
	for player: Dictionary in players:
		active[str(player.get("direction", ""))] = true
	for index: int in range(piece_records.size()):
		var record: Dictionary = piece_records[index] as Dictionary
		var direction: String = str(record.get("dir", ""))
		var enabled: bool = active.has(direction)
		var piece: MeshInstance3D = record["mesh"] as MeshInstance3D
		piece.visible = enabled
		for child: Node in piece.get_children():
			if child is StaticBody3D and child.has_meta("piece_index"):
				(child as StaticBody3D).collision_layer = PIECE_LAYER if enabled else 0
	for direction: String in COLOR_TO_DIRECTION.values():
		var base: Node3D = intro.get_node_or_null("Base_%s" % direction) as Node3D
		if base != null:
			base.visible = active.has(direction)


func _find_unplayed_piece(direction: String, size_name: String) -> int:
	for index: int in range(piece_records.size()):
		var record: Dictionary = piece_records[index] as Dictionary
		if not bool(record.get("played", false)) and str(record.get("dir", "")) == direction and str(record.get("type", "")) == size_name:
			return index
	return -1


func _begin_move(cell: int) -> void:
	if tray_open:
		_close_piece_tray(selected_index, false)
	if online_active:
		if selected_index < 0 or online == null:
			return
		gameplay_ready = false
		_hide_markers()
		online.call("submit_move", cell, _selected_size())
		_publish_match_state("online-submitting")
		return
	super._begin_move(cell)


func _select_piece(piece_index: int) -> void:
	# Bots already know the exact piece they chose.  Human players tap one of
	# three nested physical stacks, so fan that stack open before placement.
	if _current_mode() == "bot" or home_transforms.size() != piece_records.size():
		super._select_piece(piece_index)
		return
	_open_piece_tray(piece_index)


func _open_piece_tray(piece_index: int) -> void:
	if piece_index < 0 or piece_index >= piece_records.size():
		return
	var tapped: Dictionary = piece_records[piece_index] as Dictionary
	var direction: String = str(tapped.get("dir", ""))
	var side: int = int(tapped.get("side", 0))
	var available: Array[int] = []
	for size_name: String in ["large", "medium", "small"]:
		for index: int in range(piece_records.size()):
			var record: Dictionary = piece_records[index] as Dictionary
			if bool(record.get("played", false)):
				continue
			if str(record.get("dir", "")) == direction and int(record.get("side", 0)) == side and str(record.get("type", "")) == size_name:
				available.append(index)
				break
	if available.is_empty():
		return
	if tray_open:
		_close_piece_tray(-1, true)
	tray_open = true
	tray_side = side
	tray_indices = available
	if tray_tween != null and tray_tween.is_valid():
		tray_tween.kill()
	tray_tween = create_tween()
	tray_tween.set_parallel(true)
	for order: int in range(tray_indices.size()):
		var index: int = tray_indices[order]
		var record: Dictionary = piece_records[index] as Dictionary
		var piece: MeshInstance3D = record["mesh"] as MeshInstance3D
		piece.material_override = home_materials[index]
		var target: Vector3 = home_transforms[index].origin + Vector3.UP * (float(order) * TRAY_LIFT_STEP * U)
		tray_tween.tween_property(piece, "position", target, TRAY_OPEN_DURATION).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	_select_tray_piece(tray_indices[0])
	_publish_tray_state("open")


func _select_tray_piece(piece_index: int) -> void:
	if not tray_open or not tray_indices.has(piece_index):
		return
	for index: int in tray_indices:
		var tray_record: Dictionary = piece_records[index] as Dictionary
		var tray_piece: MeshInstance3D = tray_record["mesh"] as MeshInstance3D
		tray_piece.material_override = home_materials[index]
	selected_index = piece_index
	var record: Dictionary = piece_records[selected_index] as Dictionary
	var mesh_instance: MeshInstance3D = record["mesh"] as MeshInstance3D
	selected_home_position = home_transforms[selected_index].origin
	selected_original_material = home_materials[selected_index]
	mesh_instance.material_override = _selection_material(selected_original_material)
	_update_legal_markers(str(record["type"]), _piece_color(record))
	_publish_selection(record)


func _close_piece_tray(skip_index: int = -1, immediate: bool = false) -> void:
	if not tray_open:
		return
	var closing: Array[int] = tray_indices.duplicate()
	tray_open = false
	tray_indices.clear()
	if tray_tween != null and tray_tween.is_valid():
		tray_tween.kill()
	tray_tween = null
	var close_tween: Tween
	if not immediate:
		close_tween = create_tween()
		close_tween.set_parallel(true)
		tray_tween = close_tween
	for index: int in closing:
		if index == skip_index:
			continue
		var record: Dictionary = piece_records[index] as Dictionary
		var piece: MeshInstance3D = record["mesh"] as MeshInstance3D
		piece.material_override = home_materials[index]
		if bool(record.get("played", false)):
			continue
		if immediate:
			piece.position = home_transforms[index].origin
		else:
			close_tween.tween_property(piece, "position", home_transforms[index].origin, TRAY_OPEN_DURATION).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	if skip_index < 0:
		selected_index = -1
		selected_original_material = null
		_hide_markers()
		_publish_gameplay_state("ready")
	_publish_tray_state("closed")


func _reset_tray_state() -> void:
	if tray_tween != null and tray_tween.is_valid():
		tray_tween.kill()
	tray_tween = null
	tray_open = false
	tray_side = 0
	tray_indices.clear()
	_publish_tray_state("closed")


func _clear_selection() -> void:
	if tray_open:
		_close_piece_tray(-1, false)
		return
	super._clear_selection()


func _publish_tray_state(state: String) -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakTray='" + state + "';", true)


func _handle_pointer(screen_position: Vector2) -> void:
	# Raised tray pieces win the tap before board targets behind them, otherwise
	# changing size can accidentally place the previously selected stone.
	if tray_open:
		var tray_hit: Dictionary = _ray_pick(screen_position, PIECE_LAYER)
		if not tray_hit.is_empty():
			var tray_collider: Object = tray_hit["collider"] as Object
			if tray_collider != null and tray_collider.has_meta("piece_index"):
				var tray_piece_index: int = int(tray_collider.get_meta("piece_index"))
				if tray_indices.has(tray_piece_index):
					_select_tray_piece(tray_piece_index)
					return
	if selected_index >= 0:
		var target_hit: Dictionary = _ray_pick(screen_position, TARGET_LAYER)
		if not target_hit.is_empty():
			var target_collider: Object = target_hit["collider"] as Object
			if target_collider != null and target_collider.has_meta("cell"):
				var cell: int = int(target_collider.get_meta("cell"))
				if _is_legal_cell(cell, _selected_size()):
					_begin_move(cell)
				else:
					_publish_invalid(cell)
				return

	var piece_hit: Dictionary = _ray_pick(screen_position, PIECE_LAYER)
	if not piece_hit.is_empty():
		var piece_collider: Object = piece_hit["collider"] as Object
		if piece_collider != null and piece_collider.has_meta("piece_index"):
			var piece_index: int = int(piece_collider.get_meta("piece_index"))
			var record: Dictionary = piece_records[piece_index] as Dictionary
			if bool(record.get("played", false)):
				return
			if str(record["dir"]) != _current_direction():
				_flash_result("هذا الحجر ليس للدور الحالي")
				_publish_match_state("wrong-owner")
				return
			if not _has_legal_cell_for_size(str(record["type"])):
				_flash_result("لا توجد خانة لهذا الحجم")
				_publish_match_state("no-legal-cell")
				return
			if tray_open and tray_indices.has(piece_index):
				_select_tray_piece(piece_index)
			else:
				_open_piece_tray(piece_index)
			return

	if selected_index >= 0:
		_clear_selection()


func _update_move() -> void:
	var was_active: bool = move_active
	var previous_moves: int = move_count
	super._update_move()
	if not was_active or move_active or move_count == previous_moves:
		return

	if tutorial_active and not tutorial_complete and _current_mode() == "local":
		tutorial_complete = true
	_update_hud()
	gameplay_ready = false
	var winning: Array[int] = _find_winning_pieces(_current_direction())
	if not winning.is_empty():
		_finish_round(_current_direction(), winning)
		return
	_advance_turn_or_draw()


func _start_turn() -> void:
	if round_complete or players.is_empty():
		return
	bot_scheduled = false
	bot_due_msec = 0
	gameplay_ready = false
	turn_deadline_msec = 0
	_clear_selection()
	_update_hud()
	_transition_to_current_player()


func _transition_to_current_player() -> void:
	# Keep a human's viewpoint stable while a bot/remote player acts.  Shared
	# device humans still get their own physical side when their turn begins.
	if camera == null or _current_mode() != "local":
		_finish_camera_transition()
		return
	var direction: String = _current_direction()
	var axis: Vector3 = DIRECTION_VECTORS.get(direction, Vector3(1.0, 0.0, 0.0)) as Vector3
	var target_position: Vector3 = axis * 18.5 + Vector3(0.0, 15.5, 0.0)
	var look_target: Vector3 = axis * 2.35 + Vector3(0.0, 0.36, 0.0)
	var target_transform := Transform3D(Basis.IDENTITY, target_position).looking_at(look_target, Vector3.UP)
	camera_transition = true
	if camera_tween != null and camera_tween.is_valid():
		camera_tween.kill()
	camera_tween = create_tween()
	camera_tween.set_parallel(true)
	camera_tween.tween_property(camera, "position", target_position, CAMERA_TRANSITION).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	camera_tween.tween_property(camera, "quaternion", target_transform.basis.get_rotation_quaternion(), CAMERA_TRANSITION).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	camera_tween.tween_property(camera, "fov", 50.0, CAMERA_TRANSITION).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	camera_tween.finished.connect(_finish_camera_transition)
	_publish_match_state("camera-transition")


func _finish_camera_transition() -> void:
	camera_transition = false
	if not match_initialized or round_complete:
		return
	if online_active:
		gameplay_ready = _current_mode() == "local"
		turn_deadline_msec = 0
		_update_hud()
		_publish_gameplay_state("ready" if gameplay_ready else "waiting")
		return
	gameplay_ready = _current_mode() == "local"
	# Local, bot, and online use the same untimed rules.  The old 18-second
	# local-only timeout made identical moves behave differently by mode.
	turn_deadline_msec = 0
	_update_hud()
	_publish_gameplay_state("ready" if gameplay_ready else "waiting")
	_publish_match_state("turn")
	_publish_test_targets.call_deferred()


func _advance_turn_or_draw() -> void:
	for offset: int in range(1, players.size() + 1):
		var candidate: int = (current_player_index + offset) % players.size()
		if _player_has_legal_move(_direction_for_player(candidate)):
			current_player_index = candidate
			_start_turn()
			return
	_finish_round("", [])


func _player_has_legal_move(direction: String) -> bool:
	for record_value: Variant in piece_records:
		var record: Dictionary = record_value as Dictionary
		if bool(record.get("played", false)) or str(record.get("dir", "")) != direction:
			continue
		if _has_legal_cell_for_size(str(record["type"])):
			return true
	return false


func _has_legal_cell_for_size(size_name: String) -> bool:
	for cell: int in range(CELL_COORDS.size()):
		if _is_legal_cell(cell, size_name):
			return true
	return false


func _find_winning_pieces(direction: String) -> Array[int]:
	for line_value: Variant in WIN_LINES:
		var line: Array = line_value as Array
		for size_name: String in SIZE_ORDER:
			var same_size: Array[int] = _line_piece_indices(line, [size_name, size_name, size_name], direction)
			if same_size.size() == 3:
				return same_size
		var graded_up: Array[int] = _line_piece_indices(line, ["small", "medium", "large"], direction)
		if graded_up.size() == 3:
			return graded_up
		var graded_down: Array[int] = _line_piece_indices(line, ["large", "medium", "small"], direction)
		if graded_down.size() == 3:
			return graded_down

	for cell: int in range(CELL_COORDS.size()):
		var full_stack: Array[int] = []
		for size_name: String in SIZE_ORDER:
			var piece_index: int = _piece_at(cell, size_name)
			if piece_index < 0 or _piece_direction(piece_index) != direction:
				full_stack.clear()
				break
			full_stack.append(piece_index)
		if full_stack.size() == 3:
			return full_stack
	return []


func _line_piece_indices(line: Array, sizes: Array, direction: String) -> Array[int]:
	var found: Array[int] = []
	for offset: int in range(3):
		var piece_index: int = _piece_at(int(line[offset]), str(sizes[offset]))
		if piece_index < 0 or _piece_direction(piece_index) != direction:
			return []
		found.append(piece_index)
	return found


func _piece_at(cell: int, size_name: String) -> int:
	var key: String = _slot_key(cell, size_name)
	return int(occupied_slots[key]) if occupied_slots.has(key) else -1


func _piece_direction(piece_index: int) -> String:
	if piece_index < 0 or piece_index >= piece_records.size():
		return ""
	return str((piece_records[piece_index] as Dictionary).get("dir", ""))


func _finish_round(winner: String, winning: Array[int]) -> void:
	round_complete = true
	gameplay_ready = false
	turn_deadline_msec = 0
	round_winner = winner
	winning_piece_indices = winning.duplicate()
	_clear_selection()
	if winner != "":
		scores[winner] = int(scores.get(winner, 0)) + 1
		_highlight_winning_pieces(winning)
	match_complete = winner != "" and int(scores.get(winner, 0)) >= total_rounds
	_update_hud()
	_show_round_result()
	_publish_match_state("match-complete" if match_complete else "round-complete")


func _show_round_result() -> void:
	if result_button == null:
		return
	var reason: String = _round_win_reason(winning_piece_indices)
	if match_complete:
		var leaders: Array[String] = _match_leaders()
		if leaders.size() == 1:
			result_button.text = "بطل المباراة: %s\n%s\nإعادة المباراة" % [_player_name(leaders[0]), reason]
		else:
			result_button.text = "تعادل المباراة\nإعادة المباراة"
	elif round_winner == "":
		result_button.text = "تعادل الجولة\nالجولة التالية"
	else:
		result_button.text = "فاز %s بالجولة\n%s\nالجولة التالية" % [_player_name(round_winner), reason]
	result_button.visible = true


func _round_win_reason(winning: Array[int]) -> String:
	if winning.is_empty():
		return "لا يوجد فائز"
	var winning_cells: Dictionary = {}
	for cell: int in range(CELL_COORDS.size()):
		for size_name: String in SIZE_ORDER:
			if winning.has(_piece_at(cell, size_name)):
				winning_cells[cell] = true
	if winning_cells.size() == 1:
		return "أكمل خلية بثلاثة أحجام"
	for line_value: Variant in WIN_LINES:
		var line: Array = line_value as Array
		var complete: bool = true
		for cell_value: Variant in line:
			if not winning_cells.has(int(cell_value)):
				complete = false
				break
		if complete:
			return "كوّن خطًا من ثلاثة أحجار"
	return "أكمل نمط الفوز"


func _match_leaders() -> Array[String]:
	var best: int = -1
	var leaders: Array[String] = []
	for player: Dictionary in players:
		var direction: String = str(player["direction"])
		var score: int = int(scores.get(direction, 0))
		if score > best:
			best = score
			leaders = [direction]
		elif score == best:
			leaders.append(direction)
	return leaders


func _on_round_action() -> void:
	if not round_complete or action_in_progress:
		return
	if online_active:
		if online_cancelled:
			_return_to_setup()
			return
		if online != null:
			online.call("request_rematch")
		return
	action_in_progress = true
	if match_complete:
		for player: Dictionary in players:
			scores[str(player["direction"])] = 0
		round_number = 1
		round_starter_index = 0
		current_player_index = 0
		match_complete = false
	else:
		round_number += 1
		round_starter_index = (round_starter_index + 1) % players.size()
		current_player_index = round_starter_index
	_reset_board_for_round()


func _return_to_setup() -> void:
	if online != null:
		online.call("deactivate", true)
	online_active = false
	online_waiting = false
	online_cancelled = false
	match_initialized = false
	round_complete = false
	match_complete = false
	gameplay_ready = false
	turn_deadline_msec = 0
	move_active = false
	move_piece_index = -1
	move_cell = -1
	_reset_tray_state()
	selected_index = -1
	selected_original_material = null
	occupied_slots.clear()
	move_count = 0
	_hide_markers()
	for index: int in range(piece_records.size()):
		var record: Dictionary = piece_records[index] as Dictionary
		record["played"] = false
		piece_records[index] = record
		var piece: MeshInstance3D = record["mesh"] as MeshInstance3D
		if index < home_transforms.size():
			piece.transform = home_transforms[index]
		if index < home_materials.size():
			piece.material_override = home_materials[index]
	if result_button != null:
		result_button.visible = false
	_update_hud()
	waiting_for_setup = true
	if setup != null:
		setup.call("reset_for_intro")
		setup.call_deferred("show_after_intro")


func _reset_board_for_round() -> void:
	gameplay_ready = false
	round_complete = false
	round_winner = ""
	winning_piece_indices.clear()
	occupied_slots.clear()
	move_count = 0
	move_active = false
	move_piece_index = -1
	move_cell = -1
	_reset_tray_state()
	selected_index = -1
	selected_original_material = null
	_hide_markers()
	if result_button != null:
		result_button.visible = false

	# Return pieces in a readable, staggered sequence. Each piece lifts slightly
	# from the board, travels home, and settles; the coordinator waits for the
	# final staggered tween before handing control to the next turn.
	var coordinator: Tween = create_tween()
	var last_delay: float = 0.0
	for index: int in range(piece_records.size()):
		var record: Dictionary = piece_records[index] as Dictionary
		record["played"] = false
		piece_records[index] = record
		var piece: MeshInstance3D = record["mesh"] as MeshInstance3D
		piece.material_override = home_materials[index]
		var home: Transform3D = home_transforms[index]
		var delay: float = float(index % 9) * 0.045
		last_delay = maxf(last_delay, delay)
		var piece_tween: Tween = create_tween()
		piece_tween.tween_interval(delay)
		piece_tween.tween_property(piece, "position", piece.position + Vector3.UP * (0.32 * U), 0.16).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		piece_tween.tween_property(piece, "transform", home, ROUND_RESET_DURATION).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	coordinator.tween_interval(last_delay + ROUND_RESET_DURATION)
	coordinator.finished.connect(_finish_round_reset)
	_publish_match_state("round-reset")


func _finish_round_reset() -> void:
	action_in_progress = false
	_start_turn()


func _highlight_winning_pieces(indices: Array[int]) -> void:
	for piece_index: int in indices:
		if piece_index < 0 or piece_index >= piece_records.size():
			continue
		var record: Dictionary = piece_records[piece_index] as Dictionary
		var piece: MeshInstance3D = record["mesh"] as MeshInstance3D
		piece.material_override = _selection_material(piece.material_override)
		piece.scale = Vector3.ONE * U * 1.06


func _perform_bot_move() -> void:
	bot_scheduled = false
	if round_complete or move_active or _current_mode() != "bot":
		return
	var choice: Dictionary = _best_bot_move(_current_direction())
	if choice.is_empty():
		_advance_turn_or_draw()
		return
	_select_piece(int(choice["piece_index"]))
	_begin_move(int(choice["cell"]))


func _best_bot_move(direction: String) -> Dictionary:
	var candidates: Array[Dictionary] = []
	var order: int = 0
	for index: int in range(piece_records.size()):
		var record: Dictionary = piece_records[index] as Dictionary
		if bool(record.get("played", false)) or str(record.get("dir", "")) != direction:
			continue
		var size_name: String = str(record["type"])
		for cell: int in range(CELL_COORDS.size()):
			if not _is_legal_cell(cell, size_name):
				continue
			var score: int = 0
			if _would_win(direction, cell, size_name):
				score += 10000
			if _blocks_immediate_win(cell, size_name, direction):
				score += 5200
			score += _bot_line_score(direction, cell, size_name)
			if cell == 4:
				score += 18
			elif cell in [0, 2, 6, 8]:
				score += 7
			match size_name:
				"large": score += 8
				"medium": score += 5
				_: score += 3
			candidates.append({"piece_index": index, "cell": cell, "score": score, "order": order})
			order += 1
	if candidates.is_empty():
		return {}
	candidates.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var score_a: int = int(a["score"])
		var score_b: int = int(b["score"])
		return score_a > score_b if score_a != score_b else int(a["order"]) < int(b["order"])
	)
	# Older builds deliberately strengthened and weakened the bot by round.
	# Keep that character without RNG: weaker rounds choose the next ranked
	# legal move, so the same board always produces the same decision.
	var rank: int = mini(_bot_choice_rank(direction), candidates.size() - 1)
	return candidates[rank]


func _bot_line_score(direction: String, cell: int, size_name: String) -> int:
	var score: int = 0
	for line_value: Variant in WIN_LINES:
		var line: Array = line_value as Array
		if line.find(cell) < 0:
			continue
		var owned: int = 1
		for line_cell_value: Variant in line:
			var line_cell: int = int(line_cell_value)
			if line_cell == cell:
				continue
			if _piece_direction(_piece_at(line_cell, size_name)) == direction:
				owned += 1
		score += owned * 18
	return score


func _bot_choice_rank(direction: String) -> int:
	var round_index: int = (round_number - 1) % BOT_ROUND_SKILL.size()
	var strength: float = clampf(
		BOT_ROUND_SKILL[round_index] * float(BOT_DIRECTION_POWER.get(direction, 0.75)),
		0.35,
		0.97
	)
	if strength >= 0.62:
		return 0
	if strength >= 0.45:
		return 1
	return 2


func _blocks_immediate_win(cell: int, size_name: String, owner: String) -> bool:
	for player: Dictionary in players:
		var direction: String = str(player["direction"])
		if direction == owner:
			continue
		for record_value: Variant in piece_records:
			var record: Dictionary = record_value as Dictionary
			if bool(record.get("played", false)) or str(record.get("dir", "")) != direction:
				continue
			if str(record["type"]) == size_name and _would_win(direction, cell, size_name):
				return true
	return false


func _would_win(direction: String, cell: int, size_name: String) -> bool:
	for line_value: Variant in WIN_LINES:
		var line: Array = line_value as Array
		for sizes: Array in [[size_name, size_name, size_name], ["small", "medium", "large"], ["large", "medium", "small"]]:
			var all_owned: bool = true
			for offset: int in range(3):
				if _occupant_direction(int(line[offset]), str(sizes[offset]), cell, size_name, direction) != direction:
					all_owned = false
					break
			if all_owned:
				return true
	for stack_cell: int in range(CELL_COORDS.size()):
		var full: bool = true
		for stack_size: String in SIZE_ORDER:
			if _occupant_direction(stack_cell, stack_size, cell, size_name, direction) != direction:
				full = false
				break
		if full:
			return true
	return false


func _occupant_direction(cell: int, size_name: String, candidate_cell: int, candidate_size: String, candidate_direction: String) -> String:
	if cell == candidate_cell and size_name == candidate_size:
		return candidate_direction
	var piece_index: int = _piece_at(cell, size_name)
	return _piece_direction(piece_index)


func _capture_home_state() -> void:
	if home_transforms.size() == piece_records.size():
		return
	home_transforms.clear()
	home_materials.clear()
	for record_value: Variant in piece_records:
		var record: Dictionary = record_value as Dictionary
		var piece: MeshInstance3D = record["mesh"] as MeshInstance3D
		home_transforms.append(piece.transform)
		home_materials.append(piece.material_override)


func _current_player() -> Dictionary:
	if players.is_empty() or current_player_index < 0 or current_player_index >= players.size():
		return {}
	return players[current_player_index]


func _current_direction() -> String:
	return str(_current_player().get("direction", "right"))


func _direction_for_player(index: int) -> String:
	if index < 0 or index >= players.size():
		return ""
	return str(players[index].get("direction", ""))


func _current_mode() -> String:
	return str(_current_player().get("mode", "local"))


func _player_name(direction: String) -> String:
	for player: Dictionary in players:
		if str(player.get("direction", "")) == direction:
			return str(player.get("label", player.get("color_name", direction)))
	return direction


func _flash_result(message: String) -> void:
	if result_button == null or round_complete:
		return
	result_button.text = message
	result_button.visible = true
	get_tree().create_timer(0.75).timeout.connect(_hide_transient_result)


func _hide_transient_result() -> void:
	if result_button != null and not round_complete:
		result_button.visible = false


func _build_hud() -> void:
	hud_layer = CanvasLayer.new()
	hud_layer.layer = 20
	add_child(hud_layer)

	turn_style = StyleBoxFlat.new()
	turn_style.bg_color = Color(0.08, 0.08, 0.08, 0.88)
	turn_style.set_corner_radius_all(15)
	turn_style.content_margin_left = 14
	turn_style.content_margin_right = 14

	turn_label = Label.new()
	turn_label.set_anchors_preset(Control.PRESET_TOP_WIDE)
	turn_label.offset_left = 12
	turn_label.offset_top = 14
	turn_label.offset_right = -12
	turn_label.offset_bottom = 62
	turn_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	turn_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	turn_label.layout_direction = Control.LAYOUT_DIRECTION_RTL
	turn_label.add_theme_font_override("font", ARABIC_FONT)
	turn_label.add_theme_color_override("font_color", Color.WHITE)
	turn_label.add_theme_stylebox_override("normal", turn_style)
	turn_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud_layer.add_child(turn_label)

	score_label = Label.new()
	score_label.set_anchors_preset(Control.PRESET_TOP_LEFT)
	score_label.offset_left = 12
	score_label.offset_top = 70
	score_label.offset_right = 220
	score_label.offset_bottom = 100
	score_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	score_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	score_label.layout_direction = Control.LAYOUT_DIRECTION_RTL
	score_label.add_theme_font_override("font", ARABIC_FONT)
	score_label.add_theme_color_override("font_color", Color("#f3f4f4"))
	score_label.add_theme_color_override("font_outline_color", Color(0.02, 0.02, 0.02, 0.92))
	score_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud_layer.add_child(score_label)

	result_button = Button.new()
	result_button.set_anchors_preset(Control.PRESET_CENTER)
	result_button.offset_left = -166
	result_button.offset_top = -62
	result_button.offset_right = 166
	result_button.offset_bottom = 62
	result_button.text = ""
	result_button.layout_direction = Control.LAYOUT_DIRECTION_RTL
	result_button.add_theme_font_override("font", ARABIC_FONT)
	result_button.add_theme_color_override("font_color", Color.WHITE)
	result_button.add_theme_stylebox_override("normal", _result_style(Color("#15181aec")))
	result_button.add_theme_stylebox_override("hover", _result_style(Color("#285e51")))
	result_button.pressed.connect(_on_round_action)
	result_button.visible = false
	hud_layer.add_child(result_button)
	if not get_viewport().size_changed.is_connected(_layout_hud):
		get_viewport().size_changed.connect(_layout_hud)
	_layout_hud()
	_update_hud()


func _result_style(background: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.border_color = Color("#ffffff35")
	style.set_border_width_all(1)
	style.set_corner_radius_all(int(round(_hud_length(20.0))))
	return style


func _layout_hud() -> void:
	if turn_label == null or score_label == null or result_button == null:
		return
	var viewport: Vector2 = get_viewport().get_visible_rect().size
	var css_size: Vector2 = viewport
	if OS.has_feature("web"):
		var raw: Variant = JavaScriptBridge.eval(
			"JSON.stringify((()=>{const c=document.getElementById('canvas');const r=c?c.getBoundingClientRect():{width:innerWidth,height:innerHeight};return{w:r.width||innerWidth,h:r.height||innerHeight};})())",
			true
		)
		var decoded: Variant = JSON.parse_string(str(raw))
		if decoded is Dictionary:
			var values: Dictionary = decoded as Dictionary
			css_size = Vector2(float(values.get("w", viewport.x)), float(values.get("h", viewport.y)))
	var scale_x: float = css_size.x / maxf(viewport.x, 1.0)
	var scale_y: float = css_size.y / maxf(viewport.y, 1.0)
	hud_canvas_scale = clampf(minf(scale_x, scale_y), 0.20, 4.0)

	var margin: float = _hud_length(12.0)
	var turn_top: float = _hud_length(12.0)
	# Keep the chip centered, but reserve the top-right Settings footprint on
	# narrow screens so the two controls can never overlap.
	var turn_width_css: float = clampf(css_size.x - 232.0, 72.0, 124.0)
	var turn_width: float = _hud_length(turn_width_css)
	turn_label.offset_left = (viewport.x - turn_width) * 0.5
	turn_label.offset_top = turn_top
	turn_label.offset_right = (viewport.x + turn_width) * 0.5
	turn_label.offset_bottom = turn_top + _hud_length(30.0)
	turn_label.add_theme_font_size_override("font_size", _hud_font_size(18))
	turn_style.set_corner_radius_all(int(round(_hud_length(15.0))))
	turn_style.content_margin_left = _hud_length(14.0)
	turn_style.content_margin_right = _hud_length(14.0)

	score_label.offset_left = margin
	score_label.offset_top = _hud_length(68.0)
	score_label.offset_right = -margin
	score_label.offset_bottom = _hud_length(96.0)
	score_label.add_theme_font_size_override("font_size", _hud_font_size(15))
	score_label.add_theme_constant_override("outline_size", maxi(1, int(round(_hud_length(3.0)))))

	var result_width_css: float = minf(360.0, maxf(260.0, css_size.x - 32.0))
	var result_width: float = result_width_css / hud_canvas_scale
	var result_height: float = _hud_length(154.0)
	result_button.offset_left = -result_width * 0.5
	result_button.offset_top = -result_height * 0.5
	result_button.offset_right = result_width * 0.5
	result_button.offset_bottom = result_height * 0.5
	result_button.add_theme_font_size_override("font_size", _hud_font_size(20))
	result_button.add_theme_stylebox_override("normal", _result_style(Color("#15181aec")))
	result_button.add_theme_stylebox_override("hover", _result_style(Color("#285e51")))
	_publish_hud_metrics(viewport)


func _hud_length(css_pixels: float) -> float:
	return css_pixels / maxf(hud_canvas_scale, 0.20)


func _hud_font_size(css_points: int) -> int:
	return maxi(12, int(round(float(css_points) / maxf(hud_canvas_scale, 0.20))))


func _publish_hud_metrics(viewport: Vector2) -> void:
	if not OS.has_feature("web"):
		return
	var arabic_ready: bool = ARABIC_FONT.has_char(0x0623) and ARABIC_FONT.has_char(0x0644) and ARABIC_FONT.has_char(0x064A)
	var text_css: float = float(_hud_font_size(18)) * hud_canvas_scale
	var width_css: float = maxf(0.0, viewport.x - _hud_length(24.0)) * hud_canvas_scale
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakHudArabicFont='" + ("ready" if arabic_ready else "missing") + "';" +
		"document.body.dataset.yakolakHudTextPx='" + str(snappedf(text_css, 0.1)) + "';" +
		"document.body.dataset.yakolakHudWidth='" + str(snappedf(width_css, 0.1)) + "';",
		true
	)


func _update_hud() -> void:
	if turn_label == null or score_label == null:
		return
	if not match_initialized:
		turn_label.text = ""
		score_label.text = ""
		return
	var player: Dictionary = _current_player()
	if online_active and online_waiting:
		turn_label.text = "الغرفة جاهزة · بانتظار اللاعبين"
		score_label.text = "%d/%d جاهزون" % [players.size(), online_target_players]
		return
	var tutorial_hint: String = ""
	if tutorial_active and not tutorial_complete and _current_mode() == "local":
		tutorial_hint = " · اختر حجرًا ثم خانة مضيئة"
	elif _current_mode() == "bot":
		tutorial_hint = " · يفكر…"
	elif _current_mode() == "online":
		tutorial_hint = " · انتظار…"
	turn_label.text = "دور %s%s" % [str(player.get("color_name", "")), tutorial_hint]
	var score_parts: Array[String] = []
	for entry: Dictionary in players:
		var direction: String = str(entry["direction"])
		score_parts.append(str(int(scores.get(direction, 0))))
	score_label.text = "النتيجة " + " · ".join(score_parts)

	var palette_color: Color = Color("#252729")
	match str(player.get("color", "")):
		"blue": palette_color = Color("#173fa8")
		"gold": palette_color = Color("#8c5b18")
		"green": palette_color = Color("#087455")
	turn_style.bg_color = palette_color
	turn_label.queue_redraw()


func _publish_gameplay_state(state: String) -> void:
	super._publish_gameplay_state(state)
	_publish_match_state(state)


func _publish_match_state(state: String) -> void:
	if not OS.has_feature("web") or not match_initialized:
		return
	var remaining: int = maxi(turn_deadline_msec - Time.get_ticks_msec(), 0) if turn_deadline_msec > 0 and not round_complete else 0
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakMatchState='%s';" % state +
		"document.body.dataset.yakolakCurrentPlayer='%s';" % _current_direction() +
		"document.body.dataset.yakolakRound='%d';" % round_number +
		"document.body.dataset.yakolakRoundCount='%d';" % total_rounds +
		"document.body.dataset.yakolakWinsToWin='%d';" % total_rounds +
		"document.body.dataset.yakolakTurnRemaining='%d';" % remaining +
		"document.body.dataset.yakolakWinner='%s';" % round_winner +
		"document.body.dataset.yakolakPlayers='%d';" % players.size(),
		true
	)
