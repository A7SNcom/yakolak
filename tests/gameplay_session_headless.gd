extends SceneTree

# Headless gameplay contract for whichever controller the live scene uses.
# The current main uses the complete YAKOLAK 3.0 local-match controller.

var failures: Array[String] = []


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var intro := preload("res://scenes/intro.tscn").instantiate()
	root.add_child(intro)
	await process_frame
	intro.playing = false
	for _frame in range(8):
		await process_frame

	var full_match: Node = intro.get_node_or_null("LocalMatchGameplay")
	if full_match != null:
		await _verify_full_match(intro, full_match)
		_finish()
		return

	var session: Node = intro.get_node_or_null("PostIntroGameplay")
	_expect(session != null, "a gameplay controller exists")
	if session == null:
		_finish()
		return
	_expect(bool(session.waiting_for_setup), "the session waits for setup")
	_expect(float(session.DROP_RADIUS) <= 23.0, "board tap targets do not overlap adjacent cells")
	_finish()


func _verify_full_match(intro: Node, game: Node) -> void:
	await create_timer(0.75).timeout
	_expect(bool(game.match_initialized), "the complete local match initializes")
	_expect((game.PLAYER_DIRECTIONS as Array).size() == 4, "the complete match has four physical player sides")
	_expect(str(game._current_direction()) == "right", "the first turn starts from the white/right side")
	_expect(int(game.MATCH_ROUNDS) == 3, "the complete match contains three rounds")
	_expect(int(game.TURN_DURATION_MS) == 18000, "the complete match keeps its turn timer")
	_expect(float(game.DROP_RADIUS) <= 23.0, "board tap targets do not overlap adjacent cells")

	var piece_index: int = -1
	for index: int in range(game.piece_records.size()):
		var record: Dictionary = game.piece_records[index] as Dictionary
		if str(record.get("dir", "")) == "right" and str(record.get("type", "")) == "large":
			piece_index = index
			break
	_expect(piece_index >= 0, "the first player has a physical large stone")
	if piece_index < 0:
		return

	# The active-turn camera may briefly lock input while rotating.
	await create_timer(0.75).timeout
	game.gameplay_ready = true
	game._select_piece(piece_index)
	game._begin_move(4)
	await create_timer(0.85).timeout
	_expect(int(game.move_count) >= 1, "a legal first move reaches the board")
	_expect(str(game._current_direction()) == "back", "the turn advances to the second player")
	_expect(not bool(game.round_complete), "the complete match continues after the first move")
	print("YAKOLAK_FULL_MATCH_HEADLESS_OK players=4 rounds=3")


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
