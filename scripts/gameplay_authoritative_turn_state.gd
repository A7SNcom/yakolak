extends "res://scripts/gameplay_explicit_handoff.gd"

# TURN-UI-08: one event-driven observer contract for turn presentation.
# UX-TURN-33: accepted online seat ownership also owns the pointer-readiness
# boundary. Presentation motion may continue, but camera/light/tween state is
# never consulted to grant or delay an already-authoritative local turn.
# This layer still does not own or advance turns.
signal authoritative_turn_changed(snapshot: Dictionary)

var authoritative_turn_revision: int = 0
var authoritative_turn_last_key: String = ""
var authoritative_turn_cached_snapshot: Dictionary = {}
var authoritative_turn_transitioning: bool = false
var authoritative_online_snapshot_hydrated: bool = false
var authoritative_input_dispatch_count: int = 0
var authoritative_input_visual_motion_count: int = 0
var authoritative_input_last_dispatch_msec: int = 0
var authoritative_test_refresh_target_callback: Variant


func _ready() -> void:
	super._ready()
	if OS.has_feature("web") and bool(JavaScriptBridge.eval("Boolean(navigator.webdriver)", true)):
		authoritative_test_refresh_target_callback = JavaScriptBridge.create_callback(_on_authoritative_test_target_requested)
		var window: JavaScriptObject = JavaScriptBridge.get_interface("window")
		if window != null:
			window.set("yakolakTestRefreshAuthorityPickTarget", authoritative_test_refresh_target_callback)
	call_deferred("_publish_authoritative_turn_state", "ready")


# GGH-039: transport recovery is not gameplay readiness. Reuse the existing
# OnlineSession hydration barrier; do not create a second authority state.
func _reconnect_hydration_blocked() -> bool:
	if not online_active or online == null:
		return false
	return bool(online.get("reconnecting")) or bool(online.get("reconnect_hydration_pending"))


func _handle_pointer(screen_position: Vector2) -> void:
	if _reconnect_hydration_blocked():
		return
	super._handle_pointer(screen_position)


func _begin_move(cell: int) -> void:
	if _reconnect_hydration_blocked():
		return
	super._begin_move(cell)


func _clear_reconnect_visual_intent() -> void:
	# Selection/tray state is presentation only. Any unresolved exactly-once
	# mutation remains owned by OnlineSession/explicit-handoff reconciliation.
	if tray_tween != null and tray_tween.is_valid():
		tray_tween.kill()
	tray_tween = null
	if tray_open:
		for index: int in tray_indices:
			if index < 0 or index >= piece_records.size():
				continue
			var record: Dictionary = piece_records[index] as Dictionary
			var piece: MeshInstance3D = record["mesh"] as MeshInstance3D
			if index < home_materials.size():
				piece.material_override = home_materials[index]
			if not bool(record.get("played", false)) and index < home_transforms.size():
				piece.position = home_transforms[index].origin
		tray_open = false
		tray_side = 0
		tray_indices.clear()
		_publish_tray_state("closed")
	elif selected_index >= 0 and selected_index < piece_records.size():
		var selected_record: Dictionary = piece_records[selected_index] as Dictionary
		var selected_mesh: MeshInstance3D = selected_record["mesh"] as MeshInstance3D
		if selected_mesh != null and not bool(selected_record.get("played", false)) and not move_active:
			selected_mesh.position = selected_home_position
			selected_mesh.scale = Vector3.ONE * U
			selected_mesh.material_override = selected_original_material
	selected_index = -1
	selected_original_material = null
	_hide_markers()
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakSelected='';" +
			"delete document.body.dataset.yakolakSelectedSize;" +
			"document.body.dataset.yakolakGameplay='restoring';",
			true
		)


func authoritative_turn_snapshot() -> Dictionary:
	if authoritative_turn_cached_snapshot.is_empty():
		var snapshot: Dictionary = _build_authoritative_turn_snapshot("read")
		snapshot["revision"] = authoritative_turn_revision
		return snapshot
	return authoritative_turn_cached_snapshot.duplicate(true)


func _input(event: InputEvent) -> void:
	# Once an accepted room snapshot says this seat owns the turn, dispatch the
	# exact existing gameplay pointer path directly. The inherited shared-device
	# path may still gate on camera motion; online authority must not. Duplicate
	# commits remain guarded by gameplay_explicit_handoff._begin_move().
	if not _authoritative_online_pointer_ready():
		super._input(event)
		return

	var pointer_position: Vector2 = Vector2.ZERO
	var pressed: bool = false
	var pointer_event: bool = true
	if event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		pressed = touch.pressed
		pointer_position = touch.position
	elif event is InputEventMouseButton:
		var mouse := event as InputEventMouseButton
		pressed = mouse.pressed and mouse.button_index == MOUSE_BUTTON_LEFT
		pointer_position = mouse.position
	else:
		pointer_event = false

	if not pointer_event:
		super._input(event)
		return
	if not pressed:
		return

	# A real local move animation is still an unsafe input interval. Online room
	# application does not use that animation, so this protects the genuine case
	# without making presentation-only camera/light motion authoritative.
	if move_active:
		get_viewport().set_input_as_handled()
		return

	get_viewport().set_input_as_handled()
	var now: int = Time.get_ticks_msec()
	if now - last_pointer_msec < INPUT_DEBOUNCE_MS and pointer_position.distance_to(last_pointer_position) < 12.0:
		return
	last_pointer_msec = now
	last_pointer_position = pointer_position
	authoritative_input_dispatch_count += 1
	authoritative_input_last_dispatch_msec = now
	if camera_transition or turn_camera_active:
		authoritative_input_visual_motion_count += 1
	_handle_pointer(pointer_position)


func _authoritative_online_pointer_ready() -> bool:
	if not online_active or online_waiting or not match_initialized or round_complete or match_complete or online_cancelled:
		return false
	var snapshot: Dictionary = authoritative_turn_snapshot()
	if not bool(snapshot.get("valid", false)) or not bool(snapshot.get("online", false)) or not bool(snapshot.get("local_turn", false)):
		return false
	var authoritative_seat: String = str(snapshot.get("seat", ""))
	return not authoritative_seat.is_empty() and authoritative_seat == str(online_identity.get("seat", ""))


func _on_authoritative_test_target_requested(_arguments: Array) -> void:
	# Automation-only observability. Reuse the production mesh-triangle picker to
	# expose a point that a real touch actually resolves to the authoritative
	# player's large stone. A simple mesh projection can land in a ring hole or
	# behind another nested stone and is not evidence of interactive readiness.
	if not OS.has_feature("web") or camera == null or piece_records.is_empty():
		return
	var direction: String = _current_direction()
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var canvas_rect: Rect2 = _gameplay_canvas_css_rect()
	if viewport_size.x < 1.0 or viewport_size.y < 1.0 or canvas_rect.size.x < 1.0 or canvas_rect.size.y < 1.0:
		return
	var css_scale := Vector2(canvas_rect.size.x / viewport_size.x, canvas_rect.size.y / viewport_size.y)
	var candidates: Array[int] = _current_piece_candidates()
	var piece_internal: Vector2 = Vector2(-1.0, -1.0)
	for index: int in candidates:
		var record: Dictionary = piece_records[index] as Dictionary
		if str(record.get("type", "")) != "large":
			continue
		var candidate_point: Vector2 = _visible_piece_test_pointer(index, candidates)
		if candidate_point.x >= 0.0 and candidate_point.y >= 0.0:
			piece_internal = candidate_point
			break
	var piece_css: Vector2 = Vector2(-1.0, -1.0)
	if piece_internal.x >= 0.0 and piece_internal.y >= 0.0:
		piece_css = canvas_rect.position + piece_internal * css_scale
	var cell_world_point: Vector3 = Vector3(CELL_COORDS[4].x * U, 0.52, CELL_COORDS[4].z * U)
	var cell_internal: Vector2 = camera.unproject_position(cell_world_point)
	var cell_css: Vector2 = canvas_rect.position + cell_internal * css_scale
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakTestAuthorityPieceX='%s';" % str(piece_css.x) +
		"document.body.dataset.yakolakTestAuthorityPieceY='%s';" % str(piece_css.y) +
		"document.body.dataset.yakolakTestAuthorityCellX='%s';" % str(cell_css.x) +
		"document.body.dataset.yakolakTestAuthorityCellY='%s';" % str(cell_css.y) +
		"document.body.dataset.yakolakTestAuthorityTargetDirection='%s';" % _turn_js(direction),
		true
	)


func _start_online_host(configuration: Dictionary) -> void:
	authoritative_turn_transitioning = true
	authoritative_online_snapshot_hydrated = false
	_publish_authoritative_turn_state("online-hydrating")
	super._start_online_host(configuration)


func _start_online_join(configuration: Dictionary, code: String) -> void:
	authoritative_turn_transitioning = true
	authoritative_online_snapshot_hydrated = false
	_publish_authoritative_turn_state("online-hydrating")
	super._start_online_join(configuration, code)


func _on_online_room_changed(remote: Dictionary, identity: Dictionary) -> void:
	var was_hydrating: bool = _reconnect_hydration_blocked()
	if was_hydrating:
		# Remove pre-fresh local visual intent before the accepted authoritative
		# room is rendered. Network mutation reconciliation remains untouched.
		_clear_reconnect_visual_intent()
	var previous_player_index: int = current_player_index
	super._on_online_room_changed(remote, identity)
	if remote.is_empty():
		return
	# Accepted online authority owns readiness immediately. Recompute readiness
	# from the newly applied current player instead of waiting for the camera
	# tween to finish: the previous local owner becomes waiting on its client,
	# while the new local owner becomes ready in the same accepted room update.
	if str(remote.get("status", "")) == "playing" and current_player_index != previous_player_index:
		gameplay_ready = _current_mode() == "local"
		turn_deadline_msec = 0
		_update_hud()
		_publish_gameplay_state("ready" if gameplay_ready else "waiting")
	# OnlineSession emits only accepted room snapshots. Once that snapshot has
	# been applied by gameplay_session, turnIndex/current_player_index is the
	# authoritative owner presented here.
	authoritative_online_snapshot_hydrated = true
	authoritative_turn_transitioning = false
	_publish_authoritative_turn_state("online-room")


func _on_connection_state_changed(state: String, detail: String) -> void:
	super._on_connection_state_changed(state, detail)
	if not online_active and not restoring_online:
		return
	if state == "reconnecting":
		gameplay_ready = false
		_clear_reconnect_visual_intent()
		authoritative_online_snapshot_hydrated = false
		authoritative_turn_transitioning = true
		_publish_authoritative_turn_state("reconnecting")
	elif state == "connected" and not authoritative_online_snapshot_hydrated:
		# Transport connectivity is not turn authority. Keep the existing restore
		# surface and input lock until a complete room snapshot is accepted.
		gameplay_ready = false
		authoritative_turn_transitioning = true
		if _reconnect_hydration_blocked():
			_set_online_ui_state("restoring-room")
		_publish_authoritative_turn_state("connected-unhydrated")


func _on_online_error(code: String) -> void:
	super._on_online_error(code)
	authoritative_online_snapshot_hydrated = false
	authoritative_turn_transitioning = false
	_publish_authoritative_turn_state("online-error")


func _start_turn() -> void:
	authoritative_turn_transitioning = false
	super._start_turn()
	_publish_authoritative_turn_state("turn")


func _finish_round(winner: String, winning: Array[int]) -> void:
	super._finish_round(winner, winning)
	_publish_authoritative_turn_state("match-end" if match_complete else "round-end")


func _reset_board_for_round() -> void:
	# A new starter may already be assigned, but there is intentionally no valid
	# turn while pieces are returning home. Hide until _start_turn() fires.
	authoritative_turn_transitioning = true
	_publish_authoritative_turn_state("round-transition")
	super._reset_board_for_round()


func _return_to_setup() -> void:
	super._return_to_setup()
	authoritative_online_snapshot_hydrated = false
	authoritative_turn_transitioning = false
	_publish_authoritative_turn_state("setup")


func _reset_for_intro() -> void:
	super._reset_for_intro()
	authoritative_online_snapshot_hydrated = false
	authoritative_turn_transitioning = false
	_publish_authoritative_turn_state("intro")


func _publish_authoritative_turn_state(lifecycle: String) -> void:
	var snapshot: Dictionary = _build_authoritative_turn_snapshot(lifecycle)
	var key: String = _authoritative_turn_key(snapshot)
	if key == authoritative_turn_last_key:
		return
	authoritative_turn_last_key = key
	authoritative_turn_revision += 1
	snapshot["revision"] = authoritative_turn_revision
	authoritative_turn_cached_snapshot = snapshot.duplicate(true)
	authoritative_turn_changed.emit(authoritative_turn_cached_snapshot.duplicate(true))
	_publish_authoritative_turn_probe(snapshot)


func _build_authoritative_turn_snapshot(lifecycle: String) -> Dictionary:
	var index_valid: bool = current_player_index >= 0 and current_player_index < players.size()
	var valid: bool = (
		match_initialized
		and index_valid
		and not round_complete
		and not match_complete
		and not online_cancelled
		and not authoritative_turn_transitioning
	)
	if online_active:
		valid = valid and not online_waiting and authoritative_online_snapshot_hydrated

	var player: Dictionary = _current_player() if index_valid else {}
	var seat: String = str(player.get("seat", ""))
	var local_turn: bool = false
	if valid and online_active:
		local_turn = not seat.is_empty() and seat == str(online_identity.get("seat", ""))

	return {
		"valid": valid,
		"lifecycle": lifecycle,
		"round": round_number,
		"player_index": current_player_index if index_valid else -1,
		"player_number": current_player_index + 1 if index_valid else 0,
		"seat": seat,
		"direction": str(player.get("direction", "")),
		"mode": str(player.get("mode", "")),
		"color": str(player.get("color", "")),
		"color_name": str(player.get("color_name", "")),
		"online": online_active,
		"local_turn": local_turn,
	}


func _authoritative_turn_key(snapshot: Dictionary) -> String:
	return "%s|%s|%d|%d|%s|%s|%s|%s" % [
		"1" if bool(snapshot.get("valid", false)) else "0",
		str(snapshot.get("lifecycle", "")),
		int(snapshot.get("round", 0)),
		int(snapshot.get("player_index", -1)),
		str(snapshot.get("seat", "")),
		str(snapshot.get("direction", "")),
		"1" if bool(snapshot.get("online", false)) else "0",
		"1" if bool(snapshot.get("local_turn", false)) else "0",
	]


func _publish_authoritative_turn_probe(snapshot: Dictionary) -> void:
	if not OS.has_feature("web"):
		return
	var authoritative_source: String = "online-room" if bool(snapshot.get("online", false)) else "gameplay-state-event"
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakAuthoritativeTurnRevision='%d';" % authoritative_turn_revision +
		"document.body.dataset.yakolakAuthoritativeTurnValid='%s';" % ("true" if bool(snapshot.get("valid", false)) else "false") +
		"document.body.dataset.yakolakAuthoritativeTurnLifecycle='%s';" % _turn_js(str(snapshot.get("lifecycle", ""))) +
		"document.body.dataset.yakolakAuthoritativeTurnPlayer='%d';" % int(snapshot.get("player_number", 0)) +
		"document.body.dataset.yakolakAuthoritativeTurnDirection='%s';" % _turn_js(str(snapshot.get("direction", ""))) +
		"document.body.dataset.yakolakAuthoritativeTurnSource='%s';" % authoritative_source +
		"document.body.dataset.yakolakGameplayReady='%s';" % ("true" if gameplay_ready else "false"),
		true
	)


func _turn_js(value: String) -> String:
	return value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ").replace("\r", " ")