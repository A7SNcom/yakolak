extends Node3D

# LIGHTING-11: one event-driven owner for localized turn emphasis. Static studio
# lighting remains owned by intro.gd/visual_polish.gd; this controller only owns
# the four small seat spotlights and their single crossfade tween.
const DIRECTIONS: Array[String] = ["right", "back", "left", "front"]
const BASE_TARGETS: Dictionary = {
	"right": Vector3(5.4, 0.34, 0.0),
	"back": Vector3(0.0, 0.34, -5.4),
	"left": Vector3(-5.4, 0.34, 0.0),
	"front": Vector3(0.0, 0.34, 5.4),
}
const ACTIVE_ENERGY: float = 1.05
const NEUTRAL_ENERGY: float = 0.0
const CROSSFADE_DURATION: float = 0.34
const LIGHT_HEIGHT: float = 3.8
const LIGHT_OUTWARD_OFFSET: float = 1.75
const LIGHT_RANGE: float = 6.4
const LIGHT_ANGLE: float = 30.0

var intro: Node3D
var gameplay: Node
var seat_lights: Dictionary = {}
var transition_tween: Tween
var applied_revision: int = -1
var transition_serial: int = 0
var transition_count: int = 0
var retarget_count: int = 0
var final_apply_count: int = 0
var immediate_apply_count: int = 0
var stale_finish_ignored_count: int = 0
var active_direction: String = ""
var target_direction: String = ""
var reduced_motion: bool = false


func _ready() -> void:
	process_priority = 36
	set_process(false)
	intro = get_parent() as Node3D
	reduced_motion = _prefers_reduced_motion()
	call_deferred("_initialize_turn_lighting")


func _initialize_turn_lighting() -> void:
	_build_seat_lights()
	_attach_authoritative_turn_source()
	_publish_contract()


func _build_seat_lights() -> void:
	if not seat_lights.is_empty():
		return
	for direction: String in DIRECTIONS:
		var target: Vector3 = BASE_TARGETS[direction] as Vector3
		var outward := Vector3(target.x, 0.0, target.z).normalized()
		var light := SpotLight3D.new()
		light.name = "TurnSeatLight_%s" % direction
		light.light_color = Color("#fff5e6")
		light.light_energy = NEUTRAL_ENERGY
		light.shadow_enabled = false
		light.spot_range = LIGHT_RANGE
		light.spot_angle = LIGHT_ANGLE
		light.spot_angle_attenuation = 1.35
		light.spot_attenuation = 1.55
		add_child(light)
		light.global_position = to_global(target + outward * LIGHT_OUTWARD_OFFSET + Vector3.UP * LIGHT_HEIGHT)
		light.look_at(to_global(target), Vector3.UP)
		seat_lights[direction] = light


func _attach_authoritative_turn_source() -> void:
	if intro == null:
		return
	gameplay = intro.get_node_or_null("PostIntroGameplay")
	if gameplay == null:
		return
	var callback := Callable(self, "_on_authoritative_turn_changed")
	if gameplay.has_signal("authoritative_turn_changed") and not gameplay.is_connected("authoritative_turn_changed", callback):
		gameplay.connect("authoritative_turn_changed", callback)
	if gameplay.has_method("authoritative_turn_snapshot"):
		var snapshot: Variant = gameplay.call("authoritative_turn_snapshot")
		if snapshot is Dictionary and not (snapshot as Dictionary).is_empty():
			_on_authoritative_turn_changed(snapshot as Dictionary)


func _on_authoritative_turn_changed(snapshot: Dictionary) -> void:
	var revision: int = int(snapshot.get("revision", -1))
	if revision >= 0 and revision <= applied_revision:
		return
	if revision >= 0:
		applied_revision = revision
	var next_direction: String = ""
	if bool(snapshot.get("valid", false)):
		var candidate: String = str(snapshot.get("direction", ""))
		if seat_lights.has(candidate):
			next_direction = candidate
	_retarget_turn_light(next_direction, revision, str(snapshot.get("lifecycle", "")))


func _retarget_turn_light(next_direction: String, revision: int, lifecycle: String) -> void:
	transition_serial += 1
	var serial: int = transition_serial
	if transition_tween != null and transition_tween.is_valid():
		transition_tween.kill()
		transition_tween = null
		retarget_count += 1
	target_direction = next_direction

	if reduced_motion:
		immediate_apply_count += 1
		_set_exact_final(next_direction)
		_publish_state("immediate", revision, lifecycle)
		return
	if _is_exact_final(next_direction):
		active_direction = next_direction
		_publish_state("stable", revision, lifecycle)
		return

	transition_count += 1
	transition_tween = create_tween()
	transition_tween.set_parallel(true)
	for direction: String in DIRECTIONS:
		var light := seat_lights.get(direction) as SpotLight3D
		if light == null:
			continue
		var energy: float = ACTIVE_ENERGY if direction == next_direction else NEUTRAL_ENERGY
		if is_equal_approx(light.light_energy, energy):
			continue
		transition_tween.tween_property(light, "light_energy", energy, CROSSFADE_DURATION).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	transition_tween.finished.connect(_finish_transition.bind(serial, next_direction, revision, lifecycle))
	_publish_state("crossfading", revision, lifecycle)


func _finish_transition(serial: int, direction: String, revision: int, lifecycle: String) -> void:
	if serial != transition_serial:
		stale_finish_ignored_count += 1
		return
	transition_tween = null
	_set_exact_final(direction)
	_publish_state("final", revision, lifecycle)


func _set_exact_final(direction: String) -> void:
	for seat_direction: String in DIRECTIONS:
		var light := seat_lights.get(seat_direction) as SpotLight3D
		if light != null:
			light.light_energy = ACTIVE_ENERGY if seat_direction == direction else NEUTRAL_ENERGY
	active_direction = direction
	final_apply_count += 1


func _is_exact_final(direction: String) -> bool:
	for seat_direction: String in DIRECTIONS:
		var light := seat_lights.get(seat_direction) as SpotLight3D
		if light == null:
			return false
		var expected: float = ACTIVE_ENERGY if seat_direction == direction else NEUTRAL_ENERGY
		if not is_equal_approx(light.light_energy, expected):
			return false
	return true


func fully_emphasized_count() -> int:
	var count: int = 0
	for direction: String in DIRECTIONS:
		var light := seat_lights.get(direction) as SpotLight3D
		if light != null and is_equal_approx(light.light_energy, ACTIVE_ENERGY):
			count += 1
	return count


func turn_light_energy(direction: String) -> float:
	var light := seat_lights.get(direction) as SpotLight3D
	return light.light_energy if light != null else -1.0


func _prefers_reduced_motion() -> bool:
	if not OS.has_feature("web"):
		return false
	var value: Variant = JavaScriptBridge.eval(
		"Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)",
		true
	)
	return bool(value)


func _publish_contract() -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakTurnLightOwner='single-authoritative-controller';" +
		"document.body.dataset.yakolakTurnLightSource='authoritative-turn-signal';" +
		"document.body.dataset.yakolakTurnLightPolling='none';" +
		"document.body.dataset.yakolakTurnLightScope='localized-seat-spots';" +
		"document.body.dataset.yakolakTurnLightReducedMotion='%s';" % ("true" if reduced_motion else "false"),
		true
	)


func _publish_state(state: String, revision: int, lifecycle: String) -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakTurnLightState='%s';" % _js(state) +
		"document.body.dataset.yakolakTurnLightRevision='%d';" % revision +
		"document.body.dataset.yakolakTurnLightLifecycle='%s';" % _js(lifecycle) +
		"document.body.dataset.yakolakTurnLightDirection='%s';" % _js(target_direction) +
		"document.body.dataset.yakolakTurnLightTransitions='%d';" % transition_count +
		"document.body.dataset.yakolakTurnLightRetargets='%d';" % retarget_count +
		"document.body.dataset.yakolakTurnLightFinalCount='%d';" % fully_emphasized_count(),
		true
	)


func _js(value: String) -> String:
	return value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ").replace("\r", " ")