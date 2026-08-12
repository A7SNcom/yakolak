extends SceneTree

const Display = preload("res://scripts/ui_design.gd")
const DIGITS21_CASES: Array = [
	{
		"id": "room_code",
		"ar": "رمز الغرفة ٥٤",
		"en": "Room code ٥٤",
		"ar_expected": "رمز الغرفة 54",
		"en_expected": "Room code 54",
	},
	{
		"id": "player_label",
		"ar": "اللاعب ٤",
		"en": "Player ٤",
		"ar_expected": "اللاعب 4",
		"en_expected": "Player 4",
	},
	{
		"id": "player_count",
		"ar": "عدد اللاعبين ٤",
		"en": "Players ٤",
		"ar_expected": "عدد اللاعبين 4",
		"en_expected": "Players 4",
	},
	{
		"id": "scores",
		"ar": "النتيجة ٢ - ١",
		"en": "Score ٢ - ١",
		"ar_expected": "النتيجة 2 - 1",
		"en_expected": "Score 2 - 1",
	},
	{
		"id": "match_target",
		"ar": "هدف المباراة ٣ أشواط",
		"en": "Match target ٣ rounds",
		"ar_expected": "هدف المباراة 3 أشواط",
		"en_expected": "Match target 3 rounds",
	},
	{
		"id": "piece_counters",
		"ar": "الأحجار المتبقية ٦",
		"en": "Pieces remaining ٦",
		"ar_expected": "الأحجار المتبقية 6",
		"en_expected": "Pieces remaining 6",
	},
	{
		"id": "dialogs_status",
		"ar": "الحالة · الجولة ٢",
		"en": "Status · round ٢",
		"ar_expected": "الحالة · الجولة 2",
		"en_expected": "Status · round 2",
	},
	{
		"id": "reconnect_ui",
		"ar": "إعادة الاتصال خلال ٥ ث",
		"en": "Reconnect in ٥ s",
		"ar_expected": "إعادة الاتصال خلال 5 ث",
		"en_expected": "Reconnect in 5 s",
	},
	{
		"id": "round_end",
		"ar": "نهاية الجولة ٢ · ٢ - ١",
		"en": "Round ٢ ended · ٢ - ١",
		"ar_expected": "نهاية الجولة 2 · 2 - 1",
		"en_expected": "Round 2 ended · 2 - 1",
	},
	{
		"id": "match_end",
		"ar": "نهاية المباراة · اللاعب ٤ · ٣ - ١",
		"en": "Match ended · Player ٤ · ٣ - ١",
		"ar_expected": "نهاية المباراة · اللاعب 4 · 3 - 1",
		"en_expected": "Match ended · Player 4 · 3 - 1",
	},
]

var failures: Array[String] = []


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	_expect(Display.display_text("0123456789") == "0123456789", "Western digits remain unchanged")
	_expect(Display.display_text("٠١٢٣٤٥٦٧٨٩") == "0123456789", "Arabic-Indic digits normalize at display boundary")
	_expect(Display.display_text("۰۱۲۳۴۵۶۷۸۹") == "0123456789", "Extended Arabic-Indic digits normalize at display boundary")
	_expect(Display.display_text("الغرفة ٥٤ · اللاعب ٣") == "الغرفة 54 · اللاعب 3", "mixed Arabic copy keeps Arabic text and Western digits")

	for case_value: Variant in DIGITS21_CASES:
		var case: Dictionary = case_value as Dictionary
		var id: String = str(case.get("id", "unknown"))
		for mode: String in ["ar", "en"]:
			var rendered: String = Display.display_text(case.get(mode, ""))
			var expected: String = str(case.get(mode + "_expected", ""))
			_expect(rendered == expected, "%s/%s exact Western-digit output" % [id, mode])
			_expect(not _has_arabic_indic_digits(rendered), "%s/%s contains no Arabic-Indic digit after presentation" % [id, mode])

	var room_id: String = "54"
	var player_number: int = 4
	var displayed_room: String = Display.display_text(room_id)
	var displayed_player: String = Display.display_text(player_number)
	_expect(room_id == "54", "room id remains unchanged internally")
	_expect(typeof(player_number) == TYPE_INT and player_number == 4, "numeric type remains int internally")
	_expect(displayed_room == "54" and displayed_player == "4", "representative numeric values render with Western digits")

	# This intentionally remains Arabic-Indic because it never crosses the
	# user-facing display boundary. DIGITS-21 is not a global Unicode ban.
	var hidden_translation: String = "ترجمة مخفية ١٢٣"
	_expect(_has_arabic_indic_digits(hidden_translation), "hidden translation data is allowed to retain Arabic-Indic digits")
	_finish()


func _has_arabic_indic_digits(value: String) -> bool:
	for digit: String in Display.ARABIC_INDIC_DIGITS:
		if value.contains(digit):
			return true
	for digit: String in Display.EXTENDED_ARABIC_INDIC_DIGITS:
		if value.contains(digit):
			return true
	return false


func _expect(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)


func _finish() -> void:
	if failures.is_empty():
		print("YAKOLAK_DIGITS21_NUMERAL_MATRIX_OK modes=ar,en categories=%d" % DIGITS21_CASES.size())
		quit(0)
		return
	for failure: String in failures:
		push_error(failure)
	quit(1)
