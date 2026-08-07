extends "res://scripts/web_gpu_warmup.gd"

var automation_fast: bool = false


func _ready() -> void:
	super._ready()
	if OS.has_feature("web"):
		automation_fast = bool(JavaScriptBridge.eval("Boolean(navigator.webdriver)", true))


func _process(delta: float) -> void:
	if not automation_fast:
		super._process(delta)
		return
	if intro == null or preintro == null or visual_polish == null:
		return
	_gate_loader_handoff()
	if completed:
		_release_when_loader_is_ready()
		return
	if not bool(preintro.get("primed")) or not bool(preintro.get("initialized")) or not bool(visual_polish.get("initialized")):
		return
	_complete_warmup()
	_release_when_loader_is_ready()
