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

	var piece_index: int = -1
	for index: int in range(game.piece_records.size()):
		var record: Dictionary = game.piece_records[index] as Dictionary
		if str(record.get("dir", "")) == "right" and str(record.get("type", "")) == "large":
			piece_index = index
			break
	_expect(piece_index >= 0, "a physical large stone is available for the first player")
	if piece_index >= 0:
		game._select_piece(piece_index)
		game._begin_move(4)
		await create_timer(0.85).timeout
		_expect(int(game.move_count) >= 1, "the selected stone reaches the board")
		_expect(bool(game.tutorial_complete), "the tutorial completes after the first move")
		await create_timer(1.75).timeout
		_expect(int(game.move_count) >= 2, "the configured bot takes a legal follow-up turn")

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
