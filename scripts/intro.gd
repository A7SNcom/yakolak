extends Node3D

# YAKOLAK 2.5 — direct Godot port of the accepted Three.js intro.
# Source of truth: src/app-live.js at commit 4096a243, intro version v071.
# No setup screen, gameplay, labels, invented transitions, or coloured bases.

const U: float = 0.04
const BOARD_MESH: String = "res://generated/board_and_lid.obj"
const BASE_MESH: String = "res://generated/player_base.obj"
const PIECE_MESHES: Dictionary = {
	"large": "res://generated/piece_large.obj",
	"medium": "res://generated/piece_medium.obj",
	"small": "res://generated/piece_small.obj",
}

const D: float = 48.0
const R3: float = 135.0
const BASE_COLOR: Color = Color("#161616")
const TYPE_ORDER: Array[String] = ["large", "medium", "small"]
const ORDER: Array[String] = ["right", "left", "front", "back"]
const DIRECTION_COLOR: Dictionary = {
	"right": "marble",
	"left": "gold",
	"front": "green",
	"back": "blue",
}
const STONE_COLORS: Dictionary = {
	"marble": Color("#ffffff"),
	"gold": Color("#8a570f"),
	"green": Color("#006144"),
	"blue": Color("#001f8f"),
}

# Exact accepted Three.js timing values, milliseconds.
const LID_SHAKE: float = 550.0
const LID_LIFT: float = 1300.0
const LID_HEIGHT: float = 900.0
const WALL_DELAY: float = 520.0
const WALL_SHAKE: float = 280.0
const WALL_RAISE: float = 20.0
const WALL_LIFT: float = 360.0
const WALL_MOVE: float = 850.0
const WALL_DROP: float = 430.0
const PIECE_LEAD: float = 520.0
const PIECE_MOVE: float = 1200.0
const PIECE_ARC: float = 34.0
const PIECE_STAGGER: float = 60.0
const TOTAL_TIME: float = 5730.0

const SPILL_SEED: int = 4128
const SPILL_SPREAD: float = 1.08
const SPILL_HEIGHT: float = 0.82
const SPILL_CLEARANCE: float = 1.32

class Mulberry32:
	var state: int

	func _init(seed: int) -> void:
		state = seed & 0xffffffff

	func next() -> float:
		state = (state + 0x6D2B79F5) & 0xffffffff
		var value: int = state
		value = ((value ^ (value >> 15)) * (value | 1)) & 0xffffffff
		var mixed: int = ((value ^ (value >> 7)) * (value | 61)) & 0xffffffff
		value = (value ^ ((value + mixed) & 0xffffffff)) & 0xffffffff
		return float((value ^ (value >> 14)) & 0xffffffff) / 4294967296.0

var camera: Camera3D
var board: MeshInstance3D
var lid: MeshInstance3D
var bases: Dictionary = {}
var pieces: Array[Dictionary] = []
var piece_meshes: Dictionary = {}
var piece_radii: Dictionary = {}
var started_msec: int = 0
var playing: bool = false
var published_stage: int = -1
var failed: bool = false
var contents_revealed: bool = false


func _ready() -> void:
	_build_environment()
	_build_table()
	_build_camera()
	_load_and_build_original_models()
	get_viewport().size_changed.connect(_fit_camera)
	_fit_camera.call_deferred()
	if failed:
		_publish_error("asset-load")
		return
	_restart_intro()


func _process(_delta: float) -> void:
	if not playing:
		return
	var elapsed: float = float(Time.get_ticks_msec() - started_msec)
	if not contents_revealed and elapsed >= LID_SHAKE + 40.0:
		contents_revealed = true
		_set_internal_visibility(true)
	_apply_timeline(minf(elapsed, TOTAL_TIME))
	_publish_timeline_stage(elapsed)
	if elapsed >= TOTAL_TIME:
		_snap_final()
		playing = false
		_publish_complete()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch and event.pressed:
		_restart_intro()
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		_restart_intro()
	elif event is InputEventKey and event.pressed and event.keycode == KEY_R:
		_restart_intro()


func _build_environment() -> void:
	var world: WorldEnvironment = WorldEnvironment.new()
	var environment: Environment = Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("#777777")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#fff5e6")
	environment.ambient_light_energy = 0.62
	environment.tonemap_mode = Environment.TONE_MAPPER_ACES
	environment.tonemap_exposure = 1.04
	world.environment = environment
	add_child(world)

	var key: DirectionalLight3D = DirectionalLight3D.new()
	key.rotation_degrees = Vector3(-52.0, -42.0, 0.0)
	key.light_color = Color("#ffe8c8")
	key.light_energy = 1.15
	key.shadow_enabled = true
	add_child(key)

	var fill: DirectionalLight3D = DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-38.0, 136.0, 0.0)
	fill.light_color = Color("#c8d8ff")
	fill.light_energy = 0.28
	add_child(fill)

	var rim: DirectionalLight3D = DirectionalLight3D.new()
	rim.rotation_degrees = Vector3(-34.0, -145.0, 0.0)
	rim.light_color = Color.WHITE
	rim.light_energy = 0.38
	add_child(rim)

	var top: OmniLight3D = OmniLight3D.new()
	top.position = Vector3(0.0, 8.4, 0.0)
	top.light_color = Color("#fff1d6")
	top.light_energy = 0.24
	top.omni_range = 20.8
	add_child(top)


func _build_table() -> void:
	# Exact fallback-table dimensions contained in the accepted Three.js intro.
	var top_mesh: BoxMesh = BoxMesh.new()
	top_mesh.size = Vector3(470.0, 24.0, 360.0) * U
	var top: MeshInstance3D = MeshInstance3D.new()
	top.name = "OriginalFallbackTableTop"
	top.mesh = top_mesh
	top.position.y = -13.0 * U
	top.material_override = _material(Color("#8a5a34"), 0.72, 0.0)
	add_child(top)

	var leg_mesh: BoxMesh = BoxMesh.new()
	leg_mesh.size = Vector3(28.0, 260.0, 28.0) * U
	var leg_points: Array[Vector2] = [
		Vector2(-190.0, -130.0),
		Vector2(190.0, -130.0),
		Vector2(-190.0, 130.0),
		Vector2(190.0, 130.0),
	]
	for point: Vector2 in leg_points:
		var leg: MeshInstance3D = MeshInstance3D.new()
		leg.mesh = leg_mesh
		leg.position = Vector3(point.x, -155.0, point.y) * U
		leg.material_override = _material(Color("#5c351f"), 0.82, 0.0)
		add_child(leg)


func _build_camera() -> void:
	camera = Camera3D.new()
	camera.current = true
	camera.fov = 45.0
	camera.near = 0.01
	camera.far = 200.0
	add_child(camera)
	_fit_camera()


func _fit_camera() -> void:
	if camera == null:
		return
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var aspect: float = viewport_size.x / maxf(viewport_size.y, 1.0)
	# Preserve the accepted diagonal view while avoiding a tiny product on mobile.
	var distance: float = 17.6 if aspect < 0.8 else 19.4
	camera.position = Vector3(distance, distance * 0.82, distance)
	camera.look_at(Vector3(0.0, 0.35, 0.0), Vector3.UP)


func _load_and_build_original_models() -> void:
	var board_resource: Mesh = _load_mesh(BOARD_MESH)
	var base_resource: Mesh = _load_mesh(BASE_MESH)
	for size_name: String in TYPE_ORDER:
		var piece_mesh: Mesh = _load_mesh(str(PIECE_MESHES[size_name]))
		piece_meshes[size_name] = piece_mesh
		var piece_aabb: AABB = piece_mesh.get_aabb()
		piece_radii[size_name] = maxf(piece_aabb.size.x, piece_aabb.size.y) * 0.38
	if failed:
		return

	var black_material: StandardMaterial3D = _material(BASE_COLOR, 0.52, 0.06)
	board = _make_mesh_instance("Board", board_resource, black_material)
	_apply_pose(board, _base_final("board"))

	lid = _make_mesh_instance("Lid", board_resource, black_material)
	_apply_pose(lid, _lid_start())

	for direction: String in ORDER:
		var base: MeshInstance3D = _make_mesh_instance("Base_%s" % direction, base_resource, black_material)
		base.set_meta("base_color", "#161616")
		bases[direction] = base
		_apply_pose(base, _wall_start(direction))

	_build_original_spill_and_piece_targets()


func _make_mesh_instance(label: String, mesh: Mesh, material: Material) -> MeshInstance3D:
	var instance: MeshInstance3D = MeshInstance3D.new()
	instance.name = label
	instance.mesh = mesh
	instance.scale = Vector3.ONE * U
	instance.material_override = material
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(instance)
	return instance


func _load_mesh(path: String) -> Mesh:
	var resource: Resource = load(path)
	if resource == null or not resource is Mesh:
		failed = true
		push_error("Missing original intro mesh: " + path)
		return ArrayMesh.new()
	return resource as Mesh


func _material(color: Color, roughness: float, metallic: float) -> StandardMaterial3D:
	var material: StandardMaterial3D = StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = roughness
	material.metallic = metallic
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	return material


func _stone_material(color_name: String) -> StandardMaterial3D:
	var color: Color = STONE_COLORS[color_name] as Color
	match color_name:
		"marble":
			return _material(color, 0.92, 0.0)
		"gold":
			return _material(color, 0.58, 0.18)
		"green":
			return _material(color, 0.56, 0.10)
		_:
			return _material(color, 0.72, 0.0)


func _build_original_spill_and_piece_targets() -> void:
	var starts: Array[Dictionary] = _generate_spill_starts()
	var buckets: Dictionary = {}
	for start_value: Dictionary in starts:
		var bucket_key: String = "%s-%s" % [start_value["color"], start_value["type"]]
		if not buckets.has(bucket_key):
			buckets[bucket_key] = []
		var start_bucket: Array = buckets[bucket_key] as Array
		start_bucket.append(start_value)

	var targets: Array[Dictionary] = _outer_positions()
	for target: Dictionary in targets:
		for size_name: String in TYPE_ORDER:
			var color_name: String = str(DIRECTION_COLOR[target["direction"]])
			var key: String = "%s-%s" % [color_name, size_name]
			var bucket: Array = buckets[key] as Array
			var start_value: Dictionary = bucket.pop_front() as Dictionary
			var stone_mesh: Mesh = piece_meshes[size_name] as Mesh
			var mesh_instance: MeshInstance3D = _make_mesh_instance(
				"Stone_%s_%s_%s" % [target["direction"], str(target["side"]), size_name],
				stone_mesh,
				_stone_material(color_name)
			)
			var record: Dictionary = {
				"mesh": mesh_instance,
				"type": size_name,
				"dir": str(target["direction"]),
				"side": int(target["side"]),
				"start": _pose(
					float(start_value["px"]), float(start_value["py"]), float(start_value["pz"]),
					float(start_value["rx"]), float(start_value["ry"]), float(start_value["rz"])
				),
				"final": _pose(
					float(target["px"]), float(target["py"]), float(target["pz"]),
					float(target["rx"]), float(target["ry"]), float(target["rz"])
				),
			}
			pieces.append(record)
			_apply_pose(mesh_instance, record["start"] as Dictionary)


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


func _outer_positions() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var definitions: Array[Dictionary] = [
		{"direction": "right", "px": R3, "pz": 0.0, "side_mode": true},
		{"direction": "left", "px": -R3, "pz": 0.0, "side_mode": true},
		{"direction": "front", "px": 0.0, "pz": R3, "side_mode": false},
		{"direction": "back", "px": 0.0, "pz": -R3, "side_mode": false},
	]
	for definition: Dictionary in definitions:
		var side_mode: bool = bool(definition["side_mode"])
		for side: int in [-1, 0, 1]:
			var offset_x: float = 0.0 if side_mode else D * float(side)
			var offset_z: float = D * float(side) if side_mode else 0.0
			result.append({
				"direction": str(definition["direction"]),
				"side": side,
				"px": float(definition["px"]) + offset_x,
				"py": 2.0,
				"pz": float(definition["pz"]) + offset_z,
				"rx": -90.0,
				"ry": 0.0,
				"rz": 0.0,
			})
	return result


func _build_spill_list(seed: int) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var color_order: Array[String] = ["marble", "gold", "blue", "green"]
	for color_name: String in color_order:
		for size_name: String in TYPE_ORDER:
			for _index: int in range(3):
				result.append({"type": size_name, "color": color_name})
	var random: Mulberry32 = Mulberry32.new(seed)
	for index: int in range(result.size() - 1, 0, -1):
		var swap_index: int = int(floor(random.next() * float(index + 1)))
		var temporary: Dictionary = result[index]
		result[index] = result[swap_index]
		result[swap_index] = temporary
	result.sort_custom(_sort_by_type)
	return result


func _sort_by_type(a: Dictionary, b: Dictionary) -> bool:
	var rank: Dictionary = {"large": 0, "medium": 1, "small": 2}
	return int(rank[str(a["type"])]) < int(rank[str(b["type"])])


func _make_slots(seed: int) -> Array[Dictionary]:
	var random: Mulberry32 = Mulberry32.new(seed)
	var slots: Array[Dictionary] = []
	var count: int = 6
	var half: float = 55.0 * SPILL_SPREAD
	var step: float = half * 2.0 / float(count - 1)
	for ix: int in range(count):
		for iz: int in range(count):
			slots.append({
				"x": -half + float(ix) * step + (random.next() - 0.5) * step * 0.32,
				"z": -half + float(iz) * step + (random.next() - 0.5) * step * 0.32,
			})
	for index: int in range(slots.size() - 1, 0, -1):
		var swap_index: int = int(floor(random.next() * float(index + 1)))
		var temporary: Dictionary = slots[index]
		slots[index] = slots[swap_index]
		slots[swap_index] = temporary
	return slots


func _relax_spill(list: Array[Dictionary]) -> void:
	for _iteration: int in range(140):
		for i: int in range(list.size()):
			var a: Dictionary = list[i]
			for j: int in range(i + 1, list.size()):
				var b: Dictionary = list[j]
				var dx: float = float(b["x"]) - float(a["x"])
				var dz: float = float(b["z"]) - float(a["z"])
				var distance: float = maxf(sqrt(dx * dx + dz * dz), 0.001)
				var same_layer_factor: float = 1.0 if int(a["layer"]) == int(b["layer"]) else 0.66
				var needed: float = (float(a["r"]) + float(b["r"])) * SPILL_CLEARANCE * same_layer_factor
				if distance < needed:
					var push: float = (needed - distance) * 0.52
					var nx: float = dx / distance
					var nz: float = dz / distance
					a["x"] = float(a["x"]) - nx * push
					a["z"] = float(a["z"]) - nz * push
					b["x"] = float(b["x"]) + nx * push
					b["z"] = float(b["z"]) + nz * push
		var half: float = 61.0 * SPILL_SPREAD
		for point: Dictionary in list:
			var limit: float = half - float(point["r"]) - 2.0
			point["x"] = clampf(float(point["x"]), -limit, limit)
			point["z"] = clampf(float(point["z"]), -limit, limit)


func _generate_spill_starts() -> Array[Dictionary]:
	var random: Mulberry32 = Mulberry32.new(SPILL_SEED)
	var source: Array[Dictionary] = _build_spill_list(SPILL_SEED + 17)
	var slots: Array[Dictionary] = _make_slots(SPILL_SEED + 99)
	var result: Array[Dictionary] = []
	for index: int in range(source.size()):
		var item: Dictionary = source[index]
		var item_type: String = str(item["type"])
		var radius: float = float(piece_radii[item_type])
		if item_type == "large":
			radius *= 1.08
		elif item_type == "small":
			radius *= 0.93
		var slot: Dictionary = slots[index]
		var layer: int = 0
		if index >= 34:
			layer = 2
		elif index >= 26:
			layer = 1
		var pose_name: String = "lay" if random.next() < 0.72 else "stand"
		result.append({
			"type": item_type,
			"color": str(item["color"]),
			"r": radius,
			"layer": layer,
			"pose": pose_name,
			"x": float(slot["x"]),
			"z": float(slot["z"]),
		})
	_relax_spill(result)

	for index: int in range(result.size()):
		var point: Dictionary = result[index]
		var random_pose: Mulberry32 = Mulberry32.new(SPILL_SEED + index * 13 + 7)
		var laid: bool = str(point["pose"]) == "lay"
		point["px"] = snappedf(float(point["x"]), 0.01)
		point["pz"] = snappedf(float(point["z"]), 0.01)
		var height_value: float
		if laid:
			height_value = 12.0 + float(point["r"]) * 0.72 + float(point["layer"]) * 3.2 * SPILL_HEIGHT
		else:
			height_value = 9.0 + float(point["layer"]) * 3.8 * SPILL_HEIGHT + random_pose.next() * 1.8
		point["py"] = snappedf(height_value, 0.01)
		point["rz"] = round(random_pose.next() * 360.0)
		if laid:
			var base_rotation: float = 0.0 if random_pose.next() < 0.5 else -180.0
			point["rx"] = base_rotation + (random_pose.next() * 2.0 - 1.0) * 9.0
			point["ry"] = (random_pose.next() * 2.0 - 1.0) * 22.0
		else:
			point["rx"] = -90.0 + (random_pose.next() * 2.0 - 1.0) * 10.0
			point["ry"] = (random_pose.next() * 2.0 - 1.0) * 8.0
	return result


func _restart_intro() -> void:
	if failed:
		return
	started_msec = Time.get_ticks_msec()
	playing = true
	published_stage = -1
	contents_revealed = false
	board.visible = true
	lid.visible = true
	board.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	lid.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	_set_internal_visibility(false)
	_apply_timeline(0.0)
	_publish_phase("lid-shaking")
	published_stage = 0


func _set_internal_visibility(visible: bool) -> void:
	for direction: String in ORDER:
		var base := bases[direction] as GeometryInstance3D
		base.visible = visible
		base.cast_shadow = (GeometryInstance3D.SHADOW_CASTING_SETTING_ON if visible else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF)
	for piece: Dictionary in pieces:
		var stone := piece["mesh"] as GeometryInstance3D
		stone.visible = visible
		stone.cast_shadow = (GeometryInstance3D.SHADOW_CASTING_SETTING_ON if visible else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF)
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakIntroContents='" + ("visible-after-lid-lift" if visible else "hidden-inside-closed-shell") + "';", true)


func _apply_timeline(elapsed: float) -> void:
	_apply_pose(board, _base_final("board"))
	_apply_pose(lid, _lid_at(elapsed))
	lid.visible = elapsed < LID_SHAKE + LID_LIFT
	for direction: String in ORDER:
		_apply_pose(bases[direction] as Node3D, _wall_at(direction, elapsed))
	for piece: Dictionary in pieces:
		_apply_pose(piece["mesh"] as Node3D, _piece_at(piece, elapsed))
	if elapsed >= TOTAL_TIME:
		_snap_final()


func _lid_at(elapsed: float) -> Dictionary:
	var pose: Dictionary = _lid_start().duplicate()
	if elapsed < LID_SHAKE:
		var fade: float = 1.0 - elapsed / LID_SHAKE
		var wave: float = sin(elapsed * 0.12) * 2.8 * fade
		pose["rx"] = float(pose["rx"]) + wave * 0.55
		pose["ry"] = float(pose["ry"]) + cos(elapsed * 0.09) * 1.1 * fade
		pose["rz"] = float(pose["rz"]) + sin(elapsed * 0.07) * 1.4 * fade
		return pose
	pose["py"] = float(pose["py"]) + LID_HEIGHT * _ease((elapsed - LID_SHAKE) / LID_LIFT)
	return pose


func _wall_at(direction: String, elapsed: float) -> Dictionary:
	var start: Dictionary = _wall_start(direction)
	var finish: Dictionary = _base_final(direction)
	var index: int = ORDER.find(direction)
	var deployment_start: float = LID_SHAKE + float(index) * WALL_DELAY
	var raised: Dictionary = start.duplicate()
	raised["py"] = float(start["py"]) + WALL_RAISE
	var raised_finish: Dictionary = finish.duplicate()
	raised_finish["py"] = float(start["py"]) + WALL_RAISE
	var time: float = elapsed - deployment_start
	if time <= 0.0:
		return start
	if time < WALL_SHAKE:
		var fade: float = 1.0 - time / WALL_SHAKE
		var wave: float = sin(time * 0.06) * 2.2 * fade
		var shaken: Dictionary = start.duplicate()
		shaken["rx"] = float(shaken["rx"]) + wave * 0.4
		shaken["ry"] = float(shaken["ry"]) + wave * 0.25
		shaken["rz"] = float(shaken["rz"]) + wave * 0.35
		return shaken
	time -= WALL_SHAKE
	if time < WALL_LIFT:
		return _mix_pose(start, raised, time / WALL_LIFT)
	time -= WALL_LIFT
	if time < WALL_MOVE:
		return _mix_pose(raised, raised_finish, time / WALL_MOVE)
	time -= WALL_MOVE
	if time < WALL_DROP:
		return _mix_pose(raised_finish, finish, time / WALL_DROP)
	return finish


func _piece_start(piece: Dictionary) -> float:
	var index: int = ORDER.find(str(piece["dir"]))
	var drop_start: float = LID_SHAKE + float(index) * WALL_DELAY + WALL_SHAKE + WALL_LIFT + WALL_MOVE
	return drop_start - PIECE_LEAD + float(int(piece["side"]) + 1) * PIECE_STAGGER


func _piece_at(piece: Dictionary, elapsed: float) -> Dictionary:
	var progress: float = _ease((elapsed - _piece_start(piece)) / PIECE_MOVE)
	var pose: Dictionary = _mix_pose(piece["start"] as Dictionary, piece["final"] as Dictionary, progress)
	pose["py"] = float(pose["py"]) + sin(progress * PI) * PIECE_ARC
	return pose


func _snap_final() -> void:
	_set_internal_visibility(true)
	_apply_pose(board, _base_final("board"))
	for direction: String in ORDER:
		_apply_pose(bases[direction] as Node3D, _base_final(direction))
	for piece: Dictionary in pieces:
		_apply_pose(piece["mesh"] as Node3D, piece["final"] as Dictionary)
	lid.visible = false


func _pose(px: float, py: float, pz: float, rx: float, ry: float, rz: float) -> Dictionary:
	return {"px": px, "py": py, "pz": pz, "rx": rx, "ry": ry, "rz": rz}


func _apply_pose(node: Node3D, pose: Dictionary) -> void:
	node.position = Vector3(float(pose["px"]), float(pose["py"]), float(pose["pz"])) * U
	node.rotation_degrees = Vector3(float(pose["rx"]), float(pose["ry"]), float(pose["rz"]))


func _ease(value: float) -> float:
	var t: float = clampf(value, 0.0, 1.0)
	return 4.0 * t * t * t if t < 0.5 else 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0


func _mix_pose(from: Dictionary, to: Dictionary, value: float) -> Dictionary:
	var t: float = _ease(value)
	return _pose(
		lerpf(float(from["px"]), float(to["px"]), t),
		lerpf(float(from["py"]), float(to["py"]), t),
		lerpf(float(from["pz"]), float(to["pz"]), t),
		lerpf(float(from["rx"]), float(to["rx"]), t),
		lerpf(float(from["ry"]), float(to["ry"]), t),
		lerpf(float(from["rz"]), float(to["rz"]), t)
	)


func _publish_timeline_stage(elapsed: float) -> void:
	if published_stage < 1 and elapsed >= LID_SHAKE:
		published_stage = 1
		_publish_phase("lid-rising")
	elif published_stage < 2 and elapsed >= 830.0:
		published_stage = 2
		_publish_phase("bases-deploying")
	elif published_stage < 3 and elapsed >= 1520.0:
		published_stage = 3
		_publish_phase("stones-moving")


func _publish_phase(phase: String) -> void:
	print("YAKOLAK_INTRO_PHASE " + phase)
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakIntro='playing';" +
			"document.body.dataset.yakolakPhase='" + phase + "';" +
			"document.body.dataset.yakolakBases='4';" +
			"document.body.dataset.yakolakPieces='36';" +
			"document.body.dataset.yakolakBaseColor='161616';",
			true
		)


func _publish_complete() -> void:
	print("YAKOLAK_INTRO_COMPLETE duration=5730 bases=4 pieces=36 base_color=161616")
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakIntro='complete';" +
			"document.body.dataset.yakolakPhase='complete';" +
			"document.body.dataset.yakolakDuration='5730';" +
			"document.body.dataset.yakolakBases='4';" +
			"document.body.dataset.yakolakPieces='36';" +
			"document.body.dataset.yakolakBaseColor='161616';",
			true
		)


func _publish_error(reason: String) -> void:
	push_error("YAKOLAK intro failed: " + reason)
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakIntro='error';", true)
