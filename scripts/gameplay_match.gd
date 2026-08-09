extends "res://scripts/gameplay.gd"

# YAKOLAK 3.0 — complete local hot-seat round loop on top of the approved intro.
# Rules stay independent from presentation: fixed seat order, legal ownership,
# 18-second turns, the three official win patterns, scoring, rounds, and rematch.

const PLAYER_DIRECTIONS: Array[String] = ["right", "back", "left", "front"]
const PLAYER_NAMES_AR: Dictionary = {
	"right": "الأبيض",
	"back": "الأزرق",
	"left": "الذهبي",
	"front": "الأخضر",
}
const PLAYER_COLORS: Dictionary = {
	"right": Color("#f4f4f1"),
	"back": Color("#173fa8"),
	"left": Color("#9d6415"),
	"front": Color("#087455"),
}
const SIZE_ORDER: Array[String] = ["small", "medium", "large"]
const WIN_LINES: Array = [
	[0, 1, 2], [3, 4, 5], [6, 7, 8],
	[0, 3, 6], [1, 4, 7], [2, 5, 8],
	[0, 4, 8], [2, 4, 6],
]
const TURN_DURATION_MS: int = 18000
const MATCH_ROUNDS: int = 3
const ROUND_RESET_DURATION: float = 0.62

var match_initialized: bool = false
var current_player_index: int = 0
var round_starter_index: int = 0
var round_number: int = 1
var scores: Dictionary = {}
var turn_deadline_msec: int = 0
var round_complete: bool = false
var match_complete: bool = false
var round_winner: String = ""
var winning_piece_indices: Array[int] = []
var action_in_progress: bool = false
var last_hud_second: int = -1

var home_transforms: Array[Transform3D] = []
var home_materials: Array[Material] = []

var hud_layer: CanvasLayer
var turn_label: Label
var score_label: Label
var result_label: Label
var turn_style: StyleBoxFlat


func _ready() -> void:
	super._ready()
	_build_match_hud()


func _process(delta: float) -> void:
	super._process(delta)
	if not match_initialized:
		return
	if gameplay_ready and not move_active and not round_complete:
		var remaining: int = maxi(turn_deadline_msec - Time.get_ticks_msec(), 0)
		var remaining_seconds: int = int(ceil(float(remaining) / 1000.0))
		if remaining_seconds != last_hud_second:
			last_hud_second = remaining_seconds
			_update_hud()
			_publish_match_state("turn")
		if remaining <= 0:
			_handle_timeout()


func _input(event: InputEvent) -> void:
	if round_complete and not action_in_progress:
		var activate: bool = false
		if event is InputEventScreenTouch:
			activate = (event as InputEventScreenTouch).pressed
		elif event is InputEventMouseButton:
			var mouse := event as InputEventMouseButton
			activate = mouse.pressed and mouse.button_index == MOUSE_BUTTON_LEFT
		elif event is InputEventKey:
			var key := event as InputEventKey
			activate = key.pressed and not key.echo and (key.keycode == KEY_ENTER or key.keycode == KEY_SPACE)
		if activate:
			get_viewport().set_input_as_handled()
			_on_round_action()
			return
	super._input(event)


func _enable_gameplay() -> void:
	super._enable_gameplay()
	_capture_home_state()
	if not match_initialized:
		_initialize_match()
	else:
		_start_turn()


func _reset_for_intro() -> void:
	super._reset_for_intro()
	match_initialized = false
	current_player_index = 0
	round_starter_index = 0
	round_number = 1
	scores.clear()
	turn_deadline_msec = 0
	round_complete = false
	match_complete = false
	round_winner = ""
	winning_piece_indices.clear()
	action_in_progress = false
	last_hud_second = -1
	home_transforms.clear()
	home_materials.clear()
	if result_label != null:
		result_label.visible = false
	_update_hud()


func _handle_pointer(screen_position: Vector2) -> void:
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
				_publish_wrong_owner(record)
				return
			if not _has_legal_cell_for_size(str(record["type"])):
				_publish_size_blocked(record)
				return
			_select_piece(piece_index)
			return

	if selected_index >= 0:
		_clear_selection()


func _update_move() -> void:
	var was_active: bool = move_active
	var previous_moves: int = move_count
	super._update_move()
	if not was_active or move_active or move_count == previous_moves:
		return

	gameplay_ready = false
	var winning: Array[int] = _find_winning_pieces(_current_direction())
	if not winning.is_empty():
		_finish_round(_current_direction(), winning)
		return
	_advance_turn_or_draw()


func _publish_gameplay_state(state: String) -> void:
	super._publish_gameplay_state(state)
	_publish_match_state(state)


func _publish_test_targets() -> void:
	if not gameplay_ready or camera == null or round_complete:
		return
	var direction: String = _current_direction()
	var sample_indices: Dictionary = {}
	for size_name: String in SIZE_ORDER:
		sample_indices[size_name] = _find_unplayed_piece(direction, size_name)

	var generic_index: int = int(sample_indices["large"])
	if generic_index < 0:
		generic_index = int(sample_indices["medium"])
	if generic_index < 0:
		generic_index = int(sample_indices["small"])
	if generic_index < 0:
		return

	var script: String = ""
	for size_name: String in SIZE_ORDER:
		var piece_index: int = int(sample_indices[size_name])
		if piece_index < 0:
			continue
		var point: Vector2 = _piece_screen_point(piece_index, size_name)
		var cap: String = size_name.capitalize()
		script += "document.body.dataset.yakolakTest%sX='%s';" % [cap, str(point.x)]
		script += "document.body.dataset.yakolakTest%sY='%s';" % [cap, str(point.y)]

	var generic_record: Dictionary = piece_records[generic_index] as Dictionary
	var generic_mesh := generic_record["mesh"] as MeshInstance3D
	var generic_point: Vector2 = _piece_screen_point(generic_index, str(generic_record["type"]))
	script += "document.body.dataset.yakolakTestPieceX='%s';" % str(generic_point.x)
	script += "document.body.dataset.yakolakTestPieceY='%s';" % str(generic_point.y)
	script += "document.body.dataset.yakolakTestPiece='%s';" % str(generic_mesh.name)

	for cell: int in range(CELL_COORDS.size()):
		var world_point: Vector3 = Vector3(CELL_COORDS[cell].x * U, 0.52, CELL_COORDS[cell].z * U)
		var screen_point: Vector2 = camera.unproject_position(world_point)
		script += "document.body.dataset.yakolakTestCell%dX='%s';" % [cell, str(screen_point.x)]
		script += "document.body.dataset.yakolakTestCell%dY='%s';" % [cell, str(screen_point.y)]
		if cell == 4:
			script += "document.body.dataset.yakolakTestCellX='%s';" % str(screen_point.x)
			script += "document.body.dataset.yakolakTestCellY='%s';" % str(screen_point.y)

	if OS.has_feature("web"):
		JavaScriptBridge.eval(script, true)


func _initialize_match() -> void:
	match_initialized = true
	scores = {"right": 0, "back": 0, "left": 0, "front": 0}
	round_number = 1
	round_starter_index = 0
	current_player_index = 0
	round_complete = false
	match_complete = false
	round_winner = ""
	winning_piece_indices.clear()
	action_in_progress = false
	if result_label != null:
		result_label.visible = false
	_start_turn()
	print("YAKOLAK_MATCH_READY players=4 rounds=%d timer=%d" % [MATCH_ROUNDS, TURN_DURATION_MS])


func _capture_home_state() -> void:
	if home_transforms.size() == piece_records.size():
		return
	home_transforms.clear()
	home_materials.clear()
	for record_value: Variant in piece_records:
		var record: Dictionary = record_value as Dictionary
		var mesh_instance := record["mesh"] as MeshInstance3D
		home_transforms.append(mesh_instance.transform)
		home_materials.append(mesh_instance.material_override)


func _start_turn() -> void:
	if round_complete:
		return
	gameplay_ready = true
	turn_deadline_msec = Time.get_ticks_msec() + TURN_DURATION_MS
	last_hud_second = -1
	_update_hud()
	_publish_match_state("turn")
	_publish_test_targets.call_deferred()
	print("YAKOLAK_TURN_START round=%d player=%s" % [round_number, _current_direction()])


func _handle_timeout() -> void:
	if round_complete or move_active:
		return
	gameplay_ready = false
	_clear_selection()
	print("YAKOLAK_TURN_TIMEOUT round=%d player=%s" % [round_number, _current_direction()])
	_publish_match_state("timeout")
	_advance_turn_or_draw()


func _advance_turn_or_draw() -> void:
	for offset: int in range(1, PLAYER_DIRECTIONS.size() + 1):
		var candidate: int = (current_player_index + offset) % PLAYER_DIRECTIONS.size()
		if _player_has_legal_move(str(PLAYER_DIRECTIONS[candidate])):
			current_player_index = candidate
			_start_turn()
			return
	_finish_round("", [])


func _player_has_legal_move(direction: String) -> bool:
	for record_value: Variant in piece_records:
		var record: Dictionary = record_value as Dictionary
		if bool(record.get("played", false)) or str(record["dir"]) != direction:
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
		var complete_cell: Array[int] = []
		for size_name: String in SIZE_ORDER:
			var piece_index: int = _piece_at(cell, size_name)
			if piece_index < 0 or _piece_direction(piece_index) != direction:
				complete_cell.clear()
				break
			complete_cell.append(piece_index)
		if complete_cell.size() == 3:
			return complete_cell
	return []


func _line_piece_indices(line: Array, sizes: Array, direction: String) -> Array[int]:
	var result: Array[int] = []
	for offset: int in range(3):
		var piece_index: int = _piece_at(int(line[offset]), str(sizes[offset]))
		if piece_index < 0 or _piece_direction(piece_index) != direction:
			return []
		result.append(piece_index)
	return result


func _piece_at(cell: int, size_name: String) -> int:
	var key: String = _slot_key(cell, size_name)
	return int(occupied_slots[key]) if occupied_slots.has(key) else -1


func _piece_direction(piece_index: int) -> String:
	if piece_index < 0 or piece_index >= piece_records.size():
		return ""
	var record: Dictionary = piece_records[piece_index] as Dictionary
	return str(record["dir"])


func _finish_round(winner: String, winning: Array[int]) -> void:
	round_complete = true
	gameplay_ready = false
	round_winner = winner
	winning_piece_indices = winning.duplicate()
	_clear_selection()
	if winner != "":
		scores[winner] = int(scores.get(winner, 0)) + 1
		_highlight_winning_pieces(winning)
	match_complete = winner != "" and int(scores.get(winner, 0)) >= MATCH_ROUNDS
	_update_hud()
	_show_round_result()
	_publish_match_state("match-complete" if match_complete else "round-complete")
	print("YAKOLAK_ROUND_COMPLETE round=%d winner=%s scores=%s" % [round_number, winner if winner != "" else "draw", str(scores)])


func _show_round_result() -> void:
	if result_label == null:
		return
	result_label.visible = true
	if match_complete:
		var leaders: Array[String] = _match_leaders()
		if leaders.size() == 1:
			result_label.text = "بطل المباراة: %s\nالمس لإعادة المباراة" % _player_name(leaders[0])
		else:
			result_label.text = "تعادل المباراة\nالمس لإعادة المباراة"
	elif round_winner == "":
		result_label.text = "تعادل الجولة\nالمس لبدء الجولة التالية"
	else:
		result_label.text = "فاز %s بالجولة\nالمس لبدء الجولة التالية" % _player_name(round_winner)


func _match_leaders() -> Array[String]:
	var best: int = -1
	var leaders: Array[String] = []
	for direction: String in PLAYER_DIRECTIONS:
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
	action_in_progress = true
	if match_complete:
		scores = {"right": 0, "back": 0, "left": 0, "front": 0}
		round_number = 1
		round_starter_index = 0
		current_player_index = 0
		match_complete = false
	else:
		round_number += 1
		round_starter_index = (round_starter_index + 1) % PLAYER_DIRECTIONS.size()
		current_player_index = round_starter_index
	_reset_board_for_round()


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
	selected_index = -1
	selected_original_material = null
	_hide_markers()
	if result_label != null:
		result_label.visible = false

	var tween: Tween = create_tween()
	tween.set_parallel(true)
	for index: int in range(piece_records.size()):
		var record: Dictionary = piece_records[index] as Dictionary
		record["played"] = false
		piece_records[index] = record
		var mesh_instance := record["mesh"] as MeshInstance3D
		mesh_instance.material_override = home_materials[index]
		tween.tween_property(mesh_instance, "transform", home_transforms[index], ROUND_RESET_DURATION).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	tween.finished.connect(_finish_round_reset)
	_publish_match_state("round-reset")
	print("YAKOLAK_ROUND_RESET round=%d starter=%s" % [round_number, _current_direction()])


func _finish_round_reset() -> void:
	action_in_progress = false
	_start_turn()


func _highlight_winning_pieces(indices: Array[int]) -> void:
	for piece_index: int in indices:
		if piece_index < 0 or piece_index >= piece_records.size():
			continue
		var record: Dictionary = piece_records[piece_index] as Dictionary
		var mesh_instance := record["mesh"] as MeshInstance3D
		mesh_instance.material_override = _selection_material(mesh_instance.material_override)
		mesh_instance.scale = Vector3.ONE * U * 1.06


func _find_unplayed_piece(direction: String, size_name: String) -> int:
	for index: int in range(piece_records.size()):
		var record: Dictionary = piece_records[index] as Dictionary
		if not bool(record.get("played", false)) and str(record["dir"]) == direction and str(record["type"]) == size_name:
			return index
	return -1


func _piece_screen_point(piece_index: int, size_name: String) -> Vector2:
	var record: Dictionary = piece_records[piece_index] as Dictionary
	var mesh_instance := record["mesh"] as MeshInstance3D
	var offset: Vector3
	match size_name:
		"large": offset = Vector3(17.0, 0.0, 9.5)
		"medium": offset = Vector3(12.5, 0.0, 7.0)
		_: offset = Vector3(8.0, 0.0, 4.5)
	return camera.unproject_position(mesh_instance.to_global(offset))


func _publish_wrong_owner(record: Dictionary) -> void:
	print("YAKOLAK_PIECE_REJECTED reason=wrong-owner current=%s piece=%s" % [_current_direction(), str(record["dir"])])
	_publish_match_state("wrong-owner")
	_flash_result("هذا الحجر ليس للدور الحالي")


func _publish_size_blocked(record: Dictionary) -> void:
	print("YAKOLAK_PIECE_REJECTED reason=no-legal-cell size=%s" % str(record["type"]))
	_publish_match_state("no-legal-cell")
	_flash_result("لا توجد خانة متاحة لهذا الحجم")


func _flash_result(message: String) -> void:
	if result_label == null or round_complete:
		return
	result_label.text = message
	result_label.visible = true
	var timer := get_tree().create_timer(0.9)
	timer.timeout.connect(_hide_transient_result)


func _hide_transient_result() -> void:
	if result_label != null and not round_complete:
		result_label.visible = false


func _current_direction() -> String:
	return str(PLAYER_DIRECTIONS[current_player_index])


func _player_name(direction: String) -> String:
	return str(PLAYER_NAMES_AR.get(direction, direction))


func _build_match_hud() -> void:
	hud_layer = CanvasLayer.new()
	hud_layer.layer = 20
	add_child(hud_layer)

	turn_style = StyleBoxFlat.new()
	turn_style.bg_color = Color(0.08, 0.08, 0.08, 0.84)
	turn_style.corner_radius_top_left = 16
	turn_style.corner_radius_top_right = 16
	turn_style.corner_radius_bottom_left = 16
	turn_style.corner_radius_bottom_right = 16
	turn_style.content_margin_left = 14.0
	turn_style.content_margin_right = 14.0
	turn_style.content_margin_top = 8.0
	turn_style.content_margin_bottom = 8.0

	turn_label = Label.new()
	turn_label.set_anchors_preset(Control.PRESET_TOP_WIDE)
	turn_label.offset_left = 12.0
	turn_label.offset_top = 14.0
	turn_label.offset_right = -12.0
	turn_label.offset_bottom = 62.0
	turn_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	turn_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	turn_label.add_theme_font_size_override("font_size", 22)
	turn_label.add_theme_color_override("font_color", Color.WHITE)
	turn_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.6))
	turn_label.add_theme_constant_override("outline_size", 4)
	turn_label.add_theme_stylebox_override("normal", turn_style)
	turn_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud_layer.add_child(turn_label)

	score_label = Label.new()
	score_label.set_anchors_preset(Control.PRESET_TOP_WIDE)
	score_label.offset_left = 12.0
	score_label.offset_top = 67.0
	score_label.offset_right = -12.0
	score_label.offset_bottom = 98.0
	score_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	score_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	score_label.add_theme_font_size_override("font_size", 17)
	score_label.add_theme_color_override("font_color", Color("#202020"))
	score_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud_layer.add_child(score_label)

	var result_style := StyleBoxFlat.new()
	result_style.bg_color = Color(0.04, 0.04, 0.04, 0.92)
	result_style.corner_radius_top_left = 20
	result_style.corner_radius_top_right = 20
	result_style.corner_radius_bottom_left = 20
	result_style.corner_radius_bottom_right = 20
	result_style.content_margin_left = 22.0
	result_style.content_margin_right = 22.0
	result_style.content_margin_top = 18.0
	result_style.content_margin_bottom = 18.0

	result_label = Label.new()
	result_label.set_anchors_preset(Control.PRESET_CENTER)
	result_label.offset_left = -210.0
	result_label.offset_top = -65.0
	result_label.offset_right = 210.0
	result_label.offset_bottom = 65.0
	result_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	result_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	result_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	result_label.add_theme_font_size_override("font_size", 26)
	result_label.add_theme_color_override("font_color", Color.WHITE)
	result_label.add_theme_stylebox_override("normal", result_style)
	result_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	result_label.visible = false
	hud_layer.add_child(result_label)
	_update_hud()


func _update_hud() -> void:
	if turn_label == null or score_label == null:
		return
	var direction: String = _current_direction() if not PLAYER_DIRECTIONS.is_empty() else "right"
	var seconds: int = 18
	if turn_deadline_msec > 0 and not round_complete:
		seconds = int(ceil(float(maxi(turn_deadline_msec - Time.get_ticks_msec(), 0)) / 1000.0))
	turn_label.text = "الجولة %d  ·  للفوز %d أشواط  ·  دور %s  ·  %dث" % [round_number, MATCH_ROUNDS, _player_name(direction), seconds]
	score_label.text = "أبيض %d   ·   أزرق %d   ·   ذهبي %d   ·   أخضر %d" % [
		int(scores.get("right", 0)), int(scores.get("back", 0)),
		int(scores.get("left", 0)), int(scores.get("front", 0)),
	]
	var active_color: Color = PLAYER_COLORS[direction] as Color
	turn_style.bg_color = Color(active_color.r * 0.58, active_color.g * 0.58, active_color.b * 0.58, 0.90)
	if direction == "right":
		turn_style.bg_color = Color(0.24, 0.24, 0.23, 0.92)
	turn_label.queue_redraw()


func _publish_match_state(state: String) -> void:
	if not OS.has_feature("web") or not match_initialized:
		return
	var remaining: int = 0
	if turn_deadline_msec > 0 and not round_complete:
		remaining = maxi(turn_deadline_msec - Time.get_ticks_msec(), 0)
	var script: String = ""
	script += "document.body.dataset.yakolakMatchState='%s';" % state
	script += "document.body.dataset.yakolakCurrentPlayer='%s';" % _current_direction()
	script += "document.body.dataset.yakolakRound='%d';" % round_number
	script += "document.body.dataset.yakolakRoundCount='%d';" % MATCH_ROUNDS
	script += "document.body.dataset.yakolakTurnRemaining='%d';" % remaining
	script += "document.body.dataset.yakolakWinner='%s';" % round_winner
	script += "document.body.dataset.yakolakMatchComplete='%s';" % ("true" if match_complete else "false")
	script += "document.body.dataset.yakolakScoreRight='%d';" % int(scores.get("right", 0))
	script += "document.body.dataset.yakolakScoreBack='%d';" % int(scores.get("back", 0))
	script += "document.body.dataset.yakolakScoreLeft='%d';" % int(scores.get("left", 0))
	script += "document.body.dataset.yakolakScoreFront='%d';" % int(scores.get("front", 0))
	JavaScriptBridge.eval(script, true)
