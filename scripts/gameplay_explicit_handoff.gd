extends "res://scripts/gameplay_state_inventory.gd"

# The production gameplay layer accepts intro ownership only from the explicit
# lifecycle contract exposed by intro_handoff.gd. Signals are the observer API;
# the root also directly dispatches the same explicit event in exported Web so
# delivery never depends on process polling. The one-shot generation token is
# still the single authority that can transfer ownership.


func _ready() -> void:
	super._ready()
	if intro == null:
		return
	intro_generation_seen = int(intro.get("intro_run_generation"))
	var started_handler := Callable(self, "_on_explicit_intro_run_started")
	if intro.has_signal("intro_run_started") and not intro.is_connected("intro_run_started", started_handler):
		intro.connect("intro_run_started", started_handler)
	var handoff_handler := Callable(self, "_on_explicit_gameplay_handoff_ready")
	if intro.has_signal("gameplay_handoff_ready") and not intro.is_connected("gameplay_handoff_ready", handoff_handler):
		intro.connect("gameplay_handoff_ready", handoff_handler)
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakIntroHandoffConsumer='connected';", true)
	# Scene ordering can make an already-published lifecycle token exist before a
	# consumer reconnect. Consume only that explicit token; never infer visuals.
	_try_consume_explicit_handoff(intro_generation_seen)


func _on_explicit_intro_run_started(generation: int) -> void:
	accept_intro_run_started(generation)


func _on_explicit_gameplay_handoff_ready(generation: int) -> void:
	accept_intro_handoff(generation)


func accept_intro_run_started(generation: int) -> void:
	if intro == null:
		intro = get_parent() as Node3D
	if intro == null or generation != int(intro.get("intro_run_generation")):
		return
	intro_generation_seen = generation
	gameplay_ready = false
	if initialized:
		_reset_for_intro()
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakIntroHandoffConsumer='intro-started';", true)


func accept_intro_handoff(generation: int) -> void:
	if intro == null:
		intro = get_parent() as Node3D
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakIntroHandoffConsumer='handoff-seen';", true)
	_try_consume_explicit_handoff(generation)


func _try_consume_explicit_handoff(generation: int) -> void:
	if intro == null or generation <= 0:
		return
	if generation != int(intro.get("intro_run_generation")):
		return
	intro_generation_seen = generation
	if not initialized:
		# True completion normally happens long after interaction initialization,
		# but keep delivery lossless for accelerated tests or future scene changes.
		call_deferred("_try_consume_explicit_handoff", generation)
		return
	if intro.has_method("consume_gameplay_handoff") and bool(intro.call("consume_gameplay_handoff", generation)):
		_enable_gameplay()


func _intro_handoff_ready() -> bool:
	return _intro_handoff_is_consumed()
