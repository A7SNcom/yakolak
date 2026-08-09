extends "res://scripts/gameplay_session_polish.gd"

# Nested stone selection must follow the visible ring the user taps, not the
# first collision surface returned by the physics ray. The large piece wraps
# around the smaller pieces, so a normal ray can legitimately hit "large"
# while the pointer visually sits in the medium/small region.

const STACK_PICK_MARGIN: float = 1.10


func _handle_pointer(screen_position: Vector2) -> void:
	# Once the tray is raised, keep the existing direct-piece behaviour so a
	# second tap can switch sizes without ambiguity.
	if tray_open:
		var tray_hit: Dictionary = _ray_pick(screen_position, PIECE_LAYER)
		if not tray_hit.is_empty():
			var tray_collider: Object = tray_hit["collider"] as Object
			if tray_collider != null and tray_collider.has_meta("piece_index"):
				var tray_piece_index: int = int(tray_collider.get_meta("piece_index"))
				if tray_indices.has(tray_piece_index):
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

	# Resolve the intended nested ring geometrically in the stack's own plane.
	# This deliberately does not trust the first physics surface, because the
	# outer large model can occlude the medium/small models from the camera.
	var piece_index: int = _nested_piece_at_pointer(screen_position)
	if piece_index >= 0:
		var record: Dictionary = piece_records[piece_index] as Dictionary
		if bool(record.get("played", false)):
			return
		if str(record["dir"]) != _current_direction():
			_flash_result("هذا الشوك ليس للدور الحالي")
			_publish_match_state("wrong-owner")
			return
		if not _has_legal_cell_for_size(str(record["type"])):
			_flash_result("لا توجد خانة لهذا الحجم")
			_publish_match_state("no-legal-cell")
			return
		_open_piece_tray(piece_index)
		return

	if selected_index >= 0:
		_clear_selection()


func _nested_piece_at_pointer(screen_position: Vector2) -> int:
	if camera == null:
		return -1
	var best_index: int = -1
	var best_normalized_radius: float = INF
	var visited: Dictionary = {}

	for record_value: Variant in piece_records:
		var record: Dictionary = record_value as Dictionary
		if bool(record.get("played", false)):
			continue
		var direction: String = str(record.get("dir", ""))
		var side: int = int(record.get("side", 0))
		var stack_key: String = "%s:%d" % [direction, side]
		if visited.has(stack_key):
			continue
		visited[stack_key] = true

		var available: Array[int] = _available_stack_indices(direction, side)
		if available.is_empty():
			continue
		var reference_index: int = _largest_stack_index(available)
		if reference_index < 0:
			continue
		var reference: MeshInstance3D = (piece_records[reference_index] as Dictionary).get("mesh") as MeshInstance3D
		if reference == null or reference.mesh == null:
			continue

		var local_hit: Vector3 = _pointer_on_piece_plane(reference, screen_position)
		if not is_finite(local_hit.x):
			continue
		var radial: float = Vector2(local_hit.x, local_hit.y).length()
		var outer_radius: float = _piece_mesh_radius(reference_index)
		if outer_radius <= 0.0 or radial > outer_radius * STACK_PICK_MARGIN:
			continue
		var normalized: float = radial / outer_radius
		if normalized >= best_normalized_radius:
			continue
		var intended: int = _size_index_for_radial(available, radial)
		if intended >= 0:
			best_index = intended
			best_normalized_radius = normalized

	return best_index


func _available_stack_indices(direction: String, side: int) -> Array[int]:
	var result: Array[int] = []
	for index: int in range(piece_records.size()):
		var record: Dictionary = piece_records[index] as Dictionary
		if bool(record.get("played", false)):
			continue
		if str(record.get("dir", "")) == direction and int(record.get("side", 0)) == side:
			result.append(index)
	return result


func _largest_stack_index(indices: Array[int]) -> int:
	var result: int = -1
	var largest: float = -1.0
	for index: int in indices:
		var radius: float = _piece_mesh_radius(index)
		if radius > largest:
			largest = radius
			result = index
	return result


func _piece_mesh_radius(piece_index: int) -> float:
	if piece_index < 0 or piece_index >= piece_records.size():
		return 0.0
	var mesh_instance: MeshInstance3D = (piece_records[piece_index] as Dictionary).get("mesh") as MeshInstance3D
	if mesh_instance == null or mesh_instance.mesh == null:
		return 0.0
	var aabb: AABB = mesh_instance.mesh.get_aabb()
	return maxf(aabb.size.x, aabb.size.y) * 0.5


func _pointer_on_piece_plane(reference: MeshInstance3D, screen_position: Vector2) -> Vector3:
	var origin: Vector3 = camera.project_ray_origin(screen_position)
	var direction: Vector3 = camera.project_ray_normal(screen_position)
	if absf(direction.y) < 0.00001:
		return Vector3(INF, INF, INF)
	var plane_y: float = reference.global_position.y
	var t: float = (plane_y - origin.y) / direction.y
	if t <= 0.0:
		return Vector3(INF, INF, INF)
	var world_hit: Vector3 = origin + direction * t
	return reference.to_local(world_hit)


func _size_index_for_radial(indices: Array[int], radial: float) -> int:
	var ranked: Array[Dictionary] = []
	for index: int in indices:
		ranked.append({
			"index": index,
			"radius": _piece_mesh_radius(index),
		})
	ranked.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["radius"]) < float(b["radius"]))
	if ranked.is_empty():
		return -1
	if ranked.size() == 1:
		return int(ranked[0]["index"])

	# Boundaries sit halfway between neighboring physical radii. With all three
	# pieces available this gives intuitive concentric zones: inner small,
	# middle medium, outer large. Missing/played sizes naturally collapse zones.
	for rank: int in range(ranked.size() - 1):
		var boundary: float = (float(ranked[rank]["radius"]) + float(ranked[rank + 1]["radius"])) * 0.5
		if radial <= boundary:
			return int(ranked[rank]["index"])
	return int(ranked[ranked.size() - 1]["index"])


func _publish_piece_test_targets() -> void:
	if camera == null:
		return
	var direction: String = _current_direction()
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var viewport_center: Vector2 = viewport_size * 0.5
	var best_stack: Array[int] = []
	var best_distance: float = INF

	for side: int in [-1, 0, 1]:
		var available: Array[int] = _available_stack_indices(direction, side)
		if available.is_empty():
			continue
		var reference_index: int = _largest_stack_index(available)
		var reference: MeshInstance3D = (piece_records[reference_index] as Dictionary).get("mesh") as MeshInstance3D
		if reference == null:
			continue
		var point: Vector2 = camera.unproject_position(reference.global_position)
		var visible: bool = point.x >= 0.0 and point.x <= viewport_size.x and point.y >= 0.0 and point.y <= viewport_size.y
		var distance: float = point.distance_squared_to(viewport_center) + (0.0 if visible else 100000000.0)
		if distance < best_distance:
			best_distance = distance
			best_stack = available

	if best_stack.is_empty():
		return

	var script: String = ""
	for size_name: String in ["small", "medium", "large"]:
		var index: int = -1
		for candidate: int in best_stack:
			if str((piece_records[candidate] as Dictionary).get("type", "")) == size_name:
				index = candidate
				break
		if index < 0:
			continue
		var mesh_instance: MeshInstance3D = (piece_records[index] as Dictionary).get("mesh") as MeshInstance3D
		var radius: float = _piece_mesh_radius(index)
		# Target 90% of the physical radius along local +X. The semantic picker
		# interprets this point in the same local plane, so the test exercises a
		# real browser click even if the large collision shell sits in front.
		var world_target: Vector3 = mesh_instance.to_global(Vector3(radius * 0.90, 0.0, 0.0))
		var point: Vector2 = camera.unproject_position(world_target)
		var cap: String = size_name.capitalize()
		script += "document.body.dataset.yakolakTest%sX='%s';" % [cap, str(point.x)]
		script += "document.body.dataset.yakolakTest%sY='%s';" % [cap, str(point.y)]
	JavaScriptBridge.eval(script, true)
