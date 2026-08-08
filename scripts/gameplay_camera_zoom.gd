extends Node

# Player-controlled camera zoom for gameplay.
# Two-finger pinch works on touch devices; mouse wheel / magnify gestures work on desktop.
# The chosen zoom level is preserved when the turn camera moves to the next player.

const MIN_FOV: float = 34.0
const MAX_FOV: float = 78.0
const WHEEL_STEP: float = 3.0
const MIN_PINCH_DISTANCE: float = 24.0

var intro: Node3D
var gameplay: Node
var camera: Camera3D
var active_touches: Dictionary = {}
var pinch_active: bool = false
var pinch_start_distance: float = 0.0
var pinch_start_fov: float = 50.0
var user_zoom_ratio: float = 1.0
var previous_transition: bool = false
var previous_match_initialized: bool = false


func _ready() -> void:
	intro = get_parent() as Node3D
	set_process(true)
	set_process_input(true)


func _process(_delta: float) -> void:
	if not _resolve_dependencies():
		return

	var match_initialized: bool = bool(gameplay.get("match_initialized"))
	if not match_initialized:
		if previous_match_initialized:
			_reset_zoom_state()
		previous_match_initialized = false
		previous_transition = false
		return

	previous_match_initialized = true
	var transition_active: bool = bool(gameplay.get("camera_transition"))
	if previous_transition and not transition_active:
		call_deferred("_restore_user_zoom")
	previous_transition = transition_active


func _input(event: InputEvent) -> void:
	if not _gameplay_zoom_available():
		return

	if event is InputEventMagnifyGesture:
		var magnify := event as InputEventMagnifyGesture
		if magnify.factor > 0.01:
			_apply_fov(camera.fov / magnify.factor)
			get_viewport().set_input_as_handled()
		return

	if event is InputEventMouseButton:
		var mouse := event as InputEventMouseButton
		if not mouse.pressed:
			return
		if mouse.button_index == MOUSE_BUTTON_WHEEL_UP:
			_apply_fov(camera.fov - WHEEL_STEP)
			get_viewport().set_input_as_handled()
		elif mouse.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_apply_fov(camera.fov + WHEEL_STEP)
			get_viewport().set_input_as_handled()
		return

	if event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		if touch.pressed:
			active_touches[touch.index] = touch.position
			if active_touches.size() >= 2:
				_begin_pinch()
				gameplay.call("_clear_selection")
				get_viewport().set_input_as_handled()
		else:
			active_touches.erase(touch.index)
			if active_touches.size() < 2:
				pinch_active = false
		return

	if event is InputEventScreenDrag:
		var drag := event as InputEventScreenDrag
		active_touches[drag.index] = drag.position
		if active_touches.size() < 2:
			return
		if not pinch_active:
			_begin_pinch()
		var distance: float = _current_pinch_distance()
		if pinch_start_distance >= MIN_PINCH_DISTANCE and distance >= MIN_PINCH_DISTANCE:
			var scale: float = distance / pinch_start_distance
			_apply_fov(pinch_start_fov / maxf(scale, 0.01))
			get_viewport().set_input_as_handled()


func _resolve_dependencies() -> bool:
	if intro == null:
		return false
	if gameplay == null:
		gameplay = intro.get_node_or_null("PostIntroGameplay")
	if camera == null:
		camera = intro.get("camera") as Camera3D
	return gameplay != null and camera != null


func _gameplay_zoom_available() -> bool:
	if not _resolve_dependencies():
		return false
	if not bool(gameplay.get("match_initialized")):
		return false
	if bool(gameplay.get("camera_transition")) or bool(gameplay.get("round_complete")):
		return false
	return true


func _begin_pinch() -> void:
	pinch_start_distance = _current_pinch_distance()
	pinch_start_fov = camera.fov if camera != null else 50.0
	pinch_active = pinch_start_distance >= MIN_PINCH_DISTANCE


func _current_pinch_distance() -> float:
	var touch_ids: Array = active_touches.keys()
	if touch_ids.size() < 2:
		return 0.0
	var first: Vector2 = active_touches[touch_ids[0]]
	var second: Vector2 = active_touches[touch_ids[1]]
	return first.distance_to(second)


func _apply_fov(value: float) -> void:
	if camera == null:
		return
	camera.fov = clampf(value, MIN_FOV, MAX_FOV)
	var base_fov: float = _base_turn_fov()
	user_zoom_ratio = camera.fov / maxf(base_fov, 1.0)
	_publish_zoom_state()


func _base_turn_fov() -> float:
	if gameplay == null:
		return 50.0
	var value: Variant = gameplay.get("turn_camera_target_fov")
	if value == null:
		return 50.0
	return maxf(float(value), 1.0)


func _restore_user_zoom() -> void:
	if not _gameplay_zoom_available() or camera == null:
		return
	camera.fov = clampf(_base_turn_fov() * user_zoom_ratio, MIN_FOV, MAX_FOV)
	_publish_zoom_state()


func _reset_zoom_state() -> void:
	active_touches.clear()
	pinch_active = false
	pinch_start_distance = 0.0
	pinch_start_fov = 50.0
	user_zoom_ratio = 1.0


func _publish_zoom_state() -> void:
	if not OS.has_feature("web") or camera == null:
		return
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakCameraZoomFov='%.2f';" % camera.fov +
		"document.body.dataset.yakolakCameraZoomEnabled='true';",
		true
	)
