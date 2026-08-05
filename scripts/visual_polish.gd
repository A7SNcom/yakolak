extends Node

# Studio-grade visual pass for the Godot Web build.
# Keeps the approved geometry and gameplay while fixing flat contrast, crushed
# blacks, blown highlights, weak depth, and unnecessary mobile shadow cost.
# It also keeps the transforming star facing the camera until it deliberately
# rotates into the horizontal tabletop, so it never reads as a shell or blob.

const VISUAL_VERSION: String = "studio-neutral-v2"
const BACKGROUND_COLOR: Color = Color("#202731")
const FLOOR_COLOR: Color = Color("#2a313a")
const TABLE_COLOR: Color = Color("#6f7478")
const PEDESTAL_COLOR: Color = Color("#171b20")
const BOX_COLOR: Color = Color("#20242a")
const IVORY_COLOR: Color = Color("#d8d1c6")
const GOLD_COLOR: Color = Color("#b77928")
const GREEN_COLOR: Color = Color("#24745c")
const BLUE_COLOR: Color = Color("#315ba4")
const PEDESTAL_HALF_HEIGHT: float = 12.25
const PEDESTAL_HEIGHT_SCALE: float = 0.66
const FLOOR_Y: float = -17.08
const STAR_FLOAT_END_MS: float = 880.0
const STAR_FORM_END_MS: float = 1680.0

var intro: Node3D
var preintro: Node
var camera: Camera3D
var tabletop: MeshInstance3D
var initialized: bool = false


func _ready() -> void:
	# Run after the pre-intro controller so this visual-only correction is the
	# final transform applied for the frame.
	process_priority = 250
	intro = get_parent() as Node3D
	preintro = intro.get_node_or_null("StarToTablePreIntro")
	set_process(true)


func _process(_delta: float) -> void:
	if intro == null:
		return
	if not initialized:
		initialized = _apply_when_ready()
		return
	_keep_star_readable_during_handoff()


func _apply_when_ready() -> bool:
	tabletop = intro.get_node_or_null("ApprovedStarTableSVG") as MeshInstance3D
	var pedestal := intro.get_node_or_null("ApprovedStarTablePedestal") as MeshInstance3D
	var board := intro.get_node_or_null("Board") as MeshInstance3D
	var lid := intro.get_node_or_null("Lid") as MeshInstance3D
	camera = intro.get("camera") as Camera3D
	if tabletop == null or pedestal == null or board == null or lid == null or camera == null:
		return false

	var directionals: Array[DirectionalLight3D] = []
	var omnis: Array[OmniLight3D] = []
	var world: WorldEnvironment
	for child: Node in intro.get_children():
		if child is WorldEnvironment:
			world = child as WorldEnvironment
		elif child is DirectionalLight3D:
			directionals.append(child as DirectionalLight3D)
		elif child is OmniLight3D:
			omnis.append(child as OmniLight3D)
	if world == null or world.environment == null or directionals.size() < 3:
		return false

	_apply_environment(world.environment)
	_apply_lights(directionals, omnis)
	_apply_material(board, BOX_COLOR, 0.43, 0.10)
	_apply_material(lid, BOX_COLOR, 0.43, 0.10)
	for direction: String in ["right", "left", "front", "back"]:
		var base := intro.get_node_or_null("Base_%s" % direction) as MeshInstance3D
		if base == null:
			return false
		_apply_material(base, BOX_COLOR, 0.43, 0.10)

	for child: Node in intro.get_children():
		if not child is MeshInstance3D or not String(child.name).begins_with("Stone_"):
			continue
		var stone := child as MeshInstance3D
		var stone_color: Color = IVORY_COLOR
		var roughness: float = 0.70
		var metallic: float = 0.01
		if String(stone.name).begins_with("Stone_left_"):
			stone_color = GOLD_COLOR
			roughness = 0.42
			metallic = 0.24
		elif String(stone.name).begins_with("Stone_front_"):
			stone_color = GREEN_COLOR
			roughness = 0.50
			metallic = 0.08
		elif String(stone.name).begins_with("Stone_back_"):
			stone_color = BLUE_COLOR
			roughness = 0.50
			metallic = 0.08
		_apply_material(stone, stone_color, roughness, metallic)
		stone.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

	_apply_material(tabletop, TABLE_COLOR, 0.68, 0.08)
	_apply_material(pedestal, PEDESTAL_COLOR, 0.58, 0.12)
	_shorten_pedestal(pedestal)
	_add_studio_floor()
	_publish_ready()
	return true


func _keep_star_readable_during_handoff() -> void:
	if preintro == null:
		preintro = intro.get_node_or_null("StarToTablePreIntro")
	if preintro == null or not bool(preintro.get("initialized")) or bool(preintro.get("completed")):
		return
	var started_msec: int = int(preintro.get("started_msec"))
	if started_msec <= 0:
		return
	var elapsed: float = float(Time.get_ticks_msec() - started_msec)
	if elapsed > STAR_FORM_END_MS:
		return

	var view_direction: Vector3 = (camera.global_position - tabletop.global_position).normalized()
	if view_direction.length_squared() < 0.9:
		return
	var face_camera: Quaternion = Quaternion(Vector3.UP, view_direction).normalized()
	face_camera = (face_camera * Quaternion(Vector3.UP, deg_to_rad(8.0))).normalized()

	if elapsed <= STAR_FLOAT_END_MS:
		tabletop.quaternion = face_camera
	else:
		var t: float = _ease_in_out_cubic((elapsed - STAR_FLOAT_END_MS) / (STAR_FORM_END_MS - STAR_FLOAT_END_MS))
		var final_rotation: Quaternion = preintro.get("final_rotation")
		tabletop.quaternion = face_camera.slerp(final_rotation, t).normalized()


func _apply_environment(environment: Environment) -> void:
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = BACKGROUND_COLOR
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#b9c5d5")
	environment.ambient_light_energy = 0.45
	environment.tonemap_mode = Environment.TONE_MAPPER_ACES
	environment.tonemap_exposure = 0.82
	environment.adjustment_enabled = true
	environment.adjustment_brightness = 1.0
	environment.adjustment_contrast = 1.08
	environment.adjustment_saturation = 0.92


func _apply_lights(directionals: Array[DirectionalLight3D], omnis: Array[OmniLight3D]) -> void:
	var key := directionals[0]
	key.light_color = Color("#ffd9ad")
	key.light_energy = 0.78
	key.shadow_enabled = true
	key.directional_shadow_max_distance = 46.0
	key.shadow_bias = 0.08

	var fill := directionals[1]
	fill.light_color = Color("#b9d0ff")
	fill.light_energy = 0.38
	fill.shadow_enabled = false

	var rim := directionals[2]
	rim.light_color = Color("#fff1d7")
	rim.light_energy = 0.62
	rim.shadow_enabled = false

	for omni: OmniLight3D in omnis:
		omni.light_color = Color("#ffc98b")
		omni.light_energy = 0.10
		omni.omni_range = 16.0
		omni.shadow_enabled = false


func _shorten_pedestal(pedestal: MeshInstance3D) -> void:
	var tabletop_y: float = pedestal.position.y + PEDESTAL_HALF_HEIGHT * pedestal.scale.y
	pedestal.scale.y = PEDESTAL_HEIGHT_SCALE
	pedestal.position.y = tabletop_y - PEDESTAL_HALF_HEIGHT * pedestal.scale.y


func _apply_material(instance: MeshInstance3D, color: Color, roughness: float, metallic: float) -> void:
	var material: StandardMaterial3D
	if instance.material_override is StandardMaterial3D:
		material = (instance.material_override as StandardMaterial3D).duplicate() as StandardMaterial3D
	else:
		material = StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = roughness
	material.metallic = metallic
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	instance.material_override = material


func _add_studio_floor() -> void:
	if intro.get_node_or_null("StudioFloor") != null:
		return
	var floor_mesh := PlaneMesh.new()
	floor_mesh.size = Vector2(72.0, 72.0)
	var floor := MeshInstance3D.new()
	floor.name = "StudioFloor"
	floor.mesh = floor_mesh
	floor.position = Vector3(0.0, FLOOR_Y, 0.0)
	var floor_material := _new_material(FLOOR_COLOR, 1.0, 0.0)
	floor_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	floor.material_override = floor_material
	floor.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	intro.add_child(floor)


func _new_material(color: Color, roughness: float, metallic: float) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = roughness
	material.metallic = metallic
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	return material


func _ease_in_out_cubic(value: float) -> float:
	var t: float = clampf(value, 0.0, 1.0)
	return 4.0 * t * t * t if t < 0.5 else 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0


func _publish_ready() -> void:
	print("YAKOLAK_VISUAL_POLISH_READY version=%s palette=studio-neutral lighting=balanced shadows=mobile pedestal=short star=facing-camera floor=unshaded" % VISUAL_VERSION)
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakVisual='" + VISUAL_VERSION + "';" +
			"document.body.dataset.yakolakLighting='balanced-studio';" +
			"document.body.dataset.yakolakPalette='professional-neutral';" +
			"document.body.dataset.yakolakPedestal='short-proportional';" +
			"document.body.dataset.yakolakStarFacing='camera-readable';" +
			"document.body.dataset.yakolakFloor='dark-unshaded';",
			true
		)
