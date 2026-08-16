extends "res://scripts/gameplay_authoritative_turn_state.gd"

# UX-TURN-40: authoritative turn/lifecycle revisions own presentation retargeting.
# Authority, room reconciliation, move validation, and network retry behavior stay
# in the inherited layers. This final production layer only cancels/retargets
# camera + selection presentation; lighting and the compact indicator already
# consume the same monotonic authoritative signal in their own single owners.

var turn_presentation_applied_revision: int = -1
var turn_presentation_serial: int = 0
var turn_presentation_target_direction: String = ""
var turn_presentation_settled_direction: String = ""
var turn_presentation_retarget_count: int = 0
var turn_presentation_cancel_count: int = 0
var turn_presentation_stale_finish_count: int = 0


func _transition_to_current_player() -> void:
	# Online presentation starts only after the authoritative room snapshot is
	# published. Offline/shared-device play keeps its established camera/tutorial
	# lifecycle untouched.
	if online_active:
		return
	super._transition_to_current_player()


func _publish_authoritative_turn_state(lifecycle: String) -> void:
	super._publish_authoritative_turn_state(lifecycle)
	# UX-TURN-40 is deliberately scoped to accepted online authority. Offline
	# presentation remains owned by the inherited gameplay camera path.
	if not online_active or authoritative_turn_cached_snapshot.is_empty():
		return
	_retarget_authoritative_turn_presentation(authoritative_turn_cached_snapshot.duplicate(true))


func _retarget_authoritative_turn_presentation(snapshot: Dictionary) -> void:
	var revision: int = int(snapshot.get("revision", -1))
	if revision >= 0 and revision <= turn_presentation_applied_revision:
		return
	if revision >= 0:
		turn_presentation_applied_revision = revision

	_cancel_stale_selection_presentation()

	if not bool(snapshot.get("valid", false)):
		_cancel_turn_camera_presentation(revision, str(snapshot.get("lifecycle", "no-turn")))
		return

	var direction: String = str(snapshot.get("direction", ""))
	if not DIRECTION_VECTORS.has(direction) or camera == null:
		_cancel_turn_camera_presentation(revision, str(snapshot.get("lifecycle", "invalid-direction")))
		return

	if turn_camera_active and turn_presentation_target_direction == direction:
		_publish_turn_presentation_state("retarget-adopted", revision, str(snapshot.get("lifecycle", "")))
		return
	if not turn_camera_active and turn_presentation_settled_direction == direction:
		turn_presentation_target_direction = direction
		_publish_turn_presentation_state("settled", revision, str(snapshot.get("lifecycle", "")))
		return

	_start_authoritative_turn_camera(direction, revision, str(snapshot.get("lifecycle", "")))


func _start_authoritative_turn_camera(direction: String, revision: int, lifecycle: String) -> void:
	turn_presentation_serial += 1
	var serial: int = turn_presentation_serial
	if camera_tween != null and camera_tween.is_valid():
		camera_tween.kill()
		turn_presentation_retarget_count += 1
	camera_tween = null

	var axis: Vector3 = DIRECTION_VECTORS.get(direction, Vector3(1.0, 0.0, 0.0)) as Vector3
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var aspect: float = viewport_size.x / maxf(viewport_size.y, 1.0)
	var portrait_weight: float = clampf((0.92 - aspect) / 0.46, 0.0, 1.0)
	var radius: float = lerpf(18.5, 28.0, portrait_weight)
	var height: float = lerpf(15.5, 23.0, portrait_weight)
	var target_fov: float = lerpf(50.0, 72.0, portrait_weight)

	turn_presentation_target_direction = direction
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

	var crosses_back_wall: bool = turn_camera_start_position.z < STUDIO_WALL_SAFE_Z or turn_camera_target_position.z < STUDIO_WALL_SAFE_Z
	_set_studio_backdrop_visible(not crosses_back_wall)

	camera_tween = create_tween()
	camera_tween.tween_method(
		Callable(self, "_apply_authoritative_turn_camera_progress").bind(serial),
		0.0,
		1.0,
		CAMERA_TRANSITION
	).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	camera_tween.finished.connect(_finish_authoritative_turn_camera.bind(serial, direction, revision, lifecycle))
	_apply_authoritative_turn_camera_progress(0.0, serial)
	_publish_turn_camera(direction, aspect, radius, height, target_fov)
	_publish_effective_turn_fov(target_fov, turn_camera_effective_fov)
	_publish_camera_health("start")
	_publish_turn_presentation_state("transitioning", revision, lifecycle)


func _apply_authoritative_turn_camera_progress(progress: float, serial: int) -> void:
	if serial != turn_presentation_serial or not turn_camera_active or camera == null:
		return
	var t: float = clampf(progress, 0.0, 1.0)
	camera.position = turn_camera_start_position.lerp(turn_camera_target_position, t)
	camera.fov = lerpf(turn_camera_start_fov, turn_camera_effective_fov, t)
	camera.current = true
	camera.look_at(turn_camera_focus, Vector3.UP)


func _finish_authoritative_turn_camera(serial: int, direction: String, revision: int, lifecycle: String) -> void:
	if serial != turn_presentation_serial:
		turn_presentation_stale_finish_count += 1
		return
	if direction != turn_presentation_target_direction:
		turn_presentation_stale_finish_count += 1
		return
	var snapshot: Dictionary = authoritative_turn_snapshot()
	if not bool(snapshot.get("valid", false)) or str(snapshot.get("direction", "")) != direction:
		turn_presentation_stale_finish_count += 1
		return

	camera_tween = null
	turn_presentation_settled_direction = direction
	# The inherited camera-safe finisher snaps exactly once, restores backdrop
	# visibility, and preserves the existing offline readiness behavior. Online
	# readiness remains authoritative and is never delayed by this presentation.
	super._finish_camera_transition()
	_publish_turn_presentation_state("settled", revision, lifecycle)


func _cancel_turn_camera_presentation(revision: int, lifecycle: String) -> void:
	turn_presentation_serial += 1
	if camera_tween != null and camera_tween.is_valid():
		camera_tween.kill()
		turn_presentation_cancel_count += 1
	camera_tween = null
	turn_camera_active = false
	camera_transition = false
	turn_presentation_target_direction = ""
	turn_presentation_settled_direction = ""
	if camera != null:
		camera.current = true
		_ensure_game_scene_visible()
		_set_studio_backdrop_visible(camera.position.z >= STUDIO_WALL_SAFE_Z)
	_publish_turn_presentation_state("cancelled", revision, lifecycle)


func _cancel_stale_selection_presentation() -> void:
	# Selection/tray motion is presentation only. Kill it before restoring pieces
	# so no old tween can lift or recolor the previous owner's stones afterward.
	if tray_tween != null and tray_tween.is_valid():
		tray_tween.kill()
	tray_tween = null
	if tray_open:
		_close_piece_tray(-1, true)
	elif selected_index >= 0 and not move_active:
		super._clear_selection()


func _publish_turn_presentation_state(state: String, revision: int, lifecycle: String) -> void:
	if not OS.has_feature("web"):
		return
	var tween_state: String = "running" if camera_tween != null and camera_tween.is_valid() else "none"
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakTurnPresentationOwner='authoritative-revision-controller';" +
		"document.body.dataset.yakolakTurnPresentationState='%s';" % _turn_js(state) +
		"document.body.dataset.yakolakTurnPresentationRevision='%d';" % revision +
		"document.body.dataset.yakolakTurnPresentationLifecycle='%s';" % _turn_js(lifecycle) +
		"document.body.dataset.yakolakTurnPresentationTarget='%s';" % _turn_js(turn_presentation_target_direction) +
		"document.body.dataset.yakolakTurnPresentationSettled='%s';" % _turn_js(turn_presentation_settled_direction) +
		"document.body.dataset.yakolakTurnPresentationTween='%s';" % tween_state +
		"document.body.dataset.yakolakTurnPresentationSerial='%d';" % turn_presentation_serial +
		"document.body.dataset.yakolakTurnPresentationRetargets='%d';" % turn_presentation_retarget_count +
		"document.body.dataset.yakolakTurnPresentationCancels='%d';" % turn_presentation_cancel_count +
		"document.body.dataset.yakolakTurnPresentationStaleFinishes='%d';" % turn_presentation_stale_finish_count +
		"document.body.dataset.yakolakTurnPresentationSelection='%d';" % selected_index +
		"document.body.dataset.yakolakTurnPresentationTray='%s';" % ("open" if tray_open else "closed"),
		true
	)
