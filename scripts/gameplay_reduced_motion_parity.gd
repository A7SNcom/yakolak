extends "res://scripts/gameplay_selection_latency.gd"

# GGH-029 — Reduced Motion state parity.
# Rules/authority remain inherited. This leaf only changes presentation timing:
# large camera/tray/move motion snaps to its existing final state, while the
# same non-motion selection, turn and match-end signifiers remain authoritative.
const RM_ACK_TEXT := "✓ تمت الحركة"

var _rm_enabled: bool = false
var _rm_ack_panel: PanelContainer
var _rm_ack_label: Label


func _ready() -> void:
	super._ready()
	_rm_enabled = _prefers_reduced_motion_gameplay()
	if _rm_enabled:
		_build_reduced_motion_ack()
	_publish_reduced_motion_contract("ready")


func _prefers_reduced_motion_gameplay() -> bool:
	if not OS.has_feature("web"):
		return false
	return bool(JavaScriptBridge.eval(
		"Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)",
		true
	))


func _build_reduced_motion_ack() -> void:
	if hud_layer == null or _rm_ack_panel != null:
		return
	_rm_ack_panel = PanelContainer.new()
	_rm_ack_panel.name = "ReducedMotionMoveAck"
	_rm_ack_panel.anchor_left = 0.5
	_rm_ack_panel.anchor_right = 0.5
	_rm_ack_panel.anchor_top = 1.0
	_rm_ack_panel.anchor_bottom = 1.0
	_rm_ack_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.035, 0.055, 0.062, 0.94)
	style.border_color = Color(0.96, 0.95, 0.90, 0.92)
	style.set_border_width_all(2)
	style.set_corner_radius_all(18)
	style.content_margin_left = 14.0
	style.content_margin_right = 14.0
	style.content_margin_top = 6.0
	style.content_margin_bottom = 6.0
	_rm_ack_panel.add_theme_stylebox_override("panel", style)
	_rm_ack_panel.visible = false
	hud_layer.add_child(_rm_ack_panel)

	_rm_ack_label = Label.new()
	_rm_ack_label.text = RM_ACK_TEXT
	_rm_ack_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_rm_ack_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_rm_ack_label.layout_direction = Control.LAYOUT_DIRECTION_RTL
	_rm_ack_label.text_direction = Control.TEXT_DIRECTION_RTL
	_rm_ack_label.language = "ar"
	_rm_ack_label.add_theme_font_override("font", ARABIC_FONT)
	_rm_ack_label.add_theme_color_override("font_color", Color.WHITE)
	_rm_ack_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_rm_ack_panel.add_child(_rm_ack_label)
	_layout_reduced_motion_ack()

func _layout_hud() -> void:
	super._layout_hud()
	_layout_reduced_motion_ack()


func _layout_reduced_motion_ack() -> void:
	if _rm_ack_panel == null:
		return
	_rm_ack_panel.offset_left = -_hud_length(82.0)
	_rm_ack_panel.offset_right = _hud_length(82.0)
	_rm_ack_panel.offset_top = -_hud_length(72.0)
	_rm_ack_panel.offset_bottom = -_hud_length(32.0)
	if _rm_ack_label != null:
		_rm_ack_label.add_theme_font_size_override("font_size", _hud_font_size(15))


func _open_piece_tray(piece_index: int) -> void:
	super._open_piece_tray(piece_index)
	if not _rm_enabled or not tray_open:
		return
	if tray_tween != null and tray_tween.is_valid():
		tray_tween.kill()
	tray_tween = null
	for order: int in range(tray_indices.size()):
		var index: int = tray_indices[order]
		var piece := (piece_records[index] as Dictionary).get("mesh", null) as MeshInstance3D
		if piece != null:
			piece.position = home_transforms[index].origin + Vector3.UP * (float(order) * TRAY_LIFT_STEP * U)

func _close_piece_tray(skip_index: int = -1, immediate: bool = false) -> void:
	super._close_piece_tray(skip_index, immediate or _rm_enabled)


func _transition_to_current_player() -> void:
	super._transition_to_current_player()
	if not _rm_enabled or online_active or not turn_camera_active or camera == null:
		return
	if camera_tween != null and camera_tween.is_valid():
		camera_tween.kill()
	camera_tween = null
	_apply_turn_camera_progress(1.0)
	_finish_camera_transition()
	_publish_reduced_motion_contract("turn-snap")


func _start_authoritative_turn_camera(direction: String, revision: int, lifecycle: String) -> void:
	super._start_authoritative_turn_camera(direction, revision, lifecycle)
	if not _rm_enabled or not turn_camera_active or camera == null:
		return
	var serial: int = turn_presentation_serial
	if camera_tween != null and camera_tween.is_valid():
		camera_tween.kill()
	camera_tween = null
	_apply_authoritative_turn_camera_progress(1.0, serial)
	_finish_authoritative_turn_camera(serial, direction)
	_publish_reduced_motion_contract("authoritative-turn-snap")

func _begin_move(cell: int) -> void:
	super._begin_move(cell)
	if not _rm_enabled or online_active or not move_active:
		return
	# Keep the inherited commit path intact, but resolve its presentation in this
	# input turn instead of requiring the 520 ms arc to communicate acceptance.
	move_started_msec = Time.get_ticks_msec() - int(ceil(MOVE_DURATION))
	_update_move()


func _publish_selection(record: Dictionary) -> void:
	_hide_reduced_motion_ack("next-selection")
	super._publish_selection(record)
	if _rm_enabled:
		_publish_reduced_motion_contract("selection-static")


func _publish_move_complete(record: Dictionary, cell: int) -> void:
	super._publish_move_complete(record, cell)
	if not _rm_enabled:
		return
	_show_reduced_motion_ack(record, cell)
	_publish_reduced_motion_contract("move-ack-static")


func _finish_round(winner: String, winning: Array[int]) -> void:
	_hide_reduced_motion_ack("round-end")
	super._finish_round(winner, winning)
	if _rm_enabled:
		_publish_reduced_motion_contract("match-end-static" if match_complete else "round-end-static")

func _reset_for_intro() -> void:
	_hide_reduced_motion_ack("intro-reset")
	super._reset_for_intro()


func _return_to_setup() -> void:
	_hide_reduced_motion_ack("setup")
	super._return_to_setup()


func _show_reduced_motion_ack(record: Dictionary, cell: int) -> void:
	if _rm_ack_panel != null:
		_rm_ack_panel.visible = true
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakReducedMotionMoveAck='visible';" +
			"document.body.dataset.yakolakReducedMotionMoveAckCue='check+text+final-piece';" +
			"document.body.dataset.yakolakReducedMotionLastCell='%d';" % cell +
			"document.body.dataset.yakolakReducedMotionLastSize=" + JSON.stringify(str(record.get("type", ""))) + ";",
			true
		)


func _hide_reduced_motion_ack(reason: String) -> void:
	if _rm_ack_panel != null:
		_rm_ack_panel.visible = false
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakReducedMotionMoveAck='hidden';" +
			"document.body.dataset.yakolakReducedMotionMoveAckReason=" + JSON.stringify(reason) + ";",
			true
		)

func _publish_reduced_motion_contract(state: String) -> void:
	if not OS.has_feature("web"):
		return
	var result_static: bool = round_complete and result_button != null and result_button.visible
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakReducedMotionGameplay='%s';" % ("true" if _rm_enabled else "false") +
		"document.body.dataset.yakolakReducedMotionState=" + JSON.stringify(state) + ";" +
		"document.body.dataset.yakolakReducedMotionSelection='contrast-outline+legal-rings';" +
		"document.body.dataset.yakolakReducedMotionTurn='semantic-capsule+exact-seat-light+camera-snap';" +
		"document.body.dataset.yakolakReducedMotionMove='final-piece+static-check-text';" +
		"document.body.dataset.yakolakReducedMotionMatchEnd='static-result-control';" +
		"document.body.dataset.yakolakReducedMotionResultVisible='%s';" % ("true" if result_static else "false") +
		"document.body.dataset.yakolakReducedMotionAnimationDependency='none-for-state';",
		true
	)
