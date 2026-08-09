extends "res://scripts/session_setup_redesign.gd"

# Final split-screen setup polish. The setup panel and the physical table now
# move as one composed transition instead of snapping to their setup positions.
# Content sizing is screen-aware, Arabic text direction is explicit, and UI
# symbols never depend on glyphs that may be absent from the Arabic font.

const THMANYAH_LIGHT = preload("res://assets/fonts/thmanyahsans-Light.otf")
const THMANYAH_MEDIUM = preload("res://assets/fonts/thmanyahsans-Medium.otf")
const THMANYAH_BOLD = preload("res://assets/fonts/thmanyahsans-Bold.otf")

const PANEL_ENTER_SECONDS := 0.46
const TABLE_ENTER_SECONDS := 0.72
const TABLE_EXIT_SECONDS := 0.48

var setup_camera_tween: Tween
var setup_panel_tween: Tween
var fit_pending: bool = false
var entry_played_for_show: bool = false


func _ready() -> void:
	super._ready()
	if root != null:
		root.layout_direction = Control.LAYOUT_DIRECTION_RTL


func _font_for_ui(size: int) -> Font:
	if size >= 22:
		return THMANYAH_BOLD
	if size <= 14:
		return THMANYAH_LIGHT
	return THMANYAH_MEDIUM


func _label(text_value: String, size: int, alignment: HorizontalAlignment, color: Color = Color.WHITE) -> Label:
	var label: Label = super._label(text_value, size, alignment, color)
	label.add_theme_font_override("font", _font_for_ui(size))
	label.layout_direction = Control.LAYOUT_DIRECTION_RTL
	label.text_direction = Control.TEXT_DIRECTION_RTL
	label.language = "ar"
	return label


func _button(text_value: String, foreground: Color, background: Color) -> Button:
	var safe_text: String = _safe_ui_text(text_value)
	var button: Button = super._button(safe_text, foreground, background)
	button.add_theme_font_override("font", THMANYAH_MEDIUM)
	button.layout_direction = Control.LAYOUT_DIRECTION_RTL
	button.text_direction = Control.TEXT_DIRECTION_RTL
	button.language = "ar"
	button.alignment = HORIZONTAL_ALIGNMENT_CENTER
	return button


func _big_choice(text_value: String) -> Button:
	var button: Button = super._big_choice(_safe_ui_text(text_value))
	button.add_theme_font_override("font", THMANYAH_BOLD)
	button.text_direction = Control.TEXT_DIRECTION_RTL
	button.language = "ar"
	return button


func _apply_picker_font(picker: OptionButton) -> void:
	super._apply_picker_font(picker)
	picker.add_theme_font_override("font", THMANYAH_MEDIUM)
	picker.layout_direction = Control.LAYOUT_DIRECTION_RTL
	picker.text_direction = Control.TEXT_DIRECTION_RTL
	picker.language = "ar"
	var menu: PopupMenu = picker.get_popup()
	menu.add_theme_font_override("font", THMANYAH_MEDIUM)
	menu.layout_direction = Control.LAYOUT_DIRECTION_RTL


func _safe_ui_text(value: String) -> String:
	# These decorative glyphs were previously rendered by the Arabic UI font.
	# Use plain text equivalents so missing-glyph boxes can never appear.
	return value.replace("…", "...").replace("←", "رجوع").replace("→", "رجوع")


func _preferred_width_css() -> float:
	if active_screen == "question":
		return 440.0
	if active_screen == "invitation":
		return 460.0
	if active_screen == "setup":
		match wizard_step:
			"color": return 560.0
			"count": return 420.0
			"rounds": return 420.0
			_:
				if wizard_step.begins_with("mode:"):
					return 520.0
	return 480.0


func _estimated_height_css(width_css: float) -> float:
	if active_screen == "question":
		return 176.0
	if active_screen == "invitation":
		return 214.0 if online_error_text.is_empty() else 246.0
	if active_screen == "setup":
		match wizard_step:
			"color": return 286.0 if width_css < 430.0 else 238.0
			"count": return 178.0
			"rounds": return 178.0
			_:
				if wizard_step.begins_with("mode:"):
					return 190.0
	return 206.0


func _layout_card() -> void:
	if root == null or card == null:
		return
	var viewport: Vector2 = get_viewport().get_visible_rect().size
	var metrics := _canvas_metrics(viewport)
	canvas_scale = float(metrics["scale"])
	canvas_css_size = metrics["css_size"] as Vector2

	var preferred_width: float = _preferred_width_css()
	var width_css: float = minf(preferred_width, maxf(280.0, canvas_css_size.x - 24.0))
	var width: float = minf(viewport.x - _ui_length(12.0), width_css / canvas_scale)
	var upper_height: float = viewport.y * 0.47
	var max_height: float = maxf(_ui_length(148.0), upper_height - _ui_length(10.0))
	var requested_height_css: float = _estimated_height_css(width_css)
	var height: float = minf(requested_height_css / canvas_scale, max_height)
	var y: float = maxf(_ui_length(6.0), (upper_height - height) * 0.5)
	card.position = Vector2(maxf(0.0, (viewport.x - width) * 0.5), y)
	card.size = Vector2(width, height)
	card.add_theme_stylebox_override("panel", _card_style())
	card.pivot_offset = card.size * 0.5

	if not fit_pending and body != null and body.get_child_count() > 0:
		fit_pending = true
		call_deferred("_fit_card_to_content")
	if showing:
		call_deferred("_apply_split_framing")


func _fit_card_to_content() -> void:
	fit_pending = false
	if card == null or body == null or body.get_child_count() == 0:
		return
	var content := body.get_child(0) as Control
	if content == null:
		return
	var viewport: Vector2 = get_viewport().get_visible_rect().size
	var upper_height: float = viewport.y * 0.47
	var max_height: float = maxf(_ui_length(148.0), upper_height - _ui_length(10.0))
	var minimum: Vector2 = content.get_combined_minimum_size()
	var content_height: float = minimum.y + _ui_length(24.0)
	var estimated: float = _estimated_height_css(card.size.x * canvas_scale) / canvas_scale
	var desired: float = clampf(maxf(content_height, estimated), _ui_length(148.0), max_height)
	if absf(card.size.y - desired) < _ui_length(2.0):
		return
	var y: float = maxf(_ui_length(6.0), (upper_height - desired) * 0.5)
	card.position.y = y
	card.size.y = desired
	card.pivot_offset = card.size * 0.5
	if showing:
		_publish_setup_metrics.call_deferred()


func _wizard_header(title: String) -> Control:
	var row := HBoxContainer.new()
	row.layout_direction = Control.LAYOUT_DIRECTION_RTL
	row.add_theme_constant_override("separation", int(round(_ui_length(8.0))))
	var heading := _label(title, 24, HORIZONTAL_ALIGNMENT_RIGHT)
	heading.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(heading)
	var back := _button("رجوع", Color("#eef4f3"), Color(0.10, 0.15, 0.17, 0.72))
	back.custom_minimum_size = Vector2(_ui_length(72.0), _ui_length(42.0))
	back.size_flags_horizontal = Control.SIZE_SHRINK_END
	back.pressed.connect(_wizard_back)
	row.add_child(back)
	return row


func _apply_split_framing() -> void:
	if not showing or intro == null:
		return
	var preintro: Node = intro.get_node_or_null("StarToTablePreIntro")
	if preintro != null and not bool(preintro.get("completed")):
		return
	if bool(intro.get("playing")):
		return
	_frame_table_for_setup(true)
	_publish_setup_metrics()


func _solve_setup_camera_offset(cam: Camera3D) -> float:
	var viewport: Vector2 = get_viewport().get_visible_rect().size
	if viewport.y <= 1.0:
		return cam.v_offset
	var board_center: Vector3 = intro.to_global(Vector3(0.0, 0.35, 0.0))
	var current: float = cam.v_offset
	cam.v_offset = setup_camera_original_v_offset
	var y0: float = cam.unproject_position(board_center).y
	cam.v_offset = setup_camera_original_v_offset + 1.0
	var y1: float = cam.unproject_position(board_center).y
	cam.v_offset = current
	var delta: float = y1 - y0
	if absf(delta) <= 0.01:
		return current
	var target_y: float = viewport.y * 0.72
	var solved: float = setup_camera_original_v_offset + (target_y - y0) / delta
	return clampf(solved, setup_camera_original_v_offset - 24.0, setup_camera_original_v_offset + 24.0)


func _frame_table_for_setup(active: bool) -> void:
	if intro == null:
		return
	var cam := intro.get("camera") as Camera3D
	if cam == null:
		return

	if setup_camera_tween != null and setup_camera_tween.is_valid():
		setup_camera_tween.kill()

	if active:
		if not setup_camera_offset_captured:
			setup_camera_original_v_offset = cam.v_offset
			setup_camera_offset_captured = true
		var solved: float = _solve_setup_camera_offset(cam)
		if OS.has_feature("web"):
			# A finite value means the setup framing is actually settled. Do not
			# publish the pre-tween camera position: browser tests and diagnostics
			# would otherwise race the table motion and sample a transient frame.
			JavaScriptBridge.eval("delete document.body.dataset.yakolakBoardSetupYRatio;", true)
		if absf(cam.v_offset - solved) > 0.01:
			setup_camera_tween = create_tween()
			setup_camera_tween.set_trans(Tween.TRANS_QUINT).set_ease(Tween.EASE_OUT)
			setup_camera_tween.tween_property(cam, "v_offset", solved, TABLE_ENTER_SECONDS)
			setup_camera_tween.tween_callback(Callable(self, "_publish_board_setup_y_ratio"))
		else:
			_publish_board_setup_y_ratio()
		return

	if not setup_camera_offset_captured:
		return
	setup_camera_tween = create_tween()
	setup_camera_tween.set_trans(Tween.TRANS_QUART).set_ease(Tween.EASE_IN_OUT)
	setup_camera_tween.tween_property(cam, "v_offset", setup_camera_original_v_offset, TABLE_EXIT_SECONDS)
	setup_camera_tween.tween_callback(Callable(self, "_release_setup_camera_capture"))


func _publish_board_setup_y_ratio() -> void:
	if not OS.has_feature("web") or intro == null or not showing:
		return
	var cam := intro.get("camera") as Camera3D
	if cam == null:
		return
	var viewport: Vector2 = get_viewport().get_visible_rect().size
	var board_center: Vector3 = intro.to_global(Vector3(0.0, 0.35, 0.0))
	var actual_y: float = cam.unproject_position(board_center).y
	JavaScriptBridge.eval("document.body.dataset.yakolakBoardSetupYRatio='%.4f';" % (actual_y / maxf(viewport.y, 1.0)), true)


func _release_setup_camera_capture() -> void:
	setup_camera_offset_captured = false
	if OS.has_feature("web"):
		JavaScriptBridge.eval("delete document.body.dataset.yakolakBoardSetupYRatio;", true)


func animate_setup_entry() -> void:
	if not showing or root == null or card == null:
		return
	if entry_played_for_show:
		return
	entry_played_for_show = true
	if setup_panel_tween != null and setup_panel_tween.is_valid():
		setup_panel_tween.kill()
	var target_position: Vector2 = card.position
	root.modulate = Color(1.0, 1.0, 1.0, 0.0)
	card.position = target_position + Vector2(0.0, -_ui_length(10.0))
	card.scale = Vector2(0.985, 0.985)
	setup_panel_tween = create_tween()
	setup_panel_tween.set_parallel(true)
	setup_panel_tween.tween_property(root, "modulate", Color.WHITE, PANEL_ENTER_SECONDS).set_trans(Tween.TRANS_QUINT).set_ease(Tween.EASE_OUT)
	setup_panel_tween.tween_property(card, "position", target_position, PANEL_ENTER_SECONDS).set_trans(Tween.TRANS_QUINT).set_ease(Tween.EASE_OUT)
	setup_panel_tween.tween_property(card, "scale", Vector2.ONE, PANEL_ENTER_SECONDS).set_trans(Tween.TRANS_QUINT).set_ease(Tween.EASE_OUT)


func _publish_setup_metrics() -> void:
	super._publish_setup_metrics()
	if OS.has_feature("web") and showing:
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakSetupFontWeights='light,medium,bold';" +
			"document.body.dataset.yakolakSetupFontFamily='thmanyah-sans';" +
			"document.body.dataset.yakolakSetupMotion='soft-panel-and-table-v2';" +
			"document.body.dataset.yakolakSetupDirection='rtl';",
			true
		)


func reset_for_intro() -> void:
	entry_played_for_show = false
	if setup_panel_tween != null and setup_panel_tween.is_valid():
		setup_panel_tween.kill()
	if root != null:
		root.modulate = Color.WHITE
	if card != null:
		card.scale = Vector2.ONE
	super.reset_for_intro()
