extends Node

# Server-authoritative online transport. Gameplay mutations always outrank
# background polling, bootstrap requests are idempotent/retried, and transient
# network failures never destroy an active match.

signal room_state_changed(room: Dictionary, identity: Dictionary)
signal online_error(code: String)
signal invite_ready(url: String)
signal room_previewed(room: Dictionary)
signal room_preview_failed(code: String)
signal connection_state_changed(state: String, detail: String)

const PROTOCOL: int = 5
const POLL_MS: int = 700
const REQUEST_TIMEOUT_MS: int = 6500
const RETRY_BASE_MS: int = 450
const RETRY_MAX_MS: int = 4000
const WAKE_CHECK_MS: int = 400
const MAX_MUTATION_RETRIES: int = 12
const MAX_BOOTSTRAP_RETRIES: int = 8

var room: Dictionary = {}
var identity: Dictionary = {}
var active: bool = false
var busy: bool = false
var next_poll_msec: int = 0

var request_sequence: int = 0
var active_request_id: int = 0
var request_started_msec: int = 0
var inflight_kind: String = ""
var inflight_payload: Dictionary = {}

var consecutive_failures: int = 0
var reconnecting: bool = false
var next_wake_check_msec: int = 0

var queued_action_kind: String = ""
var queued_action_payload: Dictionary = {}

var pending_mutation_kind: String = ""
var pending_mutation_payload: Dictionary = {}
var pending_mutation_attempts: int = 0

# create/join are safe to retry because the client supplies a stable token and
# request id. The server recognizes the same request and returns the same seat.
var bootstrap_kind: String = ""
var bootstrap_payload: Dictionary = {}
var bootstrap_attempts: int = 0
var next_bootstrap_retry_msec: int = 0


func _ready() -> void:
	process_priority = 55
	set_process(true)
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"(()=>{window.__yakolakOnlineQueue=window.__yakolakOnlineQueue||[];window.__yakolakOnlineControllers=window.__yakolakOnlineControllers||{};if(!window.__yakolakOnlineLifecycleBound){window.__yakolakOnlineLifecycleBound=true;const wake=()=>{window.__yakolakOnlineWake=true;};addEventListener('online',wake);addEventListener('pageshow',wake);document.addEventListener('visibilitychange',()=>{if(!document.hidden)wake();});}})();",
			true
		)


func _process(_delta: float) -> void:
	if not OS.has_feature("web"):
		return
	var now: int = Time.get_ticks_msec()
	if now >= next_wake_check_msec:
		next_wake_check_msec = now + WAKE_CHECK_MS
		_consume_browser_wake()

	if _consume_bridge_event():
		return

	if busy:
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


func host_match(configuration: Dictionary) -> void:
	if not OS.has_feature("web"):
		online_error.emit("online_unavailable")
		return
	var configured_players: Array = configuration.get("players", []) as Array
	if configured_players.size() < 2:
		online_error.emit("invalid_player_count")
		return
	_reset_transport_state(true)
	var host: Dictionary = configured_players[0] as Dictionary
	_start_bootstrap("create", {
		"action": "create",
		"color": str(host.get("color", "")),
		"targetPlayers": configured_players.size(),
		"targetRounds": int(configuration.get("rounds", 3)),
		"clientToken": _new_secret(32),
		"requestId": _new_secret(24),
	})


func restore_from_location() -> bool:
	if not OS.has_feature("web") or active or busy:
		return false
	var raw_code: Variant = JavaScriptBridge.eval("String(new URL(location.href).searchParams.get('room')||'')", true)
	var code: String = _normalize_code(str(raw_code))
	if not _valid_room_code(code):
		return false
	var code_json: String = JSON.stringify(code)
	var raw_value: Variant = JavaScriptBridge.eval("try{const k='yakolak-online:'+" + code_json + ";sessionStorage.getItem(k)||localStorage.getItem(k)||''}catch(e){''}", true)
	var parsed: Variant = JSON.parse_string(str(raw_value))
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


func join_match(code: String, color: String) -> void:
	if not OS.has_feature("web"):
		online_error.emit("online_unavailable")
		return
	var normalized: String = _normalize_code(code)
	if not _valid_room_code(normalized):
		online_error.emit("invalid_room_code")
		return
	_reset_transport_state(true)
	_start_bootstrap("join", {
		"action": "join",
		"code": normalized,
		"color": color,
		"clientToken": _new_secret(32),
		"requestId": _new_secret(24),
	})


func preview_room(code: String) -> void:
	if not OS.has_feature("web"):
		room_preview_failed.emit("online_unavailable")
		return
	var normalized: String = _normalize_code(code)
	if not _valid_room_code(normalized):
		room_preview_failed.emit("invalid_room_code")
		return
	if busy:
		room_preview_failed.emit("online_busy")
		return
	_request_post("preview", {"action": "preview", "code": normalized})


func submit_move(cell: int, size_name: String) -> void:
	if not active or room.is_empty():
		return
	_queue_or_send("move", {
		"action": "move",
		"code": str(room.get("code", "")),
		"version": int(room.get("version", 0)),
		"cell": cell,
		"size": size_name,
	})


func request_rematch() -> void:
	if not active or room.is_empty():
		return
	_queue_or_send("rematch", {
		"action": "rematch",
		"code": str(room.get("code", "")),
		"version": int(room.get("version", 0)),
	})


func refresh_now() -> void:
	if active:
		next_poll_msec = 0


func leave() -> void:
	if not active or room.is_empty():
		return
	_queue_or_send("leave", {
		"action": "leave",
		"code": str(room.get("code", "")),
		"version": int(room.get("version", 0)),
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
		JavaScriptBridge.eval("try{const k='yakolak-online:'+" + code_json + ";sessionStorage.removeItem(k);localStorage.removeItem(k);history.replaceState(null,'',location.pathname)}catch(e){}", true)
	room.clear()
	identity.clear()
	consecutive_failures = 0
	reconnecting = false


func _reset_transport_state(clear_saved: bool) -> void:
	if active or not room.is_empty() or not identity.is_empty():
		deactivate(clear_saved)
	else:
		_abort_active_request()
		_clear_inflight()
		_clear_queued_action()
		_clear_pending_mutation()
		_clear_bootstrap()
		consecutive_failures = 0
		reconnecting = false
		next_poll_msec = 0
		_hide_connection_status()
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.__yakolakOnlineQueue=[];", true)


func _start_bootstrap(kind: String, payload: Dictionary) -> void:
	bootstrap_kind = kind
	bootstrap_payload = payload.duplicate(true)
	bootstrap_attempts = 0
	next_bootstrap_retry_msec = 0
	_request_post(kind, bootstrap_payload)


func _clear_bootstrap() -> void:
	bootstrap_kind = ""
	bootstrap_payload.clear()
	bootstrap_attempts = 0
	next_bootstrap_retry_msec = 0


func _queue_or_send(kind: String, payload: Dictionary) -> void:
	if busy and inflight_kind == "poll":
		# A real player action must never wait behind a slow background poll.
		_abort_active_request()
		_clear_inflight()
	elif busy:
		queued_action_kind = kind
		queued_action_payload = payload.duplicate(true)
		return
	_request_post(kind, payload)


func _flush_queued_action() -> bool:
	if busy or queued_action_kind.is_empty():
		return false
	var kind: String = queued_action_kind
	var payload: Dictionary = queued_action_payload.duplicate(true)
	_clear_queued_action()
	if active and not room.is_empty():
		payload["code"] = str(room.get("code", payload.get("code", "")))
		payload["version"] = int(room.get("version", payload.get("version", 0)))
	if kind == "move" and not _can_apply_move_intent(payload):
		_accept_room(room)
		return false
	_request_post(kind, payload)
	return true


func _clear_queued_action() -> void:
	queued_action_kind = ""
	queued_action_payload.clear()


func _remember_pending_mutation(kind: String, payload: Dictionary) -> void:
	if kind != "move" and kind != "rematch":
		return
	if pending_mutation_kind != kind or pending_mutation_payload != payload:
		pending_mutation_attempts = 0
	pending_mutation_kind = kind
	pending_mutation_payload = payload.duplicate(true)


func _clear_pending_mutation() -> void:
	pending_mutation_kind = ""
	pending_mutation_payload.clear()
	pending_mutation_attempts = 0


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
	var payload: Dictionary = pending_mutation_payload.duplicate(true)
	payload["code"] = str(room.get("code", payload.get("code", "")))
	payload["version"] = int(room.get("version", payload.get("version", 0)))
	pending_mutation_payload = payload.duplicate(true)
	pending_mutation_attempts += 1
	_request_post(kind, payload)


func _mutation_already_applied(kind: String, payload: Dictionary) -> bool:
	var seat: String = str(identity.get("seat", ""))
	if seat.is_empty():
		return false
	if kind == "move":
		var last_move_value: Variant = room.get("lastMove", {})
		if not last_move_value is Dictionary:
			return false
		var last_move: Dictionary = last_move_value as Dictionary
		return str(last_move.get("seat", "")) == seat and int(last_move.get("cell", -1)) == int(payload.get("cell", -2)) and str(last_move.get("size", "")) == str(payload.get("size", "!"))
	if kind == "rematch":
		if str(room.get("status", "")) == "playing":
			return true
		var rematch_value: Variant = room.get("rematch", {})
		if rematch_value is Dictionary:
			return bool((rematch_value as Dictionary).get(seat, false))
	return false


func _can_apply_move_intent(payload: Dictionary) -> bool:
	if str(room.get("status", "")) != "playing":
		return false
	var players: Array = room.get("players", []) as Array
	var turn_index: int = int(room.get("turnIndex", -1))
	if turn_index < 0 or turn_index >= players.size():
		return false
	var current: Dictionary = players[turn_index] as Dictionary
	if str(current.get("seat", "")) != str(identity.get("seat", "")):
		return false
	var cell: int = int(payload.get("cell", -1))
	var size_name: String = str(payload.get("size", ""))
	if cell < 0 or cell > 8 or not ["small", "medium", "large"].has(size_name):
		return false
	var board: Dictionary = room.get("board", {}) as Dictionary
	var slots: Dictionary = board.get(str(cell), {}) as Dictionary
	if not str(slots.get(size_name, "")).is_empty():
		return false
	var color: String = str(current.get("color", ""))
	var used: int = 0
	for raw_slots: Variant in board.values():
		if raw_slots is Dictionary and str((raw_slots as Dictionary).get(size_name, "")) == color:
			used += 1
	return used < 3


func _poll() -> void:
	if room.is_empty() or busy:
		return
	var code: String = _normalize_code(str(room.get("code", "")))
	var token: String = str(identity.get("token", ""))
	if not _valid_room_code(code):
		_fatal_error("invalid_room_code")
		return
	if token.is_empty():
		_fatal_error("unauthorized")
		return
	_begin_request("poll", {})
	var code_json: String = JSON.stringify(code)
	var version: int = int(room.get("version", 0))
	var token_json: String = JSON.stringify(token)
	var script: String = "(async()=>{const id=" + str(active_request_id) + ",kind='poll',q=window.__yakolakOnlineQueue=window.__yakolakOnlineQueue||[],cs=window.__yakolakOnlineControllers=window.__yakolakOnlineControllers||{},c=new AbortController();cs[id]=c;const t=setTimeout(()=>c.abort()," + str(REQUEST_TIMEOUT_MS) + ");try{const r=await fetch('/api/rooms?code='+encodeURIComponent(" + code_json + ")+'&since=" + str(version) + "',{cache:'no-store',credentials:'same-origin',signal:c.signal,headers:{accept:'application/json',authorization:'Bearer '+" + token_json + "}});const d=r.status===204?{unchanged:true}:await r.json().catch(()=>({ok:false,error:'online_server_error'}));q.push({id,kind,ok:r.ok,status:r.status,data:d});}catch(e){q.push({id,kind,ok:false,status:0,data:{error:e&&e.name==='AbortError'?'online_timeout':'online_server_error'}});}finally{clearTimeout(t);delete cs[id];if(q.length>32)q.splice(0,q.length-32);}})();"
	JavaScriptBridge.eval(script, true)


func _request_post(kind: String, payload: Dictionary) -> void:
	if busy:
		if kind == "move" or kind == "rematch" or kind == "leave":
			queued_action_kind = kind
			queued_action_payload = payload.duplicate(true)
		return
	_begin_request(kind, payload)
	var payload_json: String = JSON.stringify(payload)
	var token_json: String = JSON.stringify(str(identity.get("token", "")))
	var kind_json: String = JSON.stringify(kind)
	var script: String = "(async()=>{const id=" + str(active_request_id) + ",kind=" + kind_json + ",q=window.__yakolakOnlineQueue=window.__yakolakOnlineQueue||[],cs=window.__yakolakOnlineControllers=window.__yakolakOnlineControllers||{},c=new AbortController();cs[id]=c;const t=setTimeout(()=>c.abort()," + str(REQUEST_TIMEOUT_MS) + ");try{const p=" + payload_json + ";const r=await fetch('/api/rooms',{method:'POST',cache:'no-store',credentials:'same-origin',signal:c.signal,headers:{accept:'application/json','content-type':'application/json',authorization:'Bearer '+" + token_json + "},body:JSON.stringify(p)});const d=await r.json().catch(()=>({ok:false,error:'online_server_error'}));q.push({id,kind,ok:r.ok,status:r.status,data:d});}catch(e){q.push({id,kind,ok:false,status:0,data:{error:e&&e.name==='AbortError'?'online_timeout':'online_server_error'}});}finally{clearTimeout(t);delete cs[id];if(q.length>32)q.splice(0,q.length-32);}})();"
	JavaScriptBridge.eval(script, true)


func _begin_request(kind: String, payload: Dictionary) -> void:
	busy = true
	request_sequence += 1
	active_request_id = request_sequence
	request_started_msec = Time.get_ticks_msec()
	inflight_kind = kind
	inflight_payload = payload.duplicate(true)


func _clear_inflight() -> void:
	busy = false
	active_request_id = 0
	request_started_msec = 0
	inflight_kind = ""
	inflight_payload.clear()


func _abort_active_request() -> void:
	if OS.has_feature("web") and active_request_id > 0:
		JavaScriptBridge.eval("try{const c=(window.__yakolakOnlineControllers||{})[" + str(active_request_id) + "];if(c)c.abort();}catch(e){}", true)


func _consume_bridge_event() -> bool:
	var raw_value: Variant = JavaScriptBridge.eval("JSON.stringify((window.__yakolakOnlineQueue&&window.__yakolakOnlineQueue.shift())||null)", true)
	var raw: String = str(raw_value)
	if raw.is_empty() or raw == "null":
		return false
	var parsed: Variant = JSON.parse_string(raw)
	if not parsed is Dictionary:
		return true
	var event: Dictionary = parsed as Dictionary
	var event_id: int = int(event.get("id", 0))
	if active_request_id <= 0 or event_id != active_request_id:
		return true
	var kind: String = inflight_kind
	var payload: Dictionary = inflight_payload.duplicate(true)
	_clear_inflight()
	var data: Dictionary = {}
	var data_value: Variant = event.get("data", {})
	if data_value is Dictionary:
		data = data_value as Dictionary
	var status: int = int(event.get("status", 0))
	if not bool(event.get("ok", false)):
		_handle_request_failure(kind, payload, str(data.get("error", "online_server_error")), status, data)
		return true

	_mark_connected()
	if bool(data.get("unchanged", false)):
		if not pending_mutation_kind.is_empty():
			_reconcile_pending_mutation()
		elif not _flush_queued_action():
			next_poll_msec = Time.get_ticks_msec() + POLL_MS
		return true

	if kind == "preview":
		var preview_value: Variant = data.get("room", {})
		if preview_value is Dictionary and not (preview_value as Dictionary).is_empty():
			room_previewed.emit((preview_value as Dictionary).duplicate(true))
		else:
			room_preview_failed.emit("online_server_error")
		return true

	if kind == "create" or kind == "join":
		var received_value: Variant = data.get("room", {})
		var received_room: Dictionary = received_value as Dictionary if received_value is Dictionary else {}
		var received_token: String = str(data.get("token", payload.get("clientToken", "")))
		var received_seat: String = str(data.get("seat", ""))
		if received_room.is_empty() or received_token.is_empty() or received_seat.is_empty() or not _valid_room_code(str(received_room.get("code", ""))):
			_fatal_error("online_server_error")
			return true
		identity = {"token": received_token, "seat": received_seat, "code": _normalize_code(str(received_room.get("code", "")))}
		active = true
		_clear_bootstrap()
		_store_identity()
		_accept_room(received_room)
		if kind == "create":
			var url: String = _invite_url(str(received_room.get("code", "")))
			_show_invite_button(url, str(received_room.get("code", "")))
			invite_ready.emit(url)
		return true

	if kind == pending_mutation_kind:
		_clear_pending_mutation()
	var room_value: Variant = data.get("room", null)
	if room_value is Dictionary:
		_accept_room(room_value as Dictionary)
	if kind == "leave":
		deactivate(true)
		return true
	if not _flush_queued_action():
		next_poll_msec = Time.get_ticks_msec() + POLL_MS
	return true


func _handle_request_failure(kind: String, payload: Dictionary, error_code: String, status: int, data: Dictionary = {}) -> void:
	if kind == "preview":
		room_preview_failed.emit(error_code)
		return

	if error_code == "version_conflict" and data.get("room", null) is Dictionary:
		_mark_connected()
		if kind == "move" or kind == "rematch":
			_remember_pending_mutation(kind, payload)
		_accept_room(data["room"] as Dictionary)
		if not busy and not pending_mutation_kind.is_empty():
			_reconcile_pending_mutation()
		elif not busy:
			_flush_queued_action()
		return

	if kind == "move" or kind == "rematch":
		if ["not_your_turn", "occupied_slot", "no_piece_remaining", "room_not_playing", "round_not_finished"].has(error_code):
			_mark_connected()
			next_poll_msec = 0
			_accept_room(room)
			return

	if _is_transient_failure(error_code, status):
		if active and ["poll", "move", "rematch", "leave"].has(kind):
			if kind == "move" or kind == "rematch":
				_remember_pending_mutation(kind, payload)
			elif kind == "leave":
				queued_action_kind = "leave"
				queued_action_payload = payload.duplicate(true)
			_mark_reconnecting(error_code)
			next_poll_msec = Time.get_ticks_msec() + _retry_delay_ms()
			return
		if (kind == "create" or kind == "join") and kind == bootstrap_kind:
			bootstrap_attempts += 1
			if bootstrap_attempts < MAX_BOOTSTRAP_RETRIES:
				_mark_reconnecting(error_code)
				next_bootstrap_retry_msec = Time.get_ticks_msec() + _retry_delay_ms()
				return
			_clear_bootstrap()
			online_error.emit(error_code)
			return

	_fatal_error(error_code)


func _is_transient_failure(error_code: String, status: int) -> bool:
	return status == 0 or status == 408 or status == 425 or status == 429 or status >= 500 or ["online_server_error", "online_timeout", "online_unavailable"].has(error_code)


func _retry_delay_ms() -> int:
	var power: int = mini(maxi(consecutive_failures - 1, 0), 4)
	var delay: int = mini(RETRY_BASE_MS * (1 << power), RETRY_MAX_MS)
	return delay + randi_range(0, 180)


func _mark_reconnecting(detail: String) -> void:
	consecutive_failures += 1
	reconnecting = true
	connection_state_changed.emit("reconnecting", detail)
	_show_connection_status("إعادة الاتصال…")


func _mark_connected() -> void:
	var was_reconnecting: bool = reconnecting
	consecutive_failures = 0
	reconnecting = false
	if was_reconnecting:
		connection_state_changed.emit("connected", "")
	_hide_connection_status()


func _fatal_error(code: String) -> void:
	var clear_saved: bool = ["unauthorized", "room_not_found", "invalid_room_code", "online_protocol_mismatch"].has(code)
	deactivate(clear_saved)
	online_error.emit(code)


func _accept_room(next_room: Dictionary) -> void:
	if next_room.is_empty():
		return
	var code: String = _normalize_code(str(next_room.get("code", "")))
	if not _valid_room_code(code):
		_fatal_error("invalid_room_code")
		return
	room = next_room.duplicate(true)
	room["code"] = code
	if int(room.get("protocol", PROTOCOL)) != PROTOCOL:
		_fatal_error("online_protocol_mismatch")
		return
	if str(room.get("status", "")) == "playing":
		_hide_invite_button()
	room_state_changed.emit(room.duplicate(true), identity.duplicate(true))
	if not pending_mutation_kind.is_empty() and not busy:
		call_deferred("_reconcile_pending_mutation")
	elif not queued_action_kind.is_empty() and not busy:
		call_deferred("_flush_queued_action")


func _store_identity() -> void:
	if identity.is_empty():
		return
	var identity_json: String = JSON.stringify(identity)
	var code_json: String = JSON.stringify(str(identity.get("code", "")))
	JavaScriptBridge.eval("try{const c=" + code_json + ",k='yakolak-online:'+c,v=" + identity_json + ";sessionStorage.setItem(k,JSON.stringify(v));localStorage.setItem(k,JSON.stringify(v));history.replaceState(null,'',location.pathname+'?room='+encodeURIComponent(c));}catch(e){}", true)


func _consume_browser_wake() -> void:
	var wake_value: Variant = JavaScriptBridge.eval("Boolean(window.__yakolakOnlineWake&&(window.__yakolakOnlineWake=false,true))", true)
	if not bool(wake_value):
		return
	if active:
		next_poll_msec = 0
	elif not bootstrap_kind.is_empty():
		next_bootstrap_retry_msec = 0


func _normalize_code(value: String) -> String:
	var result: String = ""
	for index: int in range(value.length()):
		var character: String = value.substr(index, 1)
		var digit: String = character
		match character:
			"٠", "۰": digit = "0"
			"١", "۱": digit = "1"
			"٢", "۲": digit = "2"
			"٣", "۳": digit = "3"
			"٤", "۴": digit = "4"
			"٥", "۵": digit = "5"
			"٦", "۶": digit = "6"
			"٧", "۷": digit = "7"
			"٨", "۸": digit = "8"
			"٩", "۹": digit = "9"
		if digit >= "0" and digit <= "9":
			result += digit
		if result.length() >= 2:
			break
	return result


func _valid_room_code(code: String) -> bool:
	if code.length() != 2:
		return false
	for index: int in range(2):
		var character: String = code.substr(index, 1)
		if character < "0" or character > "9":
			return false
	return true


func _arabic_digits(value: String) -> String:
	var result: String = value
	var western: Array[String] = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]
	var arabic: Array[String] = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"]
	for index: int in range(10):
		result = result.replace(western[index], arabic[index])
	return result


func _new_secret(bytes: int) -> String:
	if not OS.has_feature("web"):
		return ""
	var script: String = "(()=>{const a=new Uint8Array(" + str(bytes) + ");crypto.getRandomValues(a);return Array.from(a,b=>b.toString(16).padStart(2,'0')).join('');})()"
	return str(JavaScriptBridge.eval(script, true))


func _invite_url(code: String) -> String:
	var value: Variant = JavaScriptBridge.eval("String(location.origin+location.pathname+'?room='+" + JSON.stringify(code) + ")", true)
	return str(value)


func _show_invite_button(url: String, code: String) -> void:
	var url_json: String = JSON.stringify(url)
	var code_json: String = JSON.stringify(_arabic_digits(code))
	var script: String = "(function(){let b=document.getElementById('yakolak-invite-copy');if(!b){b=document.createElement('button');b.id='yakolak-invite-copy';b.type='button';b.style.cssText='position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:2147483000;border:1px solid #ffffff55;border-radius:14px;padding:12px 16px;background:#151719f2;color:#fff;font:700 16px system-ui;direction:rtl;touch-action:manipulation';document.body.appendChild(b);}const u=" + url_json + ",c=" + code_json + ";b.textContent='الغرفة '+c+' · نسخ الدعوة';b.onclick=async()=>{try{await navigator.clipboard.writeText(u);b.textContent='تم نسخ الدعوة';setTimeout(()=>b.textContent='الغرفة '+c+' · نسخ الدعوة',1300);}catch(e){prompt('انسخ رابط الدعوة',u);}};b.style.display='block';})();"
	JavaScriptBridge.eval(script, true)


func _hide_invite_button() -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("var b=document.getElementById('yakolak-invite-copy');if(b){b.remove();}", true)


func _send_leave_keepalive() -> void:
	if not OS.has_feature("web"):
		return
	var code: String = _normalize_code(str(room.get("code", "")))
	var token: String = str(identity.get("token", ""))
	if not _valid_room_code(code) or token.is_empty():
		return
	var payload: Dictionary = {"action": "leave", "code": code, "version": int(room.get("version", 0))}
	var script: String = "(()=>{try{fetch('/api/rooms',{method:'POST',keepalive:true,cache:'no-store',credentials:'same-origin',headers:{'content-type':'application/json',authorization:'Bearer '+" + JSON.stringify(token) + "},body:JSON.stringify(" + JSON.stringify(payload) + ")}).catch(()=>{});}catch(e){}})();"
	JavaScriptBridge.eval(script, true)


func _show_connection_status(text: String) -> void:
	if not OS.has_feature("web"):
		return
	var text_json: String = JSON.stringify(text)
	JavaScriptBridge.eval("(()=>{let e=document.getElementById('yakolak-online-status');if(!e){e=document.createElement('div');e.id='yakolak-online-status';e.style.cssText='position:fixed;left:50%;top:max(12px,env(safe-area-inset-top));transform:translateX(-50%);z-index:2147483001;padding:7px 12px;border-radius:999px;background:#151719e8;color:#fff;font:600 13px system-ui;direction:rtl;pointer-events:none;box-shadow:0 4px 18px #0006';document.body.appendChild(e);}e.textContent=" + text_json + ";e.style.display='block';})();", true)


func _hide_connection_status() -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("var e=document.getElementById('yakolak-online-status');if(e){e.style.display='none';}", true)
