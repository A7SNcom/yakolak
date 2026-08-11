extends "res://scripts/gameplay_state_inventory.gd"

# The production gameplay layer accepts intro ownership only from the explicit
# lifecycle signals exposed by intro_handoff.gd. The inherited polling path is
# kept as a defensive same-state fallback, but `playing` and worker guards are
# never authority to start gameplay.


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
	# Scene ordering can make the first lifecycle signal precede this child _ready.
	# Consume only an already-published explicit token; never infer from visuals.
	_try_consume_explicit_handoff(intro_generation_seen)


func _on_explicit_intro_run_started(generation: int) -> void:
	if intro == null or generation != int(intro.get("intro_run_generation")):
		return
	intro_generation_seen = generation
	gameplay_ready = false
	if initialized:
		_reset_for_intro()


func _on_explicit_gameplay_handoff_ready(generation: int) -> void:
	_try_consume_explicit_handoff(generation)


func _try_consume_explicit_handoff(generation: int) -> void:
	if intro == null or generation <= 0:
		return
	if generation != int(intro.get("intro_run_generation")):
		return
	intro_generation_seen = generation
	if intro.has_method("consume_gameplay_handoff") and bool(intro.call("consume_gameplay_handoff", generation)):
		_enable_gameplay()


func _intro_handoff_ready() -> bool:
	return _intro_handoff_is_consumed()
