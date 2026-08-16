extends "res://scripts/session_setup_state_inventory.gd"

# Hard-owned minimal entry screen: exactly two visible text choices.
# Do not delegate the entry screen to older setup layers.

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
		_show_room_entry()


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
