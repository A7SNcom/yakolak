extends "res://scripts/session_setup_dialog_system.gd"

# Design-system adapter for the complete setup/dialog flow. Setup should feel
# like a game prompt floating above the table, not a conventional app modal.
const Design = preload("res://scripts/ui_design.gd")


func _build_shell() -> void:
	super._build_shell()
	if root != null:
		root.add_theme_font_override("font", Design.FONT_REGULAR)
	if dialog_backdrop != null:
		# Keep the 3D world perceptually present while still isolating the prompt.
		dialog_backdrop.color = Color(0.012, 0.017, 0.020, 0.22)
	_publish_design_contract()


func _font_for_ui(size: int) -> Font:
	return Design.font_for_size(size)


func _label(text_value: String, size: int, alignment: HorizontalAlignment, color: Color = Color.WHITE) -> Label:
	# Arabic copy reads as one clear block from the physical right edge. Godot
	# mirrors Label alignment when the Control itself inherits RTL layout, so the
	# label box stays LTR while text shaping remains explicitly RTL.
	var resolved_alignment: HorizontalAlignment = HORIZONTAL_ALIGNMENT_RIGHT if alignment == HORIZONTAL_ALIGNMENT_CENTER else alignment
	var label: Label = super._label(text_value, size, resolved_alignment, color)
	label.layout_direction = Control.LAYOUT_DIRECTION_LTR
	label.text_direction = Control.TEXT_DIRECTION_RTL
	label.horizontal_alignment = resolved_alignment
	if size >= 22:
		label.add_theme_font_override("font", Design.FONT_BOLD)
		label.add_theme_font_size_override("font_size", _ui_font_size(maxi(size, Design.FONT_TITLE)))
		label.add_theme_color_override("font_color", Design.TEXT_PRIMARY)
	return label


func _card_style() -> StyleBoxFlat:
	return Design.surface_style(
		_ui_length(1.0),
		0.82,
		Design.RADIUS_SURFACE,
		Vector4(Design.SPACE_1, Design.SPACE_1, Design.SPACE_1, Design.SPACE_1),
		Color(1.0, 1.0, 1.0, 0.0),
		16.0,
		6.0
	)


func _content_box() -> VBoxContainer:
	var content: VBoxContainer = super._content_box()
	var margin: float = _ui_length(Design.SPACE_4)
	content.offset_left = margin
	content.offset_top = margin
	content.offset_right = -margin
	content.offset_bottom = -margin
	content.add_theme_constant_override("separation", int(round(_ui_length(Design.SPACE_4))))
	return content


func _button(text_value: String, foreground: Color, background: Color) -> Button:
	var button: Button = super._button(text_value, foreground, background)
	var luma: float = background.r * 0.2126 + background.g * 0.7152 + background.b * 0.0722
	var action_font: Font = Design.FONT_BOLD if background.a >= 0.75 and luma >= 0.62 else Design.FONT_MEDIUM
	Design.apply_button_contract(
		button,
		_ui_length(1.0),
		_ui_font_size(Design.FONT_BODY),
		foreground,
		background,
		action_font
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
	# The close control remains a full 48px target, but loses the permanent
	# outlined square. Hover/focus still reveal its interactive hit area.
	var close_background := Color(1.0, 1.0, 1.0, 0.0)
	if focused:
		close_background = Color(1.0, 1.0, 1.0, 0.08)
	elif background.a >= 0.80:
		close_background = Color(1.0, 1.0, 1.0, 0.055)
	return Design.button_style(
		_ui_length(1.0),
		close_background,
		"focus" if focused else "normal",
		focused,
		Design.RADIUS_CHIP
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
			"document.body.dataset.yakolakDesignSetup='game-layered-hierarchy';" +
			"document.body.dataset.yakolakDesignTouchMin='48';" +
			"document.body.dataset.yakolakDesignRadii='10,14,18';" +
			"document.body.dataset.yakolakVisualHierarchy='board-first+one-primary+rtl-copy';",
			true
		)
