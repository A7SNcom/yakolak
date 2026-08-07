extends "res://scripts/gameplay_session_passplay.gd"

# Round-transition safety layer.
# The intro has a development replay hook in _unhandled_input(). During live
# gameplay an unhandled mobile tap (especially the result/next-round button)
# must never restart the intro behind the match.

var web_force_round_callback: Variant


func _ready() -> void:
	super._ready()
	if OS.has_feature("web"):
		web_force_round_callback = JavaScriptBridge.create_callback(_on_web_force_round_complete)
		var window: JavaScriptObject = JavaScriptBridge.get_interface("window")
		if window != null:
			window.set("yakolakTestForceRoundComplete", web_force_round_callback)


func _enable_gameplay() -> void:
	super._enable_gameplay()
	_lock_intro_replay()


func _on_round_action() -> void:
	_lock_intro_replay()
	super._on_round_action()


func _finish_round_reset() -> void:
	_lock_intro_replay()
	if camera != null:
		camera.current = true
	super._finish_round_reset()


func _reset_for_intro() -> void:
	# Only an intentional programmatic intro restart should restore its replay
	# listener. Normal gameplay never reaches this path after replay is locked.
	if intro != null:
		intro.set_process_unhandled_input(true)
	super._reset_for_intro()


func _lock_intro_replay() -> void:
	if intro != null:
		intro.set_process_unhandled_input(false)
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakIntroReplay='locked';", true)


func _on_web_force_round_complete(_arguments: Array) -> void:
	if not match_initialized or round_complete:
		return
	_finish_round(_current_direction(), [])
	call_deferred("_publish_round_button_target")


func _publish_round_button_target() -> void:
	if not OS.has_feature("web") or result_button == null or not result_button.visible:
		return
	var rect: Rect2 = result_button.get_global_rect()
	var center: Vector2 = rect.position + rect.size * 0.5
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakRoundButtonX='%.2f';" % center.x +
		"document.body.dataset.yakolakRoundButtonY='%.2f';" % center.y,
		true
	)
