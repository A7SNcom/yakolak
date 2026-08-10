extends "res://scripts/gameplay_touch_stack_policy.gd"

# UI-only online gameplay state layer. It does not change transport retries,
# requests, reconciliation, or rules; it only makes every wait/failure/restore
# state visible on the existing waiting card with one consistent vocabulary.
const OnlineStateCatalog = preload("res://scripts/online_state_catalog.gd")
const CONNECTED_CONFIRM_MS: int = 1200

var online_ui_state_id: String = ""
var online_ui_detail: String = ""
var online_ui_clear_due_msec: int = 0


func _ready() -> void:
	super._ready()
	_trace_online_ui("ready")
	call_deferred("_connect_online_state_signal")


func _connect_setup() -> void:
	super._connect_setup()
	_connect_online_state_signal()


func _connect_online_state_signal() -> void:
	if online == null:
		online = intro.get_node_or_null("OnlineSession")
	if online == null:
		return
	var callback := Callable(self, "_on_connection_state_changed")
	if not online.is_connected("connection_state_changed", callback):
		online.connect("connection_state_changed", callback)


func _transport_restore_pending() -> bool:
	# Read-only observation of OnlineSession. A restored identity begins with a
	# room shell at version 0 and remains authoritative even if the intro resets
	# gameplay presentation once during its final transition.
	if online == null or not bool(online.get("active")):
		return false
	var room_value: Variant = online.get("room")
	var identity_value: Variant = online.get("identity")
	if not (room_value is Dictionary) or not (identity_value is Dictionary):
		return false
	var transport_room: Dictionary = room_value as Dictionary
	var transport_identity: Dictionary = identity_value as Dictionary
	return not transport_identity.is_empty() and not transport_room.is_empty() and int(transport_room.get("version", -1)) == 0


func _show_restore_state_if_pending() -> bool:
	if not (restoring_online or _transport_restore_pending()):
		return false
	if setup != null and setup.has_method("hide_for_online_restore"):
		setup.call("hide_for_online_restore")
	_set_online_ui_state("restoring-room")
	return true


func _enable_gameplay() -> void:
	_trace_online_ui("enable:before")
	super._enable_gameplay()
	_trace_online_ui("enable:after:restore=" + str(restoring_online) + ":transport=" + str(_transport_restore_pending()))
	# restore_from_location() can emit reconnecting synchronously inside the
	# base enable call. The transport's version-0 room shell is the stable UI
	# signal that restoration is still pending across intro presentation resets.
	_show_restore_state_if_pending()


func _start_online_host(configuration: Dictionary) -> void:
	_set_online_ui_state("creating-room")
	super._start_online_host(configuration)


func _start_online_join(configuration: Dictionary, code: String) -> void:
	_set_online_ui_state("joining-room", "الغرفة " + _arabize_digits(code))
	super._start_online_join(configuration, code)


func _begin_move(cell: int) -> void:
	if online_active:
		_set_online_ui_state("submitting-move")
	super._begin_move(cell)


func _on_online_room_changed(remote: Dictionary, identity: Dictionary) -> void:
	super._on_online_room_changed(remote, identity)
	var status: String = str(remote.get("status", ""))
	if status == "waiting":
		var joined: int = (remote.get("players", []) as Array).size()
		var target: int = int(remote.get("targetPlayers", joined))
		_set_online_ui_state("waiting-players", _arabize_digits("انضم %d من %d" % [joined, maxi(target, joined)]))
	elif status == "cancelled":
		_set_online_ui_state("room-cancelled")
	elif status == "playing":
		if online_ui_state_id != "connected":
			_clear_online_ui_state("room:playing")
	elif status == "finished":
		_clear_online_ui_state("room:finished")


func _on_online_error(code: String) -> void:
	var was_restoring: bool = restoring_online or _transport_restore_pending()
	var was_joining: bool = not str(pending_online_configuration.get("online_join_code", "")).is_empty()
	# Gameplay owns the in-flight state only. Release it BEFORE the base handler
	# hands a join failure back to SessionSetup, otherwise this layer erases the
	# setup screen's precise room-full/not-found/etc. state immediately after it
	# is published.
	_clear_online_ui_state("online-error:" + code)
	super._on_online_error(code)
	# Join failures are already rendered by SessionSetup.show_online_error().
	# Host/bootstrap and restore failures previously collapsed into a generic line.
	if not was_joining and setup != null:
		setup.call("show_online_state_error", code, "restore" if was_restoring else "host")


func _on_connection_state_changed(state: String, detail: String) -> void:
	if state == "reconnecting":
		# While a saved room is being restored, transient retry details describe
		# transport mechanics, not a new user-visible situation. Keep the more
		# truthful restore state until the authoritative room arrives or fails.
		if restoring_online or _transport_restore_pending() or detail == "restoring":
			_set_online_ui_state("restoring-room")
		else:
			_set_online_ui_state("reconnecting")
		return
	if state == "connected":
		_set_online_ui_state("connected")
		online_ui_clear_due_msec = Time.get_ticks_msec() + CONNECTED_CONFIRM_MS


func _return_to_setup() -> void:
	_clear_online_ui_state("return-to-setup")
	super._return_to_setup()


func _reset_for_intro() -> void:
	var restore_still_pending: bool = restoring_online or _transport_restore_pending()
	_clear_online_ui_state("reset-for-intro")
	super._reset_for_intro()
	# Intro owns its visual reset, but it must not turn an already-running saved
	# room request into a silent screen. Re-assert only the presentation state;
	# OnlineSession itself is untouched and continues the same request.
	if restore_still_pending or _transport_restore_pending():
		_show_restore_state_if_pending()


func _sync_waiting_overlay() -> void:
	if online_ui_state_id == "connected" and online_ui_clear_due_msec > 0 and Time.get_ticks_msec() >= online_ui_clear_due_msec:
		_clear_online_ui_state("connected-timeout")

	super._sync_waiting_overlay()
	if waiting_root == null:
		return

	var state_id: String = online_ui_state_id
	var detail: String = online_ui_detail
	if online_cancelled:
		state_id = "room-cancelled"
	elif state_id.is_empty() and online_active and online_waiting:
		state_id = "waiting-players"
		var joined: int = players.size()
		var target: int = maxi(_waiting_target_count(), joined)
		if target > 0:
			detail = _arabize_digits("انضم %d من %d" % [joined, target])

	# Setup owns room-entry/invitation states. When gameplay has no online state,
	# it must stay silent instead of deleting the setup layer's browser contract.
	if state_id.is_empty():
		return

	var state: Dictionary = OnlineStateCatalog.get_state(state_id)
	waiting_root.visible = true
	var code: String = _waiting_room_code()
	if waiting_room_label != null:
		waiting_room_label.text = "الغرفة " + _arabize_waiting(code) if not code.is_empty() else "ياكلك أونلاين"
	if waiting_title_label != null:
		waiting_title_label.text = str(state.get("title", ""))
	if waiting_progress_label != null:
		waiting_progress_label.text = detail if not detail.is_empty() else str(state.get("message", ""))
	if waiting_exit_button != null:
		var action: String = str(state.get("action", "none"))
		waiting_exit_button.visible = action == "exit"
		waiting_exit_button.text = str(state.get("action_label", "خروج")) if action == "exit" else "خروج"
	_layout_waiting_overlay()

	# The old transport pill and the new state card must never compete visually.
	if OS.has_feature("web"):
		JavaScriptBridge.eval("var e=document.getElementById('yakolak-online-status');if(e){e.style.display='none';}", true)
	_publish_online_ui_state(state_id, detail)


func _set_online_ui_state(state_id: String, detail: String = "") -> void:
	online_ui_state_id = state_id
	online_ui_detail = detail
	online_ui_clear_due_msec = 0
	_trace_online_ui("set:" + state_id)
	_publish_online_ui_state(state_id, detail)
	if waiting_root != null:
		_sync_waiting_overlay()


func _clear_online_ui_state(reason: String = "unknown") -> void:
	var had_state: bool = not online_ui_state_id.is_empty() or not online_ui_detail.is_empty()
	if had_state:
		_trace_online_ui("clear:" + reason + ":from=" + online_ui_state_id)
	online_ui_state_id = ""
	online_ui_detail = ""
	online_ui_clear_due_msec = 0
	if had_state:
		_publish_online_ui_state("", "")


func _trace_online_ui(event: String) -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval(
		"(()=>{const e=" + JSON.stringify(event) + ";const d=document.body.dataset;d.yakolakOnlineUiTrace=(d.yakolakOnlineUiTrace?d.yakolakOnlineUiTrace+'|':'')+e;})();",
		true
	)


func _publish_online_ui_state(state_id: String, detail: String) -> void:
	if not OS.has_feature("web"):
		return
	if state_id.is_empty():
		JavaScriptBridge.eval(
			"delete document.body.dataset.yakolakOnlineUiState;" +
			"delete document.body.dataset.yakolakOnlineUiAction;" +
			"delete document.body.dataset.yakolakOnlineUiMessage;" +
			"document.body.dataset.yakolakOnlineUiSurface='gameplay';",
			true
		)
		return
	var state: Dictionary = OnlineStateCatalog.get_state(state_id)
	var message: String = detail if not detail.is_empty() else str(state.get("message", ""))
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakOnlineUiState=" + JSON.stringify(state_id) + ";" +
		"document.body.dataset.yakolakOnlineUiAction=" + JSON.stringify(str(state.get("action", "none"))) + ";" +
		"document.body.dataset.yakolakOnlineUiMessage=" + JSON.stringify(str(state.get("title", "")) + " — " + message) + ";" +
		"document.body.dataset.yakolakOnlineUiSurface='gameplay';",
		true
	)
