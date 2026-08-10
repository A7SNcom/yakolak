extends "res://scripts/session_setup_interaction_feedback.gd"

# UI-only room state layer. Network behavior remains owned by OnlineSession;
# this layer only translates reachable room outcomes into a consistent message
# and an explicit next action instead of silent/ambiguous setup screens.
const OnlineStateCatalog = preload("res://scripts/online_state_catalog.gd")

var online_ui_state_id: String = ""
var online_ui_error_code: String = ""
var online_state_return_screen: String = "room_entry"


func _ready() -> void:
	super._ready()
	_publish_online_ui_state()


func _rebuild_active_screen() -> void:
	if showing and active_screen == "online_state":
		layout_refresh_pending = false
		_show_online_state_screen()
		return
	super._rebuild_active_screen()


func _dialog_cancel() -> void:
	if showing and active_screen == "online_state":
		_return_from_online_state()
		return
	super._dialog_cancel()


func _show_room_entry() -> void:
	_clear_online_ui_state()
	super._show_room_entry()


func _show_join_room() -> void:
	_clear_online_ui_state()
	super._show_join_room()


func _request_room_preview(code: String) -> void:
	_set_online_ui_state("room-checking")
	super._request_room_preview(code)
	if online == null:
		_set_online_ui_state("request-failed", "online_unavailable")


func _on_room_previewed(preview: Dictionary) -> void:
	if str(preview.get("code", "")) != room_preview_code:
		return

	var preserve_color_taken: bool = online_ui_state_id == "color-taken" and active_screen == "setup"
	join_available_colors.clear()
	var available_values: Array = preview.get("availableColors", []) as Array
	for value: Variant in available_values:
		join_available_colors.append(str(value))

	var status: String = str(preview.get("status", "waiting"))
	room_preview_ready = status == "waiting" and not join_available_colors.is_empty()
	if status == "waiting" and join_available_colors.is_empty():
		_set_online_ui_state("room-full")
	elif status == "playing":
		_set_online_ui_state("room-started")
	elif status == "finished":
		_set_online_ui_state("room-finished")
	elif status == "cancelled":
		_set_online_ui_state("room-cancelled")
	elif room_preview_ready:
		if preserve_color_taken:
			_set_online_ui_state("color-taken", "color_taken")
		else:
			_set_online_ui_state("room-ready")
		if active_screen == "setup" and not join_available_colors.has(str(seats[0]["color"])):
			var first: Dictionary = seats[0]
			first["color"] = join_available_colors[0]
			seats[0] = first
	else:
		_set_online_ui_state("request-failed")

	if preserve_color_taken:
		online_error_text = "اللون محجوز، اختر لونًا آخر."
	else:
		online_error_text = ""
	if active_screen == "setup":
		_show_setup()
	else:
		_show_invitation(joining_room_code)


func _on_room_preview_failed(code: String) -> void:
	room_preview_ready = false
	join_available_colors.clear()
	online_error_text = ""
	_set_online_ui_state(OnlineStateCatalog.preview_error_state(code), code)
	if active_screen == "setup":
		_show_setup()
	else:
		_show_invitation(joining_room_code)


func _show_invitation(code: String) -> void:
	active_screen = "invitation"
	if online_ui_state_id.is_empty():
		_set_online_ui_state("room-checking")
	_clear_body()
	var content := _content_box()
	body.add_child(content)
	content.add_child(_label("الانضمام لغرفة", 25, HORIZONTAL_ALIGNMENT_CENTER))
	content.add_child(_label("الغرفة " + code, 17, HORIZONTAL_ALIGNMENT_CENTER, Color("#cbd7d9")))
	content.add_child(_online_state_notice(online_ui_state_id))

	var state: Dictionary = OnlineStateCatalog.get_state(online_ui_state_id)
	var action: String = str(state.get("action", "none"))
	var action_label: String = str(state.get("action_label", ""))
	var actions := _choice_row()
	if action == "join" and room_preview_ready:
		var join := _button(action_label, Color("#10201f"), Color("#f2f0e9"))
		join.pressed.connect(_open_join_setup.bind(code))
		actions.add_child(join)
	elif action == "retry":
		var retry := _button(action_label, Color("#10201f"), Color("#f2f0e9"))
		retry.pressed.connect(_retry_room_preview.bind(code))
		actions.add_child(retry)
	elif action == "back" or action == "exit":
		var back := _button(action_label, Color("#10201f"), Color("#f2f0e9"))
		back.pressed.connect(_show_join_room)
		actions.add_child(back)
	else:
		var loading := _button("جارٍ التحقق…", Color("#d9e0e1"), Color(1.0, 1.0, 1.0, 0.06))
		loading.disabled = true
		actions.add_child(loading)
	content.add_child(actions)

	_layout_card()
	_publish_flow_stage("invitation")
	_publish_interaction_feedback_contract()
	_publish_online_ui_state()
	call_deferred("_apply_split_framing")


func show_online_error(error_code: String) -> void:
	showing = true
	root.visible = true
	joining_room_code = _room_code_from_url() if joining_room_code.is_empty() else joining_room_code
	if error_code == "color_taken" and not joining_room_code.is_empty():
		online_error_text = "اللون محجوز، اختر لونًا آخر."
		room_preview_ready = false
		room_preview_code = joining_room_code
		_set_online_ui_state("color-taken", error_code)
		_show_setup()
		if online != null:
			online.call("preview_room", joining_room_code)
		return

	online_error_text = ""
	_set_online_ui_state(OnlineStateCatalog.request_error_state(error_code), error_code)
	if not joining_room_code.is_empty():
		_show_invitation(joining_room_code)
	else:
		show_online_state_error(error_code, "host")


func show_online_state_error(error_code: String, context: String = "host") -> void:
	showing = true
	root.visible = true
	online_error_text = ""
	_set_online_ui_state(OnlineStateCatalog.request_error_state(error_code), error_code)
	if not joining_room_code.is_empty() and context != "restore":
		_show_invitation(joining_room_code)
		return
	online_state_return_screen = "setup" if context == "host" else "room_entry"
	_show_online_state_screen()


func _show_online_state_screen() -> void:
	active_screen = "online_state"
	_clear_body()
	var content := _content_box()
	body.add_child(content)
	content.add_child(_online_state_notice(online_ui_state_id))
	var state: Dictionary = OnlineStateCatalog.get_state(online_ui_state_id)
	var action: String = str(state.get("action", "none"))
	if online_state_return_screen == "setup" and action == "retry":
		var retry := _button("إعادة المحاولة", Color("#10201f"), Color("#f2f0e9"))
		retry.pressed.connect(_retry_host_request)
		content.add_child(retry)
	var back_label: String = "العودة للإعداد" if online_state_return_screen == "setup" else "العودة للبداية"
	var back := _button(back_label, Color("#eef4f3"), Color(0.10, 0.15, 0.17, 0.82))
	back.pressed.connect(_return_from_online_state)
	content.add_child(back)
	_layout_card()
	_publish_flow_stage("online-state")
	_publish_interaction_feedback_contract()
	_publish_online_ui_state()
	call_deferred("_apply_split_framing")


func _retry_host_request() -> void:
	_clear_online_ui_state()
	_emit_configuration()


func _return_from_online_state() -> void:
	_clear_online_ui_state()
	if online_state_return_screen == "setup":
		_show_setup()
	else:
		_show_room_entry()


func _online_state_notice(state_id: String) -> Control:
	var state: Dictionary = OnlineStateCatalog.get_state(state_id)
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _online_state_notice_style())
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var box := VBoxContainer.new()
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	box.add_theme_constant_override("separation", int(round(_ui_length(6.0))))
	panel.add_child(box)
	box.add_child(_label(str(state.get("title", "")), 18, HORIZONTAL_ALIGNMENT_CENTER, Color.WHITE))
	box.add_child(_label(str(state.get("message", "")), 14, HORIZONTAL_ALIGNMENT_CENTER, Color("#cbd7d9")))
	return panel


func _online_state_notice_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(1.0, 1.0, 1.0, 0.055)
	style.border_color = Color(0.85, 0.94, 0.95, 0.16)
	style.set_border_width_all(1)
	style.set_corner_radius_all(int(round(_ui_length(14.0))))
	style.content_margin_left = _ui_length(14.0)
	style.content_margin_right = _ui_length(14.0)
	style.content_margin_top = _ui_length(12.0)
	style.content_margin_bottom = _ui_length(12.0)
	return style


func _set_online_ui_state(state_id: String, error_code: String = "") -> void:
	online_ui_state_id = state_id
	online_ui_error_code = error_code
	_publish_online_ui_state()


func _clear_online_ui_state() -> void:
	online_ui_state_id = ""
	online_ui_error_code = ""
	_publish_online_ui_state()


func _publish_online_ui_state() -> void:
	if not OS.has_feature("web"):
		return
	if online_ui_state_id.is_empty():
		JavaScriptBridge.eval(
			"delete document.body.dataset.yakolakOnlineUiState;" +
			"delete document.body.dataset.yakolakOnlineUiAction;" +
			"delete document.body.dataset.yakolakOnlineUiMessage;" +
			"document.body.dataset.yakolakOnlineUiSurface='setup';",
			true
		)
		return
	var state: Dictionary = OnlineStateCatalog.get_state(online_ui_state_id)
	var message: String = str(state.get("title", "")) + " — " + str(state.get("message", ""))
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakOnlineUiState=" + JSON.stringify(online_ui_state_id) + ";" +
		"document.body.dataset.yakolakOnlineUiAction=" + JSON.stringify(str(state.get("action", "none"))) + ";" +
		"document.body.dataset.yakolakOnlineUiMessage=" + JSON.stringify(message) + ";" +
		"document.body.dataset.yakolakOnlineUiSurface='setup';" +
		"document.body.dataset.yakolakOnlineUiError=" + JSON.stringify(online_ui_error_code) + ";",
		true
	)
