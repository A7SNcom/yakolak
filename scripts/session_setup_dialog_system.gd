extends "res://scripts/session_setup_flow.gd"

# One dialog contract for the post-intro setup flow. It preserves the current
# game look and split-table composition, while centralising sizing, backdrop,
# focus, cancel/close semantics and mouse/touch/keyboard parity.

const DIALOG_DEFAULT_WIDTH_CSS := 480.0
const DIALOG_WIDE_WIDTH_CSS := 560.0
const DIALOG_MIN_HEIGHT_CSS := 148.0
const DIALOG_CONTENT_EXTRA_CSS := 24.0
const DIALOG_CLOSE_SIZE_CSS := 48.0
const DIALOG_CLOSE_GUTTER_CSS := 12.0
const DIALOG_BACKDROP_COLOR := Color(0.012, 0.017, 0.020, 0.38)
const DIALOG_ICON_FONT = preload("res://assets/fonts/DejaVuSans.ttf")

var dialog_backdrop: ColorRect
var dialog_close_button: Button
var dialog_focus_pending: bool = false
var web_window: JavaScriptObject
var web_escape_callback: JavaScriptObject


func _build_shell() -> void:
	super._build_shell()

	dialog_backdrop = ColorRect.new()
	dialog_backdrop.name = "DialogBackdrop"
	dialog_backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dialog_backdrop.color = DIALOG_BACKDROP_COLOR
	dialog_backdrop.mouse_filter = Control.MOUSE_FILTER_STOP
	root.add_child(dialog_backdrop)
	root.move_child(dialog_backdrop, 0)

	dialog_close_button = Button.new()
	dialog_close_button.name = "DialogClose"
	dialog_close_button.text = "×"
	dialog_close_button.tooltip_text = "إغلاق"
	dialog_close_button.focus_mode = Control.FOCUS_ALL
	dialog_close_button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	dialog_close_button.add_theme_font_override("font", DIALOG_ICON_FONT)
	dialog_close_button.add_theme_font_size_override("font_size", _ui_font_size(23))
	dialog_close_button.add_theme_color_override("font_color", Color("#eef4f3"))
	dialog_close_button.add_theme_color_override("font_hover_color", Color.WHITE)
	dialog_close_button.add_theme_color_override("font_pressed_color", Color.WHITE)
	dialog_close_button.add_theme_color_override("font_focus_color", Color.WHITE)
	dialog_close_button.add_theme_stylebox_override("normal", _close_style(Color(0.08, 0.12, 0.14, 0.72), false))
	dialog_close_button.add_theme_stylebox_override("hover", _close_style(Color(0.11, 0.16, 0.18, 0.88), false))
	dialog_close_button.add_theme_stylebox_override("pressed", _close_style(Color(0.06, 0.09, 0.10, 0.94), false))
	dialog_close_button.add_theme_stylebox_override("focus", _close_style(Color(0.10, 0.15, 0.17, 0.94), true))
	dialog_close_button.pressed.connect(_dialog_cancel)
	dialog_close_button.z_index = 20
	root.add_child(dialog_close_button)
	_install_web_keyboard_guard()
	_dialog_update_chrome()


func _button(text_value: String, foreground: Color, background: Color) -> Button:
	var button: Button = super._button(text_value, foreground, background)
	button.focus_mode = Control.FOCUS_ALL
	button.add_theme_stylebox_override("focus", _dialog_focus_button_style(background))
	return button


func _color_choice_button(color_id: String, value: Color, selected: bool, enabled: bool) -> Button:
	var button: Button = super._color_choice_button(color_id, value, selected, enabled)
	button.focus_mode = Control.FOCUS_ALL
	var focus_style: StyleBoxFlat = _color_tile_style(value, true, true)
	focus_style.border_color = Color(value.r, value.g, value.b, 1.0)
	focus_style.set_border_width_all(3)
	focus_style.shadow_color = Color(value.r, value.g, value.b, 0.30)
	focus_style.shadow_size = int(round(_ui_length(10.0)))
	button.add_theme_stylebox_override("focus", focus_style)
	return button


func _wizard_header(title: String) -> Control:
	# Cancel/back now lives in one fixed close control, so the header hierarchy
	# stays identical on every wizard screen.
	var row := HBoxContainer.new()
	row.layout_direction = Control.LAYOUT_DIRECTION_RTL
	var heading := _label(title, 24, HORIZONTAL_ALIGNMENT_RIGHT)
	heading.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(heading)
	return row


func _layout_card() -> void:
	if root == null or card == null:
		return
	var viewport: Vector2 = get_viewport().get_visible_rect().size
	var metrics := _canvas_metrics(viewport)
	canvas_scale = float(metrics["scale"])
	canvas_css_size = metrics["css_size"] as Vector2
	var region: Rect2 = _layout_region(viewport)

	var preferred_width_css: float = DIALOG_DEFAULT_WIDTH_CSS
	if active_screen == "setup" and wizard_step == "color":
		preferred_width_css = DIALOG_WIDE_WIDTH_CSS
	var region_width_css: float = region.size.x * canvas_scale
	var width_css: float = minf(preferred_width_css, region_width_css)
	if _is_short_landscape():
		width_css = minf(width_css, clampf(region_width_css * 0.62, 300.0, 430.0))
	else:
		width_css = minf(width_css, maxf(280.0, canvas_css_size.x - 24.0))

	var width: float = minf(region.size.x, width_css / canvas_scale)
	var height: float = minf(_ui_length(DIALOG_MIN_HEIGHT_CSS), region.size.y)
	var x: float = region.position.x + (region.size.x - width) * 0.5
	if _is_short_landscape():
		x = region.position.x + region.size.x - width
	var y: float = region.position.y + maxf(0.0, (region.size.y - height) * 0.5)
	card.position = Vector2(x, y)
	card.size = Vector2(width, height)
	card.add_theme_stylebox_override("panel", _card_style())
	card.pivot_offset = card.size * 0.5

	_dialog_update_chrome()
	if body != null and body.get_child_count() > 0:
		call_deferred("_settle_dialog")
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
	var desired: float = clampf(
		minimum.y + _ui_length(DIALOG_CONTENT_EXTRA_CSS),
		_ui_length(DIALOG_MIN_HEIGHT_CSS),
		region.size.y
	)
	card.position.y = region.position.y + maxf(0.0, (region.size.y - desired) * 0.5)
	card.size.y = desired
	card.pivot_offset = card.size * 0.5
	_dialog_update_chrome()
	if showing:
		_publish_setup_metrics.call_deferred()
		call_deferred("_apply_split_framing")


func _settle_dialog() -> void:
	if not showing or body == null:
		return
	_hide_legacy_back_buttons(body)
	_fit_card_to_content()
	_dialog_update_chrome()
	_schedule_dialog_focus()


func _hide_legacy_back_buttons(node: Node) -> void:
	for child: Node in node.get_children():
		if child is Button and (child as Button).text == "رجوع":
			(child as Button).visible = false
		_hide_legacy_back_buttons(child)


func _dialog_update_chrome() -> void:
	if dialog_close_button == null or card == null:
		return
	var can_close: bool = showing and active_screen != "" and active_screen != "room_entry"
	dialog_close_button.visible = can_close
	if not can_close:
		return
	var size_px := Vector2(_ui_length(DIALOG_CLOSE_SIZE_CSS), _ui_length(DIALOG_CLOSE_SIZE_CSS))
	dialog_close_button.size = size_px
	dialog_close_button.position = card.position + Vector2(
		_ui_length(DIALOG_CLOSE_GUTTER_CSS),
		_ui_length(DIALOG_CLOSE_GUTTER_CSS)
	)


func _dialog_cancel() -> void:
	if not showing:
		return
	match active_screen:
		"join_room":
			_show_room_entry()
		"invitation":
			_show_join_room()
		"question":
			_show_setup()
		"setup":
			_wizard_back()
		_:
			# The root setup choice is mandatory. Dismissing it would leave a table
			# with no configured match and no safe continuation.
			return


func _input(event: InputEvent) -> void:
	if not showing or not (event is InputEventKey):
		return
	var key := event as InputEventKey
	if not key.pressed or key.echo:
		return
	if key.keycode == KEY_TAB:
		_dialog_move_focus(-1 if key.shift_pressed else 1)
		get_viewport().set_input_as_handled()
		return
	if event.is_action_pressed("ui_cancel"):
		if active_screen != "room_entry":
			_dialog_cancel()
		get_viewport().set_input_as_handled()


func _unhandled_key_input(event: InputEvent) -> void:
	# Fallback for platforms that map a cancel action without delivering a raw
	# key event through _input first (controller/back-button parity).
	if not showing or not event.is_action_pressed("ui_cancel"):
		return
	if active_screen != "room_entry":
		_dialog_cancel()
	get_viewport().set_input_as_handled()


func _schedule_dialog_focus() -> void:
	if dialog_focus_pending:
		return
	dialog_focus_pending = true
	call_deferred("_apply_dialog_focus")


func _apply_dialog_focus() -> void:
	dialog_focus_pending = false
	if not showing or body == null:
		return
	var controls: Array[Control] = _dialog_focus_controls()
	if controls.is_empty():
		_publish_dialog_contract(controls)
		return

	for index: int in range(controls.size()):
		var current: Control = controls[index]
		var next_control: Control = controls[(index + 1) % controls.size()]
		var previous_control: Control = controls[(index - 1 + controls.size()) % controls.size()]
		current.focus_next = current.get_path_to(next_control)
		current.focus_previous = current.get_path_to(previous_control)

	var target: Control = controls[0]
	if active_screen == "join_room":
		for control: Control in controls:
			if control is LineEdit:
				target = control
				break
	target.grab_focus()
	_publish_dialog_contract(controls)


func _dialog_focus_controls() -> Array[Control]:
	var controls: Array[Control] = []
	if body != null:
		_collect_focusable_controls(body, controls)
	if dialog_close_button != null and dialog_close_button.visible:
		controls.append(dialog_close_button)
	return controls


func _dialog_move_focus(direction: int) -> void:
	var controls: Array[Control] = _dialog_focus_controls()
	if controls.is_empty():
		return
	var owner: Control = get_viewport().gui_get_focus_owner()
	var index: int = controls.find(owner)
	if index < 0:
		index = 0 if direction >= 0 else controls.size() - 1
	else:
		index = posmod(index + direction, controls.size())
	controls[index].grab_focus()
	_publish_dialog_contract(controls)


func _collect_focusable_controls(node: Node, output: Array[Control]) -> void:
	for child: Node in node.get_children():
		if child is Control:
			var control := child as Control
			if control.is_visible_in_tree():
				if control is BaseButton:
					var button := control as BaseButton
					if not button.disabled:
						control.focus_mode = Control.FOCUS_ALL
						output.append(control)
				elif control is LineEdit:
					var field := control as LineEdit
					if field.editable:
						control.focus_mode = Control.FOCUS_ALL
						output.append(control)
		_collect_focusable_controls(child, output)


func _install_web_keyboard_guard() -> void:
	if not OS.has_feature("web"):
		return
	# Register the Godot callback directly as a DOM listener. Passing the retained
	# JavaScriptBridge callback into addEventListener is more reliable than
	# assigning the callback to a dynamic window property and invoking it via eval.
	web_window = JavaScriptBridge.get_interface("window")
	web_escape_callback = JavaScriptBridge.create_callback(_on_web_keydown)
	if web_window != null:
		web_window.addEventListener("keydown", web_escape_callback, true)
	JavaScriptBridge.eval(
		"if(!window.__yakolakDialogTabGuard){" +
		"window.__yakolakDialogTabGuard=function(e){" +
		"if(document.body.dataset.yakolakSetup==='visible'&&e.key==='Tab'){e.preventDefault();}" +
		"};window.addEventListener('keydown',window.__yakolakDialogTabGuard,true);}",
		true
	)


func _on_web_keydown(args: Array) -> void:
	if args.is_empty():
		return
	var js_event := args[0] as JavaScriptObject
	if js_event == null or str(js_event.key) != "Escape":
		return
	JavaScriptBridge.eval("document.body.dataset.yakolakDialogEscapeSeen='escape';", true)
	js_event.preventDefault()
	js_event.stopPropagation()
	if showing and active_screen != "room_entry":
		_dialog_cancel()


func _publish_dialog_contract(controls: Array[Control]) -> void:
	if not OS.has_feature("web") or card == null:
		return
	var stage: String = active_screen
	if active_screen == "setup":
		stage += ":" + wizard_step
	var focus_owner: Control = get_viewport().gui_get_focus_owner()
	var focused: String = "none"
	if focus_owner is LineEdit:
		focused = "input"
	elif focus_owner is BaseButton:
		focused = "button"
	var close_state: String = "visible" if dialog_close_button != null and dialog_close_button.visible else "mandatory-root"
	var script: String = (
		"document.body.dataset.yakolakDialogSystem='native-control-v1';" +
		"document.body.dataset.yakolakDialogStage='" + stage + "';" +
		"document.body.dataset.yakolakDialogSizing='content-fit';" +
		"document.body.dataset.yakolakDialogBackdrop='blocked-not-dismissible';" +
		"document.body.dataset.yakolakDialogClose='" + close_state + "';" +
		"document.body.dataset.yakolakDialogFocus='" + focused + "';" +
		"document.body.dataset.yakolakDialogFocusCount='" + str(controls.size()) + "';" +
		"document.body.dataset.yakolakDialogKeyboard='tab-loop+escape';"
	)

	var primary: Control = null
	for control: Control in controls:
		if control != dialog_close_button:
			primary = control
			break
	if primary != null:
		var primary_center: Vector2 = primary.get_global_rect().get_center() * canvas_scale
		script += "document.body.dataset.yakolakDialogPrimaryX='%.2f';" % primary_center.x
		script += "document.body.dataset.yakolakDialogPrimaryY='%.2f';" % primary_center.y
	if dialog_close_button != null and dialog_close_button.visible:
		var close_center: Vector2 = dialog_close_button.get_global_rect().get_center() * canvas_scale
		script += "document.body.dataset.yakolakDialogCloseX='%.2f';" % close_center.x
		script += "document.body.dataset.yakolakDialogCloseY='%.2f';" % close_center.y
	else:
		script += "delete document.body.dataset.yakolakDialogCloseX;delete document.body.dataset.yakolakDialogCloseY;"
	JavaScriptBridge.eval(script, true)


func _dialog_focus_button_style(background: Color) -> StyleBoxFlat:
	var style: StyleBoxFlat = _button_style(background.lightened(0.05))
	style.border_color = Color(0.94, 0.97, 0.96, 0.96)
	style.set_border_width_all(2)
	style.shadow_color = Color(0.92, 0.98, 0.96, 0.18)
	style.shadow_size = int(round(_ui_length(7.0)))
	return style


func _close_style(background: Color, focused: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.border_color = Color(0.94, 0.97, 0.96, 0.92 if focused else 0.16)
	style.set_border_width_all(2 if focused else 1)
	style.set_corner_radius_all(int(round(_ui_length(14.0))))
	if focused:
		style.shadow_color = Color(0.92, 0.98, 0.96, 0.18)
		style.shadow_size = int(round(_ui_length(7.0)))
	return style


func _publish_setup_metrics() -> void:
	super._publish_setup_metrics()
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakDialogSystem='native-control-v1';" +
			"document.body.dataset.yakolakDialogSizing='content-fit';" +
			"document.body.dataset.yakolakDialogBackdrop='blocked-not-dismissible';",
			true
		)
