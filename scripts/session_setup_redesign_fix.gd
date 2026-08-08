extends "res://scripts/session_setup_redesign.gd"

# Final split-screen setup polish: real Thmanyah Sans hierarchy using distinct
# weights, while viewport resize only recomputes geometry and never rebuilds a
# question. The board remains centered in the lower half throughout setup.

const THMANYAH_LIGHT = preload("res://assets/fonts/thmanyahsans-Light.otf")
const THMANYAH_MEDIUM = preload("res://assets/fonts/thmanyahsans-Medium.otf")
const THMANYAH_BOLD = preload("res://assets/fonts/thmanyahsans-Bold.otf")


func _font_for_ui(size: int) -> Font:
	if size >= 22:
		return THMANYAH_BOLD
	if size <= 14:
		return THMANYAH_LIGHT
	return THMANYAH_MEDIUM


func _label(text_value: String, size: int, alignment: HorizontalAlignment, color: Color = Color.WHITE) -> Label:
	var label: Label = super._label(text_value, size, alignment, color)
	label.add_theme_font_override("font", _font_for_ui(size))
	return label


func _button(text_value: String, foreground: Color, background: Color) -> Button:
	var button: Button = super._button(text_value, foreground, background)
	button.add_theme_font_override("font", THMANYAH_MEDIUM)
	return button


func _big_choice(text_value: String) -> Button:
	var button: Button = super._big_choice(text_value)
	button.add_theme_font_override("font", THMANYAH_BOLD)
	return button


func _apply_picker_font(picker: OptionButton) -> void:
	super._apply_picker_font(picker)
	picker.add_theme_font_override("font", THMANYAH_MEDIUM)
	var menu: PopupMenu = picker.get_popup()
	menu.add_theme_font_override("font", THMANYAH_MEDIUM)


func _publish_setup_metrics() -> void:
	super._publish_setup_metrics()
	if OS.has_feature("web") and showing:
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakSetupFontWeights='light,medium,bold';" +
			"document.body.dataset.yakolakSetupFontFamily='thmanyah-sans';",
			true
		)


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
