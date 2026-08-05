extends Node

# Pixel-matched 2D -> 3D handoff.
# The DOM star and the Godot tabletop share the exact table.svg silhouette.
# Godot projects the real 3D tabletop to screen coordinates, the DOM element
# moves to that rectangle, then the two layers crossfade without a cut.

const MATCH_HOLD_MS: float = 260.0
const MORPH_MS: float = 760.0
const SETTLE_MS: float = 220.0
const CAMERA_ORBIT_MS: float = 900.0
const CAMERA_HOLD_MS: float = 140.0
const TABLE_TOTAL_MS: float = MATCH_HOLD_MS + MORPH_MS + SETTLE_MS + CAMERA_ORBIT_MS + CAMERA_HOLD_MS
const BOX_REVEAL_MS: float = 650.0
const BOX_HOLD_MS: float = 220.0
const TOTAL_MS: float = TABLE_TOTAL_MS + BOX_REVEAL_MS + BOX_HOLD_MS

const MATCH_CAMERA_DISTANCE: float = 54.0
const MATCH_CAMERA_FOV: float = 42.0
const BOX_START_DROP: float = 0.72
const BOX_START_SCALE: float = 0.92
const PEDESTAL_HALF_HEIGHT: float = 12.25
const WHITE_STAR: Color = Color("#ffffff")
const MOTION_VERSION: String = "pixel-matched-2d-to-3d-v3"

var intro: Node3D
var corrections: Node
var visual_polish: Node
var gameplay: Node
var camera: Camera3D
var tabletop: MeshInstance3D
var pedestal: MeshInstance3D
var wall_logo: MeshInstance3D
var game_nodes: Array[GeometryInstance3D] = []
var table_material: StandardMaterial3D
var magic_light: OmniLight3D

var primed: bool = false
var initialized: bool = false
var match_published: bool = false
var handoff_started: bool = false
var box_reveal_started: bool = false
var completed: bool = false
var match_wait_frames: int = 0
var started_msec: int = 0
var published_phase: int = -1

var final_table_position: Vector3
var final_pedestal_position: Vector3
var final_table_scale: Vector3
var final_pedestal_scale: Vector3
var face_camera_rotation: Quaternion
var final_rotation: Quaternion
var final_table_color: Color
var final_table_roughness: float
var final_table_metallic: float

var final_camera_position: Vector3
var final_camera_rotation: Quaternion
var final_camera_fov: float
var match_camera_position: Vector3
var match_camera_rotation: Quaternion
var match_camera_fov: float
var box_final_poses: Dictionary = {}


func _ready() -> void:
	process_priority = 200
	intro = get_parent() as Node3D
	corrections = intro.get_node_or_null("ExistingIntroCorrections")
	visual_polish = intro.get_node_or_null("StudioVisualPolish")
	gameplay = intro.get_node_or_null("PostIntroGameplay")
	set_process(true)


func _process(_delta: float) -> void:
	if completed or intro == null:
		return

	if not primed:
		primed = _prime_when_models_exist()
		return

	if not initialized:
		if corrections == null or not bool(corrections.get("validated")):
			return
		if visual_polish == null or not bool(visual_polish.get("initialized")):
			return
		initialized = _prepare_pixel_match()
		return

	if not match_published:
		match_wait_frames += 1
		if match_wait_frames >= 2:
			match_published = _publish_match_geometry()
		return

	if not handoff_started:
		if _dom_handoff_is_matched():
			_start_matched_handoff()
		return

	var elapsed: float = float(Time.get_ticks_msec() - started_msec)
	if elapsed < TABLE_TOTAL_MS:
		_apply_table_and_camera(elapsed)
		_publish_timeline_phase(elapsed)
		return

	if not box_reveal_started:
		_begin_box_reveal()
	var box_elapsed: float = elapsed - TABLE_TOTAL_MS
	_apply_box_reveal(minf(box_elapsed, BOX_REVEAL_MS))
	if box_elapsed >= BOX_REVEAL_MS:
		_snap_box_and_camera_final()
		if published_phase < 6:
			published_phase = 6
			_publish_phase("box-settled")
	if elapsed >= TOTAL_MS:
		_finish_and_start_intro()


func _prime_when_models_exist() -> bool:
	camera = intro.get("camera") as Camera3D
	tabletop = intro.get_node_or_null("ApprovedStarTableSVG") as MeshInstance3D
	pedestal = intro.get_node_or_null("ApprovedStarTablePedestal") as MeshInstance3D
	var board := intro.get_node_or_null("Board") as GeometryInstance3D
	var lid := intro.get_node_or_null("Lid") as GeometryInstance3D
	if camera == null or tabletop == null or pedestal == null or board == null or lid == null or gameplay == null:
		return false

	game_nodes.clear()
	game_nodes.append(board)
	game_nodes.append(lid)
	for direction: String in ["right", "left", "front", "back"]:
		var base := intro.get_node_or_null("Base_%s" % direction) as GeometryInstance3D
		if base == null:
			return false
		game_nodes.append(base)
	for child: Node in intro.get_children():
		if child is GeometryInstance3D and String(child.name).begins_with("Stone_"):
			game_nodes.append(child as GeometryInstance3D)
	if game_nodes.size() != 42:
		return false

	intro.set("playing", false)
	intro.set_process_unhandled_input(false)
	gameplay.set_process_input(false)
	for node: GeometryInstance3D in game_nodes:
		node.visible = false
	tabletop.visible = false
	pedestal.visible = false
	_publish_web_state("waiting-for-match")
	return true


func _prepare_pixel_match() -> bool:
	if not tabletop.material_override is StandardMaterial3D:
		push_error("YAKOLAK pre-intro requires a StandardMaterial3D table")
		_publish_web_state("error")
		return false

	wall_logo = intro.get_node_or_null("StudioWallLogo") as MeshInstance3D
	if wall_logo == null:
		return false

	final_table_position = tabletop.position
	final_pedestal_position = pedestal.position
	final_table_scale = tabletop.scale
	final_pedestal_scale = pedestal.scale
	final_rotation = tabletop.quaternion.normalized()

	final_camera_position = camera.position
	final_camera_rotation = camera.quaternion.normalized()
	final_camera_fov = camera.fov

	table_material = (tabletop.material_override as StandardMaterial3D).duplicate() as StandardMaterial3D
	tabletop.material_override = table_material
	final_table_color = table_material.albedo_color
	final_table_roughness = table_material.roughness
	final_table_metallic = table_material.metallic
	table_material.albedo_color = WHITE_STAR
	table_material.roughness = 0.54
	table_material.metallic = 0.0

	# The table OBJ lies on XZ. Rotating -90 degrees around X makes the exact
	# footprint face the screen while preserving its upright SVG orientation.
	face_camera_rotation = Quaternion(Vector3.RIGHT, deg_to_rad(-90.0)).normalized()
	tabletop.position = final_table_position
	tabletop.quaternion = face_camera_rotation
	tabletop.scale = final_table_scale
	tabletop.visible = true
	_set_pedestal_growth(0.0)
	pedestal.visible = false
	wall_logo.visible = true

	var local_center: Vector3 = tabletop.mesh.get_aabb().get_center()
	var world_center: Vector3 = tabletop.global_transform * local_center
	match_camera_position = world_center + Vector3(0.0, 0.0, MATCH_CAMERA_DISTANCE)
	camera.position = match_camera_position
	camera.look_at(world_center, Vector3.UP)
	camera.fov = MATCH_CAMERA_FOV
	match_camera_rotation = camera.quaternion.normalized()
	match_camera_fov = camera.fov

	magic_light = OmniLight3D.new()
	magic_light.name = "StarToTableSoftLight"
	magic_light.light_color = Color("#7182ff")
	magic_light.light_energy = 0.12
	magic_light.omni_range = 14.0
	magic_light.shadow_enabled = false
	magic_light.position = world_center + Vector3(0.0, 0.0, 2.0)
	intro.add_child(magic_light)
	return true


func _publish_match_geometry() -> bool:
	var star_rect: Rect2 = _projected_rect(tabletop)
	var logo_rect: Rect2 = _projected_rect(wall_logo)
	if star_rect.size.x < 32.0 or star_rect.size.y < 32.0 or logo_rect.size.x < 24.0:
		return false

	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var center_error: float = star_rect.get_center().distance_to(viewport_size * 0.5)
	print(
		"YAKOLAK_PIXEL_MATCH_READY star=(%.2f,%.2f %.2fx%.2f) center_error=%.3f logo=(%.2f,%.2f %.2fx%.2f)" % [
			star_rect.position.x, star_rect.position.y, star_rect.size.x, star_rect.size.y,
			center_error,
			logo_rect.position.x, logo_rect.position.y, logo_rect.size.x, logo_rect.size.y,
		]
	)

	if OS.has_feature("web"):
		var script := (
			"window.__yakolakMatch={" +
			"star:{x:" + str(star_rect.position.x) + ",y:" + str(star_rect.position.y) + ",w:" + str(star_rect.size.x) + ",h:" + str(star_rect.size.y) + "}," +
			"logo:{x:" + str(logo_rect.position.x) + ",y:" + str(logo_rect.position.y) + ",w:" + str(logo_rect.size.x) + ",h:" + str(logo_rect.size.y) + "}" +
			"};" +
			"document.body.dataset.yakolakMatchCenterError='" + str(center_error) + "';"
		)
		JavaScriptBridge.eval(script, true)
	_publish_web_state("match-ready")
	return true


func _projected_rect(instance: MeshInstance3D) -> Rect2:
	var aabb: AABB = instance.mesh.get_aabb()
	var minimum := Vector2(INF, INF)
	var maximum := Vector2(-INF, -INF)
	for x_index: int in 2:
		for y_index: int in 2:
			for z_index: int in 2:
				var local := aabb.position + Vector3(
					aabb.size.x * float(x_index),
					aabb.size.y * float(y_index),
					aabb.size.z * float(z_index)
				)
				var world: Vector3 = instance.global_transform * local
				var screen: Vector2 = camera.unproject_position(world)
				minimum.x = minf(minimum.x, screen.x)
				minimum.y = minf(minimum.y, screen.y)
				maximum.x = maxf(maximum.x, screen.x)
				maximum.y = maxf(maximum.y, screen.y)
	return Rect2(minimum, maximum - minimum)


func _dom_handoff_is_matched() -> bool:
	if not OS.has_feature("web"):
		return true
	var state: Variant = JavaScriptBridge.eval(
		"document.body.dataset.yakolakLoaderHandoff || ''",
		true
	)
	return str(state) == "matched"


func _start_matched_handoff() -> void:
	handoff_started = true
	started_msec = Time.get_ticks_msec()
	published_phase = 0
	_publish_phase("matched")


func _apply_table_and_camera(elapsed: float) -> void:
	if elapsed <= MATCH_HOLD_MS:
		_apply_match_pose()
		return

	var morph_end: float = MATCH_HOLD_MS + MORPH_MS
	if elapsed <= morph_end:
		var t: float = _ease_in_out_cubic((elapsed - MATCH_HOLD_MS) / MORPH_MS)
		tabletop.position = final_table_position
		tabletop.quaternion = face_camera_rotation.slerp(final_rotation, t).normalized()
		tabletop.scale = final_table_scale * (1.0 + sin(t * PI) * 0.008)
		var color_t: float = _smooth(clampf((t - 0.22) / 0.78, 0.0, 1.0))
		table_material.albedo_color = WHITE_STAR.lerp(final_table_color, color_t)
		table_material.roughness = lerpf(0.54, final_table_roughness, color_t)
		table_material.metallic = lerpf(0.0, final_table_metallic, color_t)
		var pedestal_t: float = _ease_out_cubic(clampf((t - 0.42) / 0.58, 0.0, 1.0))
		pedestal.visible = pedestal_t > 0.001
		_set_pedestal_growth(pedestal_t)
		_apply_match_camera()
		magic_light.light_energy = 0.12 * (1.0 - color_t)
		return

	var settle_end: float = morph_end + SETTLE_MS
	if elapsed <= settle_end:
		var t: float = _ease_out_cubic((elapsed - morph_end) / SETTLE_MS)
		tabletop.position = final_table_position
		tabletop.quaternion = final_rotation
		tabletop.scale = final_table_scale * lerpf(1.006, 1.0, t)
		pedestal.visible = true
		_set_pedestal_growth(1.0)
		table_material.albedo_color = final_table_color
		table_material.roughness = final_table_roughness
		table_material.metallic = final_table_metallic
		_apply_match_camera()
		magic_light.light_energy = 0.0
		return

	var orbit_end: float = settle_end + CAMERA_ORBIT_MS
	if elapsed <= orbit_end:
		_snap_table_final()
		var t: float = _ease_in_out_cubic((elapsed - settle_end) / CAMERA_ORBIT_MS)
		camera.position = match_camera_position.lerp(final_camera_position, t)
		camera.quaternion = match_camera_rotation.slerp(final_camera_rotation, t).normalized()
		camera.fov = lerpf(match_camera_fov, final_camera_fov, t)
		return

	_snap_table_final()
	_apply_final_camera()


func _apply_match_pose() -> void:
	tabletop.position = final_table_position
	tabletop.quaternion = face_camera_rotation
	tabletop.scale = final_table_scale
	tabletop.visible = true
	table_material.albedo_color = WHITE_STAR
	table_material.roughness = 0.54
	table_material.metallic = 0.0
	pedestal.visible = false
	_set_pedestal_growth(0.0)
	_apply_match_camera()
	magic_light.light_energy = 0.12


func _apply_match_camera() -> void:
	camera.position = match_camera_position
	camera.quaternion = match_camera_rotation
	camera.fov = match_camera_fov


func _apply_final_camera() -> void:
	camera.position = final_camera_position
	camera.quaternion = final_camera_rotation
	camera.fov = final_camera_fov


func _set_pedestal_growth(value: float) -> void:
	var t: float = clampf(value, 0.0, 1.0)
	var current_y_scale: float = lerpf(0.02, final_pedestal_scale.y, t)
	pedestal.scale = Vector3(final_pedestal_scale.x, current_y_scale, final_pedestal_scale.z)
	var y_offset: float = PEDESTAL_HALF_HEIGHT * (final_pedestal_scale.y - current_y_scale)
	pedestal.position = final_pedestal_position + Vector3(0.0, y_offset, 0.0)


func _begin_box_reveal() -> void:
	box_reveal_started = true
	_snap_table_final()
	_apply_final_camera()
	intro.call("_apply_timeline", 0.0)
	intro.set("playing", false)
	box_final_poses.clear()
	for node: GeometryInstance3D in game_nodes:
		box_final_poses[node] = {
			"position": node.position,
			"rotation": node.quaternion.normalized(),
			"scale": node.scale,
		}
		node.position = node.position + Vector3(0.0, -BOX_START_DROP, 0.0)
		node.scale = node.scale * BOX_START_SCALE
		node.visible = true
	_publish_phase("box-arriving")


func _apply_box_reveal(reveal_elapsed: float) -> void:
	var t: float = _ease_in_out_cubic(reveal_elapsed / BOX_REVEAL_MS)
	for node: GeometryInstance3D in game_nodes:
		var pose: Dictionary = box_final_poses[node] as Dictionary
		var final_position: Vector3 = pose["position"] as Vector3
		var final_scale: Vector3 = pose["scale"] as Vector3
		node.position = (final_position + Vector3(0.0, -BOX_START_DROP, 0.0)).lerp(final_position, t)
		node.quaternion = pose["rotation"] as Quaternion
		node.scale = (final_scale * BOX_START_SCALE).lerp(final_scale, t)


func _snap_table_final() -> void:
	tabletop.position = final_table_position
	tabletop.quaternion = final_rotation
	tabletop.scale = final_table_scale
	tabletop.visible = true
	_set_pedestal_growth(1.0)
	pedestal.visible = true
	table_material.albedo_color = final_table_color
	table_material.roughness = final_table_roughness
	table_material.metallic = final_table_metallic
	if magic_light != null:
		magic_light.light_energy = 0.0


func _snap_box_and_camera_final() -> void:
	_apply_final_camera()
	for node: GeometryInstance3D in game_nodes:
		var pose: Dictionary = box_final_poses[node] as Dictionary
		node.position = pose["position"] as Vector3
		node.quaternion = pose["rotation"] as Quaternion
		node.scale = pose["scale"] as Vector3
		node.visible = true


func _finish_and_start_intro() -> void:
	if completed:
		return
	completed = true
	_snap_table_final()
	_snap_box_and_camera_final()
	intro.set_process_unhandled_input(true)
	gameplay.set_process_input(true)
	_publish_phase("complete")
	print("YAKOLAK_PREINTRO_COMPLETE duration=%d motion=%s match=pixel-exact logo=wall camera=side box=visible" % [int(TOTAL_MS), MOTION_VERSION])
	intro.call("_restart_intro")
	set_process(false)


func _publish_timeline_phase(elapsed: float) -> void:
	if published_phase < 1 and elapsed >= MATCH_HOLD_MS:
		published_phase = 1
		_publish_phase("star-to-3d")
	elif published_phase < 2 and elapsed >= MATCH_HOLD_MS + MORPH_MS:
		published_phase = 2
		_publish_phase("table-settling")
	elif published_phase < 3 and elapsed >= MATCH_HOLD_MS + MORPH_MS + SETTLE_MS:
		published_phase = 3
		_publish_phase("camera-orbit")
	elif published_phase < 4 and elapsed >= MATCH_HOLD_MS + MORPH_MS + SETTLE_MS + CAMERA_ORBIT_MS:
		published_phase = 4
		_publish_phase("camera-settled")


func _publish_phase(phase: String) -> void:
	print("YAKOLAK_PREINTRO_PHASE " + phase)
	_publish_web_state(phase)


func _publish_web_state(state: String) -> void:
	if not OS.has_feature("web"):
		return
	var intro_wait_script: String = "" if state == "complete" else "document.body.dataset.yakolakIntro='waiting-preintro';"
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakPreIntro='" + state + "';" +
		"document.body.dataset.yakolakPreIntroDuration='" + str(int(TOTAL_MS)) + "';" +
		"document.body.dataset.yakolakPreIntroShape='exact-svg-pixel-match';" +
		"document.body.dataset.yakolakMotion='" + MOTION_VERSION + "';" +
		intro_wait_script,
		true
	)


func _smooth(value: float) -> float:
	var t: float = clampf(value, 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)


func _ease_out_cubic(value: float) -> float:
	var t: float = clampf(value, 0.0, 1.0)
	return 1.0 - pow(1.0 - t, 3.0)


func _ease_in_out_cubic(value: float) -> float:
	var t: float = clampf(value, 0.0, 1.0)
	return 4.0 * t * t * t if t < 0.5 else 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0
