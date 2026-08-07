extends "res://scripts/smooth_intro_timeline.gd"

var automation_fast: bool = false


func _ready() -> void:
	super._ready()
	if OS.has_feature("web"):
		automation_fast = bool(JavaScriptBridge.eval("Boolean(navigator.webdriver)", true))


func _process(delta: float) -> void:
	if not automation_fast:
		super._process(delta)
		return
	if intro == null or preintro == null or not bool(preintro.get("completed")):
		return
	if not active:
		if bool(intro.get("playing")):
			_take_control()
		else:
			return

	governed_elapsed_ms = minf(governed_elapsed_ms + 500.0, TOTAL_TIME_MS)
	_sync_original_clock()
	if not bool(intro.get("contents_revealed")) and governed_elapsed_ms >= LID_CONTENT_REVEAL_MS:
		intro.set("contents_revealed", true)
		intro.call("_set_internal_visibility", true)
	intro.call("_apply_timeline", governed_elapsed_ms)
	intro.call("_publish_timeline_stage", governed_elapsed_ms)
	if governed_elapsed_ms >= TOTAL_TIME_MS:
		_finish_controlled_intro()
