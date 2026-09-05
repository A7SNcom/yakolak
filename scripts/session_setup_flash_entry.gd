extends "res://scripts/session_setup_state_inventory.gd"

# Hard-owned first-run entry for Flash Mode. A fresh visit asks the knowledge
# question immediately after the real intro handoff, then opens the existing
# setup wizard. Invitation URLs keep their direct invitation path.

func show_after_intro() -> void:
	if showing:
		return
	showing = true
	root.visible = true
	_publish_setup_state("visible")
	joining_room_code = _room_code_from_url()
	if not joining_room_code.is_empty():
		_request_room_preview(joining_room_code)
		_show_invitation(joining_room_code)
	else:
		_prepare_first_run_question()


func _prepare_first_run_question() -> void:
	joining_room_code = ""
	online_error_text = ""
	join_available_colors.clear()
	room_preview_ready = false
	room_preview_code = ""
	tutorial_requested = false
	custom_setup_active = false
	wizard_history.clear()
	_reset_seats()
	wizard_step = "count"
	_show_knowledge_question()


func _start_new_game_flow() -> void:
	# Returning from the entry chooser must follow the same first-run contract;
	# never bypass the knowledge decision through the inherited later-flow path.
	_prepare_first_run_question()


func _show_knowledge_question() -> void:
	active_screen = "question"
	_clear_body()
	var content := _content_box()
	body.add_child(content)
	content.add_child(_label("هل تعرف اللعبة؟", 25, HORIZONTAL_ALIGNMENT_CENTER))
	var choices := _choice_row()
	var yes := _button("نعم، أعرفها", Color("#10201f"), Color("#f2f0e9"))
	yes.pressed.connect(_open_first_run_setup.bind(false))
	choices.add_child(yes)
	var no := _button("أبغى أتعلم", Color.WHITE, Color("#235b50"))
	no.pressed.connect(_open_first_run_setup.bind(true))
	choices.add_child(no)
	content.add_child(choices)
	var back := _button("رجوع", Color("#eef4f3"), Color(0.10, 0.15, 0.17, 0.72))
	back.pressed.connect(_show_room_entry)
	content.add_child(back)
	_layout_card()
	_publish_flow_stage("knowledge")
	call_deferred("_apply_split_framing")


func _open_first_run_setup(with_tutorial: bool) -> void:
	# Do not call the inherited `_open_setup()`: the older split-wizard layer
	# forces `color` as its entry step. The current flow owns structural choices
	# first, so answer the knowledge question and open `count` directly.
	joining_room_code = ""
	online_error_text = ""
	join_available_colors.clear()
	room_preview_ready = false
	room_preview_code = ""
	tutorial_requested = with_tutorial
	_publish_learning_choice("learn" if with_tutorial else "skip")
	custom_setup_active = false
	wizard_history.clear()
	wizard_step = "count"
	_show_setup()


func _color_continue_label() -> String:
	if not joining_room_code.is_empty():
		return "انضم"
	if tutorial_requested and _tutorial_available_for_current_configuration():
		return "ابدأ الشرح"
	return "ابدأ اللعب"


func _continue_after_color() -> void:
	# The knowledge decision already happened before setup. Do not ask it again or
	# emit from the question screen; finish the configured setup exactly once.
	if not joining_room_code.is_empty():
		tutorial_requested = false
		_emit_configuration()
		return
	if tutorial_requested and not _tutorial_available_for_current_configuration():
		tutorial_requested = false
		_publish_learning_choice("not-applicable")
	_emit_configuration()


func _rebuild_active_screen() -> void:
	layout_refresh_pending = false
	if not showing:
		return
	if active_screen == "room_entry":
		_show_room_entry()
		return
	super._rebuild_active_screen()


func _preferred_width_css() -> float:
	if active_screen == "room_entry":
		return 390.0
	return super._preferred_width_css()


func _estimated_height_css(width_css: float) -> float:
	if active_screen == "room_entry":
		return 140.0
	return super._estimated_height_css(width_css)


func _show_room_entry() -> void:
	active_screen = "room_entry"
	joining_room_code = ""
	online_error_text = ""
	manual_room_code_input = ""
	_clear_body()

	var choices := VBoxContainer.new()
	choices.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var margin := _ui_length(14.0)
	choices.offset_left = margin
	choices.offset_top = margin
	choices.offset_right = -margin
	choices.offset_bottom = -margin
	choices.alignment = BoxContainer.ALIGNMENT_CENTER
	choices.add_theme_constant_override("separation", int(round(_ui_length(10.0))))
	choices.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_child(choices)

	var create_game := _button("قيم جديد", Color("#10201f"), Color("#f2f0e9"))
	create_game.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	create_game.pressed.connect(_start_new_game_flow)
	choices.add_child(create_game)

	var join_room := _button("دخول بدعوة", Color.WHITE, Color("#214a64"))
	join_room.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	join_room.pressed.connect(_show_join_room)
	choices.add_child(join_room)

	_layout_card()
	call_deferred("_apply_split_framing")
