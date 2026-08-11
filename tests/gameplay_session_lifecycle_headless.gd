extends SceneTree

# Runs the real intro -> setup -> gameplay ownership transfer, then repeats the
# production local-session lifecycle. Process-exit ObjectDB/Resource leaks are
# enforced by vercel-fast-build.sh.

const MEASURED_CYCLES: int = 4
const MEMORY_DRIFT_LIMIT_BYTES: int = 128 * 1024
const HANDOFF_TIMEOUT_MSEC: int = 30000
const PERF_SAMPLE_FRAMES: int = 90
const INTRO_ONLY_WORKERS: Array[StringName] = [
	&"StarToTablePreIntro",
	&"StarToTableRefinement",
	&"ExistingIntroCorrections",
	&"SmoothIntroTimeline",
	&"WebGPUWarmup",
	&"FramePacingGovernor",
	&"StudioVisualPolish",
]
const INTRO_VISUAL_NODES: Array[StringName] = [
	&"Board",
	&"Lid",
	&"Base_right",
	&"Base_left",
	&"Base_front",
	&"Base_back",
	&"ApprovedStarTableSVG",
	&"ApprovedStarTablePedestal",
	&"StudioWallLogo",
]

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

	game = intro.get_node_or_null("PostIntroGameplay")
	_expect(game != null, "post-intro gameplay controller exists")
	if game == null:
		await _finish()
		return

	# Measure the real controlled-unboxing window while intro-only periodic work
	# is still legitimately active. This is the before-handoff CPU/frame baseline.
	var perf_window_ready: bool = await _wait_for_intro_perf_window()
	_expect(perf_window_ready, "real intro reaches governed unboxing before handoff")
	var active_before: int = _active_intro_periodic_count()
	var before_perf: Dictionary = await _sample_perf(PERF_SAMPLE_FRAMES)
	_expect(active_before > 0, "intro baseline contains active periodic workers")

	# Do not manufacture the post-intro state. Wait for gameplay.gd to observe the
	# real playing=true -> false transition and call _enable_gameplay(), which owns
	# the production handoff and its intro-runtime suspension.
	var handed_off: bool = await _wait_for_gameplay_handoff()
	_expect(handed_off, "real intro hands control to gameplay setup")
	await _settle_frames(6)
	_assert_intro_runtime_quiet("handoff")

	var visual_after_handoff: Dictionary = _capture_intro_visual_state()
	var after_perf: Dictionary = await _sample_perf(PERF_SAMPLE_FRAMES)
	_assert_intro_visual_unchanged(visual_after_handoff, "idle post-handoff")
	var active_after: int = _active_intro_periodic_count()
	_expect(active_after == 0, "handoff leaves zero intro periodic workers")
	print("YAKOLAK_INTRO_HANDOFF_PERF before_active=%d after_active=%d before_cpu_ms=%.4f after_cpu_ms=%.4f before_frame_ms=%.4f after_frame_ms=%.4f" % [
		active_before,
		active_after,
		float(before_perf.get("cpu_ms", 0.0)),
		float(after_perf.get("cpu_ms", 0.0)),
		float(before_perf.get("frame_ms", 0.0)),
		float(after_perf.get("frame_ms", 0.0)),
	])

	# One unmeasured gameplay warm-up absorbs first-use script/render allocations.
	# Every measured cycle below must return to the same steady-state footprint.
	await _run_session_cycle(0)
	await _settle_frames(12)
	baseline_memory = _memory_bytes()
	baseline_objects = _object_count()
	print("YAKOLAK_GAMEPLAY_LIFECYCLE_BASELINE memory=%d objects=%d" % [baseline_memory, baseline_objects])

	var previous_memory: int = baseline_memory
	for cycle: int in range(1, MEASURED_CYCLES + 1):
		await _run_session_cycle(cycle)
		await _settle_frames(12)
		_assert_intro_runtime_quiet("cycle %d settled" % cycle)
		var memory_after: int = _memory_bytes()
		var objects_after: int = _object_count()
		var memory_delta: int = memory_after - baseline_memory
		var step_delta: int = memory_after - previous_memory
		print("YAKOLAK_GAMEPLAY_LIFECYCLE_CYCLE cycle=%d memory=%d baseline_delta=%d step_delta=%d objects=%d intro_active=%d" % [
			cycle, memory_after, memory_delta, step_delta, objects_after, _active_intro_periodic_count()
		])
		_expect(objects_after <= baseline_objects, "cycle %d leaves ObjectDB growth: baseline=%d after=%d" % [cycle, baseline_objects, objects_after])
		_expect(memory_after <= baseline_memory + MEMORY_DRIFT_LIMIT_BYTES, "cycle %d grows static memory beyond steady-state tolerance: baseline=%d after=%d" % [cycle, baseline_memory, memory_after])
		if cycle >= 2:
			_expect(step_delta <= MEMORY_DRIFT_LIMIT_BYTES, "cycle %d has continuing memory growth: previous=%d after=%d" % [cycle, previous_memory, memory_after])
		previous_memory = memory_after

	await _finish()


func _wait_for_intro_perf_window() -> bool:
	var preintro: Node = intro.get_node_or_null("StarToTablePreIntro")
	var smooth: Node = intro.get_node_or_null("SmoothIntroTimeline")
	var deadline: int = Time.get_ticks_msec() + HANDOFF_TIMEOUT_MSEC
	while Time.get_ticks_msec() < deadline:
		if preintro != null and smooth != null and bool(preintro.get("completed")) and bool(smooth.get("active")):
			return true
		await process_frame
	return false


func _wait_for_gameplay_handoff() -> bool:
	var deadline: int = Time.get_ticks_msec() + HANDOFF_TIMEOUT_MSEC
	while Time.get_ticks_msec() < deadline:
		if bool(game.get("waiting_for_setup")) and bool(game.get("intro_runtime_suspended")):
			return true
		await process_frame
	return false


func _run_session_cycle(cycle: int) -> void:
	_expect(bool(game.waiting_for_setup), "cycle %d starts from setup" % cycle)
	_assert_intro_runtime_quiet("cycle %d setup" % cycle)
	game._on_configuration_ready(_local_configuration())
	await create_timer(0.58).timeout
	_expect(bool(game.match_initialized), "cycle %d creates a match" % cycle)
	_expect(not bool(game.waiting_for_setup), "cycle %d leaves setup while playing" % cycle)
	_assert_intro_runtime_quiet("cycle %d playing" % cycle)

	# Dirty a completed match, then invoke the same production action as the
	# rematch button. It must rebuild gameplay only; intro ownership stays released.
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
	_assert_intro_runtime_quiet("cycle %d rematch" % cycle)

	game._return_to_setup()
	await _settle_frames(8)
	_expect(bool(game.waiting_for_setup), "cycle %d returns to setup" % cycle)
	_expect(not bool(game.match_initialized), "cycle %d ends the gameplay session" % cycle)
	_expect(game.camera_tween == null, "cycle %d releases camera tween" % cycle)
	_expect(game.tray_tween == null, "cycle %d releases tray tween" % cycle)
	_expect(game.stability_round_reset_tween == null, "cycle %d releases round-reset tween" % cycle)
	_expect(game.selected_original_material == null, "cycle %d releases selected material" % cycle)
	_assert_intro_runtime_quiet("cycle %d returned" % cycle)


func _assert_intro_runtime_quiet(label: String) -> void:
	_expect(bool(game.get("intro_runtime_suspended")), "%s keeps gameplay ownership" % label)
	_expect(not intro.is_processing(), "%s stops intro root _process" % label)
	_expect(not intro.is_physics_processing(), "%s stops intro root physics" % label)
	_expect(not intro.is_processing_unhandled_input(), "%s stops intro replay input" % label)
	for worker_name: StringName in INTRO_ONLY_WORKERS:
		var worker: Node = intro.get_node_or_null(NodePath(worker_name))
		_expect(worker != null, "%s worker %s exists" % [label, String(worker_name)])
		if worker == null:
			continue
		_expect(not worker.is_processing(), "%s stops %s _process" % [label, String(worker_name)])
		_expect(not worker.is_physics_processing(), "%s stops %s physics" % [label, String(worker_name)])
	_expect(_intro_resize_connection_count() == 0, "%s leaves no intro size_changed callbacks" % label)
	_expect(is_equal_approx(Engine.time_scale, 1.0), "%s releases frame-pacing time scale" % label)


func _active_intro_periodic_count() -> int:
	var count: int = 0
	if intro != null and (intro.is_processing() or intro.is_physics_processing()):
		count += 1
	for worker_name: StringName in INTRO_ONLY_WORKERS:
		var worker: Node = intro.get_node_or_null(NodePath(worker_name))
		if worker != null and (worker.is_processing() or worker.is_physics_processing()):
			count += 1
	return count


func _intro_resize_connection_count() -> int:
	var owner_ids: Dictionary = {}
	owner_ids[intro.get_instance_id()] = true
	for worker_name: StringName in INTRO_ONLY_WORKERS:
		var worker: Node = intro.get_node_or_null(NodePath(worker_name))
		if worker != null:
			owner_ids[worker.get_instance_id()] = true
	var count: int = 0
	for connection_value: Variant in intro.get_viewport().get_signal_connection_list("size_changed"):
		var connection: Dictionary = connection_value as Dictionary
		var callback: Callable = connection.get("callable", Callable())
		if not callback.is_valid():
			continue
		var target: Object = callback.get_object()
		if target != null and owner_ids.has(target.get_instance_id()):
			count += 1
	return count


func _capture_intro_visual_state() -> Dictionary:
	var snapshot: Dictionary = {}
	var camera: Camera3D = intro.get("camera") as Camera3D
	if camera != null:
		snapshot["camera_transform"] = camera.transform
		snapshot["camera_fov"] = camera.fov
	for node_name: StringName in INTRO_VISUAL_NODES:
		var node: Node3D = intro.get_node_or_null(NodePath(node_name)) as Node3D
		if node == null:
			continue
		snapshot[String(node_name) + ":transform"] = node.transform
		if node is GeometryInstance3D:
			snapshot[String(node_name) + ":visible"] = (node as GeometryInstance3D).visible
	return snapshot


func _assert_intro_visual_unchanged(before: Dictionary, label: String) -> void:
	var after: Dictionary = _capture_intro_visual_state()
	for key: Variant in before.keys():
		_expect(after.has(key), "%s retains visual field %s" % [label, str(key)])
		if not after.has(key):
			continue
		var before_value: Variant = before[key]
		var after_value: Variant = after[key]
		if before_value is Transform3D and after_value is Transform3D:
			_expect((before_value as Transform3D).is_equal_approx(after_value as Transform3D), "%s has no intro transform mutation: %s" % [label, str(key)])
		elif before_value is float and after_value is float:
			_expect(is_equal_approx(float(before_value), float(after_value)), "%s has no intro scalar mutation: %s" % [label, str(key)])
		else:
			_expect(before_value == after_value, "%s has no intro state mutation: %s" % [label, str(key)])


func _sample_perf(frame_count: int) -> Dictionary:
	var cpu_ms_total: float = 0.0
	var frame_ms_total: float = 0.0
	var previous_usec: int = Time.get_ticks_usec()
	for _frame: int in range(frame_count):
		await process_frame
		var now_usec: int = Time.get_ticks_usec()
		frame_ms_total += float(now_usec - previous_usec) / 1000.0
		previous_usec = now_usec
		cpu_ms_total += (
			float(Performance.get_monitor(Performance.TIME_PROCESS)) +
			float(Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS))
		) * 1000.0
	return {
		"cpu_ms": cpu_ms_total / float(maxi(frame_count, 1)),
		"frame_ms": frame_ms_total / float(maxi(frame_count, 1)),
	}


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
	for _frame: int in range(count):
		await process_frame


func _memory_bytes() -> int:
	return int(Performance.get_monitor(Performance.MEMORY_STATIC))


func _object_count() -> int:
	return int(Performance.get_monitor(Performance.OBJECT_COUNT))


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
		print("YAKOLAK_GAMEPLAY_LIFECYCLE_HEADLESS_OK cycles=%d memory_drift_limit=%d intro_workers=0" % [MEASURED_CYCLES, MEMORY_DRIFT_LIMIT_BYTES])
		quit(0)
		return
	for failure: String in failures:
		push_error(failure)
	quit(1)
