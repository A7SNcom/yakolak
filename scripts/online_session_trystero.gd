extends "res://scripts/online_session_reconnect_hydration.gd"

# Real WebRTC replaces HTTP. The existing hydration, immutable mutation IDs,
# turn ownership, room snapshots and local gameplay contracts stay intact.
const P2P_CHECK_MS: int = 100
const P2P_BOOTSTRAP_TIMEOUT_MS: int = 35000
var p2p_next_check: int = 0

func _process(_delta: float) -> void:
	if not OS.has_feature("web") or (not active and not busy and bootstrap_kind.is_empty()):
		return
	var now := Time.get_ticks_msec()
	if now < p2p_next_check:
		return
	p2p_next_check = now + P2P_CHECK_MS
	if busy:
		if _consume_bridge_event():
			if active and not reconnecting: next_poll_msec=now+P2P_CHECK_MS
			return
		if request_started_msec > 0 and now-request_started_msec > P2P_BOOTSTRAP_TIMEOUT_MS:
			var failed_kind := inflight_kind
			var failed_payload := inflight_payload.duplicate(true)
			_abort_active_request()
			_clear_inflight()
			_handle_request_failure(failed_kind,failed_payload,"online_timeout",0)
		return
	if not bootstrap_kind.is_empty() and not active:
		if now >= next_bootstrap_retry_msec: _request_post(bootstrap_kind,bootstrap_payload)
		return
	if active and not room.is_empty() and now >= next_poll_msec:
		_poll()

func host_match(configuration: Dictionary) -> void:
	if not OS.has_feature("web"):
		online_error.emit("online_unavailable")
		return
	_reset_transport_state(true)
	_start_bootstrap("create",{"players":configuration.get("players",[]),"targetRounds":int(configuration.get("rounds",3)),"clientToken":_new_secret(32),"requestId":_new_secret(24)})

func submit_move(cell: int,size_name: String) -> void:
	if not active or room.is_empty() or _reconnect_gameplay_input_blocked(): return
	var roster: Array = room.get("players",[])
	var turn: int = int(room.get("turnIndex",-1))
	if turn<0 or turn>=roster.size(): return
	_queue_or_send("move",{"action":"move","code":str(room.get("code","")),"version":int(room.get("version",0)),"seat":str(roster[turn].get("seat","")),"cell":cell,"size":size_name,"mutationId":_new_secret(24)})

func _request_post(kind: String,payload: Dictionary) -> void:
	if busy:
		_enqueue_action(kind,payload)
		return
	_begin_request(kind,payload)
	var script := "(()=>{const id="+str(active_request_id)+",kind="+JSON.stringify(kind)+";if(window.YakolakP2P){window.YakolakP2P.bridge(id,kind,"+JSON.stringify(payload)+","+JSON.stringify(identity)+");}else{(window.__yakolakOnlineQueue=window.__yakolakOnlineQueue||[]).push({id,kind,ok:false,status:503,data:{error:'online_unavailable'}});}})();"
	JavaScriptBridge.eval(script,true)

func _poll() -> void:
	if room.is_empty() or busy: return
	_request_post("poll",{"code":str(room.get("code","")),"since":-1 if reconnect_hydration_pending else int(room.get("version",-1))})
	# A local read of the already received WebRTC snapshot, not a server poll.
	next_poll_msec=Time.get_ticks_msec()+P2P_CHECK_MS

func _accept_room(next_room: Dictionary) -> void:
	super._accept_room(next_room)
	if bool(next_room.get("paused",false)):
		if not reconnecting: _mark_reconnecting("player_disconnected")
		_show_connection_status("انقطع اتصال أحد اللاعبين؛ ننتظر عودته")
	else:
		super._mark_connected()

func _mark_connected() -> void:
	if bool(room.get("paused",false)): return
	super._mark_connected()

func _handle_request_failure(kind: String,payload: Dictionary,error_code: String,status: int,data: Dictionary={}) -> void:
	if error_code in ["host_disconnected","player_disconnected"]:
		if kind in ["move","rematch"]: _remember_pending_mutation(kind,payload)
		_mark_reconnecting(error_code)
		_show_connection_status("انقطع اتصال منشئ الغرفة؛ ننتظر عودته" if error_code=="host_disconnected" else "انقطع اتصال أحد اللاعبين؛ ننتظر عودته")
		next_poll_msec=Time.get_ticks_msec()+500
		return
	if kind=="move" and error_code in ["invalid_move","turn_expired","not_your_turn","occupied_slot","no_piece_remaining"]:
		_clear_pending_mutation()
		if data.get("room",null) is Dictionary: _accept_room(data["room"])
		return
	super._handle_request_failure(kind,payload,error_code,status,data)

func _normalize_code(value: String) -> String:
	var ascii := Display.display_text(value.strip_edges())
	return ascii if _valid_room_code(ascii) else ""

func _valid_room_code(code: String) -> bool:
	if code.length()!=3: return false
	for index in range(3):
		var digit := code.substr(index,1)
		if digit<"0" or digit>"9": return false
	return true

func _send_leave_keepalive() -> void:
	if OS.has_feature("web"): JavaScriptBridge.eval("if(window.YakolakP2P)void window.YakolakP2P.leave();",true)

func deactivate(clear_saved: bool=false) -> void:
	var code := str(identity.get("code",room.get("code","")))
	super.deactivate(false)
	if OS.has_feature("web"):
		JavaScriptBridge.eval("if(window.YakolakP2P)void window.YakolakP2P."+("leave" if clear_saved else "close")+"();",true)
		if clear_saved:
			JavaScriptBridge.eval("try{const c="+JSON.stringify(code)+";sessionStorage.removeItem('yakolak-online:'+c);sessionStorage.removeItem('yakolak-p2p:'+c);const u=new URL(location.href);u.searchParams.delete('room');history.replaceState(null,'',u.pathname+(u.search?u.search:'')+u.hash);}catch{}",true)

func _fatal_error(code: String) -> void:
	deactivate(true)
	online_error.emit(code)
