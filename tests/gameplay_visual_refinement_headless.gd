extends SceneTree

var failures: Array[String] = []

func _init() -> void:
	call_deferred("_run")

func _expect(value: bool, message: String) -> void:
	if not value: failures.append(message)

func _run() -> void:
	var intro = preload("res://scenes/intro.tscn").instantiate()
	root.add_child(intro)
	var game = intro.get_node("PostIntroGameplay")
	var setup = intro.get_node("SessionSetup")
	var deadline := Time.get_ticks_msec() + 40000
	while not game.waiting_for_setup and Time.get_ticks_msec() < deadline:
		await process_frame
	if not game.waiting_for_setup:
		push_error("Intro did not hand off")
		quit(1)
		return
	var player_config: Array = []
	for i: int in range(4):
		player_config.append({"mode":"local","label":"اسم %d" % i,"color":["marble","blue","gold","green"][i],"device_owner":"p1"})
	setup._on_visual_action([JSON.stringify({"action":"start","rounds":3,"players":player_config})])
	await create_timer(1.0).timeout
	game.turn_deadline_msec = 0
	game._rm_enabled = true
	var projected: Array = []
	for direction: String in ["right","back","left","front"]:
		game.current_player_index = ["right","back","left","front"].find(direction)
		for dimensions: Vector2i in [Vector2i(390,844),Vector2i(1366,768),Vector2i(844,390)]:
			root.size = dimensions
			root.content_scale_size = dimensions
			await process_frame
			var axis: Vector3 = game.DIRECTION_VECTORS[direction]
			var mobile: bool = dimensions.x < dimensions.y
			intro.camera.position = axis * (28.0 if mobile else 18.5) + Vector3.UP * (23.0 if mobile else 15.5)
			intro.camera.look_at(Vector3(0,0.42,0),Vector3.UP)
			intro.camera.fov = 34.0 if mobile else 50.0
			var indices: Array[int] = game._available_stack_indices(direction,0)
			game._open_piece_tray(indices[1])
			_expect(game.selected_index == indices[1],"exact initial size retained")
			for index: int in indices:
				var source: StandardMaterial3D = game.home_materials[index]
				var material: StandardMaterial3D = game.piece_records[index]["mesh"].material_override
				var expected := source.albedo_color if index == game.selected_index else source.albedo_color.lerp(Color.BLACK,0.70)
				_expect(material.albedo_color.is_equal_approx(expected),"size dimming preserves hue")
				_expect(material.next_pass == null,"no outline in active selection")
			_expect(game._selection_emphasis_count() == 1,"only one selected owner")
			var small: MeshInstance3D = game.piece_records[game.tray_indices[2]]["mesh"]
			_expect(is_equal_approx(small.position.y-game.home_transforms[game.tray_indices[2]].origin.y,2*27.0*0.04),"increased tray gap")
			var tray_bounds: Array = []
			for index: int in game.tray_indices:
				var piece: MeshInstance3D = game.piece_records[index]["mesh"]
				var box := piece.get_aabb()
				var rect := Rect2(intro.camera.unproject_position(piece.to_global(box.get_endpoint(0))),Vector2.ZERO)
				for corner: int in range(8): rect = rect.expand(intro.camera.unproject_position(piece.to_global(box.get_endpoint(corner))))
				tray_bounds.append([rect.position.x,rect.position.y,rect.size.x,rect.size.y])
			var cells: Array = []
			for coordinate: Vector3 in game.CELL_COORDS:
				var point: Vector2 = intro.camera.unproject_position(coordinate * game.U)
				cells.append([point.x,point.y])
			for point_value: Array in cells:
				var point := Vector2(point_value[0],point_value[1])
				for bounds_value: Array in tray_bounds:
					var bounds_rect := Rect2(bounds_value[0],bounds_value[1],bounds_value[2],bounds_value[3])
					_expect(not bounds_rect.has_point(point),"raised stones never hide cell centers")
			for bounds_value: Array in tray_bounds:
				_expect(bounds_value[0] >= 0 and bounds_value[1] >= 0 and bounds_value[0]+bounds_value[2] <= dimensions.x and bounds_value[1]+bounds_value[3] <= dimensions.y,"raised stones remain onscreen")
			projected.append({"direction":direction,"size":[dimensions.x,dimensions.y],"tray":tray_bounds,"cells":cells})
			for size_name: String in ["small","medium","large"]:
				game._update_legal_markers(size_name,Color("#318849"))
				var flat: ArrayMesh = game._stone_footprint(size_name)
				_expect(flat != null,"native stone footprint exists")
				if flat != null:
					_expect(flat.get_aabb().size.y < 0.001,"legal hint is flat")
					_expect(flat.get_aabb().size.x < 1.9,"hint fits cell")
				_expect(game.target_markers[0].position.y > 0.48,"contour rests above board surface")
				_expect(game.legal_marker_pulse == null,"no legal hint wave")
			game._close_piece_tray(-1,true)
			_expect(game.choice_materials.is_empty(),"choice materials cleared")
	game.current_player_index = 3
	game._rm_enabled = false
	var available: Array[int] = game._available_stack_indices("front",0)
	game._open_piece_tray(available[0])
	await create_timer(0.40).timeout
	for index: int in game.tray_indices:
		var source: StandardMaterial3D = game.home_materials[index]
		var material: StandardMaterial3D = game.piece_records[index]["mesh"].material_override
		var target := source.albedo_color if index == game.selected_index else source.albedo_color.lerp(Color.BLACK,0.70)
		_expect(material.albedo_color.is_equal_approx(target),"animated dimming settles on correct color")
	game._close_piece_tray(-1,true)
	var winning: Array[int] = game._available_stack_indices("right",0)
	game._finish_round("right",winning)
	_expect(game.result_button.text == "استمرار","round button has text")
	_expect(game.result_button.position.y > root.get_visible_rect().size.y*0.65,"continue is below board")
	await create_timer(1.9).timeout
	_expect(game.round_complete and game.victory_mix > 0.9,"victory eases to black and waits for explicit consent")
	game._set_victory_mix(1.0)
	for index: int in range(game.piece_records.size()):
		var material: StandardMaterial3D = game.piece_records[index]["mesh"].material_override
		if winning.has(index):
			_expect(material == game.home_materials[index],"winning stone retains exact material")
		else:
			_expect(material.albedo_color.is_equal_approx(Color.BLACK),"nonwinning stone reaches black")
	game._set_victory_mix(0.0)
	for index: int in game.victory_materials:
		_expect(game.victory_materials[index].albedo_color.is_equal_approx(game.home_materials[index].albedo_color),"original color returns")
	game._on_round_action()
	_expect(game.victory_materials.is_empty(),"continue stops victory cycle")
	_expect(game.victory_tween == null,"no cycle survives the round boundary")
	_expect(not game.round_complete,"one device action advances all local players")
	await create_timer(1.0).timeout
	var zoom = intro.get_node("GameplayCameraZoom")
	zoom.initial_zoom_applied = true
	zoom.user_zoom_ratio = 34.0/57.0
	_expect(is_equal_approx(zoom.effective_fov_for_base(57.0),34.0),"existing max zoom respected")
	zoom._apply_fov(45.0)
	_expect(is_equal_approx(zoom.effective_fov_for_base(game.turn_camera_target_fov),45.0),"user zoom preserved")
	var footprints: Dictionary = {}
	for size_name: String in ["small","medium","large"]:
		var flat: ArrayMesh = game._stone_footprint(size_name)
		var points: PackedVector3Array = flat.surface_get_arrays(0)[Mesh.ARRAY_VERTEX]
		var coordinates: Array = []
		for point: Vector3 in points: coordinates.append([point.x,point.z])
		footprints[size_name] = coordinates
	var shape_file := FileAccess.open("res://../oct13-footprints.json",FileAccess.WRITE)
	if shape_file != null: shape_file.store_string(JSON.stringify(footprints))
	var file := FileAccess.open("res://../oct13-projections.json",FileAccess.WRITE)
	if file != null: file.store_string(JSON.stringify(projected))
	intro.queue_free()
	await process_frame
	if failures.is_empty(): print("YAKOLAK_VISUAL_REFINEMENT_OK selection+static-footprints+victory+continue+projection+zoom")
	else:
		for failure: String in failures: push_error(failure)
	quit(0 if failures.is_empty() else 1)
