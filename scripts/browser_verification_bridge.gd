extends Node

# Browser-only observability for deterministic Playwright verification.
# It never changes normal player input or rules. During browser automation only,
# the turn deadline is held so slow software rendering cannot create false timeouts.
const Display = preload("res://scripts/ui_design.gd")

const DIGITS21_CATEGORIES: Array[String] = [
	"room_code",
	"player_label",
	"player_count",
	"scores",
	"match_target",
	"piece_counters",
	"dialogs_status",
	"reconnect_ui",
	"round_end",
	"match_end",
]

var intro: Node3D
var match_controller: Node
var camera: Camera3D
var automation: bool = false
var last_publish_msec: int = -1000
var last_visible_text_publish_msec: int = -1000
var last_visible_text_payload: String = ""
var digits21_fixture_layer: CanvasLayer
var digits21_fixture_callback: Variant


func _ready() -> void:
	process_priority = 100
	intro = get_parent() as Node3D
	match_controller = intro.get_node_or_null("LocalMatchGameplay")
	if OS.has_feature("web"):
		automation = bool(JavaScriptBridge.eval("Boolean(navigator.webdriver)", true))
		if automation:
			digits21_fixture_callback = JavaScriptBridge.create_callback(_on_digits21_fixture_requested)
			var window: JavaScriptObject = JavaScriptBridge.get_interface("window")
			if window != null:
				window.set("yakolakTestShowDigitFixture", digits21_fixture_callback)
	set_process(true)


func _process(_delta: float) -> void:
	var now: int = Time.get_ticks_msec()
	if automation and now - last_visible_text_publish_msec >= 180:
		last_visible_text_publish_msec = now
		_publish_visible_strings()

	if match_controller == null:
		match_controller = intro.get_node_or_null("LocalMatchGameplay")
		return
	if not bool(match_controller.get("match_initialized")):
		return
	if automation and not bool(match_controller.get("round_complete")):
		match_controller.set("turn_deadline_msec", Time.get_ticks_msec() + 600000)
	if now - last_publish_msec < 220:
		return
	last_publish_msec = now
	_publish_visible_targets()


func _publish_visible_strings() -> void:
	if not OS.has_feature("web") or intro == null:
		return
	var viewport_rect := Rect2(Vector2.ZERO, get_viewport().get_visible_rect().size)
	var records: Array[Dictionary] = []
	_collect_visible_strings(intro, viewport_rect, records)
	var payload: String = JSON.stringify(records)
	if payload == last_visible_text_payload:
		return
	last_visible_text_payload = payload
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakVisibleStrings=" + JSON.stringify(payload) + ";",
		true
	)


func _collect_visible_strings(node: Node, viewport_rect: Rect2, records: Array[Dictionary]) -> void:
	if node is Control:
		var control := node as Control
		if control.is_visible_in_tree() and control.modulate.a * control.self_modulate.a > 0.01:
			var rect: Rect2 = control.get_global_rect()
			if rect.size.x > 0.0 and rect.size.y > 0.0 and rect.intersects(viewport_rect):
				var text_value: String = _visible_control_text(control).strip_edges()
				if not text_value.is_empty():
					records.append({
						"name": str(control.name),
						"type": control.get_class(),
						"text": text_value,
					})
	for child: Node in node.get_children():
		_collect_visible_strings(child, viewport_rect, records)


func _visible_control_text(control: Control) -> String:
	if control is Label:
		return (control as Label).text
	if control is Button:
		return (control as Button).text
	if control is LineEdit:
		var line_edit := control as LineEdit
		return line_edit.text if not line_edit.text.is_empty() else line_edit.placeholder_text
	if control is RichTextLabel:
		return (control as RichTextLabel).get_parsed_text()
	if control is TextEdit:
		return (control as TextEdit).text
	return ""


func _on_digits21_fixture_requested(arguments: Array) -> void:
	if not automation:
		return
	var mode: String = "ar"
	if not arguments.is_empty() and str(arguments[0]).to_lower() == "en":
		mode = "en"
	_build_digits21_fixture(mode)


func _build_digits21_fixture(mode: String) -> void:
	if digits21_fixture_layer != null and is_instance_valid(digits21_fixture_layer):
		digits21_fixture_layer.queue_free()
		digits21_fixture_layer = null

	digits21_fixture_layer = CanvasLayer.new()
	digits21_fixture_layer.name = "Digits21FixtureLayer"
	digits21_fixture_layer.layer = 95
	intro.add_child(digits21_fixture_layer)

	var panel := PanelContainer.new()
	panel.name = "Digits21FixturePanel"
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.layout_direction = Control.LAYOUT_DIRECTION_RTL if mode == "ar" else Control.LAYOUT_DIRECTION_LTR
	var panel_style := StyleBoxFlat.new()
	panel_style.bg_color = Color("#0b1114")
	panel_style.content_margin_left = 24.0
	panel_style.content_margin_top = 34.0
	panel_style.content_margin_right = 24.0
	panel_style.content_margin_bottom = 28.0
	panel.add_theme_stylebox_override("panel", panel_style)
	digits21_fixture_layer.add_child(panel)

	var content := VBoxContainer.new()
	content.name = "Digits21FixtureContent"
	content.alignment = BoxContainer.ALIGNMENT_CENTER
	content.add_theme_constant_override("separation", 9)
	panel.add_child(content)

	var title := Label.new()
	title.name = "Digits21FixtureTitle"
	title.text = "فحص تشكيل الأرقام" if mode == "ar" else "Numeral shaping check"
	_configure_digits21_label(title, mode, 22, true)
	content.add_child(title)

	var rows: Dictionary = _digits21_fixture_rows(mode)
	for category: String in DIGITS21_CATEGORIES:
		var label := Label.new()
		label.name = "Digits21_" + category
		label.text = Display.display_text(str(rows.get(category, "")))
		_configure_digits21_label(label, mode, 17, false)
		content.add_child(label)

	# Deliberately keep Arabic-Indic digits in hidden test data. DIGITS-21 must
	# reject only rendered numeric UI, never translations/state that are hidden.
	var hidden := Label.new()
	hidden.name = "Digits21HiddenTranslation"
	hidden.text = "ترجمة مخفية ١٢٣" if mode == "ar" else "Hidden translation ١٢٣"
	hidden.visible = false
	content.add_child(hidden)

	JavaScriptBridge.eval(
		"document.body.dataset.yakolakDigits21Fixture=" + JSON.stringify(mode) + ";" +
		"document.body.dataset.yakolakDigits21HiddenSample=" + JSON.stringify(hidden.text) + ";",
		true
	)
	last_visible_text_payload = ""
	call_deferred("_publish_visible_strings")


func _configure_digits21_label(label: Label, mode: String, font_size: int, emphasized: bool) -> void:
	label.layout_direction = Control.LAYOUT_DIRECTION_RTL if mode == "ar" else Control.LAYOUT_DIRECTION_LTR
	label.text_direction = Control.TEXT_DIRECTION_RTL if mode == "ar" else Control.TEXT_DIRECTION_LTR
	label.language = "ar" if mode == "ar" else "en"
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT if mode == "ar" else HORIZONTAL_ALIGNMENT_LEFT
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.add_theme_font_override("font", Display.FONT_BOLD if emphasized else Display.FONT_MEDIUM)
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", Color("#f7f5ef"))


func _digits21_fixture_rows(mode: String) -> Dictionary:
	if mode == "en":
		return {
			"room_code": "Room code ٥٤",
			"player_label": "Player ٤",
			"player_count": "Players ٤",
			"scores": "Score ٢ - ١",
			"match_target": "Match target ٣ rounds",
			"piece_counters": "Pieces remaining ٦",
			"dialogs_status": "Status · round ٢",
			"reconnect_ui": "Reconnect in ٥ s",
			"round_end": "Round ٢ ended · ٢ - ١",
			"match_end": "Match ended · Player ٤ · ٣ - ١",
		}
	return {
		"room_code": "رمز الغرفة ٥٤",
		"player_label": "اللاعب ٤",
		"player_count": "عدد اللاعبين ٤",
		"scores": "النتيجة ٢ - ١",
		"match_target": "هدف المباراة ٣ أشواط",
		"piece_counters": "الأحجار المتبقية ٦",
		"dialogs_status": "الحالة · الجولة ٢",
		"reconnect_ui": "إعادة الاتصال خلال ٥ ث",
		"round_end": "نهاية الجولة ٢ · ٢ - ١",
		"match_end": "نهاية المباراة · اللاعب ٤ · ٣ - ١",
	}


func _publish_visible_targets() -> void:
	if not OS.has_feature("web") or not bool(match_controller.get("gameplay_ready")):
		return
	camera = match_controller.get("camera") as Camera3D
	var records_value: Variant = match_controller.get("piece_records")
	if camera == null or not records_value is Array:
		return
	var records: Array = records_value as Array
	var direction: String = str(match_controller.call("_current_direction"))
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var center: Vector2 = viewport_size * 0.5
	var best_by_size: Dictionary = {}
	var distance_by_size: Dictionary = {}

	for index: int in range(records.size()):
		var record: Dictionary = records[index] as Dictionary
		if bool(record.get("played", false)) or str(record.get("dir", "")) != direction:
			continue
		var size_name: String = str(record.get("type", ""))
		var mesh_instance := record.get("mesh") as MeshInstance3D
		if mesh_instance == null:
			continue
		var offset: Vector3
		match size_name:
			"large": offset = Vector3(17.0, 0.0, 9.5)
			"medium": offset = Vector3(12.5, 0.0, 7.0)
			_: offset = Vector3(8.0, 0.0, 4.5)
		var point: Vector2 = camera.unproject_position(mesh_instance.to_global(offset))
		var visible: bool = point.x >= 0.0 and point.x <= viewport_size.x and point.y >= 0.0 and point.y <= viewport_size.y
		var distance: float = point.distance_squared_to(center) + (0.0 if visible else 100000000.0)
		if not distance_by_size.has(size_name) or distance < float(distance_by_size[size_name]):
			distance_by_size[size_name] = distance
			best_by_size[size_name] = {"index": index, "point": point, "name": str(mesh_instance.name)}

	if best_by_size.is_empty():
		return
	var script: String = ""
	for size_name: String in ["small", "medium", "large"]:
		if not best_by_size.has(size_name):
			continue
		var best: Dictionary = best_by_size[size_name] as Dictionary
		var point: Vector2 = best["point"] as Vector2
		var cap: String = size_name.capitalize()
		script += "document.body.dataset.yakolakTest%sX='%s';" % [cap, str(point.x)]
		script += "document.body.dataset.yakolakTest%sY='%s';" % [cap, str(point.y)]

	var generic_size: String = "large" if best_by_size.has("large") else str(best_by_size.keys()[0])
	var generic: Dictionary = best_by_size[generic_size] as Dictionary
	var generic_point: Vector2 = generic["point"] as Vector2
	script += "document.body.dataset.yakolakTestPieceX='%s';" % str(generic_point.x)
	script += "document.body.dataset.yakolakTestPieceY='%s';" % str(generic_point.y)
	script += "document.body.dataset.yakolakTestPiece='%s';" % str(generic["name"])
	script += "document.body.dataset.yakolakVerificationTarget='visible-nearest';"
	JavaScriptBridge.eval(script, true)
