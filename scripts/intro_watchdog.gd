extends Node

const MAX_INTRO_SECONDS := 25.0


func _ready() -> void:
	await get_tree().create_timer(MAX_INTRO_SECONDS).timeout
	var intro := get_parent()
	if intro == null or bool(intro.get("intro_complete")):
		return
	print("YAKOLAK_INTRO_WATCHDOG_TRIGGERED")
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakFallback = '1';", true)
	intro.call("_snap_final")
