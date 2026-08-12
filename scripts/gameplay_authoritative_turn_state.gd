extends "res://scripts/gameplay_explicit_handoff.gd"

# TURN-UI-08: one event-driven observer contract for turn presentation.
# This layer does not own or advance turns. It only snapshots the already-applied
# authoritative gameplay state and emits when that turn/lifecycle state changes.
signal authoritative_turn_changed(snapshot: Dictionary)

var authoritative_turn_revision: int = 0
var authoritative_turn_last_key: String = ""
var authoritative_turn_cached_snapshot: Dictionary = {}
var authoritative_turn_transitioning: bool = false
var authoritative_online_snapshot_hydrated: bool = false


func _ready() -> void:
	super._ready()
	call_deferred("_publish_authoritative_turn_state", "ready")


func authoritative_turn_snapshot() -> Dictionary:
	if authoritative_turn_cached_snapshot.is_empty():
		var snapshot: Dictionary = _build_authoritative_turn_snapshot("read")
		snapshot["revision"] = authoritative_turn_revision
		return snapshot
	return authoritative_turn_cached_snapshot.duplicate(true)


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
	super._on_online_room_changed(remote, identity)
	if remote.is_empty():
		return
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
		authoritative_online_snapshot_hydrated = false
		authoritative_turn_transitioning = true
		_publish_authoritative_turn_state("reconnecting")
	elif state == "connected" and not authoritative_online_snapshot_hydrated:
		# Transport connectivity is not turn authority. Stay hidden until the
		# post-reconnect accepted room snapshot arrives.
		authoritative_turn_transitioning = true
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
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakAuthoritativeTurnRevision='%d';" % authoritative_turn_revision +
		"document.body.dataset.yakolakAuthoritativeTurnValid='%s';" % ("true" if bool(snapshot.get("valid", false)) else "false") +
		"document.body.dataset.yakolakAuthoritativeTurnLifecycle='%s';" % _turn_js(str(snapshot.get("lifecycle", ""))) +
		"document.body.dataset.yakolakAuthoritativeTurnPlayer='%d';" % int(snapshot.get("player_number", 0)) +
		"document.body.dataset.yakolakAuthoritativeTurnDirection='%s';" % _turn_js(str(snapshot.get("direction", ""))) +
		"document.body.dataset.yakolakAuthoritativeTurnSource='gameplay-state-event';",
		true
	)


func _turn_js(value: String) -> String:
	return value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ").replace("\r", " ")