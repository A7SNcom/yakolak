extends Node

# Dark studio pass shared by the loading handoff, intro, and playable scene.
# The wall logo uses the same SVG file as the DOM loader so the logo handoff
# can be screen-space matched instead of approximated.

const VISUAL_VERSION: String = "black-studio-v3"
const LOGO_PATH: String = "res://generated/YAKOLAK_INVERTED.svg"
const BACKGROUND_COLOR: Color = Color("#000000")
const FLOOR_COLOR: Color = Color("#080a0d")
const WALL_COLOR: Color = Color("#10141b")
const TABLE_COLOR: Color = Color("#6d737b")
const PEDESTAL_COLOR: Color = Color("#171b20")
const BOX_COLOR: Color = Color("#20242a")
const IVORY_COLOR: Color = Color("#ddd7ce")
const GOLD_COLOR: Color = Color("#bd7d2e")
const GREEN_COLOR: Color = Color("#267a61")
const BLUE_COLOR: Color = Color("#3764b2")
const PEDESTAL_HALF_HEIGHT: float = 12.25
const PEDESTAL_HEIGHT_SCALE: float = 0.66
const FLOOR_Y: float = -17.08

var intro: Node3D
var initialized: bool = false
var wall_logo: MeshInstance3D


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

	_apply_material(tabletop, TABLE_COLOR, 0.66, 0.08)
	_apply_material(pedestal, PEDESTAL_COLOR, 0.58, 0.12)
	_shorten_pedestal(pedestal)
	_add_studio_architecture()
	_publish_ready()
	return true


func _apply_environment(environment: Environment) -> void:
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = BACKGROUND_COLOR
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#aebbd0")
	environment.ambient_light_energy = 0.36
	environment.tonemap_mode = Environment.TONE_MAPPER_ACES
	environment.tonemap_exposure = 0.80
	environment.adjustment_enabled = true
	environment.adjustment_brightness = 1.0
	environment.adjustment_contrast = 1.10
	environment.adjustment_saturation = 0.94


func _apply_lights(directionals: Array[DirectionalLight3D], omnis: Array[OmniLight3D]) -> void:
	var key := directionals[0]
	key.light_color = Color("#f4f6ff")
	key.light_energy = 0.82
	key.shadow_enabled = true
	key.directional_shadow_max_distance = 48.0
	key.shadow_bias = 0.08

	var fill := directionals[1]
	fill.light_color = Color("#9eb8ff")
	fill.light_energy = 0.30
	fill.shadow_enabled = false

	var rim := directionals[2]
	rim.light_color = Color("#ffffff")
	rim.light_energy = 0.52
	rim.shadow_enabled = false

	for omni: OmniLight3D in omnis:
		omni.light_color = Color("#7182ff")
		omni.light_energy = 0.08
		omni.omni_range = 16.0
		omni.shadow_enabled = false


func _shorten_pedestal(pedestal: MeshInstance3D) -> void:
	var tabletop_y: float = pedestal.position.y + PEDESTAL_HALF_HEIGHT * pedestal.scale.y
	pedestal.scale.y = PEDESTAL_HEIGHT_SCALE
	pedestal.position.y = tabletop_y - PEDESTAL_HALF_HEIGHT * pedestal.scale.y


func _add_studio_architecture() -> void:
	if intro.get_node_or_null("StudioFloor") == null:
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

	if intro.get_node_or_null("StudioBackWall") == null:
		var wall_mesh := QuadMesh.new()
		wall_mesh.size = Vector2(50.0, 30.0)
		var wall := MeshInstance3D.new()
		wall.name = "StudioBackWall"
		wall.mesh = wall_mesh
		wall.position = Vector3(0.0, 3.0, -14.0)
		var wall_material := _new_material(WALL_COLOR, 1.0, 0.0)
		wall_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		wall.material_override = wall_material
		wall.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		intro.add_child(wall)

	wall_logo = intro.get_node_or_null("StudioWallLogo") as MeshInstance3D
	if wall_logo == null:
		var texture := load(LOGO_PATH) as Texture2D
		if texture == null:
			push_error("YAKOLAK wall logo texture is missing")
			return
		var logo_mesh := QuadMesh.new()
		logo_mesh.size = Vector2(7.4, 4.22)
		wall_logo = MeshInstance3D.new()
		wall_logo.name = "StudioWallLogo"
		wall_logo.mesh = logo_mesh
		wall_logo.position = Vector3(-6.5, 11.5, -13.88)
		var logo_material := StandardMaterial3D.new()
		logo_material.albedo_texture = texture
		logo_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		logo_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		logo_material.cull_mode = BaseMaterial3D.CULL_DISABLED
		wall_logo.material_override = logo_material
		wall_logo.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		wall_logo.visible = false
		intro.add_child(wall_logo)


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


func _new_material(color: Color, roughness: float, metallic: float) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = roughness
	material.metallic = metallic
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	return material


func _publish_ready() -> void:
	print("YAKOLAK_VISUAL_POLISH_READY version=%s palette=black-studio lighting=balanced wall-logo=shared-svg" % VISUAL_VERSION)
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakVisual='" + VISUAL_VERSION + "';" +
			"document.body.dataset.yakolakLighting='balanced-studio';" +
			"document.body.dataset.yakolakPalette='black-white-indigo';" +
			"document.body.dataset.yakolakPedestal='short-proportional';" +
			"document.body.dataset.yakolakWallLogo='shared-yakolak-svg';" +
			"document.body.dataset.yakolakFloor='dark-unshaded';",
			true
		)
