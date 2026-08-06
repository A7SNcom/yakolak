extends SceneTree

# Fast UI-state coverage that does not need a GPU/browser.  Browser smoke
# tests cover actual tapping; this protects the player count and colour swap
# rules before a Web export is made.

var failures: Array[String] = []
var emitted_configuration: Dictionary = {}


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var intro := Node3D.new()
	root.add_child(intro)
	var setup := preload("res://scripts/session_setup.gd").new()
	intro.add_child(setup)
	setup.configuration_ready.connect(_capture_configuration)
	await process_frame

	setup.show_after_intro()
	_expect(setup.showing, "setup is visible after the intro")
	_expect(setup._active_count() == 1, "only أنا is active by default")
	_expect(str(setup.seats[0]["label"]) == "أنا", "the first seat is أنا")

	setup._on_color_selected(1, 0)
	_expect(str(setup.seats[0]["color"]) == "blue", "the first player can choose blue")
	_expect(str(setup.seats[1]["color"]) == "marble", "an inactive seat receives the swapped colour")

	setup._add_player()
	setup._on_color_selected(2, 1)
	setup._add_player()
	_expect(setup._active_count() == 3, "the add control enables up to four players")
	_expect(_active_colours_are_unique(setup.seats), "active player colours never repeat")

	setup._on_mode_selected(1, 1)
	setup.rounds = 5
	setup._emit_configuration()
	_expect(emitted_configuration.size() > 0, "the setup emits a match configuration")
	var players: Array = emitted_configuration.get("players", []) as Array
	_expect(players.size() == 3, "the emitted player count matches the active seats")
	if players.size() >= 2:
		_expect(str((players[0] as Dictionary).get("mode", "")) == "local", "أنا remains the local seat")
		_expect(str((players[1] as Dictionary).get("mode", "")) == "bot", "a second seat retains its selected mode")
	_expect(int(emitted_configuration.get("rounds", 0)) == 5, "the selected round count is emitted")

	if failures.is_empty():
		print("YAKOLAK_SETUP_HEADLESS_OK")
		quit(0)
	else:
		for failure: String in failures:
			push_error(failure)
		quit(1)


func _capture_configuration(configuration: Dictionary) -> void:
	emitted_configuration = configuration.duplicate(true)


func _active_colours_are_unique(seats: Array) -> bool:
	var seen: Dictionary = {}
	for seat_value: Variant in seats:
		var seat: Dictionary = seat_value as Dictionary
		if not bool(seat.get("active", false)):
			continue
		var colour: String = str(seat.get("color", ""))
		if seen.has(colour):
			return false
		seen[colour] = true
	return true


func _expect(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)
