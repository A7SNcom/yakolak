extends SceneTree

const Display = preload("res://scripts/ui_design.gd")
var failures: Array[String] = []


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	_expect(Display.display_text("0123456789") == "0123456789", "Western digits remain unchanged")
	_expect(Display.display_text("٠١٢٣٤٥٦٧٨٩") == "0123456789", "Arabic-Indic digits normalize at display boundary")
	_expect(Display.display_text("۰۱۲۳۴۵۶۷۸۹") == "0123456789", "Extended Arabic-Indic digits normalize at display boundary")
	_expect(Display.display_text("الغرفة ٥٤ · اللاعب ٣") == "الغرفة 54 · اللاعب 3", "mixed Arabic copy keeps Arabic text and Western digits")

	var room_id: String = "54"
	var player_number: int = 4
	var displayed_room: String = Display.display_text(room_id)
	var displayed_player: String = Display.display_text(player_number)
	_expect(room_id == "54", "room id remains unchanged internally")
	_expect(typeof(player_number) == TYPE_INT and player_number == 4, "numeric type remains int internally")
	_expect(displayed_room == "54" and displayed_player == "4", "representative numeric values render with Western digits")
	_finish()


func _expect(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)


func _finish() -> void:
	if failures.is_empty():
		print("YAKOLAK_WESTERN_DIGITS_DISPLAY_HEADLESS_OK")
		quit(0)
		return
	for failure: String in failures:
		push_error(failure)
	quit(1)
