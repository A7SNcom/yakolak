extends SceneTree

# Regression for the production gameplay handoff claim across signal, direct,
# reconnect and polling delivery, with delayed initialization held event-driven.
# The intro token remains the only ownership authority; initialization may only
# wake an already-owned consumer claim once and never once per frame.

const TIMEOUT_MSEC: int = 5000
const LONG_DELAY_FRAMES: int = 24

var failures: Array[String] = []
var intro: Node
var game: Node


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	intro = preload("res://scenes/intro.tscn").instantiate()
	root.add_child(intro)
	game = intro.get_node_or_null("PostIntroGameplay")
	_expect(game != null, "post-intro gameplay exists")
	if game == null:
		await _finish()
		return
	_expect(await _wait_until(Callable(self, "_game_initialized")), "gameplay initializes before handoff delivery test")

	# Structural guard: polling remains a delivery source into the shared claim,
	# while delayed initialization contains no SceneTree process-frame retry loop.
	var gameplay_source: String = FileAccess.get_file_as_string("res://scripts/gameplay.gd")
	_expect(not gameplay_source.contains("intro.call(\"consume_gameplay_handoff\", intro_generation_seen)"), "frame polling has no direct token-consume path")
	_expect(gameplay_source.contains("_accept_gameplay_handoff_delivery(intro_generation_seen, \"polling\")"), "frame polling still enters shared consumer claim")
	_expect(not gameplay_source.contains("_schedule_claimed_gameplay_handoff_resume"), "delayed initialization no longer owns a frame scheduler")
	_expect(not gameplay_source.contains("process_frame.connect"), "gameplay handoff has no per-frame wake connection")
	_expect(gameplay_source.contains("_complete_gameplay_consumer_initialization"), "initialization completion owns the delayed-claim wake")

	var claims_before: int = int(game.get("intro_handoff_claim_count"))
	var consumes_before: int = int(intro.get("gameplay_handoff_consume_count"))
	var applications_before: int = int(game.get("intro_handoff_apply_count"))
	var resets_before: int = int(game.get("intro_run_started_reset_count"))

	# Generation 1: production completion emits signal and also direct-dispatches
	# the same generation. The consumer claim must make the pair exactly-once.
	intro.call("_restart_intro")
	var combined_generation: int = int(intro.get("intro_run_generation"))
	_expect(await _wait_until(Callable(self, "_replay_reset_seen").bind(combined_generation, resets_before + 1)), "first replay reset is one-shot")
	intro.set_process(false)
	_publish_true_completion()
	_expect(await _wait_until(Callable(self, "_handoff_consumed").bind(combined_generation)), "signal plus direct delivery consumes one handoff")
	_expect(int(game.get("intro_handoff_claim_count")) == claims_before + 1, "signal plus direct creates one claim")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == consumes_before + 1, "signal plus direct consumes token once")
	_expect(int(game.get("intro_handoff_apply_count")) == applications_before + 1, "signal plus direct enables gameplay once")
	_expect(str(game.get("intro_handoff_consumer_probe")) == "handoff-consumed", "successful delivery leaves successful probe")

	game.call("_on_explicit_gameplay_handoff_ready", combined_generation)
	intro.call("_dispatch_gameplay_handoff", combined_generation)
	await _settle_frames(3)
	_expect(int(game.get("intro_handoff_claim_count")) == claims_before + 1, "duplicate delivery cannot reclaim generation")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == consumes_before + 1, "duplicate delivery cannot reconsume token")
	_expect(int(game.get("intro_handoff_apply_count")) == applications_before + 1, "duplicate delivery cannot re-enable gameplay")
	_expect(str(game.get("intro_handoff_consumer_probe")) == "handoff-consumed", "duplicate delivery preserves successful probe")

	# Generation 2: disconnect the signal observer. The explicit direct fallback
	# must remain and must still enter exactly the same generation claim.
	intro.call("_restart_intro")
	var direct_generation: int = int(intro.get("intro_run_generation"))
	_expect(await _wait_until(Callable(self, "_replay_reset_seen").bind(direct_generation, resets_before + 2)), "direct-fallback replay reset is one-shot")
	var handoff_handler := Callable(game, "_on_explicit_gameplay_handoff_ready")
	if intro.is_connected("gameplay_handoff_ready", handoff_handler):
		intro.disconnect("gameplay_handoff_ready", handoff_handler)
	intro.set_process(false)
	_publish_true_completion()
	_expect(await _wait_until(Callable(self, "_handoff_consumed").bind(direct_generation)), "direct fallback alone consumes handoff")
	_expect(int(game.get("intro_handoff_claim_count")) == claims_before + 2, "direct fallback creates one fresh claim")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == consumes_before + 2, "direct fallback consumes one fresh token")
	_expect(int(game.get("intro_handoff_apply_count")) == applications_before + 2, "direct fallback enables once")

	# Generation 3: lose signal + direct delivery completely. The pending token is
	# still authoritative and polling may recover it only by entering the claim.
	intro.call("_restart_intro")
	var polling_generation: int = int(intro.get("intro_run_generation"))
	_expect(await _wait_until(Callable(self, "_replay_reset_seen").bind(polling_generation, resets_before + 3)), "polling replay reset is one-shot")
	intro.set_process(false)
	var poll_attempts_before: int = int(game.get("intro_handoff_poll_attempt_count"))
	var poll_claims_before: int = int(game.get("intro_handoff_poll_claim_count"))
	_publish_pending_without_delivery(polling_generation)
	_expect(await _wait_until(Callable(self, "_handoff_consumed").bind(polling_generation)), "polling recovers handoff when active delivery is lost")
	_expect(int(game.get("intro_handoff_claim_count")) == claims_before + 3, "polling recovery creates one shared claim")
	_expect(int(game.get("intro_handoff_poll_claim_count")) == poll_claims_before + 1, "polling source owns one claim only")
	_expect(int(game.get("intro_handoff_poll_attempt_count")) == poll_attempts_before + 1, "polling needs one claim attempt")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == consumes_before + 3, "polling consumes token once through claim")
	_expect(int(game.get("intro_handoff_apply_count")) == applications_before + 3, "polling enables once through claim")
	var poll_attempts_after_success: int = int(game.get("intro_handoff_poll_attempt_count"))
	await _settle_frames(8)
	_expect(int(game.get("intro_handoff_poll_attempt_count")) == poll_attempts_after_success, "polling stops per-frame attempts after handoff success")

	# Reconnect signal observation before delayed-init coverage so reconnect itself
	# cannot be confused with a separate ownership authority.
	if not intro.is_connected("gameplay_handoff_ready", handoff_handler):
		intro.connect("gameplay_handoff_ready", handoff_handler)

	# Generation 4: a handoff arrives while the consumer is deliberately marked
	# uninitialized. Hold the already-created claim across a long delay. No token,
	# application or wake count may change during many process frames.
	intro.call("_restart_intro")
	var delayed_generation: int = int(intro.get("intro_run_generation"))
	_expect(await _wait_until(Callable(self, "_replay_reset_seen").bind(delayed_generation, resets_before + 4)), "delayed-init replay reset is one-shot")
	intro.set_process(false)
	game.set_process(false)
	game.set("initialized", false)
	var delayed_claims_before: int = int(game.get("intro_handoff_claim_count"))
	var delayed_consumes_before: int = int(intro.get("gameplay_handoff_consume_count"))
	var delayed_applications_before: int = int(game.get("intro_handoff_apply_count"))
	var delayed_holds_before: int = int(game.get("intro_handoff_init_hold_count"))
	var delayed_wakes_before: int = int(game.get("intro_handoff_init_wake_count"))
	_publish_pending_without_delivery(delayed_generation)
	game.call("accept_intro_handoff", delayed_generation)
	await _settle_frames(LONG_DELAY_FRAMES)
	_expect(int(game.get("intro_handoff_claim_count")) == delayed_claims_before + 1, "delayed consumer claims generation once before initialization")
	_expect(int(game.get("intro_handoff_init_hold_count")) == delayed_holds_before + 1, "long delay stores one pending claimed generation")
	_expect(int(game.get("intro_handoff_pending_init_generation")) == delayed_generation, "pending initialization tracks only claimed generation")
	_expect(int(game.get("intro_handoff_init_wake_count")) == delayed_wakes_before, "long delay creates zero frame wakes")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == delayed_consumes_before, "long delay does not consume token early")
	_expect(int(game.get("intro_handoff_apply_count")) == delayed_applications_before, "long delay does not enable gameplay early")
	_expect(str(game.get("intro_handoff_consumer_probe")) == "handoff-pending-init", "long delay remains observably pending inside claim")

	# Initialization completion is the sole wake event. Repeating completion or
	# delivering the same generation afterward must remain silent and one-shot.
	game.call("_complete_gameplay_consumer_initialization")
	_expect(await _wait_until(Callable(self, "_handoff_consumed").bind(delayed_generation)), "initialization completion resumes claimed handoff")
	_expect(int(game.get("intro_handoff_init_wake_count")) == delayed_wakes_before + 1, "initialization completion wakes claim exactly once")
	_expect(int(game.get("intro_handoff_pending_init_generation")) == -1, "successful wake clears pending generation")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == delayed_consumes_before + 1, "initialization completion consumes one token")
	_expect(int(game.get("intro_handoff_apply_count")) == delayed_applications_before + 1, "initialization completion enables once")
	game.call("_complete_gameplay_consumer_initialization")
	game.call("accept_intro_handoff", delayed_generation)
	await _settle_frames(5)
	_expect(int(game.get("intro_handoff_init_wake_count")) == delayed_wakes_before + 1, "duplicate completion cannot wake again")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == delayed_consumes_before + 1, "duplicate completion cannot reconsume")
	game.set_process(true)

	# Generation 5: claim while uninitialized, then replay BEFORE initialization
	# completes. The old pending generation must be cancelled synchronously by the
	# new intro generation and must never touch its token afterward.
	intro.call("_restart_intro")
	var stale_generation: int = int(intro.get("intro_run_generation"))
	_expect(await _wait_until(Callable(self, "_replay_reset_seen").bind(stale_generation, resets_before + 5)), "stale-claim replay reset is one-shot")
	intro.set_process(false)
	game.set_process(false)
	game.set("initialized", false)
	var stale_consumes_before: int = int(intro.get("gameplay_handoff_consume_count"))
	var stale_wakes_before: int = int(game.get("intro_handoff_init_wake_count"))
	_publish_pending_without_delivery(stale_generation)
	game.call("accept_intro_handoff", stale_generation)
	await _settle_frames(10)
	_expect(int(game.get("intro_handoff_pending_init_generation")) == stale_generation, "old generation is pending before replay")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == stale_consumes_before, "old generation token remains untouched before replay")

	intro.call("_restart_intro")
	var final_generation: int = int(intro.get("intro_run_generation"))
	intro.set_process(false)
	await _settle_frames(2)
	_expect(final_generation == stale_generation + 1, "replay advances to a fresh generation while consumer is delayed")
	_expect(int(game.get("intro_generation_seen")) == final_generation, "delayed consumer observes replay generation")
	_expect(int(game.get("intro_handoff_pending_init_generation")) == -1, "replay cancels stale pending claim silently")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == stale_consumes_before, "replay cancellation never consumes stale token")
	game.call("_complete_gameplay_consumer_initialization")
	await _settle_frames(3)
	_expect(int(game.get("intro_handoff_init_wake_count")) == stale_wakes_before, "initialization after replay cannot wake cancelled generation")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == stale_consumes_before, "initialization after replay still leaves stale token untouched")
	game.set_process(true)

	# The replayed generation then publishes its own fresh token. Signal + direct
	# can deliver it normally, proving old claim cancellation does not block the
	# next generation and that token/claim ownership remains exactly-once.
	var final_claims_before: int = int(game.get("intro_handoff_claim_count"))
	var final_apps_before: int = int(game.get("intro_handoff_apply_count"))
	_publish_true_completion()
	_expect(await _wait_until(Callable(self, "_handoff_consumed").bind(final_generation)), "post-cancellation replay consumes fresh handoff")
	_expect(int(game.get("intro_handoff_claim_count")) == final_claims_before + 1, "post-cancellation replay receives one fresh claim")
	_expect(int(game.get("intro_handoff_claimed_generation")) == final_generation, "fresh claim belongs only to replay generation")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == stale_consumes_before + 1, "post-cancellation replay consumes one fresh token")
	_expect(int(game.get("intro_handoff_apply_count")) == final_apps_before + 1, "post-cancellation replay enables once")
	_expect(str(game.get("intro_handoff_consumer_probe")) == "handoff-consumed", "final successful replay leaves stable probe")

	await _finish()


func _publish_true_completion() -> void:
	intro.call("_snap_final")
	intro.set("playing", false)
	intro.call("_publish_complete")


func _publish_pending_without_delivery(generation: int) -> void:
	# Test-only representation of a handoff whose signal/direct delivery was lost.
	# The root still owns a real pending generation token; no consumer callback is
	# emitted here, so only the selected delivery path may discover it.
	intro.set("gameplay_handoff_published_generation", generation)
	intro.set("gameplay_handoff_pending", true)
	intro.set("gameplay_handoff_emit_count", int(intro.get("gameplay_handoff_emit_count")) + 1)


func _game_initialized() -> bool:
	return game != null and bool(game.get("initialized"))


func _handoff_consumed(generation: int) -> bool:
	return (
		int(intro.get("gameplay_handoff_consumed_generation")) == generation
		and int(game.get("intro_handoff_claimed_generation")) == generation
		and str(game.get("intro_handoff_consumer_probe")) == "handoff-consumed"
	)


func _replay_reset_seen(generation: int, expected_resets: int) -> bool:
	return (
		int(game.get("intro_generation_seen")) == generation
		and int(game.get("intro_run_started_reset_generation")) == generation
		and int(game.get("intro_run_started_reset_count")) == expected_resets
		and not bool(game.get("intro_runtime_suspended"))
	)


func _wait_until(predicate: Callable) -> bool:
	var deadline: int = Time.get_ticks_msec() + TIMEOUT_MSEC
	while Time.get_ticks_msec() < deadline:
		if bool(predicate.call()):
			return true
		await process_frame
	return false


func _settle_frames(count: int) -> void:
	for _frame: int in range(count):
		await process_frame


func _expect(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)


func _finish() -> void:
	Engine.time_scale = 1.0
	if game != null and is_instance_valid(game):
		game.set_process(true)
		if not bool(game.get("initialized")):
			game.call("_complete_gameplay_consumer_initialization")
	if intro != null and is_instance_valid(intro):
		intro.queue_free()
		await process_frame
		await process_frame
		await process_frame
	if failures.is_empty():
		print("YAKOLAK_INTRO_HANDOFF_DELIVERY_DEDUPE_OK signal=1 direct=1 polling=claim-only delayed-init=event-wake stale-replay=cancelled generations=6 probe=stable")
		quit(0)
		return
	for failure: String in failures:
		push_error(failure)
	quit(1)
