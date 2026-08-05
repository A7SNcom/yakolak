extends Node

# YAKOLAK 3.0 pre-intro: the exact v129 loading-star silhouette becomes the
# approved table, then the closed box rises onto it before the accepted intro.
# The approved unboxing itself is not modified.

const HANDOFF_MS: float = 560.0
const FLOAT_MS: float = 900.0
const FORM_MS: float = 1120.0
const SETTLE_MS: float = 520.0
const HOLD_MS: float = 260.0
const TABLE_TOTAL_MS: float = HANDOFF_MS + FLOAT_MS + FORM_MS + SETTLE_MS + HOLD_MS
const BOX_REVEAL_MS: float = 520.0
const TOTAL_MS: float = TABLE_TOTAL_MS + BOX_REVEAL_MS
const INITIAL_DEPTH: float = 10.0
const INITIAL_SCALE: float = 0.055
const FLOAT_SCALE: float = 0.32
const LOADER_COLOR: Color = Color("#3f3f3f")
const STAGE_CAMERA_DISTANCE: float = 1.34
const STAGE_CAMERA_LIFT: float = 0.9
const STAGE_CAMERA_FOV: float = 49.0
const BOX_START_DROP: float = 0.32
const BOX_START_SCALE: float = 0.965

var intro: Node3D
var corrections: Node
var gameplay: Node
var camera: Camera3D
var tabletop: MeshInstance3D
var pedestal: MeshInstance3D
var game_nodes: Array[GeometryInstance3D] = []
var table_material: StandardMaterial3D
var magic_light: OmniLight3D

var primed: bool = false
var initialized: bool = false
var box_reveal_started: bool = false
var completed: bool = false
var started_msec: int = 0
var published_phase: int = -1

var initial_position: Vector3
var floating_position: Vector3
var final_table_position: Vector3
var final_pedestal_position: Vector3
var pedestal_start_position: Vector3
var final_table_scale: Vector3
var final_pedestal_scale: Vector3
var initial_rotation: Quaternion
var floating_rotation: Quaternion
var final_rotation: Quaternion
var final_table_color: Color
var final_table_roughness: float
var final_table_metallic: float

var final_camera_position: Vector3
var final_camera_rotation: Quaternion
var final_camera_fov: float
var stage_camera_position: Vector3
var stage_camera_rotation: Quaternion
var box_final_poses: Dictionary = {}


func _ready() -> void:
	process_priority = 200
	intro = get_parent() as Node3D
	corrections = intro.get_node_or_null("ExistingIntroCorrections")
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
		initialized = _begin_transition()
		return

	var elapsed: float = float(Time.get_ticks_msec() - started_msec)
	if elapsed < TABLE_TOTAL_MS:
		_apply_table_motion(elapsed)
		_publish_timeline_phase(elapsed)
		return

	if not box_reveal_started:
		_begin_box_reveal()
	_apply_box_reveal(minf(elapsed - TABLE_TOTAL_MS, BOX_REVEAL_MS))
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

	# Stop the auto-started intro while the opaque HTML loader is still covering it.
	intro.set("playing", false)
	intro.set_process_unhandled_input(false)
	gameplay.set_process_input(false)
	for node: GeometryInstance3D in game_nodes:
		node.visible = false
	tabletop.visible = false
	pedestal.visible = false
	_publish_web_state("waiting-for-handoff")
	return true


func _begin_transition() -> bool:
	if not tabletop.material_override is StandardMaterial3D:
		push_error("YAKOLAK pre-intro requires the approved StandardMaterial3D table")
		_publish_web_state("error")
		return false

	final_table_position = tabletop.position
	final_pedestal_position = pedestal.position
	final_table_scale = tabletop.scale
	final_pedestal_scale = pedestal.scale
	final_rotation = tabletop.quaternion.normalized()

	final_camera_position = camera.position
	final_camera_rotation = camera.quaternion.normalized()
	final_camera_fov = camera.fov
	stage_camera_position = Vector3(
		final_camera_position.x * STAGE_CAMERA_DISTANCE,
		final_camera_position.y * STAGE_CAMERA_DISTANCE + STAGE_CAMERA_LIFT,
		final_camera_position.z * STAGE_CAMERA_DISTANCE
	)
	camera.position = stage_camera_position
	camera.look_at(Vector3(0.0, -0.65, 0.0), Vector3.UP)
	stage_camera_rotation = camera.quaternion.normalized()
	camera.fov = STAGE_CAMERA_FOV

	table_material = (tabletop.material_override as StandardMaterial3D).duplicate() as StandardMaterial3D
	tabletop.material_override = table_material
	final_table_color = table_material.albedo_color
	final_table_roughness = table_material.roughness
	final_table_metallic = table_material.metallic
	table_material.albedo_color = LOADER_COLOR
	table_material.roughness = 0.86
	table_material.metallic = 0.0

	var viewport_center: Vector2 = get_viewport().get_visible_rect().size * 0.5
	initial_position = camera.project_position(viewport_center, INITIAL_DEPTH)
	floating_position = Vector3(0.0, 2.65, 0.0)

	var camera_basis: Basis = camera.global_transform.basis.orthonormalized()
	var facing_basis := Basis(
		camera_basis.x.normalized(),
		camera_basis.z.normalized(),
		-camera_basis.y.normalized()
	).orthonormalized()
	facing_basis = facing_basis * Basis(Vector3.UP, deg_to_rad(12.0))
	initial_rotation = facing_basis.get_rotation_quaternion().normalized()
	floating_rotation = initial_rotation.slerp(final_rotation, 0.38).normalized()

	pedestal_start_position = final_pedestal_position + Vector3(0.0, -12.4, 0.0)
	pedestal.position = pedestal_start_position
	pedestal.scale = Vector3(final_pedestal_scale.x, 0.02, final_pedestal_scale.z)
	pedestal.visible = false

	tabletop.position = initial_position
	tabletop.quaternion = initial_rotation
	tabletop.scale = Vector3.ONE * INITIAL_SCALE
	tabletop.visible = true

	magic_light = OmniLight3D.new()
	magic_light.name = "StarToTableSoftLight"
	magic_light.light_color = Color("#fff3dc")
	magic_light.light_energy = 0.0
	magic_light.omni_range = 11.0
	magic_light.position = initial_position
	intro.add_child(magic_light)

	started_msec = Time.get_ticks_msec()
	published_phase = 0
	_publish_phase("handoff")
	return true


func _apply_table_motion(elapsed: float) -> void:
	if elapsed <= HANDOFF_MS:
		tabletop.position = initial_position
		tabletop.quaternion = initial_rotation
		tabletop.scale = Vector3.ONE * INITIAL_SCALE
		magic_light.position = initial_position
		magic_light.light_energy = 0.0
		return

	var float_end: float = HANDOFF_MS + FLOAT_MS
	if elapsed <= float_end:
		var t: float = _smooth((elapsed - HANDOFF_MS) / FLOAT_MS)
		tabletop.position = initial_position.lerp(floating_position, t)
		tabletop.quaternion = initial_rotation.slerp(floating_rotation, t).normalized()
		tabletop.scale = Vector3.ONE * lerpf(INITIAL_SCALE, FLOAT_SCALE, t)
		magic_light.position = tabletop.position + Vector3(0.0, 0.5, 0.0)
		magic_light.light_energy = sin(t * PI) * 0.20
		return

	var form_end: float = float_end + FORM_MS
	if elapsed <= form_end:
		var t: float = _smooth((elapsed - float_end) / FORM_MS)
		var elevated_final: Vector3 = final_table_position + Vector3(0.0, 0.18, 0.0)
		tabletop.position = floating_position.lerp(elevated_final, t)
		tabletop.quaternion = floating_rotation.slerp(final_rotation, t).normalized()
		var table_scale: float = lerpf(FLOAT_SCALE, 1.025, t)
		tabletop.scale = final_table_scale * table_scale

		var color_t: float = _smooth(clampf((t - 0.08) / 0.92, 0.0, 1.0))
		table_material.albedo_color = LOADER_COLOR.lerp(final_table_color, color_t)
		table_material.roughness = lerpf(0.86, final_table_roughness, color_t)
		table_material.metallic = lerpf(0.0, final_table_metallic, color_t)

		var pedestal_t: float = _smooth(clampf((t - 0.30) / 0.70, 0.0, 1.0))
		pedestal.visible = pedestal_t > 0.001
		pedestal.position = pedestal_start_position.lerp(final_pedestal_position, pedestal_t)
		pedestal.scale = Vector3(
			final_pedestal_scale.x,
			lerpf(0.02, final_pedestal_scale.y, pedestal_t),
			final_pedestal_scale.z
		)
		magic_light.position = tabletop.position + Vector3(0.0, 1.1, 0.0)
		magic_light.light_energy = sin(t * PI) * 0.48
		return

	var settle_end: float = form_end + SETTLE_MS
	if elapsed <= settle_end:
		var t: float = clampf((elapsed - form_end) / SETTLE_MS, 0.0, 1.0)
		var decay: float = 1.0 - t
		var vertical_offset: float = 0.18 * decay + sin(t * PI * 2.0) * 0.045 * decay
		tabletop.position = final_table_position + Vector3(0.0, vertical_offset, 0.0)
		tabletop.quaternion = final_rotation
		tabletop.scale = final_table_scale * (1.0 + sin(t * PI) * 0.018)
		pedestal.visible = true
		pedestal.position = final_pedestal_position
		pedestal.scale = final_pedestal_scale
		magic_light.position = final_table_position + Vector3(0.0, 1.1, 0.0)
		magic_light.light_energy = 0.14 * decay
		return

	_snap_table_final()


func _begin_box_reveal() -> void:
	box_reveal_started = true
	_snap_table_final()

	# Put every approved intro object at its exact accepted zero-time pose before it
	# becomes visible. This prevents a one-frame flash of the previous final layout.
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
	var t: float = _smooth(reveal_elapsed / BOX_REVEAL_MS)
	camera.position = stage_camera_position.lerp(final_camera_position, t)
	camera.quaternion = stage_camera_rotation.slerp(final_camera_rotation, t).normalized()
	camera.fov = lerpf(STAGE_CAMERA_FOV, final_camera_fov, t)
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
	pedestal.position = final_pedestal_position
	pedestal.scale = final_pedestal_scale
	pedestal.visible = true
	table_material.albedo_color = final_table_color
	table_material.roughness = final_table_roughness
	table_material.metallic = final_table_metallic
	if magic_light != null:
		magic_light.light_energy = 0.0


func _snap_box_and_camera_final() -> void:
	camera.position = final_camera_position
	camera.quaternion = final_camera_rotation
	camera.fov = final_camera_fov
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
	print("YAKOLAK_PREINTRO_COMPLETE duration=%d star=loading-star table=approved-star-svg box=visible" % int(TOTAL_MS))
	intro.call("_restart_intro")
	set_process(false)


func _publish_timeline_phase(elapsed: float) -> void:
	if published_phase < 1 and elapsed >= HANDOFF_MS:
		published_phase = 1
		_publish_phase("star-floating")
	elif published_phase < 2 and elapsed >= HANDOFF_MS + FLOAT_MS:
		published_phase = 2
		_publish_phase("table-forming")
	elif published_phase < 3 and elapsed >= HANDOFF_MS + FLOAT_MS + FORM_MS:
		published_phase = 3
		_publish_phase("table-settling")
	elif published_phase < 4 and elapsed >= HANDOFF_MS + FLOAT_MS + FORM_MS + SETTLE_MS:
		published_phase = 4
		_publish_phase("table-settled")


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
		"document.body.dataset.yakolakPreIntroShape='loading-star-to-approved-table';" +
		intro_wait_script,
		true
	)


func _smooth(value: float) -> float:
	var t: float = clampf(value, 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)
