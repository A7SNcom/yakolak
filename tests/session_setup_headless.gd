extends SceneTree

# Fast UI-state coverage that does not need a GPU/browser. Browser smoke
# tests cover actual tapping; this protects the player count and colour swap
# rules before a Web export is made.

class SetupHost:
	extends Node3D
	var camera: Camera3D
	var playing: bool = false

var failures: Array[String] = []
var emitted_configuration: Dictionary = {}
var custom_emitted_configuration: Dictionary = {}
var custom_emit_count: int = 0


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
	_expect(str(setup.active_screen) == "question", "the first post-intro screen is the knowledge question")
	var embedded_font := load("res://assets/fonts/DejaVuSans.ttf") as FontFile
	_expect(embedded_font != null and embedded_font.has_char(0x0623), "the embedded font includes Arabic glyphs")
	_expect(setup._active_count() == 1, "only أنا is active by default")
	_expect(str(setup.seats[0]["label"]) == "أنا", "the first seat is أنا")
	setup._open_setup(true)
	_expect(str(setup.active_screen) == "setup", "learning enters setup without an extra reading screen")
	_expect(bool(setup.tutorial_requested), "learning is carried into the first real move")

	setup._on_color_selected(1, 0)
	_expect(str(setup.seats[0]["color"]) == "blue", "the first player can choose blue")
	_expect(str(setup.seats[1]["color"]) == "marble", "an inactive seat receives the swapped colour")

	setup._add_player()
	setup._on_color_selected(2, 1)
	setup._add_player()
	_expect(setup._active_count() == 3, "the add control enables up to four players")
	_expect(_active_colours_are_unique(setup.seats), "active player colours never repeat")
	setup._add_player()
	setup._add_player()
	_expect(setup._active_count() == 4, "the player count is capped at four")
	_expect(_active_colours_are_unique(setup.seats), "all four player colours remain unique")
	setup._remove_player()

	setup._on_mode_selected(2, 1)
	_expect(str(setup.seats[1]["mode"]) == "online" and str(setup.seats[2]["mode"]) == "online", "online mode never leaves an unplayable mixed room")
	setup._on_mode_selected(1, 1)
	_expect(str(setup.seats[1]["mode"]) == "bot" and str(setup.seats[2]["mode"]) == "local", "leaving online mode restores local and bot choices")
	setup.rounds = 5
	setup._emit_configuration()
	_expect(emitted_configuration.size() > 0, "the setup emits a match configuration")
	var players: Array = emitted_configuration.get("players", []) as Array
	_expect(players.size() == 3, "the emitted player count matches the active seats")
	if players.size() >= 2:
		_expect(str((players[0] as Dictionary).get("mode", "")) == "local", "أنا remains the local seat")
		_expect(str((players[1] as Dictionary).get("mode", "")) == "bot", "a second seat retains its selected mode")
	_expect(int(emitted_configuration.get("rounds", 0)) == 5, "the selected round count is emitted")
	_expect(bool(emitted_configuration.get("tutorial", false)), "the action-led tutorial flag reaches gameplay")

	await _run_custom_setup_regression()

	intro.queue_free()
	await process_frame
	if failures.is_empty():
		print("YAKOLAK_SETUP_HEADLESS_OK")
		quit(0)
	else:
		for failure: String in failures:
			push_error(failure)
		quit(1)


func _run_custom_setup_regression() -> void:
	var host := SetupHost.new()
	root.add_child(host)
	var setup := preload("res://scripts/session_setup_state_inventory.gd").new()
	host.add_child(setup)
	setup.configuration_ready.connect(_capture_custom_configuration)
	await process_frame

	# The current quick all-online route stays on the exact established handler:
	# first opponent -> online means every active secondary seat becomes online and
	# the wizard advances directly to rounds.
	setup._start_new_game_flow()
	setup._choose_player_count(3)
	var quick_buttons: Array[String] = _button_texts(setup.body)
	_expect(quick_buttons.has("الكل أونلاين"), "the existing all-online shortcut remains visible")
	_expect(quick_buttons.has("مخصص"), "Custom is a clearly named option beside all-online")
	setup._choose_mode(1, "online")
	_expect(str(setup.seats[1]["mode"]) == "online" and str(setup.seats[2]["mode"]) == "online", "all-online still makes every active secondary seat online")
	_expect(str(setup.wizard_step) == "rounds", "all-online still skips directly to rounds")

	# Valid Custom: p1 local + p2 same-device + p3 bot. This must emit through
	# the same canonical configuration shape used by existing gameplay.
	setup._start_new_game_flow()
	setup._choose_player_count(3)
	setup._begin_custom_setup()
	_expect(bool(setup.custom_setup_active), "Custom enters the existing per-seat setup path")
	var custom_buttons: Array[String] = _button_texts(setup.body)
	_expect(custom_buttons.has("على نفس الجهاز") and custom_buttons.has("كمبيوتر"), "Custom exposes only supported local and bot seat types")
	_expect(not custom_buttons.has("الكل أونلاين"), "Custom does not present a mixed-online control")
	setup._choose_mode(1, "local")
	setup._choose_mode(2, "bot")
	_expect(str(setup.wizard_step) == "rounds", "Custom reuses the normal seat wizard through the last active seat")
	setup._choose_rounds(3)
	setup._choose_wizard_color("green")
	setup._continue_after_color()
	setup._finish_knowledge_decision(false)
	_expect(custom_emit_count == 1, "one valid mixed Custom configuration emits exactly once")
	var custom_players: Array = custom_emitted_configuration.get("players", []) as Array
	_expect(custom_players.size() == 3, "Custom persists the selected active seats")
	if custom_players.size() == 3:
		_expect(str((custom_players[0] as Dictionary).get("mode", "")) == "local", "Custom keeps p1 locally owned")
		_expect(str((custom_players[1] as Dictionary).get("mode", "")) == "local", "Custom keeps the same-device seat local")
		_expect(str((custom_players[2] as Dictionary).get("mode", "")) == "bot", "Custom keeps the bot seat")
		_expect(_player_values_are_unique(custom_players, "seat"), "Custom canonical seats never duplicate")
		_expect(_player_values_are_unique(custom_players, "color"), "Custom canonical colours never duplicate")
	_expect(not custom_emitted_configuration.has("custom"), "Custom does not create a parallel configuration schema")
	_expect(str(custom_emitted_configuration.get("online_join_code", "")) == "", "Custom uses the existing canonical room configuration fields")

	# Invalid combination: even a future caller that mutates seat state directly
	# cannot emit online + bot. The UI hook is guarded first, then the final
	# canonical emission barrier rejects a deliberately corrupted mixed state.
	var invalid_host := SetupHost.new()
	root.add_child(invalid_host)
	var invalid_setup := preload("res://scripts/session_setup_state_inventory.gd").new()
	invalid_host.add_child(invalid_setup)
	invalid_setup.configuration_ready.connect(_capture_custom_configuration)
	await process_frame
	invalid_setup._start_new_game_flow()
	invalid_setup._choose_player_count(3)
	invalid_setup._begin_custom_setup()
	invalid_setup._choose_mode(1, "online")
	_expect(str(invalid_setup.seats[1]["mode"]) == "local", "Custom test hooks cannot select online")
	var second: Dictionary = invalid_setup.seats[1]
	second["mode"] = "online"
	invalid_setup.seats[1] = second
	var third: Dictionary = invalid_setup.seats[2]
	third["mode"] = "bot"
	invalid_setup.seats[2] = third
	var emit_count_before_invalid: int = custom_emit_count
	invalid_setup._emit_configuration()
	_expect(custom_emit_count == emit_count_before_invalid, "unsupported online + bot configuration is rejected before emission")
	_expect(str(invalid_setup.online_error_text).contains("لا يمكن خلط الأونلاين"), "invalid Custom combination reports the shared protocol constraint")

	host.queue_free()
	invalid_host.queue_free()
	await process_frame


func _capture_configuration(configuration: Dictionary) -> void:
	emitted_configuration = configuration.duplicate(true)


func _capture_custom_configuration(configuration: Dictionary) -> void:
	custom_emit_count += 1
	custom_emitted_configuration = configuration.duplicate(true)


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


func _button_texts(node: Node) -> Array[String]:
	var values: Array[String] = []
	if node is Button:
		values.append((node as Button).text)
	for child: Node in node.get_children():
		values.append_array(_button_texts(child))
	return values


func _player_values_are_unique(players: Array, field: String) -> bool:
	var seen: Dictionary = {}
	for player_value: Variant in players:
		var player: Dictionary = player_value as Dictionary
		var value: String = str(player.get(field, ""))
		if value.is_empty() or seen.has(value):
			return false
		seen[value] = true
	return true


func _expect(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)