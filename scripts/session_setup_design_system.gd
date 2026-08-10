extends "res://scripts/session_setup_dialog_system.gd"

# Design-system adapter for the complete setup/dialog flow. New setup screens
# inherit these primitives automatically through the existing builders.
const Design = preload("res://scripts/ui_design.gd")


func _build_shell() -> void:
	super._build_shell()
	if root != null:
		root.add_theme_font_override("font", Design.FONT_REGULAR)
	_publish_design_contract()


func _font_for_ui(size: int) -> Font:
	return Design.font_for_size(size)


func _card_style() -> StyleBoxFlat:
	return Design.surface_style(
		_ui_length(1.0),
		0.90,
		Design.RADIUS_SURFACE,
		Vector4(Design.SPACE_1, Design.SPACE_1, Design.SPACE_1, Design.SPACE_1),
		Design.SURFACE_BORDER,
		12.0,
		4.0
	)


func _content_box() -> VBoxContainer:
	var content: VBoxContainer = super._content_box()
	var margin: float = _ui_length(Design.SPACE_4)
	content.offset_left = margin
	content.offset_top = margin
	content.offset_right = -margin
	content.offset_bottom = -margin
	content.add_theme_constant_override("separation", int(round(_ui_length(Design.SPACE_3))))
	return content


func _button(text_value: String, foreground: Color, background: Color) -> Button:
	var button: Button = super._button(text_value, foreground, background)
	Design.apply_button_contract(
		button,
		_ui_length(1.0),
		_ui_font_size(Design.FONT_BODY),
		foreground,
		background,
		Design.FONT_MEDIUM
	)
	return button


func _big_choice(text_value: String) -> Button:
	var button: Button = super._big_choice(text_value)
	button.add_theme_font_override("font", Design.FONT_BOLD)
	button.custom_minimum_size.y = maxf(button.custom_minimum_size.y, _ui_length(Design.TOUCH_MIN))
	return button


func _button_style(background: Color) -> StyleBoxFlat:
	return Design.button_style(_ui_length(1.0), background)


func _dialog_focus_button_style(background: Color) -> StyleBoxFlat:
	return Design.button_style(_ui_length(1.0), background, "focus", true)


func _close_style(background: Color, focused: bool) -> StyleBoxFlat:
	return Design.button_style(
		_ui_length(1.0),
		background,
		"focus" if focused else "normal",
		focused
	)


func _color_tile_style(value: Color, selected: bool, hover: bool, alpha: float = 1.0) -> StyleBoxFlat:
	var style: StyleBoxFlat = super._color_tile_style(value, selected, hover, alpha)
	style.set_corner_radius_all(int(round(_ui_length(Design.RADIUS_CONTROL))))
	if selected:
		style.shadow_size = int(round(_ui_length(Design.SPACE_2)))
	return style


func _apply_picker_font(picker: OptionButton) -> void:
	super._apply_picker_font(picker)
	picker.add_theme_font_override("font", Design.FONT_MEDIUM)
	picker.custom_minimum_size.y = maxf(picker.custom_minimum_size.y, _ui_length(Design.TOUCH_MIN))
	var menu: PopupMenu = picker.get_popup()
	menu.add_theme_font_override("font", Design.FONT_MEDIUM)


func _publish_setup_metrics() -> void:
	super._publish_setup_metrics()
	_publish_design_contract()


func _publish_design_contract() -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakDesignSystem='" + Design.VERSION + "';" +
			"document.body.dataset.yakolakDesignSetup='tokens+primitives';" +
			"document.body.dataset.yakolakDesignTouchMin='48';" +
			"document.body.dataset.yakolakDesignRadii='10,14,18';",
			true
		)
