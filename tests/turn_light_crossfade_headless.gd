extends SceneTree

# LIGHTING-12 regression: stress the single LIGHTING-11 owner through rapid
# authoritative turn changes, reconnect hydration, round/match transitions,
# rematch, and reduced motion. The test samples the real SpotLight3D energies on
# every rendered engine frame so an overlapping/orphan tween cannot hide behind
# final-state-only assertions.

class FakeGameplay:
	extends Node
	signal authoritative_turn_changed(snapshot: Dictionary)
	var snapshot: Dictionary = {}

	func authoritative_turn_snapshot() -> Dictionary:
		return snapshot.duplicate(true)

	func publish(next_snapshot: Dictionary) -> void:
		snapshot = next_snapshot.duplicate(true)
		authoritative_turn_changed.emit(snapshot.duplicate(true))


const TurnLight = preload("res://scripts/turn_light_crossfade.gd")
const ACTIVE_ENERGY: float = 1.05
const ENERGY_EPSILON: float = 0.012
const SETTLE_TIMEOUT_MSEC: int = 1200
const MIN_EXPECTED_CROSSFADE_MSEC: int = 250
const MAX_EXPECTED_CROSSFADE_MSEC: int = 650

var failures: Array[String] = []
var intro: Node3D
var game: FakeGameplay
var lighting: Node
var observed_transition_durations_msec: Array[int] = []
var peak_total_energy: float = 0.0


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	intro = Node3D.new()
	intro.name = "Lighting12Root"
	game = FakeGameplay.new()
	game.name = "PostIntroGameplay"
	lighting = TurnLight.new()
	lighting.name = "TurnLightCrossfade"
	intro.add_child(game)
	intro.add_child(lighting)
	root.add_child(intro)
	await process_frame
	await process_frame

	var lights: Variant = lighting.get("seat_lights")
	_expect(lights is Dictionary and (lights as Dictionary).size() == 4, "controller owns exactly four localized seat lights")
	_expect(not lighting.is_processing(), "turn-light owner must not run a polling process loop")
	_expect(int(lighting.call("fully_emphasized_count")) == 0, "no turn starts with all seats neutral")
	_assert_energy_envelope("initial-neutral")

	# Establish a fully active seat so the following rapid retargets are true
	# crossfades rather than a neutral fade-in.
	var p2_duration: int = await _publish_and_wait(_snapshot(1, true, "back", "online-room", 1, "p2"), "initial-p2")
	_record_transition_duration(p2_duration, "initial-p2")
	_assert_exact_final("back", "initial p2 settled")

	# Rapid authoritative P2 -> P3 -> P4. P3 intentionally does not settle. The
	# P4 revision must cancel the owned tween, inherit current energies, and end
	# with one exact active seat. Total localized energy may crossfade but may not
	# spike above the single-seat envelope.
	game.publish(_snapshot(2, true, "left", "online-room", 2, "p3"))
	var rapid_start_msec: int = Time.get_ticks_msec()
	for _i: int in range(5):
		await process_frame
		_assert_energy_envelope("rapid-p3")
	var serial_p3: int = int(lighting.get("transition_serial"))
	game.publish(_snapshot(3, true, "front", "online-room", 3, "p4"))
	var serial_p4: int = int(lighting.get("transition_serial"))
	_expect(serial_p4 > serial_p3, "P3 -> P4 must retarget the one owned tween")
	_expect(int(lighting.get("retarget_count")) >= 1, "rapid turn retarget is instrumented")
	var p4_duration: int = await _wait_until_settled("front", "rapid-p3-to-p4")
	p4_duration = Time.get_ticks_msec() - rapid_start_msec if p4_duration >= 0 else p4_duration
	_expect(p4_duration <= SETTLE_TIMEOUT_MSEC, "rapid P3 -> P4 settles without runaway tween")
	_assert_exact_final("front", "rapid P3 -> P4 settled")
	await _assert_no_orphan_mutation("front", "post-p4-stability")

	# Reconnect removes turn authority long enough to settle all seats neutral;
	# accepted hydration then restores the exact P4 focus from authoritative state.
	var reconnect_off_duration: int = await _publish_and_wait(_snapshot(4, false, "front", "reconnecting", 3, "p4"), "reconnect-no-turn")
	_record_transition_duration(reconnect_off_duration, "reconnect-no-turn")
	_assert_exact_final("", "reconnect neutral settled")
	var reconnect_restore_duration: int = await _publish_and_wait(_snapshot(5, true, "front", "online-room", 3, "p4"), "reconnect-restore-p4")
	_record_transition_duration(reconnect_restore_duration, "reconnect-restore-p4")
	_assert_exact_final("front", "reconnect restores p4")

	# Round transition must neutralize the previous round, then a fresh round can
	# emphasize its new starter without any old-seat mutation surviving.
	var round_off_duration: int = await _publish_and_wait(_snapshot(6, false, "front", "round-transition", 3, "p4"), "round-transition")
	_record_transition_duration(round_off_duration, "round-transition")
	_assert_exact_final("", "round transition neutral")
	var next_round_duration: int = await _publish_and_wait(_snapshot(7, true, "right", "turn", 0, "p1"), "round-2-p1")
	_record_transition_duration(next_round_duration, "round-2-p1")
	_assert_exact_final("right", "new round p1")

	# Match end/rematch use the same owner instance. A completed match has no
	# active seat; the rematch's fresh authoritative P2 revision must light only P2.
	var match_end_duration: int = await _publish_and_wait(_snapshot(8, false, "right", "match-end", 0, "p1"), "match-end")
	_record_transition_duration(match_end_duration, "match-end")
	_assert_exact_final("", "match end neutral")
	var rematch_duration: int = await _publish_and_wait(_snapshot(9, true, "back", "online-room", 1, "p2"), "rematch-p2")
	_record_transition_duration(rematch_duration, "rematch-p2")
	_assert_exact_final("back", "rematch p2")
	await _assert_no_orphan_mutation("back", "post-rematch-stability")

	# Reduced Motion is supported by the controller. It must kill any in-flight
	# tween and apply the authoritative destination in the same event turn.
	lighting.set("reduced_motion", false)
	game.publish(_snapshot(10, true, "left", "online-room", 2, "p3"))
	await process_frame
	var before_reduced_serial: int = int(lighting.get("transition_serial"))
	lighting.set("reduced_motion", true)
	game.publish(_snapshot(11, true, "front", "online-room", 3, "p4"))
	await process_frame
	_expect(int(lighting.get("transition_serial")) > before_reduced_serial, "reduced-motion retarget advances transition serial")
	_assert_exact_final("front", "reduced motion p4 immediate")
	_expect(int(lighting.get("immediate_apply_count")) >= 1, "reduced-motion immediate application is instrumented")
	var reduced_tween: Variant = lighting.get("transition_tween")
	_expect(reduced_tween == null or not (reduced_tween as Tween).is_valid(), "reduced motion leaves no live transition tween")
	await _assert_no_orphan_mutation("front", "reduced-motion-stability")

	# Older/equal revisions cannot roll lighting backward after any lifecycle.
	game.publish(_snapshot(9, true, "right", "online-room", 0, "p1"))
	await process_frame
	_assert_exact_final("front", "stale revision ignored")

	print("YAKOLAK_LIGHTING12_METRICS transition_ms=%s peak_total_energy=%.4f retargets=%d transitions=%d immediate=%d" % [
		str(observed_transition_durations_msec),
		peak_total_energy,
		int(lighting.get("retarget_count")),
		int(lighting.get("transition_count")),
		int(lighting.get("immediate_apply_count")),
	])
	await _finish()


func _publish_and_wait(snapshot: Dictionary, label: String) -> int:
	var started_msec: int = Time.get_ticks_msec()
	game.publish(snapshot)
	var expected_direction: String = str(snapshot.get("direction", "")) if bool(snapshot.get("valid", false)) else ""
	var settle_result: int = await _wait_until_settled(expected_direction, label)
	if settle_result < 0:
		return settle_result
	return Time.get_ticks_msec() - started_msec


func _wait_until_settled(expected_direction: String, label: String) -> int:
	var started_msec: int = Time.get_ticks_msec()
	while Time.get_ticks_msec() - started_msec <= SETTLE_TIMEOUT_MSEC:
		await process_frame
		_assert_energy_envelope(label)
		if str(lighting.get("active_direction")) == expected_direction and bool(lighting.call("_is_exact_final", expected_direction)):
			var tween: Variant = lighting.get("transition_tween")
			if tween == null or not (tween as Tween).is_valid():
				return Time.get_ticks_msec() - started_msec
	_fail("%s did not settle within %dms" % [label, SETTLE_TIMEOUT_MSEC])
	return -1


func _record_transition_duration(duration_msec: int, label: String) -> void:
	if duration_msec < 0:
		return
	observed_transition_durations_msec.append(duration_msec)
	_expect(duration_msec >= MIN_EXPECTED_CROSSFADE_MSEC, "%s crossfade must not collapse into a flash (%dms)" % [label, duration_msec])
	_expect(duration_msec <= MAX_EXPECTED_CROSSFADE_MSEC, "%s crossfade must not drag/jank (%dms)" % [label, duration_msec])


func _assert_energy_envelope(label: String) -> void:
	var total: float = 0.0
	for direction: String in ["right", "back", "left", "front"]:
		var energy: float = float(lighting.call("turn_light_energy", direction))
		total += maxf(energy, 0.0)
		_expect(energy >= -ENERGY_EPSILON, "%s %s energy cannot go below neutral: %.4f" % [label, direction, energy])
		_expect(energy <= ACTIVE_ENERGY + ENERGY_EPSILON, "%s %s energy cannot exceed active emphasis: %.4f" % [label, direction, energy])
	peak_total_energy = maxf(peak_total_energy, total)
	_expect(total <= ACTIVE_ENERGY + ENERGY_EPSILON, "%s localized luminance envelope spiked to %.4f" % [label, total])


func _assert_exact_final(expected_direction: String, label: String) -> void:
	_expect(str(lighting.get("active_direction")) == expected_direction, "%s active direction must match authoritative state" % label)
	_expect(bool(lighting.call("_is_exact_final", expected_direction)), "%s all inactive seats must be exact neutral baseline" % label)
	_expect(int(lighting.call("fully_emphasized_count")) == (0 if expected_direction.is_empty() else 1), "%s must have exactly the expected active-seat count" % label)
	_assert_energy_envelope(label)


func _assert_no_orphan_mutation(expected_direction: String, label: String) -> void:
	var baseline: Dictionary = _energy_snapshot()
	for _i: int in range(12):
		await process_frame
		_assert_energy_envelope(label)
		_expect(_energy_snapshot() == baseline, "%s energies changed after settled final state" % label)
		_expect(str(lighting.get("active_direction")) == expected_direction, "%s active direction changed after settle" % label)
	var tween: Variant = lighting.get("transition_tween")
	_expect(tween == null or not (tween as Tween).is_valid(), "%s has an orphan live tween" % label)
	_expect(not lighting.is_processing(), "%s must remain event-driven with process disabled" % label)


func _energy_snapshot() -> Dictionary:
	return {
		"right": snappedf(float(lighting.call("turn_light_energy", "right")), 0.0001),
		"back": snappedf(float(lighting.call("turn_light_energy", "back")), 0.0001),
		"left": snappedf(float(lighting.call("turn_light_energy", "left")), 0.0001),
		"front": snappedf(float(lighting.call("turn_light_energy", "front")), 0.0001),
	}


func _snapshot(revision: int, valid: bool, direction: String, lifecycle: String, player_index: int, seat: String) -> Dictionary:
	return {
		"revision": revision,
		"valid": valid,
		"direction": direction,
		"lifecycle": lifecycle,
		"player_index": player_index,
		"player_number": player_index + 1,
		"seat": seat,
		"online": true,
		"local_turn": seat == "p1",
	}


func _expect(condition: bool, message: String) -> void:
	if not condition:
		_fail(message)


func _fail(message: String) -> void:
	if not failures.has(message):
		failures.append(message)


func _finish() -> void:
	if intro != null and is_instance_valid(intro):
		intro.queue_free()
		await process_frame
		await process_frame
	if failures.is_empty():
		print("YAKOLAK_TURN_LIGHT_CROSSFADE_OK")
		quit(0)
		return
	for failure: String in failures:
		push_error(failure)
	quit(1)
