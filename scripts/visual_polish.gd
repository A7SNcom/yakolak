extends Node

# Studio-grade visual pass for the Godot Web build.
# Keeps the approved geometry and gameplay while fixing flat contrast, crushed
# blacks, blown highlights, and unnecessary mobile shadow cost.

const VISUAL_VERSION: String = "studio-neutral-v2"
const BACKGROUND_COLOR: Color = Color("#c9c4bb")
const FLOOR_COLOR: Color = Color("#b7b1a8")
const TABLE_COLOR: Color = Color("#918a81")
const PEDESTAL_COLOR: Color = Color("#4c4a47")
const BOX_COLOR: Color = Color("#24272c")
const IVORY_COLOR: Color = Color("#e7e1d7")
const GOLD_COLOR: Color = Color("#b9781d")
const GREEN_COLOR: Color = Color("#0d7355")
const BLUE_COLOR: Color = Color("#294ea3")
const FLOOR_Y: float = -25.38

var intro: Node3D
var initialized: bool = false


func _ready() -> void:
	process_priority = 150
	intro = get_parent() as Node3D
	set_process(true)


func _process(_delta: float) -> void:
	if initialized or intro == null:
		return
	initialized = _apply_when_ready()
	if initialized:
		set_process(false)


func _apply_when_ready() -> bool:
	var tabletop := intro.get_node_or_null("ApprovedStarTableSVG") as MeshInstance3D
	var pedestal := intro.get_node_or_null("ApprovedStarTablePedestal") as MeshInstance3D
	var board := intro.get_node_or_null("Board") as MeshInstance3D
	var lid := intro.get_node_or_null("Lid") as MeshInstance3D
	if tabletop == null or pedestal == null or board == null or lid == null:
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
	_apply_material(board, BOX_COLOR, 0.50, 0.08)
	_apply_material(lid, BOX_COLOR, 0.50, 0.08)
	for direction: String in ["right", "left", "front", "back"]:
		var base := intro.get_node_or_null("Base_%s" % direction) as MeshInstance3D
		if base == null:
			return false
		_apply_material(base, BOX_COLOR, 0.50, 0.08)

	for child: Node in intro.get_children():
		if not child is MeshInstance3D or not String(child.name).begins_with("Stone_"):
			continue
		var stone := child as MeshInstance3D
		var stone_color: Color = IVORY_COLOR
		var roughness: float = 0.72
		var metallic: float = 0.01
		if String(stone.name).begins_with("Stone_left_"):
			stone_color = GOLD_COLOR
			roughness = 0.40
			metallic = 0.28
		elif String(stone.name).begins_with("Stone_front_"):
			stone_color = GREEN_COLOR
			roughness = 0.46
			metallic = 0.10
		elif String(stone.name).begins_with("Stone_back_"):
			stone_color = BLUE_COLOR
			roughness = 0.46
			metallic = 0.10
		_apply_material(stone, stone_color, roughness, metallic)
		stone.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

	_apply_material(tabletop, TABLE_COLOR, 0.66, 0.03)
	_apply_material(pedestal, PEDESTAL_COLOR, 0.74, 0.04)
	_add_studio_floor()
	_publish_ready()
	return true


func _apply_environment(environment: Environment) -> void:
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = BACKGROUND_COLOR
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#e6e9ed")
	environment.ambient_light_energy = 0.44
	environment.tonemap_mode = Environment.TONE_MAPPER_ACES
	environment.tonemap_exposure = 0.82
	environment.adjustment_enabled = true
	environment.adjustment_brightness = 1.0
	environment.adjustment_contrast = 1.07
	environment.adjustment_saturation = 0.94


func _apply_lights(directionals: Array[DirectionalLight3D], omnis: Array[OmniLight3D]) -> void:
	var key := directionals[0]
	key.light_color = Color("#fff0dc")
	key.light_energy = 0.86
	key.shadow_enabled = true
	key.directional_shadow_max_distance = 52.0
	key.shadow_bias = 0.08

	var fill := directionals[1]
	fill.light_color = Color("#d6e2ff")
	fill.light_energy = 0.42
	fill.shadow_enabled = false

	var rim := directionals[2]
	rim.light_color = Color("#fff8ed")
	rim.light_energy = 0.54
	rim.shadow_enabled = false

	for omni: OmniLight3D in omnis:
		omni.light_color = Color("#ffe3bd")
		omni.light_energy = 0.10
		omni.omni_range = 18.0
		omni.shadow_enabled = false


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
	floor.material_override = _new_material(FLOOR_COLOR, 0.96, 0.0)
	floor.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	intro.add_child(floor)


func _new_material(color: Color, roughness: float, metallic: float) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = roughness
	material.metallic = metallic
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	return material


func _publish_ready() -> void:
	print("YAKOLAK_VISUAL_POLISH_READY version=%s palette=studio-neutral lighting=balanced shadows=mobile" % VISUAL_VERSION)
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakVisual='" + VISUAL_VERSION + "';" +
			"document.body.dataset.yakolakLighting='balanced-studio';" +
			"document.body.dataset.yakolakPalette='professional-neutral';",
			true
		)
