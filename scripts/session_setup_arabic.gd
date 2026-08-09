extends "res://scripts/session_setup_redesign_fix.gd"

# Arabic is the permanent presentation layer. Internal IDs/network values stay
# ASCII where protocols need them, but every user-facing setup string is
# normalized to Arabic-Indic digits before it reaches a Control.

var web_online_setup_callback: Variant
var manual_room_code_input: String = ""


func _ready() -> void:
	super._ready()
	if not OS.has_feature("web"):
		return
	var test_enabled: Variant = JavaScriptBridge.eval("new URL(location.href).searchParams.get('yakolakTestFast')==='1'", true)
	if not bool(test_enabled):
		return
	web_online_setup_callback = JavaScriptBridge.create_callback(_on_web_start_online_setup)
	var window: JavaScriptObject = JavaScriptBridge.get_interface("window")
	if window != null:
		window.set("yakolakTestStartOnlineSetup", web_online_setup_callback)


func show_after_intro() -> void:
	if showing:
		return
	showing = true
	root.visible = true
	_publish_setup_state("visible")
	joining_room_code = _room_code_from_url()
	if not joining_room_code.is_empty():
		_request_room_preview(joining_room_code)
		_show_invitation(joining_room_code)
	else:
		_show_room_entry()


func _rebuild_active_screen() -> void:
	layout_refresh_pending = false
	if not showing:
		return
	match active_screen:
		"room_entry":
			_show_room_entry()
		"join_room":
			_show_join_room()
		_:
			super._rebuild_active_screen()


func _show_room_entry() -> void:
	active_screen = "room_entry"
	joining_room_code = ""
	online_error_text = ""
	manual_room_code_input = ""
	_clear_body()
	var content := _content_box()
	body.add_child(content)
	content.add_child(_label("كيف تبغى تبدأ؟", 25, HORIZONTAL_ALIGNMENT_CENTER))
	content.add_child(_label("أنشئ لعبة جديدة أو انضم لغرفة موجودة", 14, HORIZONTAL_ALIGNMENT_CENTER, Color("#cbd7d9")))
	var choices := _choice_row()
	var create_game := _button("إنشاء لعبة جديدة", Color("#10201f"), Color("#f2f0e9"))
	create_game.pressed.connect(_start_new_game_flow)
	choices.add_child(create_game)
	var join_room := _button("الانضمام لغرفة", Color.WHITE, Color("#214a64"))
	join_room.pressed.connect(_show_join_room)
	choices.add_child(join_room)
	content.add_child(choices)
	content.add_child(_label("اللعبة الجديدة قد تكون على نفس الجهاز، ضد الكمبيوتر، أو أونلاين.", 13, HORIZONTAL_ALIGNMENT_CENTER, Color("#aebdc0")))
	_layout_card()
	call_deferred("_apply_split_framing")


func _start_new_game_flow() -> void:
	joining_room_code = ""
	online_error_text = ""
	join_available_colors.clear()
	room_preview_ready = false
	room_preview_code = ""
	tutorial_requested = false
	wizard_history.clear()
	_reset_seats()
	_show_knowledge_question()


func _show_join_room() -> void:
	active_screen = "join_room"
	joining_room_code = ""
	_clear_body()
	var content := _content_box()
	body.add_child(content)
	content.add_child(_label("الانضمام لغرفة", 25, HORIZONTAL_ALIGNMENT_CENTER))
	content.add_child(_label("أدخل رمز الغرفة المكوّن من رقمين", 14, HORIZONTAL_ALIGNMENT_CENTER, Color("#cbd7d9")))
	if not online_error_text.is_empty():
		content.add_child(_label(online_error_text, 13, HORIZONTAL_ALIGNMENT_CENTER, Color("#ffc0b8")))

	var code_input := LineEdit.new()
	code_input.text = _arabize_numbers(manual_room_code_input)
	code_input.placeholder_text = "مثال: ٥٤"
	code_input.max_length = 2
	code_input.alignment = HORIZONTAL_ALIGNMENT_CENTER
	code_input.layout_direction = Control.LAYOUT_DIRECTION_RTL
	code_input.text_direction = Control.TEXT_DIRECTION_RTL
	code_input.add_theme_font_override("font", THMANYAH_MEDIUM)
	code_input.add_theme_font_size_override("font_size", _ui_font_size(22))
	code_input.custom_minimum_size = Vector2(0.0, _ui_length(50.0))
	code_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	code_input.text_changed.connect(_on_manual_room_code_changed)
	code_input.text_submitted.connect(_submit_manual_room_join)
	content.add_child(code_input)

	var actions := _choice_row()
	var back := _button("رجوع", Color("#eef4f3"), Color(0.10, 0.15, 0.17, 0.72))
	back.pressed.connect(_show_room_entry)
	actions.add_child(back)
	var join := _button("انضم", Color("#10201f"), Color("#f2f0e9"))
	join.pressed.connect(_submit_manual_room_join_from_field.bind(code_input))
	actions.add_child(join)
	content.add_child(actions)
	_layout_card()
	call_deferred("_apply_split_framing")
	code_input.grab_focus.call_deferred()


func _on_manual_room_code_changed(value: String) -> void:
	manual_room_code_input = _normalize_room_code(value)
	online_error_text = ""


func _submit_manual_room_join_from_field(field: LineEdit) -> void:
	_submit_manual_room_join(field.text)


func _submit_manual_room_join(value: String) -> void:
	var normalized: String = _normalize_room_code(value)
	manual_room_code_input = normalized
	if normalized.length() != 2:
		online_error_text = "رمز الغرفة يجب أن يكون رقمين."
		_show_join_room()
		return
	joining_room_code = normalized
	online_error_text = ""
	_request_room_preview(normalized)
	_show_invitation(normalized)


func _show_knowledge_question() -> void:
	active_screen = "question"
	_clear_body()
	var content := _content_box()
	body.add_child(content)
	content.add_child(_label("هل تعرف اللعبة؟", 25, HORIZONTAL_ALIGNMENT_CENTER))
	var choices := _choice_row()
	var yes := _button("نعم، أعرفها", Color("#10201f"), Color("#f2f0e9"))
	yes.pressed.connect(_open_setup.bind(false))
	choices.add_child(yes)
	var no := _button("أبغى أتعلم", Color.WHITE, Color("#235b50"))
	no.pressed.connect(_open_setup.bind(true))
	choices.add_child(no)
	content.add_child(choices)
	var back := _button("رجوع", Color("#eef4f3"), Color(0.10, 0.15, 0.17, 0.72))
	back.pressed.connect(_show_room_entry)
	content.add_child(back)
	_layout_card()
	call_deferred("_apply_split_framing")


func _show_invitation(code: String) -> void:
	active_screen = "invitation"
	_clear_body()
	var content := _content_box()
	body.add_child(content)
	content.add_child(_label("الانضمام لغرفة", 25, HORIZONTAL_ALIGNMENT_CENTER))
	content.add_child(_label("الغرفة " + code, 18, HORIZONTAL_ALIGNMENT_CENTER, Color("#cbd7d9")))
	if not online_error_text.is_empty():
		content.add_child(_label(online_error_text, 14, HORIZONTAL_ALIGNMENT_CENTER, Color("#ffc0b8")))
	var actions := _choice_row()
	var back := _button("رجوع", Color("#eef4f3"), Color(0.10, 0.15, 0.17, 0.72))
	back.pressed.connect(_show_join_room)
	actions.add_child(back)
	var join_label: String = "انضم" if room_preview_ready else ("إعادة" if not online_error_text.is_empty() else "...")
	var join := _button(join_label, Color("#10201f"), Color("#f2f0e9"))
	join.disabled = not room_preview_ready and online_error_text.is_empty()
	if room_preview_ready:
		join.pressed.connect(_open_join_setup.bind(code))
	else:
		join.pressed.connect(_retry_room_preview.bind(code))
	actions.add_child(join)
	content.add_child(actions)
	_layout_card()
	call_deferred("_apply_split_framing")


func _label(text_value: String, size: int, alignment: HorizontalAlignment, color: Color = Color.WHITE) -> Label:
	return super._label(_arabize_numbers(text_value), size, alignment, color)


func _button(text_value: String, foreground: Color, background: Color) -> Button:
	return super._button(_arabize_numbers(text_value), foreground, background)


func _big_choice(text_value: String) -> Button:
	return super._big_choice(_arabize_numbers(text_value))


func _build_mode_question(content: VBoxContainer, seat_index: int) -> void:
	var row := _choice_row()
	var local := _button("معي", Color("#10201f"), Color("#f2f0e9"))
	local.pressed.connect(_choose_mode.bind(seat_index, "local"))
	row.add_child(local)
	var bot := _button("كمبيوتر", Color.WHITE, Color("#2a5652"))
	bot.pressed.connect(_choose_mode.bind(seat_index, "bot"))
	row.add_child(bot)
	# Online is room-wide in the current protocol. When more than two players
	# were selected, say that plainly instead of pretending this choice affects
	# only the one seat named in the heading.
	var online_text: String = "البقية أونلاين" if _active_count() > 2 else "أونلاين"
	var online_choice := _button(online_text, Color.WHITE, Color("#214a64"))
	online_choice.pressed.connect(_choose_mode.bind(seat_index, "online"))
	row.add_child(online_choice)
	content.add_child(row)


func _choose_player_count(count: int) -> void:
	super._choose_player_count(count)
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakSetupPlayerCount='" + str(count) + "';", true)


func _choose_mode(seat_index: int, mode: String) -> void:
	super._choose_mode(seat_index, mode)
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakSetupMode='" + mode + "';" +
			"document.body.dataset.yakolakSetupModeSeat='" + str(seat_index + 1) + "';",
			true
		)


func _choose_rounds(value: int) -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakSetupRounds='" + str(value) + "';", true)
	super._choose_rounds(value)


func _on_web_start_online_setup(arguments: Array) -> void:
	if not showing:
		return
	var count: int = 3
	if not arguments.is_empty():
		count = clampi(int(arguments[0]), 2, 4)
	joining_room_code = ""
	tutorial_requested = false
	online_error_text = ""
	rounds = 3
	wizard_history.clear()
	_reset_seats()
	# Exercise the exact same semantic handlers used by the visible wizard.
	_choose_player_count(count)
	_choose_mode(1, "online")
	_choose_rounds(3)


func _arabic_digit(value: int) -> String:
	return _arabize_numbers(str(value))


func _room_code_from_url() -> String:
	if not OS.has_feature("web"):
		return ""
	var value: Variant = JavaScriptBridge.eval("String(new URL(location.href).searchParams.get('room')||'')", true)
	return _normalize_room_code(str(value))


func _normalize_room_code(value: String) -> String:
	var result: String = ""
	for index: int in range(value.length()):
		var character: String = value.substr(index, 1)
		var digit: String = character
		match character:
			"٠", "۰": digit = "0"
			"١", "۱": digit = "1"
			"٢", "۲": digit = "2"
			"٣", "۳": digit = "3"
			"٤", "۴": digit = "4"
			"٥", "۵": digit = "5"
			"٦", "۶": digit = "6"
			"٧", "۷": digit = "7"
			"٨", "۸": digit = "8"
			"٩", "۹": digit = "9"
		if digit >= "0" and digit <= "9":
			result += digit
		if result.length() >= 2:
			break
	return result


func _arabize_numbers(value: String) -> String:
	var result: String = value
	var western: Array[String] = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]
	var arabic: Array[String] = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"]
	for index: int in range(10):
		result = result.replace(western[index], arabic[index])
	return result


func _reset_seats() -> void:
	seats = [
		{"active": true, "color": "marble", "mode": "local", "label": "أنا"},
		{"active": false, "color": "blue", "mode": "local", "label": "اللاعب ٢"},
		{"active": false, "color": "gold", "mode": "local", "label": "اللاعب ٣"},
		{"active": false, "color": "green", "mode": "local", "label": "اللاعب ٤"},
	]
