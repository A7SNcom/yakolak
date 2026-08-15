extends "res://scripts/gameplay_design_system.gd"

# Interaction feedback for the live board and gameplay chrome. Mouse hover is a
# lightweight material change only; touch gets the existing immediate tray/
# selection response. Persistent toggles (menu/sound) visibly stay selected.
const HOVER_LIGHTEN := 0.10
const HOVER_EMISSION_ENERGY := 0.34
const INVALID_FLASH_SECONDS := 0.16
const INVALID_COLOR := Color(1.0, 0.28, 0.20, 0.62)

var _feedback_hover_piece_index: int = -1
var _feedback_hover_original_material: Material
var _drag_touch_active: bool = false
var _drag_touch_moved: bool = false
var _drag_touch_index: int = -1
var _drag_touch_start: Vector2 = Vector2.ZERO
var _drag_preview_cell: int = -1
const DRAG_START_THRESHOLD_PX: float = 12.0
const DRAG_PREVIEW_RADIUS_PX: float = 132.0
var _feedback_invalid_serial: int = 0
var _feedback_menu_open_cache: bool = false
var _feedback_sound_muted_cache: bool = false
var _feedback_menu_cache_ready: bool = false


func _ready() -> void:
	super._ready()
	_feedback_sync_menu_state(true)
	_publish_gameplay_feedback_contract()


func _build_quick_menu() -> void:
	super._build_quick_menu()
	if quick_button != null:
		quick_button.toggle_mode = true
		quick_button.tooltip_text = "القائمة"
	if quick_sound_button != null:
		quick_sound_button.toggle_mode = true
		quick_sound_button.tooltip_text = "تشغيل أو كتم الصوت"
	_feedback_sync_menu_state(true)


func _input(event: InputEvent) -> void:
	if event is InputEventKey:
		var key := event as InputEventKey
		if key.pressed and not key.echo and key.keycode == KEY_ESCAPE and quick_panel != null and quick_panel.visible:
			quick_panel.visible = false
			_feedback_sync_menu_state(true)
			if quick_button != null:
				quick_button.grab_focus()
			get_viewport().set_input_as_handled()
			return

	if event is InputEventMouseMotion:
		_feedback_update_piece_hover((event as InputEventMouseMotion).position)
		if selected_index >= 0 and not move_active:
			_update_drag_preview((event as InputEventMouseMotion).position)
	elif event is InputEventMouseButton:
		var mouse := event as InputEventMouseButton
		if mouse.pressed and mouse.button_index == MOUSE_BUTTON_LEFT:
			_feedback_clear_piece_hover()
	elif event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		if touch.pressed:
			_drag_touch_active = true
			_drag_touch_moved = false
			_drag_touch_index = touch.index
			_drag_touch_start = touch.position
			_feedback_clear_piece_hover()
		else:
			var should_drop: bool = (
				_drag_touch_active
				and touch.index == _drag_touch_index
				and _drag_touch_moved
				and selected_index >= 0
				and not move_active
			)
			_drag_touch_active = false
			_drag_touch_index = -1
			if should_drop:
				_handle_drag_drop(touch.position)
				return
	elif event is InputEventScreenDrag:
		var drag := event as InputEventScreenDrag
		if _drag_touch_active and drag.index == _drag_touch_index:
			if _drag_touch_start.distance_to(drag.position) >= DRAG_START_THRESHOLD_PX:
				_drag_touch_moved = true
			if _drag_touch_moved:
				_update_drag_preview(drag.position)

	super._input(event)


func _toggle_quick_menu() -> void:
	super._toggle_quick_menu()
	_feedback_sync_menu_state(true)


func _toggle_sound() -> void:
	super._toggle_sound()
	_feedback_sync_menu_state(true)


func _sync_quick_menu() -> void:
	super._sync_quick_menu()
	_feedback_sync_menu_state(false)


func _handle_drag_drop(screen_position: Vector2) -> void:
	_handle_pointer(screen_position)
	if not move_active:
		_clear_drag_preview()
	get_viewport().set_input_as_handled()


func _update_drag_preview(screen_position: Vector2) -> void:
	if selected_index < 0 or move_active or camera == null or target_markers.is_empty():
		return
	var best_cell: int = -1
	var best_distance: float = DRAG_PREVIEW_RADIUS_PX
	var size_name: String = _selected_size()
	for cell: int in range(target_markers.size()):
		var marker: MeshInstance3D = target_markers[cell]
		if marker == null or not marker.visible or not _is_legal_cell(cell, size_name):
			continue
		var screen_target: Vector2 = camera.unproject_position(marker.global_position)
		var distance: float = screen_target.distance_to(screen_position)
		if distance < best_distance:
			best_distance = distance
			best_cell = cell
	if best_cell < 0:
		return
	var marker: MeshInstance3D = target_markers[best_cell]
	var record: Dictionary = piece_records[selected_index] as Dictionary
	var piece: MeshInstance3D = record.get("mesh", null) as MeshInstance3D
	if piece != null:
		piece.position = marker.position + Vector3.UP * (0.34 * U)
		piece.scale = Vector3.ONE * U * 1.12
	if _drag_preview_cell != best_cell:
		if _drag_preview_cell >= 0 and _drag_preview_cell < target_markers.size():
			target_markers[_drag_preview_cell].scale = Vector3.ONE * LEGAL_MARKER_SCALE
		_drag_preview_cell = best_cell
		marker.scale = Vector3.ONE * (LEGAL_MARKER_PULSE_SCALE * 1.18)
		marker.material_override = _feedback_hover_material(marker.material_override)
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakDragPreviewCell='" + str(best_cell) + "';", true)


func _clear_drag_preview() -> void:
	if selected_index >= 0 and selected_index < piece_records.size() and not move_active:
		var record: Dictionary = piece_records[selected_index] as Dictionary
		var piece: MeshInstance3D = record.get("mesh", null) as MeshInstance3D
		if piece != null:
			piece.position = selected_home_position + Vector3.UP * (SELECT_LIFT * U)
			piece.scale = Vector3.ONE * U * 1.08
	if _drag_preview_cell >= 0 and _drag_preview_cell < target_markers.size():
		target_markers[_drag_preview_cell].scale = Vector3.ONE * LEGAL_MARKER_SCALE
	_drag_preview_cell = -1
	if selected_index >= 0:
		var selected_record: Dictionary = piece_records[selected_index] as Dictionary
		_update_legal_markers(_selected_size(), _piece_color(selected_record))
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakDragPreviewCell='';", true)


func _begin_move(cell: int) -> void:
	_clear_drag_preview()
	_feedback_clear_piece_hover()
	super._begin_move(cell)


func _reset_for_intro() -> void:
	_drag_touch_active = false
	_drag_touch_moved = false
	_drag_touch_index = -1
	_clear_drag_preview()
	_feedback_clear_piece_hover()
	_feedback_invalid_serial += 1
	super._reset_for_intro()


func _publish_invalid(cell: int) -> void:
	super._publish_invalid(cell)
	if cell < 0 or cell >= target_markers.size():
		return
	_feedback_invalid_serial += 1
	var serial: int = _feedback_invalid_serial
	var marker: MeshInstance3D = target_markers[cell]
	if marker == null:
		return
	marker.visible = true
	marker.material_override = _marker_material(INVALID_COLOR)
	_restore_invalid_feedback(cell, serial)
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakInvalidFeedback='visible';", true)


func _restore_invalid_feedback(_cell: int, serial: int) -> void:
	await get_tree().create_timer(INVALID_FLASH_SECONDS).timeout
	if serial != _feedback_invalid_serial:
		return
	if selected_index >= 0 and not move_active:
		var record: Dictionary = piece_records[selected_index] as Dictionary
		_update_legal_markers(_selected_size(), _piece_color(record))
	else:
		_hide_markers()
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakInvalidFeedback='settled';", true)


func _feedback_update_piece_hover(screen_position: Vector2) -> void:
	if (
		not match_initialized
		or not gameplay_ready
		or move_active
		or camera_transition
		or round_complete
		or tutorial_showcase_running
		or _current_mode() != "local"
	):
		_feedback_clear_piece_hover()
		return

	var candidates: Array[int] = tray_indices if tray_open else _current_piece_candidates()
	var piece_index: int = _mesh_piece_at_pointer(screen_position, candidates)
	if piece_index == selected_index:
		piece_index = -1
	if piece_index == _feedback_hover_piece_index:
		return

	_feedback_clear_piece_hover()
	if piece_index < 0 or piece_index >= piece_records.size():
		return
	var record: Dictionary = piece_records[piece_index] as Dictionary
	if bool(record.get("played", false)) or str(record.get("dir", "")) != _current_direction():
		return
	if not _has_legal_cell_for_size(str(record.get("type", ""))):
		return
	var piece: MeshInstance3D = record.get("mesh", null) as MeshInstance3D
	if piece == null:
		return
	_feedback_hover_piece_index = piece_index
	_feedback_hover_original_material = piece.material_override
	piece.material_override = _feedback_hover_material(_feedback_hover_original_material)
	_publish_piece_hover(record)


func _feedback_clear_piece_hover() -> void:
	if _feedback_hover_piece_index >= 0 and _feedback_hover_piece_index < piece_records.size():
		var record: Dictionary = piece_records[_feedback_hover_piece_index] as Dictionary
		var piece: MeshInstance3D = record.get("mesh", null) as MeshInstance3D
		if piece != null and not bool(record.get("played", false)) and _feedback_hover_piece_index != selected_index:
			piece.material_override = _feedback_hover_original_material
	_feedback_hover_piece_index = -1
	_feedback_hover_original_material = null
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakPieceHover='';", true)


func _feedback_hover_material(source: Material) -> StandardMaterial3D:
	var result: StandardMaterial3D
	if source is StandardMaterial3D:
		result = (source as StandardMaterial3D).duplicate() as StandardMaterial3D
	else:
		result = StandardMaterial3D.new()
		result.albedo_color = Color.WHITE
	result.emission_enabled = true
	result.emission = result.albedo_color.lightened(HOVER_LIGHTEN)
	result.emission_energy_multiplier = HOVER_EMISSION_ENERGY
	return result


func _feedback_sync_menu_state(force: bool) -> void:
	if quick_button == null:
		return
	var menu_open: bool = quick_panel != null and quick_panel.visible
	var sound_muted: bool = AudioServer.is_bus_mute(0)
	quick_button.button_pressed = menu_open
	if quick_sound_button != null:
		quick_sound_button.button_pressed = sound_muted

	if not force and _feedback_menu_cache_ready and menu_open == _feedback_menu_open_cache and sound_muted == _feedback_sound_muted_cache:
		return
	_feedback_menu_cache_ready = true
	_feedback_menu_open_cache = menu_open
	_feedback_sound_muted_cache = sound_muted
	if quick_sound_button != null:
		quick_sound_button.text = "الصوت: مكتوم" if sound_muted else "الصوت: يعمل"
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakQuickMenuOpen='" + ("true" if menu_open else "false") + "';" +
			"document.body.dataset.yakolakSoundState='" + ("muted" if sound_muted else "on") + "';",
			true
		)


func _publish_piece_hover(record: Dictionary) -> void:
	if not OS.has_feature("web"):
		return
	var piece: MeshInstance3D = record.get("mesh", null) as MeshInstance3D
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakPieceHover='" + (piece.name if piece != null else "piece") + "';",
		true
	)


func _publish_gameplay_feedback_contract() -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakGameplayFeedback='hover+pressed+selected+invalid+toggle+focus';" +
		"document.body.dataset.yakolakGameplayFeedbackMotion='instant-subtle';",
		true
	)
