extends "res://scripts/session_setup_redesign_fix.gd"

# Arabic is the permanent presentation layer. Internal IDs/network values stay
# ASCII where protocols need them, but every user-facing setup string is
# normalized to Arabic-Indic digits before it reaches a Control.

var web_online_setup_callback: Variant


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
