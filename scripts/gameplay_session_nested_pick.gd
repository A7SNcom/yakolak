extends "res://scripts/gameplay_session_polish.gd"

# Piece selection is resolved against the rendered stone triangles, not against
# physics proxy boxes. L/M/S are nested rings: a solid AABB has no knowledge of
# the visible holes and can therefore report a large/near box when the player
# actually tapped the medium/small stone behind that empty space.
#
# This picker is intentionally shared by the closed stack and the raised tray.
# Mouse and touch already arrive here as the same viewport position, so one
# screen ray now has one meaning regardless of input device, camera angle or FOV.

var _pick_face_cache: Dictionary = {}
var _pick_target_revision: int = 0
var _web_refresh_pick_targets_callback: Variant


func _ready() -> void:
	super._ready()
	if OS.has_feature("web") and browser_automation:
		_web_refresh_pick_targets_callback = JavaScriptBridge.create_callback(_on_web_refresh_pick_targets)
		var window: JavaScriptObject = JavaScriptBridge.get_interface("window")
		if window != null:
			window.set("yakolakTestRefreshPickTargets", _web_refresh_pick_targets_callback)


func _handle_pointer(screen_position: Vector2) -> void:
	# Once the tray is raised, switching sizes must still use the exact rendered
	# geometry. Do not fall back to PIECE_LAYER AABBs here: the nested proxy boxes
	# overlap even when the visible rings do not.
	if tray_open:
		var tray_piece_index: int = _mesh_piece_at_pointer(screen_position, tray_indices)
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

	# Only unplayed stones owned by the active player may compete for the ray.
	# If two neighboring stacks overlap in screen space, the nearest real mesh
	# intersection wins; a stone behind another visible stone cannot steal it.
	var piece_index: int = _mesh_piece_at_pointer(screen_position, _current_piece_candidates())
	if browser_automation:
		print("YAKOLAK_MESH_PICK pointer=(%.2f,%.2f) resolved=%d" % [screen_position.x, screen_position.y, piece_index])
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

		# Transform the same camera ray into each stone's local space. This makes
		# the test independent of the stone orientation and of camera angle/zoom.
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
	# A projected ring can be only a few pixels thick at an oblique mobile angle.
	# Prefer a broad stable island, but never declare a genuinely visible stone
	# untestable just because an arbitrary fixed 3px neighborhood cannot fit.
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
	# Test automation aims only at a point where the production picker itself sees
	# this exact mesh as frontmost. Search strongest margins first, then gracefully
	# fall back for a thin but still genuinely visible projected ring.
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

	# Publish one genuinely exposed browser target for every size in every
	# neighboring stack. During an open tray, only that tray competes because
	# that is exactly what the production pointer handler does.
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
