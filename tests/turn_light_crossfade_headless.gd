extends SceneTree

# LIGHTING-11 focused regression: one event-driven light owner crossfades from
# current energies, retargets newer authoritative revisions, and converges to an
# exact single emphasized seat without polling or stale tween mutation.

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

var failures: Array[String] = []
var intro: Node3D
var game: FakeGameplay
var lighting: Node


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	intro = Node3D.new()
	intro.name = "Lighting11Root"
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
	_expect(int(lighting.call("fully_emphasized_count")) == 0, "no turn starts with all seats neutral")

	# First accepted turn fades from neutral to one exact emphasized seat.
	game.publish(_snapshot(1, true, "front", "online-room"))
	await create_timer(0.42).timeout
	_expect(str(lighting.get("active_direction")) == "front", "first authoritative seat becomes active")
	_expect(int(lighting.call("fully_emphasized_count")) == 1, "first crossfade ends with exactly one emphasized seat")
	_expect(_near(float(lighting.call("turn_light_energy", "front")), 1.05), "active seat reaches full emphasis")
	_expect(_near(float(lighting.call("turn_light_energy", "right")), 0.0), "neutral seat remains neutral")

	# A newer turn arrives while right is still fading in. The old tween must die;
	# left retargets from whatever energies exist at that instant and wins exactly.
	game.publish(_snapshot(2, true, "right", "online-room"))
	await create_timer(0.08).timeout
	var stale_serial: int = int(lighting.get("transition_serial"))
	game.publish(_snapshot(3, true, "left", "online-room"))
	var newest_serial: int = int(lighting.get("transition_serial"))
	_expect(newest_serial > stale_serial, "newer authoritative state retargets the owned transition")
	_expect(int(lighting.get("retarget_count")) >= 1, "in-flight tween cancellation is instrumented")

	# Even if an obsolete completion callback somehow arrives after cancellation,
	# its serial cannot mutate the current target or final energies.
	lighting.call("_finish_transition", stale_serial, "right", 2, "online-room")
	_expect(int(lighting.get("stale_finish_ignored_count")) >= 1, "stale completion is ignored")
	await create_timer(0.42).timeout
	_expect(str(lighting.get("active_direction")) == "left", "latest authoritative seat wins after retarget")
	_expect(int(lighting.call("fully_emphasized_count")) == 1, "retarget still converges to exactly one emphasized seat")
	_expect(_near(float(lighting.call("turn_light_energy", "left")), 1.05), "latest seat reaches full emphasis")
	_expect(_near(float(lighting.call("turn_light_energy", "front")), 0.0), "previous active seat returns to neutral")
	_expect(_near(float(lighting.call("turn_light_energy", "right")), 0.0), "abandoned in-flight seat returns to neutral")

	# Reconnect/round transition style invalid snapshots have no authoritative turn.
	game.publish(_snapshot(4, false, "left", "reconnecting"))
	await create_timer(0.42).timeout
	_expect(str(lighting.get("active_direction")).is_empty(), "temporarily no turn ends with no active seat")
	_expect(int(lighting.call("fully_emphasized_count")) == 0, "invalid authoritative state neutralizes every seat")

	# The project honors prefers-reduced-motion; the controller's established
	# reduced path applies the new authoritative state immediately with no tween.
	lighting.set("reduced_motion", true)
	game.publish(_snapshot(5, true, "back", "online-room"))
	await process_frame
	_expect(str(lighting.get("active_direction")) == "back", "reduced motion applies final seat immediately")
	_expect(int(lighting.call("fully_emphasized_count")) == 1, "reduced motion still has exactly one emphasized seat")
	_expect(int(lighting.get("immediate_apply_count")) >= 1, "reduced-motion immediate application is instrumented")
	var tween: Variant = lighting.get("transition_tween")
	_expect(tween == null or not (tween as Tween).is_valid(), "reduced motion leaves no live transition tween")

	# Old/equal authoritative revisions cannot roll presentation backward.
	game.publish(_snapshot(3, true, "front", "online-room"))
	await process_frame
	_expect(str(lighting.get("active_direction")) == "back", "older authoritative revision cannot overwrite the latest seat")

	await _finish()


func _snapshot(revision: int, valid: bool, direction: String, lifecycle: String) -> Dictionary:
	return {
		"revision": revision,
		"valid": valid,
		"direction": direction,
		"lifecycle": lifecycle,
		"player_index": 0,
		"player_number": 1,
		"seat": "p1",
		"online": true,
		"local_turn": false,
	}


func _near(actual: float, expected: float) -> bool:
	return absf(actual - expected) <= 0.001


func _expect(condition: bool, message: String) -> void:
	if not condition:
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