extends Node

# Locks one conservative visual time scale before the visible handoff begins.
# Fast devices keep native cadence. Devices below a stable 30 fps slow the
# timeline just enough to keep each visible movement step at roughly 33 ms.

const TARGET_30_STEP_SECONDS: float = 1.0 / 30.0
const MIN_TIME_SCALE: float = 0.34
const SAMPLE_LIMIT: int = 24
const LOCK_SAMPLE_COUNT: int = 12

var intro: Node3D
var warmup: Node
var smooth_intro: Node
var frame_samples: Array[float] = []
var locked: bool = false
var locked_scale: float = 1.0
var locked_visual_step_seconds: float = TARGET_30_STEP_SECONDS


func _ready() -> void:
	process_priority = -100
	intro = get_parent() as Node3D
	warmup = intro.get_node_or_null("WebGPUWarmup")
	smooth_intro = intro.get_node_or_null("SmoothIntroTimeline")
	Engine.time_scale = 1.0
	set_process(true)


func _process(delta: float) -> void:
	if intro == null:
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
	var preintro := intro.get_node_or_null("StarToTablePreIntro")
	var preintro_complete: bool = preintro != null and bool(preintro.get("completed"))
	var smooth_active: bool = smooth_intro != null and bool(smooth_intro.get("active"))
	if preintro_complete and not smooth_active and not bool(intro.get("playing")):
		Engine.time_scale = 1.0
		_publish_complete()
		set_process(false)


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


func _publish_complete() -> void:
	print("YAKOLAK_FRAME_PACING_RELEASE scale=1.0")
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakFramePacing='released';", true)
