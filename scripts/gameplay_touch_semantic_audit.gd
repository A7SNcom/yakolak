extends Node

# Browser-only QA observer for the real two-step mobile interaction:
# 1) choose one physical stack (size is irrelevant while nested),
# 2) choose an exact size after that stack fans open.
# It never handles player input and never changes production visuals/rules.
const FINGER_DIAMETERS_CSS: Array[float] = [36.0, 44.0, 52.0]
const RESCUE_RADIUS_CSS: float = 18.0
const REQUIRED_REDUCTION: float = 0.15
const TRAY_SETTLE_SECONDS: float = 0.42

var gameplay: Node
var _callback: Variant
var _installed: bool = false
var _running: bool = false


func _ready() -> void:
	set_process(true)


func _process(_delta: float) -> void:
	if _installed or not OS.has_feature("web"):
		return
	gameplay = get_parent().get_node_or_null("PostIntroGameplay")
	if gameplay == null:
		return
	if not bool(gameplay.get("browser_automation")):
		return
	_callback = JavaScriptBridge.create_callback(_on_run_audit)
	var window: JavaScriptObject = JavaScriptBridge.get_interface("window")
	if window == null:
		return
	window.set("yakolakTestRunTouchSemanticAudit", _callback)
	_installed = true
	set_process(false)


func _on_run_audit(_arguments: Array) -> void:
	if _running:
		return
	_running = true
	call_deferred("_run_audit")


func _run_audit() -> void:
	if gameplay == null or not bool(gameplay.get("gameplay_ready")) or gameplay.get("camera") == null:
		_publish_failed("not-ready")
		_running = false
		return

	var stack := await _measure_nested_stacks()
	var tray := await _measure_open_tray()
	var total_samples: int = int(stack.samples) + int(tray.samples)
	var before_false: int = int(stack.before_false) + int(tray.before_false)
	var after_false: int = int(stack.after_false) + int(tray.after_false)
	var before_wrong: int = int(stack.before_wrong) + int(tray.before_wrong)
	var after_wrong: int = int(stack.after_wrong) + int(tray.after_wrong)
	var reduction: float = 0.0
	if before_false > 0:
		reduction = float(before_false - after_false) / float(before_false)
	var max_ms: float = maxf(float(stack.max_ms), float(tray.max_ms))
	var canvas_rect: Rect2 = gameplay.call("_gameplay_canvas_css_rect") as Rect2
	var passed: bool = (
		int(stack.centers) >= 3
		and int(tray.centers) >= 3
		and total_samples > 0
		and before_false > 0
		and after_false < before_false
		and after_wrong <= before_wrong
		and int(stack.after_wrong) <= int(stack.before_wrong)
		and int(tray.after_wrong) <= int(tray.before_wrong)
		and reduction >= REQUIRED_REDUCTION
		and max_ms < 33.4
	)
	_publish_result(passed, stack, tray, total_samples, before_false, after_false, before_wrong, after_wrong, reduction, max_ms, canvas_rect.size)
	_running = false


func _measure_nested_stacks() -> Dictionary:
	var result := _blank_metrics()
	var candidates: Array[int] = gameplay.call("_current_piece_candidates") as Array[int]
	var direction: String = str(gameplay.call("_current_direction"))
	for side: int in [-1, 0, 1]:
		var available: Array[int] = gameplay.call("_available_stack_indices", direction, side) as Array[int]
		if available.is_empty():
			continue
		var representative: int = _find_size(available, "medium")
		if representative < 0:
			representative = available[0]
		var center: Vector2 = gameplay.call("_visible_piece_test_pointer", representative, candidates) as Vector2
		if center.x < 0.0:
			# Any visible ring point in this stack is a valid stack target.
			for index: int in available:
				center = gameplay.call("_visible_piece_test_pointer", index, candidates) as Vector2
				if center.x >= 0.0:
					break
		if center.x < 0.0:
			continue
		result.centers = int(result.centers) + 1
		for diameter_css: float in FINGER_DIAMETERS_CSS:
			var jitter_css: float = minf(RESCUE_RADIUS_CSS * 0.92, diameter_css * 0.30)
			for offset: Vector2 in _sample_offsets(jitter_css):
				var sample: Vector2 = center + offset
				var started: int = Time.get_ticks_usec()
				var baseline: int = int(gameplay.call("_mesh_piece_at_pointer", sample, candidates))
				var improved: int = int(gameplay.call("_touch_piece_at_pointer", sample, candidates))
				var elapsed_ms: float = float(Time.get_ticks_usec() - started) / 1000.0
				result.max_ms = maxf(float(result.max_ms), elapsed_ms)
				result.samples = int(result.samples) + 1
				_score_stack(result, baseline, improved, side)
	return result


func _measure_open_tray() -> Dictionary:
	var result := _blank_metrics()
	var direction: String = str(gameplay.call("_current_direction"))
	var available: Array[int] = gameplay.call("_available_stack_indices", direction, 0) as Array[int]
	if available.is_empty():
		return result
	gameplay.call("_open_piece_tray", available[0])
	await get_tree().create_timer(TRAY_SETTLE_SECONDS).timeout
	var tray_candidates: Array[int] = gameplay.get("tray_indices") as Array[int]
	for intended: int in tray_candidates:
		var center: Vector2 = gameplay.call("_visible_piece_test_pointer", intended, tray_candidates) as Vector2
		if center.x < 0.0:
			continue
		result.centers = int(result.centers) + 1
		for diameter_css: float in FINGER_DIAMETERS_CSS:
			var jitter_css: float = minf(RESCUE_RADIUS_CSS * 0.92, diameter_css * 0.30)
			for offset: Vector2 in _sample_offsets(jitter_css):
				var sample: Vector2 = center + offset
				var started: int = Time.get_ticks_usec()
				var baseline: int = int(gameplay.call("_mesh_piece_at_pointer", sample, tray_candidates))
				var improved: int = int(gameplay.call("_touch_piece_at_pointer", sample, tray_candidates))
				var elapsed_ms: float = float(Time.get_ticks_usec() - started) / 1000.0
				result.max_ms = maxf(float(result.max_ms), elapsed_ms)
				result.samples = int(result.samples) + 1
				_score_exact(result, baseline, improved, intended)
	gameplay.call("_close_piece_tray", -1, true)
	return result


func _score_stack(result: Dictionary, baseline: int, improved: int, intended_side: int) -> void:
	var baseline_ok: bool = _piece_side(baseline) == intended_side
	var improved_ok: bool = _piece_side(improved) == intended_side
	if not baseline_ok:
		result.before_false = int(result.before_false) + 1
		if baseline >= 0:
			result.before_wrong = int(result.before_wrong) + 1
	if not improved_ok:
		result.after_false = int(result.after_false) + 1
		if improved >= 0:
			result.after_wrong = int(result.after_wrong) + 1


func _score_exact(result: Dictionary, baseline: int, improved: int, intended: int) -> void:
	if baseline != intended:
		result.before_false = int(result.before_false) + 1
		if baseline >= 0:
			result.before_wrong = int(result.before_wrong) + 1
	if improved != intended:
		result.after_false = int(result.after_false) + 1
		if improved >= 0:
			result.after_wrong = int(result.after_wrong) + 1


func _piece_side(index: int) -> int:
	if index < 0:
		return 999
	var records: Array = gameplay.get("piece_records") as Array
	if index >= records.size():
		return 999
	return int((records[index] as Dictionary).get("side", 999))


func _find_size(indices: Array[int], size_name: String) -> int:
	var records: Array = gameplay.get("piece_records") as Array
	for index: int in indices:
		if str((records[index] as Dictionary).get("type", "")) == size_name:
			return index
	return -1


func _sample_offsets(radius_css: float) -> Array[Vector2]:
	var offsets: Array[Vector2] = [Vector2.ZERO]
	for angle: float in [0.0, PI * 0.5, PI, PI * 1.5]:
		offsets.append(gameplay.call("_touch_css_offset_to_internal", radius_css, angle) as Vector2)
	return offsets


func _blank_metrics() -> Dictionary:
	return {
		"centers": 0,
		"samples": 0,
		"before_false": 0,
		"after_false": 0,
		"before_wrong": 0,
		"after_wrong": 0,
		"max_ms": 0.0,
	}


func _publish_failed(reason: String) -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakTouchSemanticAudit='failed';" +
			"document.body.dataset.yakolakTouchSemanticReason='" + reason + "';",
			true
		)


func _publish_result(passed: bool, stack: Dictionary, tray: Dictionary, total_samples: int, before_false: int, after_false: int, before_wrong: int, after_wrong: int, reduction: float, max_ms: float, viewport_css: Vector2) -> void:
	var status: String = "passed" if passed else "failed"
	print("YAKOLAK_TOUCH_SEMANTIC_%s viewport=%dx%d fingers=36,44,52 stack=%d->%d tray=%d->%d wrong=%d->%d reduction=%.1f%% max_ms=%.3f" % [
		"OK" if passed else "FAIL", int(round(viewport_css.x)), int(round(viewport_css.y)), int(stack.before_false), int(stack.after_false), int(tray.before_false), int(tray.after_false), before_wrong, after_wrong, reduction * 100.0, max_ms
	])
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakTouchSemanticAudit='" + status + "';" +
		"document.body.dataset.yakolakTouchSemanticViewport='%dx%d';" % [int(round(viewport_css.x)), int(round(viewport_css.y))] +
		"document.body.dataset.yakolakTouchSemanticFingers='36,44,52';" +
		"document.body.dataset.yakolakTouchSemanticSamples='%d';" % total_samples +
		"document.body.dataset.yakolakTouchSemanticStackCenters='%d';" % int(stack.centers) +
		"document.body.dataset.yakolakTouchSemanticTrayCenters='%d';" % int(tray.centers) +
		"document.body.dataset.yakolakTouchSemanticStackBeforeFalse='%d';" % int(stack.before_false) +
		"document.body.dataset.yakolakTouchSemanticStackAfterFalse='%d';" % int(stack.after_false) +
		"document.body.dataset.yakolakTouchSemanticStackBeforeWrong='%d';" % int(stack.before_wrong) +
		"document.body.dataset.yakolakTouchSemanticStackAfterWrong='%d';" % int(stack.after_wrong) +
		"document.body.dataset.yakolakTouchSemanticTrayBeforeFalse='%d';" % int(tray.before_false) +
		"document.body.dataset.yakolakTouchSemanticTrayAfterFalse='%d';" % int(tray.after_false) +
		"document.body.dataset.yakolakTouchSemanticTrayBeforeWrong='%d';" % int(tray.before_wrong) +
		"document.body.dataset.yakolakTouchSemanticTrayAfterWrong='%d';" % int(tray.after_wrong) +
		"document.body.dataset.yakolakTouchSemanticBeforeFalse='%d';" % before_false +
		"document.body.dataset.yakolakTouchSemanticAfterFalse='%d';" % after_false +
		"document.body.dataset.yakolakTouchSemanticBeforeWrong='%d';" % before_wrong +
		"document.body.dataset.yakolakTouchSemanticAfterWrong='%d';" % after_wrong +
		"document.body.dataset.yakolakTouchSemanticReduction='" + str(reduction) + "';" +
		"document.body.dataset.yakolakTouchSemanticMaxMs='" + str(max_ms) + "';",
		true
	)
