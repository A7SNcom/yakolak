extends "res://scripts/session_setup_redesign.gd"

# Final split-screen setup polish. The setup panel and the physical table move
# as one composed transition. Layout is safe-area aware and switches to a side
# composition on short landscape screens so content never gets crushed into the
# upper 47% of the viewport.

const THMANYAH_LIGHT = preload("res://assets/fonts/thmanyahsans-Light.otf")
const THMANYAH_MEDIUM = preload("res://assets/fonts/thmanyahsans-Medium.otf")
const THMANYAH_BOLD = preload("res://assets/fonts/thmanyahsans-Bold.otf")

const PANEL_ENTER_SECONDS := 0.46
const TABLE_ENTER_SECONDS := 0.72
const TABLE_EXIT_SECONDS := 0.48
const SAFE_GUTTER_CSS := 6.0
const SHORT_LANDSCAPE_HEIGHT_CSS := 520.0
const MIN_TOUCH_TARGET_CSS := 48.0

var setup_camera_tween: Tween
var setup_panel_tween: Tween
var fit_pending: bool = false
var entry_played_for_show: bool = false
var setup_camera_original_h_offset: float = 0.0


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
	button.custom_minimum_size.y = maxf(button.custom_minimum_size.y, _ui_length(MIN_TOUCH_TARGET_CSS))
	return button


func _big_choice(text_value: String) -> Button:
	var button: Button = super._big_choice(_safe_ui_text(text_value))
	button.add_theme_font_override("font", THMANYAH_BOLD)
	button.text_direction = Control.TEXT_DIRECTION_RTL
	button.language = "ar"
	button.custom_minimum_size.y = maxf(button.custom_minimum_size.y, _ui_length(MIN_TOUCH_TARGET_CSS))
	return button


func _apply_picker_font(picker: OptionButton) -> void:
	super._apply_picker_font(picker)
	picker.add_theme_font_override("font", THMANYAH_MEDIUM)
	picker.layout_direction = Control.LAYOUT_DIRECTION_RTL
	picker.text_direction = Control.TEXT_DIRECTION_RTL
	picker.language = "ar"
	picker.custom_minimum_size.y = maxf(picker.custom_minimum_size.y, _ui_length(MIN_TOUCH_TARGET_CSS))
	var menu: PopupMenu = picker.get_popup()
	menu.add_theme_font_override("font", THMANYAH_MEDIUM)
	menu.layout_direction = Control.LAYOUT_DIRECTION_RTL


func _safe_ui_text(value: String) -> String:
	# Decorative glyphs must not depend on Arabic font coverage.
	return value.replace("…", "...").replace("←", "رجوع").replace("→", "رجوع")


func _preferred_width_css() -> float:
	if active_screen == "room_entry":
		return 500.0
	if active_screen == "join_room":
		return 460.0
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
	if active_screen == "room_entry":
		return 226.0
	if active_screen == "join_room":
		return 238.0
	if active_screen == "question":
		return 190.0
	if active_screen == "invitation":
		return 214.0 if online_error_text.is_empty() else 246.0
	if active_screen == "setup":
		match wizard_step:
			"color": return 274.0 if width_css < 430.0 else 238.0
			"count": return 178.0
			"rounds": return 178.0
			_:
				if wizard_step.begins_with("mode:"):
					return 190.0
	return 206.0


func _safe_area_css() -> Vector4:
	if not OS.has_feature("web"):
		return Vector4.ZERO
	var raw: Variant = JavaScriptBridge.eval(
		"JSON.stringify((()=>{let e=document.getElementById('__yakolak_safe_probe');if(!e){e=document.createElement('div');e.id='__yakolak_safe_probe';e.style.cssText='position:fixed;visibility:hidden;pointer-events:none;padding-left:env(safe-area-inset-left);padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);padding-bottom:env(safe-area-inset-bottom)';document.body.appendChild(e)}const s=getComputedStyle(e);return{l:parseFloat(s.paddingLeft)||0,t:parseFloat(s.paddingTop)||0,r:parseFloat(s.paddingRight)||0,b:parseFloat(s.paddingBottom)||0}})())",
		true
	)
	var decoded: Variant = JSON.parse_string(str(raw))
	if decoded is Dictionary:
		var values: Dictionary = decoded as Dictionary
		return Vector4(
			float(values.get("l", 0.0)),
			float(values.get("t", 0.0)),
			float(values.get("r", 0.0)),
			float(values.get("b", 0.0))
		)
	return Vector4.ZERO


func _is_short_landscape() -> bool:
	return canvas_css_size.x > canvas_css_size.y and canvas_css_size.y < SHORT_LANDSCAPE_HEIGHT_CSS


func _layout_region(viewport: Vector2) -> Rect2:
	var safe: Vector4 = _safe_area_css()
	var left: float = _ui_length(safe.x + SAFE_GUTTER_CSS)
	var top: float = _ui_length(safe.y + SAFE_GUTTER_CSS)
	var right: float = viewport.x - _ui_length(safe.z + SAFE_GUTTER_CSS)
	var bottom: float = viewport.y - _ui_length(safe.w + SAFE_GUTTER_CSS)
	var available_width: float = maxf(_ui_length(120.0), right - left)
	var available_height: float = maxf(_ui_length(120.0), bottom - top)
	if _is_short_landscape():
		return Rect2(Vector2(left, top), Vector2(available_width, available_height))
	var split_bottom: float = minf(bottom, viewport.y * 0.47)
	var split_height: float = maxf(_ui_length(148.0), split_bottom - top)
	return Rect2(Vector2(left, top), Vector2(available_width, minf(split_height, available_height)))


func _layout_card() -> void:
	if root == null or card == null:
		return
	var viewport: Vector2 = get_viewport().get_visible_rect().size
	var metrics := _canvas_metrics(viewport)
	canvas_scale = float(metrics["scale"])
	canvas_css_size = metrics["css_size"] as Vector2
	var region: Rect2 = _layout_region(viewport)

	var preferred_width: float = _preferred_width_css()
	var region_width_css: float = region.size.x * canvas_scale
	var width_css: float = minf(preferred_width, region_width_css)
	if _is_short_landscape():
		var side_width_css: float = clampf(region_width_css * 0.62, 300.0, 430.0)
		width_css = minf(preferred_width, minf(region_width_css, side_width_css))
	else:
		width_css = minf(width_css, maxf(280.0, canvas_css_size.x - 24.0))

	var width: float = minf(region.size.x, width_css / canvas_scale)
	var requested_height_css: float = _estimated_height_css(width_css)
	var height: float = minf(requested_height_css / canvas_scale, region.size.y)
	var x: float = region.position.x + (region.size.x - width) * 0.5
	if _is_short_landscape():
		# Arabic composition: controls occupy the right side, physical board gets
		# a real left-side viewport rather than being hidden below a clipped card.
		x = region.position.x + region.size.x - width
	var y: float = region.position.y + maxf(0.0, (region.size.y - height) * 0.5)
	card.position = Vector2(x, y)
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
	var region: Rect2 = _layout_region(viewport)
	var minimum: Vector2 = content.get_combined_minimum_size()
	var content_height: float = minimum.y + _ui_length(24.0)
	var estimated: float = _estimated_height_css(card.size.x * canvas_scale) / canvas_scale
	var desired: float = clampf(maxf(content_height, estimated), _ui_length(148.0), region.size.y)
	if absf(card.size.y - desired) < _ui_length(2.0):
		_publish_setup_metrics.call_deferred()
		return
	card.position.y = region.position.y + maxf(0.0, (region.size.y - desired) * 0.5)
	card.size.y = desired
	card.pivot_offset = card.size * 0.5
	if showing:
		_publish_setup_metrics.call_deferred()
		call_deferred("_apply_split_framing")


func _wizard_header(title: String) -> Control:
	var row := HBoxContainer.new()
	row.layout_direction = Control.LAYOUT_DIRECTION_RTL
	row.add_theme_constant_override("separation", int(round(_ui_length(8.0))))
	var heading := _label(title, 24, HORIZONTAL_ALIGNMENT_RIGHT)
	heading.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(heading)
	var back := _button("رجوع", Color("#eef4f3"), Color(0.10, 0.15, 0.17, 0.72))
	back.custom_minimum_size = Vector2(_ui_length(72.0), _ui_length(MIN_TOUCH_TARGET_CSS))
	back.size_flags_horizontal = Control.SIZE_SHRINK_END
	back.pressed.connect(_wizard_back)
	row.add_child(back)
	return row


func _color_choice_button(color_id: String, value: Color, selected: bool, enabled: bool) -> Button:
	var button: Button = super._color_choice_button(color_id, value, selected, enabled)
	if _is_short_landscape():
		button.custom_minimum_size = Vector2(_ui_length(76.0), _ui_length(62.0))
	return button


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


func _solve_setup_camera_v_offset(cam: Camera3D) -> float:
	if _is_short_landscape():
		return setup_camera_original_v_offset
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


func _solve_setup_camera_h_offset(cam: Camera3D) -> float:
	if not _is_short_landscape():
		return setup_camera_original_h_offset
	var viewport: Vector2 = get_viewport().get_visible_rect().size
	if viewport.x <= 1.0:
		return cam.h_offset
	var board_center: Vector3 = intro.to_global(Vector3(0.0, 0.35, 0.0))
	var current: float = cam.h_offset
	cam.h_offset = setup_camera_original_h_offset
	var x0: float = cam.unproject_position(board_center).x
	cam.h_offset = setup_camera_original_h_offset + 1.0
	var x1: float = cam.unproject_position(board_center).x
	cam.h_offset = current
	var delta: float = x1 - x0
	if absf(delta) <= 0.01:
		return current
	var region: Rect2 = _layout_region(viewport)
	var free_left_width: float = maxf(_ui_length(90.0), card.position.x - region.position.x)
	var target_x: float = region.position.x + free_left_width * 0.50
	var solved: float = setup_camera_original_h_offset + (target_x - x0) / delta
	return clampf(solved, setup_camera_original_h_offset - 24.0, setup_camera_original_h_offset + 24.0)


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
			setup_camera_original_h_offset = cam.h_offset
			setup_camera_offset_captured = true
		var solved_v: float = _solve_setup_camera_v_offset(cam)
		var solved_h: float = _solve_setup_camera_h_offset(cam)
		if OS.has_feature("web"):
			JavaScriptBridge.eval("delete document.body.dataset.yakolakBoardSetupYRatio;delete document.body.dataset.yakolakBoardSetupXRatio;", true)
		if absf(cam.v_offset - solved_v) > 0.01 or absf(cam.h_offset - solved_h) > 0.01:
			setup_camera_tween = create_tween()
			setup_camera_tween.set_parallel(true)
			setup_camera_tween.tween_property(cam, "v_offset", solved_v, TABLE_ENTER_SECONDS).set_trans(Tween.TRANS_QUINT).set_ease(Tween.EASE_OUT)
			setup_camera_tween.tween_property(cam, "h_offset", solved_h, TABLE_ENTER_SECONDS).set_trans(Tween.TRANS_QUINT).set_ease(Tween.EASE_OUT)
			setup_camera_tween.chain().tween_callback(Callable(self, "_publish_board_setup_ratios"))
		else:
			_publish_board_setup_ratios()
		return

	if not setup_camera_offset_captured:
		return
	setup_camera_tween = create_tween()
	setup_camera_tween.set_parallel(true)
	setup_camera_tween.tween_property(cam, "v_offset", setup_camera_original_v_offset, TABLE_EXIT_SECONDS).set_trans(Tween.TRANS_QUART).set_ease(Tween.EASE_IN_OUT)
	setup_camera_tween.tween_property(cam, "h_offset", setup_camera_original_h_offset, TABLE_EXIT_SECONDS).set_trans(Tween.TRANS_QUART).set_ease(Tween.EASE_IN_OUT)
	setup_camera_tween.chain().tween_callback(Callable(self, "_release_setup_camera_capture"))


func _publish_board_setup_ratios() -> void:
	if not OS.has_feature("web") or intro == null or not showing:
		return
	var cam := intro.get("camera") as Camera3D
	if cam == null:
		return
	var viewport: Vector2 = get_viewport().get_visible_rect().size
	var board_center: Vector3 = intro.to_global(Vector3(0.0, 0.35, 0.0))
	var actual: Vector2 = cam.unproject_position(board_center)
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakBoardSetupXRatio='%.4f';" % (actual.x / maxf(viewport.x, 1.0)) +
		"document.body.dataset.yakolakBoardSetupYRatio='%.4f';" % (actual.y / maxf(viewport.y, 1.0)),
		true
	)


func _release_setup_camera_capture() -> void:
	setup_camera_offset_captured = false
	if OS.has_feature("web"):
		JavaScriptBridge.eval("delete document.body.dataset.yakolakBoardSetupYRatio;delete document.body.dataset.yakolakBoardSetupXRatio;", true)


func animate_setup_entry() -> void:
	if not showing or root == null or card == null:
		return
	if entry_played_for_show:
		return
	entry_played_for_show = true
	if setup_panel_tween != null and setup_panel_tween.is_valid():
		setup_panel_tween.kill()
	var target_position: Vector2 = card.position
	var enter_offset := Vector2(0.0, -_ui_length(10.0))
	if _is_short_landscape():
		enter_offset = Vector2(_ui_length(12.0), 0.0)
	root.modulate = Color(1.0, 1.0, 1.0, 0.0)
	card.position = target_position + enter_offset
	card.scale = Vector2(0.985, 0.985)
	setup_panel_tween = create_tween()
	setup_panel_tween.set_parallel(true)
	setup_panel_tween.tween_property(root, "modulate", Color.WHITE, PANEL_ENTER_SECONDS).set_trans(Tween.TRANS_QUINT).set_ease(Tween.EASE_OUT)
	setup_panel_tween.tween_property(card, "position", target_position, PANEL_ENTER_SECONDS).set_trans(Tween.TRANS_QUINT).set_ease(Tween.EASE_OUT)
	setup_panel_tween.tween_property(card, "scale", Vector2.ONE, PANEL_ENTER_SECONDS).set_trans(Tween.TRANS_QUINT).set_ease(Tween.EASE_OUT)


func _publish_setup_metrics() -> void:
	super._publish_setup_metrics()
	if not OS.has_feature("web") or not showing or card == null:
		return
	var viewport: Vector2 = get_viewport().get_visible_rect().size
	var safe: Vector4 = _safe_area_css()
	var left_ratio: float = card.position.x / maxf(viewport.x, 1.0)
	var top_ratio: float = card.position.y / maxf(viewport.y, 1.0)
	var right_ratio: float = (card.position.x + card.size.x) / maxf(viewport.x, 1.0)
	var bottom_ratio: float = (card.position.y + card.size.y) / maxf(viewport.y, 1.0)
	var mode: String = "landscape-side" if _is_short_landscape() else "portrait-stack"
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakSetupFontWeights='light,medium,bold';" +
		"document.body.dataset.yakolakSetupFontFamily='thmanyah-sans';" +
		"document.body.dataset.yakolakSetupMotion='soft-panel-and-table-v3';" +
		"document.body.dataset.yakolakSetupDirection='rtl';" +
		"document.body.dataset.yakolakSetupLayoutMode='" + mode + "';" +
		"document.body.dataset.yakolakSetupTouchMin='48';" +
		"document.body.dataset.yakolakSetupCardLeftRatio='%.4f';" % left_ratio +
		"document.body.dataset.yakolakSetupCardTopRatio='%.4f';" % top_ratio +
		"document.body.dataset.yakolakSetupCardRightRatio='%.4f';" % right_ratio +
		"document.body.dataset.yakolakSetupCardBottomRatio='%.4f';" % bottom_ratio +
		"document.body.dataset.yakolakSafeLeft='%.2f';" % safe.x +
		"document.body.dataset.yakolakSafeTop='%.2f';" % safe.y +
		"document.body.dataset.yakolakSafeRight='%.2f';" % safe.z +
		"document.body.dataset.yakolakSafeBottom='%.2f';" % safe.w,
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
