extends "res://scripts/session_setup_flow.gd"

# One dialog contract for the post-intro setup flow. It preserves the current
# game look and split-table composition, while centralising sizing, backdrop,
# focus, cancel/close semantics and mouse/touch/keyboard parity.

const DIALOG_MIN_HEIGHT_CSS := 148.0
const DIALOG_CLOSE_SIZE_CSS := 48.0
const DIALOG_BACKDROP_COLOR := Color(0.012, 0.017, 0.020, 0.38)

var dialog_backdrop: ColorRect
var dialog_close_button: Button
var dialog_navigation: HBoxContainer
var dialog_scroll: ScrollContainer
var dialog_layout_generation: int = 0
var dialog_focus_pending: bool = false
var web_escape_callback: Variant


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
	dialog_close_button.text = "رجوع"
	dialog_close_button.set_meta("yakolak_navigation", true)
	dialog_close_button.tooltip_text = "العودة للخطوة السابقة"
	dialog_close_button.focus_mode = Control.FOCUS_ALL
	dialog_close_button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	dialog_close_button.add_theme_font_override("font", _font_for_ui(16))
	dialog_close_button.add_theme_font_size_override("font_size", _ui_font_size(16))
	dialog_close_button.add_theme_color_override("font_color", Color("#eef4f3"))
	dialog_close_button.add_theme_color_override("font_hover_color", Color.WHITE)
	dialog_close_button.add_theme_color_override("font_pressed_color", Color.WHITE)
	dialog_close_button.add_theme_color_override("font_focus_color", Color.WHITE)
	dialog_close_button.add_theme_stylebox_override("normal", _close_style(Color(0.08, 0.12, 0.14, 0.72), false))
	dialog_close_button.add_theme_stylebox_override("hover", _close_style(Color(0.11, 0.16, 0.18, 0.88), false))
	dialog_close_button.add_theme_stylebox_override("pressed", _close_style(Color(0.06, 0.09, 0.10, 0.94), false))
	dialog_close_button.add_theme_stylebox_override("focus", _close_style(Color(0.10, 0.15, 0.17, 0.94), true))
	dialog_close_button.pressed.connect(_dialog_cancel)
	# Navigation and content share the card's container tree. No root overlay or
	# independently positioned hit target can drift over wrapped Arabic text.
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation", 0)
	card.add_child(stack)
	dialog_navigation = HBoxContainer.new()
	dialog_navigation.layout_direction = Control.LAYOUT_DIRECTION_LTR
	stack.add_child(dialog_navigation)
	dialog_navigation.add_child(dialog_close_button)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	dialog_navigation.add_child(spacer)
	dialog_scroll = ScrollContainer.new()
	dialog_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	dialog_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	dialog_scroll.follow_focus = true
	dialog_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	stack.add_child(dialog_scroll)
	body.reparent(dialog_scroll)
	body.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
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
	var clearer_title: String = title
	if custom_setup_active and wizard_step.begins_with("mode:"):
		clearer_title = "خصّص اللاعبين"
	elif title.begins_with("اللاعب "):
		clearer_title = title + " بيلعب كيف؟"
	var row := HBoxContainer.new()
	row.layout_direction = Control.LAYOUT_DIRECTION_RTL
	var heading := _label(clearer_title, 24, HORIZONTAL_ALIGNMENT_RIGHT)
	heading.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(heading)
	return row


func _dialog_safe_region(viewport: Vector2) -> Rect2:
	var safe: Vector4 = _safe_area_css()
	var origin := Vector2(_ui_length(safe.x + 12.0), _ui_length(safe.y + 12.0))
	var end := viewport - Vector2(_ui_length(safe.z + 12.0), _ui_length(safe.w + 12.0))
	return Rect2(origin, Vector2(maxf(1.0, end.x - origin.x), maxf(1.0, end.y - origin.y)))


func _layout_card() -> void:
	if root == null or card == null:
		return
	var viewport: Vector2 = get_viewport().get_visible_rect().size
	var previous_css := canvas_css_size
	var metrics := _canvas_metrics(viewport)
	canvas_scale = float(metrics["scale"])
	canvas_css_size = metrics["css_size"] as Vector2
	var safe := _dialog_safe_region(viewport)
	# Width belongs to the screen, never to the current unwrapped text minimum.
	var width := minf(_ui_length(_preferred_width_css()), safe.size.x)
	card.add_theme_stylebox_override("panel", _card_style())
	card.size = Vector2(width, minf(_ui_length(DIALOG_MIN_HEIGHT_CSS), safe.size.y))
	card.position = safe.position + (safe.size - card.size) * 0.5
	card.pivot_offset = card.size * 0.5
	_dialog_update_chrome()
	if showing and previous_css != Vector2.ZERO and previous_css.distance_to(canvas_css_size) > 1.0 and not layout_refresh_pending:
		layout_refresh_pending = true
		call_deferred("_rebuild_active_screen")
	if body != null and body.get_child_count() > 0:
		call_deferred("_settle_dialog")


func _fit_card_to_content() -> void:
	fit_pending = false
	if card == null or body == null or body.get_child_count() == 0:
		return
	var content := body.get_child(0) as Control
	if content == null:
		return
	var viewport: Vector2 = get_viewport().get_visible_rect().size
	var safe := _dialog_safe_region(viewport)
	var style := card.get_theme_stylebox("panel")
	var chrome_height := style.get_minimum_size().y
	if dialog_navigation != null and dialog_navigation.visible:
		chrome_height += dialog_navigation.get_combined_minimum_size().y
	# Account for the actual content offsets (different entry screens used
	# different padding) and measure after wrapping at the fixed available width.
	var content_height := content.get_combined_minimum_size().y + maxf(0.0, content.offset_top) + maxf(0.0, -content.offset_bottom)
	body.custom_minimum_size = Vector2(0.0, content_height)
	var desired := maxf(_ui_length(DIALOG_MIN_HEIGHT_CSS), content_height + chrome_height)
	var region := _layout_region(viewport).intersection(safe)
	# A tall dialog gets the safe viewport before needing a scrollbar; do not
	# squeeze a complete form into the old upper-47% board composition.
	if region.size.y < desired or _is_short_landscape():
		region = safe
	card.size.y = minf(desired, region.size.y)
	card.position = region.position + (region.size - card.size) * 0.5
	card.pivot_offset = card.size * 0.5
	_dialog_update_chrome()
	if showing:
		_publish_setup_metrics.call_deferred()
		call_deferred("_apply_split_framing")


func _settle_dialog() -> void:
	if not showing or body == null:
		return
	dialog_layout_generation += 1
	var generation := dialog_layout_generation
	_hide_legacy_back_buttons(body)
	# Two passes: first lays out the fixed width, second measures wrapped labels
	# and scrollbars. Obsolete navigation/resize passes cannot touch a newer tree.
	for pass_index: int in range(3):
		await get_tree().process_frame
		if generation != dialog_layout_generation or not showing or body == null:
			return
		_dialog_reflow_rows(body, maxf(1.0, dialog_scroll.size.x - _ui_length(32.0)))
		_fit_card_to_content()
	_schedule_dialog_focus()


func _dialog_reflow_rows(node: Node, available_width: float) -> void:
	for child: Node in node.get_children():
		_dialog_reflow_rows(child, available_width)
		if not child is HBoxContainer:
			continue
		var row := child as HBoxContainer
		var buttons: Array[Node] = []
		var only_buttons := true
		for item: Node in row.get_children():
			if item is Control and not (item as Control).visible:
				continue
			if not item is BaseButton:
				only_buttons = false
				break
			buttons.append(item)
		if not only_buttons or buttons.size() < 2 or row.get_combined_minimum_size().x <= available_width:
			continue
		# Preserve labels and targets; stack choices instead of clipping/truncating
		# them when their real minimum width cannot fit the current viewport.
		var column := VBoxContainer.new()
		column.layout_direction = row.layout_direction
		column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		column.add_theme_constant_override("separation", int(round(_ui_length(8.0))))
		node.add_child(column)
		node.move_child(column, row.get_index())
		for item: Node in buttons:
			item.reparent(column)
			(item as Control).size_flags_horizontal = Control.SIZE_EXPAND_FILL
		node.remove_child(row)
		row.queue_free()


func _clear_body() -> void:
	dialog_layout_generation += 1
	if body == null:
		return
	# queue_free alone leaves the previous screen as child 0 until frame end.
	# Detach now so sizing/focus always refer to the newly built screen.
	for child: Node in body.get_children():
		body.remove_child(child)
		child.queue_free()
	body.custom_minimum_size = Vector2.ZERO
	if dialog_scroll != null:
		dialog_scroll.scroll_vertical = 0


func _hide_legacy_back_buttons(node: Node) -> void:
	for child: Node in node.get_children():
		if child is Button and (child as Button).text == "رجوع":
			(child as Button).visible = false
		_hide_legacy_back_buttons(child)


func _dialog_update_chrome() -> void:
	if dialog_close_button == null or card == null:
		return
	var can_return := showing and active_screen in ["join_room", "invitation", "question", "setup", "learning-disclosure", "online_state"]
	dialog_close_button.visible = can_return
	if dialog_navigation != null:
		dialog_navigation.visible = can_return
	dialog_close_button.custom_minimum_size = Vector2(_ui_length(88.0), _ui_length(DIALOG_CLOSE_SIZE_CSS))
	dialog_close_button.add_theme_font_size_override("font_size", _ui_font_size(16))


func _dialog_cancel() -> void:
	if not showing:
		return
	var navigated := true
	match active_screen:
		"join_room":
			_show_room_entry()
		"invitation":
			_show_join_room()
		"question":
			if wizard_step == "count" and wizard_history.is_empty() and joining_room_code.is_empty():
				_show_room_entry()
			else:
				_show_setup()
		"setup":
			_wizard_back()
		"learning-disclosure":
			_back_from_online_learning_disclosure()
		_:
			navigated = false
	if navigated:
		# Cancel rebuilds the content tree. Restore focus only after the rebuilt
		# controls have survived two real frames, avoiding stale hidden owners.
		dialog_focus_pending = false
		call_deferred("_restore_dialog_focus_after_navigation")


func _restore_dialog_focus_after_navigation() -> void:
	if not showing:
		return
	await get_tree().process_frame
	await get_tree().process_frame
	if not showing:
		return
	dialog_focus_pending = false
	_apply_dialog_focus()


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
	if key.is_action_pressed("ui_accept") or key.keycode == KEY_ENTER or key.keycode == KEY_KP_ENTER or key.keycode == KEY_SPACE:
		var owner: Control = get_viewport().gui_get_focus_owner()
		if owner is BaseButton and not (owner as BaseButton).disabled:
			(owner as BaseButton).pressed.emit()
			get_viewport().set_input_as_handled()
			return
	if event.is_action_pressed("ui_cancel"):
		if active_screen != "room_entry":
			_dialog_cancel()
		get_viewport().set_input_as_handled()


func _unhandled_key_input(event: InputEvent) -> void:
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
	web_escape_callback = JavaScriptBridge.create_callback(_on_web_escape)
	var window: JavaScriptObject = JavaScriptBridge.get_interface("window")
	if window != null:
		window.set("yakolakDialogCancel", web_escape_callback)
	JavaScriptBridge.eval(
		"if(!window.__yakolakDialogKeyGuardV3){" +
		"window.__yakolakDialogKeyGuardV3=function(e){" +
		"if(document.body.dataset.yakolakSetup!=='visible'){return;}" +
		"if(e.key==='Tab'){e.preventDefault();return;}" +
		"if(e.key==='Escape'){" +
		"document.body.dataset.yakolakDialogEscapeSeen='js';" +
		"e.preventDefault();e.stopPropagation();" +
		"if(window.yakolakDialogCancel){window.yakolakDialogCancel();}" +
		"}};window.addEventListener('keydown',window.__yakolakDialogKeyGuardV3,true);}",
		true
	)


func _on_web_escape(_arguments: Array) -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakDialogEscapeSeen='godot';", true)
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

	var primary: Control = null
	for control: Control in controls:
		if control != dialog_close_button:
			primary = control
			break
	var focus_role := "none"
	if focus_owner != null and focus_owner == dialog_close_button:
		focus_role = "close"
	elif focus_owner != null and primary != null and focus_owner == primary:
		focus_role = "primary"
	elif focus_owner != null:
		focus_role = "other"

	var close_state: String = "visible" if dialog_close_button != null and dialog_close_button.visible else "mandatory-root"
	var script: String = (
		"document.body.dataset.yakolakDialogSystem='native-control-v2';" +
		"document.body.dataset.yakolakDialogStage='" + stage + "';" +
		"document.body.dataset.yakolakDialogSizing='fixed-width+wrapped-fit+scroll';" +
		"document.body.dataset.yakolakDialogBackdrop='blocked-not-dismissible';" +
		"document.body.dataset.yakolakDialogClose='" + close_state + "';" +
		"document.body.dataset.yakolakDialogFocus='" + focused + "';" +
		"document.body.dataset.yakolakDialogFocusRole='" + focus_role + "';" +
		"document.body.dataset.yakolakDialogFocusCount='" + str(controls.size()) + "';" +
		"document.body.dataset.yakolakDialogKeyboard='tab-loop+escape';"
	)

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
			"document.body.dataset.yakolakDialogSystem='native-control-v2';" +
			"document.body.dataset.yakolakDialogSizing='fixed-width+wrapped-fit+scroll';" +
			"document.body.dataset.yakolakDialogBackdrop='blocked-not-dismissible';",
			true
		)
