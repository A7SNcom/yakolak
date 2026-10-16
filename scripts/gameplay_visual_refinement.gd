extends "res://scripts/gameplay_reduced_motion_parity.gd"

# Presentation only. The previous outline remains archived in
# gameplay_selected_state.gd; move legality and authority stay inherited.
const TRAY_GAP_UNITS := 27.0
const TRAY_OUTWARD_STEP := 0.25
const Layout = preload("res://scripts/game_layout.gd")
const REST_OFFSET := Layout.REST_CLEARANCE
const DIM_MIX := 0.70
const CHOICE_FADE := 0.22
const VICTORY_HALF_CYCLE := 1.65

var choice_materials: Dictionary = {}
var choice_tweens: Array[Tween] = []
var victory_materials: Dictionary = {}
var victory_tween: Tween
var victory_mix: float = 0.0
var rest_shifted: bool = false
var ghost_height_cache: Dictionary = {}
var footprint_fade: Tween
var board_surface_heights: Array[float] = []
var board_cell_faces: Array = []
var turn_countdown: PanelContainer
var turn_countdown_label: Label
var turn_countdown_motion: Tween
var countdown_last_fov: float = -1.0
var continue_pending: bool = false
var rest_tween: Tween
const RESULT_DELAY := 2.3
const RESULT_FONT = preload("res://assets/fonts/thmanyahsans-Medium.otf")
const RESULT_BOLD = preload("res://assets/fonts/thmanyahsans-Bold.otf")
var result_card: PanelContainer
var result_title: Label
var result_rows: VBoxContainer
var result_actions: VBoxContainer
var result_column: VBoxContainer
var lobby_return_active := false
var lobby_return_tween: Tween
var lobby_return_generation := 0
var lobby_return_start := Transform3D.IDENTITY
var lobby_return_target := Transform3D.IDENTITY
var lobby_return_start_fov := 50.0
var lobby_return_target_fov := 50.0
var resume_configuration: Dictionary = {}
var result_generation: int = 0
var result_scheduled: bool = false
var result_reveal: Tween
var celebration: CPUParticles3D
var victory_visibility: Dictionary = {}

func _ready() -> void:
	super._ready()
	turn_countdown = PanelContainer.new()
	turn_countdown.name = "TurnCountdown"
	turn_countdown.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.09,0.10,0.12,0.80)
	style.border_color = Color(1,1,1,0.38)
	style.set_border_width_all(1)
	style.set_corner_radius_all(14)
	turn_countdown.add_theme_stylebox_override("panel",style)
	turn_countdown.hide()
	turn_countdown_label = Label.new()
	turn_countdown_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	turn_countdown_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	turn_countdown_label.add_theme_font_override("font",ARABIC_FONT)
	turn_countdown_label.add_theme_color_override("font_color",Color.WHITE)
	turn_countdown_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	turn_countdown.add_child(turn_countdown_label)
	hud_layer.add_child(turn_countdown)
	_build_result_card()


func _process(delta: float) -> void:
	super._process(delta)
	_update_turn_countdown(Time.get_ticks_msec())


func _update_turn_countdown(now: int) -> void:
	if turn_countdown == null: return
	var remaining := turn_deadline_msec-now
	var visible_turn := match_initialized and gameplay_ready and not online_active and not round_complete and not camera_transition and not move_active and _current_mode()=="local" and turn_deadline_msec>0
	var show_counter := visible_turn and remaining>0 and remaining<=TURN_TIMEOUT_MSEC-Layout.COUNTDOWN_DELAY_MS
	if not show_counter:
		if turn_countdown_motion != null and turn_countdown_motion.is_valid(): turn_countdown_motion.kill()
		turn_countdown.hide()
		return
	var text := str(int(ceil(float(remaining)/1000.0)))
	var changed := turn_countdown_label.text != text
	if changed:
		turn_countdown_label.text = text
	if changed or not turn_countdown.visible or (camera != null and countdown_last_fov != camera.fov):
		_position_turn_countdown()
	if not turn_countdown.visible:
		turn_countdown.show()
		turn_countdown.modulate.a = 1.0 if _rm_enabled else 0.0
		if not _rm_enabled:
			turn_countdown_motion = create_tween()
			turn_countdown_motion.tween_property(turn_countdown,"modulate:a",1.0,0.24)


func _position_turn_countdown() -> void:
	if turn_countdown == null or camera == null: return
	var board := intro.get("board") as MeshInstance3D
	if board == null: return
	var box := board.get_aabb()
	var rect := Rect2(camera.unproject_position(board.to_global(box.get_endpoint(0))),Vector2.ZERO)
	for i: int in range(8): rect = rect.expand(camera.unproject_position(board.to_global(box.get_endpoint(i))))
	var viewport := get_viewport().get_visible_rect().size
	var size := Vector2(_hud_length(38.0),_hud_length(40.0))
	turn_countdown.size = size
	turn_countdown.position = Vector2(clampf(rect.end.x+_hud_length(10),_hud_length(12),viewport.x-size.x-_hud_length(12)),clampf(rect.get_center().y-size.y*0.5,_hud_length(60),viewport.y-size.y-_hud_length(16)))
	turn_countdown_label.add_theme_font_size_override("font_size",_hud_font_size(20))
	countdown_last_fov = camera.fov


func _capture_home_state() -> void:
	super._capture_home_state()
	if rest_shifted or home_transforms.size() != piece_records.size():
		return
	rest_shifted = true
	if rest_tween != null and rest_tween.is_valid(): rest_tween.kill()
	var motion := create_tween().set_parallel(true)
	rest_tween = motion
	for index: int in range(piece_records.size()):
		var record: Dictionary = piece_records[index]
		var axis: Vector3 = DIRECTION_VECTORS.get(str(record.get("dir", "")), Vector3.ZERO)
		home_transforms[index].origin += axis * REST_OFFSET
		var piece: MeshInstance3D = record["mesh"]
		motion.tween_property(piece, "position", home_transforms[index].origin, 0.0 if _rm_enabled else 0.65).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	var bases: Dictionary = intro.get("bases")
	for direction: String in bases:
		var base: Node3D = bases[direction]
		var axis: Vector3 = DIRECTION_VECTORS.get(direction, Vector3.ZERO)
		motion.tween_property(base, "position", base.position + axis * REST_OFFSET, 0.0 if _rm_enabled else 0.65).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)


func _selection_material(source: Material) -> StandardMaterial3D:
	var material := (source.duplicate() as StandardMaterial3D) if source is StandardMaterial3D else StandardMaterial3D.new()
	material.next_pass = null
	material.set_meta("yakolak_selected_state", true)
	return material


func _open_piece_tray(piece_index: int) -> void:
	super._open_piece_tray(piece_index)
	if not tray_open:
		return
	if tray_tween != null and tray_tween.is_valid(): tray_tween.kill()
	tray_tween = create_tween().set_parallel(true)
	for order: int in range(tray_indices.size()):
		var index: int = tray_indices[order]
		var piece: MeshInstance3D = piece_records[index]["mesh"]
		var axis: Vector3 = DIRECTION_VECTORS[str(piece_records[index]["dir"])]
		var target := home_transforms[index].origin + Vector3.UP * (float(order) * TRAY_GAP_UNITS * U) + axis*float(order)*TRAY_OUTWARD_STEP
		if _rm_enabled:
			piece.position = target
		else:
			tray_tween.tween_property(piece, "position", target, 0.34).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	if _rm_enabled: tray_tween.kill()


func _select_tray_piece(piece_index: int) -> void:
	if not tray_open or not tray_indices.has(piece_index): return
	_stop_choice_tweens()
	# Parent latency layer publishes ownership immediately. Restore the prior
	# material after that operation so the color can ease from its current value.
	super._select_tray_piece(piece_index)
	for index: int in range(piece_records.size()):
		if bool(piece_records[index].get("played",false)) or str(piece_records[index]["dir"]) != _current_direction(): continue
		var source := home_materials[index] as StandardMaterial3D
		if source == null: continue
		if not choice_materials.has(index): choice_materials[index] = source.duplicate()
		var material := choice_materials[index] as StandardMaterial3D
		material.next_pass = null
		material.set_meta("yakolak_selected_state", index == selected_index)
		var piece: MeshInstance3D = piece_records[index]["mesh"]
		piece.material_override = material
		var target: Color = source.albedo_color if index == selected_index else source.albedo_color.lerp(Color.BLACK, DIM_MIX)
		if _rm_enabled:
			material.albedo_color = target
		else:
			var motion := create_tween()
			choice_tweens.append(motion)
			motion.tween_property(material, "albedo_color", target, CHOICE_FADE).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_publish_selection_emphasis_state("color-selection")
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakSelectionStyle='color-dimming';document.body.dataset.yakolakSelectionOutline='none';", true)


func _stop_choice_tweens() -> void:
	for motion: Tween in choice_tweens:
		if motion != null and motion.is_valid(): motion.kill()
	choice_tweens.clear()


func _restore_choice_materials() -> void:
	for index: int in choice_materials:
		if index < piece_records.size():
			(piece_records[index]["mesh"] as MeshInstance3D).material_override = home_materials[index]
	choice_materials.clear()


func _close_piece_tray(skip_index: int = -1, immediate: bool = false) -> void:
	_stop_choice_tweens()
	_restore_choice_materials()
	if skip_index >= 0 and skip_index < home_materials.size():
		(piece_records[skip_index]["mesh"] as MeshInstance3D).material_override = home_materials[skip_index]
	super._close_piece_tray(skip_index, immediate)


func _reset_tray_state() -> void:
	_stop_choice_tweens()
	_restore_choice_materials()
	super._reset_tray_state()


func _piece_at_current_pointer(point: Vector2, candidates: Array[int]) -> int:
	var exact: int = super._piece_at_current_pointer(point, candidates)
	if exact >= 0 or not tray_open or candidates != tray_indices or camera == null: return exact
	# A missed touch inside the raised stack's footprint chooses its nearest size.
	# Keep this rescue outside board targets so a placement never becomes a size tap.
	if not _ray_pick(point, TARGET_LAYER).is_empty(): return -1
	var best: int = -1
	var distance: float = INF
	var bounds := Rect2()
	var first := true
	for index: int in tray_indices:
		var piece: MeshInstance3D = piece_records[index]["mesh"]
		if camera.is_position_behind(piece.global_position): continue
		var box := piece.get_aabb()
		for corner: int in range(8):
			var projected := camera.unproject_position(piece.to_global(box.get_endpoint(corner)))
			if first: bounds = Rect2(projected, Vector2.ZERO); first = false
			else: bounds = bounds.expand(projected)
		var center := camera.unproject_position(piece.to_global(box.get_center()))
		var candidate_distance := point.distance_squared_to(center)
		if candidate_distance < distance: distance = candidate_distance; best = index
	return best if not first and bounds.grow(_hud_length(12.0)).has_point(point) else -1


func _hide_markers() -> void:
	if footprint_fade != null and footprint_fade.is_valid(): footprint_fade.kill()
	footprint_fade = null
	super._hide_markers()


func _update_legal_markers(size_name: String, piece_color: Color) -> void:
	if legal_marker_pulse != null and legal_marker_pulse.is_valid(): legal_marker_pulse.kill()
	legal_marker_pulse = null
	if footprint_fade != null and footprint_fade.is_valid(): footprint_fade.kill()
	var index := selected_index
	if index<0 or str(piece_records[index]["type"])!=size_name:
		index = -1
		for i: int in range(piece_records.size()):
			if str(piece_records[i]["type"])==size_name and str(piece_records[i]["dir"])==_current_direction(): index=i; break
	if index<0: _hide_markers(); return
	var source: MeshInstance3D = piece_records[index]["mesh"]
	var source_basis := home_transforms[index].basis
	var bottom := INF
	for corner: int in range(8):
		var point := source_basis*source.get_aabb().get_endpoint(corner)
		bottom=minf(bottom,point.y)
	# Reuse the exact stone resource and its placement orientation. Only height
	# is compressed to 2%; no traced outline or reconstructed/surface-warped mesh.
	var compression := 0.02
	var flat_basis := Basis.from_scale(Vector3(1,compression,1))*source_basis
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(piece_color.lightened(0.12),0.46)
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.cull_mode = BaseMaterial3D.CULL_BACK
	for cell: int in range(target_markers.size()):
		var marker := target_markers[cell]
		marker.mesh = source.mesh
		var surface := _ghost_surface_height(source.mesh,source_basis,bottom,cell)
		marker.transform = Transform3D(flat_basis,Vector3(CELL_COORDS[cell].x*U,surface+0.004-bottom*compression,CELL_COORDS[cell].z*U))
		marker.material_override = material
		marker.set_meta("stone_size",size_name)
		marker.visible = _is_legal_cell(cell,size_name)
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakLegalMarkerStyle='compressed-exact-stone';document.body.dataset.yakolakLegalMarkerSize="+JSON.stringify(size_name)+";",true)


func _ghost_surface_height(mesh: Mesh, basis: Basis, bottom: float, cell: int) -> float:
	# The nine pockets are copies of the same layout. Sample one canonical
	# pocket for this exact mesh/orientation, then apply its relative clearance
	# to every cell. Edge precision must not lift one preview onto the outer rim.
	var key := str(mesh.get_instance_id())+":"+str(basis)
	if not ghost_height_cache.has(key):
		var reference := 4
		var bed := _cell_surface_height(reference)
		var height := bed
		var center := Vector3(CELL_COORDS[reference].x*U,0,CELL_COORDS[reference].z*U)
		var visited: Dictionary = {}
		for surface: int in range(mesh.get_surface_count()):
			var points: PackedVector3Array = mesh.surface_get_arrays(surface)[Mesh.ARRAY_VERTEX]
			for vertex: Vector3 in points:
				var point := basis*vertex
				if absf(point.y-bottom)>0.001: continue
				var coordinate := Vector2(point.x,point.z)
				if visited.has(coordinate): continue
				visited[coordinate]=true
				height=maxf(height,_board_height_at(center+point,reference))
		# Pocket relief reaches five layout units, the bed is at two. The twelve
		# unit perimeter belongs to the box, never to a legal placement preview.
		ghost_height_cache[key]=clampf(height-bed,0.0,3.0*U)
	return _cell_surface_height(cell)+float(ghost_height_cache[key])


func _prepare_board_faces() -> void:
	if not board_cell_faces.is_empty(): return
	for cell: int in range(CELL_COORDS.size()): board_cell_faces.append([])
	var board := intro.get("board") as MeshInstance3D
	if board == null or board.mesh == null: return
	for surface: int in range(board.mesh.get_surface_count()):
		var data := board.mesh.surface_get_arrays(surface)
		var points: PackedVector3Array = data[Mesh.ARRAY_VERTEX]
		var indices: PackedInt32Array = data[Mesh.ARRAY_INDEX]
		var count := indices.size() if not indices.is_empty() else points.size()
		for i: int in range(0,count,3):
			var a := board.transform*points[indices[i] if not indices.is_empty() else i]
			var b := board.transform*points[indices[i+1] if not indices.is_empty() else i+1]
			var c := board.transform*points[indices[i+2] if not indices.is_empty() else i+2]
			if absf((b-a).cross(c-a).y)<0.000001: continue
			var bounds := Rect2(Vector2(a.x,a.z),Vector2.ZERO).expand(Vector2(b.x,b.z)).expand(Vector2(c.x,c.z))
			for cell: int in range(CELL_COORDS.size()):
				var center := Vector2(CELL_COORDS[cell].x,CELL_COORDS[cell].z)*U
				if bounds.intersects(Rect2(center-Vector2.ONE*1.1,Vector2.ONE*2.2)):
					board_cell_faces[cell].append(PackedVector3Array([a,b,c]))


func _board_height_at(point: Vector3, cell: int) -> float:
	_prepare_board_faces()
	var height := -INF
	for triangle: PackedVector3Array in board_cell_faces[cell]:
		var hit: Variant = Geometry3D.segment_intersects_triangle(Vector3(point.x,10,point.z),Vector3(point.x,-10,point.z),triangle[0],triangle[1],triangle[2])
		if hit != null: height = maxf(height,hit.y)
	return CELL_COORDS[cell].y*U if height == -INF else height


func _cell_surface_height(cell: int) -> float:
	if board_surface_heights.is_empty():
		for i: int in range(CELL_COORDS.size()): board_surface_heights.append(_board_height_at(CELL_COORDS[i]*U,i))
	return board_surface_heights[cell]


func _highlight_winning_pieces(_winning: Array[int]) -> void:
	# The winning stones keep their exact material; the other stones carry the cue.
	pass


func _show_round_result() -> void:
	super._show_round_result()
	if result_button != null and not online_cancelled:
		result_button.text = "إعادة اللعبة" if match_complete else "استمرار"
		result_button.disabled = continue_pending
	_layout_hud()
	_start_victory_colors()
	_hide_post_match_status_label()
	if match_complete:
		result_button.hide()
		post_match_secondary_button.hide()
		_schedule_results()


func _layout_hud() -> void:
	super._layout_hud()
	_position_turn_countdown()
	_layout_result_card()
	if result_button == null: return
	if result_button.get_parent() == result_actions: return
	var viewport := get_viewport().get_visible_rect().size
	var width := minf(_hud_length(400.0), viewport.x - _hud_length(28.0))
	var height := _hud_length(56.0)
	var bottom := viewport.y - _hud_length(20.0)
	if match_complete: bottom -= _hud_length(60.0)
	result_button.set_anchors_preset(Control.PRESET_TOP_LEFT)
	result_button.position = Vector2((viewport.x - width) * 0.5, bottom - height)
	result_button.size = Vector2(width, height)
	for state: String in ["normal", "hover", "pressed", "disabled", "focus"]:
		var style := _result_style(Color("#3d3f46ed") if state != "hover" else Color("#555861ee"))
		style.border_color = Color("#ffffff99")
		style.set_border_width_all(1)
		result_button.add_theme_stylebox_override(state, style)
	result_button.add_theme_color_override("font_color", Color.WHITE)
	result_button.add_theme_color_override("font_disabled_color", Color("#c4c5c8"))
	if post_match_secondary_button != null:
		post_match_secondary_button.set_anchors_preset(Control.PRESET_TOP_LEFT)
		post_match_secondary_button.position = Vector2((viewport.x - width) * 0.5, bottom + _hud_length(10.0))
		post_match_secondary_button.size = Vector2(width, _hud_length(48.0))


func _start_victory_colors() -> void:
	if not round_complete or round_winner.is_empty(): return
	# A repeated result/consent snapshot must never leave a winning mesh in an
	# earlier nonwinner fade set. Keep every simultaneous winning pattern visible.
	for index: int in winning_piece_indices:
		victory_materials.erase(index)
		victory_visibility.erase(index)
		var winner: MeshInstance3D = piece_records[index]["mesh"]
		winner.material_override = home_materials[index]
		winner.visible = true
	for index: int in range(piece_records.size()):
		var piece: MeshInstance3D = piece_records[index]["mesh"]
		if not bool(piece_records[index].get("played",false)) or winning_piece_indices.has(index): continue
		if not victory_materials.has(index) and home_materials[index] is StandardMaterial3D:
			victory_materials[index] = home_materials[index].duplicate()
			victory_materials[index].transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			victory_visibility[index] = piece.visible
		if victory_materials.has(index): piece.material_override = victory_materials[index]
	_set_victory_mix(victory_mix)
	if victory_tween != null and victory_tween.is_valid(): return
	if _rm_enabled:
		_set_victory_mix(1.0)
		return
	victory_tween = create_tween().set_loops()
	victory_tween.tween_method(_set_victory_mix, 0.0, 1.0, VICTORY_HALF_CYCLE).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	victory_tween.tween_interval(0.25)
	victory_tween.tween_method(_set_victory_mix, 1.0, 0.0, VICTORY_HALF_CYCLE).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	victory_tween.tween_interval(0.25)


func _set_victory_mix(value: float) -> void:
	victory_mix = value
	for index: int in victory_materials:
		var source := home_materials[index] as StandardMaterial3D
		var material := victory_materials[index] as StandardMaterial3D
		# Preserve hue, lighting and finish. Only board pieces' opacity changes.
		material.albedo_color = Color(source.albedo_color,source.albedo_color.a*(1.0-value))
		(piece_records[index]["mesh"] as MeshInstance3D).visible = bool(victory_visibility[index]) and value<0.999



func _stop_victory_colors() -> void:
	_clear_results()
	if victory_tween != null and victory_tween.is_valid(): victory_tween.kill()
	victory_tween = null
	for index: int in victory_materials:
		if index < piece_records.size() and index < home_materials.size():
			(piece_records[index]["mesh"] as MeshInstance3D).material_override = home_materials[index]
			(piece_records[index]["mesh"] as MeshInstance3D).visible = bool(victory_visibility.get(index,true))
	victory_visibility.clear()
	victory_materials.clear()
	victory_mix = 0.0
	continue_pending = false


func _on_round_action() -> void:
	if continue_pending: return
	if online_active and not online_cancelled and round_complete:
		continue_pending = true
		result_button.disabled = true
	# Local pass-and-play has one confirmation for this device, bots included.
	super._on_round_action()


func _maybe_auto_advance_online_round() -> void:
	# Every remote device must explicitly acknowledge; polling is never consent.
	_reset_online_round_auto()


func _on_online_error(code: String) -> void:
	continue_pending = false
	super._on_online_error(code)
	if round_complete and result_button != null: result_button.disabled = false


func _apply_online_room(remote: Dictionary) -> void:
	if str(remote.get("status", "")) != "finished": _stop_victory_colors()
	super._apply_online_room(remote)
	if round_complete: _start_victory_colors()


func _online_piece_motion_seconds() -> float:
	return 0.0 if _rm_enabled else super._online_piece_motion_seconds()


func _sync_active_sides() -> void:
	super._sync_active_sides()
	if round_complete and not victory_materials.is_empty():
		_set_victory_mix(victory_mix)


func _reset_board_for_round() -> void:
	_stop_victory_colors()
	super._reset_board_for_round()


func _reset_session_transients() -> void:
	_stop_victory_colors()
	super._reset_session_transients()


func _on_post_match_secondary_action() -> void:
	if not round_complete or not match_complete or action_in_progress: return
	resume_configuration = {"players":players.duplicate(true),"rounds":total_rounds}
	_return_to_setup()


func _return_to_setup() -> void:
	if lobby_return_active: return
	lobby_return_active = true
	lobby_return_generation += 1
	var generation := lobby_return_generation
	_stop_victory_colors()
	_reset_session_transients()
	if rest_tween != null and rest_tween.is_valid(): rest_tween.kill()
	gameplay_ready = false
	match_initialized = false
	action_in_progress = true
	waiting_for_setup = false
	result_button.hide()
	post_match_secondary_button.hide()
	if setup != null:
		setup.set("visual_resume_configuration",resume_configuration.duplicate(true))
	var target: Dictionary = setup.call("lobby_camera_target") if setup != null else {}
	lobby_return_start = camera.transform
	lobby_return_target = target.get("transform",camera.transform)
	lobby_return_start_fov = camera.fov
	lobby_return_target_fov = float(target.get("fov",camera.fov))
	turn_camera_start_position = camera.position
	turn_camera_target_position = lobby_return_target.origin
	_set_studio_backdrop_visible(not _turn_camera_crosses_back_wall())
	lobby_return_tween = create_tween().set_parallel(true)
	var duration := 0.0 if _rm_enabled else 1.65
	lobby_return_tween.tween_method(_apply_lobby_return,0.0,1.0,duration).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	for index: int in range(piece_records.size()):
		var piece: MeshInstance3D = piece_records[index]["mesh"]
		piece.material_override=home_materials[index]
		piece.show()
		lobby_return_tween.tween_property(piece,"transform",home_transforms[index],duration).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	await lobby_return_tween.finished
	if generation != lobby_return_generation: return
	_set_studio_backdrop_visible(camera.position.z>=STUDIO_WALL_SAFE_Z)
	lobby_return_active=false
	resume_configuration.clear()
	super._return_to_setup()


func _apply_lobby_return(t: float) -> void:
	camera.position=_turn_camera_orbit_position(t)
	camera.fov=lerpf(lobby_return_start_fov,lobby_return_target_fov,t)
	var focus := Vector3(0,0.35,0)
	var start_look := Basis.looking_at(focus-lobby_return_start.origin,Vector3.UP).get_rotation_quaternion()
	var end_look := Basis.looking_at(focus-lobby_return_target.origin,Vector3.UP).get_rotation_quaternion()
	var start_offset := start_look.inverse()*lobby_return_start.basis.get_rotation_quaternion()
	var end_offset := end_look.inverse()*lobby_return_target.basis.get_rotation_quaternion()
	var look := Basis.looking_at(focus-camera.position,Vector3.UP).get_rotation_quaternion()
	camera.basis=Basis(look*start_offset.slerp(end_offset,t))


func _reset_for_intro() -> void:
	lobby_return_generation += 1
	lobby_return_active = false
	if lobby_return_tween != null and lobby_return_tween.is_valid(): lobby_return_tween.kill()
	resume_configuration.clear()
	if setup != null: setup.set("visual_resume_configuration",{})
	_stop_victory_colors()
	if rest_tween != null and rest_tween.is_valid(): rest_tween.kill()
	rest_shifted = false
	ghost_height_cache.clear()
	board_surface_heights.clear()
	board_cell_faces.clear()
	super._reset_for_intro()


func _build_result_card() -> void:
	result_card = PanelContainer.new()
	result_card.name = "RoundResults"
	result_card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.09,0.10,0.12,0.92)
	style.border_color = Color(1,1,1,0.32)
	style.set_border_width_all(1)
	style.set_corner_radius_all(22)
	style.content_margin_left = 22
	style.content_margin_right = 22
	style.content_margin_top = 16
	style.content_margin_bottom = 16
	result_card.add_theme_stylebox_override("panel",style)
	result_column = VBoxContainer.new()
	result_column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	result_column.add_theme_constant_override("separation",12)
	result_card.add_child(result_column)
	result_title = Label.new()
	result_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	result_title.layout_direction = Control.LAYOUT_DIRECTION_RTL
	result_title.text_direction = Control.TEXT_DIRECTION_RTL
	result_title.add_theme_font_override("font",RESULT_BOLD)
	result_title.add_theme_color_override("font_color",Color.WHITE)
	result_title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	result_column.add_child(result_title)
	result_rows = VBoxContainer.new()
	result_rows.mouse_filter = Control.MOUSE_FILTER_IGNORE
	result_rows.add_theme_constant_override("separation",6)
	result_column.add_child(result_rows)
	result_actions = VBoxContainer.new()
	result_actions.add_theme_constant_override("separation",8)
	result_column.add_child(result_actions)
	result_card.hide()
	hud_layer.add_child(result_card)


func _layout_result_card() -> void:
	if result_card == null: return
	var viewport := get_viewport().get_visible_rect().size
	var width := minf(_hud_length(420),viewport.x-_hud_length(28))
	var short_view := viewport.y<480
	var height := _hud_length((150 if short_view else 190)+players.size()*(40 if short_view else 48))
	result_column.add_theme_constant_override("separation",8 if short_view else 12)
	result_rows.add_theme_constant_override("separation",4 if short_view else 6)
	for panel: Node in result_rows.get_children():
		for label: Label in panel.get_child(0).get_children():
			label.custom_minimum_size.y = _hud_length(32 if short_view else 42)
			label.add_theme_font_size_override("font_size",_hud_font_size(16 if short_view else 19))
	for button: Button in [result_button,post_match_secondary_button]:
		if button != null and button.get_parent()==result_actions: button.custom_minimum_size.y=_hud_length(44 if short_view else 50)
	result_card.custom_minimum_size = Vector2(width,0)
	result_card.size = Vector2(width,height)
	result_card.position = Vector2((viewport.x-width)*0.5,maxf(_hud_length(12),(viewport.y-height)*0.5))
	result_title.add_theme_font_size_override("font_size",_hud_font_size(22 if short_view else 26))


func _schedule_results() -> void:
	if result_scheduled or not round_complete or not match_complete or online_cancelled: return
	result_scheduled = true
	var generation := result_generation
	await get_tree().create_timer(RESULT_DELAY).timeout
	if generation != result_generation or not match_complete or not match_initialized: return
	result_title.text = "نتائج المباراة"
	for child: Node in result_rows.get_children(): child.free()
	var ordered: Array = players.duplicate(true)
	ordered.sort_custom(func(a: Dictionary,b: Dictionary) -> bool: return int(scores.get(str(a["direction"]),0))>int(scores.get(str(b["direction"]),0)))
	var previous := -1
	var rank := 0
	for i: int in range(ordered.size()):
		var player: Dictionary = ordered[i]
		var direction := str(player["direction"])
		var score := int(scores.get(direction,0))
		if score!=previous: rank=i+1
		previous=score
		var panel := PanelContainer.new()
		panel.mouse_filter=Control.MOUSE_FILTER_IGNORE
		var style := StyleBoxFlat.new()
		style.bg_color=Color(1,1,1,0.14 if rank==1 else 0.04)
		style.set_corner_radius_all(12)
		style.content_margin_left=12
		style.content_margin_right=12
		panel.add_theme_stylebox_override("panel",style)
		var row := HBoxContainer.new()
		row.layout_direction=Control.LAYOUT_DIRECTION_RTL
		row.mouse_filter=Control.MOUSE_FILTER_IGNORE
		row.add_theme_constant_override("separation",12)
		panel.add_child(row)
		for value: String in [str(rank),_player_name(direction),str(score)]:
			var label := Label.new()
			label.text=value
			label.tooltip_text=_player_name(direction)
			label.custom_minimum_size=Vector2(24,_hud_length(42))
			label.vertical_alignment=VERTICAL_ALIGNMENT_CENTER
			label.add_theme_font_override("font",RESULT_BOLD if value==str(score) else RESULT_FONT)
			label.add_theme_font_size_override("font_size",_hud_font_size(19))
			label.add_theme_color_override("font_color",Color.WHITE)
			label.mouse_filter=Control.MOUSE_FILTER_IGNORE
			if row.get_child_count()==1:
				label.size_flags_horizontal=Control.SIZE_EXPAND_FILL
				label.text_overrun_behavior=TextServer.OVERRUN_TRIM_ELLIPSIS
			row.add_child(label)
		result_rows.add_child(panel)
	result_button.reparent(result_actions)
	post_match_secondary_button.reparent(result_actions)
	result_button.text="إعادة اللعبة"
	post_match_secondary_button.text="إعدادات جديدة"
	for button: Button in [result_button,post_match_secondary_button]:
		button.set_anchors_preset(Control.PRESET_TOP_LEFT)
		button.custom_minimum_size=Vector2(0,_hud_length(50))
		button.size_flags_horizontal=Control.SIZE_EXPAND_FILL
		button.add_theme_font_override("font",RESULT_FONT)
		button.add_theme_font_size_override("font_size",_hud_font_size(18))
		var style := _result_style(Color("#e4e6eb") if button==result_button else Color("#303239"))
		style.border_color=Color(1,1,1,0.35)
		style.set_border_width_all(1)
		for state: String in ["normal","hover","pressed","focus"]: button.add_theme_stylebox_override(state,style)
		for state: String in ["font_color","font_hover_color","font_pressed_color","font_focus_color"]: button.add_theme_color_override(state,Color("#17181c") if button==result_button else Color.WHITE)
		button.show()
	_layout_result_card()
	result_card.show()
	result_card.modulate.a = 1.0 if _rm_enabled else 0.0
	if not _rm_enabled:
		result_reveal = create_tween()
		result_reveal.tween_property(result_card,"modulate:a",1.0,0.55).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		if not round_winner.is_empty(): _celebrate_win()


func _celebrate_win() -> void:
	# One bounded burst; no looping system, shaders, physics or imported library.
	celebration = CPUParticles3D.new()
	celebration.name = "VictoryCelebration"
	celebration.emitting = false
	celebration.amount = 48
	celebration.one_shot = true
	celebration.lifetime = 2.8
	celebration.explosiveness = 0.85
	celebration.direction = Vector3.UP
	celebration.spread = 55.0
	celebration.initial_velocity_min = 1.6
	celebration.initial_velocity_max = 3.0
	celebration.gravity = Vector3(0,-1.1,0)
	celebration.emission_shape = CPUParticles3D.EMISSION_SHAPE_RING
	celebration.emission_ring_axis = Vector3.UP
	celebration.emission_ring_radius = 2.8
	celebration.emission_ring_inner_radius = 2.4
	celebration.emission_ring_height = 0.1
	celebration.scale_amount_min = 0.55
	celebration.scale_amount_max = 1.0
	celebration.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	celebration.position = Vector3(0,0.55,0)
	var sphere := SphereMesh.new()
	sphere.radius = 0.065
	sphere.height = 0.13
	sphere.radial_segments = 8
	sphere.rings = 4
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.vertex_color_use_as_albedo = true
	sphere.material = material
	celebration.mesh = sphere
	var ramp := Gradient.new()
	ramp.colors = PackedColorArray([Color(0.95,0.96,1,0.8),Color(0.95,0.96,1,0.8),Color(0.95,0.96,1,0)])
	ramp.offsets = PackedFloat32Array([0,0.65,1])
	celebration.color_ramp = ramp
	intro.add_child(celebration)
	celebration.finished.connect(celebration.queue_free)
	celebration.emitting = true


func _clear_results() -> void:
	result_generation += 1
	result_scheduled = false
	if result_reveal != null and result_reveal.is_valid(): result_reveal.kill()
	result_reveal = null
	if result_card != null: result_card.hide()
	for button: Button in [result_button,post_match_secondary_button]:
		if button != null and button.get_parent()==result_actions:
			button.reparent(hud_layer)
			button.custom_minimum_size=Vector2.ZERO
	if is_instance_valid(celebration): celebration.queue_free()
	celebration = null
