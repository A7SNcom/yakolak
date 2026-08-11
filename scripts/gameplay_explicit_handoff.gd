extends "res://scripts/gameplay_state_inventory.gd"

# The production gameplay layer accepts intro ownership only from the explicit
# lifecycle contract exposed by intro_handoff.gd. Signals are the observer API;
# the root also directly dispatches the same explicit event in exported Web so
# delivery never depends on process polling. The one-shot generation token is
# still the single authority that can transfer ownership. Readiness itself lives
# in the shared gameplay base so subclasses cannot redefine the contract.


func _ready() -> void:
	super._ready()
	if intro == null:
		_publish_consumer_probe("ready-no-intro")
		return
	intro_generation_seen = int(intro.get("intro_run_generation"))
	var started_handler := Callable(self, "_on_explicit_intro_run_started")
	if intro.has_signal("intro_run_started") and not intro.is_connected("intro_run_started", started_handler):
		intro.connect("intro_run_started", started_handler)
	var handoff_handler := Callable(self, "_on_explicit_gameplay_handoff_ready")
	if intro.has_signal("gameplay_handoff_ready") and not intro.is_connected("gameplay_handoff_ready", handoff_handler):
		intro.connect("gameplay_handoff_ready", handoff_handler)
	_publish_consumer_probe("connected")
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
	if intro == null:
		_publish_consumer_probe("intro-start-no-root")
		return
	if generation != int(intro.get("intro_run_generation")):
		_publish_consumer_probe("intro-start-stale-generation")
		return
	intro_generation_seen = generation
	gameplay_ready = false
	if initialized:
		_reset_for_intro()
	_publish_consumer_probe("intro-started")


func accept_intro_handoff(generation: int) -> void:
	if intro == null:
		intro = get_parent() as Node3D
	_publish_consumer_probe("handoff-seen")
	_try_consume_explicit_handoff(generation)


func _try_consume_explicit_handoff(generation: int) -> void:
	if intro == null:
		_publish_consumer_probe("consume-no-root")
		return
	if generation <= 0:
		_publish_consumer_probe("consume-invalid-generation")
		return
	if generation != int(intro.get("intro_run_generation")):
		_publish_consumer_probe("consume-stale-generation")
		return
	intro_generation_seen = generation
	if not initialized:
		_publish_consumer_probe("handoff-pending-init")
		# True completion normally happens long after interaction initialization,
		# but keep delivery lossless for accelerated tests or future scene changes.
		call_deferred("_try_consume_explicit_handoff", generation)
		return
	if not intro.has_method("consume_gameplay_handoff"):
		_publish_consumer_probe("consume-method-missing")
		return
	if bool(intro.call("consume_gameplay_handoff", generation)):
		_publish_consumer_probe("handoff-consumed")
		_enable_gameplay()
	else:
		_publish_consumer_probe("handoff-token-rejected")


func _publish_consumer_probe(value: String) -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakIntroHandoffConsumer='%s';" % value, true)
