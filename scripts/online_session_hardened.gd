extends "res://scripts/online_session.gd"

# Final online transport hardening. Keep identity per-tab, never silently
# overwrite a queued player action, and preserve unrelated URL parameters.

const MAX_DURABLE_ACTIONS: int = 8
var durable_action_queue: Array[Dictionary] = []


func restore_from_location() -> bool:
	if not OS.has_feature("web") or active or busy:
		return false
	var raw_code: Variant = JavaScriptBridge.eval("String(new URL(location.href).searchParams.get('room')||'')", true)
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
		payload["version"] = int(room.get("version", payload.get("version", 0)))
		if kind == "move" and not _can_apply_move_intent(payload):
			continue
		_request_post(kind, payload)
		return true
	return false


func _clear_queued_action() -> void:
	durable_action_queue.clear()
	queued_action_kind = ""
	queued_action_payload.clear()


func _handle_request_failure(kind: String, payload: Dictionary, error_code: String, status: int, data: Dictionary = {}) -> void:
	if kind == "leave" and _is_transient_failure(error_code, status) and active:
		_enqueue_action(kind, payload)
		_mark_reconnecting(error_code)
		next_poll_msec = Time.get_ticks_msec() + _retry_delay_ms()
		return
	super._handle_request_failure(kind, payload, error_code, status, data)


func _accept_room(next_room: Dictionary) -> void:
	super._accept_room(next_room)
	if active and not busy and not durable_action_queue.is_empty():
		call_deferred("_flush_queued_action")
