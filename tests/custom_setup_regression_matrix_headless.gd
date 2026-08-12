extends SceneTree

# CUSTOM-18 — deterministic coverage of the actually supported setup matrix.
# Custom is p1 local plus local/bot secondary seats. Online is a separate
# room-wide shortcut and is compared against the pre-Custom canonical model.

class SetupHost:
	extends Node3D
	var camera: Camera3D
	var playing: bool = false

const CUSTOM_SETUP := preload("res://scripts/session_setup_state_inventory.gd")
const LEGACY_SETUP := preload("res://scripts/session_setup.gd")
const DEFAULT_COLORS: Array[String] = ["marble", "blue", "gold", "green"]

var failures: Array[String] = []
var captures: Dictionary = {}
var capture_counts: Dictionary = {}


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	await _verify_every_supported_custom_configuration()
	await _verify_quick_online_equivalence()
	await _verify_invalid_states_are_rejected()
	await _verify_back_edit_cancel_and_count_changes()

	if failures.is_empty():
		print("YAKOLAK_CUSTOM_SETUP_MATRIX_OK custom=14 online=3 navigation=covered invalid=covered")
		quit(0)
		return
	for failure: String in failures:
		push_error(failure)
	quit(1)


func _verify_every_supported_custom_configuration() -> void:
	var case_number: int = 0
	for player_count: int in [2, 3, 4]:
		var combinations: int = 1 << (player_count - 1)
		for mask: int in range(combinations):
			var key: String = "custom-%d-%d" % [player_count, mask]
			var host := SetupHost.new()
			root.add_child(host)
			var setup = CUSTOM_SETUP.new()
			host.add_child(setup)
			setup.configuration_ready.connect(_capture.bind(key))
			await process_frame

			setup._start_new_game_flow()
			setup._choose_player_count(player_count)
			setup._begin_custom_setup()
			var expected_modes: Array[String] = ["local"]
			for seat_index: int in range(1, player_count):
				var mode_id: String = "bot" if ((mask >> (seat_index - 1)) & 1) == 1 else "local"
				expected_modes.append(mode_id)
				setup._choose_mode(seat_index, mode_id)
			_expect(str(setup.wizard_step) == "rounds", "%s reaches rounds through supported seats" % key)

			setup._choose_rounds(3)
			var requested_host_color: String = DEFAULT_COLORS[case_number % DEFAULT_COLORS.size()]
			setup._choose_wizard_color(requested_host_color)
			var requested_colors: Array[String] = _active_colors(setup.seats)
			setup._continue_after_color()
			_expect(str(setup.active_screen) == "question", "%s reaches the existing local/bot knowledge step" % key)
			setup._finish_knowledge_decision(false)

			_expect(int(capture_counts.get(key, 0)) == 1, "%s emits exactly once" % key)
			var configuration: Dictionary = captures.get(key, {}) as Dictionary
			_assert_configuration(configuration, player_count, expected_modes, requested_colors, key)
			_expect(not configuration.has("custom"), "%s does not create a Custom-only schema" % key)
			_expect(str(configuration.get("online_join_code", "")) == "", "%s keeps canonical empty join code" % key)
			case_number += 1

			host.queue_free()
			await process_frame

	_expect(case_number == 14, "the actual Custom matrix contains exactly 14 valid local/bot combinations")


func _verify_quick_online_equivalence() -> void:
	for player_count: int in [2, 3, 4]:
		var quick_key: String = "quick-online-%d" % player_count
		var legacy_key: String = "legacy-online-%d" % player_count

		var quick_host := SetupHost.new()
		root.add_child(quick_host)
		var quick = CUSTOM_SETUP.new()
		quick_host.add_child(quick)
		quick.configuration_ready.connect(_capture.bind(quick_key))
		await process_frame
		quick._start_new_game_flow()
		quick._choose_player_count(player_count)
		quick._choose_mode(1, "online")
		_expect(str(quick.wizard_step) == "rounds", "%s still takes the direct all-online shortcut" % quick_key)
		quick._choose_rounds(3)
		quick._continue_after_color()
		_expect(int(capture_counts.get(quick_key, 0)) == 1, "%s emits exactly once" % quick_key)

		var legacy_host := SetupHost.new()
		root.add_child(legacy_host)
		var legacy = LEGACY_SETUP.new()
		legacy_host.add_child(legacy)
		legacy.configuration_ready.connect(_capture.bind(legacy_key))
		await process_frame
		for _index: int in range(1, player_count):
			legacy._add_player()
		legacy._on_mode_selected(2, 1)
		legacy.rounds = 3
		legacy.tutorial_requested = false
		legacy._emit_configuration()
		_expect(int(capture_counts.get(legacy_key, 0)) == 1, "%s baseline emits exactly once" % legacy_key)

		var quick_configuration: Dictionary = captures.get(quick_key, {}) as Dictionary
		var legacy_configuration: Dictionary = captures.get(legacy_key, {}) as Dictionary
		_expect(
			_canonical_setup_signature(quick_configuration) == _canonical_setup_signature(legacy_configuration),
			"%s keeps the pre-Custom canonical tutorial/rounds/join-code + seat/mode/color setup" % quick_key
		)
		var expected_modes: Array[String] = ["local"]
		for _index: int in range(1, player_count):
			expected_modes.append("online")
		_assert_configuration(quick_configuration, player_count, expected_modes, DEFAULT_COLORS.slice(0, player_count), quick_key)

		quick_host.queue_free()
		legacy_host.queue_free()
		await process_frame


func _verify_invalid_states_are_rejected() -> void:
	# Duplicate colors are rejected at the final canonical emission barrier.
	var color_key := "invalid-duplicate-color"
	var color_host := SetupHost.new()
	root.add_child(color_host)
	var color_setup = CUSTOM_SETUP.new()
	color_host.add_child(color_setup)
	color_setup.configuration_ready.connect(_capture.bind(color_key))
	await process_frame
	color_setup._start_new_game_flow()
	color_setup._choose_player_count(3)
	color_setup._begin_custom_setup()
	color_setup._choose_mode(1, "local")
	color_setup._choose_mode(2, "bot")
	var duplicate: Dictionary = color_setup.seats[1]
	duplicate["color"] = str(color_setup.seats[0]["color"])
	color_setup.seats[1] = duplicate
	color_setup._emit_configuration()
	_expect(int(capture_counts.get(color_key, 0)) == 0, "duplicate color cannot emit a configuration")
	_expect(str(color_setup.online_error_text).contains("تكرار لون"), "duplicate color reports the canonical validation error")

	# Custom cannot select online through UI/test hooks, and a corrupted mixed
	# online+bot state is still rejected before it reaches gameplay.
	var mixed_key := "invalid-mixed-online"
	var mixed_host := SetupHost.new()
	root.add_child(mixed_host)
	var mixed = CUSTOM_SETUP.new()
	mixed_host.add_child(mixed)
	mixed.configuration_ready.connect(_capture.bind(mixed_key))
	await process_frame
	mixed._start_new_game_flow()
	mixed._choose_player_count(3)
	mixed._begin_custom_setup()
	mixed._choose_mode(1, "online")
	_expect(str(mixed.seats[1]["mode"]) == "local", "Custom ignores impossible online selection")
	_expect(str(mixed.wizard_step) == "mode:1", "impossible Custom selection cannot advance the wizard")
	var second: Dictionary = mixed.seats[1]
	second["mode"] = "online"
	mixed.seats[1] = second
	var third: Dictionary = mixed.seats[2]
	third["mode"] = "bot"
	mixed.seats[2] = third
	mixed._emit_configuration()
	_expect(int(capture_counts.get(mixed_key, 0)) == 0, "corrupted online+bot state cannot emit")
	_expect(str(mixed.online_error_text).contains("لا يمكن خلط الأونلاين"), "mixed online state reports the room-wide protocol constraint")

	# An inactive logical seat cannot be selected by index. Canonical seat ids are
	# generated from active order and asserted unique in every valid case above;
	# the network owner gate separately rejects duplicate ids.
	var inactive_before: String = str(mixed.seats[3]["mode"])
	mixed._choose_mode(3, "bot")
	_expect(str(mixed.seats[3]["mode"]) == inactive_before, "inactive seat selection is ignored")

	color_host.queue_free()
	mixed_host.queue_free()
	await process_frame


func _verify_back_edit_cancel_and_count_changes() -> void:
	var key := "navigation-final"
	var host := SetupHost.new()
	root.add_child(host)
	var setup = CUSTOM_SETUP.new()
	host.add_child(setup)
	setup.configuration_ready.connect(_capture.bind(key))
	await process_frame

	setup._start_new_game_flow()
	setup._choose_player_count(4)
	setup._begin_custom_setup()
	setup._choose_mode(1, "bot")
	setup._choose_mode(2, "local")
	setup._choose_mode(3, "bot")
	_expect(str(setup.wizard_step) == "rounds", "four-player customization reaches rounds")

	# Back and edit the last seat, then walk back to the first Custom choice.
	setup._wizard_back()
	_expect(str(setup.wizard_step) == "mode:3", "Back returns to the last edited seat")
	setup._choose_mode(3, "local")
	_expect(str(setup.seats[3]["mode"]) == "local", "editing a Custom seat replaces its prior choice")
	setup._wizard_back()
	setup._wizard_back()
	setup._wizard_back()
	_expect(str(setup.wizard_step) == "mode:1", "Back can reach the first Custom seat")
	setup._wizard_back()
	_expect(not bool(setup.custom_setup_active), "Back from the first Custom seat cancels Custom without corrupting seat state")
	_expect(str(setup.wizard_step) == "mode:1", "cancel returns to the existing quick-online choice screen")
	await process_frame
	var quick_buttons: Array[String] = _button_texts(setup.body)
	_expect(quick_buttons.has("مخصص"), "cancel restores the Custom entry control")
	_expect(quick_buttons.has("الكل أونلاين"), "cancel restores the established all-online control")

	# Back once more to player count. Choosing a smaller count must reset every
	# secondary mode before a new customization so stale 4-player choices cannot
	# survive as hidden/impossible state.
	setup._wizard_back()
	_expect(str(setup.wizard_step) == "count", "Back from quick mode returns to player count")
	setup._choose_player_count(2)
	_expect(setup._active_count() == 2, "player count can change after customization")
	for seat_index: int in range(1, setup.seats.size()):
		_expect(str(setup.seats[seat_index]["mode"]) == "local", "count change clears stale mode on seat %d" % (seat_index + 1))
	setup._begin_custom_setup()
	setup._choose_mode(1, "bot")
	setup._choose_rounds(5)
	setup._choose_wizard_color("green")
	var requested_colors: Array[String] = _active_colors(setup.seats)
	setup._continue_after_color()
	setup._finish_knowledge_decision(false)
	_expect(int(capture_counts.get(key, 0)) == 1, "edited two-player Custom setup emits once")
	_assert_configuration(captures.get(key, {}) as Dictionary, 2, ["local", "bot"], requested_colors, key)
	_expect(int((captures.get(key, {}) as Dictionary).get("rounds", 0)) == 5, "edited round count survives final emission")

	host.queue_free()
	await process_frame


func _capture(configuration: Dictionary, key: String) -> void:
	capture_counts[key] = int(capture_counts.get(key, 0)) + 1
	captures[key] = configuration.duplicate(true)


func _canonical_setup_signature(configuration: Dictionary) -> Dictionary:
	var canonical_players: Array[Dictionary] = []
	var players: Array = configuration.get("players", []) as Array
	for player_value: Variant in players:
		var player: Dictionary = player_value as Dictionary
		canonical_players.append({
			"seat": str(player.get("seat", "")),
			"mode": str(player.get("mode", "")),
			"color": str(player.get("color", "")),
		})
	return {
		"tutorial": bool(configuration.get("tutorial", false)),
		"rounds": int(configuration.get("rounds", 0)),
		"players": canonical_players,
		"online_join_code": str(configuration.get("online_join_code", "")),
	}


func _assert_configuration(configuration: Dictionary, player_count: int, expected_modes: Array, expected_colors: Array, label: String) -> void:
	var players: Array = configuration.get("players", []) as Array
	_expect(players.size() == player_count, "%s canonical player count matches request" % label)
	_expect(int(configuration.get("rounds", 0)) in [3, 5], "%s carries a supported round target" % label)
	if players.size() != player_count:
		return
	for index: int in range(player_count):
		var player: Dictionary = players[index] as Dictionary
		_expect(str(player.get("seat", "")) == "p%d" % (index + 1), "%s seat %d keeps canonical id" % [label, index + 1])
		_expect(str(player.get("mode", "")) == expected_modes[index], "%s seat %d keeps requested owner type" % [label, index + 1])
		_expect(str(player.get("color", "")) == expected_colors[index], "%s seat %d keeps requested color" % [label, index + 1])
	_expect(_player_values_are_unique(players, "seat"), "%s canonical seats are unique" % label)
	_expect(_player_values_are_unique(players, "color"), "%s canonical colors are unique" % label)


func _active_colors(seats: Array) -> Array[String]:
	var colors: Array[String] = []
	for seat_value: Variant in seats:
		var seat: Dictionary = seat_value as Dictionary
		if bool(seat.get("active", false)):
			colors.append(str(seat.get("color", "")))
	return colors


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
