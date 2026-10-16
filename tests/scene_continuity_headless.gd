extends SceneTree

# Real production scene, physical poses sampled between lifecycle boundaries.
# Networking remains covered by transport contracts and owner device acceptance.
var failures: Array[String] = []
var checks := 0
var intro: Node
var game: Node
var setup: Node
var camera: Camera3D

func _init() -> void:
	call_deferred("_run")

func _expect(value: bool, message: String) -> void:
	checks += 1
	if not value: failures.append(message)

func _watch(seconds: float) -> void:
	var end := Time.get_ticks_msec()+int(seconds*1000.0)
	var previous := camera.transform
	var at := Time.get_ticks_msec()
	while Time.get_ticks_msec()<end:
		await process_frame
		var now := Time.get_ticks_msec()
		var delta := maxf(float(now-at)/1000.0,0.001)
		_expect(camera.position.distance_to(previous.origin)<0.25+80.0*delta,"camera never cuts between lifecycle owners")
		_expect(camera.basis.get_rotation_quaternion().angle_to(previous.basis.get_rotation_quaternion())<0.05+5.0*delta,"camera orientation remains continuous")
		previous=camera.transform
		at=now

func _piece(direction: String) -> MeshInstance3D:
	for record: Dictionary in game.get("piece_records"):
		if record.dir==direction: return record.mesh
	return null

func _preview(step: String) -> void:
	setup.call("_on_visual_action",[JSON.stringify({"action":"preview","step":step,"count_chosen":true,"all_seats":[{"color":"marble","mode":"local"},{"color":"green","mode":"local"},{"color":"blue","mode":"none"},{"color":"gold","mode":"none"}]})])

func _run() -> void:
	root.size=Vector2i(390,844)
	intro=preload("res://scenes/intro.tscn").instantiate()
	root.add_child(intro)
	await process_frame
	game=intro.get_node("PostIntroGameplay")
	setup=intro.get_node("SessionSetup")
	intro.call("_restart_intro")
	intro.call("_snap_final")
	intro.set("playing",false)
	intro.call("_publish_complete")
	for frame in range(6): await process_frame
	camera=intro.get("camera")
	await _watch(1.4)
	var before := camera.transform
	var inactive := _piece("back")
	var original := (inactive.material_override as BaseMaterial3D).albedo_color
	_preview("ready")
	_expect(camera.transform.is_equal_approx(before),"setup refit retains the first visible pose")
	_expect((inactive.material_override as BaseMaterial3D).albedo_color.is_equal_approx(original),"dimming starts at displayed hue")
	await _watch(0.12)
	var between := (inactive.material_override as BaseMaterial3D).albedo_color
	_expect(not between.is_equal_approx(original) and not between.is_equal_approx(Color("#191a1c")),"inactive color has intermediate shades")
	await _watch(0.65)
	_expect(not camera.transform.is_equal_approx(before),"ready framing moves to its new endpoint")
	_expect((inactive.material_override as BaseMaterial3D).albedo_color.is_equal_approx(Color("#191a1c")),"inactive color settles exactly")
	before=camera.transform
	_preview("color")
	_expect(camera.transform.is_equal_approx(before),"reverse setup refit also preserves first pose")
	await _watch(0.8)
	_preview("ready")
	await _watch(0.8)
	before=camera.transform
	var piece_pose := inactive.transform
	setup.call("_on_visual_action",[JSON.stringify({"action":"start","rounds":3,"players":[{"color":"marble","mode":"local","label":"أحمد","device_owner":"p1"},{"color":"green","mode":"local","label":"ريم","device_owner":"p1"}]})])
	_expect(camera.transform.is_equal_approx(before),"local match begins at exact setup shot")
	_expect(inactive.visible and inactive.transform.is_equal_approx(piece_pose),"unused stones do not disappear on match start")
	await _watch(0.20)
	_expect(inactive.visible and inactive.position.y>piece_pose.origin.y,"unused stones physically rise before leaving")
	await _watch(1.2)
	_expect(not inactive.visible and inactive.position.y>40.0,"unused stones hide only above the scene")
	var home_camera := camera.transform
	var available: Array = game.call("_available_stack_indices","right",0)
	game.call("_open_piece_tray",available[0])
	await _watch(0.40)
	var raised := _piece("right")
	var raised_pose := raised.transform
	game.call("_return_to_setup")
	_expect(camera.transform.is_equal_approx(home_camera),"leaving starts at actual camera pose")
	_expect(raised.transform.is_equal_approx(raised_pose),"leaving preserves current raised stone pose")
	_expect(inactive.position.y>40.0,"returning unused stones enter from above")
	var return_target: Transform3D = game.get("lobby_return_target")
	var moving_pose := camera.transform
	camera.transform = return_target
	var focus := camera.unproject_position(intro.to_global(Vector3(0,0.35,0)))
	camera.transform = moving_pose
	var view_height := root.get_visible_rect().size.y
	_expect(absf(focus.y-view_height*0.51)<view_height*0.15,"return frames the destination table, excluding airborne exits focus=%s viewport=%s" % [str(focus),str(root.get_visible_rect().size)])
	await _watch(2.1)
	_expect(camera.transform.is_equal_approx(return_target),"setup adopts the return endpoint without a second zoom")
	_expect(bool(setup.get("visual_active")) and bool(game.get("waiting_for_setup")),"exit hands off to the existing setup")
	for index: int in range(game.get("piece_records").size()):
		var mesh: MeshInstance3D = game.get("piece_records")[index].mesh
		_expect(mesh.visible and mesh.transform.is_equal_approx(game.get("home_transforms")[index]),"all stones land at their exact physical homes")
	# Reverse a removal while in flight; stale completion must not hide the node.
	var motion = game.get("scene_motion")
	var target := inactive.transform
	motion.present(inactive,false,target,0.8)
	await _watch(0.18)
	var reversal := inactive.transform
	motion.present(inactive,true,target,0.55)
	_expect(inactive.transform.is_equal_approx(reversal),"reversing departure keeps its current pose")
	await _watch(0.9)
	_expect(inactive.visible and inactive.transform.is_equal_approx(target),"stale exit cannot hide a returned stone")
	intro.queue_free()
	await process_frame
	if failures.is_empty(): print("YAKOLAK_SCENE_CONTINUITY_OK checks=%d" % checks)
	else:
		for failure: String in failures: push_error(failure)
	quit(0 if failures.is_empty() else 1)
