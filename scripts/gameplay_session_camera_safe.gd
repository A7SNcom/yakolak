extends "res://scripts/gameplay_session_roundsafe.gd"

# Safe shared-device turn camera.
# Position and effective FOV are animated while the camera keeps looking at the board.
# The studio back wall is hidden only while a turn camera is behind it, because
# otherwise that opaque wall sits between the camera and the entire game scene.

const STUDIO_BACK_WALL_Z: float = -14.0
const STUDIO_WALL_SAFE_Z: float = -13.2

var turn_camera_start_position: Vector3 = Vector3.ZERO
var turn_camera_target_position: Vector3 = Vector3.ZERO
var turn_camera_focus: Vector3 = Vector3(0.0, 0.42, 0.0)
var turn_camera_start_fov: float = 50.0
# Base adaptive FOV for the viewport. GameplayCameraZoom uses this to preserve
# the user's relative zoom when the camera moves to another side.
var turn_camera_target_fov: float = 50.0
# Actual FOV reached by the motion after applying the user's zoom ratio.
var turn_camera_effective_fov: float = 50.0
var turn_camera_direction: String = ""
var turn_camera_active: bool = false
var web_play_move_callback: Variant


func _ready() -> void:
	super._ready()
	if OS.has_feature("web"):
		web_play_move_callback = JavaScriptBridge.create_callback(_on_web_play_one_move)
		var window: JavaScriptObject = JavaScriptBridge.get_interface("window")
		if window != null:
			window.set("yakolakTestPlayOneMove", web_play_move_callback)


func _transition_to_current_player() -> void:
	if camera == null or _current_mode() != "local":
		turn_camera_active = false
		super._transition_to_current_player()
		return

	var direction: String = _current_direction()
	var axis: Vector3 = DIRECTION_VECTORS.get(direction, Vector3(1.0, 0.0, 0.0)) as Vector3
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var aspect: float = viewport_size.x / maxf(viewport_size.y, 1.0)
	var portrait_weight: float = clampf((0.92 - aspect) / 0.46, 0.0, 1.0)
	var radius: float = lerpf(18.5, 28.0, portrait_weight)
	var height: float = lerpf(15.5, 23.0, portrait_weight)
	var target_fov: float = lerpf(50.0, 72.0, portrait_weight)

	turn_camera_direction = direction
	turn_camera_start_position = camera.position
	turn_camera_target_position = axis * radius + Vector3(0.0, height, 0.0)
	turn_camera_start_fov = camera.fov
	turn_camera_target_fov = target_fov
	turn_camera_effective_fov = _effective_turn_fov(target_fov)
	turn_camera_focus = Vector3(0.0, 0.42, 0.0)
	turn_camera_active = true
	camera_transition = true
	camera.current = true
	_ensure_game_scene_visible()

	# The single studio wall lives at z=-14. A back-side player camera ends at
	# z=-18.5 (or farther on portrait), so the wall would completely occlude the
	# board. Keep it hidden for the whole crossing whenever either endpoint is
	# behind the wall. It is restored after reaching a safe side again.
	var crosses_back_wall: bool = turn_camera_start_position.z < STUDIO_WALL_SAFE_Z or turn_camera_target_position.z < STUDIO_WALL_SAFE_Z
	_set_studio_backdrop_visible(not crosses_back_wall)

	if camera_tween != null and camera_tween.is_valid():
		camera_tween.kill()
	camera_tween = create_tween()
	camera_tween.tween_method(Callable(self, "_apply_turn_camera_progress"), 0.0, 1.0, CAMERA_TRANSITION).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	camera_tween.finished.connect(_finish_camera_transition)
	_apply_turn_camera_progress(0.0)
	_publish_match_state("camera-transition")
	_publish_turn_camera(direction, aspect, radius, height, target_fov)
	_publish_effective_turn_fov(target_fov, turn_camera_effective_fov)
	_publish_camera_health("start")


func _effective_turn_fov(base_fov: float) -> float:
	if intro == null:
		return base_fov
	var zoom_controller: Node = intro.get_node_or_null("GameplayCameraZoom")
	if zoom_controller != null and zoom_controller.has_method("effective_fov_for_base"):
		return float(zoom_controller.call("effective_fov_for_base", base_fov))
	return base_fov


func _apply_turn_camera_progress(progress: float) -> void:
	if not turn_camera_active or camera == null:
		return
	var t: float = clampf(progress, 0.0, 1.0)
	camera.position = turn_camera_start_position.lerp(turn_camera_target_position, t)
	camera.fov = lerpf(turn_camera_start_fov, turn_camera_effective_fov, t)
	camera.current = true
	camera.look_at(turn_camera_focus, Vector3.UP)


func _finish_camera_transition() -> void:
	if turn_camera_active and camera != null:
		camera.position = turn_camera_target_position
		camera.fov = turn_camera_effective_fov
		camera.current = true
		camera.look_at(turn_camera_focus, Vector3.UP)
		_ensure_game_scene_visible()
		# Back-side cameras must keep the wall hidden. Other sides can safely use
		# the approved studio wall again as their background.
		_set_studio_backdrop_visible(camera.position.z >= STUDIO_WALL_SAFE_Z)
		_publish_camera_health("finished")
	turn_camera_active = false
	super._finish_camera_transition()
	_publish_test_targets.call_deferred()


func _ensure_game_scene_visible() -> void:
	if intro == null:
		return
	for node_name: String in ["Board", "ApprovedStarTableSVG", "ApprovedStarTablePedestal", "StudioFloor"]:
		var geometry := intro.get_node_or_null(node_name) as GeometryInstance3D
		if geometry != null:
			geometry.visible = true
	_sync_active_sides()


func _set_studio_backdrop_visible(value: bool) -> void:
	if intro == null:
		return
	var wall := intro.get_node_or_null("StudioBackWall") as GeometryInstance3D
	if wall != null:
		wall.visible = value
	var logo := intro.get_node_or_null("StudioWallLogo") as GeometryInstance3D
	if logo != null:
		logo.visible = value
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakStudioBackdrop='%s';" % ("visible" if value else "hidden-for-camera"), true)


func _publish_effective_turn_fov(base_fov: float, effective_fov: float) -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakTurnBaseFov='%.3f';" % base_fov +
		"document.body.dataset.yakolakTurnEffectiveFov='%.3f';" % effective_fov,
		true
	)


func _publish_camera_health(stage: String) -> void:
	if not OS.has_feature("web") or camera == null or intro == null:
		return
	var focus_global: Vector3 = intro.to_global(turn_camera_focus)
	var toward_focus: Vector3 = focus_global - camera.global_position
	var facing: float = 0.0
	if toward_focus.length_squared() > 0.000001:
		var forward: Vector3 = -camera.global_transform.basis.z.normalized()
		facing = forward.dot(toward_focus.normalized())
	var focus_screen: Vector2 = camera.unproject_position(focus_global)
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var focus_inside: bool = focus_screen.x >= 0.0 and focus_screen.x <= viewport_size.x and focus_screen.y >= 0.0 and focus_screen.y <= viewport_size.y
	var board := intro.get_node_or_null("Board") as GeometryInstance3D
	var board_visible: bool = board != null and board.is_visible_in_tree()
	var wall := intro.get_node_or_null("StudioBackWall") as GeometryInstance3D
	var wall_visible: bool = wall != null and wall.is_visible_in_tree()
	var viewport_camera: Camera3D = get_viewport().get_camera_3d()
	var viewport_owns_camera: bool = viewport_camera == camera
	var finished_fov_script: String = ""
	if stage == "finished":
		finished_fov_script = "document.body.dataset.yakolakCameraTransitionFinishedFov='%.3f';" % camera.fov
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakCameraStage='%s';" % stage +
		"document.body.dataset.yakolakCameraCurrent='%s';" % ("true" if camera.current else "false") +
		"document.body.dataset.yakolakViewportCamera='%s';" % ("true" if viewport_owns_camera else "false") +
		"document.body.dataset.yakolakCameraFacing='%.5f';" % facing +
		"document.body.dataset.yakolakCameraFocusInside='%s';" % ("true" if focus_inside else "false") +
		"document.body.dataset.yakolakCameraZ='%.3f';" % camera.position.z +
		"document.body.dataset.yakolakCameraFov='%.3f';" % camera.fov +
		"document.body.dataset.yakolakBoardVisible='%s';" % ("true" if board_visible else "false") +
		"document.body.dataset.yakolakBackWallVisible='%s';" % ("true" if wall_visible else "false") +
		finished_fov_script,
		true
	)
	print("YAKOLAK_TURN_CAMERA_SAFE stage=%s dir=%s current=%s viewport_camera=%s board=%s wall=%s camera_z=%.3f fov=%.3f wall_z=%.1f facing=%.5f focus_inside=%s" % [stage, turn_camera_direction, str(camera.current), str(viewport_owns_camera), str(board_visible), str(wall_visible), camera.position.z, camera.fov, STUDIO_BACK_WALL_Z, facing, str(focus_inside)])


func _publish_test_targets() -> void:
	if not gameplay_ready or camera == null or players.is_empty():
		return
	var direction: String = _current_direction()
	var sample_index: int = -1
	var sample_cell: int = -1
	for size_name: String in ["large", "medium", "small"]:
		var legal_cell: int = _first_legal_cell_for_size(size_name)
		if legal_cell < 0:
			continue
		for index: int in range(piece_records.size()):
			var record: Dictionary = piece_records[index] as Dictionary
			if bool(record.get("played", false)) or str(record.get("dir", "")) != direction or str(record.get("type", "")) != size_name:
				continue
			sample_index = index
			sample_cell = legal_cell
			break
		if sample_index >= 0:
			break
	if sample_index < 0 or sample_cell < 0:
		return

	var sample_record: Dictionary = piece_records[sample_index] as Dictionary
	var sample_mesh := sample_record.get("mesh") as MeshInstance3D
	if sample_mesh == null:
		return
	var size_name: String = str(sample_record.get("type", "large"))
	var probe: Vector3 = Vector3(17.0, 0.0, 9.5)
	if size_name == "medium":
		probe = Vector3(12.0, 0.0, 7.0)
	elif size_name == "small":
		probe = Vector3(7.0, 0.0, 4.0)
	var piece_screen: Vector2 = camera.unproject_position(sample_mesh.to_global(probe))
	var raw_cell: Vector3 = CELL_COORDS[sample_cell]
	var cell_screen: Vector2 = camera.unproject_position(Vector3(raw_cell.x * U, 0.52, raw_cell.z * U))
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakTestPieceX='%.3f';" % piece_screen.x +
			"document.body.dataset.yakolakTestPieceY='%.3f';" % piece_screen.y +
			"document.body.dataset.yakolakTestCellX='%.3f';" % cell_screen.x +
			"document.body.dataset.yakolakTestCellY='%.3f';" % cell_screen.y +
			"document.body.dataset.yakolakTestPiece='%s';" % str(sample_mesh.name) +
			"document.body.dataset.yakolakTestCurrentDirection='%s';" % direction +
			"document.body.dataset.yakolakTestCell='%d';" % sample_cell,
			true
		)
	_publish_camera_health("ready")


func _first_legal_cell_for_size(size_name: String) -> int:
	for cell: int in range(CELL_COORDS.size()):
		if _is_legal_cell(cell, size_name):
			return cell
	return -1


func _on_web_play_one_move(_arguments: Array) -> void:
	# Return to the browser before the real move path publishes UI state back
	# through JavaScriptBridge. Re-entering JS from inside its callback can hide
	# the deterministic submitting-move state used to verify online correctness.
	call_deferred("_play_one_move_for_test")


func _play_one_move_for_test() -> void:
	if not match_initialized or round_complete or not gameplay_ready or _current_mode() != "local":
		return
	var direction: String = _current_direction()
	var piece_index: int = -1
	for size_name: String in ["large", "medium", "small"]:
		if _first_legal_cell_for_size(size_name) < 0:
			continue
		for index: int in range(piece_records.size()):
			var record: Dictionary = piece_records[index] as Dictionary
			if not bool(record.get("played", false)) and str(record.get("dir", "")) == direction and str(record.get("type", "")) == size_name:
				piece_index = index
				break
		if piece_index >= 0:
			break
	if piece_index < 0:
		return
	_select_piece(piece_index)
	var cell: int = _first_legal_cell_for_size(_selected_size())
	if cell >= 0:
		_begin_move(cell)