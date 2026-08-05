extends Node

# Final motion correction pass:
# 1. Keep the Godot star in the same SVG orientation as the DOM star (no vertical mirror).
# 2. Replace the old spherical camera orbit with one direct eased path that always looks at the table.
# 3. Reveal the wall logo only near the end of the camera move, after both loader logos fade away.

const MATCH_HOLD_MS: float = 260.0
const MORPH_MS: float = 760.0
const SETTLE_MS: float = 220.0
const CAMERA_MOVE_MS: float = 900.0
const CAMERA_START_MS: float = MATCH_HOLD_MS + MORPH_MS + SETTLE_MS
const CAMERA_END_MS: float = CAMERA_START_MS + CAMERA_MOVE_MS
const MOTION_VERSION: String = "pixel-matched-2d-to-3d-v4"

var intro: Node3D
var preintro: Node
var camera: Camera3D
var tabletop: MeshInstance3D
var wall_logo: MeshInstance3D
var wall_logo_material: StandardMaterial3D
var orientation_corrected: bool = false
var published: bool = false


func _ready() -> void:
	process_priority = 250
	intro = get_parent() as Node3D
	preintro = intro.get_node_or_null("StarToTablePreIntro")
	set_process(true)


func _process(_delta: float) -> void:
	if intro == null or preintro == null:
		return

	if not orientation_corrected:
		orientation_corrected = _correct_svg_orientation_when_ready()
		if not orientation_corrected:
			return

	_publish_contract()
	if not published:
		published = true

	if bool(preintro.get("completed")):
		_set_wall_logo_alpha(1.0)
		set_process(false)
		return

	if not bool(preintro.get("handoff_started")):
		_set_wall_logo_alpha(0.0)
		return

	var started_msec: int = int(preintro.get("started_msec"))
	if started_msec <= 0:
		return
	var elapsed: float = float(Time.get_ticks_msec() - started_msec)
	if elapsed < CAMERA_START_MS:
		_set_wall_logo_alpha(0.0)
		return
	if elapsed > CAMERA_END_MS:
		_set_wall_logo_alpha(1.0)
		return

	_apply_direct_camera_move(elapsed)


func _correct_svg_orientation_when_ready() -> bool:
	if not bool(preintro.get("initialized")):
		return false
	camera = preintro.get("camera") as Camera3D
	tabletop = preintro.get("tabletop") as MeshInstance3D
	wall_logo = preintro.get("wall_logo") as MeshInstance3D
	if camera == null or tabletop == null or wall_logo == null:
		return false

	# +90° maps SVG down to screen down and points the table front toward the camera.
	# The previous -90° value mirrored the tooth pattern vertically.
	var svg_native_rotation := Quaternion(Vector3.RIGHT, deg_to_rad(90.0)).normalized()
	preintro.set("face_camera_rotation", svg_native_rotation)
	tabletop.quaternion = svg_native_rotation

	# Recalculate the projected center after correcting the face direction so the
	# DOM and Godot shapes share the same optical center, not only the same AABB.
	var local_center: Vector3 = tabletop.mesh.get_aabb().get_center()
	var corrected_center: Vector3 = tabletop.global_transform * local_center
	var corrected_match_position: Vector3 = corrected_center + Vector3(0.0, 0.0, 54.0)
	preintro.set("orbit_center", corrected_center)
	preintro.set("match_camera_position", corrected_match_position)

	# Make the final angle look at the same fixed center too. This removes the
	# previous second rotation track entirely, so the camera follows one direct path.
	var direct_final_position: Vector3 = preintro.get("final_camera_position") as Vector3
	camera.position = direct_final_position
	camera.look_at(corrected_center, Vector3.UP)
	preintro.set("final_camera_rotation", camera.quaternion.normalized())

	camera.position = corrected_match_position
	camera.look_at(corrected_center, Vector3.UP)
	preintro.set("match_camera_rotation", camera.quaternion.normalized())

	if wall_logo.material_override is StandardMaterial3D:
		wall_logo_material = (wall_logo.material_override as StandardMaterial3D).duplicate() as StandardMaterial3D
		wall_logo_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		wall_logo.material_override = wall_logo_material
		wall_logo.visible = true
		_set_wall_logo_alpha(0.0)

	print("YAKOLAK_REFINEMENT_READY shape=svg-native-unmirrored camera=direct-look-at logos=balanced-fade")
	return true


func _apply_direct_camera_move(elapsed: float) -> void:
	var t: float = _smootherstep((elapsed - CAMERA_START_MS) / CAMERA_MOVE_MS)
	var start_position: Vector3 = preintro.get("match_camera_position") as Vector3
	var end_position: Vector3 = preintro.get("final_camera_position") as Vector3
	var center: Vector3 = preintro.get("orbit_center") as Vector3
	var start_fov: float = float(preintro.get("match_camera_fov"))
	var end_fov: float = float(preintro.get("final_camera_fov"))

	# One direct translation and one fixed look target. There is no orbit arc and
	# no independent quaternion track, so the view cannot spin around the table.
	camera.position = start_position.lerp(end_position, t)
	camera.look_at(center, Vector3.UP)
	camera.fov = lerpf(start_fov, end_fov, t)

	# The wall identity appears only after the loader identities are gone.
	_set_wall_logo_alpha(_smootherstep(clampf((t - 0.62) / 0.38, 0.0, 1.0)))


func _set_wall_logo_alpha(value: float) -> void:
	if wall_logo_material == null:
		return
	var color: Color = wall_logo_material.albedo_color
	color.a = clampf(value, 0.0, 1.0)
	wall_logo_material.albedo_color = color


func _publish_contract() -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakShapeOrientation='svg-native-unmirrored';" +
		"document.body.dataset.yakolakCameraMotion='direct-centered-lerp';" +
		"document.body.dataset.yakolakMotion='" + MOTION_VERSION + "';",
		true
	)


func _smootherstep(value: float) -> float:
	var t: float = clampf(value, 0.0, 1.0)
	return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)
