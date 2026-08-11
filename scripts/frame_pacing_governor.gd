extends Node

# Locks one conservative visual time scale while the explicit intro lifecycle
# owns the scene. Fast devices keep native cadence. Devices below a stable
# 30 fps slow the timeline just enough to keep visible steps near 33 ms.
# Visual flags such as intro.playing are deliberately not lifecycle authority.

const TARGET_30_STEP_SECONDS: float = 1.0 / 30.0
const MIN_TIME_SCALE: float = 0.34
const SAMPLE_LIMIT: int = 24
const LOCK_SAMPLE_COUNT: int = 12

var intro: Node3D
var warmup: Node
var frame_samples: Array[float] = []
var locked: bool = false
var locked_scale: float = 1.0
var locked_visual_step_seconds: float = TARGET_30_STEP_SECONDS
var active_intro_generation: int = -1
var intro_lifecycle_active: bool = false


func _ready() -> void:
	process_priority = -100
	intro = get_parent() as Node3D
	warmup = intro.get_node_or_null("WebGPUWarmup") if intro != null else null
	Engine.time_scale = 1.0
	_connect_intro_lifecycle()
	_sync_intro_lifecycle_snapshot()
	set_process(intro_lifecycle_active or active_intro_generation <= 0)


func _exit_tree() -> void:
	# Engine.time_scale is global. Never let scene teardown strand the next scene
	# on an intro-only pacing value, including teardown before true completion.
	Engine.time_scale = 1.0


func _connect_intro_lifecycle() -> void:
	if intro == null:
		return
	var started_handler := Callable(self, "_on_intro_run_started")
	if intro.has_signal("intro_run_started") and not intro.is_connected("intro_run_started", started_handler):
		intro.connect("intro_run_started", started_handler)
	var handoff_handler := Callable(self, "_on_gameplay_handoff_ready")
	if intro.has_signal("gameplay_handoff_ready") and not intro.is_connected("gameplay_handoff_ready", handoff_handler):
		intro.connect("gameplay_handoff_ready", handoff_handler)


func _sync_intro_lifecycle_snapshot() -> void:
	if intro == null:
		return
	var generation: int = int(intro.get("intro_run_generation"))
	if generation <= 0:
		return
	active_intro_generation = generation
	var published_generation: int = int(intro.get("gameplay_handoff_published_generation"))
	intro_lifecycle_active = published_generation != generation
	Engine.time_scale = locked_scale if intro_lifecycle_active and locked else 1.0


func _on_intro_run_started(generation: int) -> void:
	if intro == null or generation <= 0:
		return
	if generation != int(intro.get("intro_run_generation")):
		return
	active_intro_generation = generation
	intro_lifecycle_active = true
	Engine.time_scale = locked_scale if locked else 1.0
	set_process(true)
	print("YAKOLAK_FRAME_PACING_INTRO generation=%d scale=%.3f" % [generation, Engine.time_scale])


func _on_gameplay_handoff_ready(generation: int) -> void:
	if intro == null or generation <= 0:
		return
	if generation != int(intro.get("intro_run_generation")):
		return
	if generation != active_intro_generation or not intro_lifecycle_active:
		return
	intro_lifecycle_active = false
	Engine.time_scale = 1.0
	_publish_complete(generation)
	set_process(false)


func _process(delta: float) -> void:
	if intro == null or not intro_lifecycle_active:
		return

	var applied_scale: float = maxf(Engine.time_scale, 0.001)
	var actual_frame_seconds: float = maxf(delta / applied_scale, 0.0001)
	if not locked:
		frame_samples.append(actual_frame_seconds)
		if frame_samples.size() > SAMPLE_LIMIT:
			frame_samples.pop_front()
		if warmup != null and bool(warmup.get("completed")):
			_lock_measured_scale()
		return

	Engine.time_scale = locked_scale


func _lock_measured_scale() -> void:
	var measured: float = TARGET_30_STEP_SECONDS
	if not frame_samples.is_empty():
		# Warmup only completes after the heavy geometry is hidden. Measure the
		# most recent post-hide frames, not shader-compilation hitches.
		var start_index: int = maxi(0, frame_samples.size() - LOCK_SAMPLE_COUNT)
		var ordered: Array[float] = []
		for index: int in range(start_index, frame_samples.size()):
			ordered.append(frame_samples[index])
		ordered.sort()
		var percentile_index: int = clampi(int(ceil(float(ordered.size()) * 0.90)) - 1, 0, ordered.size() - 1)
		measured = maxf(float(ordered[percentile_index]), 0.0001)

	locked_scale = 1.0 if measured <= TARGET_30_STEP_SECONDS else clampf(TARGET_30_STEP_SECONDS / measured, MIN_TIME_SCALE, 1.0)
	locked_visual_step_seconds = minf(measured * locked_scale, TARGET_30_STEP_SECONDS)
	Engine.time_scale = locked_scale
	locked = true
	print("YAKOLAK_FRAME_PACING_LOCK mode=adaptive-60-30 scale=%.3f measured_ms=%.2f visual_step_ms=%.2f" % [locked_scale, measured * 1000.0, locked_visual_step_seconds * 1000.0])
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakFramePacing='locked';" +
			"document.body.dataset.yakolakFramePacingMode='adaptive-60-30';" +
			"document.body.dataset.yakolakTimeScale='" + str(locked_scale) + "';" +
			"document.body.dataset.yakolakVisualStepMs='" + str(locked_visual_step_seconds * 1000.0) + "';",
			true
		)


func _publish_complete(generation: int) -> void:
	print("YAKOLAK_FRAME_PACING_RELEASE generation=%d scale=1.0" % generation)
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakFramePacing='released';" +
			"document.body.dataset.yakolakTimeScale='1';",
			true
		)
