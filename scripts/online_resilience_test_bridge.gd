extends Node

# Browser-only deterministic hook used by Playwright. It is inert for normal
# players and only exists when the explicit yakolakTestFast query flag is set.

var gameplay: Node
var start_callback: Variant


func _ready() -> void:
	if not OS.has_feature("web"):
		return
	var enabled: Variant = JavaScriptBridge.eval("new URL(location.href).searchParams.get('yakolakTestFast')==='1'", true)
	if not bool(enabled):
		return
	gameplay = get_parent().get_node_or_null("PostIntroGameplay")
	if gameplay == null:
		return
	start_callback = JavaScriptBridge.create_callback(_start_online_test)
	var window: JavaScriptObject = JavaScriptBridge.get_interface("window")
	if window != null:
		window.set("yakolakTestStartOnline", start_callback)


func _start_online_test(_arguments: Array) -> void:
	if gameplay == null:
		return
	gameplay.call("_start_online_host", {
		"rounds": 3,
		"players": [
			{"active": true, "color": "marble", "mode": "local", "label": "أنا", "direction": "right"},
			{"active": true, "color": "blue", "mode": "online", "label": "اللاعب 2", "direction": "back"},
		]
	})
