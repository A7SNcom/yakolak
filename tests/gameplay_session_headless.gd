extends SceneTree

# Exercises the session controller on the actual scene: it starts a local
# match, makes a physical move, then lets the bot complete a turn.

var failures: Array[String] = []


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var intro := preload("res://scenes/intro.tscn").instantiate()
	root.add_child(intro)
	await process_frame
	intro.playing = false
	for _frame in range(6):
		await process_frame

	var game: Node = intro.get_node_or_null("PostIntroGameplay")
	_expect(game != null, "the post-intro controller exists")
	if game == null:
		_finish()
		return
	_expect(bool(game.waiting_for_setup), "the board waits for the compact setup")
	_expect(bool(game.intro_runtime_suspended), "completed intro workers are suspended during setup/gameplay")
	_expect(not intro.get_viewport().size_changed.is_connected(Callable(intro, "_fit_camera")), "intro resize no longer overwrites the gameplay camera")
	_expect(game.ARABIC_FONT.has_char(0x0623), "the gameplay HUD font includes Arabic glyphs")
	_expect(float(game.DROP_RADIUS) <= 23.0, "board tap targets do not overlap adjacent cells")
	_expect(game._should_host_online({"players": [
		{"mode": "local"}, {"mode": "online"}
	]}), "a host plus online invitee creates an online room")
	_expect(not game._should_host_online({"players": [
		{"mode": "local"}, {"mode": "online"}, {"mode": "bot"}
	]}), "mixed local/online seats are rejected before a room is created")

	game._on_configuration_ready({
		"tutorial": true,
		"rounds": 3,
		"online_join_code": "",
		"players": [
			{"seat": "p1", "label": "أنا", "mode": "local", "color": "marble", "color_name": "أبيض", "direction": "right"},
			{"seat": "p2", "label": "اللاعب 2", "mode": "bot", "color": "blue", "color_name": "أزرق", "direction": "back"},
		]
	})
	await create_timer(0.80).timeout
	_expect(bool(game.match_initialized), "a local match starts after configuration")
	_expect(str(game._current_direction()) == "right", "the first turn uses the first player's physical side")
	_expect(bool(game.gameplay_ready), "the first player becomes interactive after the camera settles")
	_expect(int(game.turn_deadline_msec) == 0, "local play uses the same untimed rules as online")
	_expect(not bool(intro.get_node("Base_left").visible) and not bool(intro.get_node("Base_front").visible), "unused player sides are removed from the playable table")
	var strong_rank: int = int(game._bot_choice_rank("back"))
	game.round_number = 2
	var weak_rank: int = int(game._bot_choice_rank("back"))
	game.round_number = 1
	_expect(strong_rank < weak_rank, "the restored bot gets deliberately weaker on its weak round")

	var piece_index: int = -1
	for index: int in range(game.piece_records.size()):
		var record: Dictionary = game.piece_records[index] as Dictionary
		if str(record.get("dir", "")) == "right" and str(record.get("type", "")) == "large":
			piece_index = index
			break
	_expect(piece_index >= 0, "a physical large stone is available for the first player")
	if piece_index >= 0:
		game._select_piece(piece_index)
		_expect(bool(game.tray_open), "tapping a nested stack fans its available sizes open")
		_expect((game.tray_indices as Array).size() == 3, "the first stack exposes large, medium, and small choices")
		game._begin_move(4)
		_expect(not bool(game.tray_open), "the size tray closes when a move begins")
		await create_timer(0.85).timeout
		_expect(int(game.move_count) >= 1, "the selected stone reaches the board")
		_expect(bool(game.tutorial_complete), "the tutorial completes after the first move")
		await create_timer(1.75).timeout
		_expect(int(game.move_count) >= 2, "the configured bot takes a legal follow-up turn")

	game.pending_online_configuration = {"online_join_code": ""}
	game._on_online_error("online_unavailable")
	await process_frame
	_expect(bool(game.waiting_for_setup), "an online failure returns control to setup")
	var setup: Node = intro.get_node_or_null("SessionSetup")
	_expect(setup != null and bool(setup.showing), "the setup is visible again after an online failure")

	_finish()


func _expect(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)


func _finish() -> void:
	if failures.is_empty():
		print("YAKOLAK_GAMEPLAY_SESSION_HEADLESS_OK")
		quit(0)
		return
	for failure: String in failures:
		push_error(failure)
	quit(1)
