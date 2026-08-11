extends SceneTree

# Repeats the real local-session lifecycle in one scene: start a match, rebuild
# it through the production rematch path, return to setup, then start again.
# Process-exit ObjectDB/Resource leaks are enforced by vercel-fast-build.sh.

const MEASURED_CYCLES: int = 4
const MEMORY_DRIFT_LIMIT_BYTES: int = 128 * 1024

var failures: Array[String] = []
var intro: Node
var game: Node
var baseline_memory: int = 0
var baseline_objects: int = 0


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	intro = preload("res://scenes/intro.tscn").instantiate()
	root.add_child(intro)
	await process_frame
	intro.playing = false
	for _frame in range(8):
		await process_frame

	game = intro.get_node_or_null("PostIntroGameplay")
	_expect(game != null, "post-intro gameplay controller exists")
	if game == null:
		await _finish()
		return

	# One unmeasured warm-up absorbs first-use script/render allocations. Every
	# measured cycle below must return to this same steady-state footprint.
	await _run_session_cycle(0)
	await _settle_frames(8)
	baseline_memory = _memory_bytes()
	baseline_objects = _object_count()
	print("YAKOLAK_GAMEPLAY_LIFECYCLE_BASELINE memory=%d objects=%d" % [baseline_memory, baseline_objects])

	var previous_memory: int = baseline_memory
	for cycle: int in range(1, MEASURED_CYCLES + 1):
		await _run_session_cycle(cycle)
		await _settle_frames(8)
		var memory_after: int = _memory_bytes()
		var objects_after: int = _object_count()
		var memory_delta: int = memory_after - baseline_memory
		var step_delta: int = memory_after - previous_memory
		print("YAKOLAK_GAMEPLAY_LIFECYCLE_CYCLE cycle=%d memory=%d baseline_delta=%d step_delta=%d objects=%d" % [
			cycle, memory_after, memory_delta, step_delta, objects_after
		])
		_expect(objects_after <= baseline_objects, "cycle %d leaves ObjectDB growth: baseline=%d after=%d" % [cycle, baseline_objects, objects_after])
		_expect(memory_after <= baseline_memory + MEMORY_DRIFT_LIMIT_BYTES, "cycle %d grows static memory beyond steady-state tolerance: baseline=%d after=%d" % [cycle, baseline_memory, memory_after])
		# Allocator jitter may move within the small tolerance, but repeated session
		# teardown must not produce a sustained positive staircase across cycles.
		if cycle >= 2:
			_expect(step_delta <= MEMORY_DRIFT_LIMIT_BYTES, "cycle %d has continuing memory growth: previous=%d after=%d" % [cycle, previous_memory, memory_after])
		previous_memory = memory_after

	await _finish()


func _run_session_cycle(cycle: int) -> void:
	_expect(bool(game.waiting_for_setup), "cycle %d starts from setup" % cycle)
	game._on_configuration_ready(_local_configuration())
	await create_timer(0.58).timeout
	_expect(bool(game.match_initialized), "cycle %d creates a match" % cycle)
	_expect(not bool(game.waiting_for_setup), "cycle %d leaves setup while playing" % cycle)

	# Dirty a completed match, then invoke the same production action as the
	# rematch button. The rematch lifecycle must cancel transient Tweens and reuse
	# only configuration, not stale match resources.
	game.current_player_index = mini(1, game.players.size() - 1)
	game.round_starter_index = game.current_player_index
	game.round_number = game.total_rounds
	var winner: String = str(game._current_direction())
	game.scores[winner] = game.total_rounds
	game.round_complete = true
	game.match_complete = true
	game.round_winner = winner
	game.action_in_progress = false
	game._on_round_action()
	await create_timer(0.58).timeout
	_expect(bool(game.match_initialized), "cycle %d rematch remains initialized" % cycle)
	_expect(int(game.round_number) == 1, "cycle %d rematch resets round number" % cycle)
	_expect(not bool(game.round_complete) and not bool(game.match_complete), "cycle %d rematch clears completion flags" % cycle)
	_expect(int(game.move_count) == 0 and (game.occupied_slots as Dictionary).is_empty(), "cycle %d rematch has no board residue" % cycle)

	# Return through the production setup path; this is the resource ownership
	# boundary under test. It must kill session Tweens and release transient refs.
	game._return_to_setup()
	await _settle_frames(6)
	_expect(bool(game.waiting_for_setup), "cycle %d returns to setup" % cycle)
	_expect(not bool(game.match_initialized), "cycle %d ends the gameplay session" % cycle)
	_expect(game.camera_tween == null, "cycle %d releases camera tween" % cycle)
	_expect(game.tray_tween == null, "cycle %d releases tray tween" % cycle)
	_expect(game.stability_round_reset_tween == null, "cycle %d releases round-reset tween" % cycle)
	_expect(game.selected_original_material == null, "cycle %d releases selected material" % cycle)


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


func _settle_frames(count: int) -> void:
	for _frame in range(count):
		await process_frame


func _memory_bytes() -> int:
	return int(Performance.get_monitor(Performance.MEMORY_STATIC))


func _object_count() -> int:
	return int(Performance.get_monitor(Performance.OBJECT_COUNT))


func _expect(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)


func _finish() -> void:
	if intro != null and is_instance_valid(intro):
		intro.queue_free()
		await process_frame
		await process_frame
	if failures.is_empty():
		print("YAKOLAK_GAMEPLAY_LIFECYCLE_HEADLESS_OK cycles=%d memory_drift_limit=%d" % [MEASURED_CYCLES, MEMORY_DRIFT_LIMIT_BYTES])
		quit(0)
		return
	for failure: String in failures:
		push_error(failure)
	quit(1)
