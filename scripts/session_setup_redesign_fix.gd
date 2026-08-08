extends "res://scripts/session_setup_redesign.gd"

# Prevent layout-triggered screen rebuild loops. Each question lays itself out
# once; viewport resize only recomputes the two-container geometry and framing.

func _layout_card() -> void:
	if root == null or card == null:
		return
	var viewport: Vector2 = get_viewport().get_visible_rect().size
	var metrics := _canvas_metrics(viewport)
	canvas_scale = float(metrics["scale"])
	canvas_css_size = metrics["css_size"] as Vector2

	var width_css: float = minf(560.0, maxf(280.0, canvas_css_size.x - 24.0))
	var requested_height_css: float = 248.0
	if active_screen == "invitation":
		requested_height_css = 258.0
	elif active_screen == "setup":
		match wizard_step:
			"color": requested_height_css = 286.0 if width_css < 430.0 else 238.0
			"count": requested_height_css = 214.0
			"rounds": requested_height_css = 214.0
			_: requested_height_css = 224.0

	var width: float = minf(viewport.x - _ui_length(12.0), width_css / canvas_scale)
	var upper_height: float = viewport.y * 0.47
	var max_height: float = maxf(_ui_length(148.0), upper_height - _ui_length(10.0))
	var height: float = minf(requested_height_css / canvas_scale, max_height)
	var y: float = maxf(_ui_length(6.0), (upper_height - height) * 0.5)
	card.position = Vector2(maxf(0.0, (viewport.x - width) * 0.5), y)
	card.size = Vector2(width, height)
	card.add_theme_stylebox_override("panel", _card_style())
	if showing:
		call_deferred("_apply_split_framing")


func _frame_table_for_setup(active: bool) -> void:
	if intro == null:
		return
	var cam := intro.get("camera") as Camera3D
	if cam == null:
		return
	if not active:
		if setup_camera_offset_captured:
			cam.v_offset = setup_camera_original_v_offset
		setup_camera_offset_captured = false
		if OS.has_feature("web"):
			JavaScriptBridge.eval("delete document.body.dataset.yakolakBoardSetupYRatio;", true)
		return

	if not setup_camera_offset_captured:
		setup_camera_original_v_offset = cam.v_offset
		setup_camera_offset_captured = true

	var viewport: Vector2 = get_viewport().get_visible_rect().size
	if viewport.y <= 1.0:
		return
	var board_center: Vector3 = intro.to_global(Vector3(0.0, 0.35, 0.0))
	cam.v_offset = setup_camera_original_v_offset
	var y0: float = cam.unproject_position(board_center).y
	cam.v_offset = setup_camera_original_v_offset + 1.0
	var y1: float = cam.unproject_position(board_center).y
	var delta: float = y1 - y0
	cam.v_offset = setup_camera_original_v_offset
	if absf(delta) > 0.01:
		var target_y: float = viewport.y * 0.72
		var solved: float = setup_camera_original_v_offset + (target_y - y0) / delta
		cam.v_offset = clampf(solved, setup_camera_original_v_offset - 24.0, setup_camera_original_v_offset + 24.0)
	var actual_y: float = cam.unproject_position(board_center).y
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakBoardSetupYRatio='%.4f';" % (actual_y / viewport.y), true)
