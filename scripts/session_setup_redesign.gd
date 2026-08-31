extends "res://scripts/session_setup.gd"

# Compact split-screen setup: one decision at a time while the physical game
# remains visible in the lower half of the viewport.

const THMANYAH_FONT = preload("res://assets/fonts/thmanyahsans-Regular.otf")
const SPLIT_UI_VERSION := "split-wizard-v1"

class StoneSetPreview:
	extends Control
	var stone_color: Color = Color.WHITE

	func _init(value: Color = Color.WHITE) -> void:
		stone_color = value
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		custom_minimum_size = Vector2(86.0, 72.0)

	func _draw() -> void:
		var center := size * 0.5
		var radii: Array[float] = [12.0, 20.0, 29.0]
		for radius: float in radii:
			draw_arc(center, radius, 0.0, TAU, 64, Color(0.0, 0.0, 0.0, 0.42), 6.0, true)
			draw_arc(center, radius, 0.0, TAU, 64, stone_color, 3.8, true)

var wizard_step: String = "color"
var wizard_history: Array[String] = []
var setup_camera_original_v_offset: float = 0.0
var setup_camera_offset_captured: bool = false


func _build_shell() -> void:
	layer = CanvasLayer.new()
	layer.layer = 40
	add_child(layer)

	root = Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_STOP
	root.layout_direction = Control.LAYOUT_DIRECTION_RTL
	root.add_theme_font_override("font", THMANYAH_FONT)
	root.visible = false
	layer.add_child(root)

	card = PanelContainer.new()
	card.mouse_filter = Control.MOUSE_FILTER_STOP
	card.add_theme_stylebox_override("panel", _card_style())
	root.add_child(card)

	body = Control.new()
	body.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	body.mouse_filter = Control.MOUSE_FILTER_STOP
	card.add_child(body)
	_layout_card()


func _layout_card() -> void:
	if root == null or card == null:
		return
	var viewport: Vector2 = get_viewport().get_visible_rect().size
	var metrics := _canvas_metrics(viewport)
	canvas_scale = float(metrics["scale"])
	canvas_css_size = metrics["css_size"] as Vector2

	var width_css: float = minf(560.0, maxf(280.0, canvas_css_size.x - 24.0))
	var requested_height_css: float = 248.0
	if active_screen == "invitation":
		requested_height_css = 258.0
	elif active_screen == "setup":
		match wizard_step:
			"color": requested_height_css = 286.0 if width_css < 430.0 else 238.0
			"count": requested_height_css = 214.0
			"rounds": requested_height_css = 214.0
			_: requested_height_css = 224.0

	var width: float = minf(viewport.x - _ui_length(12.0), width_css / canvas_scale)
	var upper_height: float = viewport.y * 0.47
	var max_height: float = maxf(_ui_length(148.0), upper_height - _ui_length(10.0))
	var height: float = minf(requested_height_css / canvas_scale, max_height)
	var y: float = maxf(_ui_length(6.0), (upper_height - height) * 0.5)
	card.position = Vector2(maxf(0.0, (viewport.x - width) * 0.5), y)
	card.size = Vector2(width, height)
	card.add_theme_stylebox_override("panel", _card_style())

	if showing and not layout_refresh_pending:
		layout_refresh_pending = true
		call_deferred("_rebuild_active_screen")
	if showing:
		call_deferred("_apply_split_framing")


func _apply_split_framing() -> void:
	if not showing or intro == null:
		return
	var preintro: Node = intro.get_node_or_null("StarToTablePreIntro")
	if preintro != null and not bool(preintro.get("completed")):
		return
	if bool(intro.get("playing")):
		return
	_frame_table_for_setup(true)
	_publish_setup_metrics()


func _frame_table_for_setup(active: bool) -> void:
	if intro == null:
		return
	var cam := intro.get("camera") as Camera3D
	if cam == null:
		return
	if not active:
		if setup_camera_offset_captured:
			cam.v_offset = setup_camera_original_v_offset
		setup_camera_offset_captured = false
		if OS.has_feature("web"):
			JavaScriptBridge.eval("delete document.body.dataset.yakolakBoardSetupYRatio;", true)
		return

	if not setup_camera_offset_captured:
		setup_camera_original_v_offset = cam.v_offset
		setup_camera_offset_captured = true

	var viewport: Vector2 = get_viewport().get_visible_rect().size
	if viewport.y <= 1.0:
		return
	var board_center: Vector3 = intro.to_global(Vector3(0.0, 0.35, 0.0))
	cam.v_offset = setup_camera_original_v_offset
	var y0: float = cam.unproject_position(board_center).y
	cam.v_offset = setup_camera_original_v_offset + 1.0
	var y1: float = cam.unproject_position(board_center).y
	var delta: float = y1 - y0
	cam.v_offset = setup_camera_original_v_offset
	if absf(delta) > 0.01:
		var target_y: float = viewport.y * 0.72
		var solved: float = setup_camera_original_v_offset + (target_y - y0) / delta
		cam.v_offset = clampf(solved, setup_camera_original_v_offset - 5.0, setup_camera_original_v_offset + 5.0)
	var actual_y: float = cam.unproject_position(board_center).y
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakBoardSetupYRatio='%.4f';" % (actual_y / viewport.y), true)


func _card_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.035, 0.055, 0.067, 0.88)
	style.border_color = Color(0.82, 0.92, 0.94, 0.22)
	style.set_border_width_all(1)
	style.set_corner_radius_all(int(round(_ui_length(22.0))))
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.34)
	style.shadow_size = int(round(_ui_length(18.0)))
	style.shadow_offset = Vector2(0.0, _ui_length(7.0))
	style.content_margin_left = _ui_length(4.0)
	style.content_margin_right = _ui_length(4.0)
	style.content_margin_top = _ui_length(4.0)
	style.content_margin_bottom = _ui_length(4.0)
	return style


func _content_box() -> VBoxContainer:
	var content := VBoxContainer.new()
	content.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var margin: float = _ui_length(16.0)
	content.offset_left = margin
	content.offset_top = margin
	content.offset_right = -margin
	content.offset_bottom = -margin
	content.add_theme_constant_override("separation", int(round(_ui_length(10.0))))
	content.alignment = BoxContainer.ALIGNMENT_CENTER
	return content


func _show_knowledge_question() -> void:
	active_screen = "question"
	_clear_body()
	var content := _content_box()
	body.add_child(content)
	content.add_child(_label("هل تعرف اللعبة؟", 25, HORIZONTAL_ALIGNMENT_CENTER))
	var choices := _choice_row()
	var yes := _button("نعم، أعرفها", Color("#10201f"), Color("#f2f0e9"))
	yes.pressed.connect(_open_setup.bind(false))
	choices.add_child(yes)
	var no := _button("أبغى أتعلم", Color.WHITE, Color("#235b50"))
	no.pressed.connect(_open_setup.bind(true))
	choices.add_child(no)
	content.add_child(choices)
	_layout_card()
	call_deferred("_apply_split_framing")


func _show_invitation(code: String) -> void:
	active_screen = "invitation"
	_clear_body()
	var content := _content_box()
	body.add_child(content)
	content.add_child(_label("دعوة لعبة", 25, HORIZONTAL_ALIGNMENT_CENTER))
	content.add_child(_label(code, 18, HORIZONTAL_ALIGNMENT_CENTER, Color("#cbd7d9")))
	if not online_error_text.is_empty():
		content.add_child(_label(online_error_text, 14, HORIZONTAL_ALIGNMENT_CENTER, Color("#ffc0b8")))
	var join_label: String = "انضم" if room_preview_ready else ("إعادة" if not online_error_text.is_empty() else "…")
	var join := _button(join_label, Color("#10201f"), Color("#f2f0e9"))
	join.disabled = not room_preview_ready and online_error_text.is_empty()
	if room_preview_ready:
		join.pressed.connect(_open_join_setup.bind(code))
	else:
		join.pressed.connect(_retry_room_preview.bind(code))
	content.add_child(join)
	_layout_card()
	call_deferred("_apply_split_framing")


func _open_setup(with_tutorial: bool) -> void:
	wizard_step = "color"
	wizard_history.clear()
	super._open_setup(with_tutorial)


func _open_join_setup(code: String) -> void:
	wizard_step = "color"
	wizard_history.clear()
	super._open_join_setup(code)


func _show_setup() -> void:
	active_screen = "setup"
	_clear_body()
	var content := _content_box()
	body.add_child(content)

	var title: String = "اختر لونك"
	if wizard_step == "count":
		title = "كم لاعب؟"
	elif wizard_step.begins_with("mode:"):
		title = "اللاعب %s" % _arabic_digit(_mode_seat_index() + 1)
	elif wizard_step == "rounds":
		title = "كم فوز تحتاج لحسم المباراة؟"
	content.add_child(_wizard_header(title))

	if not online_error_text.is_empty():
		content.add_child(_label(online_error_text, 13, HORIZONTAL_ALIGNMENT_CENTER, Color("#ffc0b8")))

	match wizard_step:
		"color":
			_build_color_question(content)
		"count":
			_build_count_question(content)
		"rounds":
			_build_rounds_question(content)
		_:
			if wizard_step.begins_with("mode:"):
				_build_mode_question(content, _mode_seat_index())
			else:
				wizard_step = "color"
				_build_color_question(content)

	_layout_card()
	_publish_setup_metrics.call_deferred()
	call_deferred("_apply_split_framing")


func _wizard_header(title: String) -> Control:
	var row := HBoxContainer.new()
	row.layout_direction = Control.LAYOUT_DIRECTION_LTR
	row.add_theme_constant_override("separation", int(round(_ui_length(8.0))))
	var back := _button("←", Color("#eef4f3"), Color(0.10, 0.15, 0.17, 0.72))
	back.custom_minimum_size = Vector2(_ui_length(44.0), _ui_length(42.0))
	back.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	back.pressed.connect(_wizard_back)
	row.add_child(back)
	var heading := _label(title, 24, HORIZONTAL_ALIGNMENT_RIGHT)
	heading.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(heading)
	return row


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
	var next_label: String = "انضم" if not joining_room_code.is_empty() else "التالي"
	var next := _button(next_label, Color("#10201f"), Color("#f2f0e9"))
	next.disabled = (not joining_room_code.is_empty()) and (not room_preview_ready or not join_available_colors.has(selected))
	if joining_room_code.is_empty():
		next.pressed.connect(_goto_step.bind("count"))
	else:
		next.pressed.connect(_emit_configuration)
	content.add_child(next)


func _color_choice_button(color_id: String, value: Color, selected: bool, enabled: bool) -> Button:
	var button := Button.new()
	button.focus_mode = Control.FOCUS_NONE
	button.custom_minimum_size = Vector2(_ui_length(86.0), _ui_length(74.0))
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.disabled = not enabled
	button.add_theme_stylebox_override("normal", _color_tile_style(value, selected, false))
	button.add_theme_stylebox_override("hover", _color_tile_style(value, selected, true))
	button.add_theme_stylebox_override("pressed", _color_tile_style(value, true, true))
	button.add_theme_stylebox_override("disabled", _color_tile_style(value, false, false, 0.28))
	button.pressed.connect(_choose_wizard_color.bind(color_id))
	var preview := StoneSetPreview.new(value)
	preview.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	button.add_child(preview)
	return button


func _color_tile_style(value: Color, selected: bool, hover: bool, alpha: float = 1.0) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.08, 0.12, 0.14, (0.80 if selected else 0.56) * alpha)
	style.border_color = Color(value.r, value.g, value.b, (0.92 if selected else (0.42 if hover else 0.18)) * alpha)
	style.set_border_width_all(2 if selected else 1)
	style.set_corner_radius_all(int(round(_ui_length(15.0))))
	if selected:
		style.shadow_color = Color(value.r, value.g, value.b, 0.18 * alpha)
		style.shadow_size = int(round(_ui_length(8.0)))
	return style


func _build_count_question(content: VBoxContainer) -> void:
	var row := _choice_row()
	for count: int in [2, 3, 4]:
		var choice := _big_choice(_arabic_digit(count))
		choice.pressed.connect(_choose_player_count.bind(count))
		row.add_child(choice)
	content.add_child(row)


func _build_mode_question(content: VBoxContainer, seat_index: int) -> void:
	var row := _choice_row()
	var local := _button("معي", Color("#10201f"), Color("#f2f0e9"))
	local.pressed.connect(_choose_mode.bind(seat_index, "local"))
	row.add_child(local)
	var bot := _button("كمبيوتر", Color.WHITE, Color("#2a5652"))
	bot.pressed.connect(_choose_mode.bind(seat_index, "bot"))
	row.add_child(bot)
	var online_choice := _button("أونلاين", Color.WHITE, Color("#214a64"))
	online_choice.pressed.connect(_choose_mode.bind(seat_index, "online"))
	row.add_child(online_choice)
	content.add_child(row)


func _build_rounds_question(content: VBoxContainer) -> void:
	var row := _choice_row()
	for count: int in [3, 5]:
		var choice := _big_choice(_arabic_digit(count))
		choice.pressed.connect(_choose_rounds.bind(count))
		row.add_child(choice)
	content.add_child(row)


func _choice_row() -> HBoxContainer:
	var row := HBoxContainer.new()
	row.layout_direction = Control.LAYOUT_DIRECTION_RTL
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", int(round(_ui_length(8.0))))
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return row


func _big_choice(text_value: String) -> Button:
	var button := _button(text_value, Color("#10201f"), Color("#f2f0e9"))
	button.add_theme_font_size_override("font_size", _ui_font_size(25))
	button.custom_minimum_size.y = _ui_length(62.0)
	return button


func _choose_wizard_color(color_id: String) -> void:
	if not joining_room_code.is_empty() and (not room_preview_ready or not join_available_colors.has(color_id)):
		return
	var choice: int = _palette_index(color_id)
	_on_color_selected(choice, 0)


func _choose_player_count(count: int) -> void:
	for index: int in range(seats.size()):
		var seat: Dictionary = seats[index]
		seat["active"] = index < count
		if index > 0:
			seat["mode"] = "local"
		seats[index] = seat
	_goto_step("mode:1")


func _choose_mode(seat_index: int, mode: String) -> void:
	if seat_index <= 0 or seat_index >= seats.size() or not bool(seats[seat_index]["active"]):
		return
	var seat: Dictionary = seats[seat_index]
	seat["mode"] = mode
	seats[seat_index] = seat
	if mode == "online":
		for index: int in range(1, seats.size()):
			var other: Dictionary = seats[index]
			if bool(other["active"]):
				other["mode"] = "online"
				seats[index] = other
		_goto_step("rounds")
		return
	var next_index: int = -1
	for index: int in range(seat_index + 1, seats.size()):
		if bool(seats[index]["active"]):
			next_index = index
			break
	_goto_step("rounds" if next_index < 0 else "mode:%d" % next_index)


func _choose_rounds(value: int) -> void:
	rounds = value
	_emit_configuration()


func _goto_step(next_step: String) -> void:
	if wizard_step != next_step:
		wizard_history.append(wizard_step)
		wizard_step = next_step
	_show_setup()


func _wizard_back() -> void:
	if not wizard_history.is_empty():
		wizard_step = wizard_history.pop_back()
		_show_setup()
		return
	if not joining_room_code.is_empty():
		_show_invitation(joining_room_code)
	else:
		_show_knowledge_question()


func _mode_seat_index() -> int:
	if not wizard_step.begins_with("mode:"):
		return 1
	return clampi(int(wizard_step.trim_prefix("mode:")), 1, seats.size() - 1)


func _arabic_digit(value: int) -> String:
	match value:
		2: return "٢"
		3: return "٣"
		4: return "٤"
		5: return "٥"
		_: return str(value)


func _label(text_value: String, size: int, alignment: HorizontalAlignment, color: Color = Color.WHITE) -> Label:
	var label := Label.new()
	label.text = text_value
	label.horizontal_alignment = alignment
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_override("font", THMANYAH_FONT)
	label.add_theme_font_size_override("font_size", _ui_font_size(size))
	label.add_theme_color_override("font_color", color)
	label.layout_direction = Control.LAYOUT_DIRECTION_RTL
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label


func _button(text_value: String, foreground: Color, background: Color) -> Button:
	var button := Button.new()
	button.text = text_value
	button.layout_direction = Control.LAYOUT_DIRECTION_RTL
	button.custom_minimum_size = Vector2(0.0, _ui_length(48.0))
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.add_theme_font_override("font", THMANYAH_FONT)
	button.add_theme_font_size_override("font_size", _ui_font_size(16))
	button.add_theme_color_override("font_color", foreground)
	button.add_theme_color_override("font_hover_color", foreground)
	button.add_theme_color_override("font_pressed_color", foreground)
	button.add_theme_color_override("font_focus_color", foreground)
	button.add_theme_color_override("font_disabled_color", Color(foreground.r, foreground.g, foreground.b, 0.42))
	button.add_theme_stylebox_override("normal", _button_style(background))
	button.add_theme_stylebox_override("hover", _button_style(background.lightened(0.06)))
	button.add_theme_stylebox_override("pressed", _button_style(background.darkened(0.08)))
	button.add_theme_stylebox_override("focus", _button_style(background.lightened(0.04)))
	return button


func _button_style(background: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.border_color = Color(1.0, 1.0, 1.0, 0.10)
	style.set_border_width_all(1)
	style.set_corner_radius_all(int(round(_ui_length(14.0))))
	style.content_margin_left = _ui_length(12.0)
	style.content_margin_right = _ui_length(12.0)
	return style


func _apply_picker_font(picker: OptionButton) -> void:
	picker.layout_direction = Control.LAYOUT_DIRECTION_RTL
	picker.add_theme_font_override("font", THMANYAH_FONT)
	picker.add_theme_font_size_override("font_size", _ui_font_size(16))
	var menu: PopupMenu = picker.get_popup()
	menu.add_theme_font_override("font", THMANYAH_FONT)
	menu.add_theme_font_size_override("font_size", _ui_font_size(16))


func _emit_configuration() -> void:
	_frame_table_for_setup(false)
	super._emit_configuration()


func reset_for_intro() -> void:
	_frame_table_for_setup(false)
	wizard_step = "color"
	wizard_history.clear()
	super.reset_for_intro()


func _publish_setup_metrics() -> void:
	if not OS.has_feature("web") or not showing or card == null:
		return
	var viewport: Vector2 = get_viewport().get_visible_rect().size
	var card_bottom_ratio: float = (card.position.y + card.size.y) / maxf(viewport.y, 1.0)
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakArabicFont='thmanyah';" +
		"document.body.dataset.yakolakSetupLayout='" + SPLIT_UI_VERSION + "';" +
		"document.body.dataset.yakolakSetupScrollable='false';" +
		"document.body.dataset.yakolakSetupWizard='" + wizard_step + "';" +
		"document.body.dataset.yakolakSetupCardBottomRatio='%.4f';" % card_bottom_ratio,
		true
	)
