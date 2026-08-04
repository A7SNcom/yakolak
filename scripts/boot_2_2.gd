extends Node

const GAME_SCENE_PATH := "res://scenes/main.tscn"
const STARTUP_TIMEOUT_SECONDS := 12.0

var overlay: CanvasLayer
var status_label: Label


func _ready() -> void:
	_build_startup_overlay()
	await get_tree().process_frame
	await _start_game()


func _build_startup_overlay() -> void:
	overlay = CanvasLayer.new()
	overlay.layer = 100
	add_child(overlay)

	var background := ColorRect.new()
	background.color = Color("#efede8")
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.add_child(background)

	var center := VBoxContainer.new()
	center.set_anchors_preset(Control.PRESET_CENTER)
	center.offset_left = -260.0
	center.offset_right = 260.0
	center.offset_top = -110.0
	center.offset_bottom = 110.0
	center.alignment = BoxContainer.ALIGNMENT_CENTER
	center.add_theme_constant_override("separation", 16)
	overlay.add_child(center)

	var star := Label.new()
	star.text = "★"
	star.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	star.add_theme_font_size_override("font_size", 70)
	star.add_theme_color_override("font_color", Color("#d6a936"))
	center.add_child(star)

	var title := Label.new()
	title.text = "ياكلك 2.2"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 32)
	title.add_theme_color_override("font_color", Color("#171717"))
	center.add_child(title)

	status_label = Label.new()
	status_label.text = "تشغيل محرك اللعبة…"
	status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	status_label.add_theme_font_size_override("font_size", 18)
	status_label.add_theme_color_override("font_color", Color("#5b574f"))
	center.add_child(status_label)


func _start_game() -> void:
	status_label.text = "فحص ملفات اللعبة…"
	var packed := ResourceLoader.load(GAME_SCENE_PATH, "PackedScene", ResourceLoader.CACHE_MODE_REUSE) as PackedScene
	if packed == null:
		_fail_startup("تعذر فتح مشهد اللعبة.")
		return

	status_label.text = "بناء الغرفة واللوحة…"
	var game := packed.instantiate()
	if game == null:
		_fail_startup("تعذر إنشاء مشهد اللعبة.")
		return
	add_child(game)

	var deadline := Time.get_ticks_msec() + int(STARTUP_TIMEOUT_SECONDS * 1000.0)
	while Time.get_ticks_msec() < deadline:
		await get_tree().create_timer(0.1).timeout
		if _contains_start_button(game):
			if is_instance_valid(overlay):
				overlay.queue_free()
			_signal_browser_ready()
			return

	_fail_startup("بدأ المحرك لكن واجهة اللعبة لم تكتمل.")


func _contains_start_button(node: Node) -> bool:
	if node is Button and "ابدأ اللعبة" in String(node.text):
		return true
	for child in node.get_children():
		if _contains_start_button(child):
			return true
	return false


func _fail_startup(message: String) -> void:
	status_label.text = message + " أعد تحميل الصفحة."
	status_label.add_theme_color_override("font_color", Color("#b42318"))
	_signal_browser_error(message)


func _signal_browser_ready() -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.parent.postMessage({type:'yakolak-ready',version:'2.2.0'}, '*'); document.body.dataset.yakolakReady='true';")


func _signal_browser_error(message: String) -> void:
	if OS.has_feature("web"):
		var safe_message := JSON.stringify(message)
		JavaScriptBridge.eval("window.parent.postMessage({type:'yakolak-error',message:%s}, '*');" % safe_message)
