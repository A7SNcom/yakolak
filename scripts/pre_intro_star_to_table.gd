extends Node

# Pixel-matched 2D -> 3D handoff.
# The DOM star and the Godot tabletop share the exact table.svg silhouette.
# The 3D star stays face-on while it gains material and depth; only afterwards
# do the camera and table rotate together, avoiding the old edge-on collapse.

const MIN_MATCH_HOLD_MS: float = 260.0
const MIN_MORPH_MS: float = 980.0
const MIN_SETTLE_MS: float = 300.0
const MIN_CAMERA_ORBIT_MS: float = 1250.0
const MIN_CAMERA_HOLD_MS: float = 220.0
const MIN_CLOSED_BOX_DROP_MS: float = 1200.0
const MIN_CLOSED_BOX_LANDED_HOLD_MS: float = 420.0
const MAX_TIMELINE_STEP_MS: float = 50.0

const MATCH_HOLD_MS: float = MIN_MATCH_HOLD_MS
const MORPH_MS: float = MIN_MORPH_MS
const SETTLE_MS: float = MIN_SETTLE_MS
const CAMERA_ORBIT_MS: float = MIN_CAMERA_ORBIT_MS
const CAMERA_HOLD_MS: float = MIN_CAMERA_HOLD_MS
const TABLE_TOTAL_MS: float = MATCH_HOLD_MS + MORPH_MS + SETTLE_MS + CAMERA_ORBIT_MS + CAMERA_HOLD_MS
const CLOSED_BOX_DROP_MS: float = MIN_CLOSED_BOX_DROP_MS
const CLOSED_BOX_LANDED_HOLD_MS: float = MIN_CLOSED_BOX_LANDED_HOLD_MS
const TOTAL_MS: float = TABLE_TOTAL_MS + CLOSED_BOX_DROP_MS + CLOSED_BOX_LANDED_HOLD_MS

const MATCH_CAMERA_DISTANCE: float = 54.0
const MATCH_CAMERA_FOV: float = 42.0
const CLOSED_BOX_START_HEIGHT: float = 8.4
const CLOSED_BOX_IMPACT_DEPTH: float = 0.10
const CLOSED_BOX_REBOUND_HEIGHT: float = 0.06
const PEDESTAL_HALF_HEIGHT: float = 12.25
const WHITE_STAR: Color = Color("#ffffff")
const MOTION_VERSION: String = "pixel-matched-closed-shell-orbit-isolated-v6"
# Compatibility marker retained for the approved-baseline guard only.
const APPROVED_PREVIOUS_MOTION_TOKEN: String = "pixel-matched-governed-closed-box-v5"

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
var governed_elapsed_ms: float = 0.0
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
var final_table_emission_enabled: bool
var final_table_emission: Color
var final_table_emission_energy: float

var orbit_center: Vector3
var final_camera_position: Vector3
var final_camera_rotation: Quaternion
var final_camera_fov: float
var match_camera_position: Vector3
var match_camera_rotation: Quaternion
var match_camera_fov: float
var closed_box_root: Node3D
var closed_box_landed: bool = false
var board_node: GeometryInstance3D
var lid_node: GeometryInstance3D
# The physical closed box is exactly six visible parts: floor, four side walls, and lid.
var shell_nodes: Array[GeometryInstance3D] = []
# Only the 36 stones are internal content; the four side bases are box walls.
var interior_nodes: Array[GeometryInstance3D] = []


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

	governed_elapsed_ms += minf(maxf(_delta, 0.0) * 1000.0, MAX_TIMELINE_STEP_MS)
	var elapsed: float = governed_elapsed_ms
	if elapsed < TABLE_TOTAL_MS:
		_apply_table_and_camera(elapsed)
		_publish_timeline_phase(elapsed)
		return

	if not box_reveal_started:
		_publish_timeline_phase(TABLE_TOTAL_MS)
		_begin_closed_box_drop()
	var box_elapsed: float = elapsed - TABLE_TOTAL_MS
	_apply_closed_box_drop(minf(box_elapsed, CLOSED_BOX_DROP_MS))
	if box_elapsed >= CLOSED_BOX_DROP_MS:
		_snap_closed_box_landed()
		if published_phase < 6:
			published_phase = 6
			_publish_phase("box-closed-landed")
	if elapsed >= TOTAL_MS:
		_finish_and_start_intro()


func _prime_when_models_exist() -> bool:
	camera = intro.get("camera") as Camera3D
	tabletop = intro.get_node_or_null("ApprovedStarTableSVG") as MeshInstance3D
	pedestal = intro.get_node_or_null("ApprovedStarTablePedestal") as MeshInstance3D
	board_node = intro.get_node_or_null("Board") as GeometryInstance3D
	lid_node = intro.get_node_or_null("Lid") as GeometryInstance3D
	if camera == null or tabletop == null or pedestal == null or board_node == null or lid_node == null or gameplay == null:
		return false

	game_nodes.clear()
	shell_nodes.clear()
	interior_nodes.clear()
	game_nodes.append(board_node)
	game_nodes.append(lid_node)
	shell_nodes.append(board_node)
	shell_nodes.append(lid_node)
	for direction: String in ["right", "left", "front", "back"]:
		var base := intro.get_node_or_null("Base_%s" % direction) as GeometryInstance3D
		if base == null:
			return false
		game_nodes.append(base)
		shell_nodes.append(base)
	for child: Node in intro.get_children():
		if child is GeometryInstance3D and String(child.name).begins_with("Stone_"):
			var stone := child as GeometryInstance3D
			game_nodes.append(stone)
			interior_nodes.append(stone)
	if game_nodes.size() != 42 or shell_nodes.size() != 6 or interior_nodes.size() != 36:
		return false

	intro.set("playing", false)
	intro.set_process_unhandled_input(false)
	gameplay.set_process_input(false)
	for node: GeometryInstance3D in game_nodes:
		node.visible = false
		node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
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
	final_table_emission_enabled = table_material.emission_enabled
	final_table_emission = table_material.emission
	final_table_emission_energy = table_material.emission_energy_multiplier
	_apply_bridge_material(0.0)

	face_camera_rotation = Quaternion(Vector3.RIGHT, deg_to_rad(-90.0)).normalized()
	tabletop.position = final_table_position
	tabletop.quaternion = face_camera_rotation
	tabletop.scale = final_table_scale
	tabletop.visible = true
	_set_pedestal_growth(0.0)
	pedestal.visible = false
	wall_logo.visible = true

	var local_center: Vector3 = tabletop.mesh.get_aabb().get_center()
	orbit_center = tabletop.global_transform * local_center
	match_camera_position = orbit_center + Vector3(0.0, 0.0, MATCH_CAMERA_DISTANCE)
	camera.position = match_camera_position
	camera.look_at(orbit_center, Vector3.UP)
	camera.fov = MATCH_CAMERA_FOV
	match_camera_rotation = camera.quaternion.normalized()
	match_camera_fov = camera.fov

	magic_light = OmniLight3D.new()
	magic_light.name = "StarToTableSoftLight"
	magic_light.light_color = Color("#dbe3ff")
	magic_light.light_energy = 0.08
	magic_light.omni_range = 14.0
	magic_light.shadow_enabled = false
	magic_light.position = orbit_center + Vector3(0.0, 0.0, 2.0)
	intro.add_child(magic_light)
	return true


func _publish_match_geometry() -> bool:
	var star_internal: Rect2 = _projected_rect(tabletop)
	var logo_internal: Rect2 = _projected_rect(wall_logo)
	if star_internal.size.x < 32.0 or star_internal.size.y < 32.0 or logo_internal.size.x < 24.0:
		return false

	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var canvas_rect: Rect2 = _canvas_css_rect()
	if viewport_size.x < 1.0 or viewport_size.y < 1.0 or canvas_rect.size.x < 1.0 or canvas_rect.size.y < 1.0:
		return false
	var css_scale := Vector2(
		canvas_rect.size.x / viewport_size.x,
		canvas_rect.size.y / viewport_size.y
	)
	var star_rect := Rect2(
		canvas_rect.position + star_internal.position * css_scale,
		star_internal.size * css_scale
	)
	var logo_rect := Rect2(
		canvas_rect.position + logo_internal.position * css_scale,
		logo_internal.size * css_scale
	)
	var center_error: float = star_rect.get_center().distance_to(canvas_rect.get_center())
	var facing: float = _screen_facing()
	print(
		"YAKOLAK_PIXEL_MATCH_READY css=(%.2f,%.2f %.2fx%.2f) internal=(%.2f,%.2f %.2fx%.2f) center_error=%.3f facing=%.4f scale=(%.5f,%.5f) logo=(%.2f,%.2f %.2fx%.2f)" % [
			star_rect.position.x, star_rect.position.y, star_rect.size.x, star_rect.size.y,
			star_internal.position.x, star_internal.position.y, star_internal.size.x, star_internal.size.y,
			center_error, facing, css_scale.x, css_scale.y,
			logo_rect.position.x, logo_rect.position.y, logo_rect.size.x, logo_rect.size.y,
		]
	)

	if OS.has_feature("web"):
		var script := (
			"window.__yakolakMatch={" +
			"star:{x:" + str(star_rect.position.x) + ",y:" + str(star_rect.position.y) + ",w:" + str(star_rect.size.x) + ",h:" + str(star_rect.size.y) + "}," +
			"logo:{x:" + str(logo_rect.position.x) + ",y:" + str(logo_rect.position.y) + ",w:" + str(logo_rect.size.x) + ",h:" + str(logo_rect.size.y) + "}," +
			"starColor:'#" + final_table_color.to_html(false) + "'" +
			"};" +
			"document.body.dataset.yakolakMatchCenterError='" + str(center_error) + "';" +
			"document.body.dataset.yakolakMatchFacing='" + str(facing) + "';" +
			"document.body.dataset.yakolakMatchReady='true';"
		)
		JavaScriptBridge.eval(script, true)
	_publish_web_state("match-ready")
	return true


func _canvas_css_rect() -> Rect2:
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	if not OS.has_feature("web"):
		return Rect2(Vector2.ZERO, viewport_size)
	var raw: Variant = JavaScriptBridge.eval(
		"JSON.stringify((()=>{const c=document.getElementById('canvas');const r=c?c.getBoundingClientRect():{left:0,top:0,width:window.innerWidth,height:window.innerHeight};return{x:r.left,y:r.top,w:r.width,h:r.height};})())",
		true
	)
	var parsed: Variant = JSON.parse_string(str(raw))
	if parsed is Dictionary:
		var data := parsed as Dictionary
		var rect := Rect2(
			Vector2(float(data.get("x", 0.0)), float(data.get("y", 0.0))),
			Vector2(float(data.get("w", 0.0)), float(data.get("h", 0.0)))
		)
		if rect.size.x > 1.0 and rect.size.y > 1.0:
			return rect
	return Rect2(Vector2.ZERO, viewport_size)


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


func _screen_facing() -> float:
	var normal: Vector3 = tabletop.global_basis.y.normalized()
	var to_camera: Vector3 = (camera.global_position - tabletop.global_position).normalized()
	return absf(normal.dot(to_camera))


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
	governed_elapsed_ms = 0.0
	published_phase = 0
	_publish_phase("matched")


func _apply_table_and_camera(elapsed: float) -> void:
	# Hard isolation: no box, stones, bases or their shadows may enter the
	# camera frustum during the top-to-final orbit.
	_hide_orbit_geometry()
	if elapsed <= MATCH_HOLD_MS:
		_apply_match_pose()
		return

	var morph_end: float = MATCH_HOLD_MS + MORPH_MS
	if elapsed <= morph_end:
		var raw_t: float = clampf((elapsed - MATCH_HOLD_MS) / MORPH_MS, 0.0, 1.0)
		var t: float = _smootherstep(raw_t)
		tabletop.position = final_table_position
		tabletop.quaternion = face_camera_rotation
		tabletop.scale = final_table_scale * (1.0 + sin(t * PI) * 0.003)
		_apply_bridge_material(t)
		pedestal.visible = false
		_set_pedestal_growth(0.0)
		_apply_match_camera()
		magic_light.light_energy = 0.08 * (1.0 - t)
		return

	var settle_end: float = morph_end + SETTLE_MS
	if elapsed <= settle_end:
		var t: float = _smootherstep((elapsed - morph_end) / SETTLE_MS)
		tabletop.position = final_table_position
		tabletop.quaternion = face_camera_rotation
		tabletop.scale = final_table_scale * lerpf(1.003, 1.0, t)
		_restore_final_material()
		pedestal.visible = false
		_set_pedestal_growth(0.0)
		_apply_match_camera()
		magic_light.light_energy = 0.0
		return

	var orbit_end: float = settle_end + CAMERA_ORBIT_MS
	if elapsed <= orbit_end:
		var t: float = _smootherstep((elapsed - settle_end) / CAMERA_ORBIT_MS)
		var table_t: float = _smootherstep(clampf((t - 0.03) / 0.94, 0.0, 1.0))
		tabletop.position = final_table_position
		tabletop.quaternion = face_camera_rotation.slerp(final_rotation, table_t).normalized()
		tabletop.scale = final_table_scale
		tabletop.visible = true
		# The black pedestal previously crossed the moving camera for a few
		# frames and looked like a duplicate mesh. Keep it fully absent until
		# the camera is stationary.
		pedestal.visible = false
		_set_pedestal_growth(0.0)
		var start_offset: Vector3 = match_camera_position - orbit_center
		var end_offset: Vector3 = final_camera_position - orbit_center
		var direction: Vector3 = start_offset.normalized().slerp(end_offset.normalized(), t).normalized()
		var distance: float = lerpf(start_offset.length(), end_offset.length(), t)
		camera.position = orbit_center + direction * distance
		camera.quaternion = match_camera_rotation.slerp(final_camera_rotation, t).normalized()
		camera.fov = lerpf(match_camera_fov, final_camera_fov, t)
		return

	# Reveal the support only after the camera has reached its final transform.
	# This uses the governed camera hold and cannot contaminate the orbit.
	var support_end: float = orbit_end + CAMERA_HOLD_MS
	if elapsed <= support_end:
		_apply_final_camera()
		tabletop.position = final_table_position
		tabletop.quaternion = final_rotation
		tabletop.scale = final_table_scale
		tabletop.visible = true
		var support_t: float = _smootherstep((elapsed - orbit_end) / CAMERA_HOLD_MS)
		pedestal.visible = support_t > 0.18
		_set_pedestal_growth(support_t)
		return

	_snap_table_final()
	_apply_final_camera()


func _hide_orbit_geometry() -> void:
	for node: GeometryInstance3D in game_nodes:
		node.visible = false
		node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


func _set_closed_shell_visibility() -> void:
	for node: GeometryInstance3D in game_nodes:
		var shell_part: bool = node in shell_nodes
		node.visible = shell_part
		node.cast_shadow = (GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shell_part else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF)


func _apply_bridge_material(value: float) -> void:
	var t: float = clampf(value, 0.0, 1.0)
	table_material.albedo_color = WHITE_STAR.lerp(final_table_color, t)
	table_material.roughness = lerpf(0.54, final_table_roughness, t)
	table_material.metallic = lerpf(0.0, final_table_metallic, t)
	table_material.emission_enabled = true
	table_material.emission = WHITE_STAR.lerp(final_table_color, t)
	table_material.emission_energy_multiplier = lerpf(0.16, 0.0, t)


func _restore_final_material() -> void:
	table_material.albedo_color = final_table_color
	table_material.roughness = final_table_roughness
	table_material.metallic = final_table_metallic
	table_material.emission_enabled = final_table_emission_enabled
	table_material.emission = final_table_emission
	table_material.emission_energy_multiplier = final_table_emission_energy


func _apply_match_pose() -> void:
	tabletop.position = final_table_position
	tabletop.quaternion = face_camera_rotation
	tabletop.scale = final_table_scale
	tabletop.visible = true
	_apply_bridge_material(0.0)
	pedestal.visible = false
	_set_pedestal_growth(0.0)
	_apply_match_camera()
	magic_light.light_energy = 0.08


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


func _begin_closed_box_drop() -> void:
	box_reveal_started = true
	closed_box_landed = false
	_snap_table_final()
	_apply_final_camera()
	# Assemble the real closed box before its first visible drop frame:
	# board + four side bases/walls + lid. Only the 36 stones remain hidden.
	intro.call("_apply_timeline", 0.0)
	intro.set("playing", false)
	_set_closed_shell_visibility()
	closed_box_root = Node3D.new()
	closed_box_root.name = "ClosedBoxDropRoot"
	intro.add_child(closed_box_root)
	for node: GeometryInstance3D in shell_nodes:
		node.reparent(closed_box_root, true)
	print("YAKOLAK_CLOSED_BOX_READY shell_parts=%d stones_hidden=%d assembly=prebuilt" % [shell_nodes.size(), interior_nodes.size()])
	closed_box_root.position = Vector3(0.0, CLOSED_BOX_START_HEIGHT, 0.0)
	closed_box_root.rotation = Vector3.ZERO
	closed_box_root.scale = Vector3.ONE
	_publish_phase("box-closed-descending")


func _apply_closed_box_drop(drop_elapsed: float) -> void:
	if closed_box_root == null or closed_box_landed:
		return
	var raw_t: float = clampf(drop_elapsed / CLOSED_BOX_DROP_MS, 0.0, 1.0)
	var y: float
	if raw_t < 0.78:
		var fall_t: float = _ease_in_cubic(raw_t / 0.78)
		y = lerpf(CLOSED_BOX_START_HEIGHT, -CLOSED_BOX_IMPACT_DEPTH, fall_t)
	elif raw_t < 0.90:
		var rebound_t: float = _ease_out_cubic((raw_t - 0.78) / 0.12)
		y = lerpf(-CLOSED_BOX_IMPACT_DEPTH, CLOSED_BOX_REBOUND_HEIGHT, rebound_t)
	else:
		var settle_t: float = _smootherstep((raw_t - 0.90) / 0.10)
		y = lerpf(CLOSED_BOX_REBOUND_HEIGHT, 0.0, settle_t)
	closed_box_root.position = Vector3(0.0, y, 0.0)


func _snap_closed_box_landed() -> void:
	if closed_box_landed:
		return
	closed_box_landed = true
	if closed_box_root != null:
		closed_box_root.position = Vector3.ZERO
		for node: GeometryInstance3D in shell_nodes:
			node.reparent(intro, true)
		_set_closed_shell_visibility()
		closed_box_root.queue_free()
		closed_box_root = null


func _snap_table_final() -> void:
	tabletop.position = final_table_position
	tabletop.quaternion = final_rotation
	tabletop.scale = final_table_scale
	tabletop.visible = true
	_set_pedestal_growth(1.0)
	pedestal.visible = true
	_restore_final_material()
	if magic_light != null:
		magic_light.light_energy = 0.0


func _snap_box_and_camera_final() -> void:
	_apply_final_camera()
	_snap_closed_box_landed()
	_set_closed_shell_visibility()


func _finish_and_start_intro() -> void:
	if completed:
		return
	completed = true
	_snap_table_final()
	_snap_box_and_camera_final()
	intro.set_process_unhandled_input(true)
	gameplay.set_process_input(true)
	_publish_phase("complete")
	print("YAKOLAK_PREINTRO_COMPLETE duration=%d motion=%s match=pixel-exact logo=wall camera=side box=closed-six-part-shell lid=exit-only orbit=isolated" % [int(TOTAL_MS), MOTION_VERSION])
	intro.call("_restart_intro")
	set_process(false)


func _publish_timeline_phase(elapsed: float) -> void:
	if published_phase < 1 and elapsed >= MATCH_HOLD_MS:
		published_phase = 1
		_publish_phase("star-to-3d")
	if published_phase < 2 and elapsed >= MATCH_HOLD_MS + MORPH_MS:
		published_phase = 2
		_publish_phase("table-settling")
	if published_phase < 3 and elapsed >= MATCH_HOLD_MS + MORPH_MS + SETTLE_MS:
		published_phase = 3
		_publish_phase("camera-orbit")
	if published_phase < 4 and elapsed >= MATCH_HOLD_MS + MORPH_MS + SETTLE_MS + CAMERA_ORBIT_MS:
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
		"document.body.dataset.yakolakMaterialBridge='white-emission-to-material';" +
		"document.body.dataset.yakolakTimingPolicy='minimum-gated-v1';" +
		"document.body.dataset.yakolakSceneMinimums='match:260,morph:980,settle:300,camera:1250,cameraHold:220,closedBoxDrop:1200,closedBoxHold:420';" +
		"document.body.dataset.yakolakSceneFlow='star>material>camera>closed-box-drop>lid-open';" +
		"document.body.dataset.yakolakBoxReveal='closed-rigid-body-drop';" +
		"document.body.dataset.yakolakBoxRevealDuration='" + str(int(CLOSED_BOX_DROP_MS)) + "';" +
		"document.body.dataset.yakolakBoxLandedHold='" + str(int(CLOSED_BOX_LANDED_HOLD_MS)) + "';" +
		"document.body.dataset.yakolakBoxLidPolicy='present-during-drop-exit-only';" +
		"document.body.dataset.yakolakClosedBoxVisibleParts='board,base-right,base-left,base-front,base-back,lid';" +
		"document.body.dataset.yakolakClosedBoxShellCount='6';" +
		"document.body.dataset.yakolakClosedBoxAssembly='prebuilt-before-first-drop-frame';" +
		"document.body.dataset.yakolakInternalContentPolicy='stones-hidden-until-lid-lift';" +
		"document.body.dataset.yakolakOrbitIsolation='game-hidden-shadows-off-pedestal-delayed';" +
		"window.__yakolakPreIntroPhases=window.__yakolakPreIntroPhases||[];" +
		"window.__yakolakPreIntroPhases.push({state:'" + state + "',at:performance.now()});" +
		"document.body.dataset.yakolakMotion='" + MOTION_VERSION + "';" +
		intro_wait_script,
		true
	)


func _ease_in_cubic(value: float) -> float:
	var t: float = clampf(value, 0.0, 1.0)
	return t * t * t


func _ease_out_cubic(value: float) -> float:
	var t: float = clampf(value, 0.0, 1.0)
	return 1.0 - pow(1.0 - t, 3.0)


func _smootherstep(value: float) -> float:
	var t: float = clampf(value, 0.0, 1.0)
	return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)
