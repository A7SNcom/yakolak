extends "res://scripts/session_setup_redesign_fix.gd"

# Arabic is the permanent presentation layer. Internal IDs/network values stay
# ASCII where protocols need them, but every user-facing setup string is
# normalized to Arabic-Indic digits before it reaches a Control.


func _label(text_value: String, size: int, alignment: HorizontalAlignment, color: Color = Color.WHITE) -> Label:
	return super._label(_arabize_numbers(text_value), size, alignment, color)


func _button(text_value: String, foreground: Color, background: Color) -> Button:
	return super._button(_arabize_numbers(text_value), foreground, background)


func _big_choice(text_value: String) -> Button:
	return super._big_choice(_arabize_numbers(text_value))


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
