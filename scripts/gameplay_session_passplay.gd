extends "res://scripts/gameplay_session_rules.gd"

# Adaptive pass-and-play camera framing.
# The previous fixed 50° camera worked on wide screens but could push the
# board and the next player's stones outside a portrait phone viewport.

var web_pass_play_callback: Variant


func _ready() -> void:
	super._ready()
	if OS.has_feature("web"):
		web_pass_play_callback = JavaScriptBridge.create_callback(_on_web_start_pass_play)
		var window: JavaScriptObject = JavaScriptBridge.get_interface("window")
		if window != null:
			window.set("yakolakTestStartPassPlay", web_pass_play_callback)


func _transition_to_current_player() -> void:
	# Bots/remotes keep the human camera stable. Shared-device humans rotate to
	# their own side, but the framing is derived from the live viewport so the
	# complete play area remains visible on narrow phones.
	if camera == null or _current_mode() != "local":
		_finish_camera_transition()
		return

	var direction: String = _current_direction()
	var axis: Vector3 = DIRECTION_VECTORS.get(direction, Vector3(1.0, 0.0, 0.0)) as Vector3
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var aspect: float = viewport_size.x / maxf(viewport_size.y, 1.0)
	var portrait_weight: float = clampf((0.92 - aspect) / 0.46, 0.0, 1.0)
	var radius: float = lerpf(18.5, 28.0, portrait_weight)
	var height: float = lerpf(15.5, 23.0, portrait_weight)
	var target_fov: float = lerpf(50.0, 72.0, portrait_weight)
	var target_position: Vector3 = axis * radius + Vector3(0.0, height, 0.0)
	# Always keep the board itself as the visual anchor. Looking toward the
	# player's base shifted the board off-screen on portrait viewports.
	var look_target := Vector3(0.0, 0.42, 0.0)
	var target_transform := Transform3D(Basis.IDENTITY, target_position).looking_at(look_target, Vector3.UP)

	camera_transition = true
	if camera_tween != null and camera_tween.is_valid():
		camera_tween.kill()
	camera_tween = create_tween()
	camera_tween.set_parallel(true)
	camera_tween.tween_property(camera, "position", target_position, CAMERA_TRANSITION).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	camera_tween.tween_property(camera, "quaternion", target_transform.basis.get_rotation_quaternion(), CAMERA_TRANSITION).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	camera_tween.tween_property(camera, "fov", target_fov, CAMERA_TRANSITION).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	camera_tween.finished.connect(_finish_camera_transition)
	_publish_match_state("camera-transition")
	_publish_turn_camera(direction, aspect, radius, height, target_fov)


func _publish_turn_camera(direction: String, aspect: float, radius: float, height: float, target_fov: float) -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakTurnCamera='%s';" % direction +
		"document.body.dataset.yakolakTurnAspect='%.4f';" % aspect +
		"document.body.dataset.yakolakTurnRadius='%.2f';" % radius +
		"document.body.dataset.yakolakTurnHeight='%.2f';" % height +
		"document.body.dataset.yakolakTurnFov='%.2f';" % target_fov,
		true
	)


func _on_web_start_pass_play(_arguments: Array) -> void:
	if not waiting_for_setup:
		return
	if setup != null:
		setup.call("reset_for_intro")
	_on_configuration_ready({
		"tutorial": false,
		"rounds": 3,
		"players": [
			{"seat": "p1", "label": "أنا", "mode": "local", "color": "marble", "color_name": "أبيض", "direction": "right"},
			{"seat": "p2", "label": "اللاعب 2", "mode": "local", "color": "blue", "color_name": "أزرق", "direction": "back"},
		],
		"online_join_code": "",
	})
