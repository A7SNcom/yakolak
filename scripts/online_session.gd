extends Node

# Thin web transport around the server-authoritative /api/rooms endpoint.  The
# game controller remains the renderer; this node never decides a legal move.

signal room_state_changed(room: Dictionary, identity: Dictionary)
signal online_error(code: String)
signal invite_ready(url: String)

const POLL_MS: int = 900

var room: Dictionary = {}
var identity: Dictionary = {}
var active: bool = false
var busy: bool = false
var next_poll_msec: int = 0


func _ready() -> void:
	process_priority = 55
	set_process(true)


func _process(_delta: float) -> void:
	if not OS.has_feature("web"):
		return
	if busy:
		_consume_bridge_event()
		return
	if not active or room.is_empty():
		return
	if Time.get_ticks_msec() >= next_poll_msec:
		_poll()


func host_match(configuration: Dictionary) -> void:
	if not OS.has_feature("web"):
		online_error.emit("online_unavailable")
		return
	var configured_players: Array = configuration.get("players", []) as Array
	if configured_players.size() < 2:
		online_error.emit("invalid_player_count")
		return
	var host: Dictionary = configured_players[0] as Dictionary
	room.clear()
	identity.clear()
	active = false
	_request_post("create", {
		"action": "create",
		"color": str(host.get("color", "")),
		"targetPlayers": configured_players.size(),
		"targetRounds": int(configuration.get("rounds", 3)),
	})


func restore_from_location() -> bool:
	if not OS.has_feature("web") or active or busy:
		return false
	var code_value: Variant = JavaScriptBridge.eval("String(new URL(location.href).searchParams.get('room')||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6)", true)
	var code: String = str(code_value)
	if code.length() != 6:
		return false
	var raw_value: Variant = JavaScriptBridge.eval("try{sessionStorage.getItem('yakolak-online:'+" + JSON.stringify(code) + ")||''}catch(e){''}", true)
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
	_poll()
	return true


func join_match(code: String, color: String) -> void:
	if not OS.has_feature("web"):
		online_error.emit("online_unavailable")
		return
	room.clear()
	identity.clear()
	active = false
	_request_post("join", {"action": "join", "code": code, "color": color})


func submit_move(cell: int, size_name: String) -> void:
	if not active or room.is_empty() or busy:
		return
	_request_post("move", {
		"action": "move",
		"code": str(room.get("code", "")),
		"version": int(room.get("version", 0)),
		"cell": cell,
		"size": size_name,
	})


func request_rematch() -> void:
	if not active or room.is_empty() or busy:
		return
	_request_post("rematch", {
		"action": "rematch",
		"code": str(room.get("code", "")),
		"version": int(room.get("version", 0)),
	})


func refresh_now() -> void:
	if active and not busy:
		next_poll_msec = 0


func leave() -> void:
	if not active or room.is_empty() or busy:
		return
	_request_post("leave", {
		"action": "leave",
		"code": str(room.get("code", "")),
		"version": int(room.get("version", 0)),
	})


func deactivate(clear_saved: bool = false) -> void:
	var code: String = str(identity.get("code", room.get("code", "")))
	active = false
	busy = false
	next_poll_msec = 0
	_hide_invite_button()
	if clear_saved and OS.has_feature("web"):
		var code_json: String = JSON.stringify(code)
		JavaScriptBridge.eval("try{sessionStorage.removeItem('yakolak-online:'+" + code_json + ");history.replaceState(null,'',location.pathname)}catch(e){}", true)
	room.clear()
	identity.clear()


func _poll() -> void:
	if room.is_empty():
		return
	busy = true
	var code_json: String = JSON.stringify(str(room.get("code", "")))
	var version: int = int(room.get("version", 0))
	var token_json: String = JSON.stringify(str(identity.get("token", "")))
	var script: String = "(async()=>{try{const r=await fetch('/api/rooms?code='+encodeURIComponent(" + code_json + ")+ '&since=" + str(version) + "',{cache:'no-store',headers:{authorization:'Bearer '+" + token_json + "}});const d=r.status===204?{unchanged:true}:await r.json().catch(()=>({ok:false,error:'online_server_error'}));document.body.dataset.yakolakOnlineBridge=JSON.stringify({kind:'poll',ok:r.ok,data:d});}catch(e){document.body.dataset.yakolakOnlineBridge=JSON.stringify({kind:'poll',ok:false,data:{error:'online_server_error'}});}})();"
	JavaScriptBridge.eval(script, true)


func _request_post(kind: String, payload: Dictionary) -> void:
	if busy:
		return
	busy = true
	var payload_json: String = JSON.stringify(payload)
	var token_json: String = JSON.stringify(str(identity.get("token", "")))
	var kind_json: String = JSON.stringify(kind)
	var script: String = "(async()=>{try{const p=" + payload_json + ";const r=await fetch('/api/rooms',{method:'POST',cache:'no-store',headers:{'content-type':'application/json',authorization:'Bearer '+" + token_json + "},body:JSON.stringify(p)});const d=await r.json().catch(()=>({ok:false,error:'online_server_error'}));document.body.dataset.yakolakOnlineBridge=JSON.stringify({kind:" + kind_json + ",ok:r.ok,data:d});}catch(e){document.body.dataset.yakolakOnlineBridge=JSON.stringify({kind:" + kind_json + ",ok:false,data:{error:'online_server_error'}});}})();"
	JavaScriptBridge.eval(script, true)


func _consume_bridge_event() -> void:
	var raw_value: Variant = JavaScriptBridge.eval("String(document.body.dataset.yakolakOnlineBridge||'')", true)
	var raw: String = str(raw_value)
	if raw.is_empty():
		return
	JavaScriptBridge.eval("delete document.body.dataset.yakolakOnlineBridge;", true)
	busy = false
	next_poll_msec = Time.get_ticks_msec() + POLL_MS
	var parsed: Variant = JSON.parse_string(raw)
	if not parsed is Dictionary:
		online_error.emit("online_server_error")
		return
	var event: Dictionary = parsed as Dictionary
	var data: Dictionary = event.get("data", {}) as Dictionary
	if not bool(event.get("ok", false)):
		var error_code: String = str(data.get("error", "online_server_error"))
		if error_code == "version_conflict" and data.get("room", null) is Dictionary:
			_accept_room(data["room"] as Dictionary)
		else:
			online_error.emit(error_code)
		return
	if bool(data.get("unchanged", false)):
		return
	var kind: String = str(event.get("kind", ""))
	if kind == "create" or kind == "join":
		var received_room: Dictionary = data.get("room", {}) as Dictionary
		if received_room.is_empty():
			online_error.emit("online_server_error")
			return
		identity = {
			"token": str(data.get("token", "")),
			"seat": str(data.get("seat", "")),
			"code": str(received_room.get("code", "")),
		}
		active = true
		_store_identity()
		_accept_room(received_room)
		if kind == "create":
			var url: String = _invite_url(str(received_room.get("code", "")))
			_show_invite_button(url, str(received_room.get("code", "")))
			invite_ready.emit(url)
		return
	if data.get("room", null) is Dictionary:
		_accept_room(data["room"] as Dictionary)


func _accept_room(next_room: Dictionary) -> void:
	room = next_room.duplicate(true)
	if str(room.get("status", "")) == "playing":
		_hide_invite_button()
	room_state_changed.emit(room.duplicate(true), identity.duplicate(true))


func _store_identity() -> void:
	if identity.is_empty():
		return
	var value_json: String = JSON.stringify(identity)
	var code_json: String = JSON.stringify(str(identity.get("code", "")))
	JavaScriptBridge.eval("try{const c=" + code_json + ";sessionStorage.setItem('yakolak-online:'+c,JSON.stringify(" + value_json + "));history.replaceState(null,'',location.pathname+'?room='+encodeURIComponent(c));}catch(e){}", true)


func _invite_url(code: String) -> String:
	var value: Variant = JavaScriptBridge.eval("String(location.origin+location.pathname+'?room='+" + JSON.stringify(code) + ")", true)
	return str(value)


func _show_invite_button(url: String, code: String) -> void:
	var url_json: String = JSON.stringify(url)
	var code_json: String = JSON.stringify(code)
	var script: String = "(function(){let b=document.getElementById('yakolak-invite-copy');if(!b){b=document.createElement('button');b.id='yakolak-invite-copy';b.type='button';b.style.cssText='position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:2147483000;border:1px solid #ffffff55;border-radius:14px;padding:12px 16px;background:#151719f2;color:#fff;font:700 16px system-ui;direction:rtl;touch-action:manipulation';document.body.appendChild(b);}const u=" + url_json + ";b.textContent='دعوة: '+" + code_json + "+' · نسخ الرابط';b.onclick=async()=>{try{await navigator.clipboard.writeText(u);b.textContent='تم نسخ الرابط';setTimeout(()=>b.textContent='دعوة: '+" + code_json + "+' · نسخ الرابط',1300);}catch(e){prompt('انسخ الرابط',u);}};b.style.display='block';})();"
	JavaScriptBridge.eval(script, true)


func _hide_invite_button() -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("var b=document.getElementById('yakolak-invite-copy');if(b){b.remove();}", true)
