extends "res://scripts/gameplay_session_polish.gd"

# Piece selection is resolved against the rendered stone triangles, not against
# physics proxy boxes. L/M/S are nested rings: a solid AABB has no knowledge of
# the visible holes and can therefore report a large/near box when the player
# actually tapped the medium/small stone behind that empty space.
#
# Mouse keeps the exact mesh ray. Touch uses that same exact ray first, then a
# small invisible screen-space rescue only if the exact touch misses. This keeps
# the visual design unchanged while making thin projected rings finger-friendly.
const TOUCH_RESCUE_RADIUS_CSS: float = 18.0
const TOUCH_RESCUE_RADII_CSS: Array[float] = [9.0, 18.0]
const TOUCH_RESCUE_ANGLES: int = 8
const TOUCH_SAFE_GUTTER_CSS: float = 8.0
const TOUCH_AUDIT_FINGER_DIAMETERS_CSS: Array[float] = [36.0, 44.0, 52.0]
const TOUCH_AUDIT_REQUIRED_REDUCTION: float = 0.35

var _pick_face_cache: Dictionary = {}
var _pick_target_revision: int = 0
var _web_refresh_pick_targets_callback: Variant
var _web_touch_audit_callback: Variant
var _touch_pointer_dispatch: bool = false
var _touch_safe_area_cache: Vector4 = Vector4.ZERO
var _touch_safe_area_cache_msec: int = -10000


func _ready() -> void:
	super._ready()
	if OS.has_feature("web"):
		_publish_touch_target_contract()
	if OS.has_feature("web") and browser_automation:
		_web_refresh_pick_targets_callback = JavaScriptBridge.create_callback(_on_web_refresh_pick_targets)
		_web_touch_audit_callback = JavaScriptBridge.create_callback(_on_web_run_touch_audit)
		var window: JavaScriptObject = JavaScriptBridge.get_interface("window")
		if window != null:
			window.set("yakolakTestRefreshPickTargets", _web_refresh_pick_targets_callback)
			window.set("yakolakTestRunTouchAudit", _web_touch_audit_callback)


func _input(event: InputEvent) -> void:
	var was_touch: bool = _touch_pointer_dispatch
	_touch_pointer_dispatch = false
	if event is InputEventScreenTouch:
		var touch_event := event as InputEventScreenTouch
		_touch_pointer_dispatch = touch_event.pressed
	super._input(event)
	_touch_pointer_dispatch = was_touch


func _handle_pointer(screen_position: Vector2) -> void:
	# Once the tray is raised, switching sizes must still use rendered geometry.
	# Touch rescue is invisible and applies only after an exact mesh miss.
	if tray_open:
		var tray_piece_index: int = _piece_at_current_pointer(screen_position, tray_indices)
		if tray_piece_index >= 0:
			_select_tray_piece(tray_piece_index)
			return

	if selected_index >= 0:
		# Board cells intentionally stay exact. Broadening these would overlap
		# neighboring legal cells and create a worse kind of wrong tap.
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

	# Only unplayed stones owned by the active player may compete for the ray.
	var piece_index: int = _piece_at_current_pointer(screen_position, _current_piece_candidates())
	if browser_automation:
		print("YAKOLAK_MESH_PICK pointer=(%.2f,%.2f) touch=%s resolved=%d" % [
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


func _piece_at_current_pointer(screen_position: Vector2, candidate_indices: Array[int]) -> int:
	if not _touch_pointer_dispatch:
		return _mesh_piece_at_pointer(screen_position, candidate_indices)
	return _touch_piece_at_pointer(screen_position, candidate_indices)


func _touch_piece_at_pointer(screen_position: Vector2, candidate_indices: Array[int]) -> int:
	var exact: int = _mesh_piece_at_pointer(screen_position, candidate_indices)
	if exact >= 0:
		return exact
	if not _touch_rescue_allowed(screen_position):
		return -1

	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	for radius_css: float in TOUCH_RESCUE_RADII_CSS:
		var counts: Dictionary = {}
		for angle_index: int in range(TOUCH_RESCUE_ANGLES):
			var angle: float = TAU * float(angle_index) / float(TOUCH_RESCUE_ANGLES)
			var probe: Vector2 = screen_position + _touch_css_offset_to_internal(radius_css, angle)
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
			return -1
		if winner >= 0:
			return winner
	return -1


func _current_piece_candidates() -> Array[int]:
	var result: Array[int] = []
	var direction: String = _current_direction()
	for index: int in range(piece_records.size()):
		var record: Dictionary = piece_records[index] as Dictionary
		if bool(record.get("played", false)):
			continue
		if str(record.get("dir", "")) != direction:
			continue
		var mesh_instance: MeshInstance3D = record.get("mesh") as MeshInstance3D
		if mesh_instance == null or not mesh_instance.is_visible_in_tree():
			continue
		result.append(index)
	return result


func _mesh_piece_at_pointer(screen_position: Vector2, candidate_indices: Array[int]) -> int:
	if camera == null:
		return -1

	var world_origin: Vector3 = camera.project_ray_origin(screen_position)
	var world_direction: Vector3 = camera.project_ray_normal(screen_position).normalized()
	if world_direction.length_squared() <= 0.000001:
		return -1

	var best_index: int = -1
	var best_distance_squared: float = INF

	for index: int in candidate_indices:
		if index < 0 or index >= piece_records.size():
			continue
		var record: Dictionary = piece_records[index] as Dictionary
		if bool(record.get("played", false)):
			continue
		var mesh_instance: MeshInstance3D = record.get("mesh") as MeshInstance3D
		if mesh_instance == null or mesh_instance.mesh == null or not mesh_instance.is_visible_in_tree():
			continue

		var faces: PackedVector3Array = _piece_pick_faces(index)
		if faces.size() < 3:
			continue

		var inverse: Transform3D = mesh_instance.global_transform.affine_inverse()
		var local_origin: Vector3 = inverse * world_origin
		var local_direction: Vector3 = inverse.basis * world_direction
		if local_direction.length_squared() <= 0.000001:
			continue

		for face_index: int in range(0, faces.size() - 2, 3):
			var hit: Variant = Geometry3D.ray_intersects_triangle(
				local_origin,
				local_direction,
				faces[face_index],
				faces[face_index + 1],
				faces[face_index + 2]
			)
			if hit == null:
				continue
			var local_hit: Vector3 = hit
			var world_hit: Vector3 = mesh_instance.global_transform * local_hit
			var forward_distance: float = (world_hit - world_origin).dot(world_direction)
			if forward_distance <= 0.00001:
				continue
			var distance_squared: float = world_origin.distance_squared_to(world_hit)
			if distance_squared < best_distance_squared:
				best_distance_squared = distance_squared
				best_index = index

	return best_index


func _piece_pick_faces(piece_index: int) -> PackedVector3Array:
	if piece_index < 0 or piece_index >= piece_records.size():
		return PackedVector3Array()
	var record: Dictionary = piece_records[piece_index] as Dictionary
	var cache_key: String = str(record.get("type", ""))
	if _pick_face_cache.has(cache_key):
		var cached: PackedVector3Array = _pick_face_cache[cache_key]
		return cached
	var mesh_instance: MeshInstance3D = record.get("mesh") as MeshInstance3D
	if mesh_instance == null or mesh_instance.mesh == null:
		return PackedVector3Array()
	var faces: PackedVector3Array = mesh_instance.mesh.get_faces()
	_pick_face_cache[cache_key] = faces
	return faces


func _available_stack_indices(direction: String, side: int) -> Array[int]:
	var result: Array[int] = []
	for index: int in range(piece_records.size()):
		var record: Dictionary = piece_records[index] as Dictionary
		if bool(record.get("played", false)):
			continue
		if str(record.get("dir", "")) == direction and int(record.get("side", 0)) == side:
			result.append(index)
	return result


func _piece_mesh_radius(piece_index: int) -> float:
	if piece_index < 0 or piece_index >= piece_records.size():
		return 0.0
	var mesh_instance: MeshInstance3D = (piece_records[piece_index] as Dictionary).get("mesh") as MeshInstance3D
	if mesh_instance == null or mesh_instance.mesh == null:
		return 0.0
	var aabb: AABB = mesh_instance.mesh.get_aabb()
	return maxf(aabb.size.x, aabb.size.y) * 0.5


func _pointer_resolves_piece_with_margin(screen_position: Vector2, candidate_indices: Array[int], piece_index: int, margin: float) -> bool:
	var diagonal: float = margin * 0.70
	var offsets: Array[Vector2] = [Vector2.ZERO]
	if margin > 0.0:
		offsets.append_array([
			Vector2(margin, 0.0), Vector2(-margin, 0.0),
			Vector2(0.0, margin), Vector2(0.0, -margin),
			Vector2(diagonal, diagonal), Vector2(-diagonal, diagonal),
			Vector2(diagonal, -diagonal), Vector2(-diagonal, -diagonal),
		])
	for offset: Vector2 in offsets:
		if _mesh_piece_at_pointer(screen_position + offset, candidate_indices) != piece_index:
			return false
	return true


func _visible_piece_test_pointer(piece_index: int, candidate_indices: Array[int]) -> Vector2:
	if camera == null or piece_index < 0 or piece_index >= piece_records.size():
		return Vector2(-1.0, -1.0)
	var record: Dictionary = piece_records[piece_index] as Dictionary
	var mesh_instance: MeshInstance3D = record.get("mesh") as MeshInstance3D
	if mesh_instance == null or mesh_instance.mesh == null or not mesh_instance.is_visible_in_tree():
		return Vector2(-1.0, -1.0)

	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var aabb: AABB = mesh_instance.mesh.get_aabb()
	var radius: float = maxf(aabb.size.x, aabb.size.y) * 0.5
	var top_z: float = aabb.position.z + aabb.size.z
	var radial_factors: Array[float] = [0.96, 0.92, 0.88, 0.84, 0.80, 0.76, 0.72, 0.68, 0.64, 0.60, 0.56]
	var margins: Array[float] = [3.0, 2.0, 1.0, 0.5, 0.0]

	for margin: float in margins:
		for radial_factor: float in radial_factors:
			for angle_index: int in range(64):
				var angle: float = TAU * float(angle_index) / 64.0
				var local_target := Vector3(
					cos(angle) * radius * radial_factor,
					sin(angle) * radius * radial_factor,
					top_z
				)
				var internal_point: Vector2 = camera.unproject_position(mesh_instance.to_global(local_target))
				if internal_point.x < 2.0 or internal_point.y < 2.0 or internal_point.x > viewport_size.x - 2.0 or internal_point.y > viewport_size.y - 2.0:
					continue
				if _pointer_resolves_piece_with_margin(internal_point, candidate_indices, piece_index, margin):
					return internal_point

	return Vector2(-1.0, -1.0)


func _publish_piece_test_targets() -> void:
	if camera == null:
		return
	var direction: String = _current_direction()
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var canvas_rect: Rect2 = _gameplay_canvas_css_rect()
	if canvas_rect.size.x < 1.0 or canvas_rect.size.y < 1.0 or viewport_size.x < 1.0 or viewport_size.y < 1.0:
		return
	var css_scale := Vector2(canvas_rect.size.x / viewport_size.x, canvas_rect.size.y / viewport_size.y)
	var script: String = ""
	var all_current_candidates: Array[int] = _current_piece_candidates()

	for side: int in [-1, 0, 1]:
		var available: Array[int] = _available_stack_indices(direction, side)
		var pick_candidates: Array[int] = tray_indices if tray_open and tray_side == side else all_current_candidates
		for size_name: String in ["small", "medium", "large"]:
			var index: int = -1
			for candidate: int in available:
				if str((piece_records[candidate] as Dictionary).get("type", "")) == size_name:
					index = candidate
					break
			var size_cap: String = size_name.capitalize()
			var side_cap: String = "Minus1" if side < 0 else ("Plus1" if side > 0 else "0")
			var internal_point := Vector2(-1.0, -1.0)
			if index >= 0:
				internal_point = _visible_piece_test_pointer(index, pick_candidates)
			if internal_point.x < 0.0 or internal_point.y < 0.0:
				script += "document.body.dataset.yakolakTestSide%s%sX='0';" % [side_cap, size_cap]
				script += "document.body.dataset.yakolakTestSide%s%sY='0';" % [side_cap, size_cap]
				script += "document.body.dataset.yakolakTestSide%s%sInternalX='0';" % [side_cap, size_cap]
				script += "document.body.dataset.yakolakTestSide%s%sInternalY='0';" % [side_cap, size_cap]
				if side == 0:
					script += "document.body.dataset.yakolakTest%sX='0';" % size_cap
					script += "document.body.dataset.yakolakTest%sY='0';" % size_cap
				continue
			var css_point: Vector2 = canvas_rect.position + internal_point * css_scale
			script += "document.body.dataset.yakolakTestSide%s%sX='%s';" % [side_cap, size_cap, str(css_point.x)]
			script += "document.body.dataset.yakolakTestSide%s%sY='%s';" % [side_cap, size_cap, str(css_point.y)]
			script += "document.body.dataset.yakolakTestSide%s%sInternalX='%s';" % [side_cap, size_cap, str(internal_point.x)]
			script += "document.body.dataset.yakolakTestSide%s%sInternalY='%s';" % [side_cap, size_cap, str(internal_point.y)]
			if side == 0:
				script += "document.body.dataset.yakolakTest%sX='%s';" % [size_cap, str(css_point.x)]
				script += "document.body.dataset.yakolakTest%sY='%s';" % [size_cap, str(css_point.y)]

	_pick_target_revision += 1
	script += "document.body.dataset.yakolakPiecePickModel='mesh-triangle-frontmost';"
	script += "document.body.dataset.yakolakPiecePickInputParity='shared-screen-ray';"
	script += "document.body.dataset.yakolakPiecePickDirection='" + direction + "';"
	script += "document.body.dataset.yakolakPiecePickTargetRevision='" + str(_pick_target_revision) + "';"
	JavaScriptBridge.eval(script, true)


func _on_web_refresh_pick_targets(_arguments: Array) -> void:
	if not browser_automation or not match_initialized or not gameplay_ready or camera == null:
		return
	_publish_piece_test_targets()


func _on_web_run_touch_audit(_arguments: Array) -> void:
	if not browser_automation or not match_initialized or not gameplay_ready or camera == null:
		return
	call_deferred("_run_touch_target_audit")


func _run_touch_target_audit() -> void:
	var canvas_rect: Rect2 = _gameplay_canvas_css_rect()
	var candidates: Array[int] = _current_piece_candidates()
	var before_false: int = 0
	var after_false: int = 0
	var before_wrong: int = 0
	var after_wrong: int = 0
	var samples: int = 0
	var centers: int = 0
	var before_total_usec: int = 0
	var after_total_usec: int = 0
	var before_max_usec: int = 0
	var after_max_usec: int = 0
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
				var jitter_css: float = minf(TOUCH_RESCUE_RADIUS_CSS * 0.92, diameter_css * 0.30)
				var offsets: Array[Vector2] = [Vector2.ZERO]
				for angle: float in [0.0, PI * 0.5, PI, PI * 1.5]:
					offsets.append(_touch_css_offset_to_internal(jitter_css, angle))

				for offset: Vector2 in offsets:
					var sample: Vector2 = center + offset
					var before_started: int = Time.get_ticks_usec()
					var baseline: int = _mesh_piece_at_pointer(sample, candidates)
					var before_elapsed: int = Time.get_ticks_usec() - before_started
					var after_started: int = Time.get_ticks_usec()
					var improved: int = _touch_piece_at_pointer(sample, candidates)
					var after_elapsed: int = Time.get_ticks_usec() - after_started
					before_total_usec += before_elapsed
					after_total_usec += after_elapsed
					before_max_usec = maxi(before_max_usec, before_elapsed)
					after_max_usec = maxi(after_max_usec, after_elapsed)
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
	var before_avg_ms: float = float(before_total_usec) / float(maxi(samples, 1)) / 1000.0
	var after_avg_ms: float = float(after_total_usec) / float(maxi(samples, 1)) / 1000.0
	var before_max_ms: float = float(before_max_usec) / 1000.0
	var after_max_ms: float = float(after_max_usec) / 1000.0
	var passed: bool = (
		centers >= 6
		and samples > 0
		and before_false > 0
		and after_false < before_false
		and after_wrong <= before_wrong
		and reduction >= TOUCH_AUDIT_REQUIRED_REDUCTION
	)
	_publish_touch_audit(
		passed,
		centers,
		samples,
		before_false,
		after_false,
		before_wrong,
		after_wrong,
		reduction,
		before_avg_ms,
		after_avg_ms,
		before_max_ms,
		after_max_ms,
		canvas_rect.size
	)


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
	var now: int = Time.get_ticks_msec()
	if now - _touch_safe_area_cache_msec < 1000:
		return _touch_safe_area_cache
	_touch_safe_area_cache_msec = now
	var raw: Variant = JavaScriptBridge.eval(
		"JSON.stringify((()=>{let e=document.getElementById('__yakolak_touch_safe_probe');if(!e){e=document.createElement('div');e.id='__yakolak_touch_safe_probe';e.style.cssText='position:fixed;visibility:hidden;pointer-events:none;padding-left:env(safe-area-inset-left);padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);padding-bottom:env(safe-area-inset-bottom)';document.body.appendChild(e)}const s=getComputedStyle(e);return{l:parseFloat(s.paddingLeft)||0,t:parseFloat(s.paddingTop)||0,r:parseFloat(s.paddingRight)||0,b:parseFloat(s.paddingBottom)||0}})())",
		true
	)
	var decoded: Variant = JSON.parse_string(str(raw))
	if decoded is Dictionary:
		var values: Dictionary = decoded as Dictionary
		_touch_safe_area_cache = Vector4(
			float(values.get("l", 0.0)),
			float(values.get("t", 0.0)),
			float(values.get("r", 0.0)),
			float(values.get("b", 0.0))
		)
	return _touch_safe_area_cache


func _publish_touch_target_contract() -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakTouchPickModel='exact-mesh-then-visible-slop';" +
		"document.body.dataset.yakolakTouchRescueRadiusCss='18';" +
		"document.body.dataset.yakolakTouchSafeGutterCss='8';" +
		"document.body.dataset.yakolakTouchProbeBudget='16';" +
		"document.body.dataset.yakolakTouchVisualChange='none';",
		true
	)


func _publish_touch_audit(
	passed: bool,
	centers: int,
	samples: int,
	before_false: int,
	after_false: int,
	before_wrong: int,
	after_wrong: int,
	reduction: float,
	before_avg_ms: float,
	after_avg_ms: float,
	before_max_ms: float,
	after_max_ms: float,
	viewport_css: Vector2
) -> void:
	var status: String = "passed" if passed else "failed"
	print(
		"YAKOLAK_TOUCH_AUDIT_%s viewport=%dx%d fingers=36,44,52 centers=%d samples=%d before_false=%d after_false=%d before_wrong=%d after_wrong=%d reduction=%.1f%% avg_ms=%.3f->%.3f max_ms=%.3f->%.3f rescue=18 safe=8 probes=16" % [
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
			before_avg_ms,
			after_avg_ms,
			before_max_ms,
			after_max_ms,
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
		"document.body.dataset.yakolakTouchAuditBeforeAvgMs='%s';" % str(before_avg_ms) +
		"document.body.dataset.yakolakTouchAuditAfterAvgMs='%s';" % str(after_avg_ms) +
		"document.body.dataset.yakolakTouchAuditBeforeMaxMs='%s';" % str(before_max_ms) +
		"document.body.dataset.yakolakTouchAuditAfterMaxMs='%s';" % str(after_max_ms) +
		"document.body.dataset.yakolakTouchAuditFingerDiameters='36,44,52';" +
		"document.body.dataset.yakolakTouchAuditViewport='%dx%d';" % [int(round(viewport_css.x)), int(round(viewport_css.y))],
		true
	)


func _gameplay_canvas_css_rect() -> Rect2:
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	if not OS.has_feature("web"):
		return Rect2(Vector2.ZERO, viewport_size)
	var raw: Variant = JavaScriptBridge.eval(
		"JSON.stringify((()=>{const c=document.getElementById('canvas');const r=c?c.getBoundingClientRect():{left:0,top:0,width:window.innerWidth,height:window.innerHeight};return{x:r.left,y:r.top,w:r.width,h:r.height};})())",
		true
	)
	var parsed: Variant = JSON.parse_string(str(raw))
	if parsed is Dictionary:
		var data := parsed as Dictionary
		var rect := Rect2(
			Vector2(float(data.get("x", 0.0)), float(data.get("y", 0.0))),
			Vector2(float(data.get("w", 0.0)), float(data.get("h", 0.0)))
		)
		if rect.size.x > 1.0 and rect.size.y > 1.0:
			return rect
	return Rect2(Vector2.ZERO, viewport_size)