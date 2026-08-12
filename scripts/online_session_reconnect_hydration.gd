extends "res://scripts/online_session_hardened.gd"

# RESILIENCE-29: reconnect is a reconciliation barrier, not merely a network
# status. A returning client may not submit gameplay intent until one complete
# authoritative room snapshot has replaced its cached version/board/turn/seat.
# Any pending exactly-once mutation is reconciled before the barrier opens.
var reconnect_hydration_pending: bool = false
var reconnect_hydration_floor_version: int = -1


func submit_move(cell: int, size_name: String) -> void:
	if _reconnect_gameplay_input_blocked():
		return
	super.submit_move(cell, size_name)


func request_rematch() -> void:
	if _reconnect_gameplay_input_blocked():
		return
	super.request_rematch()


func deactivate(clear_saved: bool = false) -> void:
	reconnect_hydration_pending = false
	reconnect_hydration_floor_version = -1
	super.deactivate(clear_saved)


func _mark_reconnecting(detail: String) -> void:
	# Bootstrap retries have no prior gameplay state to reconcile. Restores and
	# active-session failures do, so only those establish the hydration barrier.
	if active and not room.is_empty():
		var current_version: int = int(room.get("version", -1))
		if reconnect_hydration_pending:
			reconnect_hydration_floor_version = maxi(reconnect_hydration_floor_version, current_version)
		else:
			reconnect_hydration_floor_version = current_version
		reconnect_hydration_pending = true
	super._mark_reconnecting(detail)


func _mark_connected() -> void:
	# A successful HTTP response is not enough to reopen gameplay. The room
	# snapshot and any pending move must first pass through _accept_room below.
	if reconnect_hydration_pending:
		return
	super._mark_connected()


func _poll() -> void:
	if not reconnect_hydration_pending:
		super._poll()
		return
	# Incremental polling can return 204 when the cached version equals the room
	# version even though the returning client still needs board/turn/seat state.
	# Ask for a full snapshot without permanently rewriting local state.
	var preserved_version: int = int(room.get("version", 0))
	room["version"] = -1
	super._poll()
	room["version"] = preserved_version


func _accept_room(next_room: Dictionary) -> void:
	if next_room.is_empty():
		return
	var current_version: int = int(room.get("version", -1))
	var next_version: int = int(next_room.get("version", -1))

	# Room versions are monotonic. A late/stale event may be ignored, but it may
	# never roll back a board or turn that this client has already accepted.
	if current_version >= 0 and (next_version < 0 or next_version < current_version):
		if reconnect_hydration_pending:
			next_poll_msec = 0
		return

	if reconnect_hydration_pending and not _reconnect_snapshot_is_complete(next_room):
		next_poll_msec = 0
		return

	# Parent hardening clears an older pending mutation before it emits the room.
	# If the pending intent is still valid, keep the barrier closed while the
	# exact original mutationId/version is reconciled by the existing owner.
	super._accept_room(next_room)
	_finish_reconnect_hydration_if_ready()


func _reconcile_pending_mutation() -> void:
	super._reconcile_pending_mutation()
	# The parent can discover an already-applied/invalid pending move without a
	# second room response. In that case this call is the final reconciliation.
	_finish_reconnect_hydration_if_ready()


func _reconnect_gameplay_input_blocked() -> bool:
	return reconnect_hydration_pending or reconnecting


func _reconnect_snapshot_is_complete(next_room: Dictionary) -> bool:
	var next_version: int = int(next_room.get("version", -1))
	if next_version < 0:
		return false
	if reconnect_hydration_floor_version >= 0 and next_version < reconnect_hydration_floor_version:
		return false

	var expected_code: String = _normalize_code(str(room.get("code", identity.get("code", ""))))
	var next_code: String = _normalize_code(str(next_room.get("code", "")))
	if not expected_code.is_empty() and next_code != expected_code:
		return false

	var players_value: Variant = next_room.get("players", null)
	if not players_value is Array:
		return false
	var players: Array = players_value as Array
	var local_seat: String = str(identity.get("seat", ""))
	if local_seat.is_empty():
		return false
	var owns_seat: bool = false
	for raw_player: Variant in players:
		if raw_player is Dictionary and str((raw_player as Dictionary).get("seat", "")) == local_seat:
			owns_seat = true
			break
	if not owns_seat:
		return false

	if not next_room.get("board", null) is Dictionary:
		return false
	if str(next_room.get("status", "")) == "playing":
		var turn_index: int = int(next_room.get("turnIndex", -1))
		if turn_index < 0 or turn_index >= players.size():
			return false
	return true


func _finish_reconnect_hydration_if_ready() -> void:
	if not reconnect_hydration_pending or busy:
		return
	if not pending_mutation_kind.is_empty():
		return
	if not _reconnect_snapshot_is_complete(room):
		return
	reconnect_hydration_pending = false
	reconnect_hydration_floor_version = -1
	super._mark_connected()
