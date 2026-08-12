extends SceneTree

# Regression for monotonic, generation-bound intro handoff observability. Ownership
# remains unchanged: the intro token, shared consumer claim, reconnect and polling
# paths are exercised only to prove they cannot downgrade a successful probe.

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
	_expect(await _wait_until(Callable(self, "_game_initialized")), "gameplay initializes before probe monotonicity test")
	if failures.size() > 0:
		await _finish()
		return

	# Structural guard: observability owns generation/terminal metadata only in the
	# explicit layer. The shared ownership/token/polling implementation stays in the
	# base gameplay script and is not redefined by this regression.
	var explicit_source: String = FileAccess.get_file_as_string("res://scripts/gameplay_explicit_handoff.gd")
	_expect(explicit_source.contains("var intro_handoff_consumer_probe_generation: int = -1"), "probe tracks its generation")
	_expect(explicit_source.contains("var intro_handoff_consumer_probe_terminal_generation: int = -1"), "probe tracks terminal consumed generation")
	_expect(explicit_source.contains("_publish_consumer_probe(\"intro-start-stale-generation\", generation)"), "stale start publication remains generation-bound")
	_expect(explicit_source.contains("_publish_consumer_probe(\"intro-start-duplicate-generation\", generation)"), "duplicate start publication remains generation-bound")
	_expect(explicit_source.contains("func _publish_intro_handoff_consumer_probe(value: String, generation: int)"), "explicit handoff probe accepts delivered generation")
	_expect(explicit_source.contains("_publish_consumer_probe(value, generation)"), "explicit handoff probe forwards delivered generation unchanged")
	_expect(explicit_source.contains("yakolakIntroHandoffConsumerGeneration"), "Web observability exposes the generation beside handoff state")
	_expect(explicit_source.contains("gameplay_handoff_consumed_generation"), "probe observes authoritative consumed generation without changing token logic")

	var base_source: String = FileAccess.get_file_as_string("res://scripts/gameplay.gd")
	_expect(base_source.contains("_accept_gameplay_handoff_delivery(intro_generation_seen, \"polling\")"), "polling remains on shared handoff claim")
	_expect(base_source.contains("intro.call(\"consume_gameplay_handoff\", generation)"), "token consumption remains in unchanged base consumer")
	_expect(base_source.contains("func _publish_intro_handoff_consumer_probe(_value: String, _generation: int)"), "base observability boundary carries generation")
	_expect(base_source.contains("_publish_intro_handoff_consumer_probe(\"consume-stale-generation\", generation)"), "stale handoff diagnostic carries original generation")
	_expect(base_source.contains("_publish_intro_handoff_consumer_probe(\"consume-invalid-generation\", generation)"), "invalid handoff diagnostic carries original generation")
	_expect(base_source.contains("_publish_intro_handoff_consumer_probe(\"consume-start-unclaimed\", generation)"), "unclaimed-start diagnostic carries original generation")
	_expect(base_source.contains("_publish_intro_handoff_consumer_probe(\"handoff-consumed\", generation)"), "terminal handoff diagnostic carries original generation")

	var resets_before: int = int(game.get("intro_run_started_reset_count"))
	var claims_before: int = int(game.get("intro_handoff_claim_count"))
	var consumes_before: int = int(intro.get("gameplay_handoff_consume_count"))
	var applications_before: int = int(game.get("intro_handoff_apply_count"))

	# Generation 1: complete normally, then replay every late duplicate/stale start
	# shape after successful ownership transfer. Success must remain terminal.
	intro.call("_restart_intro")
	var first_generation: int = int(intro.get("intro_run_generation"))
	_expect(await _wait_until(Callable(self, "_replay_reset_seen").bind(first_generation, resets_before + 1)), "first replay start/reset is accepted once")
	intro.set_process(false)
	_publish_true_completion()
	_expect(await _wait_until(Callable(self, "_handoff_consumed").bind(first_generation)), "first replay consumes handoff")
	_expect(int(game.get("intro_handoff_claim_count")) == claims_before + 1, "first replay creates one handoff claim")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == consumes_before + 1, "first replay consumes token once")
	_expect(int(game.get("intro_handoff_apply_count")) == applications_before + 1, "first replay enables gameplay once")
	_expect(int(game.get("intro_handoff_consumer_probe_generation")) == first_generation, "successful probe belongs to first generation")
	_expect(int(game.get("intro_handoff_consumer_probe_terminal_generation")) == first_generation, "first consumed generation is terminal")

	var first_claims_after: int = int(game.get("intro_handoff_claim_count"))
	var first_consumes_after: int = int(intro.get("gameplay_handoff_consume_count"))
	var first_apps_after: int = int(game.get("intro_handoff_apply_count"))
	intro.call("_dispatch_intro_run_started", first_generation)
	game.call("_on_explicit_intro_run_started", first_generation)
	game.call("accept_intro_run_started", first_generation)
	if first_generation > 1:
		game.call("accept_intro_run_started", first_generation - 1)
	await _settle_frames(3)
	_expect(str(game.get("intro_handoff_consumer_probe")) == "handoff-consumed", "late duplicate/stale starts cannot hide first success")
	_expect(int(game.get("intro_handoff_consumer_probe_generation")) == first_generation, "late starts cannot move first probe generation")
	_expect(int(game.get("intro_handoff_claim_count")) == first_claims_after, "late starts cannot reclaim first generation")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == first_consumes_after, "late starts cannot reconsume first token")
	_expect(int(game.get("intro_handoff_apply_count")) == first_apps_after, "late starts cannot re-enable first generation")

	# A stale handoff diagnostic before the next replay starts must stay historical.
	# It cannot downgrade the terminal first-generation success or mutate ownership.
	if first_generation > 1:
		game.call("_accept_gameplay_handoff_delivery", first_generation - 1, "stale-before-next-start")
	await _settle_frames(2)
	_expect(str(game.get("intro_handoff_consumer_probe")) == "handoff-consumed", "stale handoff before next start cannot downgrade first success")
	_expect(int(game.get("intro_handoff_consumer_probe_generation")) == first_generation, "pre-next-start stale handoff cannot change first probe attribution")
	_expect(int(game.get("intro_handoff_claim_count")) == first_claims_after, "pre-next-start stale handoff cannot claim ownership")

	# Generation 2: disconnect the start signal so direct dispatch owns the fresh
	# start, then delay consumer initialization and use reconnect as handoff source.
	# Old-generation delivery must not overwrite the new generation's observability.
	var started_handler := Callable(game, "_on_explicit_intro_run_started")
	if intro.is_connected("intro_run_started", started_handler):
		intro.disconnect("intro_run_started", started_handler)
	game.set_process(false)
	game.set("initialized", false)
	game.set("move_count", 14)
	var delayed_resets_before: int = int(game.get("intro_run_started_reset_count"))
	intro.call("_restart_intro")
	var second_generation: int = int(intro.get("intro_run_generation"))
	intro.set_process(false)
	await _settle_frames(2)
	_expect(second_generation == first_generation + 1, "next replay advances exactly one generation")
	_expect(int(game.get("intro_generation_seen")) == second_generation, "direct fallback claims second start")
	_expect(int(game.get("intro_run_started_pending_reset_generation")) == second_generation, "delayed second start keeps one reset obligation")
	_expect(int(game.get("intro_run_started_reset_count")) == delayed_resets_before, "delayed second start does not reset early")
	_expect(str(game.get("intro_handoff_consumer_probe")) == "intro-started", "new generation starts fresh observability")
	_expect(int(game.get("intro_handoff_consumer_probe_generation")) == second_generation, "fresh observability is bound to second generation")
	_expect(int(game.get("intro_handoff_consumer_probe_terminal_generation")) == first_generation, "old terminal generation does not block fresh replay")

	# These are the exact regressions for the original bug: a late generation-N
	# handoff and an invalid delivery arrive while N+1 is current. Neither may be
	# attributed to N+1 or replace its fresh probe.
	game.call("_accept_gameplay_handoff_delivery", first_generation, "stale-after-current-start")
	game.call("_accept_gameplay_handoff_delivery", 0, "invalid-after-current-start")
	await _settle_frames(2)
	_expect(str(game.get("intro_handoff_consumer_probe")) == "intro-started", "old/invalid handoff diagnostics cannot poison current probe")
	_expect(int(game.get("intro_handoff_consumer_probe_generation")) == second_generation, "old/invalid diagnostics cannot be relabeled as current generation")

	game.call("accept_intro_run_started", first_generation)
	await _settle_frames(2)
	_expect(str(game.get("intro_handoff_consumer_probe")) == "intro-started", "stale previous generation cannot replace fresh start")
	_expect(int(game.get("intro_handoff_consumer_probe_generation")) == second_generation, "stale previous generation cannot move fresh probe")

	# Reconnect the signal and deliver a same-generation duplicate before handoff.
	# The accepted start remains the stronger same-generation state.
	if not intro.is_connected("intro_run_started", started_handler):
		intro.connect("intro_run_started", started_handler)
	game.call("_on_explicit_intro_run_started", second_generation)
	await _settle_frames(2)
	_expect(str(game.get("intro_handoff_consumer_probe")) == "intro-started", "reconnected duplicate start cannot downgrade accepted start")

	var second_claims_before: int = int(game.get("intro_handoff_claim_count"))
	var second_consumes_before: int = int(intro.get("gameplay_handoff_consume_count"))
	var second_apps_before: int = int(game.get("intro_handoff_apply_count"))
	_publish_pending_without_delivery(second_generation)
	game.call("_accept_gameplay_handoff_delivery", second_generation, "ready-reconnect")
	await _settle_frames(2)
	_expect(int(game.get("intro_handoff_claim_count")) == second_claims_before + 1, "reconnect creates one second-generation claim")
	_expect(int(game.get("intro_handoff_pending_init_generation")) == second_generation, "reconnect holds second claim until initialization")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == second_consumes_before, "delayed reconnect does not consume token early")
	_expect(str(game.get("intro_handoff_consumer_probe")) == "handoff-pending-init", "second generation progresses to pending handoff")
	_expect(int(game.get("intro_handoff_consumer_probe_generation")) == second_generation, "same-generation handoff diagnostic stays attributed to second generation")

	# Signal/direct duplicates after the shared claim must be inert: no extra claim,
	# no token access, and no observability rewrite.
	var claimed_second_count: int = int(game.get("intro_handoff_claim_count"))
	game.call("_on_explicit_gameplay_handoff_ready", second_generation)
	game.call("accept_intro_handoff", second_generation)
	await _settle_frames(2)
	_expect(int(game.get("intro_handoff_claim_count")) == claimed_second_count, "signal/direct handoff duplicates cannot create a second claim")
	_expect(str(game.get("intro_handoff_consumer_probe")) == "handoff-pending-init", "signal/direct handoff duplicates cannot rewrite pending observability")
	_expect(int(game.get("intro_handoff_consumer_probe_generation")) == second_generation, "duplicate handoff observability remains second-generation bound")

	game.call("accept_intro_run_started", second_generation)
	game.call("accept_intro_run_started", first_generation)
	await _settle_frames(2)
	_expect(str(game.get("intro_handoff_consumer_probe")) == "handoff-pending-init", "duplicate/stale starts cannot downgrade pending handoff")
	_expect(int(game.get("intro_handoff_consumer_probe_generation")) == second_generation, "pending handoff remains second-generation bound")

	game.call("_complete_gameplay_consumer_initialization")
	_expect(await _wait_until(Callable(self, "_handoff_consumed").bind(second_generation)), "initialization completion consumes second handoff")
	_expect(int(game.get("intro_run_started_reset_count")) == delayed_resets_before + 1, "second deferred reset applies once before ownership")
	_expect(int(game.get("intro_run_started_reset_generation")) == second_generation, "second deferred reset belongs to current replay")
	_expect(int(game.get("move_count")) == 0, "deferred reset side effects run before second ownership")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == second_consumes_before + 1, "second generation consumes token once")
	_expect(int(game.get("intro_handoff_apply_count")) == second_apps_before + 1, "second generation enables once")
	_expect(int(game.get("intro_handoff_consumer_probe_terminal_generation")) == second_generation, "second consumed generation becomes terminal")

	var second_claims_after: int = int(game.get("intro_handoff_claim_count"))
	var second_consumes_after: int = int(intro.get("gameplay_handoff_consume_count"))
	var second_apps_after: int = int(game.get("intro_handoff_apply_count"))
	game.call("accept_intro_run_started", second_generation)
	game.call("_on_explicit_intro_run_started", second_generation)
	game.call("accept_intro_run_started", first_generation)
	game.call("_accept_gameplay_handoff_delivery", first_generation, "stale-after-consume")
	game.call("_on_explicit_gameplay_handoff_ready", second_generation)
	await _settle_frames(3)
	_expect(str(game.get("intro_handoff_consumer_probe")) == "handoff-consumed", "second success remains final after delayed duplicate/stale deliveries")
	_expect(int(game.get("intro_handoff_consumer_probe_generation")) == second_generation, "second final probe remains generation-bound")
	_expect(int(game.get("intro_handoff_claim_count")) == second_claims_after, "post-success deliveries cannot reclaim second generation")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == second_consumes_after, "post-success deliveries cannot reconsume second token")
	_expect(int(game.get("intro_handoff_apply_count")) == second_apps_after, "post-success deliveries cannot re-enable second generation")

	# Generation 3 proves consecutive replay rollover: the old terminal marker may
	# remain historical, but the visible probe immediately belongs to the new run
	# and reaches one fresh terminal success.
	game.set_process(true)
	var third_resets_before: int = int(game.get("intro_run_started_reset_count"))
	var third_claims_before: int = int(game.get("intro_handoff_claim_count"))
	var third_consumes_before: int = int(intro.get("gameplay_handoff_consume_count"))
	var third_apps_before: int = int(game.get("intro_handoff_apply_count"))
	intro.call("_restart_intro")
	var third_generation: int = int(intro.get("intro_run_generation"))
	_expect(await _wait_until(Callable(self, "_replay_reset_seen").bind(third_generation, third_resets_before + 1)), "third replay reset is accepted once")
	intro.set_process(false)
	_expect(str(game.get("intro_handoff_consumer_probe")) == "intro-started", "third replay opens a fresh probe")
	_expect(int(game.get("intro_handoff_consumer_probe_generation")) == third_generation, "third probe owns new generation")
	_publish_true_completion()
	_expect(await _wait_until(Callable(self, "_handoff_consumed").bind(third_generation)), "third replay reaches consumed once")
	_expect(int(game.get("intro_handoff_claim_count")) == third_claims_before + 1, "third replay claims once")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == third_consumes_before + 1, "third replay consumes once")
	_expect(int(game.get("intro_handoff_apply_count")) == third_apps_before + 1, "third replay enables once")
	game.call("accept_intro_run_started", second_generation)
	game.call("accept_intro_run_started", third_generation)
	game.call("_accept_gameplay_handoff_delivery", second_generation, "stale-after-third-consume")
	await _settle_frames(2)
	_expect(str(game.get("intro_handoff_consumer_probe")) == "handoff-consumed", "third consumed probe survives old/current late deliveries")
	_expect(int(game.get("intro_handoff_consumer_probe_generation")) == third_generation, "third consumed probe remains attributed to third generation")
	_expect(int(game.get("intro_handoff_consumer_probe_terminal_generation")) == third_generation, "third generation becomes the latest terminal probe")

	await _finish()


func _publish_true_completion() -> void:
	intro.call("_snap_final")
	intro.set("playing", false)
	intro.call("_publish_complete")


func _publish_pending_without_delivery(generation: int) -> void:
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
		and int(game.get("intro_handoff_consumer_probe_generation")) == generation
	)


func _replay_reset_seen(generation: int, expected_resets: int) -> bool:
	return (
		int(game.get("intro_generation_seen")) == generation
		and int(game.get("intro_run_started_reset_generation")) == generation
		and int(game.get("intro_run_started_reset_count")) == expected_resets
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
		print("YAKOLAK_INTRO_HANDOFF_PROBE_MONOTONIC_OK generations=3 consumed=terminal stale-handoff=isolated invalid=unattributed duplicates=ignored reconnect=covered delayed-init=covered")
		quit(0)
		return
	for failure: String in failures:
		push_error(failure)
	quit(1)
