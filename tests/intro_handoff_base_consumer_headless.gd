extends SceneTree

# Regression for gameplay_state_inventory.gd as the consumer itself. The scene's
# production explicit subclass is deliberately replaced before _ready() so no
# subclass override can hide a visual fallback in the base inheritance chain.
# Only intro_handoff.gd's consumed generation token may enable/suspend gameplay,
# and the consumer application is one-shot for every intro generation.

const TIMEOUT_MSEC: int = 5000

var failures: Array[String] = []
var intro: Node
var game: Node


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	intro = preload("res://scenes/intro.tscn").instantiate()
	game = intro.get_node_or_null("PostIntroGameplay")
	_expect(game != null, "post-intro gameplay node exists")
	if game == null:
		await _finish()
		return

	# Test the requested base consumer directly, not gameplay_explicit_handoff.gd.
	game.set_script(preload("res://scripts/gameplay_state_inventory.gd"))
	root.add_child(intro)
	_expect(str(game.get_script().resource_path) == "res://scripts/gameplay_state_inventory.gd", "base consumer script is active")
	_expect(await _wait_until(Callable(self, "_game_initialized")), "base consumer initializes")

	var preintro: Node = intro.get_node_or_null("StarToTablePreIntro")
	var smooth: Node = intro.get_node_or_null("SmoothIntroTimeline")
	_expect(preintro != null and smooth != null, "visual pause workers exist")
	if preintro == null or smooth == null:
		await _finish()
		return

	var first_generation: int = int(intro.get("intro_run_generation"))
	_expect(first_generation > 0, "base consumer sees an explicit generation")
	_force_legacy_visual_pause(preintro, smooth)
	await _settle_frames(4)
	_expect(not bool(game.call("_intro_handoff_ready")), "legacy visual shape is not handoff-ready")

	# Exact old fallback shape: playing=false, pre-intro completed, smooth inactive.
	# Even direct legacy/test calls into both base methods must remain inert.
	var applications_before: int = int(game.get("intro_handoff_apply_count"))
	for _attempt: int in range(3):
		game.call("_enable_gameplay")
		game.call("_suspend_intro_runtime")
	await _settle_frames(4)
	_expect(not bool(game.get("waiting_for_setup")), "base consumer cannot start setup from a visual pause")
	_expect(not bool(game.get("intro_runtime_suspended")), "base consumer cannot suspend intro from a visual pause")
	_expect(int(game.get("intro_handoff_apply_count")) == applications_before, "visual pause creates zero consumer applications")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == 0, "visual pause consumes zero tokens")

	# A true completion publishes and consumes exactly one token for generation 1.
	intro.call("_snap_final")
	intro.set("playing", false)
	intro.call("_publish_complete")
	_expect(await _wait_until(Callable(self, "_handoff_applied").bind(first_generation, 1)), "explicit token enables base consumer")
	_expect(bool(game.call("_intro_handoff_ready")), "consumed current generation is handoff-ready")
	_expect(int(game.get("intro_handoff_applied_generation")) == first_generation, "base consumer records first generation")
	_expect(int(game.get("intro_handoff_apply_count")) == 1, "first generation applies exactly once")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == 1, "first generation consumes exactly once")

	# Duplicate completion and direct legacy calls remain one-shot after consume.
	intro.call("_publish_complete")
	for _attempt: int in range(3):
		game.call("_enable_gameplay")
		game.call("_suspend_intro_runtime")
	await _settle_frames(4)
	_expect(int(game.get("intro_handoff_apply_count")) == 1, "duplicate calls cannot reapply first generation")
	_expect(int(intro.get("gameplay_handoff_emit_count")) == 1, "duplicate completion cannot re-emit first generation")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == 1, "duplicate completion cannot re-consume first generation")

	# Replay invalidates the old consumed generation. The same legacy visual shape
	# must become inert again until generation 2 publishes its own token.
	intro.call("_restart_intro")
	var replay_generation: int = int(intro.get("intro_run_generation"))
	_expect(replay_generation == first_generation + 1, "replay advances generation")
	_expect(await _wait_until(Callable(self, "_replay_reset_seen").bind(replay_generation)), "base consumer observes replay reset")
	_force_legacy_visual_pause(preintro, smooth)
	await _settle_frames(3)
	_expect(not bool(game.call("_intro_handoff_ready")), "old consumed token is stale after replay")
	for _attempt: int in range(3):
		game.call("_enable_gameplay")
		game.call("_suspend_intro_runtime")
	await _settle_frames(3)
	_expect(not bool(game.get("waiting_for_setup")), "replay pause cannot start setup")
	_expect(not bool(game.get("intro_runtime_suspended")), "replay pause cannot suspend intro")
	_expect(int(game.get("intro_handoff_apply_count")) == 1, "replay pause creates no application")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == 1, "replay pause consumes no token")

	intro.call("_snap_final")
	intro.set("playing", false)
	intro.call("_publish_complete")
	_expect(await _wait_until(Callable(self, "_handoff_applied").bind(replay_generation, 2)), "replay explicit token enables base consumer")
	_expect(int(game.get("intro_handoff_applied_generation")) == replay_generation, "base consumer records replay generation")
	_expect(int(game.get("intro_handoff_apply_count")) == 2, "one application per generation")
	_expect(int(intro.get("gameplay_handoff_emit_count")) == 2, "one emitted token per generation")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == 2, "one consumed token per generation")

	# Returning to setup stays in gameplay ownership. It must not mint or reuse an
	# intro token, including if an old caller invokes enable again afterward.
	game.call("_return_to_setup")
	await _settle_frames(3)
	_expect(bool(game.get("waiting_for_setup")), "return-to-setup remains available after explicit handoff")
	game.call("_enable_gameplay")
	await _settle_frames(2)
	_expect(int(game.get("intro_handoff_apply_count")) == 2, "return-to-setup cannot reuse consumed generation")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == 2, "return-to-setup consumes no extra token")

	await _finish()


func _force_legacy_visual_pause(preintro: Node, smooth: Node) -> void:
	# Freeze the root clock only to keep the headless fixture deterministic. Child
	# gameplay processing remains enabled and still receives explicit tokens.
	intro.set_process(false)
	preintro.set("completed", true)
	preintro.set_process(false)
	smooth.set("active", false)
	smooth.set_process(false)
	intro.set("playing", false)


func _game_initialized() -> bool:
	return game != null and bool(game.get("initialized"))


func _handoff_applied(generation: int, expected_count: int) -> bool:
	return (
		int(intro.get("gameplay_handoff_consumed_generation")) == generation
		and int(game.get("intro_handoff_applied_generation")) == generation
		and int(game.get("intro_handoff_apply_count")) == expected_count
		and bool(game.get("waiting_for_setup"))
		and bool(game.get("intro_runtime_suspended"))
	)


func _replay_reset_seen(generation: int) -> bool:
	return (
		int(game.get("intro_generation_seen")) == generation
		and not bool(game.get("waiting_for_setup"))
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
	if intro != null and is_instance_valid(intro):
		intro.queue_free()
		await process_frame
		await process_frame
		await process_frame
	if failures.is_empty():
		print("YAKOLAK_INTRO_HANDOFF_BASE_CONSUMER_OK generations=2 applications=2 visual_fallback=removed")
		quit(0)
		return
	for failure: String in failures:
		push_error(failure)
	quit(1)
