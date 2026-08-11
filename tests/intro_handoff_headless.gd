extends SceneTree

# Regression for the explicit intro -> gameplay ownership contract. Internal
# visual pauses, duplicate completion and deliberate intro replay must never
# synthesize an early or repeated handoff. Frame pacing follows the same
# generation contract and must never infer lifecycle from visual worker flags.

const TIMEOUT_MSEC: int = 5000
const TEST_INTRO_TIME_SCALE: float = 0.5

var failures: Array[String] = []
var intro: Node
var game: Node
var pacing: Node


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

	var initialized: bool = await _wait_until(Callable(self, "_game_initialized"))
	_expect(initialized, "gameplay interaction initializes before handoff test")

	var preintro: Node = intro.get_node_or_null("StarToTablePreIntro")
	var smooth: Node = intro.get_node_or_null("SmoothIntroTimeline")
	pacing = intro.get_node_or_null("FramePacingGovernor")
	_expect(preintro != null and smooth != null, "intro lifecycle workers exist")
	_expect(pacing != null, "frame pacing governor exists")
	if preintro == null or smooth == null or pacing == null:
		await _finish()
		return

	var initial_generation: int = int(intro.get("intro_run_generation"))
	_expect(initial_generation > 0, "intro opens an explicit initial generation")
	_expect(int(pacing.get("active_intro_generation")) == initial_generation, "pacing observes initial intro generation")
	_expect(bool(pacing.get("intro_lifecycle_active")), "pacing starts under intro lifecycle ownership")

	# Force a deterministic slow-device lock so lifecycle behavior is isolated
	# from warmup sampling. Production still computes the same value adaptively.
	pacing.set("locked", true)
	pacing.set("locked_scale", TEST_INTRO_TIME_SCALE)
	Engine.time_scale = TEST_INTRO_TIME_SCALE
	pacing.set_process(true)

	# A real pre-intro pause deliberately uses playing=false while pre-intro still
	# owns the scene. It must keep intro pacing instead of restoring global time.
	preintro.set("completed", false)
	preintro.set_process(false)
	smooth.set("active", false)
	smooth.set_process(false)
	intro.set("playing", false)
	await _settle_frames(4)
	_expect(_time_scale_is(TEST_INTRO_TIME_SCALE), "pre-intro pause keeps locked time scale")
	_expect(bool(pacing.get("intro_lifecycle_active")), "pre-intro pause keeps pacing lifecycle active")

	# Exact legacy false-positive shape: visual playing=false, pre-intro completed,
	# smooth inactive. These values are no longer authority for gameplay or pacing.
	preintro.set("completed", true)
	await _settle_frames(6)
	_expect(_time_scale_is(TEST_INTRO_TIME_SCALE), "legacy completion-shaped pause cannot release time scale")
	_expect(not bool(game.get("waiting_for_setup")), "internal pause cannot show setup early")
	_expect(int(intro.get("gameplay_handoff_emit_count")) == 0, "internal pause emits zero handoffs")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == 0, "internal pause consumes zero handoffs")

	# Only a true completion publication for a fresh generation creates authority.
	intro.call("_restart_intro")
	var first_generation: int = int(intro.get("intro_run_generation"))
	await _settle_frames(2)
	_expect(first_generation == initial_generation + 1, "true intro restart advances generation")
	_expect(int(pacing.get("active_intro_generation")) == first_generation, "pacing follows restarted generation")
	_expect(bool(pacing.get("intro_lifecycle_active")), "restart re-arms pacing lifecycle")
	_expect(_time_scale_is(TEST_INTRO_TIME_SCALE), "restart reapplies locked intro time scale")
	_expect(int(intro.get("gameplay_handoff_emit_count")) == 0, "restart itself emits no handoff")
	intro.call("_snap_final")
	intro.set("playing", false)
	intro.call("_publish_complete")
	_expect(await _wait_until(Callable(self, "_handoff_complete")), "explicit completion reaches gameplay setup")
	_expect(_time_scale_is(1.0), "true completion releases time scale to normal")
	_expect(not bool(pacing.get("intro_lifecycle_active")), "true completion closes pacing lifecycle")
	_expect(int(intro.get("gameplay_handoff_emit_count")) == 1, "first generation emits exactly once")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == 1, "first generation is consumed exactly once")
	_expect(int(intro.get("gameplay_handoff_consumed_generation")) == first_generation, "first consumed generation matches completion")

	intro.call("_publish_complete")
	await _settle_frames(3)
	_expect(_time_scale_is(1.0), "duplicate completion leaves normal time scale unchanged")
	_expect(int(intro.get("gameplay_handoff_emit_count")) == 1, "duplicate completion cannot re-emit")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == 1, "duplicate completion cannot re-run gameplay handoff")

	# A deliberate replay opens a new generation and resets gameplay ownership.
	# The lifecycle signal must also re-arm the already-quiesced pacing governor.
	intro.call("_restart_intro")
	var replay_generation: int = int(intro.get("intro_run_generation"))
	_expect(replay_generation == first_generation + 1, "replay advances intro generation once")
	_expect(await _wait_until(Callable(self, "_replay_reset_seen").bind(replay_generation)), "gameplay observes replay generation")
	_expect(bool(pacing.get("intro_lifecycle_active")), "replay reopens pacing lifecycle")
	_expect(int(pacing.get("active_intro_generation")) == replay_generation, "pacing tracks replay generation")
	_expect(_time_scale_is(TEST_INTRO_TIME_SCALE), "replay restores locked intro time scale")
	_expect(not bool(game.get("intro_runtime_suspended")), "replay resumes intro runtime")
	_expect(not bool(game.get("waiting_for_setup")), "replay hides setup until completion")
	_expect(int(intro.get("gameplay_handoff_emit_count")) == 1, "replay start does not emit early")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == 1, "replay start does not consume early")

	# Keep this headless regression deterministic; completion itself still goes
	# through the production publication method and generation token.
	smooth.set("active", false)
	smooth.set_process(false)
	intro.call("_snap_final")
	intro.set("playing", false)
	intro.call("_publish_complete")
	_expect(await _wait_until(Callable(self, "_handoff_generation_complete").bind(replay_generation)), "replay completion hands control back once")
	_expect(_time_scale_is(1.0), "replay completion returns time scale to normal")
	_expect(not bool(pacing.get("intro_lifecycle_active")), "replay completion closes pacing lifecycle")
	_expect(int(intro.get("gameplay_handoff_emit_count")) == 2, "replay emits one new token")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == 2, "replay consumes one new token")

	intro.call("_publish_complete")
	await _settle_frames(3)
	_expect(_time_scale_is(1.0), "replay duplicate completion cannot disturb normal time scale")
	_expect(int(intro.get("gameplay_handoff_emit_count")) == 2, "replay duplicate completion stays one-shot")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == 2, "replay duplicate completion does not duplicate setup")

	# Normal local start and completed-match rematch remain gameplay-only. They
	# must not reopen pacing or consume another intro handoff generation.
	game.call("_on_configuration_ready", _local_configuration())
	await create_timer(0.58).timeout
	_expect(bool(game.get("match_initialized")), "normal local match still starts")
	_expect(_time_scale_is(1.0), "normal gameplay keeps natural time scale")
	var emit_before_rematch: int = int(intro.get("gameplay_handoff_emit_count"))
	var consume_before_rematch: int = int(intro.get("gameplay_handoff_consume_count"))
	game.set("current_player_index", mini(1, (game.get("players") as Array).size() - 1))
	game.set("round_starter_index", int(game.get("current_player_index")))
	game.set("round_number", int(game.get("total_rounds")))
	var winner: String = str(game.call("_current_direction"))
	var scores: Dictionary = game.get("scores") as Dictionary
	scores[winner] = int(game.get("total_rounds"))
	game.set("round_complete", true)
	game.set("match_complete", true)
	game.set("round_winner", winner)
	game.set("action_in_progress", false)
	game.call("_on_round_action")
	await create_timer(0.58).timeout
	_expect(bool(game.get("match_initialized")), "rematch remains initialized")
	_expect(int(game.get("round_number")) == 1, "rematch resets to round one")
	_expect(not bool(game.get("round_complete")) and not bool(game.get("match_complete")), "rematch clears completion state")
	_expect(_time_scale_is(1.0), "gameplay rematch keeps natural time scale")
	_expect(not bool(pacing.get("intro_lifecycle_active")), "gameplay rematch does not reopen intro pacing")
	_expect(int(intro.get("gameplay_handoff_emit_count")) == emit_before_rematch, "rematch emits no intro handoff")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == consume_before_rematch, "rematch consumes no intro handoff")
	_expect(bool(game.get("intro_runtime_suspended")), "rematch keeps gameplay ownership")

	await _finish()


func _game_initialized() -> bool:
	return game != null and bool(game.get("initialized"))


func _handoff_complete() -> bool:
	return bool(game.get("waiting_for_setup")) and bool(game.get("intro_runtime_suspended"))


func _replay_reset_seen(generation: int) -> bool:
	return int(game.get("intro_generation_seen")) == generation and not bool(game.get("intro_runtime_suspended"))


func _handoff_generation_complete(generation: int) -> bool:
	return (
		int(intro.get("gameplay_handoff_consumed_generation")) == generation
		and bool(game.get("waiting_for_setup"))
		and bool(game.get("intro_runtime_suspended"))
	)


func _time_scale_is(expected: float) -> bool:
	return is_equal_approx(Engine.time_scale, expected)


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


func _local_configuration() -> Dictionary:
	return {
		"tutorial": false,
		"rounds": 3,
		"online_join_code": "",
		"players": [
			{"seat": "p1", "label": "أنا", "mode": "local", "color": "marble", "color_name": "أبيض", "direction": "right"},
			{"seat": "p2", "label": "اللاعب 2", "mode": "local", "color": "blue", "color_name": "أزرق", "direction": "back"},
		]
	}


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
		print("YAKOLAK_INTRO_HANDOFF_HEADLESS_OK emits=2 consumes=2 pacing=lifecycle-explicit replay=one-shot rematch=stable")
		quit(0)
		return
	for failure: String in failures:
		push_error(failure)
	quit(1)
