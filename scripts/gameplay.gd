extends Node

# YAKOLAK Free Play — the approved 2.9 table with deliberately no game rules.
# Tap/click any stone, then tap/click anywhere on the board. Every stone remains
# movable forever. RESET returns all 36 stones to the four player bases.

const U: float = 0.04
const PIECE_LAYER: int = 1
const BOARD_LAYER: int = 2
const BOARD_HALF_EXTENT: float = 78.0 * U
const PIECE_Y: float = 2.0 * U
const SELECT_LIFT: float = 8.0 * U
const MOVE_ARC: float = 12.0 * U
const MOVE_DURATION_MS: float = 260.0
const INPUT_DEBOUNCE_MS: int = 100

var table: Node3D
var camera: Camera3D
var pieces: Array = []
var home_states: Array[Dictionary] = []
var initialized: bool = false
var gameplay_ready: bool = false

var selected_index: int = -1
var selected_position: Vector3 = Vector3.ZERO
var selected_material: Material

var move_active: bool = false
var move_piece_index: int = -1
var move_started_msec: int = 0
var move_from: Vector3 = Vector3.ZERO
var move_to: Vector3 = Vector3.ZERO
var move_count: int = 0

var last_pointer_msec: int = -1000
var last_pointer_position: Vector2 = Vector2(-9999.0, -9999.0)


func _ready() -> void:
	process_priority = 20
	table = get_parent() as Node3D
	set_process(true)
	set_process_unhandled_input(true)
	if not get_viewport().size_changed.is_connected(_publish_test_targets):
		get_viewport().size_changed.connect(_publish_test_targets)


func _process(_delta: float) -> void:
	if not initialized:
		initialized = _initialize_when_ready()
		return
	if move_active:
		_update_move()


func _unhandled_input(event: InputEvent) -> void:
	var pointer_position: Vector2
	var pressed: bool = false
	if event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		pressed = touch.pressed
		pointer_position = touch.position
	elif event is InputEventMouseButton:
		var mouse := event as InputEventMouseButton
		pressed = mouse.pressed and mouse.button_index == MOUSE_BUTTON_LEFT
		pointer_position = mouse.position
	else:
		return
	if not pressed or not gameplay_ready or move_active:
		return

	var now: int = Time.get_ticks_msec()
	if now - last_pointer_msec < INPUT_DEBOUNCE_MS and pointer_position.distance_to(last_pointer_position) < 12.0:
		return
	last_pointer_msec = now
	last_pointer_position = pointer_position
	get_viewport().set_input_as_handled()
	_handle_pointer(pointer_position)


func _initialize_when_ready() -> bool:
	if table == null or bool(table.get("playing")):
		return false
	camera = table.get("camera") as Camera3D
	var records_value: Variant = table.get("pieces")
	if camera == null or not records_value is Array:
		return false
	pieces = records_value as Array
	if pieces.size() != 36:
		return false

	for index: int in range(pieces.size()):
		var record: Dictionary = pieces[index] as Dictionary
		var mesh := record["mesh"] as MeshInstance3D
		if mesh == null:
			return false
		home_states.append({
			"position": mesh.position,
			"rotation": mesh.rotation,
			"scale": mesh.scale,
			"material": mesh.material_override,
		})
	_build_piece_colliders()
	_build_board_surface()
	_build_reset_button()
	gameplay_ready = true
	_publish_state("ready")
	_publish_test_targets.call_deferred()
	print("YAKOLAK_FREE_PLAY_READY players=4 pieces=36 rules=none")
	return true


func _build_piece_colliders() -> void:
	for index: int in range(pieces.size()):
		var record: Dictionary = pieces[index] as Dictionary
		var mesh := record["mesh"] as MeshInstance3D
		var faces: PackedVector3Array = mesh.mesh.get_faces()
		if faces.is_empty():
			continue
		var shape := ConcavePolygonShape3D.new()
		shape.set_faces(faces)
		var body := StaticBody3D.new()
		body.name = "FreePiece_%02d" % index
		body.collision_layer = PIECE_LAYER
		body.collision_mask = 0
		body.set_meta("piece_index", index)
		var collision := CollisionShape3D.new()
		collision.shape = shape
		body.add_child(collision)
		mesh.add_child(body)


func _build_board_surface() -> void:
	var body := StaticBody3D.new()
	body.name = "FreePlacementSurface"
	body.collision_layer = BOARD_LAYER
	body.collision_mask = 0
	body.position = Vector3(0.0, 0.23, 0.0)
	var shape := BoxShape3D.new()
	shape.size = Vector3(BOARD_HALF_EXTENT * 2.0, 0.45, BOARD_HALF_EXTENT * 2.0)
	var collision := CollisionShape3D.new()
	collision.shape = shape
	body.add_child(collision)
	table.add_child(body)


func _build_reset_button() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 20
	table.add_child(layer)
	var reset := Button.new()
	reset.name = "Reset"
	reset.text = "RESET"
	reset.focus_mode = Control.FOCUS_NONE
	reset.anchor_left = 1.0
	reset.anchor_right = 1.0
	reset.offset_left = -160.0
	reset.offset_right = -16.0
	reset.offset_top = 18.0
	reset.offset_bottom = 102.0
	reset.add_theme_font_size_override("font_size", 18)
	var normal := StyleBoxFlat.new()
	normal.bg_color = Color(0.05, 0.05, 0.05, 0.88)
	normal.corner_radius_top_left = 12
	normal.corner_radius_top_right = 12
	normal.corner_radius_bottom_left = 12
	normal.corner_radius_bottom_right = 12
	normal.content_margin_left = 18.0
	normal.content_margin_right = 18.0
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = Color(0.12, 0.12, 0.12, 0.96)
	var pressed := normal.duplicate() as StyleBoxFlat
	pressed.bg_color = Color(0.0, 0.0, 0.0, 1.0)
	reset.add_theme_stylebox_override("normal", normal)
	reset.add_theme_stylebox_override("hover", hover)
	reset.add_theme_stylebox_override("pressed", pressed)
	reset.pressed.connect(_reset_all)
	layer.add_child(reset)


func _handle_pointer(screen_position: Vector2) -> void:
	var piece_hit: Dictionary = _ray_pick(screen_position, PIECE_LAYER)
	if not piece_hit.is_empty():
		var collider: Object = piece_hit["collider"] as Object
		if collider != null and collider.has_meta("piece_index"):
			_select_piece(int(collider.get_meta("piece_index")))
			return

	if selected_index >= 0:
		var board_hit: Dictionary = _ray_pick(screen_position, BOARD_LAYER)
		if not board_hit.is_empty():
			var hit_position: Vector3 = board_hit["position"] as Vector3
			_begin_move(Vector3(
				clampf(hit_position.x, -BOARD_HALF_EXTENT, BOARD_HALF_EXTENT),
				PIECE_Y,
				clampf(hit_position.z, -BOARD_HALF_EXTENT, BOARD_HALF_EXTENT)
			))
			return
		_clear_selection()


func _ray_pick(screen_position: Vector2, collision_mask: int) -> Dictionary:
	if camera == null or table.get_world_3d() == null:
		return {}
	var origin: Vector3 = camera.project_ray_origin(screen_position)
	var direction: Vector3 = camera.project_ray_normal(screen_position)
	var query := PhysicsRayQueryParameters3D.create(origin, origin + direction * 200.0, collision_mask)
	query.collide_with_areas = false
	query.collide_with_bodies = true
	return table.get_world_3d().direct_space_state.intersect_ray(query)


func _select_piece(index: int) -> void:
	if index == selected_index:
		_clear_selection()
		return
	_clear_selection()
	selected_index = index
	var record: Dictionary = pieces[index] as Dictionary
	var mesh := record["mesh"] as MeshInstance3D
	selected_position = mesh.position
	selected_material = mesh.material_override
	mesh.position = selected_position + Vector3.UP * SELECT_LIFT
	mesh.material_override = _selection_material(selected_material)
	_publish_state("selected")


func _clear_selection() -> void:
	if selected_index < 0:
		return
	var record: Dictionary = pieces[selected_index] as Dictionary
	var mesh := record["mesh"] as MeshInstance3D
	if not move_active:
		mesh.position = selected_position
		mesh.material_override = selected_material
	selected_index = -1
	selected_material = null
	_publish_state("ready")


func _begin_move(target: Vector3) -> void:
	if selected_index < 0:
		return
	var record: Dictionary = pieces[selected_index] as Dictionary
	var mesh := record["mesh"] as MeshInstance3D
	move_active = true
	gameplay_ready = false
	move_piece_index = selected_index
	move_started_msec = Time.get_ticks_msec()
	move_from = mesh.position
	move_to = target
	_publish_state("moving")


func _update_move() -> void:
	var record: Dictionary = pieces[move_piece_index] as Dictionary
	var mesh := record["mesh"] as MeshInstance3D
	var progress: float = clampf(float(Time.get_ticks_msec() - move_started_msec) / MOVE_DURATION_MS, 0.0, 1.0)
	var eased: float = _ease(progress)
	mesh.position = move_from.lerp(move_to, eased)
	mesh.position.y += sin(eased * PI) * MOVE_ARC
	if progress < 1.0:
		return
	mesh.position = move_to
	mesh.material_override = selected_material
	move_count += 1
	move_active = false
	move_piece_index = -1
	selected_index = -1
	selected_material = null
	gameplay_ready = true
	_publish_state("ready")


func _reset_all() -> void:
	move_active = false
	move_piece_index = -1
	selected_index = -1
	selected_material = null
	move_count = 0
	for index: int in range(pieces.size()):
		var record: Dictionary = pieces[index] as Dictionary
		var mesh := record["mesh"] as MeshInstance3D
		var home: Dictionary = home_states[index]
		mesh.position = home["position"] as Vector3
		mesh.rotation = home["rotation"] as Vector3
		mesh.scale = home["scale"] as Vector3
		mesh.material_override = home["material"] as Material
	gameplay_ready = true
	_publish_state("ready")
	_publish_test_targets.call_deferred()
	print("YAKOLAK_FREE_PLAY_RESET players=4 pieces=36")


func _selection_material(source: Material) -> StandardMaterial3D:
	var result: StandardMaterial3D
	if source is StandardMaterial3D:
		result = (source as StandardMaterial3D).duplicate() as StandardMaterial3D
	else:
		result = StandardMaterial3D.new()
		result.albedo_color = Color.WHITE
	result.emission_enabled = true
	result.emission = result.albedo_color.lightened(0.28)
	result.emission_energy_multiplier = 1.25
	return result


func _ease(value: float) -> float:
	var t: float = clampf(value, 0.0, 1.0)
	return 1.0 - pow(1.0 - t, 3.0)


func _publish_state(state: String) -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakMode='free-play';" +
			"document.body.dataset.yakolakGameplay='" + state + "';" +
			"document.body.dataset.yakolakPlayers='4';" +
			"document.body.dataset.yakolakRules='none';" +
			"document.body.dataset.yakolakMoves='" + str(move_count) + "';",
			true
		)


func _publish_test_targets() -> void:
	if not gameplay_ready or camera == null or pieces.is_empty() or not OS.has_feature("web"):
		return
	var sample_index: int = -1
	for index: int in range(pieces.size()):
		var record: Dictionary = pieces[index] as Dictionary
		if str(record["dir"]) == "right" and int(record["side"]) == 0 and str(record["type"]) == "large":
			sample_index = index
			break
	if sample_index < 0:
		return
	var sample: Dictionary = pieces[sample_index] as Dictionary
	var mesh := sample["mesh"] as MeshInstance3D
	var piece_screen: Vector2 = camera.unproject_position(mesh.to_global(Vector3(17.0, 0.0, 9.5)))
	var board_screen: Vector2 = camera.unproject_position(Vector3(0.0, 0.52, 0.0))
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakTestPieceX='" + str(piece_screen.x) + "';" +
		"document.body.dataset.yakolakTestPieceY='" + str(piece_screen.y) + "';" +
		"document.body.dataset.yakolakTestBoardX='" + str(board_screen.x) + "';" +
		"document.body.dataset.yakolakTestBoardY='" + str(board_screen.y) + "';",
		true
	)
