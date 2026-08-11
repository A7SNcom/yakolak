extends "res://scripts/gameplay_state_inventory.gd"

# The production gameplay layer accepts intro ownership only from the explicit
# lifecycle contract exposed by intro_handoff.gd. Signals are the observer API;
# the root also directly dispatches the same explicit event in exported Web so
# delivery never depends on one mechanism. Polling remains a final loss-recovery
# fallback, but all delivery sources now enter the shared base consumer claim.
# The one-shot generation token is still the single authority that can transfer
# ownership. Readiness itself lives in the shared gameplay base so subclasses
# cannot redefine the contract.

# `intro_generation_seen` is the shared start-event claim across explicit signal,
# direct dispatch, and the base polling fallback. Once one path claims a current
# generation, every duplicate path for that generation becomes a no-op.
var intro_run_started_reset_generation: int = -1
var intro_run_started_reset_count: int = 0
# A replay can arrive before gameplay has finished building its consumer state.
# Keep only the newest generation's reset obligation. This is not ownership: the
# existing handoff token/consumer claim remain the only path that can enable play.
var intro_run_started_pending_reset_generation: int = -1

# The delivery claim itself lives in gameplay.gd so signal, direct, reconnect,
# and frame polling cannot own separate consumption paths. This layer only adds
# Web observability for that shared claim.
var intro_handoff_consumer_probe: String = ""


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
	# consumer reconnect. Reconnect is only another delivery source into the same
	# claim; it never bypasses the token or creates a second ownership authority.
	_accept_gameplay_handoff_delivery(intro_generation_seen, "ready-reconnect")


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
	# Signal delivery and direct Web dispatch are intentionally both kept. They
	# are synchronous fallbacks for the same lifecycle event, so the first path
	# claims the generation through `intro_generation_seen` and every duplicate
	# path exits before mutating gameplay or resetting session/restore state.
	if generation == intro_generation_seen:
		_publish_consumer_probe("intro-start-duplicate-generation")
		return
	# A replay owns a new generation even if gameplay initialization is still
	# incomplete. Cancel any held handoff from the old generation immediately;
	# completion of initialization must never wake stale ownership work.
	_cancel_pending_gameplay_handoff_initialization()
	intro_generation_seen = generation
	gameplay_ready = false
	if initialized:
		intro_run_started_pending_reset_generation = -1
		_apply_intro_run_started_reset(generation)
	else:
		# Only the newest pre-init replay keeps a reset obligation. A later replay
		# silently replaces this integer before any reset side effect can occur.
		intro_run_started_pending_reset_generation = generation
	_publish_consumer_probe("intro-started")


func _complete_gameplay_consumer_initialization() -> void:
	# `_initialize_when_ready()` has already built the consumer state when this
	# callback is reached. Apply the newest deferred intro reset synchronously
	# before the base completion can wake an already-claimed handoff generation.
	if initialized:
		return
	_apply_pending_intro_run_started_reset()
	super._complete_gameplay_consumer_initialization()


func _apply_pending_intro_run_started_reset() -> void:
	var generation: int = intro_run_started_pending_reset_generation
	if generation <= 0:
		return
	intro_run_started_pending_reset_generation = -1
	if intro == null:
		return
	if generation != intro_generation_seen:
		return
	if generation != int(intro.get("intro_run_generation")):
		return
	# A same-generation handoff may already have claimed its token delivery while
	# initialization was delayed. `_reset_for_intro()` intentionally cancels held
	# handoffs, so preserve only this already-existing current claim across the
	# reset; the token remains authoritative and is consumed later by the base wake.
	_apply_intro_run_started_reset(generation, true)


func _apply_intro_run_started_reset(generation: int, preserve_claimed_handoff: bool = false) -> void:
	if intro == null:
		return
	if generation <= 0:
		return
	if generation != int(intro.get("intro_run_generation")):
		return
	if generation == intro_run_started_reset_generation:
		return
	var held_handoff_generation: int = intro_handoff_pending_init_generation if preserve_claimed_handoff else -1
	intro_run_started_reset_generation = generation
	intro_run_started_reset_count += 1
	_reset_for_intro()
	# Restoring this value does not claim or consume anything. It only retains the
	# current generation's claim that existed before the reset, and only while the
	# original pending token is still current and authoritative.
	if (
		preserve_claimed_handoff
		and held_handoff_generation == generation
		and intro_handoff_claimed_generation == generation
		and int(intro.get("intro_run_generation")) == generation
		and int(intro.get("gameplay_handoff_published_generation")) == generation
		and bool(intro.get("gameplay_handoff_pending"))
	):
		intro_handoff_pending_init_generation = held_handoff_generation
	print("YAKOLAK_INTRO_RUN_RESET generation=%d resets=%d" % [generation, intro_run_started_reset_count])


func accept_intro_handoff(generation: int) -> void:
	if intro == null:
		intro = get_parent() as Node3D
	_accept_gameplay_handoff_delivery(generation, "explicit")


func _publish_intro_handoff_consumer_probe(value: String) -> void:
	_publish_consumer_probe(value)


func _publish_consumer_probe(value: String) -> void:
	intro_handoff_consumer_probe = value
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakIntroHandoffConsumer='%s';" % value, true)
