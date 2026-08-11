extends "res://scripts/gameplay_state_inventory.gd"

# The production gameplay layer accepts intro ownership only from the explicit
# lifecycle contract exposed by intro_handoff.gd. Signals are the observer API;
# the root also directly dispatches the same explicit event in exported Web so
# delivery never depends on process polling. The one-shot generation token is
# still the single authority that can transfer ownership. Readiness itself lives
# in the shared gameplay base so subclasses cannot redefine the contract.

# `intro_generation_seen` is the shared start-event claim across explicit signal,
# direct dispatch, and the base polling fallback. Once one path claims a current
# generation, every duplicate path for that generation becomes a no-op.
var intro_run_started_reset_generation: int = -1
var intro_run_started_reset_count: int = 0

# Signal delivery and direct Web dispatch intentionally deliver the same handoff
# generation. This consumer-side claim collapses those delivery paths BEFORE the
# token is consumed. It never grants gameplay ownership: only the intro token can
# do that. A generation is claimable only while its published token is pending.
var intro_handoff_claimed_generation: int = -1
var intro_handoff_claim_count: int = 0
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
	# Signal delivery and direct Web dispatch are intentionally both kept. They
	# are synchronous fallbacks for the same lifecycle event, so the first path
	# claims the generation through `intro_generation_seen` and every duplicate
	# path exits before mutating gameplay or resetting session/restore state.
	if generation == intro_generation_seen:
		_publish_consumer_probe("intro-start-duplicate-generation")
		return
	intro_generation_seen = generation
	gameplay_ready = false
	if initialized:
		intro_run_started_reset_generation = generation
		intro_run_started_reset_count += 1
		_reset_for_intro()
		print("YAKOLAK_INTRO_RUN_RESET generation=%d resets=%d" % [generation, intro_run_started_reset_count])
	_publish_consumer_probe("intro-started")


func accept_intro_handoff(generation: int) -> void:
	if intro == null:
		intro = get_parent() as Node3D
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
	# The first signal/direct path for a published pending token claims delivery.
	# Every same-generation duplicate returns before touching the token or the Web
	# probe, so a successful `handoff-consumed` state cannot be overwritten by the
	# expected second delivery path.
	if generation == intro_handoff_claimed_generation:
		return
	if int(intro.get("gameplay_handoff_published_generation")) != generation:
		return
	if not bool(intro.get("gameplay_handoff_pending")):
		return
	intro_handoff_claimed_generation = generation
	intro_handoff_claim_count += 1
	print("YAKOLAK_INTRO_HANDOFF_CLAIMED generation=%d claims=%d" % [generation, intro_handoff_claim_count])
	_publish_consumer_probe("handoff-seen")
	_consume_claimed_explicit_handoff(generation)


func _consume_claimed_explicit_handoff(generation: int) -> void:
	# A replay can invalidate a deferred old-generation attempt. Drop it silently
	# rather than letting stale work overwrite observability for the new owner.
	if intro == null:
		return
	if generation != intro_handoff_claimed_generation:
		return
	if generation != int(intro.get("intro_run_generation")):
		return
	if not initialized:
		_publish_consumer_probe("handoff-pending-init")
		# True completion normally happens long after interaction initialization,
		# but keep delivery lossless for accelerated tests or future scene changes.
		call_deferred("_consume_claimed_explicit_handoff", generation)
		return
	if not intro.has_method("consume_gameplay_handoff"):
		_publish_consumer_probe("consume-method-missing")
		return
	if bool(intro.call("consume_gameplay_handoff", generation)):
		_publish_consumer_probe("handoff-consumed")
		_enable_gameplay()
	else:
		# This is now a genuine failure of the one claimed delivery, not the normal
		# signal+direct duplicate path after a successful consume.
		_publish_consumer_probe("handoff-token-rejected")


func _publish_consumer_probe(value: String) -> void:
	intro_handoff_consumer_probe = value
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakIntroHandoffConsumer='%s';" % value, true)
