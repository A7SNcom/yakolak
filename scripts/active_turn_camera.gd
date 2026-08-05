extends Node

# Keeps the active player's complete base and the board visible on portrait screens.
# Gameplay pauses during the short transition, then the 18-second clock starts.

const PLAYER_DIRECTIONS: Array[String] = ["right", "back", "left", "front"]
const DIRECTION_VECTORS: Dictionary = {
	"right": Vector3(1.0, 0.0, 0.0),
	"back": Vector3(0.0, 0.0, -1.0),
	"left": Vector3(-1.0, 0.0, 0.0),
	"front": Vector3(0.0, 0.0, 1.0),
}
const TURN_DURATION_MS: int = 18000
const TRANSITION_DURATION: float = 0.52
const CAMERA_DISTANCE: float = 18.5
const CAMERA_HEIGHT: float = 15.5
const LOOK_OFFSET: float = 2.35
const MIN_GAMEPLAY_FOV: float = 48.0
const MAX_GAMEPLAY_FOV: float = 64.0
const SAFE_MARGIN: float = 22.0

var intro: Node3D
var match_controller: Node
var camera: Camera3D
var observed_player_index: int = -1
var observed_round: int = -1
var transition_active: bool = false
var transition_tween: Tween


func _ready() -> void:
	process_priority = 30
	intro = get_parent() as Node3D
	if not get_viewport().size_changed.is_connected(_on_viewport_resized):
		get_viewport().size_changed.connect(_on_viewport_resized)
	set_process(true)


func _process(_delta: float) -> void:
	if not _resolve_dependencies():
		return
	if not bool(match_controller.get("match_initialized")):
		observed_player_index = -1
		observed_round = -1
		transition_active = false
		return
	if transition_active or bool(match_controller.get("round_complete")):
		return

	var player_index: int = int(match_controller.get("current_player_index"))
	var round_number: int = int(match_controller.get("round_number"))
	if bool(match_controller.get("gameplay_ready")) and (player_index != observed_player_index or round_number != observed_round):
		observed_player_index = player_index
		observed_round = round_number
		_transition_to_player(player_index)


func _resolve_dependencies() -> bool:
	if intro == null:
		return false
	if match_controller == null:
		match_controller = intro.get_node_or_null("LocalMatchGameplay")
	if camera == null:
		camera = intro.get("camera") as Camera3D
	return match_controller != null and camera != null


func _transition_to_player(player_index: int) -> void:
	if player_index < 0 or player_index >= PLAYER_DIRECTIONS.size():
		return
	var direction: String = PLAYER_DIRECTIONS[player_index]
	var axis: Vector3 = DIRECTION_VECTORS[direction] as Vector3
	var target_position: Vector3 = axis * CAMERA_DISTANCE + Vector3(0.0, CAMERA_HEIGHT, 0.0)
	var look_target: Vector3 = axis * LOOK_OFFSET + Vector3(0.0, 0.36, 0.0)
	var target_transform := Transform3D(Basis.IDENTITY, target_position).looking_at(look_target, Vector3.UP)
	var target_quaternion: Quaternion = target_transform.basis.get_rotation_quaternion()

	transition_active = true
	match_controller.set("gameplay_ready", false)
	match_controller.set("turn_deadline_msec", 0)
	match_controller.call("_clear_selection")
	match_controller.call("_update_hud")
	match_controller.call("_publish_match_state", "camera-transition")

	if transition_tween != null and transition_tween.is_valid():
		transition_tween.kill()
	transition_tween = create_tween()
	transition_tween.set_parallel(true)
	transition_tween.tween_property(camera, "position", target_position, TRANSITION_DURATION).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	transition_tween.tween_property(camera, "quaternion", target_quaternion, TRANSITION_DURATION).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	transition_tween.tween_property(camera, "fov", MIN_GAMEPLAY_FOV, TRANSITION_DURATION).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	transition_tween.finished.connect(_finish_transition.bind(player_index, direction))
	print("YAKOLAK_TURN_CAMERA_MOVING player=%s" % direction)


func _finish_transition(player_index: int, direction: String) -> void:
	transition_active = false
	if not _resolve_dependencies() or not bool(match_controller.get("match_initialized")):
		return
	if bool(match_controller.get("round_complete")) or int(match_controller.get("current_player_index")) != player_index:
		return

	var all_visible: bool = _fit_active_content(direction)
	match_controller.set("gameplay_ready", true)
	match_controller.set("turn_deadline_msec", Time.get_ticks_msec() + TURN_DURATION_MS)
	match_controller.set("last_hud_second", -1)
	match_controller.call("_update_hud")
	match_controller.call("_publish_match_state", "turn")
	match_controller.call_deferred("_publish_test_targets")
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakTurnCamera='%s';" % direction +
			"document.body.dataset.yakolakTurnCameraVisible='%s';" % ("true" if all_visible else "false"),
			true
		)
	print("YAKOLAK_TURN_CAMERA_READY player=%s fov=%.1f all_visible=%s" % [direction, camera.fov, str(all_visible)])


func _fit_active_content(direction: String) -> bool:
	camera.fov = MIN_GAMEPLAY_FOV
	for _attempt: int in range(8):
		if _all_active_content_visible(direction):
			return true
		camera.fov = minf(camera.fov + 2.0, MAX_GAMEPLAY_FOV)
	return _all_active_content_visible(direction)


func _all_active_content_visible(direction: String) -> bool:
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var records_value: Variant = match_controller.get("piece_records")
	if not records_value is Array:
		return false
	var records: Array = records_value as Array
	var found_piece: bool = false
	for index: int in range(records.size()):
		var record: Dictionary = records[index] as Dictionary
		if bool(record.get("played", false)) or str(record.get("dir", "")) != direction:
			continue
		found_piece = true
		var point: Vector2 = match_controller.call("_piece_screen_point", index, str(record.get("type", ""))) as Vector2
		if not _inside_safe_frame(point, viewport_size):
			return false

	var cell_coords_value: Variant = match_controller.get("CELL_COORDS")
	# Constants are not reflected as properties; use the official 3x3 board corners.
	var board_points: Array[Vector3] = [
		Vector3(-48.0, 2.0, -48.0), Vector3(48.0, 2.0, -48.0),
		Vector3(-48.0, 2.0, 48.0), Vector3(48.0, 2.0, 48.0),
	]
	for raw_point: Vector3 in board_points:
		var screen_point: Vector2 = camera.unproject_position(Vector3(raw_point.x * 0.04, 0.52, raw_point.z * 0.04))
		if not _inside_safe_frame(screen_point, viewport_size):
			return false
	return found_piece


func _inside_safe_frame(point: Vector2, viewport_size: Vector2) -> bool:
	return point.x >= SAFE_MARGIN and point.x <= viewport_size.x - SAFE_MARGIN and point.y >= SAFE_MARGIN and point.y <= viewport_size.y - SAFE_MARGIN


func _on_viewport_resized() -> void:
	observed_player_index = -1
	observed_round = -1
