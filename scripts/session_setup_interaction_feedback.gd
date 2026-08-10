extends "res://scripts/session_setup_design_system.gd"

# One interaction-feedback contract for the setup flow. Keep the motion tiny:
# immediate visual state changes, a short duplicate-click guard, and no decorative
# animation that delays the user's next action.
const FeedbackDesign = preload("res://scripts/ui_design.gd")
const RAPID_REPEAT_GUARD_MS := 180

var _feedback_guard_until_msec: int = 0
var _feedback_ack_tween: Tween


func _ready() -> void:
	super._ready()
	_publish_interaction_feedback_contract()


func _clear_body() -> void:
	super._clear_body()
	# A rebuilt screen can occupy the same pixels as the button that opened it.
	# Ignore only the immediate duplicate/synthetic follow-up so a double-click
	# cannot accidentally answer two consecutive wizard questions.
	_feedback_guard_until_msec = Time.get_ticks_msec() + RAPID_REPEAT_GUARD_MS


func _input(event: InputEvent) -> void:
	if showing and _is_feedback_pointer_press(event) and Time.get_ticks_msec() < _feedback_guard_until_msec:
		_acknowledge_guarded_repeat()
		get_viewport().set_input_as_handled()
		return
	super._input(event)


func _settle_dialog() -> void:
	super._settle_dialog()
	_apply_feedback_contract_to_tree(body)
	_publish_interaction_feedback_contract()


func _show_invitation(code: String) -> void:
	super._show_invitation(code)
	if not room_preview_ready and online_error_text.is_empty():
		var loading_button: Button = _find_button_with_text(body, ["...", "…"])
		if loading_button != null:
			loading_button.text = "جارٍ التحقق…"
			loading_button.tooltip_text = "جارٍ التحقق من الغرفة"
			loading_button.disabled = true
			_apply_button_feedback(loading_button)
	_publish_interaction_feedback_contract()


func _color_choice_button(color_id: String, value: Color, selected: bool, enabled: bool) -> Button:
	var button: Button = super._color_choice_button(color_id, value, selected, enabled)
	button.toggle_mode = true
	button.button_pressed = selected
	button.tooltip_text = _color_feedback_name(color_id) + (" — مختار" if selected else "")
	button.add_theme_stylebox_override("hover_pressed", _color_tile_style(value, true, true))
	_apply_button_feedback(button)
	return button


func _apply_picker_font(picker: OptionButton) -> void:
	super._apply_picker_font(picker)
	FeedbackDesign.apply_button_contract(
		picker,
		_ui_length(1.0),
		_ui_font_size(FeedbackDesign.FONT_BODY),
		FeedbackDesign.TEXT_PRIMARY,
		Color(1.0, 1.0, 1.0, 0.07),
		FeedbackDesign.FONT_MEDIUM
	)
	_apply_button_feedback(picker)
	var menu: PopupMenu = picker.get_popup()
	menu.add_theme_color_override("font_disabled_color", Color(FeedbackDesign.TEXT_MUTED.r, FeedbackDesign.TEXT_MUTED.g, FeedbackDesign.TEXT_MUTED.b, 0.38))


func _apply_feedback_contract_to_tree(node: Node) -> void:
	if node == null:
		return
	for child: Node in node.get_children():
		if child is Button:
			_apply_button_feedback(child as Button)
		elif child is LineEdit:
			_apply_line_edit_feedback(child as LineEdit)
		_apply_feedback_contract_to_tree(child)


func _apply_button_feedback(button: Button) -> void:
	if button == null:
		return
	button.mouse_default_cursor_shape = Control.CURSOR_ARROW if button.disabled else Control.CURSOR_POINTING_HAND
	if button.disabled:
		button.focus_mode = Control.FOCUS_NONE
	else:
		button.focus_mode = Control.FOCUS_ALL

	var pressed_style: StyleBox = button.get_theme_stylebox("pressed")
	if pressed_style != null:
		button.add_theme_stylebox_override("hover_pressed", pressed_style.duplicate() as StyleBox)

	if not button.has_theme_stylebox_override("disabled"):
		var normal_style: StyleBox = button.get_theme_stylebox("normal")
		if normal_style != null:
			var disabled_style: StyleBox = normal_style.duplicate() as StyleBox
			if disabled_style is StyleBoxFlat:
				var flat := disabled_style as StyleBoxFlat
				flat.bg_color = Color(flat.bg_color.r, flat.bg_color.g, flat.bg_color.b, flat.bg_color.a * 0.34)
				flat.border_color = Color(flat.border_color.r, flat.border_color.g, flat.border_color.b, flat.border_color.a * 0.42)
				flat.shadow_size = 0
			button.add_theme_stylebox_override("disabled", disabled_style)


func _apply_line_edit_feedback(field: LineEdit) -> void:
	if field == null:
		return
	field.focus_mode = Control.FOCUS_ALL
	field.mouse_default_cursor_shape = Control.CURSOR_IBEAM
	var unit: float = _ui_length(1.0)
	var normal := FeedbackDesign.button_style(unit, Color(1.0, 1.0, 1.0, 0.07), "normal", false)
	var focus := FeedbackDesign.button_style(unit, Color(1.0, 1.0, 1.0, 0.09), "focus", true)
	field.add_theme_stylebox_override("normal", normal)
	field.add_theme_stylebox_override("focus", focus)


func _is_feedback_pointer_press(event: InputEvent) -> bool:
	if event is InputEventScreenTouch:
		return (event as InputEventScreenTouch).pressed
	if event is InputEventMouseButton:
		var mouse := event as InputEventMouseButton
		return mouse.pressed and mouse.button_index == MOUSE_BUTTON_LEFT
	return false


func _acknowledge_guarded_repeat() -> void:
	if card == null:
		return
	if _feedback_ack_tween != null and _feedback_ack_tween.is_valid():
		_feedback_ack_tween.kill()
	card.modulate = Color(0.94, 0.96, 0.96, 1.0)
	_feedback_ack_tween = create_tween()
	_feedback_ack_tween.tween_property(card, "modulate", Color.WHITE, 0.09).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakInteractionRapidRepeat='acknowledged';", true)


func _find_button_with_text(node: Node, values: Array[String]) -> Button:
	if node == null:
		return null
	for child: Node in node.get_children():
		if child is Button and values.has((child as Button).text):
			return child as Button
		var nested: Button = _find_button_with_text(child, values)
		if nested != null:
			return nested
	return null


func _color_feedback_name(color_id: String) -> String:
	for color_data: Dictionary in PALETTE:
		if str(color_data.get("id", "")) == color_id:
			return str(color_data.get("name", color_id))
	return color_id


func _publish_interaction_feedback_contract() -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakInteractionFeedback='hover+pressed+selected+disabled+focus+loading';" +
		"document.body.dataset.yakolakInteractionInputs='mouse+touch+keyboard';" +
		"document.body.dataset.yakolakInteractionMotion='instant-subtle';" +
		"document.body.dataset.yakolakInteractionRapidGuardMs='" + str(RAPID_REPEAT_GUARD_MS) + "';",
		true
	)
