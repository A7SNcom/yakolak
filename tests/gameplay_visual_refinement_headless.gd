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
	await create_timer(game.CAMERA_TRANSITION+0.15).timeout
	game._rm_enabled = true
	var now := Time.get_ticks_msec()
	game.turn_deadline_msec = now+game.TURN_TIMEOUT_MSEC
	game._update_turn_countdown(now+9999)
	_expect(not game.turn_countdown.visible,"countdown stays hidden during first ten seconds")
	game._update_turn_countdown(now+10000)
	_expect(game.turn_countdown.visible and game.turn_countdown_label.text=="20","countdown appears after ten seconds with twenty seconds remaining")
	game._update_turn_countdown(now+29000)
	_expect(game.turn_countdown_label.text=="1","countdown uses the same thirty-second authority deadline")
	game._update_turn_countdown(now+30000)
	_expect(not game.turn_countdown.visible,"expired turn has no stale countdown")
	game.turn_deadline_msec = 0
	game.turn_camera_start_position = Vector3(18.5,15.5,0)
	game.turn_camera_target_position = Vector3(0,15.5,-18.5)
	var midpoint: Vector3 = game._turn_camera_orbit_position(0.5)
	_expect(is_equal_approx(Vector2(midpoint.x,midpoint.z).length(),18.5),"turn camera preserves its radius instead of diving toward the board")
	_expect(game._turn_camera_duration()>=1.25,"shared device handoff has a comfortable duration")
	game.turn_camera_target_position = Vector3(-18.5,15.5,0)
	_expect(game._turn_camera_crosses_back_wall(),"opposite-side orbit keeps the studio wall out of the view")
	var table: MeshInstance3D = intro.get_node("ApprovedStarTableSVG")
	var table_data := table.mesh.surface_get_arrays(0)
	var table_points: PackedVector3Array = table_data[Mesh.ARRAY_VERTEX]
	var table_indices: PackedInt32Array = table_data[Mesh.ARRAY_INDEX]
	var table_top := table.get_aabb().end.y
	var table_faces: Array[PackedVector2Array] = []
	for i: int in range(0,table_indices.size(),3):
		var face := PackedVector2Array()
		for j: int in range(3):
			var point: Vector3 = table_points[table_indices[i+j]]
			if absf(point.y-table_top)>0.001: break
			point=table.to_global(point)
			face.append(Vector2(point.x,point.z))
		if face.size()==3: table_faces.append(face)
	for direction: String in ["right","back","left","front"]:
		var base: MeshInstance3D = intro.bases[direction]
		for corner: int in range(8):
			var point := base.to_global(base.get_aabb().get_endpoint(corner))
			var supported := false
			for face: PackedVector2Array in table_faces:
				if Geometry2D.is_point_in_polygon(Vector2(point.x,point.z),face): supported=true;break
			_expect(supported,"each rest area is fully supported by the actual star-shaped tabletop")
	for cell: int in range(game.CELL_COORDS.size()):
		var target = intro.get_node("BoardTarget_%d" % cell)
		var shape = target.get_child(0).shape
		_expect(shape.radius*2.0<48.0*game.U,"adjacent physical drop targets never overlap")
		_expect(absf(target.position.y-shape.height*0.5-2.0*game.U)<0.01,"drop targets share the actual surface of their visible hint")
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
			# Exercise the delayed production render path that previously restored rings.
			RenderingServer.frame_post_draw.emit()
			_expect(game.target_markers[0].mesh == game.piece_records[game.selected_index]["mesh"].mesh,"preview uses the selected stone resource itself")
			_expect(game.target_markers[0].get_meta("stone_size","")==game._selected_size(),"delayed render uses the current selected size")
			for index: int in range(game.piece_records.size()):
				if str(game.piece_records[index]["dir"]) != direction: continue
				var source: StandardMaterial3D = game.home_materials[index]
				var material: StandardMaterial3D = game.piece_records[index]["mesh"].material_override
				var expected := source.albedo_color if index == game.selected_index else source.albedo_color.lerp(Color.BLACK,0.70)
				_expect(material.albedo_color.is_equal_approx(expected),"size dimming preserves hue")
				_expect(material.next_pass == null,"no outline in active selection")
			_expect(game._selection_emphasis_count() == 1,"only one selected owner")
			var small: MeshInstance3D = game.piece_records[game.tray_indices[2]]["mesh"]
			_expect(is_equal_approx(small.position.y-game.home_transforms[game.tray_indices[2]].origin.y,2*27.0*game.U),"increased tray gap")
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
			var previous_width := 0.0
			for size_name: String in ["small","medium","large"]:
				game._update_legal_markers(size_name,Color("#318849"))
				var shown: MeshInstance3D = game.target_markers[4]
				var selected: MeshInstance3D = game.piece_records[game._available_stack_indices(direction,0)[["large","medium","small"].find(size_name)]]["mesh"]
				_expect(shown.mesh==selected.mesh,"each size reuses the actual stone rather than generating a contour")
				var original := selected.get_aabb()
				var original_box: AABB = game.home_transforms[game._available_stack_indices(direction,0)[["large","medium","small"].find(size_name)]]*original
				var ghost_box: AABB = shown.transform*original
				_expect(is_equal_approx(ghost_box.size.x,original_box.size.x) and is_equal_approx(ghost_box.size.z,original_box.size.z),"preview preserves placement width and depth")
				_expect(is_equal_approx(ghost_box.size.y,original_box.size.y*0.02),"only height is compressed to two percent")
				_expect(ghost_box.size.x>previous_width,"size ordering remains exact")
				previous_width=ghost_box.size.x
				_expect(game.legal_marker_pulse==null and game.footprint_fade==null,"preview has no geometric or opacity wave")
				for cell: int in range(game.target_markers.size()):
					var preview: MeshInstance3D = game.target_markers[cell]
					_expect(absf(preview.position.y-shown.position.y)<0.0001,"all nine copies of a chosen size have a consistent surface height")
					_expect((preview.transform*original).position.y<=5.0*game.U+0.005,"preview never floats on the high box perimeter")
					var hit: Dictionary = game._ray_pick(intro.camera.unproject_position(game.CELL_COORDS[cell]*game.U),game.TARGET_LAYER)
					_expect(not hit.is_empty() and int(hit["collider"].get_meta("cell",-1))==cell,"visible preview uses the same placement cell")
			game._close_piece_tray(-1,true)
			for index: int in range(game.piece_records.size()):
				_expect(game.piece_records[index]["mesh"].material_override == game.home_materials[index],"all reserve materials restored after selection closes")
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
	for index: int in winning: game.piece_records[index]["played"] = true
	var other: int = game._available_stack_indices("front",0)[0]
	game.piece_records[other]["played"] = true
	game._finish_round("right",winning)
	_expect(not game.result_card.visible,"results wait while the board celebrates")
	_expect(game.result_button.text == "استمرار","round button has text")
	_expect(game.result_button.position.y > root.get_visible_rect().size.y*0.65,"continue is below board")
	await create_timer(1.9).timeout
	_expect(game.round_complete and game.victory_mix > 0.9,"board pieces ease out and wait for explicit consent")
	game._set_victory_mix(1.0)
	for index: int in range(game.piece_records.size()):
		var material: StandardMaterial3D = game.piece_records[index]["mesh"].material_override
		if winning.has(index) or not bool(game.piece_records[index]["played"]):
			_expect(material == game.home_materials[index],"winning and reserve stones retain exact material")
		else:
			_expect(material.albedo_color.a==0.0 and not game.piece_records[index]["mesh"].visible,"only nonwinning played stones disappear")
	game._set_victory_mix(0.0)
	for index: int in game.victory_materials:
		_expect(game.victory_materials[index].albedo_color.is_equal_approx(game.home_materials[index].albedo_color),"original color returns")
	await create_timer(0.6).timeout
	_expect(not game.result_card.visible and game.celebration==null,"intermediate rounds never open the final standings")
	game._on_round_action()
	_expect(not game.result_card.visible and game.celebration==null,"continuation clears result and celebration")
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
	game._rm_enabled = false
	game.scores["right"] = game.total_rounds-1
	game._finish_round("right",winning)
	_expect(game.match_complete and not game.result_card.visible,"final standings wait for their reveal")
	await create_timer(2.5).timeout
	_expect(game.result_card.visible and game.result_rows.get_child_count()==4,"final standings have one row per player")
	_expect(game.result_button.get_parent()==game.result_actions and game.post_match_secondary_button.get_parent()==game.result_actions,"both final actions belong to the same result card")
	_expect(root.get_visible_rect().encloses(game.result_card.get_global_rect()),"standings fit the short landscape viewport without scrolling")
	_expect(game.result_rows.get_child(0).get_child(0).get_child(1).text=="اسم 0","winner is first in ranked player rows")
	_expect(game.result_button.text=="إعادة اللعبة" and game.post_match_secondary_button.text=="إعدادات جديدة","final actions have the requested labels")
	_expect(is_instance_valid(game.celebration) and game.celebration.amount<=48 and game.celebration.one_shot,"bounded final-match celebration")
	game._on_round_action()
	_expect(not game.match_complete and game.match_initialized and game.players.size()==4,"rematch retains the same roster")
	_expect(not game.result_card.visible and game.celebration==null,"rematch clears the result card and burst")
	game.scores["right"] = game.total_rounds-1
	game._finish_round("right",winning)
	game._on_post_match_secondary_action()
	await create_timer(1.9).timeout
	_expect(game.waiting_for_setup and setup.visual_active and setup.visual_step=="ready","new settings return directly to the final configuration page")
	_expect(setup.visual_resume_configuration.get("players",[]).size()==4,"new settings preserve the configured players")
	await create_timer(0.6).timeout
	_expect(not game.result_card.visible,"no delayed final result survives return to settings")
	intro.queue_free()
	await process_frame
	if failures.is_empty(): print("YAKOLAK_VISUAL_REFINEMENT_OK selection+static-footprints+victory+continue+projection+zoom")
	else:
		for failure: String in failures: push_error(failure)
	quit(0 if failures.is_empty() else 1)
