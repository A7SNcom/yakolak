extends Node

# Runs the accepted unboxing timeline on a governed visual clock. The original
# intro functions and exact poses remain the source of truth; only wall-clock
# skipping is removed. ExistingIntroCorrections continues to run afterwards with
# the same governed elapsed time, preserving its approved quaternion corrections.

const MAX_VISUAL_STEP_MS: float = 1000.0 / 60.0
const LID_CONTENT_REVEAL_MS: float = 590.0
const TOTAL_TIME_MS: float = 5730.0

var intro: Node3D
var preintro: Node
var active: bool = false
var governed_elapsed_ms: float = 0.0


func _ready() -> void:
	process_priority = -10
	intro = get_parent() as Node3D
	preintro = intro.get_node_or_null("StarToTablePreIntro")
	set_process(true)


func _process(delta: float) -> void:
	if intro == null or preintro == null or not bool(preintro.get("completed")):
		return

	if not active:
		if bool(intro.get("playing")):
			_take_control()
		else:
			return

	var step_ms: float = minf(maxf(delta, 0.0) * 1000.0, MAX_VISUAL_STEP_MS)
	governed_elapsed_ms = minf(governed_elapsed_ms + step_ms, TOTAL_TIME_MS)
	_sync_original_clock()

	if not bool(intro.get("contents_revealed")) and governed_elapsed_ms >= LID_CONTENT_REVEAL_MS:
		intro.set("contents_revealed", true)
		intro.call("_set_internal_visibility", true)

	intro.call("_apply_timeline", governed_elapsed_ms)
	intro.call("_publish_timeline_stage", governed_elapsed_ms)
	if governed_elapsed_ms >= TOTAL_TIME_MS:
		_finish_controlled_intro()


func _take_control() -> void:
	active = true
	governed_elapsed_ms = 0.0
	# Stop only the root's wall-clock _process. Child correction and gameplay
	# nodes keep processing normally.
	intro.set_process(false)
	_sync_original_clock()
	intro.call("_apply_timeline", 0.0)
	print("YAKOLAK_SMOOTH_TIMELINE_START max_step_ms=%.3f" % MAX_VISUAL_STEP_MS)
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakIntroClock='governed-visual';" +
			"document.body.dataset.yakolakIntroMaxStepMs='" + str(MAX_VISUAL_STEP_MS) + "';",
			true
		)


func _sync_original_clock() -> void:
	intro.set("started_msec", Time.get_ticks_msec() - int(round(governed_elapsed_ms)))


func _finish_controlled_intro() -> void:
	intro.call("_snap_final")
	intro.set("playing", false)
	intro.call("_publish_complete")
	active = false
	intro.set_process(true)
	print("YAKOLAK_SMOOTH_TIMELINE_COMPLETE duration_ms=%d" % int(TOTAL_TIME_MS))
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakIntroClock='complete';", true)
