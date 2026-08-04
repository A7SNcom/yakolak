extends Node3D

# YAKOLAK 2.5 — direct Godot port of the accepted Three.js intro.
# Source of truth: src/app-live.js at commit 4096a243, intro version v071.
# No setup screen, gameplay, labels, invented transitions, or coloured bases.

const U := 0.04
const BOARD_MESH := "res://generated/board_and_lid.obj"
const BASE_MESH := "res://generated/player_base.obj"
const PIECE_MESHES := {
	"large": "res://generated/piece_large.obj",
	"medium": "res://generated/piece_medium.obj",
	"small": "res://generated/piece_small.obj",
}

const D := 48.0
const R3 := 135.0
const BASE_COLOR := Color("#161616")
const TYPE_ORDER := ["large", "medium", "small"]
const ORDER := ["right", "left", "front", "back"]
const DIRECTION_COLOR := {
	"right": "marble",
	"left": "gold",
	"front": "green",
	"back": "blue",
}
const STONE_COLORS := {
	"marble": Color("#ffffff"),
	"gold": Color("#8a570f"),
	"green": Color("#006144"),
	"blue": Color("#001f8f"),
}

# Exact accepted Three.js timing values, milliseconds.
const LID_SHAKE := 550.0
const LID_LIFT := 1300.0
const LID_HEIGHT := 900.0
const WALL_DELAY := 520.0
const WALL_SHAKE := 280.0
const WALL_RAISE := 20.0
const WALL_LIFT := 360.0
const WALL_MOVE := 850.0
const WALL_DROP := 430.0
const PIECE_LEAD := 520.0
const PIECE_MOVE := 1200.0
const PIECE_ARC := 34.0
const PIECE_STAGGER := 60.0
const TOTAL_TIME := 5730.0

const SPILL_SEED := 4128
const SPILL_SPREAD := 1.08
const SPILL_HEIGHT := 0.82
const SPILL_CLEARANCE := 1.32

class Mulberry32:
	var state: int

	func _init(seed: int) -> void:
		state = seed & 0xffffffff

	func next() -> float:
		state = (state + 0x6D2B79F5) & 0xffffffff
		var value := state
		value = ((value ^ (value >> 15)) * (value | 1)) & 0xffffffff
		var mixed := ((value ^ (value >> 7)) * (value | 61)) & 0xffffffff
		value = (value ^ ((value + mixed) & 0xffffffff)) & 0xffffffff
		return float((value ^ (value >> 14)) & 0xffffffff) / 4294967296.0

var camera: Camera3D
var board: MeshInstance3D
var lid: MeshInstance3D
var bases: Dictionary = {}
var pieces: Array[Dictionary] = []
var piece_meshes: Dictionary = {}
var piece_radii: Dictionary = {}
var started_msec := 0
var playing := false
var published_stage := -1
var failed := false


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
	var elapsed := float(Time.get_ticks_msec() - started_msec)
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
	var world := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("#777777")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#fff5e6")
	environment.ambient_light_energy = 0.62
	environment.tonemap_mode = Environment.TONE_MAPPER_ACES
	environment.tonemap_exposure = 1.04
	world.environment = environment
	add_child(world)

	var key := DirectionalLight3D.new()
	key.rotation_degrees = Vector3(-52.0, -42.0, 0.0)
	key.light_color = Color("#ffe8c8")
	key.light_energy = 1.15
	key.shadow_enabled = true
	add_child(key)

	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-38.0, 136.0, 0.0)
	fill.light_color = Color("#c8d8ff")
	fill.light_energy = 0.28
	add_child(fill)

	var rim := DirectionalLight3D.new()
	rim.rotation_degrees = Vector3(-34.0, -145.0, 0.0)
	rim.light_color = Color.WHITE
	rim.light_energy = 0.38
	add_child(rim)

	var top := OmniLight3D.new()
	top.position = Vector3(0.0, 8.4, 0.0)
	top.light_color = Color("#fff1d6")
	top.light_energy = 0.24
	top.omni_range = 20.8
	add_child(top)


func _build_table() -> void:
	# This is the exact fallback table dimensions contained in the old Three.js intro.
	var top_mesh := BoxMesh.new()
	top_mesh.size = Vector3(470.0, 24.0, 360.0) * U
	var top := MeshInstance3D.new()
	top.name = "OriginalFallbackTableTop"
	top.mesh = top_mesh
	top.position.y = -13.0 * U
	top.material_override = _material(Color("#8a5a34"), 0.72, 0.0)
	add_child(top)

	var leg_mesh := BoxMesh.new()
	leg_mesh.size = Vector3(28.0, 260.0, 28.0) * U
	for point in [Vector2(-190, -130), Vector2(190, -130), Vector2(-190, 130), Vector2(190, 130)]:
		var leg := MeshInstance3D.new()
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
	var viewport := get_viewport().get_visible_rect().size
	var aspect := viewport.x / maxf(viewport.y, 1.0)
	# The old intro used one diagonal perspective camera. Keep that composition,
	# but move closer on portrait so the product is not a tiny island on mobile.
	var distance := 17.6 if aspect < 0.8 else 19.4
	camera.position = Vector3(distance, distance * 0.82, distance)
	camera.look_at(Vector3(0.0, 0.35, 0.0), Vector3.UP)


func _load_and_build_original_models() -> void:
	var board_resource := _load_mesh(BOARD_MESH)
	var base_resource := _load_mesh(BASE_MESH)
	for size_name in TYPE_ORDER:
		var mesh := _load_mesh(PIECE_MESHES[size_name])
		piece_meshes[size_name] = mesh
		var aabb := mesh.get_aabb()
		piece_radii[size_name] = maxf(aabb.size.x, aabb.size.y) * 0.38
	if failed:
		return

	var black_material := _material(BASE_COLOR, 0.52, 0.06)
	board = _make_mesh_instance("Board", board_resource, black_material)
	_apply_pose(board, _base_final("board"))

	lid = _make_mesh_instance("Lid", board_resource, black_material)
	_apply_pose(lid, _lid_start())

	for direction in ORDER:
		var base := _make_mesh_instance("Base_%s" % direction, base_resource, black_material)
		base.set_meta("base_color", "#161616")
		bases[direction] = base
		_apply_pose(base, _wall_start(direction))

	_build_original_spill_and_piece_targets()


func _make_mesh_instance(label: String, mesh: Mesh, material: Material) -> MeshInstance3D:
	var instance := MeshInstance3D.new()
	instance.name = label
	instance.mesh = mesh
	instance.scale = Vector3.ONE * U
	instance.material_override = material
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(instance)
	return instance


func _load_mesh(path: String) -> Mesh:
	var resource := load(path)
	if resource == null or not resource is Mesh:
		failed = true
		push_error("Missing original intro mesh: " + path)
		return ArrayMesh.new()
	return resource as Mesh


func _material(color: Color, roughness: float, metallic: float) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = roughness
	material.metallic = metallic
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	return material


func _stone_material(color_name: String) -> StandardMaterial3D:
	match color_name:
		"marble":
			return _material(STONE_COLORS[color_name], 0.92, 0.0)
		"gold":
			return _material(STONE_COLORS[color_name], 0.58, 0.18)
		"green":
			return _material(STONE_COLORS[color_name], 0.56, 0.10)
		_:
			return _material(STONE_COLORS[color_name], 0.72, 0.0)


func _build_original_spill_and_piece_targets() -> void:
	var starts := _generate_spill_starts()
	var buckets: Dictionary = {}
	for start in starts:
		var bucket_key := "%s-%s" % [start["color"], start["type"]]
		if not buckets.has(bucket_key):
			buckets[bucket_key] = []
		(buckets[bucket_key] as Array).append(start)

	for target in _outer_positions():
		for size_name in TYPE_ORDER:
			var color_name: String = DIRECTION_COLOR[target["direction"]]
			var key := "%s-%s" % [color_name, size_name]
			var bucket: Array = buckets[key]
			var start: Dictionary = bucket.pop_front()
			var mesh := _make_mesh_instance(
				"Stone_%s_%s_%s" % [target["direction"], str(target["side"]), size_name],
				piece_meshes[size_name],
				_stone_material(color_name)
			)
			var record := {
				"mesh": mesh,
				"type": size_name,
				"dir": target["direction"],
				"side": target["side"],
				"start": _pose(start.px, start.py, start.pz, start.rx, start.ry, start.rz),
				"final": _pose(target.px, target.py, target.pz, target.rx, target.ry, target.rz),
			}
			pieces.append(record)
			_apply_pose(mesh, record["start"])


func _base_final(key: String) -> Dictionary:
	match key:
		"board": return _pose(0, 6, 0, -90, 0, 0)
		"right": return _pose(R3, 6, 0, -90, 0, 0)
		"left": return _pose(-R3, 6, 0, -90, 0, 180)
		"front": return _pose(0, 6, R3, -90, 0, 90)
		_: return _pose(0, 6, -R3, -90, 0, -90)


func _lid_start() -> Dictionary:
	return _pose(0, 62.5, 0, -90, 180, 0)


func _wall_start(direction: String) -> Dictionary:
	match direction:
		"right": return _pose(81, 35, 0, -90, -90, 0)
		"left": return _pose(-81, 35, 0, -90, 90, 180)
		"front": return _pose(0, 35, 81, -180, 0, 90)
		_: return _pose(0, 35, -81, -180, 180, -90)


func _outer_positions() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var definitions := [
		{"direction": "right", "px": R3, "pz": 0.0, "side_mode": true},
		{"direction": "left", "px": -R3, "pz": 0.0, "side_mode": true},
		{"direction": "front", "px": 0.0, "pz": R3, "side_mode": false},
		{"direction": "back", "px": 0.0, "pz": -R3, "side_mode": false},
	]
	for definition in definitions:
		for side in [-1, 0, 1]:
			var offset_x := 0.0 if definition.side_mode else D * side
			var offset_z := D * side if definition.side_mode else 0.0
			result.append({
				"direction": definition.direction,
				"side": side,
				"px": definition.px + offset_x,
				"py": 2.0,
				"pz": definition.pz + offset_z,
				"rx": -90.0,
				"ry": 0.0,
				"rz": 0.0,
			})
	return result


func _build_spill_list(seed: int) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for color_name in ["marble", "gold", "blue", "green"]:
		for size_name in TYPE_ORDER:
			for _index in range(3):
				result.append({"type": size_name, "color": color_name})
	var random := Mulberry32.new(seed)
	for index in range(result.size() - 1, 0, -1):
		var swap_index := int(floor(random.next() * float(index + 1)))
		var temporary = result[index]
		result[index] = result[swap_index]
		result[swap_index] = temporary
	result.sort_custom(_sort_by_type)
	return result


func _sort_by_type(a: Dictionary, b: Dictionary) -> bool:
	var rank := {"large": 0, "medium": 1, "small": 2}
	return rank[a.type] < rank[b.type]


func _make_slots(seed: int) -> Array[Dictionary]:
	var random := Mulberry32.new(seed)
	var slots: Array[Dictionary] = []
	var count := 6
	var half := 55.0 * SPILL_SPREAD
	var step := half * 2.0 / float(count - 1)
	for ix in range(count):
		for iz in range(count):
			slots.append({
				"x": -half + ix * step + (random.next() - 0.5) * step * 0.32,
				"z": -half + iz * step + (random.next() - 0.5) * step * 0.32,
			})
	for index in range(slots.size() - 1, 0, -1):
		var swap_index := int(floor(random.next() * float(index + 1)))
		var temporary = slots[index]
		slots[index] = slots[swap_index]
		slots[swap_index] = temporary
	return slots


func _relax_spill(list: Array[Dictionary]) -> void:
	for _iteration in range(140):
		for i in range(list.size()):
			var a: Dictionary = list[i]
			for j in range(i + 1, list.size()):
				var b: Dictionary = list[j]
				var dx: float = b.x - a.x
				var dz: float = b.z - a.z
				var distance := maxf(sqrt(dx * dx + dz * dz), 0.001)
				var same_layer_factor := 1.0 if a.layer == b.layer else 0.66
				var needed: float = (a.r + b.r) * SPILL_CLEARANCE * same_layer_factor
				if distance < needed:
					var push := (needed - distance) * 0.52
					var nx := dx / distance
					var nz := dz / distance
					a.x -= nx * push
					a.z -= nz * push
					b.x += nx * push
					b.z += nz * push
		var half := 61.0 * SPILL_SPREAD
		for point in list:
			var limit: float = half - point.r - 2.0
			point.x = clampf(point.x, -limit, limit)
			point.z = clampf(point.z, -limit, limit)


func _generate_spill_starts() -> Array[Dictionary]:
	var random := Mulberry32.new(SPILL_SEED)
	var source := _build_spill_list(SPILL_SEED + 17)
	var slots := _make_slots(SPILL_SEED + 99)
	var result: Array[Dictionary] = []
	for index in range(source.size()):
		var item: Dictionary = source[index]
		var radius: float = piece_radii[item.type]
		if item.type == "large": radius *= 1.08
		elif item.type == "small": radius *= 0.93
		var slot: Dictionary = slots[index]
		var layer := 0 if index < 26 else (1 if index < 34 else 2)
		var pose_name := "lay" if random.next() < 0.72 else "stand"
		result.append({
			"type": item.type,
			"color": item.color,
			"r": radius,
			"layer": layer,
			"pose": pose_name,
			"x": slot.x,
			"z": slot.z,
		})
	_relax_spill(result)

	for index in range(result.size()):
		var point: Dictionary = result[index]
		var random_pose := Mulberry32.new(SPILL_SEED + index * 13 + 7)
		var laid: bool = point.pose == "lay"
		point.px = snappedf(point.x, 0.01)
		point.pz = snappedf(point.z, 0.01)
		point.py = snappedf(
			12.0 + point.r * 0.72 + point.layer * 3.2 * SPILL_HEIGHT
			if laid else
			9.0 + point.layer * 3.8 * SPILL_HEIGHT + random_pose.next() * 1.8,
			0.01
		)
		point.rz = round(random_pose.next() * 360.0)
		if laid:
			var base_rotation := 0.0 if random_pose.next() < 0.5 else -180.0
			point.rx = base_rotation + (random_pose.next() * 2.0 - 1.0) * 9.0
			point.ry = (random_pose.next() * 2.0 - 1.0) * 22.0
		else:
			point.rx = -90.0 + (random_pose.next() * 2.0 - 1.0) * 10.0
			point.ry = (random_pose.next() * 2.0 - 1.0) * 8.0
	return result


func _restart_intro() -> void:
	if failed:
		return
	started_msec = Time.get_ticks_msec()
	playing = true
	published_stage = -1
	lid.visible = true
	_apply_timeline(0.0)
	_publish_phase("lid-shaking")
	published_stage = 0


func _apply_timeline(elapsed: float) -> void:
	_apply_pose(board, _base_final("board"))
	_apply_pose(lid, _lid_at(elapsed))
	lid.visible = elapsed < LID_SHAKE + LID_LIFT
	for direction in ORDER:
		_apply_pose(bases[direction], _wall_at(direction, elapsed))
	for piece in pieces:
		_apply_pose(piece.mesh, _piece_at(piece, elapsed))
	if elapsed >= TOTAL_TIME:
		_snap_final()


func _lid_at(elapsed: float) -> Dictionary:
	var pose := _lid_start().duplicate()
	if elapsed < LID_SHAKE:
		var fade := 1.0 - elapsed / LID_SHAKE
		var wave := sin(elapsed * 0.12) * 2.8 * fade
		pose.rx += wave * 0.55
		pose.ry += cos(elapsed * 0.09) * 1.1 * fade
		pose.rz += sin(elapsed * 0.07) * 1.4 * fade
		return pose
	pose.py += LID_HEIGHT * _ease((elapsed - LID_SHAKE) / LID_LIFT)
	return pose


func _wall_at(direction: String, elapsed: float) -> Dictionary:
	var start := _wall_start(direction)
	var finish := _base_final(direction)
	var index := ORDER.find(direction)
	var deployment_start := LID_SHAKE + index * WALL_DELAY
	var raised := start.duplicate()
	raised.py = start.py + WALL_RAISE
	var raised_finish := finish.duplicate()
	raised_finish.py = start.py + WALL_RAISE
	var time := elapsed - deployment_start
	if time <= 0.0:
		return start
	if time < WALL_SHAKE:
		var fade := 1.0 - time / WALL_SHAKE
		var wave := sin(time * 0.06) * 2.2 * fade
		var shaken := start.duplicate()
		shaken.rx += wave * 0.4
		shaken.ry += wave * 0.25
		shaken.rz += wave * 0.35
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
	var index := ORDER.find(piece.dir)
	var drop_start := LID_SHAKE + index * WALL_DELAY + WALL_SHAKE + WALL_LIFT + WALL_MOVE
	return drop_start - PIECE_LEAD + (int(piece.side) + 1) * PIECE_STAGGER


func _piece_at(piece: Dictionary, elapsed: float) -> Dictionary:
	var progress := _ease((elapsed - _piece_start(piece)) / PIECE_MOVE)
	var pose := _mix_pose(piece.start, piece.final, progress)
	pose.py += sin(progress * PI) * PIECE_ARC
	return pose


func _snap_final() -> void:
	_apply_pose(board, _base_final("board"))
	for direction in ORDER:
		_apply_pose(bases[direction], _base_final(direction))
	for piece in pieces:
		_apply_pose(piece.mesh, piece.final)
	lid.visible = false


func _pose(px: float, py: float, pz: float, rx: float, ry: float, rz: float) -> Dictionary:
	return {"px": px, "py": py, "pz": pz, "rx": rx, "ry": ry, "rz": rz}


func _apply_pose(node: Node3D, pose: Dictionary) -> void:
	node.position = Vector3(pose.px, pose.py, pose.pz) * U
	node.rotation_degrees = Vector3(pose.rx, pose.ry, pose.rz)


func _ease(value: float) -> float:
	var t := clampf(value, 0.0, 1.0)
	return 4.0 * t * t * t if t < 0.5 else 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0


func _mix_pose(from: Dictionary, to: Dictionary, value: float) -> Dictionary:
	var t := _ease(value)
	return _pose(
		lerpf(from.px, to.px, t),
		lerpf(from.py, to.py, t),
		lerpf(from.pz, to.pz, t),
		lerpf(from.rx, to.rx, t),
		lerpf(from.ry, to.ry, t),
		lerpf(from.rz, to.rz, t)
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
