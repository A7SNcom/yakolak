extends "res://scripts/gameplay_design_system.gd"

# Interaction feedback for the live board and gameplay chrome. Mouse hover is a
# lightweight material change only; touch gets the existing immediate tray/
# selection response. Persistent toggles (menu/sound) visibly stay selected.
const HOVER_LIGHTEN := 0.10
const HOVER_EMISSION_ENERGY := 0.34
const INVALID_FLASH_SECONDS := 0.16
const INVALID_COLOR := Color(1.0, 0.28, 0.20, 0.62)
const FEEDBACK_LEGAL_OUTLINE_GROW := 0.035
const FEEDBACK_INVALID_SCALE := 1.18
const FEEDBACK_INVALID_OUTLINE_GROW := 0.075
const FEEDBACK_OUTLINE_LIGHT := Color(0.97, 0.95, 0.90, 0.96)
const FEEDBACK_OUTLINE_DARK := Color(0.06, 0.08, 0.10, 0.96)

var _feedback_hover_piece_index: int = -1
var _feedback_hover_original_material: Material
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
	elif event is InputEventMouseButton:
		var mouse := event as InputEventMouseButton
		if mouse.pressed and mouse.button_index == MOUSE_BUTTON_LEFT:
			_feedback_clear_piece_hover()
	elif event is InputEventScreenTouch:
		if (event as InputEventScreenTouch).pressed:
			_feedback_clear_piece_hover()

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


func _begin_move(cell: int) -> void:
	_feedback_clear_piece_hover()
	super._begin_move(cell)


func _reset_for_intro() -> void:
	_feedback_clear_piece_hover()
	_feedback_invalid_serial += 1
	super._reset_for_intro()


func _update_legal_markers(size_name: String, piece_color: Color) -> void:
	super._update_legal_markers(size_name, piece_color)
	for marker: MeshInstance3D in target_markers:
		if marker == null or not marker.visible:
			continue
		marker.material_override = _feedback_marker_material(
			marker.material_override,
			piece_color,
			FEEDBACK_LEGAL_OUTLINE_GROW
		)
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakLegalMarkerStyle='surface-ring+contrast-outline';", true)


func _feedback_marker_material(source: Material, fill_color: Color, outline_grow: float) -> StandardMaterial3D:
	var material: StandardMaterial3D
	if source is StandardMaterial3D:
		material = (source as StandardMaterial3D).duplicate() as StandardMaterial3D
	else:
		material = _surface_ring_material(fill_color)
	var luminance: float = fill_color.r * 0.2126 + fill_color.g * 0.7152 + fill_color.b * 0.0722
	var outline := StandardMaterial3D.new()
	outline.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	outline.albedo_color = FEEDBACK_OUTLINE_DARK if luminance >= 0.62 else FEEDBACK_OUTLINE_LIGHT
	outline.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	outline.cull_mode = BaseMaterial3D.CULL_FRONT
	outline.grow = true
	outline.grow_amount = outline_grow
	outline.roughness = 1.0
	material.next_pass = outline
	return material


func _publish_invalid(cell: int) -> void:
	super._publish_invalid(cell)
	if cell < 0 or cell >= target_markers.size():
		return
	_feedback_invalid_serial += 1
	var serial: int = _feedback_invalid_serial
	if legal_marker_pulse != null and legal_marker_pulse.is_valid():
		legal_marker_pulse.kill()
	legal_marker_pulse = null
	var marker: MeshInstance3D = target_markers[cell]
	if marker == null:
		return
	marker.visible = true
	marker.scale = Vector3.ONE * FEEDBACK_INVALID_SCALE
	var invalid_base: StandardMaterial3D = _surface_ring_material(INVALID_COLOR)
	marker.material_override = _feedback_marker_material(invalid_base, INVALID_COLOR, FEEDBACK_INVALID_OUTLINE_GROW)
	_restore_invalid_feedback(cell, serial)
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakInvalidFeedback='visible';document.body.dataset.yakolakInvalidCue='oversized-outlined-ring';document.body.dataset.yakolakSelectionRecovery='preserved';", true)


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
		JavaScriptBridge.eval("document.body.dataset.yakolakInvalidFeedback='settled';document.body.dataset.yakolakSelectionRecovery='preserved';", true)


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
		"document.body.dataset.yakolakGameplayFeedback='hover+pressed+selected-outline+legal-ring-outline+invalid-shape+toggle+focus';" +
		"document.body.dataset.yakolakGameplayFeedbackMotion='instant-subtle';",
		true
	)
