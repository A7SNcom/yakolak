extends SceneTree

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
	_expect(await _wait_until(Callable(self, "_game_initialized")), "gameplay initializes before start-event dedupe test")

	# Structural ordering guard: the production explicit layer must settle any
	# deferred intro reset inside initialization completion before delegating to
	# the base completion, whose existing responsibility is waking a held handoff.
	var explicit_source: String = FileAccess.get_file_as_string("res://scripts/gameplay_explicit_handoff.gd")
	var completion_start: int = explicit_source.find("func _complete_gameplay_consumer_initialization()")
	var pending_apply_position: int = explicit_source.find("_apply_pending_intro_run_started_reset()", completion_start)
	var base_completion_position: int = explicit_source.find("super._complete_gameplay_consumer_initialization()", completion_start)
	_expect(explicit_source.contains("var intro_run_started_pending_reset_generation: int = -1"), "consumer keeps one pending intro reset generation")
	_expect(completion_start >= 0 and pending_apply_position > completion_start, "initialization completion applies pending intro reset")
	_expect(base_completion_position > pending_apply_position, "pending intro reset is applied before base handoff wake")
	_expect(explicit_source.contains("intro_handoff_pending_init_generation = held_handoff_generation"), "same-generation claimed handoff survives only the deferred reset")

	# The base frame fallback is allowed to discover a lost start, but it must not
	# retain independent reset authority. Its only action is redelivery into the
	# production accept_intro_run_started claim used by signal/direct dispatch.
	var base_source: String = FileAccess.get_file_as_string("res://scripts/gameplay.gd")
	var process_start: int = base_source.find("func _process(_delta: float) -> void:")
	var handoff_poll_comment: int = base_source.find("# Polling is only a delivery fallback.", process_start)
	var process_intro_block: String = ""
	if process_start >= 0 and handoff_poll_comment > process_start:
		process_intro_block = base_source.substr(process_start, handoff_poll_comment - process_start)
	_expect(process_intro_block.contains("_recover_intro_run_start_by_polling(intro_generation)"), "frame fallback redelivers intro start through one helper")
	_expect(not process_intro_block.contains("_reset_for_intro()"), "frame fallback has no direct intro reset authority")
	_expect(base_source.contains("call(\"accept_intro_run_started\", generation)"), "polling helper enters the same public start claim")

	var initial_generation: int = int(intro.get("intro_run_generation"))
	var resets_before: int = int(game.get("intro_run_started_reset_count"))
	_expect(initial_generation > 0, "intro has an initial generation")

	# Production restart emits the signal and then directly dispatches the exact
	# same generation. Both paths must collapse into one gameplay reset.
	game.set("move_count", 9)
	intro.call("_restart_intro")
	var combined_generation: int = int(intro.get("intro_run_generation"))
	await _settle_frames(2)
	_expect(combined_generation == initial_generation + 1, "combined delivery advances one generation")
	_expect(int(game.get("intro_run_started_reset_count")) == resets_before + 1, "signal plus direct dispatch applies one reset")
	_expect(int(game.get("intro_run_started_reset_generation")) == combined_generation, "reset is owned by the combined generation")
	_expect(int(game.get("intro_generation_seen")) == combined_generation, "consumer claims combined generation")
	_expect(int(game.get("move_count")) == 0, "combined generation reset clears gameplay once")

	# Extra direct/signal delivery of the same generation stays a no-op.
	intro.call("_dispatch_intro_run_started", combined_generation)
	game.call("_on_explicit_intro_run_started", combined_generation)
	await _settle_frames(2)
	_expect(int(game.get("intro_run_started_reset_count")) == resets_before + 1, "same-generation redelivery cannot repeat reset")

	# Remove only the signal observer. The next replay must still arrive through
	# the explicit direct fallback and own exactly one new reset.
	var started_handler := Callable(game, "_on_explicit_intro_run_started")
	if intro.is_connected("intro_run_started", started_handler):
		intro.disconnect("intro_run_started", started_handler)
	game.set("move_count", 7)
	game.set("waiting_for_setup", true)
	intro.call("_restart_intro")
	var direct_only_generation: int = int(intro.get("intro_run_generation"))
	await _settle_frames(2)
	_expect(direct_only_generation == combined_generation + 1, "next replay advances one new generation")
	_expect(int(game.get("intro_run_started_reset_count")) == resets_before + 2, "direct fallback applies one new reset for next replay")
	_expect(int(game.get("intro_run_started_reset_generation")) == direct_only_generation, "direct fallback reset belongs to new generation")
	_expect(int(game.get("intro_generation_seen")) == direct_only_generation, "direct fallback claims new generation")
	_expect(int(game.get("move_count")) == 0, "direct fallback reset clears gameplay")
	_expect(game.get("waiting_for_setup") != true, "direct fallback reset clears setup ownership")

	# A delayed stale direct call cannot reopen or reset the current replay.
	intro.call("_dispatch_intro_run_started", combined_generation)
	await _settle_frames(2)
	_expect(int(game.get("intro_run_started_reset_count")) == resets_before + 2, "stale direct generation is rejected")

	# Delayed consumer initialization regression. Reconnect the signal first, then
	# deliberately hold initialization across several replay generations. No reset
	# may execute early, and the newest generation must silently replace older
	# pending reset obligations.
	if not intro.is_connected("intro_run_started", started_handler):
		intro.connect("intro_run_started", started_handler)
	var delayed_resets_before: int = int(game.get("intro_run_started_reset_count"))
	game.set_process(false)
	game.set("initialized", false)
	game.set("move_count", 11)
	game.set("waiting_for_setup", true)

	intro.call("_restart_intro")
	var delayed_first_generation: int = int(intro.get("intro_run_generation"))
	intro.set_process(false)
	await _settle_frames(2)
	_expect(int(game.get("intro_generation_seen")) == delayed_first_generation, "delayed consumer claims first replay generation")
	_expect(int(game.get("intro_run_started_pending_reset_generation")) == delayed_first_generation, "first replay before init stores pending reset")
	_expect(int(game.get("intro_run_started_reset_count")) == delayed_resets_before, "replay before init does not apply reset early")
	_expect(int(game.get("move_count")) == 11, "deferred reset side effects have not run early")

	# Lose the signal observer for one replay, then reconnect it for the next. The
	# direct fallback and restored signal both feed the same pending generation.
	if intro.is_connected("intro_run_started", started_handler):
		intro.disconnect("intro_run_started", started_handler)
	intro.call("_restart_intro")
	var delayed_second_generation: int = int(intro.get("intro_run_generation"))
	intro.set_process(false)
	_expect(delayed_second_generation == delayed_first_generation + 1, "direct-only delayed replay advances generation")
	_expect(int(game.get("intro_run_started_pending_reset_generation")) == delayed_second_generation, "new direct-only replay replaces old pending reset")
	if not intro.is_connected("intro_run_started", started_handler):
		intro.connect("intro_run_started", started_handler)
	intro.call("_restart_intro")
	var delayed_final_generation: int = int(intro.get("intro_run_generation"))
	intro.set_process(false)
	await _settle_frames(2)
	_expect(delayed_final_generation == delayed_second_generation + 1, "reconnected delayed replay advances to final generation")
	_expect(int(game.get("intro_generation_seen")) == delayed_final_generation, "latest replay owns delayed consumer generation")
	_expect(int(game.get("intro_run_started_pending_reset_generation")) == delayed_final_generation, "several pre-init replays keep latest reset only")
	_expect(int(game.get("intro_run_started_reset_count")) == delayed_resets_before, "several pre-init replays still apply zero resets early")
	_expect(int(game.get("move_count")) == 11, "replaced pending resets never mutate gameplay")

	game.call("accept_intro_run_started", delayed_first_generation)
	_expect(int(game.get("intro_run_started_pending_reset_generation")) == delayed_final_generation, "stale replay cannot replace latest pending reset")

	# Let the final generation publish a real pending ownership token and claim it
	# while initialization is still delayed. Completion must reset first, preserve
	# only this current claim, then let the unchanged base token path consume and
	# enable exactly once.
	var consumes_before_completion: int = int(intro.get("gameplay_handoff_consume_count"))
	var applications_before_completion: int = int(game.get("intro_handoff_apply_count"))
	var wakes_before_completion: int = int(game.get("intro_handoff_init_wake_count"))
	_publish_pending_without_delivery(delayed_final_generation)
	game.call("accept_intro_handoff", delayed_final_generation)
	await _settle_frames(2)
	_expect(int(game.get("intro_handoff_pending_init_generation")) == delayed_final_generation, "final handoff claim waits for delayed initialization")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == consumes_before_completion, "token is untouched before initialization completion")
	_expect(int(game.get("intro_handoff_apply_count")) == applications_before_completion, "gameplay is not enabled before initialization completion")

	game.call("_complete_gameplay_consumer_initialization")
	await _settle_frames(2)
	_expect(game.get("initialized") == true, "consumer initialization completes")
	_expect(int(game.get("intro_run_started_pending_reset_generation")) == -1, "completion clears pending intro reset")
	_expect(int(game.get("intro_run_started_reset_count")) == delayed_resets_before + 1, "latest delayed generation reset applies exactly once")
	_expect(int(game.get("intro_run_started_reset_generation")) == delayed_final_generation, "applied delayed reset belongs to final generation only")
	_expect(int(game.get("move_count")) == 0, "deferred reset executes before final gameplay ownership")
	_expect(int(game.get("intro_handoff_init_wake_count")) == wakes_before_completion + 1, "completion wakes final claimed handoff once")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == consumes_before_completion + 1, "completion consumes final token once after reset")
	_expect(int(intro.get("gameplay_handoff_consumed_generation")) == delayed_final_generation, "consumed token belongs to final replay generation")
	_expect(int(game.get("intro_handoff_apply_count")) == applications_before_completion + 1, "completion enables final gameplay once after reset")
	_expect(int(game.get("intro_handoff_pending_init_generation")) == -1, "consumed final claim leaves no pending initialization handoff")

	game.call("_complete_gameplay_consumer_initialization")
	game.call("accept_intro_handoff", delayed_final_generation)
	await _settle_frames(2)
	_expect(int(game.get("intro_run_started_reset_count")) == delayed_resets_before + 1, "duplicate completion cannot repeat delayed reset")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == consumes_before_completion + 1, "duplicate completion cannot reconsume final token")
	_expect(int(game.get("intro_handoff_apply_count")) == applications_before_completion + 1, "duplicate completion cannot re-enable final gameplay")

	# Normal replay after initialization keeps the original one-shot behavior.
	game.set("move_count", 4)
	game.set("waiting_for_setup", true)
	intro.call("_restart_intro")
	var post_init_generation: int = int(intro.get("intro_run_generation"))
	intro.set_process(false)
	await _settle_frames(2)
	_expect(post_init_generation == delayed_final_generation + 1, "post-init replay advances one generation")
	_expect(int(game.get("intro_run_started_pending_reset_generation")) == -1, "post-init replay never creates pending reset")
	_expect(int(game.get("intro_run_started_reset_count")) == delayed_resets_before + 2, "post-init replay still resets immediately once")
	_expect(int(game.get("intro_run_started_reset_generation")) == post_init_generation, "post-init reset belongs to current generation")
	_expect(int(game.get("move_count")) == 0, "post-init replay clears gameplay immediately")
	_expect(game.get("waiting_for_setup") != true, "post-init replay preserves full reset behavior")
	intro.call("_dispatch_intro_run_started", post_init_generation)
	game.call("_on_explicit_intro_run_started", post_init_generation)
	await _settle_frames(2)
	_expect(int(game.get("intro_run_started_reset_count")) == delayed_resets_before + 2, "post-init duplicate start remains one-shot")

	# Polling recovery regression: disconnect the signal and deliberately advance
	# the authoritative intro generation without emitting either signal or direct
	# dispatch. Frame polling must recover that lost start through the same accept
	# claim exactly once, without touching the handoff token/claim path.
	if intro.is_connected("intro_run_started", started_handler):
		intro.disconnect("intro_run_started", started_handler)
	var polling_resets_before: int = int(game.get("intro_run_started_reset_count"))
	var polling_attempts_before: int = int(game.get("intro_run_started_poll_attempt_count"))
	var polling_claims_before: int = int(game.get("intro_run_started_poll_claim_count"))
	var handoff_claims_before_polling: int = int(game.get("intro_handoff_claim_count"))
	var handoff_consumes_before_polling: int = int(intro.get("gameplay_handoff_consume_count"))
	game.set("move_count", 6)
	game.set("waiting_for_setup", true)
	intro.set("gameplay_handoff_pending", false)
	var polling_generation: int = post_init_generation + 1
	intro.set("intro_run_generation", polling_generation)
	game.set_process(true)
	await _settle_frames(3)
	_expect(int(game.get("intro_run_started_poll_attempt_count")) == polling_attempts_before + 1, "polling attempts one recovery for a missed start")
	_expect(int(game.get("intro_run_started_poll_claim_count")) == polling_claims_before + 1, "polling enters and wins the shared start claim once")
	_expect(int(game.get("intro_run_started_reset_count")) == polling_resets_before + 1, "polling recovery causes exactly one reset through accept path")
	_expect(int(game.get("intro_run_started_reset_generation")) == polling_generation, "polling recovery reset belongs to missed generation")
	_expect(int(game.get("intro_generation_seen")) == polling_generation, "polling recovery records the shared generation claim")
	_expect(int(game.get("move_count")) == 0, "polling recovery applies normal reset side effects")
	_expect(game.get("waiting_for_setup") != true, "polling recovery clears restored setup ownership once")
	_expect(int(game.get("intro_handoff_claim_count")) == handoff_claims_before_polling, "intro-start polling does not create a handoff consumer claim")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == handoff_consumes_before_polling, "intro-start polling does not consume the handoff token")

	await _settle_frames(4)
	_expect(int(game.get("intro_run_started_poll_attempt_count")) == polling_attempts_before + 1, "same recovered generation is not polled again")
	_expect(int(game.get("intro_run_started_poll_claim_count")) == polling_claims_before + 1, "same recovered generation cannot claim again")
	_expect(int(game.get("intro_run_started_reset_count")) == polling_resets_before + 1, "same recovered generation cannot reset twice")

	# A pending delayed-init reset remains authoritative. Once that generation has
	# already entered accept_intro_run_started, polling sees no unclaimed gap and
	# cannot bypass the pending obligation or call reset independently.
	game.set_process(false)
	game.set("initialized", false)
	game.set("move_count", 12)
	game.set("waiting_for_setup", true)
	var pending_generation: int = polling_generation + 1
	intro.set("intro_run_generation", pending_generation)
	game.call("accept_intro_run_started", pending_generation)
	var pending_resets_before: int = int(game.get("intro_run_started_reset_count"))
	var pending_poll_attempts_before: int = int(game.get("intro_run_started_poll_attempt_count"))
	_expect(int(game.get("intro_run_started_pending_reset_generation")) == pending_generation, "delayed generation stores one pending reset before completion")
	_expect(int(game.get("move_count")) == 12, "pending reset has not mutated gameplay early")
	game.call("_complete_gameplay_consumer_initialization")
	game.call("_process", 0.0)
	_expect(int(game.get("intro_run_started_pending_reset_generation")) == -1, "completion settles pending reset")
	_expect(int(game.get("intro_run_started_reset_count")) == pending_resets_before + 1, "pending reset applies once on completion")
	_expect(int(game.get("intro_run_started_reset_generation")) == pending_generation, "pending reset keeps current generation")
	_expect(int(game.get("intro_run_started_poll_attempt_count")) == pending_poll_attempts_before, "polling does not bypass an already-claimed pending reset")
	_expect(int(game.get("move_count")) == 0, "pending reset completes normal reset side effects")

	# Reconnect the signal observer, then lose the next direct/signal start again.
	# The next replay must receive one fresh polling claim and one fresh reset—not
	# reuse or repeat the previous generation's claim.
	if not intro.is_connected("intro_run_started", started_handler):
		intro.connect("intro_run_started", started_handler)
	var next_poll_attempts_before: int = int(game.get("intro_run_started_poll_attempt_count"))
	var next_poll_claims_before: int = int(game.get("intro_run_started_poll_claim_count"))
	var next_resets_before: int = int(game.get("intro_run_started_reset_count"))
	game.set("move_count", 5)
	game.set("waiting_for_setup", true)
	intro.set("gameplay_handoff_pending", false)
	var next_poll_generation: int = pending_generation + 1
	intro.set("intro_run_generation", next_poll_generation)
	game.set_process(true)
	await _settle_frames(3)
	_expect(int(game.get("intro_run_started_poll_attempt_count")) == next_poll_attempts_before + 1, "next replay gets one new polling recovery attempt")
	_expect(int(game.get("intro_run_started_poll_claim_count")) == next_poll_claims_before + 1, "next replay gets one new polling start claim")
	_expect(int(game.get("intro_run_started_reset_count")) == next_resets_before + 1, "next replay gets exactly one new reset")
	_expect(int(game.get("intro_run_started_reset_generation")) == next_poll_generation, "next replay reset belongs to its new generation")
	_expect(int(game.get("move_count")) == 0, "next replay reset clears gameplay")
	await _settle_frames(3)
	_expect(int(game.get("intro_run_started_reset_count")) == next_resets_before + 1, "next replay reset remains one-shot after more frames")

	await _finish()


func _publish_pending_without_delivery(generation: int) -> void:
	# Test-only representation of a handoff whose signal/direct delivery was lost.
	# The intro root still owns a real pending token; this helper does not call any
	# consumer path, so ownership remains exclusively with consume_gameplay_handoff.
	intro.set("gameplay_handoff_published_generation", generation)
	intro.set("gameplay_handoff_pending", true)
	intro.set("gameplay_handoff_emit_count", int(intro.get("gameplay_handoff_emit_count")) + 1)


func _game_initialized() -> bool:
	return game != null and game.get("initialized") == true


func _wait_until(predicate: Callable) -> bool:
	var deadline: int = Time.get_ticks_msec() + TIMEOUT_MSEC
	while Time.get_ticks_msec() < deadline:
		if predicate.call() == true:
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
	if intro != null and is_instance_valid(intro):
		intro.queue_free()
		await process_frame
		await process_frame
		await process_frame
	if failures.is_empty():
		print("YAKOLAK_INTRO_RUN_STARTED_DEDUPE_OK delivery=signal+direct polling=shared-claim delayed_reset=latest-only reset_before_handoff=1 replay=one-shot")
		quit(0)
		return
	for failure: String in failures:
		push_error(failure)
	quit(1)
