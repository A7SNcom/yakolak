extends SceneTree

# Regression for the production gameplay consumer's signal + direct + polling
# handoff delivery. The intro token remains ownership authority, while every
# delivery source must claim each published generation once before attempting
# consume/_enable_gameplay.

const TIMEOUT_MSEC: int = 5000

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

	# Structural guard: gameplay.gd's frame fallback may discover delivery state,
	# but direct token consumption from _process must never return.
	var gameplay_source: String = FileAccess.get_file_as_string("res://scripts/gameplay.gd")
	_expect(not gameplay_source.contains("intro.call(\"consume_gameplay_handoff\", intro_generation_seen)"), "frame polling has no direct token-consume path")
	_expect(gameplay_source.contains("_accept_gameplay_handoff_delivery(intro_generation_seen, \"polling\")"), "frame polling enters shared consumer claim")

	var claims_before: int = int(game.get("intro_handoff_claim_count"))
	var consumes_before: int = int(intro.get("gameplay_handoff_consume_count"))
	var applications_before: int = int(game.get("intro_handoff_apply_count"))
	var resets_before: int = int(game.get("intro_run_started_reset_count"))

	# Start a fresh deterministic generation. Production restart itself uses both
	# signal and direct dispatch; its existing reset claim must still run once.
	intro.call("_restart_intro")
	var combined_generation: int = int(intro.get("intro_run_generation"))
	await _settle_frames(2)
	_expect(combined_generation > 0, "combined handoff generation is valid")
	_expect(int(game.get("intro_run_started_reset_count")) == resets_before + 1, "replay reset remains one-shot before handoff")
	intro.set_process(false)

	# Production completion emits gameplay_handoff_ready and then invokes the
	# explicit direct Web fallback synchronously for the exact same generation.
	_publish_true_completion()
	_expect(await _wait_until(Callable(self, "_handoff_consumed").bind(combined_generation)), "signal plus direct delivery reaches one successful consume")
	_expect(int(game.get("intro_handoff_claim_count")) == claims_before + 1, "signal plus direct delivery creates one consumer claim")
	_expect(int(game.get("intro_handoff_claimed_generation")) == combined_generation, "consumer claim belongs to completed generation")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == consumes_before + 1, "signal plus direct delivery consumes token once")
	_expect(int(game.get("intro_handoff_apply_count")) == applications_before + 1, "signal plus direct delivery enables gameplay once")
	_expect(str(game.get("intro_handoff_consumer_probe")) == "handoff-consumed", "successful consume is the final consumer probe")

	# Re-deliver the exact same event through both public consumer paths. This is
	# intentionally after token consumption: it must be a silent duplicate claim,
	# not a second token attempt that rewrites success as handoff-token-rejected.
	game.call("_on_explicit_gameplay_handoff_ready", combined_generation)
	intro.call("_dispatch_gameplay_handoff", combined_generation)
	await _settle_frames(3)
	_expect(int(game.get("intro_handoff_claim_count")) == claims_before + 1, "duplicate same-generation delivery cannot reclaim consumer")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == consumes_before + 1, "duplicate same-generation delivery cannot reconsume token")
	_expect(int(game.get("intro_handoff_apply_count")) == applications_before + 1, "duplicate same-generation delivery cannot rerun gameplay enable or restore path")
	_expect(str(game.get("intro_handoff_consumer_probe")) == "handoff-consumed", "duplicate delivery preserves successful Web probe state")

	# The next replay is a new ownership generation. Disconnect only the signal
	# observer before completion: the explicit direct dispatch fallback must still
	# claim and consume exactly one fresh token, proving the fallback was retained.
	intro.call("_restart_intro")
	var replay_generation: int = int(intro.get("intro_run_generation"))
	_expect(replay_generation == combined_generation + 1, "next replay advances exactly one generation")
	_expect(await _wait_until(Callable(self, "_replay_reset_seen").bind(replay_generation, resets_before + 2)), "next replay reset is observed once")
	_expect(int(game.get("intro_handoff_claim_count")) == claims_before + 1, "replay start alone does not claim a handoff")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == consumes_before + 1, "replay start alone consumes no handoff")
	_expect(int(game.get("intro_handoff_apply_count")) == applications_before + 1, "replay reset does not apply gameplay ownership")

	var handoff_handler := Callable(game, "_on_explicit_gameplay_handoff_ready")
	if intro.is_connected("gameplay_handoff_ready", handoff_handler):
		intro.disconnect("gameplay_handoff_ready", handoff_handler)
	intro.set_process(false)
	_publish_true_completion()
	_expect(await _wait_until(Callable(self, "_handoff_consumed").bind(replay_generation)), "direct fallback alone consumes replay handoff")
	_expect(int(game.get("intro_handoff_claim_count")) == claims_before + 2, "replay creates exactly one new consumer claim")
	_expect(int(game.get("intro_handoff_claimed_generation")) == replay_generation, "replay claim belongs to new generation")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == consumes_before + 2, "replay consumes exactly one new token")
	_expect(int(game.get("intro_handoff_apply_count")) == applications_before + 2, "replay applies gameplay ownership exactly once")
	_expect(str(game.get("intro_handoff_consumer_probe")) == "handoff-consumed", "direct fallback leaves successful probe")

	intro.call("_dispatch_gameplay_handoff", replay_generation)
	await _settle_frames(3)
	_expect(int(game.get("intro_handoff_claim_count")) == claims_before + 2, "replay duplicate direct delivery cannot reclaim")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == consumes_before + 2, "replay duplicate direct delivery cannot reconsume")
	_expect(int(game.get("intro_handoff_apply_count")) == applications_before + 2, "replay duplicate direct delivery cannot rerun restore/application work")
	_expect(str(game.get("intro_handoff_consumer_probe")) == "handoff-consumed", "replay duplicate preserves successful probe")

	# Generation 3 simulates complete loss of signal + direct handoff delivery.
	# Only the published pending token exists. Frame polling must recover it by
	# entering the exact same claim; it must not have a private consume/enable path.
	intro.call("_restart_intro")
	var polling_generation: int = int(intro.get("intro_run_generation"))
	_expect(polling_generation == replay_generation + 1, "polling replay advances one generation")
	_expect(await _wait_until(Callable(self, "_replay_reset_seen").bind(polling_generation, resets_before + 3)), "polling replay reset is observed once")
	intro.set_process(false)
	var poll_attempts_before: int = int(game.get("intro_handoff_poll_attempt_count"))
	var poll_claims_before: int = int(game.get("intro_handoff_poll_claim_count"))
	_publish_pending_without_delivery(polling_generation)
	_expect(await _wait_until(Callable(self, "_handoff_consumed").bind(polling_generation)), "polling recovers one handoff when signal and direct delivery are lost")
	_expect(int(game.get("intro_handoff_claim_count")) == claims_before + 3, "polling recovery creates exactly one shared consumer claim")
	_expect(int(game.get("intro_handoff_claimed_generation")) == polling_generation, "polling claim belongs to current generation")
	_expect(int(game.get("intro_handoff_poll_claim_count")) == poll_claims_before + 1, "polling source records exactly one claim")
	_expect(int(game.get("intro_handoff_poll_attempt_count")) == poll_attempts_before + 1, "polling needs exactly one claim attempt for pending token")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == consumes_before + 3, "polling recovery consumes token once through claim")
	_expect(int(game.get("intro_handoff_apply_count")) == applications_before + 3, "polling recovery enables gameplay once through claim")
	_expect(str(game.get("intro_handoff_consumer_probe")) == "handoff-consumed", "polling recovery leaves successful consumer probe")

	# Once handoff succeeds, _process must make zero further polling attempts for
	# that generation even across extra frames.
	var poll_attempts_after_success: int = int(game.get("intro_handoff_poll_attempt_count"))
	await _settle_frames(8)
	_expect(int(game.get("intro_handoff_poll_attempt_count")) == poll_attempts_after_success, "polling stops all per-frame claim attempts after handoff success")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == consumes_before + 3, "post-success frames cannot reconsume token")
	_expect(int(game.get("intro_handoff_apply_count")) == applications_before + 3, "post-success frames cannot rerun gameplay enable")
	_expect(str(game.get("intro_handoff_consumer_probe")) == "handoff-consumed", "post-success polling silence preserves successful probe")

	# Generation 4 exercises delayed consumer initialization. Delivery claims the
	# generation first, but token consumption is deferred inside that same claim
	# until initialization is ready; polling is disabled so no competing path can
	# hide a split authority bug.
	intro.call("_restart_intro")
	var delayed_generation: int = int(intro.get("intro_run_generation"))
	_expect(delayed_generation == polling_generation + 1, "delayed-init replay advances one generation")
	_expect(await _wait_until(Callable(self, "_replay_reset_seen").bind(delayed_generation, resets_before + 4)), "delayed-init replay reset is observed once")
	intro.set_process(false)
	game.set_process(false)
	game.set("initialized", false)
	var delayed_claims_before: int = int(game.get("intro_handoff_claim_count"))
	var delayed_consumes_before: int = int(intro.get("gameplay_handoff_consume_count"))
	_publish_pending_without_delivery(delayed_generation)
	game.call("accept_intro_handoff", delayed_generation)
	await _settle_frames(2)
	_expect(int(game.get("intro_handoff_claim_count")) == delayed_claims_before + 1, "delayed consumer claims generation once before initialization")
	_expect(int(game.get("intro_handoff_claimed_generation")) == delayed_generation, "delayed consumer claim tracks current generation")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == delayed_consumes_before, "delayed initialization does not consume token early")
	_expect(str(game.get("intro_handoff_consumer_probe")) == "handoff-pending-init", "delayed initialization is observable inside claimed delivery")
	game.set("initialized", true)
	_expect(await _wait_until(Callable(self, "_handoff_consumed").bind(delayed_generation)), "claimed delayed handoff consumes after initialization becomes ready")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == delayed_consumes_before + 1, "delayed handoff consumes exactly one token")
	_expect(int(game.get("intro_handoff_apply_count")) == applications_before + 4, "delayed handoff enables gameplay exactly once")
	game.set_process(true)

	# Generation 5 reconnects the signal observer and returns to normal production
	# signal + direct delivery. A replay must mint one fresh claim/token only; the
	# polling claim from generation 3 cannot leak into this generation.
	if not intro.is_connected("gameplay_handoff_ready", handoff_handler):
		intro.connect("gameplay_handoff_ready", handoff_handler)
	var poll_claims_after_recovery: int = int(game.get("intro_handoff_poll_claim_count"))
	intro.call("_restart_intro")
	var final_generation: int = int(intro.get("intro_run_generation"))
	_expect(final_generation == delayed_generation + 1, "post-reconnect replay advances one generation")
	_expect(await _wait_until(Callable(self, "_replay_reset_seen").bind(final_generation, resets_before + 5)), "post-reconnect replay reset is observed once")
	intro.set_process(false)
	_publish_true_completion()
	_expect(await _wait_until(Callable(self, "_handoff_consumed").bind(final_generation)), "reconnected signal plus direct delivery consumes fresh handoff")
	_expect(int(game.get("intro_handoff_claim_count")) == claims_before + 5, "each of five generations creates one claim only")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == consumes_before + 5, "each of five generations consumes one token only")
	_expect(int(game.get("intro_handoff_apply_count")) == applications_before + 5, "each of five generations applies gameplay once only")
	_expect(int(game.get("intro_handoff_poll_claim_count")) == poll_claims_after_recovery, "normal replay does not create an extra polling claim")
	_expect(str(game.get("intro_handoff_consumer_probe")) == "handoff-consumed", "final replay leaves successful probe")

	await _finish()


func _publish_true_completion() -> void:
	intro.call("_snap_final")
	intro.set("playing", false)
	intro.call("_publish_complete")


func _publish_pending_without_delivery(generation: int) -> void:
	# Test-only representation of a handoff whose signal/direct delivery was lost.
	# The root still owns a real pending generation token; no consumer callback is
	# emitted here, so only production frame polling can discover the delivery.
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
		game.set("initialized", true)
	if intro != null and is_instance_valid(intro):
		intro.queue_free()
		await process_frame
		await process_frame
		await process_frame
	if failures.is_empty():
		print("YAKOLAK_INTRO_HANDOFF_DELIVERY_DEDUPE_OK signal=1 direct=1 polling=claim-only delayed-init=claim-only generations=5 probe=stable")
		quit(0)
		return
	for failure: String in failures:
		push_error(failure)
	quit(1)
