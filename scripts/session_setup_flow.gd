extends "res://scripts/session_setup_arabic.gd"

# User-journey layer only: ask structural match decisions first, cosmetic choice
# afterwards, and offer learning only at the point where it can actually run.
# No gameplay capability is added here.

var web_setup_flow_action_callback: Variant


func _ready() -> void:
	super._ready()
	if not OS.has_feature("web"):
		return
	var test_enabled: Variant = JavaScriptBridge.eval("new URL(location.href).searchParams.get('yakolakTestFast')==='1'", true)
	if not bool(test_enabled):
		return
	web_setup_flow_action_callback = JavaScriptBridge.create_callback(_on_web_setup_flow_action)
	var window: JavaScriptObject = JavaScriptBridge.get_interface("window")
	if window != null:
		window.set("yakolakTestSetupFlowAction", web_setup_flow_action_callback)


func _show_room_entry() -> void:
	super._show_room_entry()
	_publish_flow_stage("entry")


func _show_join_room() -> void:
	super._show_join_room()
	_publish_flow_stage("join-room")


func _show_invitation(code: String) -> void:
	super._show_invitation(code)
	_publish_flow_stage("invitation")


func _start_new_game_flow() -> void:
	joining_room_code = ""
	online_error_text = ""
	join_available_colors.clear()
	room_preview_ready = false
	room_preview_code = ""
	tutorial_requested = false
	wizard_history.clear()
	_reset_seats()
	wizard_step = "count"
	_show_setup()


func _show_setup() -> void:
	super._show_setup()
	_publish_flow_stage(wizard_step)


func _wizard_header(title: String) -> Control:
	var clearer_title: String = title
	if title == "كم جولة؟":
		clearer_title = "كم شوط للفوز؟"
	elif title.begins_with("اللاعب "):
		clearer_title = title + " بيلعب كيف؟"
	return super._wizard_header(clearer_title)


func _build_mode_question(content: VBoxContainer, seat_index: int) -> void:
	var row := _choice_row()
	var local := _button("على نفس الجهاز", Color("#10201f"), Color("#f2f0e9"))
	local.pressed.connect(_choose_mode.bind(seat_index, "local"))
	row.add_child(local)
	var bot := _button("كمبيوتر", Color.WHITE, Color("#235b50"))
	bot.pressed.connect(_choose_mode.bind(seat_index, "bot"))
	row.add_child(bot)
	# Online is a room-wide mode in the current protocol. Offer it only on the
	# first opponent so a later choice can never silently rewrite earlier seats.
	if seat_index == 1:
		var online_label: String = "الكل أونلاين" if _active_count() > 2 else "أونلاين"
		var online_button := _button(online_label, Color.WHITE, Color("#2a4d63"))
		online_button.pressed.connect(_choose_mode.bind(seat_index, "online"))
		row.add_child(online_button)
	content.add_child(row)


func _choose_mode(seat_index: int, mode_id: String) -> void:
	# Guard the same rule behind the UI: unsupported mixed online/local configs
	# must not be reachable from test hooks or future callers either.
	if mode_id == "online" and seat_index != 1:
		return
	super._choose_mode(seat_index, mode_id)


func _build_color_question(content: VBoxContainer) -> void:
	var grid := GridContainer.new()
	grid.columns = 2 if card.size.x * canvas_scale < 430.0 else 4
	grid.add_theme_constant_override("h_separation", int(round(_ui_length(8.0))))
	grid.add_theme_constant_override("v_separation", int(round(_ui_length(8.0))))
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var selected: String = str(seats[0]["color"])
	for color_data: Dictionary in PALETTE:
		var color_id: String = str(color_data["id"])
		var enabled: bool = joining_room_code.is_empty() or (room_preview_ready and join_available_colors.has(color_id))
		var option := _color_choice_button(color_id, color_data["color"] as Color, color_id == selected, enabled)
		grid.add_child(option)
	content.add_child(grid)

	var next_label: String = "التالي"
	if not joining_room_code.is_empty():
		next_label = "انضم"
	elif not _tutorial_available_for_current_configuration():
		next_label = "ابدأ اللعب"
	var next := _button(next_label, Color("#10201f"), Color("#f2f0e9"))
	next.disabled = (not joining_room_code.is_empty()) and (not room_preview_ready or not join_available_colors.has(selected))
	next.pressed.connect(_continue_after_color)
	content.add_child(next)


func _choose_rounds(value: int) -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakSetupRounds='" + str(value) + "';", true)
	rounds = value
	_goto_step("color")


func _continue_after_color() -> void:
	if not joining_room_code.is_empty():
		tutorial_requested = false
		_emit_configuration()
		return
	if not _tutorial_available_for_current_configuration():
		tutorial_requested = false
		_publish_learning_choice("not-applicable")
		_emit_configuration()
		return
	_show_knowledge_question()


func _show_knowledge_question() -> void:
	active_screen = "question"
	_clear_body()
	var content := _content_box()
	body.add_child(content)
	content.add_child(_label("تعرف كيف تلعب ياكلك؟", 25, HORIZONTAL_ALIGNMENT_CENTER))
	var choices := _choice_row()
	var yes := _button("نعم، ابدأ اللعب", Color("#10201f"), Color("#f2f0e9"))
	yes.pressed.connect(_finish_knowledge_decision.bind(false))
	choices.add_child(yes)
	var no := _button("لا، أبغى أتعلم", Color.WHITE, Color("#235b50"))
	no.pressed.connect(_finish_knowledge_decision.bind(true))
	choices.add_child(no)
	content.add_child(choices)
	var back := _button("رجوع", Color("#eef4f3"), Color(0.10, 0.15, 0.17, 0.72))
	back.pressed.connect(_show_setup)
	content.add_child(back)
	_layout_card()
	_publish_flow_stage("knowledge")
	call_deferred("_apply_split_framing")


func _finish_knowledge_decision(with_tutorial: bool) -> void:
	tutorial_requested = with_tutorial
	_publish_learning_choice("learn" if with_tutorial else "skip")
	_emit_configuration()


func _tutorial_available_for_current_configuration() -> bool:
	if not joining_room_code.is_empty():
		return false
	for index: int in range(1, seats.size()):
		var seat: Dictionary = seats[index]
		if bool(seat["active"]) and str(seat["mode"]) == "online":
			return false
	return true


func _wizard_back() -> void:
	if not wizard_history.is_empty():
		wizard_step = wizard_history.pop_back()
		_show_setup()
		return
	if not joining_room_code.is_empty():
		_show_invitation(joining_room_code)
	else:
		_show_room_entry()


func _publish_flow_stage(stage: String) -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakSetupFlowStage='" + stage + "';", true)


func _publish_learning_choice(choice: String) -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakSetupLearning='" + choice + "';", true)


func _on_web_setup_flow_action(arguments: Array) -> void:
	if not showing or arguments.is_empty():
		return
	var action: String = str(arguments[0])
	match action:
		"new":
			_start_new_game_flow()
		"join-setup":
			if not joining_room_code.is_empty() and room_preview_ready:
				_open_join_setup(joining_room_code)
		"count":
			if arguments.size() >= 2:
				_choose_player_count(clampi(int(arguments[1]), 2, 4))
		"mode":
			if arguments.size() >= 3:
				_choose_mode(clampi(int(arguments[1]), 1, 3), str(arguments[2]))
		"rounds":
			if arguments.size() >= 2:
				_choose_rounds(3 if int(arguments[1]) == 3 else 5)
		"color":
			if arguments.size() >= 2:
				_choose_wizard_color(str(arguments[1]))
		"continue":
			# Tests must follow the visible invitation action before pressing the
			# color-screen CTA; this keeps forced state coverage on a reachable path.
			if active_screen == "invitation" and not joining_room_code.is_empty() and room_preview_ready:
				_open_join_setup(joining_room_code)
			_continue_after_color()
		"knowledge":
			if arguments.size() >= 2:
				_finish_knowledge_decision(str(arguments[1]) == "learn")
