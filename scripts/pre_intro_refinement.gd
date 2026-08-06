extends Node

# Final motion correction pass:
# 1. Keep the DOM and Godot stars on the same canonical SVG contour and orientation.
# 2. Coordinate table tilt and camera travel as one slower direct move while dynamically
#    preserving safe screen framing, preventing the old giant close-up.
# 3. Reveal the wall identity only after both loader identities have faded away.

const MATCH_HOLD_MS: float = 260.0
const MORPH_MS: float = 980.0
const SETTLE_MS: float = 300.0
const CAMERA_MOVE_MS: float = 1250.0
const CAMERA_START_MS: float = MATCH_HOLD_MS + MORPH_MS + SETTLE_MS
const CAMERA_END_MS: float = CAMERA_START_MS + CAMERA_MOVE_MS
const SAFE_WIDTH_RATIO: float = 0.90
const SAFE_HEIGHT_RATIO: float = 0.76
const CAMERA_FIT_MARGIN: float = 1.006
const MAX_CAMERA_FIT_PASSES: int = 4
const MOTION_VERSION: String = "pixel-matched-direct-slow-safe-framing-v7"

var intro: Node3D
var preintro: Node
var camera: Camera3D
var tabletop: MeshInstance3D
var pedestal: MeshInstance3D
var wall_logo: MeshInstance3D
var wall_logo_material: StandardMaterial3D
var orientation_corrected: bool = false
var published: bool = false
var coverage_published: bool = false
var max_screen_coverage: float = 0.0
var final_screen_coverage: float = 0.0
var final_table_scale: Vector3
var final_pedestal_scale: Vector3
var final_rotation: Quaternion
var face_camera_rotation: Quaternion
var approved_final_camera_position: Vector3
var responsive_final_camera_position: Vector3
var responsive_final_camera_rotation: Quaternion
var final_camera_fov: float


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

	if not published:
		_publish_contract()
		published = true

	if bool(preintro.get("completed")):
		_restore_final_geometry()
		_set_wall_logo_alpha(1.0)
		_publish_max_coverage()
		set_process(false)
		return

	if not bool(preintro.get("handoff_started")):
		_set_wall_logo_alpha(0.0)
		return

	var elapsed: float = float(preintro.get("governed_elapsed_ms"))
	if elapsed < 0.0:
		return
	if elapsed < CAMERA_START_MS:
		_set_wall_logo_alpha(0.0)
		return
	if elapsed > CAMERA_END_MS:
		_restore_final_geometry()
		_set_wall_logo_alpha(1.0)
		_publish_max_coverage()
		set_process(false)
		return

	_apply_direct_safe_move(elapsed)


func _correct_svg_orientation_when_ready() -> bool:
	if not bool(preintro.get("initialized")):
		return false
	camera = preintro.get("camera") as Camera3D
	tabletop = preintro.get("tabletop") as MeshInstance3D
	pedestal = preintro.get("pedestal") as MeshInstance3D
	wall_logo = preintro.get("wall_logo") as MeshInstance3D
	if camera == null or tabletop == null or pedestal == null or wall_logo == null:
		return false

	# This is the sole 2D-to-3D contour orientation. No later rotation offset is added.
	face_camera_rotation = Quaternion(Vector3.RIGHT, deg_to_rad(90.0)).normalized()
	preintro.set("face_camera_rotation", face_camera_rotation)
	tabletop.quaternion = face_camera_rotation
	final_table_scale = preintro.get("final_table_scale") as Vector3
	final_pedestal_scale = preintro.get("final_pedestal_scale") as Vector3
	final_rotation = preintro.get("final_rotation") as Quaternion
	approved_final_camera_position = preintro.get("final_camera_position") as Vector3
	final_camera_fov = float(preintro.get("final_camera_fov"))

	# Recalculate from the corrected contour so both stars share one optical center.
	var local_center: Vector3 = tabletop.mesh.get_aabb().get_center()
	var corrected_center: Vector3 = tabletop.global_transform * local_center
	var corrected_match_position: Vector3 = corrected_center + Vector3(0.0, 0.0, 54.0)
	preintro.set("orbit_center", corrected_center)
	preintro.set("match_camera_position", corrected_match_position)

	# Build a responsive final camera endpoint with the canonical table scale intact.
	# Small screens move the camera farther away instead of shrinking the table and
	# restoring it later, which eliminates the abrupt pre-box zoom/crop.
	tabletop.quaternion = final_rotation
	tabletop.scale = final_table_scale
	camera.position = approved_final_camera_position
	camera.fov = final_camera_fov
	camera.look_at(corrected_center, Vector3.UP)
	final_screen_coverage = _apply_safe_optical_framing()
	responsive_final_camera_position = camera.position
	responsive_final_camera_rotation = camera.quaternion.normalized()
	preintro.set("final_camera_position", responsive_final_camera_position)
	preintro.set("final_camera_rotation", responsive_final_camera_rotation)

	# Return to the exact matched 2D pose before the visible handoff begins.
	tabletop.quaternion = face_camera_rotation
	tabletop.scale = final_table_scale
	camera.position = corrected_match_position
	camera.fov = float(preintro.get("match_camera_fov"))
	camera.look_at(corrected_center, Vector3.UP)
	preintro.set("match_camera_rotation", camera.quaternion.normalized())

	if wall_logo.material_override is StandardMaterial3D:
		wall_logo_material = (wall_logo.material_override as StandardMaterial3D).duplicate() as StandardMaterial3D
		wall_logo_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		wall_logo.material_override = wall_logo_material
		wall_logo.visible = true
		_set_wall_logo_alpha(0.0)

	print("YAKOLAK_REFINEMENT_READY shape=canonical-shared-svg camera=direct-slow-safe-framed table=coordinated logos=balanced-fade")
	return true


func _apply_direct_safe_move(elapsed: float) -> void:
	var raw_t: float = clampf((elapsed - CAMERA_START_MS) / CAMERA_MOVE_MS, 0.0, 1.0)
	var t: float = _smootherstep(raw_t)
	var start_position: Vector3 = preintro.get("match_camera_position") as Vector3
	var end_position: Vector3 = preintro.get("final_camera_position") as Vector3
	var center: Vector3 = preintro.get("orbit_center") as Vector3
	var start_fov: float = float(preintro.get("match_camera_fov"))
	var end_fov: float = float(preintro.get("final_camera_fov"))

	# Follow the direct chord direction but interpolate one stable radial distance.
	# Removing the old hard max switch prevents the mid-move speed kink.
	var start_offset: Vector3 = start_position - center
	var end_offset: Vector3 = end_position - center
	var start_distance: float = maxf(start_offset.length(), 0.001)
	var end_distance: float = maxf(end_offset.length(), 0.001)
	var direct_position: Vector3 = start_position.lerp(end_position, t)
	var direct_offset: Vector3 = direct_position - center
	var direct_direction: Vector3 = direct_offset.normalized() if direct_offset.length_squared() > 0.000001 else start_offset.normalized()
	var safe_distance: float = lerpf(start_distance, end_distance, t)
	camera.position = center + direct_direction * safe_distance
	camera.look_at(center, Vector3.UP)
	camera.fov = lerpf(start_fov, end_fov, t)

	# Tilt on almost the same timeline as the camera, rather than finishing early.
	var table_t: float = _smootherstep(clampf((raw_t - 0.04) / 0.92, 0.0, 1.0))
	tabletop.quaternion = face_camera_rotation.slerp(final_rotation, table_t).normalized()
	# The approved geometry scale is fixed for the entire transition. Responsive
	# fitting is camera-only so there can be no hidden scale restoration jump.
	tabletop.scale = final_table_scale
	_apply_safe_optical_framing()

	pedestal.scale.x = final_pedestal_scale.x
	pedestal.scale.z = final_pedestal_scale.z
	if raw_t < 0.58:
		pedestal.visible = false

	_set_wall_logo_alpha(_smootherstep(clampf((raw_t - 0.76) / 0.24, 0.0, 1.0)))


func _apply_safe_optical_framing() -> float:
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	if viewport_size.x < 1.0 or viewport_size.y < 1.0:
		return 0.0

	var center: Vector3 = preintro.get("orbit_center") as Vector3
	for _pass: int in range(MAX_CAMERA_FIT_PASSES):
		var projected: Rect2 = preintro.call("_projected_rect", tabletop) as Rect2
		if projected.size.x < 1.0 or projected.size.y < 1.0:
			return 0.0
		var width_ratio: float = projected.size.x / viewport_size.x
		var height_ratio: float = projected.size.y / viewport_size.y
		var required_distance_scale: float = maxf(
			width_ratio / SAFE_WIDTH_RATIO,
			height_ratio / SAFE_HEIGHT_RATIO
		)
		if required_distance_scale <= 1.0005:
			break
		var offset: Vector3 = camera.position - center
		if offset.length_squared() <= 0.000001:
			break
		camera.position = center + offset * required_distance_scale * CAMERA_FIT_MARGIN
		camera.look_at(center, Vector3.UP)

	var fitted: Rect2 = preintro.call("_projected_rect", tabletop) as Rect2
	if fitted.size.x < 1.0 or fitted.size.y < 1.0:
		return 0.0
	var fitted_width: float = fitted.size.x / viewport_size.x
	var fitted_height: float = fitted.size.y / viewport_size.y
	var coverage: float = maxf(fitted_width, fitted_height)
	max_screen_coverage = maxf(max_screen_coverage, coverage)
	return coverage


func _restore_final_geometry() -> void:
	tabletop.quaternion = final_rotation
	tabletop.scale = final_table_scale
	pedestal.scale.x = final_pedestal_scale.x
	pedestal.scale.z = final_pedestal_scale.z

	# Refit against the current mobile viewport because browser bars/orientation can
	# alter the usable canvas during loading. The endpoint remains continuous and
	# the table never changes scale.
	camera.position = responsive_final_camera_position
	camera.fov = final_camera_fov
	camera.look_at(preintro.get("orbit_center") as Vector3, Vector3.UP)
	final_screen_coverage = _apply_safe_optical_framing()
	responsive_final_camera_position = camera.position
	responsive_final_camera_rotation = camera.quaternion.normalized()
	preintro.set("final_camera_position", responsive_final_camera_position)
	preintro.set("final_camera_rotation", responsive_final_camera_rotation)


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
		"document.body.dataset.yakolakShapeOrientation='canonical-shared-svg';" +
		"document.body.dataset.yakolakCameraMotion='direct-slow-safe-framed';" +
		"document.body.dataset.yakolakCameraDuration='" + str(int(CAMERA_MOVE_MS)) + "';" +
		"document.body.dataset.yakolakResponsiveFraming='camera-distance-only';" +
		"document.body.dataset.yakolakTableScalePolicy='fixed-approved-scale';" +
		"document.body.dataset.yakolakMotion='" + MOTION_VERSION + "';",
		true
	)


func _publish_max_coverage() -> void:
	if coverage_published:
		return
	coverage_published = true
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakCameraMaxCoverage='" + str(max_screen_coverage) + "';" +
		"document.body.dataset.yakolakCameraFinalCoverage='" + str(final_screen_coverage) + "';",
		true
	)


func _smootherstep(value: float) -> float:
	var t: float = clampf(value, 0.0, 1.0)
	return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)
