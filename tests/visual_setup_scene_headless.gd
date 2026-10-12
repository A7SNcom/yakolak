extends SceneTree
func _init() -> void:
	call_deferred("_run")
func _run() -> void:
	var intro = preload("res://scenes/intro.tscn").instantiate()
	root.add_child(intro)
	var game = intro.get_node("PostIntroGameplay")
	var setup = intro.get_node("SessionSetup")
	var deadline := Time.get_ticks_msec() + 45000
	while Time.get_ticks_msec() < deadline and not game.waiting_for_setup:
		await process_frame
	if not game.waiting_for_setup or not setup.visual_active:
		push_error("Visual setup did not open after real intro")
		quit(1)
		return
	await process_frame
	setup._on_visual_action([JSON.stringify({"action":"preview","step":"ready","all_seats":[{"color":"green","mode":"local"},{"color":"marble","mode":"bot"},{"color":"blue","mode":"none"},{"color":"gold","mode":"none"}]})])
	setup._on_visual_action([JSON.stringify({"action":"start","rounds":3,"players":[{"color":"green","mode":"local","label":"أحمد","device_owner":"p1"},{"color":"marble","mode":"bot","label":"بوت","device_owner":"p1"}]})])
	await create_timer(0.8).timeout
	if not game.match_initialized or game.players.size() != 2 or setup.visual_active or game.tutorial_active:
		push_error("Configuration did not start real match")
		quit(1)
		return
	game._return_to_setup()
	await process_frame
	await process_frame
	if not setup.visual_active or not game.waiting_for_setup:
		push_error("Return to visual setup failed")
		quit(1)
		return
	print("YAKOLAK_VISUAL_SCENE_OK intro_to_setup_to_match_to_setup")
	intro.queue_free()
	await process_frame
	quit(0)
