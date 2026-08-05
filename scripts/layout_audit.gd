extends Node3D

# Geometry-only review. No intro, lid, board, room, labels, or invented motion.
# The camera is orthographic and refits itself whenever the browser viewport changes.

const U := 0.04
const BASE_MESH := "res://generated/player_base.obj"
const PIECE_MESHES := {
	"large": "res://generated/piece_large.obj",
	"medium": "res://generated/piece_medium.obj",
	"small": "res://generated/piece_small.obj",
}

const COLORS := {
	"right": Color("#f1eee6"),
	"back": Color("#3769a5"),
	"left": Color("#b78a44"),
	"front": Color("#2f856a"),
}

# Exact transforms from YAKOLAK_PORTABLE_KIT/assets/layout/world-layout.json.
const BASE_TRANSFORMS := {
	"right": {"position": Vector3(135, 6, 0), "rotation": Vector3(-90, 0, 0)},
	"back": {"position": Vector3(0, 6, -135), "rotation": Vector3(-90, 0, -90)},
	"left": {"position": Vector3(-135, 6, 0), "rotation": Vector3(-90, 0, 180)},
	"front": {"position": Vector3(0, 6, 135), "rotation": Vector3(-90, 0, 90)},
}

const HOME_STACKS := {
	"right": [Vector3(135, 2, -48), Vector3(135, 2, 0), Vector3(135, 2, 48)],
	"back": [Vector3(-48, 2, -135), Vector3(0, 2, -135), Vector3(48, 2, -135)],
	"left": [Vector3(-135, 2, -48), Vector3(-135, 2, 0), Vector3(-135, 2, 48)],
	"front": [Vector3(-48, 2, 135), Vector3(0, 2, 135), Vector3(48, 2, 135)],
}

const PIECE_ROTATION := Vector3(-90, 0, 0)
const SIDE_ORDER := ["right", "back", "left", "front"]
const SIZE_ORDER := ["large", "medium", "small"]

# Projected safe bounds for the approved four-base layout at the audit angle.
const CONTENT_WIDTH := 21.5
const CONTENT_HEIGHT := 18.0
const CAMERA_MARGIN := 1.08

var camera: Camera3D
var base_count := 0
var piece_count := 0
var failed := false


func _ready() -> void:
	_build_environment()
	_build_camera()
	_build_authoritative_layout()
	get_viewport().size_changed.connect(_fit_camera_to_viewport)
	_fit_camera_to_viewport.call_deferred()
	_verify_and_publish.call_deferred()


func _build_environment() -> void:
	var world := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("#efefec")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color.WHITE
	environment.ambient_light_energy = 0.86
	environment.tonemap_mode = Environment.TONE_MAPPER_ACES
	world.environment = environment
	add_child(world)

	var key := DirectionalLight3D.new()
	key.rotation_degrees = Vector3(-52, -35, 0)
	key.light_energy = 1.2
	key.light_color = Color("#fffaf0")
	key.shadow_enabled = false
	add_child(key)

	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-35, 145, 0)
	fill.light_energy = 0.45
	fill.light_color = Color("#e5efff")
	add_child(fill)


func _build_camera() -> void:
	camera = Camera3D.new()
	camera.current = true
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.near = 0.05
	camera.far = 100.0
	camera.position = Vector3(14.0, 18.0, 14.0)
	add_child(camera)
	camera.look_at(Vector3.ZERO, Vector3.UP)


func _fit_camera_to_viewport() -> void:
	if camera == null:
		return
	var viewport_size := get_viewport().get_visible_rect().size
	if viewport_size.x <= 1.0 or viewport_size.y <= 1.0:
		return
	var aspect := viewport_size.x / viewport_size.y
	camera.size = maxf(CONTENT_HEIGHT, CONTENT_WIDTH / aspect) * CAMERA_MARGIN

	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakViewport='" +
			str(int(viewport_size.x)) + "x" + str(int(viewport_size.y)) + "';",
			true
		)


func _build_authoritative_layout() -> void:
	var base_mesh := _load_mesh(BASE_MESH)
	var piece_meshes := {}
	for size_name in SIZE_ORDER:
		piece_meshes[size_name] = _load_mesh(PIECE_MESHES[size_name])
	if failed:
		return

	for side in SIDE_ORDER:
		var side_color: Color = COLORS[side]
		var base := MeshInstance3D.new()
		base.name = "Base_%s" % side
		base.mesh = base_mesh
		base.scale = Vector3.ONE * U
		base.position = (BASE_TRANSFORMS[side]["position"] as Vector3) * U
		base.rotation_degrees = BASE_TRANSFORMS[side]["rotation"] as Vector3
		base.material_override = _material(_base_color(side_color), 0.70)
		base.set_meta("authoritative_side", side)
		add_child(base)
		base_count += 1

		for stack_index in range(3):
			var stack_center: Vector3 = HOME_STACKS[side][stack_index]
			for size_name in SIZE_ORDER:
				var piece := MeshInstance3D.new()
				piece.name = "Piece_%s_%d_%s" % [side, stack_index, size_name]
				piece.mesh = piece_meshes[size_name] as Mesh
				piece.scale = Vector3.ONE * U
				piece.position = stack_center * U
				piece.rotation_degrees = PIECE_ROTATION
				piece.material_override = _material(side_color, 0.30)
				piece.set_meta("authoritative_side", side)
				piece.set_meta("authoritative_stack", stack_index)
				piece.set_meta("authoritative_size", size_name)
				add_child(piece)
				piece_count += 1


func _verify_and_publish() -> void:
	await get_tree().process_frame
	await get_tree().process_frame
	if failed or base_count != 4 or piece_count != 36:
		var reason := "expected 4 bases and 36 pieces, got %d and %d" % [base_count, piece_count]
		push_error(reason)
		if OS.has_feature("web"):
			JavaScriptBridge.eval("document.body.dataset.yakolakLayout='error';", true)
		return

	print("YAKOLAK_LAYOUT_AUDIT_READY bases=4 pieces=36")
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakLayout='ready';" +
			"document.body.dataset.yakolakBases='4';" +
			"document.body.dataset.yakolakPieces='36';",
			true
		)


func _load_mesh(path: String) -> Mesh:
	var resource := load(path)
	if resource == null or not resource is Mesh:
		failed = true
		push_error("Could not load approved mesh: " + path)
		return ArrayMesh.new()
	return resource as Mesh


func _material(color: Color, roughness: float) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.metallic = 0.03
	material.roughness = roughness
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	return material


func _base_color(piece_color: Color) -> Color:
	if piece_color.get_luminance() > 0.75:
		return Color("#b9b7b0")
	return piece_color.darkened(0.20)
