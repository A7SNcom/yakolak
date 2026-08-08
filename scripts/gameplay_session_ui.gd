extends "res://scripts/gameplay_session_camera_safe.gd"

# Gameplay presentation layer: Thmanyah typography plus a tiny always-available
# floating menu that never competes with the board for screen space.

const THMANYAH_FONT = preload("res://assets/fonts/thmanyahsans-Regular.otf")

var quick_layer: CanvasLayer
var quick_root: Control
var quick_button: Button
var quick_panel: PanelContainer
var quick_sound_button: Button
var quick_pointer_block_until: int = 0


func _ready() -> void:
	super._ready()
	_apply_thmanyah_to_hud()
	_build_quick_menu()
	_layout_hud()
	_sync_quick_menu()


func _process(delta: float) -> void:
	super._process(delta)
	_sync_quick_menu()


func _input(event: InputEvent) -> void:
	var pressed: bool = false
	var position: Vector2 = Vector2.ZERO
	if event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		pressed = touch.pressed
		position = touch.position
	elif event is InputEventMouseButton:
		var mouse := event as InputEventMouseButton
		pressed = mouse.pressed and mouse.button_index == MOUSE_BUTTON_LEFT
		position = mouse.position
	if pressed and quick_button != null and quick_button.visible:
		if Time.get_ticks_msec() < quick_pointer_block_until:
			get_viewport().set_input_as_handled()
			return
		if quick_button.get_global_rect().has_point(position):
			return
		if quick_panel != null and quick_panel.visible:
			if quick_panel.get_global_rect().has_point(position):
				return
			quick_panel.visible = false
			quick_pointer_block_until = Time.get_ticks_msec() + 280
			get_viewport().set_input_as_handled()
			return
	super._input(event)


func _apply_thmanyah_to_hud() -> void:
	for control: Control in [turn_label, score_label, result_button]:
		if control != null:
			control.add_theme_font_override("font", THMANYAH_FONT)


func _build_quick_menu() -> void:
	quick_layer = CanvasLayer.new()
	quick_layer.layer = 30
	add_child(quick_layer)

	quick_root = Control.new()
	quick_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	quick_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	quick_layer.add_child(quick_root)

	quick_button = Button.new()
	quick_button.text = "•••"
	quick_button.focus_mode = Control.FOCUS_NONE
	quick_button.add_theme_font_override("font", THMANYAH_FONT)
	quick_button.add_theme_font_size_override("font_size", _hud_font_size(17))
	quick_button.add_theme_color_override("font_color", Color("#f4f7f6"))
	quick_button.add_theme_color_override("font_hover_color", Color.WHITE)
	quick_button.add_theme_stylebox_override("normal", _quick_style(Color(0.035, 0.055, 0.067, 0.86), 15.0))
	quick_button.add_theme_stylebox_override("hover", _quick_style(Color(0.055, 0.085, 0.096, 0.94), 15.0))
	quick_button.add_theme_stylebox_override("pressed", _quick_style(Color(0.025, 0.045, 0.055, 0.96), 15.0))
	quick_button.pressed.connect(_toggle_quick_menu)
	quick_root.add_child(quick_button)

	quick_panel = PanelContainer.new()
	quick_panel.add_theme_stylebox_override("panel", _quick_style(Color(0.035, 0.055, 0.067, 0.94), 17.0))
	quick_panel.visible = false
	quick_root.add_child(quick_panel)

	var menu := VBoxContainer.new()
	menu.add_theme_constant_override("separation", int(round(_hud_length(7.0))))
	quick_panel.add_child(menu)

	quick_sound_button = _quick_action("الصوت")
	quick_sound_button.pressed.connect(_toggle_sound)
	menu.add_child(quick_sound_button)
	var exit := _quick_action("خروج")
	exit.pressed.connect(_quick_exit)
	menu.add_child(exit)
	_layout_quick_menu()


func _quick_action(text_value: String) -> Button:
	var button := Button.new()
	button.text = text_value
	button.layout_direction = Control.LAYOUT_DIRECTION_RTL
	button.focus_mode = Control.FOCUS_NONE
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.custom_minimum_size = Vector2(_hud_length(142.0), _hud_length(44.0))
	button.add_theme_font_override("font", THMANYAH_FONT)
	button.add_theme_font_size_override("font_size", _hud_font_size(15))
	button.add_theme_color_override("font_color", Color("#f4f7f6"))
	button.add_theme_color_override("font_hover_color", Color.WHITE)
	button.add_theme_stylebox_override("normal", _quick_action_style(Color(1.0, 1.0, 1.0, 0.055)))
	button.add_theme_stylebox_override("hover", _quick_action_style(Color(1.0, 1.0, 1.0, 0.11)))
	button.add_theme_stylebox_override("pressed", _quick_action_style(Color(1.0, 1.0, 1.0, 0.07)))
	return button


func _quick_style(background: Color, radius_css: float) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.border_color = Color(0.85, 0.94, 0.95, 0.20)
	style.set_border_width_all(1)
	style.set_corner_radius_all(int(round(_hud_length(radius_css))))
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.30)
	style.shadow_size = int(round(_hud_length(10.0)))
	style.shadow_offset = Vector2(0.0, _hud_length(4.0))
	style.content_margin_left = _hud_length(8.0)
	style.content_margin_right = _hud_length(8.0)
	style.content_margin_top = _hud_length(7.0)
	style.content_margin_bottom = _hud_length(7.0)
	return style


func _quick_action_style(background: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.set_corner_radius_all(int(round(_hud_length(11.0))))
	return style


func _layout_hud() -> void:
	super._layout_hud()
	if turn_label != null:
		turn_label.offset_left = _hud_length(70.0)
	_layout_quick_menu()
	_apply_thmanyah_to_hud()


func _layout_quick_menu() -> void:
	if quick_button == null or quick_panel == null:
		return
	var margin: float = _hud_length(12.0)
	var button_size: float = _hud_length(48.0)
	quick_button.position = Vector2(margin, margin)
	quick_button.size = Vector2(button_size, button_size)
	quick_button.add_theme_font_size_override("font_size", _hud_font_size(17))
	quick_panel.position = Vector2(margin, margin + button_size + _hud_length(8.0))
	quick_panel.size = Vector2(_hud_length(158.0), _hud_length(108.0))
	for child: Node in quick_panel.get_children():
		if child is VBoxContainer:
			(child as VBoxContainer).add_theme_constant_override("separation", int(round(_hud_length(7.0))))


func _toggle_quick_menu() -> void:
	if quick_panel == null or not match_initialized:
		return
	quick_panel.visible = not quick_panel.visible


func _toggle_sound() -> void:
	AudioServer.set_bus_mute(0, not AudioServer.is_bus_mute(0))


func _quick_exit() -> void:
	if quick_panel != null:
		quick_panel.visible = false
	_return_to_setup()


func _sync_quick_menu() -> void:
	if quick_button == null:
		return
	var should_show: bool = match_initialized
	quick_button.visible = should_show
	if quick_panel != null and not should_show:
		quick_panel.visible = false
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakQuickMenu='" + ("ready" if should_show else "hidden") + "';" +
			"document.body.dataset.yakolakGameplayFont='thmanyah';",
			true
		)
