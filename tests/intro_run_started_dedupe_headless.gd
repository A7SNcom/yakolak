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
	_expect(not bool(game.get("waiting_for_setup")), "direct fallback reset clears setup ownership")

	# A delayed stale direct call cannot reopen or reset the current replay.
	intro.call("_dispatch_intro_run_started", combined_generation)
	await _settle_frames(2)
	_expect(int(game.get("intro_run_started_reset_count")) == resets_before + 2, "stale direct generation is rejected")

	await _finish()


func _game_initialized() -> bool:
	return game != null and bool(game.get("initialized"))


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
		print("YAKOLAK_INTRO_RUN_STARTED_DEDUPE_OK delivery=signal+direct resets=1 next_replay=1 direct_fallback=kept")
		quit(0)
		return
	for failure: String in failures:
		push_error(failure)
	quit(1)
