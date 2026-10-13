extends "res://scripts/gameplay_reduced_motion_parity.gd"

# Presentation only. The previous outline remains archived in
# gameplay_selected_state.gd; move legality and authority stay inherited.
const TRAY_GAP_UNITS := 27.0
const REST_OFFSET := 0.85
const DIM_MIX := 0.70
const CHOICE_FADE := 0.22
const VICTORY_HALF_CYCLE := 1.65

var choice_materials: Dictionary = {}
var choice_tweens: Array[Tween] = []
var victory_materials: Dictionary = {}
var victory_tween: Tween
var victory_mix: float = 0.0
var rest_shifted: bool = false
var footprint_cache: Dictionary = {}
var continue_pending: bool = false
var rest_tween: Tween


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
		motion.tween_property(piece, "position", home_transforms[index].origin, 0.0 if _rm_enabled else 0.45).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	var bases: Dictionary = intro.get("bases")
	for direction: String in bases:
		var base: Node3D = bases[direction]
		var axis: Vector3 = DIRECTION_VECTORS.get(direction, Vector3.ZERO)
		motion.tween_property(base, "position", base.position + axis * REST_OFFSET, 0.0 if _rm_enabled else 0.45).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)


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
		var target := home_transforms[index].origin + Vector3.UP * (float(order) * TRAY_GAP_UNITS * U)
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
	for index: int in tray_indices:
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


func _close_piece_tray(skip_index: int = -1, immediate: bool = false) -> void:
	_stop_choice_tweens()
	choice_materials.clear()
	if skip_index >= 0 and skip_index < home_materials.size():
		(piece_records[skip_index]["mesh"] as MeshInstance3D).material_override = home_materials[skip_index]
	super._close_piece_tray(skip_index, immediate)


func _reset_tray_state() -> void:
	_stop_choice_tweens()
	choice_materials.clear()
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


func _update_legal_markers(size_name: String, piece_color: Color) -> void:
	if legal_marker_pulse != null and legal_marker_pulse.is_valid(): legal_marker_pulse.kill()
	legal_marker_pulse = null
	var footprint: ArrayMesh = _stone_footprint(size_name)
	if footprint == null: return
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(piece_color.r, piece_color.g, piece_color.b, 0.48)
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	var surface_y := 0.48
	var board := intro.get("board") as MeshInstance3D
	if board != null:
		surface_y = -INF
		for corner: int in range(8):
			surface_y = maxf(surface_y,(board.transform * board.get_aabb().get_endpoint(corner)).y)
	for cell: int in range(target_markers.size()):
		var marker: MeshInstance3D = target_markers[cell]
		marker.mesh = footprint
		marker.scale = Vector3.ONE
		marker.position = Vector3(CELL_COORDS[cell].x * U, surface_y + 0.012, CELL_COORDS[cell].z * U)
		marker.material_override = material
		marker.visible = _is_legal_cell(cell, size_name)
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakLegalMarkerStyle='static-stone-footprint';document.body.dataset.yakolakLegalMarkerSize=" + JSON.stringify(size_name) + ";", true)


func _stone_footprint(size_name: String) -> ArrayMesh:
	if footprint_cache.has(size_name): return footprint_cache[size_name] as ArrayMesh
	var source: Mesh = null
	var basis := Basis.IDENTITY
	for index: int in range(piece_records.size()):
		if str(piece_records[index].get("type", "")) == size_name:
			source = (piece_records[index]["mesh"] as MeshInstance3D).mesh
			basis = home_transforms[index].basis
			break
	if source == null: return null
	# Project the actual upward faces, including its central cutout and spikes.
	# No generic circle, invented star, scale pulse, or extra outline pass.
	var vertices := PackedVector3Array()
	var edges: Dictionary = {}
	for surface: int in range(source.get_surface_count()):
		var arrays := source.surface_get_arrays(surface)
		var points: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
		var count: int = indices.size() if not indices.is_empty() else points.size()
		for triangle: int in range(0, count, 3):
			var a: Vector3 = basis * points[indices[triangle] if not indices.is_empty() else triangle]
			var b: Vector3 = basis * points[indices[triangle + 1] if not indices.is_empty() else triangle + 1]
			var c: Vector3 = basis * points[indices[triangle + 2] if not indices.is_empty() else triangle + 2]
			# Godot meshes use clockwise front faces.
			if (c - a).cross(b - a).normalized().dot(Vector3.UP) < 0.45: continue
			var triangle_points: Array[Vector3] = [Vector3(a.x,0,a.z),Vector3(b.x,0,b.z),Vector3(c.x,0,c.z)]
			for side: int in range(3):
				var start: Vector3 = triangle_points[side]
				var end: Vector3 = triangle_points[(side+1)%3]
				var start_key := "%d,%d" % [roundi(start.x*10000),roundi(start.z*10000)]
				var end_key := "%d,%d" % [roundi(end.x*10000),roundi(end.z*10000)]
				var key := start_key+":"+end_key if start_key < end_key else end_key+":"+start_key
				if edges.has(key): edges[key]["count"] += 1
				else: edges[key] = {"start":start,"end":end,"count":1}
	var width: float = clampf(source.get_aabb().size.x * U * 0.018,0.014,0.028)
	for edge: Dictionary in edges.values():
		if int(edge["count"]) != 1: continue
		var start: Vector3 = edge["start"]
		var end: Vector3 = edge["end"]
		var offset := (end-start).normalized().cross(Vector3.UP)*width*0.5
		vertices.append_array(PackedVector3Array([start-offset,end-offset,end+offset,start-offset,end+offset,start+offset]))
	if vertices.is_empty(): return null
	var flat := ArrayMesh.new()
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	flat.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	footprint_cache[size_name] = flat
	return flat


func _highlight_winning_pieces(_winning: Array[int]) -> void:
	# The winning stones keep their exact material; the other stones carry the cue.
	pass


func _show_round_result() -> void:
	super._show_round_result()
	if result_button != null and not online_cancelled:
		result_button.text = "استمرار"
		result_button.disabled = continue_pending
	_layout_hud()
	_start_victory_colors()


func _layout_hud() -> void:
	super._layout_hud()
	if result_button == null: return
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
	for index: int in range(piece_records.size()):
		var piece: MeshInstance3D = piece_records[index]["mesh"]
		if winning_piece_indices.has(index):
			piece.material_override = home_materials[index]
			continue
		if not victory_materials.has(index) and home_materials[index] is StandardMaterial3D:
			victory_materials[index] = home_materials[index].duplicate()
		if victory_materials.has(index): piece.material_override = victory_materials[index]
	_set_victory_mix(victory_mix)
	if victory_tween != null and victory_tween.is_valid(): return
	if _rm_enabled:
		_set_victory_mix(0.85)
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
		material.albedo_color = source.albedo_color.lerp(Color.BLACK, value)
		material.metallic = lerpf(source.metallic, 0.0, value)
		material.metallic_specular = lerpf(source.metallic_specular, 0.0, value)
		material.roughness = lerpf(source.roughness, 1.0, value)
		material.emission_enabled = false
		material.next_pass = null


func _stop_victory_colors() -> void:
	if victory_tween != null and victory_tween.is_valid(): victory_tween.kill()
	victory_tween = null
	for index: int in victory_materials:
		if index < piece_records.size() and index < home_materials.size():
			(piece_records[index]["mesh"] as MeshInstance3D).material_override = home_materials[index]
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


func _reset_board_for_round() -> void:
	_stop_victory_colors()
	super._reset_board_for_round()


func _reset_session_transients() -> void:
	_stop_victory_colors()
	super._reset_session_transients()


func _return_to_setup() -> void:
	_stop_victory_colors()
	if rest_tween != null and rest_tween.is_valid(): rest_tween.kill()
	super._return_to_setup()


func _reset_for_intro() -> void:
	_stop_victory_colors()
	if rest_tween != null and rest_tween.is_valid(): rest_tween.kill()
	rest_shifted = false
	footprint_cache.clear()
	super._reset_for_intro()
