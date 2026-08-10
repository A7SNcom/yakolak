extends "res://scripts/gameplay_rematch_lifecycle.gd"

# Design-system adapter for gameplay chrome: quick menu and online waiting UI.
const Design = preload("res://scripts/ui_design.gd")


func _ready() -> void:
	super._ready()
	_publish_design_contract()


func _build_quick_menu() -> void:
	super._build_quick_menu()
	if quick_button != null:
		quick_button.focus_mode = Control.FOCUS_ALL
		quick_button.custom_minimum_size = Vector2(_hud_length(Design.TOUCH_MIN), _hud_length(Design.TOUCH_MIN))
		quick_button.add_theme_font_override("font", Design.FONT_BOLD)
		quick_button.add_theme_stylebox_override(
			"focus",
			Design.button_style(_hud_length(1.0), Color(0.035, 0.055, 0.067, 0.94), "focus", true)
		)


func _quick_action(text_value: String) -> Button:
	var button := Button.new()
	button.text = text_value
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.custom_minimum_size = Vector2(_hud_length(142.0), _hud_length(Design.TOUCH_MIN))
	Design.apply_button_contract(
		button,
		_hud_length(1.0),
		_hud_font_size(15),
		Design.TEXT_PRIMARY,
		Color(1.0, 1.0, 1.0, 0.055),
		Design.FONT_MEDIUM
	)
	return button


func _quick_style(background: Color, radius_css: float) -> StyleBoxFlat:
	var radius: float = Design.RADIUS_CONTROL if radius_css <= 15.0 else Design.RADIUS_SURFACE
	var style: StyleBoxFlat = Design.surface_style(
		_hud_length(1.0),
		background.a,
		radius,
		Vector4(Design.SPACE_2, 7.0, Design.SPACE_2, 7.0),
		Design.SURFACE_BORDER,
		10.0,
		4.0
	)
	style.bg_color = background
	return style


func _quick_action_style(background: Color) -> StyleBoxFlat:
	return Design.button_style(_hud_length(1.0), background)


func _layout_quick_menu() -> void:
	super._layout_quick_menu()
	if quick_panel == null:
		return
	var action_count: int = 3 if quick_round_button != null and quick_round_button.visible else 2
	quick_panel.size.y = _hud_length(18.0 + float(action_count) * (Design.TOUCH_MIN + 7.0))


func _build_waiting_overlay() -> void:
	super._build_waiting_overlay()
	if waiting_card != null:
		waiting_card.layout_direction = Control.LAYOUT_DIRECTION_RTL
	if waiting_room_label != null:
		waiting_room_label.add_theme_font_override("font", Design.FONT_MEDIUM)
	if waiting_title_label != null:
		waiting_title_label.add_theme_font_override("font", Design.FONT_BOLD)
	if waiting_progress_label != null:
		waiting_progress_label.add_theme_font_override("font", Design.FONT_MEDIUM)
	if waiting_exit_button != null:
		waiting_exit_button.custom_minimum_size = Vector2(_hud_length(112.0), _hud_length(Design.TOUCH_MIN))
		Design.apply_button_contract(
			waiting_exit_button,
			_hud_length(1.0),
			_hud_font_size(Design.FONT_CAPTION),
			Design.TEXT_PRIMARY,
			Color(1.0, 1.0, 1.0, 0.07),
			Design.FONT_MEDIUM
		)


func _waiting_card_style() -> StyleBoxFlat:
	return Design.surface_style(
		_hud_length(1.0),
		0.94,
		Design.RADIUS_SURFACE,
		Vector4(Design.SPACE_4, Design.SPACE_3, Design.SPACE_4, Design.SPACE_3),
		Design.SURFACE_BORDER,
		12.0,
		4.0
	)


func _waiting_button_style(background: Color) -> StyleBoxFlat:
	return Design.button_style(_hud_length(1.0), background)


func _layout_waiting_overlay() -> void:
	super._layout_waiting_overlay()
	if waiting_card != null:
		waiting_card.size.y = _hud_length(182.0)
		waiting_card.add_theme_stylebox_override("panel", _waiting_card_style())


func _publish_design_contract() -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakDesignGameplay='tokens+primitives';" +
			"document.body.dataset.yakolakDesignGameplayTouchMin='48';",
			true
		)
