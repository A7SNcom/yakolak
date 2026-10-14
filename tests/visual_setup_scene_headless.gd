extends SceneTree
func _init() -> void:
	call_deferred("_run")
func _run() -> void:
	var intro = preload("res://scenes/intro.tscn").instantiate()
	root.add_child(intro)
	var game = intro.get_node("PostIntroGameplay")
	var setup = intro.get_node("SessionSetup")
	if game.get_script() == null or setup.get_script() == null:
		push_error("Exported gameplay/setup script or an inherited dependency is missing")
		quit(1)
		return
	var deadline := Time.get_ticks_msec() + 45000
	while Time.get_ticks_msec() < deadline and not game.waiting_for_setup:
		await process_frame
	if not game.waiting_for_setup or not setup.visual_active:
		push_error("Visual setup did not open after real intro")
		quit(1)
		return
	if setup.visual_step != "entry" or setup.visual_entry_generation != 1:
		push_error("Intro handoff did not request room entry automatically")
		quit(1)
		return
	await process_frame
	if setup.visual_zoom_mix > 0.1:
		push_error("Setup camera should begin from the final intro frame")
		quit(1)
		return
	await create_timer(1.4).timeout
	if setup.visual_zoom_mix < 0.98:
		push_error("Setup camera did not settle smoothly into table framing")
		quit(1)
		return
	var framing: Dictionary = setup._visual_seat_points()
	var angles: Dictionary = framing.get("control_angles",{})
	if angles.size()!=4 or float(angles["blue"])*float(angles["green"])<=0.0 or float(angles["marble"])*float(angles["gold"])<=0.0 or float(angles["blue"])*float(angles["marble"])>=0.0:
		push_error("Seat controls must follow their rack edges across both near and far players")
		quit(1)
		return
	for angle: float in angles.values():
		if absf(angle)>10.0:
			push_error("Seat tilt exceeds the readable perspective limit")
			quit(1)
			return
	var table: Array = framing["board"]
	var table_ratio: Vector2 = Vector2(table[2],table[3])/setup.canvas_css_size
	if table_ratio.x < 0.65 and table_ratio.y < 0.40:
		push_error("Real table remains too far away")
		quit(1)
		return
	print("YAKOLAK_REAL_TABLE_FRAMING width_ratio=%.3f height_ratio=%.3f" % [table_ratio.x,table_ratio.y])
	var cam: Camera3D = intro.camera
	if absf(cam.basis.get_rotation_quaternion().angle_to(setup.visual_camera_snapshot["transform"].basis.get_rotation_quaternion()))>0.02:
		push_error("Setup changed the final intro angle")
		quit(1)
		return
	var generation: int = intro.intro_run_generation
	var tap := InputEventMouseButton.new()
	tap.button_index = MOUSE_BUTTON_LEFT
	tap.pressed = true
	tap.position = Vector2(360,640)
	Input.parse_input_event(tap)
	await process_frame
	await process_frame
	if intro.intro_run_generation != generation:
		push_error("Table tap restarted intro during setup")
		quit(1)
		return
	var touch := InputEventScreenTouch.new()
	touch.pressed = true
	touch.index = 0
	touch.position = Vector2(360,640)
	Input.parse_input_event(touch)
	var replay_key := InputEventKey.new()
	replay_key.pressed = true
	replay_key.keycode = KEY_R
	Input.parse_input_event(replay_key)
	await process_frame
	await process_frame
	if intro.intro_run_generation != generation or not setup.visual_active or not game.waiting_for_setup:
		push_error("Setup input restarted the completed intro")
		quit(1)
		return
	setup._on_visual_action([JSON.stringify({"action":"preview","step":"ready","all_seats":[{"color":"green","mode":"local"},{"color":"marble","mode":"bot"},{"color":"blue","mode":"none"},{"color":"gold","mode":"none"}]})])
	for record: Dictionary in intro.pieces:
		var material: Material = record["mesh"].material_override
		var inactive: bool = record["dir"] in ["back", "left"]
		if (material == setup.visual_inactive_material) != inactive:
			push_error("Seat dimming does not match active seats")
			quit(1)
			return
	setup._on_visual_action([JSON.stringify({"action":"preview","step":"rounds","count_chosen":true,"all_seats":[{"color":"green","mode":"local"},{"color":"marble","mode":"bot"},{"color":"blue","mode":"none"},{"color":"gold","mode":"none"}]})])
	for record: Dictionary in intro.pieces:
		if record["dir"] in ["back","left"] and record["mesh"].material_override != setup.visual_inactive_material:
			push_error("Inactive seats became active at win target question")
			quit(1)
			return
	var setup_pose := cam.transform
	var setup_fov := cam.fov
	setup._on_visual_action([JSON.stringify({"action":"start","rounds":3,"players":[{"color":"green","mode":"local","label":"أحمد","device_owner":"p1"},{"color":"marble","mode":"bot","label":"بوت","device_owner":"p1"}]})])
	if not cam.transform.is_equal_approx(setup_pose) or not is_equal_approx(cam.fov,setup_fov):
		push_error("Match camera snapped away from the settled setup frame")
		quit(1)
		return
	await create_timer(0.8).timeout
	if game.camera_transition:
		var focus: Vector2 = cam.unproject_position(intro.to_global(game.turn_camera_focus))
		if not root.get_visible_rect().has_point(focus):
			push_error("Camera orbit lost the board before settling")
			quit(1)
			return
	if not game.match_initialized or game.players.size() != 2 or setup.visual_active or game.tutorial_active:
		push_error("Configuration did not start real match")
		quit(1)
		return
	var exit_pose := cam.transform
	game._return_to_setup()
	if not cam.transform.is_equal_approx(exit_pose):
		push_error("Exit snapped the camera before its transition")
		quit(1)
		return
	await create_timer(1.8).timeout
	await process_frame
	await process_frame
	if not setup.visual_active or not game.waiting_for_setup:
		push_error("Return to visual setup failed")
		quit(1)
		return
	if setup.visual_entry_generation != 2:
		push_error("Return to setup reused a stale browser entry request")
		quit(1)
		return
	if absf(cam.basis.get_rotation_quaternion().angle_to(setup.visual_intro_camera_snapshot["transform"].basis.get_rotation_quaternion()))>0.02:
		push_error("Return to setup lost the accepted intro shot")
		quit(1)
		return
	print("YAKOLAK_VISUAL_SCENE_OK intro_to_setup_to_match_to_setup")
	intro.queue_free()
	await process_frame
	quit(0)
