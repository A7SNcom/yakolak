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
	await create_timer(0.4).timeout
	for record: Dictionary in intro.pieces:
		var material := record["mesh"].material_override as BaseMaterial3D
		var inactive: bool = record["dir"] in ["back", "left"]
		if inactive and not material.albedo_color.is_equal_approx(setup.visual_inactive_material.albedo_color):
			push_error("Seat dimming did not settle on its inactive color")
			quit(1)
			return
	setup._on_visual_action([JSON.stringify({"action":"setting","graphics_quality":"low","sound_enabled":false})])
	if game.graphics_quality != "low" or not game.quick_graphics_button.text.contains("منخفضة") or not AudioServer.is_bus_mute(0):
		push_error("Setup preferences must update the active gameplay settings state")
		quit(1)
		return
	setup._on_visual_action([JSON.stringify({"action":"setting","graphics_quality":"high","sound_enabled":true})])
	setup._on_visual_action([JSON.stringify({"action":"preview","step":"rounds","all_seats":[{"color":"green","mode":"local"},{"color":"marble","mode":"bot"},{"color":"blue","mode":"none"},{"color":"gold","mode":"none"}]})])
	await create_timer(0.16).timeout
	for record: Dictionary in intro.pieces:
		var alpha := (record["mesh"].material_override as BaseMaterial3D).albedo_color.a
		if alpha<=0.02 or alpha>=0.98:
			push_error("Table pieces must fade smoothly into the round selector")
			quit(1)
			return
	await create_timer(0.34).timeout
	for record: Dictionary in intro.pieces:
		if (record["mesh"].material_override as BaseMaterial3D).albedo_color.a>0.02:
			push_error("Table pieces did not finish fading before the round selector")
			quit(1)
			return
	for value: Variant in intro.bases.values():
		if (value.material_override as BaseMaterial3D).albedo_color.a>0.02:
			push_error("Side racks must fade with the pieces during round selection")
			quit(1)
			return
	for wins: int in [3,5]:
		if (intro.board.material_override as BaseMaterial3D).albedo_color.a>0.02:
			push_error("The board must fade so only round choices remain on the tabletop")
			quit(1)
			return
		var numeral = setup.visual_round_markers[wins].get_node("Numeral")
		if not numeral is MeshInstance3D or not numeral.mesh is TextMesh or numeral.mesh.depth<=0.0:
			push_error("Round choices must be solid extruded number meshes")
			quit(1)
			return
	await create_timer(0.9).timeout
	var round_geometry: Dictionary = setup._visual_seat_points()
	if not bool(round_geometry.get("rounds_ready",false)):
		push_error("Round choices did not settle into selectable positions")
		quit(1)
		return
	for point: Array in round_geometry["rounds"].values():
		if float(point[0])<=0.0 or float(point[0])>=1.0 or float(point[1])<=0.0 or float(point[1])>=1.0:
			push_error("Round choice hit targets must stay inside the viewport")
			quit(1)
			return
	var setup_pose := cam.transform
	setup.visual_reduce_motion = true
	setup._update_visual_seats()
	for record: Dictionary in intro.pieces:
		var faded := record.mesh.material_override as BaseMaterial3D
		if faded.albedo_color.a>0.02 or faded.transparency != BaseMaterial3D.TRANSPARENCY_ALPHA:
			push_error("Reduced motion must render the same transparent round-selection state")
			quit(1)
			return
	setup.visual_reduce_motion = false
	var original_css: Vector2 = setup.canvas_css_size
	setup.canvas_css_size = original_css * 0.5
	var high_dpi_geometry: Dictionary = setup._visual_seat_points()
	setup.canvas_css_size = original_css
	if high_dpi_geometry["rounds"] != round_geometry["rounds"]:
		push_error("Round hit targets must use engine viewport coordinates at any CSS pixel density")
		quit(1)
		return
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
	game._layout_quick_menu()
	var menu_center: Vector2 = game.quick_panel.get_rect().get_center()
	if menu_center.distance_to(root.get_visible_rect().size * 0.5)>1.0:
		push_error("The active gameplay settings panel must be centered")
		quit(1)
		return
	if not game.quick_exit_button.visible:
		push_error("Every match must expose leaving inside settings")
		quit(1)
		return
	var menu_touch := InputEventScreenTouch.new()
	menu_touch.pressed = true
	menu_touch.position = game.quick_button.get_global_rect().get_center()
	game._input(menu_touch)
	await process_frame
	if not game.quick_panel.visible:
		push_error("The settings gear must activate directly from a screen touch")
		quit(1)
		return
	var leave_touch := InputEventScreenTouch.new()
	leave_touch.pressed = true
	leave_touch.position = game.quick_exit_button.get_global_rect().get_center()
	var exit_pose := cam.transform
	game._input(leave_touch)
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
