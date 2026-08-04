extends Node

# Deterministic wall-clock intro director.
# It never waits on Tween completion, so slow WebGL frames cannot stall the sequence.

const SIDE_ORDER := ["right", "left", "front", "back"]
const INTRO_TOTAL_SECONDS := 14.35
const CAMERA_START_SECONDS := 1.10
const CAMERA_END_SECONDS := 3.30
const LID_SHAKE_START := 3.92
const LID_SHAKE_END := 4.34
const LID_LIFT_END := 5.24
const SIDE_START := 5.24
const SIDE_SPAN := 2.20
const BASE_DURATION := 1.16
const PIECE_LEAD := 0.36
const PIECE_DURATION := 0.85
const PIECE_STAGGER := 0.042

var intro: Node
var initialized := false
var finished := false
var started_ms := 0

var camera_start: Transform3D
var camera_end: Transform3D
var star_position := Vector3.ZERO
var star_scale := Vector3.ONE
var star_rotation := Vector3.ZERO
var lid_position := Vector3.ZERO
var lid_rotation := Vector3.ZERO

var base_states := {}
var piece_states := {}
var side_pieces := {}


func _enter_tree() -> void:
	intro = get_parent()
	if intro != null:
		# Stop the old deferred coroutine before its first awaited frame finishes.
		intro.set("sequence_cancelled", true)


func _ready() -> void:
	set_process(true)


func _process(_delta: float) -> void:
	if finished:
		return
	if not initialized:
		if not _can_initialize():
			return
		_capture_initial_state()
		initialized = true
		started_ms = Time.get_ticks_msec()
		print("YAKOLAK_INTRO_DIRECTOR_STARTED")

	var elapsed := float(Time.get_ticks_msec() - started_ms) / 1000.0
	_apply_star(elapsed)
	_apply_camera(elapsed)
	_apply_lid(elapsed)
	_apply_assemblies(elapsed)

	if elapsed >= INTRO_TOTAL_SECONDS:
		_finish_naturally()


func _can_initialize() -> bool:
	if intro == null:
		return false
	var camera_value = intro.get("camera")
	var star_value = intro.get("wall_star")
	var lid_value = intro.get("lid")
	var bases_value = intro.get("bases")
	var pieces_value = intro.get("pieces")
	return (
		camera_value is Camera3D
		and star_value is Sprite3D
		and lid_value is MeshInstance3D
		and bases_value is Dictionary
		and (bases_value as Dictionary).size() == 4
		and pieces_value is Array
		and (pieces_value as Array).size() == 36
	)


func _capture_initial_state() -> void:
	var camera_node := intro.get("camera") as Camera3D
	var star_node := intro.get("wall_star") as Sprite3D
	var lid_node := intro.get("lid") as MeshInstance3D
	camera_start = camera_node.transform
	camera_end = intro.call("_play_camera_transform") as Transform3D
	star_position = star_node.position
	star_scale = star_node.scale
	star_rotation = star_node.rotation_degrees
	lid_position = lid_node.position
	lid_rotation = lid_node.rotation_degrees

	for side in SIDE_ORDER:
		var base: MeshInstance3D = (intro.get("bases") as Dictionary)[side]
		base_states[side] = {
			"position": base.position,
			"scale": base.scale,
			"target": base.get_meta("target_position") as Vector3,
		}
		side_pieces[side] = []

	for piece_value in intro.get("pieces") as Array:
		var piece := piece_value as MeshInstance3D
		var side := String(piece.get_meta("side"))
		piece_states[piece.get_instance_id()] = {
			"position": piece.position,
			"rotation": piece.rotation_degrees,
			"target": piece.get_meta("target_position") as Vector3,
		}
		(side_pieces[side] as Array).append(piece)


func _apply_star(elapsed: float) -> void:
	var star_node := intro.get("wall_star") as Sprite3D
	if elapsed >= 0.82:
		star_node.position = star_position
		star_node.scale = star_scale
		star_node.rotation_degrees = star_rotation
		return

	var progress := clampf(elapsed / 0.82, 0.0, 1.0)
	var bounce := sin(progress * TAU)
	var lift := maxf(0.0, sin(progress * PI)) * 1.4
	var squash := 1.0 - 0.12 * absf(bounce)
	star_node.position = star_position + Vector3(0.0, lift, 0.0)
	star_node.scale = star_scale * Vector3(1.0 + (1.0 - squash) * 0.65, squash, 1.0)
	star_node.rotation_degrees = star_rotation + Vector3(0.0, 0.0, sin(progress * PI) * 24.0)


func _apply_camera(elapsed: float) -> void:
	var camera_node := intro.get("camera") as Camera3D
	var progress := _smooth_range(elapsed, CAMERA_START_SECONDS, CAMERA_END_SECONDS)
	camera_node.transform = camera_start.interpolate_with(camera_end, progress)


func _apply_lid(elapsed: float) -> void:
	var lid_node := intro.get("lid") as MeshInstance3D
	if elapsed < LID_SHAKE_START:
		lid_node.visible = true
		lid_node.position = lid_position
		lid_node.rotation_degrees = lid_rotation
		return

	if elapsed < LID_SHAKE_END:
		var shake_progress := (elapsed - LID_SHAKE_START) / (LID_SHAKE_END - LID_SHAKE_START)
		var shake_angle := sin(shake_progress * TAU * 3.0) * (1.0 - shake_progress) * 5.0
		lid_node.visible = true
		lid_node.position = lid_position
		lid_node.rotation_degrees = lid_rotation + Vector3(0.0, 0.0, shake_angle)
		return

	if elapsed < LID_LIFT_END:
		var lift_progress := _smooth_range(elapsed, LID_SHAKE_END, LID_LIFT_END)
		lid_node.visible = true
		lid_node.position = lid_position + Vector3(0.0, 29.6 * lift_progress, 0.0)
		lid_node.rotation_degrees = lid_rotation + Vector3(0.0, 18.0, 5.0) * lift_progress
		return

	lid_node.visible = false


func _apply_assemblies(elapsed: float) -> void:
	for side_index in range(SIDE_ORDER.size()):
		var side: String = SIDE_ORDER[side_index]
		var side_time := SIDE_START + float(side_index) * SIDE_SPAN
		_apply_base(side, elapsed, side_time)
		_apply_side_pieces(side, elapsed, side_time)


func _apply_base(side: String, elapsed: float, side_time: float) -> void:
	var base: MeshInstance3D = (intro.get("bases") as Dictionary)[side]
	var state: Dictionary = base_states[side]
	var progress := _smooth_range(elapsed, side_time, side_time + BASE_DURATION)
	var start_position: Vector3 = state["position"]
	var target_position: Vector3 = state["target"]
	var start_scale: Vector3 = state["scale"]
	var target_scale := Vector3.ONE * 0.04
	base.position = start_position.lerp(target_position, progress)
	base.position.y += sin(progress * PI) * 1.6
	base.scale = start_scale.lerp(target_scale, progress)


func _apply_side_pieces(side: String, elapsed: float, side_time: float) -> void:
	var pieces_for_side: Array = side_pieces[side]
	for index in range(pieces_for_side.size()):
		var piece := pieces_for_side[index] as MeshInstance3D
		var state: Dictionary = piece_states[piece.get_instance_id()]
		var piece_start := side_time + PIECE_LEAD + float(index) * PIECE_STAGGER
		var progress := _smooth_range(elapsed, piece_start, piece_start + PIECE_DURATION)
		var start_position: Vector3 = state["position"]
		var target_position: Vector3 = state["target"]
		var start_rotation: Vector3 = state["rotation"]
		piece.position = start_position.lerp(target_position, progress)
		piece.position.y += sin(progress * PI) * 1.2
		piece.rotation_degrees = start_rotation.lerp(Vector3.ZERO, progress)


func _smooth_range(value: float, start_value: float, end_value: float) -> float:
	if value <= start_value:
		return 0.0
	if value >= end_value:
		return 1.0
	var progress := (value - start_value) / (end_value - start_value)
	return progress * progress * (3.0 - 2.0 * progress)


func _finish_naturally() -> void:
	if finished:
		return
	finished = true
	intro.call("_snap_final")
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakDirector = 'complete';", true)
	print("YAKOLAK_INTRO_DIRECTOR_COMPLETE")
	set_process(false)
