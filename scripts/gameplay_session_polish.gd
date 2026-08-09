extends "res://scripts/gameplay_session_hardened.gd"

# Interaction/presentation polish requested after the motion audit:
# - a tapped nested piece is selected on the first tap (no forced large piece)
# - selected pieces keep their original color and use a contrasting outline
# - legal cells are thin rings embedded into the board surface
# - score markers enter the frame from above instead of appearing inside it

const LEGAL_RING_OUTER_RADIUS: float = 0.92
const LEGAL_RING_INNER_RADIUS: float = 0.84
const LEGAL_RING_CENTER_Y: float = 0.045
const OUTLINE_GROW_AMOUNT: float = 0.58
const OFFSCREEN_MARGIN_PX: float = 80.0

var web_clear_selection_callback: Variant
var browser_automation: bool = false
var last_test_target_publish_msec: int = -1000


func _ready() -> void:
	super._ready()
	if OS.has_feature("web"):
		browser_automation = bool(JavaScriptBridge.eval("Boolean(navigator.webdriver)", true))
		web_clear_selection_callback = JavaScriptBridge.create_callback(_on_web_clear_selection)
		var window: JavaScriptObject = JavaScriptBridge.get_interface("window")
		if window != null:
			window.set("yakolakTestClearSelection", web_clear_selection_callback)


func _process(delta: float) -> void:
	super._process(delta)
	if not browser_automation or not match_initialized or not gameplay_ready or camera == null:
		return
	var now: int = Time.get_ticks_msec()
	if now - last_test_target_publish_msec < 220:
		return
	last_test_target_publish_msec = now
	_publish_piece_test_targets()


func _publish_piece_test_targets() -> void:
	var direction: String = _current_direction()
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var center: Vector2 = viewport_size * 0.5
	var best_by_size: Dictionary = {}
	var distance_by_size: Dictionary = {}
	for index: int in range(piece_records.size()):
		var record: Dictionary = piece_records[index] as Dictionary
		if bool(record.get("played", false)) or str(record.get("dir", "")) != direction:
			continue
		var size_name: String = str(record.get("type", ""))
		var mesh_instance: MeshInstance3D = record.get("mesh") as MeshInstance3D
		if mesh_instance == null:
			continue
		# Aim at an exposed part of each nested ring rather than its shared center,
		# so the browser test exercises the same real ray-pick path as a player.
		var offset: Vector3
		match size_name:
			"large": offset = Vector3(17.0, 0.0, 9.5)
			"medium": offset = Vector3(12.5, 0.0, 7.0)
			_: offset = Vector3(8.0, 0.0, 4.5)
		var point: Vector2 = camera.unproject_position(mesh_instance.to_global(offset))
		var visible: bool = point.x >= 0.0 and point.x <= viewport_size.x and point.y >= 0.0 and point.y <= viewport_size.y
		var distance: float = point.distance_squared_to(center) + (0.0 if visible else 100000000.0)
		if not distance_by_size.has(size_name) or distance < float(distance_by_size[size_name]):
			distance_by_size[size_name] = distance
			best_by_size[size_name] = point
	if best_by_size.is_empty():
		return
	var script: String = ""
	for size_name: String in ["small", "medium", "large"]:
		if not best_by_size.has(size_name):
			continue
		var point: Vector2 = best_by_size[size_name] as Vector2
		var cap: String = size_name.capitalize()
		script += "document.body.dataset.yakolakTest%sX='%s';" % [cap, str(point.x)]
		script += "document.body.dataset.yakolakTest%sY='%s';" % [cap, str(point.y)]
	JavaScriptBridge.eval(script, true)


func _build_board_targets() -> void:
	for cell: int in range(CELL_COORDS.size()):
		var raw_position: Vector3 = CELL_COORDS[cell]
		var body := StaticBody3D.new()
		body.name = "BoardTarget_%d" % cell
		body.collision_layer = TARGET_LAYER
		body.collision_mask = 0
		body.position = Vector3(raw_position.x * U, 0.25, raw_position.z * U)
		body.set_meta("cell", cell)
		var target_shape := CylinderShape3D.new()
		target_shape.radius = DROP_RADIUS * U
		target_shape.height = 0.50
		var collision := CollisionShape3D.new()
		collision.shape = target_shape
		body.add_child(collision)
		intro.add_child(body)

		# The legal target is no longer a translucent disc floating above the board.
		# A thin torus is sunk into the top face so only its upper arc reads as a
		# physical ring printed/engraved on the play surface.
		var ring_mesh := TorusMesh.new()
		ring_mesh.outer_radius = LEGAL_RING_OUTER_RADIUS
		ring_mesh.inner_radius = LEGAL_RING_INNER_RADIUS
		ring_mesh.rings = 48
		ring_mesh.ring_segments = 8
		var marker := MeshInstance3D.new()
		marker.name = "LegalTarget_%d" % cell
		marker.mesh = ring_mesh
		marker.position = Vector3(raw_position.x * U, LEGAL_RING_CENTER_Y, raw_position.z * U)
		marker.material_override = _surface_ring_material(Color.WHITE)
		marker.visible = false
		marker.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		intro.add_child(marker)
		target_markers.append(marker)

	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakLegalMarkerStyle='surface-ring';" +
			"document.body.dataset.yakolakLegalMarkerPlacement='embedded-board';",
			true
		)


func _update_legal_markers(size_name: String, piece_color: Color) -> void:
	for cell: int in range(target_markers.size()):
		var marker: MeshInstance3D = target_markers[cell]
		var legal: bool = _is_legal_cell(cell, size_name)
		marker.visible = legal
		if legal:
			marker.material_override = _surface_ring_material(piece_color)


func _surface_ring_material(color: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(color.r, color.g, color.b, 1.0)
	material.roughness = 0.62
	material.metallic = 0.04
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	return material


func _selection_material(source: Material) -> StandardMaterial3D:
	var result: StandardMaterial3D
	if source is StandardMaterial3D:
		result = (source as StandardMaterial3D).duplicate() as StandardMaterial3D
	else:
		result = StandardMaterial3D.new()
		result.albedo_color = Color.WHITE

	# Preserve the actual stone color/material; only add an inverted-hull outline.
	var base_color: Color = result.albedo_color
	var brightest: float = maxf(maxf(base_color.r, base_color.g), base_color.b)
	var darkest: float = minf(minf(base_color.r, base_color.g), base_color.b)
	var average: float = (base_color.r + base_color.g + base_color.b) / 3.0
	var is_white_piece: bool = average > 0.68 and (brightest - darkest) < 0.24
	var outline_color: Color = Color(0.015, 0.015, 0.018, 1.0) if is_white_piece else Color.WHITE

	var outline := StandardMaterial3D.new()
	outline.albedo_color = outline_color
	outline.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	outline.cull_mode = BaseMaterial3D.CULL_FRONT
	outline.grow = true
	outline.grow_amount = OUTLINE_GROW_AMOUNT
	outline.roughness = 1.0
	result.next_pass = outline

	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakSelectionStyle='outline';" +
			"document.body.dataset.yakolakSelectionOutline='" + ("black" if is_white_piece else "white") + "';",
			true
		)
	return result


func _open_piece_tray(piece_index: int) -> void:
	if piece_index < 0 or piece_index >= piece_records.size():
		return
	var tapped: Dictionary = piece_records[piece_index] as Dictionary
	var direction: String = str(tapped.get("dir", ""))
	var side: int = int(tapped.get("side", 0))
	var available: Array[int] = []
	for size_name: String in ["large", "medium", "small"]:
		for index: int in range(piece_records.size()):
			var record: Dictionary = piece_records[index] as Dictionary
			if bool(record.get("played", false)):
				continue
			if str(record.get("dir", "")) == direction and int(record.get("side", 0)) == side and str(record.get("type", "")) == size_name:
				available.append(index)
				break
	if available.is_empty():
		return
	if tray_open:
		_close_piece_tray(-1, true)
	tray_open = true
	tray_side = side
	tray_indices = available
	if tray_tween != null and tray_tween.is_valid():
		tray_tween.kill()
	tray_tween = create_tween()
	tray_tween.set_parallel(true)
	for order: int in range(tray_indices.size()):
		var index: int = tray_indices[order]
		var record: Dictionary = piece_records[index] as Dictionary
		var piece: MeshInstance3D = record["mesh"] as MeshInstance3D
		piece.material_override = home_materials[index]
		var target: Vector3 = home_transforms[index].origin + Vector3.UP * (float(order) * TRAY_LIFT_STEP * U)
		tray_tween.tween_property(piece, "position", target, TRAY_OPEN_DURATION).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)

	# Critical fix: the first selection is the exact stone the ray hit. The old
	# code always selected tray_indices[0], which is deliberately ordered large
	# first and therefore forced medium/small stones to need a second tap.
	var initial_selection: int = piece_index if available.has(piece_index) else available[0]
	_select_tray_piece(initial_selection)
	_publish_tray_state("open")


func _spawn_score_marker(direction: String, score_index: int) -> bool:
	if intro == null or score_marker_root == null or SCORE_MARKER_MESH == null:
		return false
	var transform: Dictionary = _legacy_score_transform(direction, score_index)
	var landing: Vector3 = transform["position"] as Vector3
	var rotation: Vector3 = transform["rotation"] as Vector3

	var material := StandardMaterial3D.new()
	material.albedo_color = Color("#bfc2c7")
	material.roughness = 0.62
	material.metallic = 0.08
	material.cull_mode = BaseMaterial3D.CULL_DISABLED

	var marker := MeshInstance3D.new()
	marker.name = "ScoreMarker_%s_%d" % [direction, score_index + 1]
	marker.mesh = SCORE_MARKER_MESH as Mesh
	marker.material_override = material
	marker.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	marker.scale = Vector3.ONE * LEGACY_UNIT
	marker.rotation_degrees = rotation
	marker.position = _score_marker_offscreen_start(landing)
	score_marker_root.add_child(marker)

	# Keep the approved short timing, but start outside the camera frame. The
	# marker first becomes visible only as it crosses the top edge of the view.
	var tween: Tween = create_tween()
	tween.tween_property(marker, "position", landing, SCORE_DROP_SECONDS).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.tween_property(marker, "position", landing + Vector3.UP * SCORE_BOUNCE_HEIGHT, SCORE_BOUNCE_UP_SECONDS).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(marker, "position", landing, SCORE_SETTLE_SECONDS).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	_publish_score_marker_state()
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakScoreMarkerSpawn='offscreen-top';" +
			"document.body.dataset.yakolakScoreMarkerDropTiming='unchanged';",
			true
		)
	print("YAKOLAK_SCORE_MARKER_DROP spawn=offscreen-top direction=%s index=%d" % [direction, score_index])
	return true


func _score_marker_offscreen_start(landing: Vector3) -> Vector3:
	var distance: float = maxf(SCORE_DROP_DISTANCE, 2.4)
	if camera == null:
		return landing + Vector3.UP * 12.0
	for _step: int in range(40):
		var point: Vector3 = landing + Vector3.UP * distance
		if not camera.is_position_behind(point):
			var screen: Vector2 = camera.unproject_position(point)
			if screen.y < -OFFSCREEN_MARGIN_PX:
				return point
		distance += 1.5
	return landing + Vector3.UP * distance


func _on_web_clear_selection(_arguments: Array) -> void:
	if tray_open:
		_close_piece_tray(-1, true)
	elif selected_index >= 0:
		_clear_selection()
