extends "res://scripts/session_setup_state_inventory.gd"

# Minimal start choice for Flash Mode UX: exactly two actions, no explanatory copy.

func _preferred_width_css() -> float:
	if active_screen == "room_entry":
		return 420.0
	return super._preferred_width_css()


func _estimated_height_css(width_css: float) -> float:
	if active_screen == "room_entry":
		return 148.0
	return super._estimated_height_css(width_css)


func _show_room_entry() -> void:
	active_screen = "room_entry"
	joining_room_code = ""
	online_error_text = ""
	manual_room_code_input = ""
	_clear_body()

	var content := _content_box()
	body.add_child(content)

	var choices := _choice_row()
	var create_game := _button("قيم جديد", Color("#10201f"), Color("#f2f0e9"))
	create_game.pressed.connect(_start_new_game_flow)
	choices.add_child(create_game)

	var join_room := _button("دخول بدعوة", Color.WHITE, Color("#214a64"))
	join_room.pressed.connect(_show_join_room)
	choices.add_child(join_room)
	content.add_child(choices)

	_layout_card()
	call_deferred("_apply_split_framing")
