extends "res://scripts/pre_intro_star_to_table_testable.gd"

# Keep the approved closed-box timing and rigid shell, but move frame zero of
# the drop above the actual camera viewport. The box therefore enters from the
# top edge instead of popping into existence in a visible area.

const OFFSCREEN_BOX_MARGIN_PX: float = 64.0
var hidden_box_start_height: float = CLOSED_BOX_START_HEIGHT


func _begin_closed_box_drop() -> void:
	super._begin_closed_box_drop()
	if closed_box_root == null:
		return
	hidden_box_start_height = _find_hidden_box_start_height()
	closed_box_root.position = Vector3(0.0, hidden_box_start_height, 0.0)
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakClosedBoxSpawn='offscreen-top';" +
			"document.body.dataset.yakolakClosedBoxStartY='" + str(hidden_box_start_height) + "';" +
			"document.body.dataset.yakolakClosedBoxDropTiming='unchanged';",
			true
		)
	print("YAKOLAK_CLOSED_BOX_OFFSCREEN_START y=%.2f" % hidden_box_start_height)


func _find_hidden_box_start_height() -> float:
	if camera == null or closed_box_root == null:
		return maxf(CLOSED_BOX_START_HEIGHT, 24.0)
	var candidate: float = CLOSED_BOX_START_HEIGHT
	for _step: int in range(40):
		closed_box_root.position = Vector3(0.0, candidate, 0.0)
		if _closed_box_is_fully_above_viewport():
			return candidate
		candidate += 2.5
	return candidate


func _closed_box_is_fully_above_viewport() -> bool:
	if camera == null:
		return false
	var projected_any: bool = false
	var lowest_screen_y: float = -INF
	for node: GeometryInstance3D in shell_nodes:
		if not node is MeshInstance3D:
			continue
		var mesh_instance := node as MeshInstance3D
		if mesh_instance.mesh == null:
			continue
		var aabb: AABB = mesh_instance.mesh.get_aabb()
		for x_index: int in 2:
			for y_index: int in 2:
				for z_index: int in 2:
					var local := aabb.position + Vector3(
						aabb.size.x * float(x_index),
						aabb.size.y * float(y_index),
						aabb.size.z * float(z_index)
					)
					var world: Vector3 = mesh_instance.global_transform * local
					if camera.is_position_behind(world):
						continue
					var screen: Vector2 = camera.unproject_position(world)
					projected_any = true
					lowest_screen_y = maxf(lowest_screen_y, screen.y)
	return projected_any and lowest_screen_y < -OFFSCREEN_BOX_MARGIN_PX


func _apply_closed_box_drop(drop_elapsed: float) -> void:
	if closed_box_root == null or closed_box_landed:
		return
	if not _closed_shell_is_rigid():
		push_error("A closed-box part moved independently during the drop")
		_publish_web_state("error")
		return
	var raw_t: float = clampf(drop_elapsed / CLOSED_BOX_DROP_MS, 0.0, 1.0)
	var y: float
	if raw_t < 0.78:
		var fall_t: float = _ease_in_cubic(raw_t / 0.78)
		y = lerpf(hidden_box_start_height, -CLOSED_BOX_IMPACT_DEPTH, fall_t)
	elif raw_t < 0.90:
		var rebound_t: float = _ease_out_cubic((raw_t - 0.78) / 0.12)
		y = lerpf(-CLOSED_BOX_IMPACT_DEPTH, CLOSED_BOX_REBOUND_HEIGHT, rebound_t)
	else:
		var settle_t: float = _smootherstep((raw_t - 0.90) / 0.10)
		y = lerpf(CLOSED_BOX_REBOUND_HEIGHT, 0.0, settle_t)
	closed_box_root.position = Vector3(0.0, y, 0.0)
