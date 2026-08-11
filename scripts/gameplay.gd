extends Node

# YAKOLAK 2.9 — first playable interaction after the approved intro.
# This script does not alter the loader, camera, table, lid, bases, or intro timeline.
# Tap/click one remaining physical stone, then tap/click a legal board cell.

const U: float = 0.04
const PIECE_LAYER: int = 1
const TARGET_LAYER: int = 2
# Match the visible target.  31 overlapped adjacent 48-unit cells and made a
# single mobile tap able to ray-hit the wrong cell.
const DROP_RADIUS: float = 23.0
const MOVE_DURATION: float = 520.0
const MOVE_ARC: float = 18.0
const SELECT_LIFT: float = 8.0
const INPUT_DEBOUNCE_MS: int = 120

const CELL_COORDS: Array[Vector3] = [
	Vector3(-48.0, 2.0, -48.0),
	Vector3(0.0, 2.0, -48.0),
	Vector3(48.0, 2.0, -48.0),
	Vector3(-48.0, 2.0, 0.0),
	Vector3(0.0, 2.0, 0.0),
	Vector3(48.0, 2.0, 0.0),
	Vector3(-48.0, 2.0, 48.0),
	Vector3(0.0, 2.0, 48.0),
	Vector3(48.0, 2.0, 48.0),
]

var intro: Node3D
var camera: Camera3D
var piece_records: Array = []
var target_markers: Array[MeshInstance3D] = []
var initialized: bool = false
var intro_generation_seen: int = 0
var gameplay_ready: bool = false
# Shared explicit handoff application guard. The intro token is consumed once by
# intro_handoff.gd; these counters make the consumer side one-shot as well, even
# when a legacy path or test calls _enable_gameplay() directly.
var intro_handoff_applied_generation: int = -1
var intro_handoff_apply_depth: int = 0
var intro_handoff_apply_count: int = 0
# Every delivery source — signal, direct dispatch, reconnect, and polling — must
# claim the current generation here before touching the ownership token. The
# token in intro_handoff.gd remains the only authority that transfers ownership.
var intro_handoff_claimed_generation: int = -1
var intro_handoff_claim_count: int = 0
# A claim can arrive before the gameplay consumer has finished initialization.
# Hold exactly one claimed generation without scheduling frame retries. The
# successful initialization transition itself resumes that claim once; replay or
# reset clears stale pending work before it can ever touch the ownership token.
var intro_handoff_pending_init_generation: int = -1
var intro_handoff_init_hold_count: int = 0
var intro_handoff_init_wake_count: int = 0
# Polling remains only as loss-recovery delivery. These counters are deliberately
# separate so regressions can prove it never consumes or enables outside claim.
var intro_handoff_poll_attempt_count: int = 0
var intro_handoff_poll_claim_count: int = 0
# Intro-start polling follows the same rule: it may recover a lost delivery, but
# it owns no reset side effect. The existing accept_intro_run_started consumer
# claim remains the single start authority for signal, direct, and polling paths.
var intro_run_started_poll_attempt_count: int = 0
var intro_run_started_poll_claim_count: int = 0

var selected_index: int = -1
var selected_home_position: Vector3 = Vector3.ZERO
var selected_original_material: Material
var occupied_slots: Dictionary = {}
var move_count: int = 0

var move_active: bool = false
var move_piece_index: int = -1
var move_cell: int = -1
var move_started_msec: int = 0
var move_from: Vector3 = Vector3.ZERO
var move_to: Vector3 = Vector3.ZERO
var move_from_scale: Vector3 = Vector3.ONE

var last_pointer_msec: int = -1000
var last_pointer_position: Vector2 = Vector2(-9999.0, -9999.0)


func _ready() -> void:
	process_priority = 20
	intro = get_parent() as Node3D
	set_process(true)
	set_process_input(true)
	if not get_viewport().size_changed.is_connected(_on_viewport_resized):
		get_viewport().size_changed.connect(_on_viewport_resized)


func _process(_delta: float) -> void:
	if not initialized:
		if _initialize_when_ready():
			_complete_gameplay_consumer_initialization()
		if not initialized:
			return

	# Lifecycle ownership is explicit. `playing` belongs to intro visuals and can
	# be false during pre-intro pauses without meaning gameplay may start. Polling
	# is only loss recovery: it must redeliver the start through the same consumer
	# claim as signal/direct and never call _reset_for_intro() on its own.
	var intro_generation: int = int(intro.get("intro_run_generation"))
	if intro_generation > intro_generation_seen:
		_recover_intro_run_start_by_polling(intro_generation)
		return

	# Polling is only a delivery fallback. It may discover a published pending
	# token, but it cannot consume it directly: it must enter the same per-generation
	# consumer claim used by signal/direct/reconnect. After any source claims this
	# generation the polling path becomes completely inert until the next replay.
	if intro_generation_seen > 0 and intro_handoff_claimed_generation != intro_generation_seen:
		if int(intro.get("gameplay_handoff_published_generation")) == intro_generation_seen and bool(intro.get("gameplay_handoff_pending")):
			intro_handoff_poll_attempt_count += 1
			_accept_gameplay_handoff_delivery(intro_generation_seen, "polling")

	if move_active:
		_update_move()


func _recover_intro_run_start_by_polling(generation: int) -> void:
	intro_run_started_poll_attempt_count += 1
	if intro == null or generation <= 0:
		return
	if generation != int(intro.get("intro_run_generation")):
		return
	if not has_method("accept_intro_run_started"):
		_publish_intro_handoff_consumer_probe("intro-start-consumer-missing")
		return
	var seen_before: int = intro_generation_seen
	# Dynamic dispatch intentionally lands on the production explicit consumer's
	# accept_intro_run_started implementation. That method owns dedupe, pending
	# reset, replay invalidation, and observability; polling owns none of them.
	call("accept_intro_run_started", generation)
	if intro_generation_seen == generation and seen_before != generation:
		intro_run_started_poll_claim_count += 1
		print("YAKOLAK_INTRO_RUN_POLL_RECOVERED generation=%d claims=%d" % [generation, intro_run_started_poll_claim_count])


func _accept_gameplay_handoff_delivery(generation: int, source: String = "unknown") -> void:
	if intro == null:
		_publish_intro_handoff_consumer_probe("consume-no-root")
		return
	if generation <= 0:
		_publish_intro_handoff_consumer_probe("consume-invalid-generation")
		return
	if generation != int(intro.get("intro_run_generation")):
		_publish_intro_handoff_consumer_probe("consume-stale-generation")
		return
	intro_generation_seen = generation
	# The first delivery source for a published pending token owns the consumer
	# claim. Same-generation duplicates return before token access or observability.
	if generation == intro_handoff_claimed_generation:
		return
	if int(intro.get("gameplay_handoff_published_generation")) != generation:
		return
	if not bool(intro.get("gameplay_handoff_pending")):
		return
	intro_handoff_claimed_generation = generation
	intro_handoff_claim_count += 1
	if source == "polling":
		intro_handoff_poll_claim_count += 1
	print("YAKOLAK_INTRO_HANDOFF_CLAIMED generation=%d claims=%d source=%s" % [generation, intro_handoff_claim_count, source])
	_publish_intro_handoff_consumer_probe("handoff-seen")
	_consume_claimed_gameplay_handoff(generation)


func _consume_claimed_gameplay_handoff(generation: int) -> void:
	# Delayed initialization never creates a second delivery authority. The claim
	# is held once until initialization completes, and replay can cancel the held
	# generation silently before any token access occurs.
	if intro == null:
		return
	if generation != intro_handoff_claimed_generation:
		return
	if generation != int(intro.get("intro_run_generation")):
		return
	if not initialized:
		if intro_handoff_pending_init_generation != generation:
			intro_handoff_pending_init_generation = generation
			intro_handoff_init_hold_count += 1
			_publish_intro_handoff_consumer_probe("handoff-pending-init")
		return
	intro_handoff_pending_init_generation = -1
	if not intro.has_method("consume_gameplay_handoff"):
		_publish_intro_handoff_consumer_probe("consume-method-missing")
		return
	if bool(intro.call("consume_gameplay_handoff", generation)):
		_publish_intro_handoff_consumer_probe("handoff-consumed")
		_enable_gameplay()
	else:
		# This is a genuine failure of the single claimed delivery. Polling cannot
		# start another same-generation attempt after the claim has been established.
		_publish_intro_handoff_consumer_probe("handoff-token-rejected")


func _complete_gameplay_consumer_initialization() -> void:
	# This is the only wake-up for a claim that arrived before initialization. It
	# is invoked exactly when _initialize_when_ready() succeeds, never once/frame.
	if initialized:
		return
	initialized = true
	var pending_generation: int = intro_handoff_pending_init_generation
	intro_handoff_pending_init_generation = -1
	if pending_generation <= 0:
		return
	if intro == null:
		return
	if pending_generation != intro_handoff_claimed_generation:
		return
	if pending_generation != int(intro.get("intro_run_generation")):
		return
	intro_handoff_init_wake_count += 1
	print("YAKOLAK_INTRO_HANDOFF_INIT_WAKE generation=%d wakes=%d" % [pending_generation, intro_handoff_init_wake_count])
	_consume_claimed_gameplay_handoff(pending_generation)


func _cancel_pending_gameplay_handoff_initialization() -> void:
	intro_handoff_pending_init_generation = -1


func _publish_intro_handoff_consumer_probe(_value: String) -> void:
	# The production explicit layer overrides this hook for Web observability.
	# Base consumers keep the exact same claim/token contract without a Web probe.
	pass


func _intro_handoff_generation_ready() -> int:
	if intro == null:
		return -1
	var generation: int = int(intro.get("intro_run_generation"))
	if generation <= 0:
		return -1
	if int(intro.get("gameplay_handoff_consumed_generation")) != generation:
		return -1
	return generation


func _intro_handoff_ready() -> bool:
	return _intro_handoff_generation_ready() > 0


func _intro_handoff_is_consumed() -> bool:
	return _intro_handoff_ready()


func _begin_intro_handoff_application() -> bool:
	var generation: int = _intro_handoff_generation_ready()
	if generation <= 0:
		return false
	# Nested super implementations participate in one outer application. Only the
	# first entry for a generation increments the observable application count.
	if intro_handoff_apply_depth > 0:
		if intro_handoff_applied_generation != generation:
			return false
		intro_handoff_apply_depth += 1
		return true
	if intro_handoff_applied_generation == generation:
		return false
	intro_handoff_applied_generation = generation
	intro_handoff_apply_depth = 1
	intro_handoff_apply_count += 1
	return true


func _end_intro_handoff_application() -> void:
	if intro_handoff_apply_depth > 0:
		intro_handoff_apply_depth -= 1


func _input(event: InputEvent) -> void:
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

	if not pressed:
		return

	# Before a match is enabled, leave the event to the setup/tutorial controls.
	# Handling it here used to swallow every button tap on the post-intro screen.
	if not initialized or not gameplay_ready or move_active:
		return
	get_viewport().set_input_as_handled()

	var now: int = Time.get_ticks_msec()
	if now - last_pointer_msec < INPUT_DEBOUNCE_MS and pointer_position.distance_to(last_pointer_position) < 12.0:
		return
	last_pointer_msec = now
	last_pointer_position = pointer_position

	_handle_pointer(pointer_position)


func _initialize_when_ready() -> bool:
	if intro == null:
		return false
	camera = intro.get("camera") as Camera3D
	var records_value: Variant = intro.get("pieces")
	if camera == null or not records_value is Array:
		return false
	piece_records = records_value as Array
	if piece_records.size() != 36:
		return false

	_build_piece_colliders()
	_build_board_targets()
	for index: int in range(piece_records.size()):
		var record: Dictionary = piece_records[index] as Dictionary
		record["played"] = false
		piece_records[index] = record
	print("YAKOLAK_GAMEPLAY_INTERACTION_INITIALIZED pieces=36 cells=9")
	return true


func _build_piece_colliders() -> void:
	for index: int in range(piece_records.size()):
		var record: Dictionary = piece_records[index] as Dictionary
		var mesh_instance := record["mesh"] as MeshInstance3D
		if mesh_instance == null or mesh_instance.mesh == null:
			continue
		var faces: PackedVector3Array = mesh_instance.mesh.get_faces()
		if faces.is_empty():
			continue
		var shape := ConcavePolygonShape3D.new()
		shape.set_faces(faces)
		var body := StaticBody3D.new()
		body.name = "PiecePickBody_%02d" % index
		body.collision_layer = PIECE_LAYER
		body.collision_mask = 0
		body.set_meta("piece_index", index)
		var collision := CollisionShape3D.new()
		collision.shape = shape
		body.add_child(collision)
		mesh_instance.add_child(body)


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

		var marker_mesh := CylinderMesh.new()
		marker_mesh.top_radius = 23.0 * U
		marker_mesh.bottom_radius = 23.0 * U
		marker_mesh.height = 0.025
		marker_mesh.radial_segments = 48
		var marker := MeshInstance3D.new()
		marker.name = "LegalTarget_%d" % cell
		marker.mesh = marker_mesh
		marker.position = Vector3(raw_position.x * U, 0.515, raw_position.z * U)
		marker.material_override = _marker_material(Color(1.0, 1.0, 1.0, 0.18))
		marker.visible = false
		marker.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		intro.add_child(marker)
		target_markers.append(marker)


func _handle_pointer(screen_position: Vector2) -> void:
	if selected_index >= 0:
		var target_hit: Dictionary = _ray_pick(screen_position, TARGET_LAYER)
		if not target_hit.is_empty():
			var target_collider: Object = target_hit["collider"] as Object
			if target_collider != null and target_collider.has_meta("cell"):
				var cell: int = int(target_collider.get_meta("cell"))
				if _is_legal_cell(cell, _selected_size()):
					_begin_move(cell)
				else:
					_publish_invalid(cell)
				return

	var piece_hit: Dictionary = _ray_pick(screen_position, PIECE_LAYER)
	if not piece_hit.is_empty():
		var piece_collider: Object = piece_hit["collider"] as Object
		if piece_collider != null and piece_collider.has_meta("piece_index"):
			var piece_index: int = int(piece_collider.get_meta("piece_index"))
			var record: Dictionary = piece_records[piece_index] as Dictionary
			if not bool(record.get("played", false)):
				_select_piece(piece_index)
				return

	if selected_index >= 0:
		_clear_selection()


func _ray_pick(screen_position: Vector2, collision_mask: int) -> Dictionary:
	if camera == null or intro.get_world_3d() == null:
		return {}
	var origin: Vector3 = camera.project_ray_origin(screen_position)
	var direction: Vector3 = camera.project_ray_normal(screen_position)
	var query := PhysicsRayQueryParameters3D.create(origin, origin + direction * 200.0, collision_mask)
	query.collide_with_areas = false
	query.collide_with_bodies = true
	return intro.get_world_3d().direct_space_state.intersect_ray(query)


func _select_piece(piece_index: int) -> void:
	if piece_index == selected_index:
		_clear_selection()
		return
	_clear_selection()

	selected_index = piece_index
	var record: Dictionary = piece_records[selected_index] as Dictionary
	var mesh_instance := record["mesh"] as MeshInstance3D
	selected_home_position = mesh_instance.position
	selected_original_material = mesh_instance.material_override
	mesh_instance.position = selected_home_position + Vector3.UP * SELECT_LIFT * U
	mesh_instance.scale = Vector3.ONE * U * 1.08
	mesh_instance.material_override = _selection_material(selected_original_material)
	_update_legal_markers(str(record["type"]), _piece_color(record))
	_publish_selection(record)


func _clear_selection() -> void:
	if selected_index < 0:
		_hide_markers()
		return
	var record: Dictionary = piece_records[selected_index] as Dictionary
	var mesh_instance := record["mesh"] as MeshInstance3D
	if mesh_instance != null and not bool(record.get("played", false)) and not move_active:
		mesh_instance.position = selected_home_position
		mesh_instance.scale = Vector3.ONE * U
		mesh_instance.material_override = selected_original_material
	selected_index = -1
	selected_original_material = null
	_hide_markers()
	_publish_gameplay_state("ready")


func _begin_move(cell: int) -> void:
	if selected_index < 0:
		return
	var record: Dictionary = piece_records[selected_index] as Dictionary
	var size_name: String = str(record["type"])
	if not _is_legal_cell(cell, size_name):
		_publish_invalid(cell)
		return

	var mesh_instance := record["mesh"] as MeshInstance3D
	move_active = true
	gameplay_ready = false
	move_piece_index = selected_index
	move_cell = cell
	move_started_msec = Time.get_ticks_msec()
	move_from = mesh_instance.position
	move_to = CELL_COORDS[cell] * U
	move_from_scale = mesh_instance.scale
	_hide_markers()
	_publish_move_started(record, cell)


func _update_move() -> void:
	if move_piece_index < 0:
		move_active = false
		return
	var record: Dictionary = piece_records[move_piece_index] as Dictionary
	var mesh_instance := record["mesh"] as MeshInstance3D
	var elapsed: float = float(Time.get_ticks_msec() - move_started_msec)
	var progress: float = clampf(elapsed / MOVE_DURATION, 0.0, 1.0)
	var eased: float = _ease(progress)
	mesh_instance.position = move_from.lerp(move_to, eased)
	mesh_instance.position.y += sin(eased * PI) * MOVE_ARC * U
	mesh_instance.scale = move_from_scale.lerp(Vector3.ONE * U, eased)
	if progress < 1.0:
		return

	mesh_instance.position = move_to
	mesh_instance.scale = Vector3.ONE * U
	mesh_instance.material_override = selected_original_material
	record["played"] = true
	piece_records[move_piece_index] = record
	occupied_slots[_slot_key(move_cell, str(record["type"]))] = move_piece_index
	move_count += 1
	move_active = false
	gameplay_ready = true
	selected_index = -1
	selected_original_material = null
	var completed_cell: int = move_cell
	move_piece_index = -1
	move_cell = -1
	_publish_move_complete(record, completed_cell)
	_publish_test_targets.call_deferred()


func _enable_gameplay() -> void:
	if not _begin_intro_handoff_application():
		return
	gameplay_ready = true
	move_active = false
	_hide_markers()
	_publish_gameplay_state("ready")
	_publish_test_targets.call_deferred()
	print("YAKOLAK_GAMEPLAY_READY selectable=36 cells=9")
	_end_intro_handoff_application()


func _reset_for_intro() -> void:
	# A replay starts a new generation, so the previous applied generation stays
	# recorded while any interrupted nested application scope is discarded.
	intro_handoff_apply_depth = 0
	_cancel_pending_gameplay_handoff_initialization()
	if selected_index >= 0:
		var selected_record: Dictionary = piece_records[selected_index] as Dictionary
		var selected_mesh := selected_record["mesh"] as MeshInstance3D
		if selected_mesh != null:
			selected_mesh.material_override = selected_original_material
	occupied_slots.clear()
	move_count = 0
	move_active = false
	move_piece_index = -1
	move_cell = -1
	selected_index = -1
	selected_original_material = null
	_hide_markers()
	for index: int in range(piece_records.size()):
		var record: Dictionary = piece_records[index] as Dictionary
		record["played"] = false
		piece_records[index] = record
		var mesh_instance := record["mesh"] as MeshInstance3D
		if mesh_instance != null:
			mesh_instance.scale = Vector3.ONE * U
	_publish_gameplay_state("intro")


func _is_legal_cell(cell: int, size_name: String) -> bool:
	return cell >= 0 and cell < CELL_COORDS.size() and not occupied_slots.has(_slot_key(cell, size_name))


func _slot_key(cell: int, size_name: String) -> String:
	return "%d:%s" % [cell, size_name]


func _selected_size() -> String:
	if selected_index < 0:
		return ""
	var record: Dictionary = piece_records[selected_index] as Dictionary
	return str(record["type"])


func _piece_color(record: Dictionary) -> Color:
	var mesh_instance := record["mesh"] as MeshInstance3D
	var material := mesh_instance.material_override as StandardMaterial3D
	if material != null:
		return material.albedo_color
	return Color.WHITE


func _update_legal_markers(size_name: String, piece_color: Color) -> void:
	for cell: int in range(target_markers.size()):
		var marker: MeshInstance3D = target_markers[cell]
		var legal: bool = _is_legal_cell(cell, size_name)
		marker.visible = legal
		if legal:
			var marker_color := Color(piece_color.r, piece_color.g, piece_color.b, 0.22)
			marker.material_override = _marker_material(marker_color)


func _hide_markers() -> void:
	for marker: MeshInstance3D in target_markers:
		marker.visible = false


func _selection_material(source: Material) -> StandardMaterial3D:
	var result: StandardMaterial3D
	if source is StandardMaterial3D:
		result = (source as StandardMaterial3D).duplicate() as StandardMaterial3D
	else:
		result = StandardMaterial3D.new()
		result.albedo_color = Color.WHITE
	result.emission_enabled = true
	result.emission = result.albedo_color.lightened(0.30)
	result.emission_energy_multiplier = 1.4
	return result


func _marker_material(color: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.albedo_color = color
	material.emission_enabled = true
	material.emission = Color(color.r, color.g, color.b, 1.0)
	material.emission_energy_multiplier = 0.8
	material.roughness = 0.45
	return material


func _ease(value: float) -> float:
	var t: float = clampf(value, 0.0, 1.0)
	return 4.0 * t * t * t if t < 0.5 else 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0


func _publish_selection(record: Dictionary) -> void:
	var mesh_instance := record["mesh"] as MeshInstance3D
	print("YAKOLAK_PIECE_SELECTED name=%s size=%s" % [mesh_instance.name, str(record["type"])])
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakGameplay='piece-selected';" +
			"document.body.dataset.yakolakSelected='" + str(mesh_instance.name) + "';" +
			"document.body.dataset.yakolakSelectedSize='" + str(record["type"]) + "';",
			true
		)


func _publish_move_started(record: Dictionary, cell: int) -> void:
	print("YAKOLAK_MOVE_STARTED cell=%d size=%s" % [cell, str(record["type"])])
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakGameplay='placing';" +
			"document.body.dataset.yakolakTargetCell='" + str(cell) + "';",
			true
		)


func _publish_move_complete(record: Dictionary, cell: int) -> void:
	print("YAKOLAK_MOVE_COMPLETE move=%d cell=%d size=%s dir=%s" % [move_count, cell, str(record["type"]), str(record["dir"])])
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakGameplay='ready';" +
			"document.body.dataset.yakolakMoves='" + str(move_count) + "';" +
			"document.body.dataset.yakolakLastCell='" + str(cell) + "';" +
			"document.body.dataset.yakolakLastSize='" + str(record["type"]) + "';" +
			"document.body.dataset.yakolakLastSide='" + str(record["dir"]) + "';" +
			"document.body.dataset.yakolakSelected='';",
			true
		)


func _publish_invalid(cell: int) -> void:
	print("YAKOLAK_MOVE_INVALID cell=%d size=%s" % [cell, _selected_size()])
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakGameplay='invalid';" +
			"document.body.dataset.yakolakInvalidCell='" + str(cell) + "';",
			true
		)
	get_tree().create_timer(0.30).timeout.connect(_restore_selected_state)


func _restore_selected_state() -> void:
	if selected_index >= 0 and not move_active:
		var record: Dictionary = piece_records[selected_index] as Dictionary
		_publish_selection(record)


func _publish_gameplay_state(state: String) -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakGameplay='" + state + "';" +
			"document.body.dataset.yakolakMoves='" + str(move_count) + "';" +
			"document.body.dataset.yakolakSelected='';",
			true
		)


func _publish_test_targets() -> void:
	if not gameplay_ready or camera == null:
		return
	var sample_index: int = -1
	for index: int in range(piece_records.size()):
		var record: Dictionary = piece_records[index] as Dictionary
		if not bool(record.get("played", false)) and str(record["dir"]) == "right" and int(record["side"]) == 0 and str(record["type"]) == "large":
			sample_index = index
			break
	if sample_index < 0:
		return
	var sample_record: Dictionary = piece_records[sample_index] as Dictionary
	var sample_mesh := sample_record["mesh"] as MeshInstance3D
	var piece_world_point: Vector3 = sample_mesh.to_global(Vector3(17.0, 0.0, 9.5))
	var piece_screen: Vector2 = camera.unproject_position(piece_world_point)
	var cell_world_point: Vector3 = Vector3(CELL_COORDS[4].x * U, 0.52, CELL_COORDS[4].z * U)
	var cell_screen: Vector2 = camera.unproject_position(cell_world_point)
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakTestPieceX='" + str(piece_screen.x) + "';" +
			"document.body.dataset.yakolakTestPieceY='" + str(piece_screen.y) + "';" +
			"document.body.dataset.yakolakTestCellX='" + str(cell_screen.x) + "';" +
			"document.body.dataset.yakolakTestCellY='" + str(cell_screen.y) + "';" +
			"document.body.dataset.yakolakTestPiece='" + str(sample_mesh.name) + "';",
			true
		)


func _on_viewport_resized() -> void:
	_publish_test_targets.call_deferred()
