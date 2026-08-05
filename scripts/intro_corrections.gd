extends Node

# Applies the corrections already proven in the Three.js versions:
# - exact XYZ Euler interpretation only for the imported game models
# - quaternion slerp for the two side bases instead of broken Euler mixing
# - approved horizontal star table generated from table.svg
# The camera, table and lights keep Godot's normal transform semantics.

const U: float = 0.04
const R3: float = 135.0
const LID_SHAKE: float = 550.0
const LID_LIFT: float = 1300.0
const LID_HEIGHT: float = 900.0
const WALL_DELAY: float = 520.0
const WALL_SHAKE: float = 280.0
const WALL_RAISE: float = 20.0
const WALL_LIFT: float = 360.0
const WALL_MOVE: float = 850.0
const WALL_DROP: float = 430.0
const TABLE_MESH: String = "res://generated/table.obj"
const TABLE_THICKNESS: float = 0.8
const TABLE_TOP_Y: float = -0.04
const ORDER: Array[String] = ["right", "left", "front", "back"]

var intro: Node3D
var camera: Camera3D
var board: MeshInstance3D
var lid: MeshInstance3D
var tabletop: MeshInstance3D
var pedestal: MeshInstance3D
var bases: Dictionary = {}
var initialized: bool = false
var validated: bool = false


func _ready() -> void:
	process_priority = 100
	intro = get_parent() as Node3D
	set_process(true)


func _process(_delta: float) -> void:
	if not initialized:
		initialized = _initialize_when_ready()
		if not initialized:
			return

	var playing: bool = bool(intro.get("playing"))
	var elapsed: float = float(Time.get_ticks_msec() - int(intro.get("started_msec")))
	_apply_exact_pose(board, _base_final("board"))
	_apply_exact_pose(lid, _lid_at(elapsed))
	lid.visible = elapsed < LID_SHAKE + LID_LIFT
	for direction: String in ORDER:
		_apply_corrected_wall(direction, elapsed)

	if not playing:
		_snap_corrected_final()
		if not validated:
			validated = true
			_validate_geometry()


func _initialize_when_ready() -> bool:
	if intro == null:
		return false
	board = intro.get_node_or_null("Board") as MeshInstance3D
	lid = intro.get_node_or_null("Lid") as MeshInstance3D
	camera = intro.get("camera") as Camera3D
	if camera == null:
		camera = intro.get_node_or_null("Camera3D") as Camera3D
	if board == null or lid == null or camera == null:
		return false
	for direction: String in ORDER:
		var base := intro.get_node_or_null("Base_%s" % direction) as MeshInstance3D
		if base == null:
			return false
		bases[direction] = base

	# Three.js used XYZ only for the imported board, lid, bases and stones.
	# Applying this to every Node3D previously corrupted the camera and lights.
	board.rotation_order = EULER_ORDER_XYZ
	lid.rotation_order = EULER_ORDER_XYZ
	for direction: String in ORDER:
		(bases[direction] as Node3D).rotation_order = EULER_ORDER_XYZ
	for child: Node in intro.get_children():
		if child is Node3D and String(child.name).begins_with("Stone_"):
			(child as Node3D).rotation_order = EULER_ORDER_XYZ

	_replace_fallback_table_with_star_table()
	_center_camera()
	if not get_viewport().size_changed.is_connected(_center_camera):
		get_viewport().size_changed.connect(_center_camera)
	_publish_marker("corrected-level")
	return true


func _center_camera() -> void:
	if camera == null:
		return
	camera.rotation_order = EULER_ORDER_YXZ
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var aspect: float = viewport_size.x / maxf(viewport_size.y, 1.0)
	var distance: float = 17.6 if aspect < 0.8 else 19.4
	camera.position = Vector3(distance, distance * 0.82, distance)
	camera.look_at(Vector3(0.0, 0.35, 0.0), Vector3.UP)
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakCamera='level-centered';", true)


func _replace_fallback_table_with_star_table() -> void:
	for child: Node in intro.get_children():
		if not child is MeshInstance3D:
			continue
		var mesh_instance := child as MeshInstance3D
		if mesh_instance.name == "OriginalFallbackTableTop":
			mesh_instance.queue_free()
		elif mesh_instance.mesh is BoxMesh and mesh_instance.position.y < -1.0:
			mesh_instance.queue_free()

	var table_resource: Resource = load(TABLE_MESH)
	if table_resource == null or not table_resource is Mesh:
		push_error("Approved star table mesh is missing")
		_publish_error("table-missing")
		return

	tabletop = MeshInstance3D.new()
	tabletop.name = "ApprovedStarTableSVG"
	tabletop.mesh = table_resource as Mesh
	tabletop.position = Vector3(0.0, TABLE_TOP_Y - TABLE_THICKNESS, 0.0)
	tabletop.rotation = Vector3.ZERO
	tabletop.rotation_order = EULER_ORDER_YXZ
	tabletop.scale = Vector3.ONE
	tabletop.material_override = _material(Color("#aeb2b6"), 0.72, 0.02)
	tabletop.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	intro.add_child(tabletop)

	var pedestal_mesh := CylinderMesh.new()
	pedestal_mesh.top_radius = 2.0
	pedestal_mesh.bottom_radius = 2.35
	pedestal_mesh.height = 24.5
	pedestal_mesh.radial_segments = 64
	pedestal = MeshInstance3D.new()
	pedestal.name = "ApprovedStarTablePedestal"
	pedestal.mesh = pedestal_mesh
	pedestal.position = Vector3(0.0, TABLE_TOP_Y - TABLE_THICKNESS - 12.25, 0.0)
	pedestal.rotation = Vector3.ZERO
	pedestal.rotation_order = EULER_ORDER_YXZ
	pedestal.scale = Vector3.ONE
	pedestal.material_override = _material(Color("#8f9499"), 0.82, 0.01)
	pedestal.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	intro.add_child(pedestal)

	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakTable='approved-star-svg';" +
			"document.body.dataset.yakolakTableLevel='true';",
			true
		)
	print("YAKOLAK_STAR_TABLE_APPLIED level=true centered=true")


func _apply_corrected_wall(direction: String, elapsed: float) -> void:
	var node := bases[direction] as Node3D
	var start := _wall_start(direction)
	var finish := _base_final(direction)
	var index: int = ORDER.find(direction)
	var deployment_start: float = LID_SHAKE + float(index) * WALL_DELAY
	var raised := start.duplicate()
	raised["py"] = float(start["py"]) + WALL_RAISE
	var raised_finish := finish.duplicate()
	raised_finish["py"] = float(start["py"]) + WALL_RAISE
	var time: float = elapsed - deployment_start

	if time <= 0.0:
		_apply_exact_pose(node, start)
		return
	if time < WALL_SHAKE:
		var fade: float = 1.0 - time / WALL_SHAKE
		var wave: float = sin(time * 0.06) * 2.2 * fade
		var shaken := start.duplicate()
		shaken["rx"] = float(shaken["rx"]) + wave * 0.4
		shaken["ry"] = float(shaken["ry"]) + wave * 0.25
		shaken["rz"] = float(shaken["rz"]) + wave * 0.35
		_apply_exact_pose(node, shaken)
		return

	time -= WALL_SHAKE
	if time < WALL_LIFT:
		_apply_position_and_quaternion(node, _mix_position(start, raised, time / WALL_LIFT), _quat_xyz(start))
		return
	time -= WALL_LIFT
	if time < WALL_MOVE:
		var progress: float = _ease(time / WALL_MOVE)
		var rotation: Quaternion = _quat_xyz(start).slerp(_quat_xyz(finish), progress)
		_apply_position_and_quaternion(node, _mix_position_raw(raised, raised_finish, progress), rotation)
		return
	time -= WALL_MOVE
	if time < WALL_DROP:
		_apply_position_and_quaternion(node, _mix_position(raised_finish, finish, time / WALL_DROP), _quat_xyz(finish))
		return
	_apply_exact_pose(node, finish)


func _lid_at(elapsed: float) -> Dictionary:
	var pose := _lid_start().duplicate()
	if elapsed < LID_SHAKE:
		var fade: float = 1.0 - elapsed / LID_SHAKE
		var wave: float = sin(elapsed * 0.12) * 2.8 * fade
		pose["rx"] = float(pose["rx"]) + wave * 0.55
		pose["ry"] = float(pose["ry"]) + cos(elapsed * 0.09) * 1.1 * fade
		pose["rz"] = float(pose["rz"]) + sin(elapsed * 0.07) * 1.4 * fade
		return pose
	pose["py"] = float(pose["py"]) + LID_HEIGHT * _ease((elapsed - LID_SHAKE) / LID_LIFT)
	return pose


func _snap_corrected_final() -> void:
	_apply_exact_pose(board, _base_final("board"))
	for direction: String in ORDER:
		_apply_exact_pose(bases[direction] as Node3D, _base_final(direction))
	lid.visible = false


func _validate_geometry() -> void:
	var table_level: bool = tabletop != null and absf(tabletop.global_basis.y.normalized().dot(Vector3.UP)) > 0.999
	var table_centered: bool = tabletop != null and absf(tabletop.global_position.x) < 0.001 and absf(tabletop.global_position.z) < 0.001
	var camera_level: bool = camera != null and absf(camera.global_basis.x.normalized().dot(Vector3.UP)) < 0.002
	var valid: bool = table_level and table_centered and camera_level
	for direction: String in ORDER:
		var node := bases[direction] as Node3D
		var expected := _position_from_pose(_base_final(direction))
		valid = valid and node.position.distance_to(expected) < 0.002
		valid = valid and absf(node.quaternion.dot(_quat_xyz(_base_final(direction)))) > 0.999
	valid = valid and not lid.visible
	if valid:
		print("YAKOLAK_CORRECTED_GEOMETRY_READY lid=centered side_bases=quaternion table=level-star camera=level-centered")
		if OS.has_feature("web"):
			JavaScriptBridge.eval(
				"document.body.dataset.yakolakGeometry='ready';" +
				"document.body.dataset.yakolakCamera='level-centered';" +
				"document.body.dataset.yakolakTableLevel='true';",
				true
			)
	else:
		push_error("Corrected intro geometry validation failed")
		_publish_error("geometry")


func _base_final(key: String) -> Dictionary:
	match key:
		"board": return _pose(0.0, 6.0, 0.0, -90.0, 0.0, 0.0)
		"right": return _pose(R3, 6.0, 0.0, -90.0, 0.0, 0.0)
		"left": return _pose(-R3, 6.0, 0.0, -90.0, 0.0, 180.0)
		"front": return _pose(0.0, 6.0, R3, -90.0, 0.0, 90.0)
		_: return _pose(0.0, 6.0, -R3, -90.0, 0.0, -90.0)


func _lid_start() -> Dictionary:
	return _pose(0.0, 62.5, 0.0, -90.0, 180.0, 0.0)


func _wall_start(direction: String) -> Dictionary:
	match direction:
		"right": return _pose(81.0, 35.0, 0.0, -90.0, -90.0, 0.0)
		"left": return _pose(-81.0, 35.0, 0.0, -90.0, 90.0, 180.0)
		"front": return _pose(0.0, 35.0, 81.0, -180.0, 0.0, 90.0)
		_: return _pose(0.0, 35.0, -81.0, -180.0, 180.0, -90.0)


func _pose(px: float, py: float, pz: float, rx: float, ry: float, rz: float) -> Dictionary:
	return {"px": px, "py": py, "pz": pz, "rx": rx, "ry": ry, "rz": rz}


func _position_from_pose(pose: Dictionary) -> Vector3:
	return Vector3(float(pose["px"]), float(pose["py"]), float(pose["pz"])) * U


func _apply_exact_pose(node: Node3D, pose: Dictionary) -> void:
	node.position = _position_from_pose(pose)
	node.quaternion = _quat_xyz(pose)


func _apply_position_and_quaternion(node: Node3D, position_pose: Dictionary, rotation: Quaternion) -> void:
	node.position = _position_from_pose(position_pose)
	node.quaternion = rotation.normalized()


func _quat_xyz(pose: Dictionary) -> Quaternion:
	# Exact formula used by Three.js Quaternion.setFromEuler(..., 'XYZ').
	var x: float = deg_to_rad(float(pose["rx"])) * 0.5
	var y: float = deg_to_rad(float(pose["ry"])) * 0.5
	var z: float = deg_to_rad(float(pose["rz"])) * 0.5
	var c1: float = cos(x)
	var c2: float = cos(y)
	var c3: float = cos(z)
	var s1: float = sin(x)
	var s2: float = sin(y)
	var s3: float = sin(z)
	return Quaternion(
		s1 * c2 * c3 + c1 * s2 * s3,
		c1 * s2 * c3 - s1 * c2 * s3,
		c1 * c2 * s3 + s1 * s2 * c3,
		c1 * c2 * c3 - s1 * s2 * s3
	).normalized()


func _ease(value: float) -> float:
	var t: float = clampf(value, 0.0, 1.0)
	return 4.0 * t * t * t if t < 0.5 else 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0


func _mix_position(from: Dictionary, to: Dictionary, value: float) -> Dictionary:
	return _mix_position_raw(from, to, _ease(value))


func _mix_position_raw(from: Dictionary, to: Dictionary, value: float) -> Dictionary:
	return _pose(
		lerpf(float(from["px"]), float(to["px"]), value),
		lerpf(float(from["py"]), float(to["py"]), value),
		lerpf(float(from["pz"]), float(to["pz"]), value),
		0.0, 0.0, 0.0
	)


func _material(color: Color, roughness: float, metallic: float) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = roughness
	material.metallic = metallic
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	return material


func _publish_marker(value: String) -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakCorrections='" + value + "';", true)


func _publish_error(reason: String) -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakGeometry='error';" +
			"document.body.dataset.yakolakGeometryError='" + reason + "';",
			true
		)
