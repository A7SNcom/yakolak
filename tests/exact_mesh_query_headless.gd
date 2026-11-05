extends SceneTree

# Exact legacy triangle scans are retained here as an independent oracle.
# Test actual imported assets, nested holes, missed rays and every board pocket.
const Game = preload("res://scripts/gameplay_visual_refinement.gd")
const U = preload("res://scripts/game_layout.gd").UNIT
const CELL_COORDS = preload("res://scripts/gameplay.gd").CELL_COORDS
class Fixture:
	extends Node3D
	var board: MeshInstance3D
var intro: Fixture
var camera: Camera3D
var piece_records: Array = []
var board_cell_faces: Array = []
var _pick_face_cache: Dictionary = {}
var failures: int = 0

func _init() -> void:
	call_deferred("_run")

func _run() -> void:
	intro = Fixture.new()
	root.add_child(intro)
	intro.board = MeshInstance3D.new()
	intro.board.mesh = load("res://generated/board_and_lid.obj")
	intro.board.rotation_degrees.x = -90
	intro.board.scale = Vector3.ONE * U
	intro.board.position.y = 6 * U
	intro.add_child(intro.board)
	var game = Game.new()
	game.intro = intro
	camera = Camera3D.new()
	intro.add_child(camera)
	camera.position = Vector3(6, 7, 8)
	camera.look_at(Vector3.ZERO)
	game.camera = camera
	for size_name: String in ["large", "medium", "small"]:
		for side: int in range(3):
			var piece := MeshInstance3D.new()
			piece.mesh = load("res://generated/piece_%s.obj" % size_name)
			piece.rotation_degrees.x = -90
			piece.scale = Vector3.ONE * U
			piece.position.x = (side - 1) * 1.7
			intro.add_child(piece)
			piece_records.append({"mesh": piece, "type": size_name, "played": false})
	game.piece_records = piece_records
	var points: Array[Vector3] = []
	var cells: Array[int] = []
	for cell: int in range(9):
		for x: int in range(-3,4):
			for z: int in range(-3,4):
				points.append(CELL_COORDS[cell]*U + Vector3(x*0.27,0,z*0.27))
				cells.append(cell)
	var expected: Array[float] = []
	var started := Time.get_ticks_usec()
	for i: int in range(points.size()): expected.append(_legacy_board_height_at(points[i],cells[i]))
	var legacy_usec := Time.get_ticks_usec() - started
	started = Time.get_ticks_usec()
	for i: int in range(points.size()):
		var actual: float = game._board_height_at(points[i],cells[i])
		if absf(actual-expected[i]) > 0.00001:
			failures += 1
			push_error("Height mismatch at %s: %s != %s" % [points[i],actual,expected[i]])
	var native_usec := Time.get_ticks_usec() - started
	started = Time.get_ticks_usec()
	for i: int in range(points.size()): game._board_height_at(points[i],cells[i])
	var warm_usec := Time.get_ticks_usec() - started
	print("YAKOLAK_HEIGHT_WARM samples=%d ms=%.3f speedup=%.2f" % [points.size(),warm_usec/1000.0,float(legacy_usec)/maxi(warm_usec,1)])
	print("YAKOLAK_HEIGHT_BENCHMARK samples=%d legacy_ms=%.3f native_cold_ms=%.3f speedup=%.2f" % [points.size(),legacy_usec/1000.0,native_usec/1000.0,float(legacy_usec)/maxi(native_usec,1)])
	var candidates: Array[int] = []
	for i: int in range(piece_records.size()): candidates.append(i)
	var screens: Array[Vector2] = []
	for record: Dictionary in piece_records:
		var instance: MeshInstance3D = record.mesh
		var center := camera.unproject_position(instance.global_position + Vector3.UP*0.3)
		for x: int in range(-5,6):
			for y: int in range(-5,6): screens.append(center + Vector2(x*5,y*5))
	screens.append(Vector2(-100,-100))
	screens.append(Vector2(4000,4000))
	var expected_picks: Array[int] = []
	started = Time.get_ticks_usec()
	for screen: Vector2 in screens: expected_picks.append(_legacy_mesh_piece_at_pointer(screen,candidates))
	legacy_usec = Time.get_ticks_usec() - started
	started = Time.get_ticks_usec()
	for i: int in range(screens.size()):
		var actual: int = game._mesh_piece_at_pointer(screens[i],candidates)
		if actual != expected_picks[i]:
			failures += 1
			push_error("Pick mismatch: %s != %s" % [actual,expected_picks[i]])
	native_usec = Time.get_ticks_usec() - started
	print("YAKOLAK_PICK_BENCHMARK samples=%d legacy_ms=%.3f native_cold_ms=%.3f speedup=%.2f hits=%d" % [screens.size(),legacy_usec/1000.0,native_usec/1000.0,float(legacy_usec)/maxi(native_usec,1),expected_picks.filter(func(i): return i>=0).size()])
	game.free()
	intro.free()
	print("YAKOLAK_EXACT_MESH_QUERY failures=%d" % failures)
	quit(1 if failures else 0)

func _legacy_prepare_board_faces() -> void:
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


func _legacy_board_height_at(point: Vector3, cell: int) -> float:
	_legacy_prepare_board_faces()
	var height := -INF
	for triangle: PackedVector3Array in board_cell_faces[cell]:
		var hit: Variant = Geometry3D.segment_intersects_triangle(Vector3(point.x,10,point.z),Vector3(point.x,-10,point.z),triangle[0],triangle[1],triangle[2])
		if hit != null: height = maxf(height,hit.y)
	return CELL_COORDS[cell].y*U if height == -INF else height


func _legacy_mesh_piece_at_pointer(screen_position: Vector2, candidate_indices: Array[int]) -> int:
	if camera == null:
		return -1

	var world_origin: Vector3 = camera.project_ray_origin(screen_position)
	var world_direction: Vector3 = camera.project_ray_normal(screen_position).normalized()
	if world_direction.length_squared() <= 0.000001:
		return -1

	var best_index: int = -1
	var best_distance_squared: float = INF

	for index: int in candidate_indices:
		if index < 0 or index >= piece_records.size():
			continue
		var record: Dictionary = piece_records[index] as Dictionary
		if bool(record.get("played", false)):
			continue
		var mesh_instance: MeshInstance3D = record.get("mesh") as MeshInstance3D
		if mesh_instance == null or mesh_instance.mesh == null or not mesh_instance.is_visible_in_tree():
			continue

		var faces: PackedVector3Array = _piece_pick_faces(index)
		if faces.size() < 3:
			continue

		var inverse: Transform3D = mesh_instance.global_transform.affine_inverse()
		var local_origin: Vector3 = inverse * world_origin
		var local_direction: Vector3 = inverse.basis * world_direction
		if local_direction.length_squared() <= 0.000001:
			continue

		for face_index: int in range(0, faces.size() - 2, 3):
			var hit: Variant = Geometry3D.ray_intersects_triangle(
				local_origin,
				local_direction,
				faces[face_index],
				faces[face_index + 1],
				faces[face_index + 2]
			)
			if hit == null:
				continue
			var local_hit: Vector3 = hit
			var world_hit: Vector3 = mesh_instance.global_transform * local_hit
			var forward_distance: float = (world_hit - world_origin).dot(world_direction)
			if forward_distance <= 0.00001:
				continue
			var distance_squared: float = world_origin.distance_squared_to(world_hit)
			if distance_squared < best_distance_squared:
				best_distance_squared = distance_squared
				best_index = index

	return best_index


func _piece_pick_faces(piece_index: int) -> PackedVector3Array:
	if piece_index < 0 or piece_index >= piece_records.size():
		return PackedVector3Array()
	var record: Dictionary = piece_records[piece_index] as Dictionary
	var cache_key: String = str(record.get("type", ""))
	if _pick_face_cache.has(cache_key):
		var cached: PackedVector3Array = _pick_face_cache[cache_key]
		return cached
	var mesh_instance: MeshInstance3D = record.get("mesh") as MeshInstance3D
	if mesh_instance == null or mesh_instance.mesh == null:
		return PackedVector3Array()
	var faces: PackedVector3Array = mesh_instance.mesh.get_faces()
	_pick_face_cache[cache_key] = faces
	return faces

