extends "res://scripts/gameplay_state_inventory.gd"

# Mobile touch quality layer only. Visual geometry, camera, rules and mouse
# picking remain unchanged. Touch first uses the exact rendered mesh; only when
# that misses do we search a small screen-space neighborhood for the nearest
# unambiguous visible stone. This gives thin nested rings a finger-sized target
# without making the stones look larger or letting hidden geometry steal taps.
const TOUCH_TARGET_RESCUE_RADIUS_CSS: float = 34.0
const TOUCH_AUDIT_MAX_MOBILE_WIDTH_CSS: float = 430.0

var _touch_audit_scheduled: bool = false
var _touch_audit_done: bool = false
var _touch_exact_taps: int = 0
var _touch_rescued_taps: int = 0
var _touch_missed_taps: int = 0
var _touch_edge_rejected: int = 0


func _ready() -> void:
	super._ready()
	_publish_touch_target_contract()


func _process(delta: float) -> void:
	super._process(delta)
	if _touch_audit_done or _touch_audit_scheduled or not browser_automation:
		return
	if not match_initialized or not gameplay_ready or camera == null or _current_mode() != "local":
		return
	var canvas_rect: Rect2 = _gameplay_canvas_css_rect()
	if canvas_rect.size.x <= 1.0 or canvas_rect.size.y <= canvas_rect.size.x:
		return
	if canvas_rect.size.x > TOUCH_AUDIT_MAX_MOBILE_WIDTH_CSS:
		return
	_touch_audit_scheduled = true
	call_deferred("_run_touch_target_audit")


func _input(event: InputEvent) -> void:
	_touch_pointer_dispatch = event is InputEventScreenTouch and (event as InputEventScreenTouch).pressed
	super._input(event)
	_touch_pointer_dispatch = false


func _handle_pointer(screen_position: Vector2) -> void:
	# Raised tray stones win before board targets, matching the established
	# interaction order. Only touch gets invisible hit slop; mouse stays exact.
	if tray_open:
		var tray_piece_index: int = _piece_at_current_pointer(screen_position, tray_indices)
		if tray_piece_index >= 0:
			_select_tray_piece(tray_piece_index)
			return

	if selected_index >= 0:
		var target_hit: Dictionary = _ray_pick(screen_position, TARGET_LAYER)
		if not target_hit.is_empty():
			var target_collider: Object = target_hit["collider"] as Object
			if target_collider != null and target_collider.has_meta("cell"):
				var cell: int = int(target_collider.get_meta("cell"))
				if _is_legal_cell(cell, _selected_size()):
					_begin_move(cell)
				else:
					_publish_invalid(cell)
				return
		if _touch_pointer_dispatch:
			var rescued_cell: int = _nearest_legal_cell_at_pointer(screen_position)
			if rescued_cell >= 0:
				_begin_move(rescued_cell)
				return

	var piece_index: int = _piece_at_current_pointer(screen_position, _current_piece_candidates())

	if browser_automation:
		print("YAKOLAK_TOUCH_PICK pointer=(%.2f,%.2f) touch=%s resolved=%d" % [
			screen_position.x,
			screen_position.y,
			str(_touch_pointer_dispatch),
			piece_index,
		])
	if piece_index >= 0:
		var record: Dictionary = piece_records[piece_index] as Dictionary
		if bool(record.get("played", false)):
			return
		if str(record.get("dir", "")) != _current_direction():
			_flash_result("هذا الشوك ليس للدور الحالي")
			_publish_match_state("wrong-owner")
			return
		if not _has_legal_cell_for_size(str(record.get("type", ""))):
			_flash_result("لا توجد خانة لهذا الحجم")
			_publish_match_state("no-legal-cell")
			return
		_open_piece_tray(piece_index)
		return

	if selected_index >= 0:
		_clear_selection()


func _nearest_legal_cell_at_pointer(screen_position: Vector2) -> int:
	if selected_index < 0 or camera == null:
		return -1
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var canvas_rect: Rect2 = _gameplay_canvas_css_rect()
	var scale_x: float = viewport_size.x / maxf(canvas_rect.size.x, 1.0)
	var scale_y: float = viewport_size.y / maxf(canvas_rect.size.y, 1.0)
	var radius: Vector2 = Vector2(TOUCH_TARGET_RESCUE_RADIUS_CSS * scale_x, TOUCH_TARGET_RESCUE_RADIUS_CSS * scale_y)
	var best_cell: int = -1
	var best_distance: float = INF
	for cell: int in range(target_markers.size()):
		if not _is_legal_cell(cell, _selected_size()):
			continue
		var marker: MeshInstance3D = target_markers[cell]
		if marker == null or not marker.visible:
			continue
		var point: Vector2 = camera.unproject_position(marker.global_position)
		var delta: Vector2 = (screen_position - point) / radius
		var normalized_distance: float = delta.length_squared()
		if normalized_distance <= 1.0 and normalized_distance < best_distance:
			best_distance = normalized_distance
			best_cell = cell
	return best_cell


func _piece_at_current_pointer(screen_position: Vector2, candidate_indices: Array[int]) -> int:
	if not _touch_pointer_dispatch:
		return _mesh_piece_at_pointer(screen_position, candidate_indices)
	return _touch_piece_at_pointer_with_metrics(screen_position, candidate_indices, true)


func _touch_piece_at_pointer_with_metrics(screen_position: Vector2, candidate_indices: Array[int], record_metrics: bool) -> int:
	var exact: int = _mesh_piece_at_pointer(screen_position, candidate_indices)
	if exact >= 0:
		if record_metrics:
			_touch_exact_taps += 1
			_publish_touch_runtime_metrics()
		return exact

	if not _touch_rescue_allowed(screen_position):
		if record_metrics:
			_touch_edge_rejected += 1
			_touch_missed_taps += 1
			_publish_touch_runtime_metrics()
		return -1

	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	for radius_css: float in TOUCH_RESCUE_RADII_CSS:
		var counts: Dictionary = {}
		for angle_index: int in range(TOUCH_RESCUE_ANGLES):
			var angle: float = TAU * float(angle_index) / float(TOUCH_RESCUE_ANGLES)
			var offset: Vector2 = _touch_css_offset_to_internal(radius_css, angle)
			var probe: Vector2 = screen_position + offset
			if probe.x < 0.0 or probe.y < 0.0 or probe.x >= viewport_size.x or probe.y >= viewport_size.y:
				continue
			var hit: int = _mesh_piece_at_pointer(probe, candidate_indices)
			if hit >= 0:
				counts[hit] = int(counts.get(hit, 0)) + 1

		if counts.is_empty():
			continue

		var winner: int = -1
		var winner_count: int = 0
		var tied: bool = false
		for value: Variant in counts.keys():
			var candidate: int = int(value)
			var count: int = int(counts[value])
			if count > winner_count:
				winner = candidate
				winner_count = count
				tied = false
			elif count == winner_count:
				tied = true
		if tied:
			if record_metrics:
				_touch_missed_taps += 1
				_publish_touch_runtime_metrics()
			return -1
		if winner >= 0:
			if record_metrics:
				_touch_rescued_taps += 1
				_publish_touch_runtime_metrics()
			return winner

	if record_metrics:
		_touch_missed_taps += 1
		_publish_touch_runtime_metrics()
	return -1


func _touch_css_offset_to_internal(radius_css: float, angle: float) -> Vector2:
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var canvas_rect: Rect2 = _gameplay_canvas_css_rect()
	if canvas_rect.size.x <= 1.0 or canvas_rect.size.y <= 1.0:
		return Vector2(cos(angle), sin(angle)) * radius_css
	return Vector2(
		cos(angle) * radius_css * viewport_size.x / canvas_rect.size.x,
		sin(angle) * radius_css * viewport_size.y / canvas_rect.size.y
	)


func _touch_internal_to_css(screen_position: Vector2) -> Vector2:
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var canvas_rect: Rect2 = _gameplay_canvas_css_rect()
	if viewport_size.x <= 1.0 or viewport_size.y <= 1.0:
		return canvas_rect.position
	return canvas_rect.position + Vector2(
		screen_position.x * canvas_rect.size.x / viewport_size.x,
		screen_position.y * canvas_rect.size.y / viewport_size.y
	)


func _touch_rescue_allowed(screen_position: Vector2) -> bool:
	var canvas_rect: Rect2 = _gameplay_canvas_css_rect()
	if canvas_rect.size.x <= 1.0 or canvas_rect.size.y <= 1.0:
		return false
	var safe: Vector4 = _touch_safe_area_css()
	var css_point: Vector2 = _touch_internal_to_css(screen_position)
	var left: float = canvas_rect.position.x + safe.x + TOUCH_SAFE_GUTTER_CSS
	var top: float = canvas_rect.position.y + safe.y + TOUCH_SAFE_GUTTER_CSS
	var right: float = canvas_rect.end.x - safe.z - TOUCH_SAFE_GUTTER_CSS
	var bottom: float = canvas_rect.end.y - safe.w - TOUCH_SAFE_GUTTER_CSS
	return css_point.x >= left and css_point.x <= right and css_point.y >= top and css_point.y <= bottom


func _touch_safe_area_css() -> Vector4:
	if not OS.has_feature("web"):
		return Vector4.ZERO
	var raw: Variant = JavaScriptBridge.eval(
		"JSON.stringify((()=>{let e=document.getElementById('__yakolak_touch_safe_probe');if(!e){e=document.createElement('div');e.id='__yakolak_touch_safe_probe';e.style.cssText='position:fixed;visibility:hidden;pointer-events:none;padding-left:env(safe-area-inset-left);padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);padding-bottom:env(safe-area-inset-bottom)';document.body.appendChild(e)}const s=getComputedStyle(e);return{l:parseFloat(s.paddingLeft)||0,t:parseFloat(s.paddingTop)||0,r:parseFloat(s.paddingRight)||0,b:parseFloat(s.paddingBottom)||0}})())",
		true
	)
	var decoded: Variant = JSON.parse_string(str(raw))
	if decoded is Dictionary:
		var values: Dictionary = decoded as Dictionary
		return Vector4(
			float(values.get("l", 0.0)),
			float(values.get("t", 0.0)),
			float(values.get("r", 0.0)),
			float(values.get("b", 0.0))
		)
	return Vector4.ZERO


func _run_touch_target_audit() -> void:
	_touch_audit_scheduled = false
	if _touch_audit_done or not browser_automation or not match_initialized or not gameplay_ready or camera == null:
		return
	var canvas_rect: Rect2 = _gameplay_canvas_css_rect()
	if canvas_rect.size.x > TOUCH_AUDIT_MAX_MOBILE_WIDTH_CSS or canvas_rect.size.y <= canvas_rect.size.x:
		return

	var candidates: Array[int] = _current_piece_candidates()
	var before_false: int = 0
	var after_false: int = 0
	var before_wrong: int = 0
	var after_wrong: int = 0
	var samples: int = 0
	var centers: int = 0
	var direction: String = _current_direction()

	for side: int in [-1, 0, 1]:
		var available: Array[int] = _available_stack_indices(direction, side)
		for size_name: String in ["small", "medium", "large"]:
			var intended: int = -1
			for candidate: int in available:
				if str((piece_records[candidate] as Dictionary).get("type", "")) == size_name:
					intended = candidate
					break
			if intended < 0:
				continue
			var center: Vector2 = _visible_piece_test_pointer(intended, candidates)
			if center.x < 0.0 or center.y < 0.0:
				continue
			centers += 1

			for diameter_css: float in TOUCH_AUDIT_FINGER_DIAMETERS_CSS:
				# Finger size is represented as deterministic one-hand aim jitter of
				# 30% of the contact diameter around a genuinely visible stone point.
				var jitter_css: float = minf(TOUCH_RESCUE_RADIUS_CSS * 0.92, diameter_css * 0.30)
				var offsets: Array[Vector2] = [Vector2.ZERO]
				for angle: float in [0.0, PI * 0.5, PI, PI * 1.5]:
					offsets.append(_touch_css_offset_to_internal(jitter_css, angle))

				for offset: Vector2 in offsets:
					var sample: Vector2 = center + offset
					var baseline: int = _mesh_piece_at_pointer(sample, candidates)
					var improved: int = _touch_piece_at_pointer_with_metrics(sample, candidates, false)
					samples += 1
					if baseline != intended:
						before_false += 1
						if baseline >= 0:
							before_wrong += 1
					if improved != intended:
						after_false += 1
						if improved >= 0:
							after_wrong += 1

	var reduction: float = 0.0
	if before_false > 0:
		reduction = float(before_false - after_false) / float(before_false)
	var passed: bool = (
		centers >= 6
		and samples > 0
		and before_false > 0
		and after_false < before_false
		and after_wrong <= before_wrong
		and reduction >= TOUCH_AUDIT_REQUIRED_REDUCTION
	)
	_touch_audit_done = true
	_publish_touch_audit_detail(
		passed,
		centers,
		samples,
		before_false,
		after_false,
		before_wrong,
		after_wrong,
		reduction,
		canvas_rect.size
	)
	if not passed:
		push_error(
			"YAKOLAK_TOUCH_AUDIT_FAILED centers=%d samples=%d before_false=%d after_false=%d before_wrong=%d after_wrong=%d reduction=%.3f" % [
				centers,
				samples,
				before_false,
				after_false,
				before_wrong,
				after_wrong,
				reduction,
			]
		)


func _publish_touch_target_contract() -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakTouchPickModel='exact-mesh-then-visible-slop';" +
		"document.body.dataset.yakolakTouchRescueRadiusCss='18';" +
		"document.body.dataset.yakolakTouchSafeGutterCss='8';" +
		"document.body.dataset.yakolakTouchProbeBudget='24';" +
		"document.body.dataset.yakolakTouchVisualChange='none';",
		true
	)


func _publish_touch_runtime_metrics() -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakTouchExact='%d';" % _touch_exact_taps +
		"document.body.dataset.yakolakTouchRescued='%d';" % _touch_rescued_taps +
		"document.body.dataset.yakolakTouchMissed='%d';" % _touch_missed_taps +
		"document.body.dataset.yakolakTouchEdgeRejected='%d';" % _touch_edge_rejected,
		true
	)


func _publish_touch_audit_detail(
	passed: bool,
	centers: int,
	samples: int,
	before_false: int,
	after_false: int,
	before_wrong: int,
	after_wrong: int,
	reduction: float,
	viewport_css: Vector2
) -> void:
	var status: String = "passed" if passed else "failed"
	print(
		"YAKOLAK_TOUCH_AUDIT_%s viewport=%dx%d fingers=36,44,52 centers=%d samples=%d before_false=%d after_false=%d before_wrong=%d after_wrong=%d reduction=%.1f%% rescue=18 safe=8" % [
			"OK" if passed else "FAIL",
			int(round(viewport_css.x)),
			int(round(viewport_css.y)),
			centers,
			samples,
			before_false,
			after_false,
			before_wrong,
			after_wrong,
			reduction * 100.0,
		]
	)
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakTouchAudit='%s';" % status +
		"document.body.dataset.yakolakTouchAuditCenters='%d';" % centers +
		"document.body.dataset.yakolakTouchAuditSamples='%d';" % samples +
		"document.body.dataset.yakolakTouchAuditBeforeFalse='%d';" % before_false +
		"document.body.dataset.yakolakTouchAuditAfterFalse='%d';" % after_false +
		"document.body.dataset.yakolakTouchAuditBeforeWrong='%d';" % before_wrong +
		"document.body.dataset.yakolakTouchAuditAfterWrong='%d';" % after_wrong +
		"document.body.dataset.yakolakTouchAuditReduction='%s';" % str(reduction) +
		"document.body.dataset.yakolakTouchAuditFingerDiameters='36,44,52';" +
		"document.body.dataset.yakolakTouchAuditViewport='%dx%d';" % [int(round(viewport_css.x)), int(round(viewport_css.y))],
		true
	)
