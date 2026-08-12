extends "res://scripts/online_session.gd"

# Final online transport hardening. Keep identity per-tab, never silently
# overwrite a queued player action, preserve unrelated URL parameters, and
# treat every gameplay mutation as one immutable intent across retries.
const Display = preload("res://scripts/ui_design.gd")

const MAX_DURABLE_ACTIONS: int = 8
const BRIDGE_EVENT_CHECK_MS: int = 34
var durable_action_queue: Array[Dictionary] = []
var next_bridge_event_check_msec: int = 0


func _process(_delta: float) -> void:
	if not OS.has_feature("web"):
		return

	# Local/offline play should make the online transport essentially dormant.
	# Avoid a Godot <-> browser JavaScript bridge round-trip every rendered frame.
	if not active and not busy and bootstrap_kind.is_empty():
		return

	var now: int = Time.get_ticks_msec()
	if now >= next_wake_check_msec:
		next_wake_check_msec = now + WAKE_CHECK_MS
		_consume_browser_wake()

	if busy:
		# Browser fetch responses are asynchronous; checking their queue at ~30 Hz
		# cuts bridge churn while adding at most about one 30-fps frame of latency.
		if now >= next_bridge_event_check_msec:
			next_bridge_event_check_msec = now + BRIDGE_EVENT_CHECK_MS
			if _consume_bridge_event():
				return

		if request_started_msec > 0 and now - request_started_msec >= REQUEST_TIMEOUT_MS + 900:
			var timed_out_kind: String = inflight_kind
			var timed_out_payload: Dictionary = inflight_payload.duplicate(true)
			_abort_active_request()
			_clear_inflight()
			_handle_request_failure(timed_out_kind, timed_out_payload, "online_timeout", 0)
		return

	if not bootstrap_kind.is_empty() and not active:
		if now >= next_bootstrap_retry_msec:
			_request_post(bootstrap_kind, bootstrap_payload)
		return

	if not active or room.is_empty():
		return
	if now >= next_poll_msec:
		_poll()


func restore_from_location() -> bool:
	if not OS.has_feature("web") or active or busy:
		return false
	var raw_code: Variant = JavaScriptBridge.eval("String(new URL(location.href).searchParams.get('yakolakTestRoom')||new URL(location.href).searchParams.get('room')||'')", true)
	var code: String = _normalize_code(str(raw_code))
	if not _valid_room_code(code):
		return false
	var code_json: String = JSON.stringify(code)
	var raw_value: Variant = JavaScriptBridge.eval(
		"try{const k='yakolak-online:'+" + code_json + ";const v=sessionStorage.getItem(k)||'';localStorage.removeItem(k);v}catch(e){''}",
		true
	)
	var raw: String = str(raw_value)
	if raw.is_empty():
		return false
	var parsed: Variant = JSON.parse_string(raw)
	if not parsed is Dictionary:
		return false
	var saved: Dictionary = parsed as Dictionary
	if str(saved.get("token", "")).is_empty() or str(saved.get("seat", "")).is_empty():
		return false
	identity = saved.duplicate(true)
	identity["code"] = code
	room = {"code": code, "version": 0}
	active = true
	_mark_reconnecting("restoring")
	next_poll_msec = 0
	return true


func submit_move(cell: int, size_name: String) -> void:
	if not active or room.is_empty():
		return
	_queue_or_send("move", {
		"action": "move",
		"code": str(room.get("code", "")),
		"version": int(room.get("version", 0)),
		"cell": cell,
		"size": size_name,
		"mutationId": _new_secret(24),
	})


func request_rematch() -> void:
	if not active or room.is_empty():
		return
	_queue_or_send("rematch", {
		"action": "rematch",
		"code": str(room.get("code", "")),
		"version": int(room.get("version", 0)),
		"mutationId": _new_secret(24),
	})


func deactivate(clear_saved: bool = false) -> void:
	var code: String = str(identity.get("code", room.get("code", "")))
	if clear_saved and active and not room.is_empty():
		_send_leave_keepalive()
	_abort_active_request()
	active = false
	busy = false
	next_poll_msec = 0
	_clear_inflight()
	_clear_queued_action()
	_clear_pending_mutation()
	_clear_bootstrap()
	_hide_invite_button()
	_hide_connection_status()
	if clear_saved and OS.has_feature("web") and not code.is_empty():
		var code_json: String = JSON.stringify(code)
		JavaScriptBridge.eval(
			"try{const c=" + code_json + ",k='yakolak-online:'+c;sessionStorage.removeItem(k);localStorage.removeItem(k);const u=new URL(location.href);u.searchParams.delete('room');history.replaceState(null,'',u.pathname+(u.searchParams.toString()?'?'+u.searchParams.toString():'')+u.hash);}catch(e){}",
			true
		)
	room.clear()
	identity.clear()
	consecutive_failures = 0
	reconnecting = false


func _store_identity() -> void:
	if identity.is_empty():
		return
	var identity_json: String = JSON.stringify(identity)
	var code_json: String = JSON.stringify(str(identity.get("code", "")))
	JavaScriptBridge.eval(
		"try{const c=" + code_json + ",k='yakolak-online:'+c,v=" + identity_json + ";sessionStorage.setItem(k,JSON.stringify(v));localStorage.removeItem(k);const u=new URL(location.href);u.searchParams.set('room',c);history.replaceState(null,'',u.pathname+'?'+u.searchParams.toString()+u.hash);}catch(e){}",
		true
	)


func _invite_url(code: String) -> String:
	var value: Variant = JavaScriptBridge.eval(
		"(()=>{const u=new URL(location.origin+location.pathname);u.searchParams.set('room'," + JSON.stringify(_normalize_code(code)) + ");return u.toString();})()",
		true
	)
	return str(value)


func _queue_or_send(kind: String, payload: Dictionary) -> void:
	if busy and inflight_kind == "poll":
		_abort_active_request()
		_clear_inflight()
	elif busy:
		# A second tap while the same turn mutation is already in flight is not a
		# second game intent. Drop it locally; the server also deduplicates retries.
		if kind == "move" and inflight_kind == "move":
			return
		if kind == "rematch" and inflight_kind == "rematch":
			return
		_enqueue_action(kind, payload)
		return
	_request_post(kind, payload)


func _enqueue_action(kind: String, payload: Dictionary) -> void:
	if kind == "leave":
		durable_action_queue.clear()
		durable_action_queue.append({"kind": kind, "payload": payload.duplicate(true)})
		return
	for queued: Dictionary in durable_action_queue:
		var queued_kind: String = str(queued.get("kind", ""))
		var queued_payload: Dictionary = queued.get("payload", {}) as Dictionary
		if kind == "rematch" and queued_kind == "rematch":
			return
		if kind == "move" and queued_kind == "move":
			# A turn can contain only one move. Preserve the first intent instead of
			# replacing it with a later accidental tap while the request is busy.
			return
		if queued_kind == kind and queued_payload == payload:
			return
	while durable_action_queue.size() >= MAX_DURABLE_ACTIONS:
		durable_action_queue.pop_front()
	durable_action_queue.append({"kind": kind, "payload": payload.duplicate(true)})


func _flush_queued_action() -> bool:
	if busy:
		return false
	while not durable_action_queue.is_empty():
		var entry: Dictionary = durable_action_queue.pop_front() as Dictionary
		var kind: String = str(entry.get("kind", ""))
		var payload: Dictionary = (entry.get("payload", {}) as Dictionary).duplicate(true)
		if not active or room.is_empty():
			continue
		payload["code"] = str(room.get("code", payload.get("code", "")))
		# Never rebase the version of a queued intent. If the authoritative room
		# advanced, that old intent must conflict instead of becoming a new turn.
		if kind == "move" and not _can_apply_move_intent(payload):
			continue
		_request_post(kind, payload)
		return true
	return false


func _reconcile_pending_mutation() -> void:
	if pending_mutation_kind.is_empty() or room.is_empty() or busy:
		return
	if _mutation_already_applied(pending_mutation_kind, pending_mutation_payload):
		_clear_pending_mutation()
		return
	if pending_mutation_attempts >= MAX_MUTATION_RETRIES:
		_clear_pending_mutation()
		_accept_room(room)
		return
	if pending_mutation_kind == "move" and not _can_apply_move_intent(pending_mutation_payload):
		_clear_pending_mutation()
		_accept_room(room)
		return
	if pending_mutation_kind == "rematch" and str(room.get("status", "")) != "finished":
		_clear_pending_mutation()
		return
	var kind: String = pending_mutation_kind
	# Retry the exact original payload, including mutationId AND original version.
	# The server can acknowledge an already-applied mutation by mutationId; it
	# must never reinterpret an old action against a newer room version.
	var payload: Dictionary = pending_mutation_payload.duplicate(true)
	pending_mutation_attempts += 1
	_request_post(kind, payload)


func _clear_queued_action() -> void:
	durable_action_queue.clear()
	queued_action_kind = ""
	queued_action_payload.clear()


func _handle_request_failure(kind: String, payload: Dictionary, error_code: String, status: int, data: Dictionary = {}) -> void:
	# Room-edit failures belong to the base room-edit owner. In particular, a
	# stale editor must close, hydrate the canonical room, and surface the stale
	# notice instead of being swallowed by the generic mutation conflict path.
	if kind == "edit":
		super._handle_request_failure(kind, payload, error_code, status, data)
		return
	if error_code == "version_conflict" and data.get("room", null) is Dictionary:
		_mark_connected()
		# A conflict means this exact old intent was not accepted (an accepted
		# retry is returned as 200 by mutationId). Never rebase it onto a later turn.
		if kind == "move" or kind == "rematch":
			_clear_pending_mutation()
		_accept_room(data["room"] as Dictionary)
		if not busy:
			_flush_queued_action()
		return
	if kind == "leave" and _is_transient_failure(error_code, status) and active:
		_enqueue_action(kind, payload)
		_mark_reconnecting(error_code)
		next_poll_msec = Time.get_ticks_msec() + _retry_delay_ms()
		return
	super._handle_request_failure(kind, payload, error_code, status, data)


func _accept_room(next_room: Dictionary) -> void:
	# A newer authoritative version proves an older round-scoped mutation can no
	# longer be committed as that original intent. Drop it before emitting the
	# hydrated room so no stale move/rematch survives into the next round.
	if not pending_mutation_kind.is_empty():
		var pending_version: int = int(pending_mutation_payload.get("version", -1))
		var next_version: int = int(next_room.get("version", -1))
		if pending_version >= 0 and next_version > pending_version:
			_clear_pending_mutation()
	super._accept_room(next_room)
	if active and not busy and not durable_action_queue.is_empty():
		call_deferred("_flush_queued_action")


func _arabic_digits(value: String) -> String:
	# Base online code still calls this legacy hook when building the invite DOM.
	# The active transport resolves it through the single shared display boundary.
	return Display.display_text(value)
