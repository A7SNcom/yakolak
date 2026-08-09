extends Node

# A single, deliberately small post-intro setup.  The physical colour of a
# player is also the direction of that player's base on the table.

signal configuration_ready(configuration: Dictionary)

const ARABIC_FONT = preload("res://assets/fonts/DejaVuSans.ttf")

const PALETTE: Array[Dictionary] = [
	{"id": "marble", "name": "أبيض", "direction": "right", "color": Color("#f4f4f1")},
	{"id": "blue", "name": "أزرق", "direction": "back", "color": Color("#173fa8")},
	{"id": "gold", "name": "ذهبي", "direction": "left", "color": Color("#9d6415")},
	{"id": "green", "name": "أخضر", "direction": "front", "color": Color("#087455")},
]

const MODE_OPTIONS: Array[Dictionary] = [
	{"id": "local", "name": "نفس الجهاز"},
	{"id": "bot", "name": "بوت"},
	{"id": "online", "name": "دعوة أونلاين"},
]

var intro: Node3D
var online: Node
var layer: CanvasLayer
var root: Control
var card: PanelContainer
var body: Control
var seats: Array[Dictionary] = []
var rounds: int = 3
var tutorial_requested: bool = false
var showing: bool = false
var joining_room_code: String = ""
var online_error_text: String = ""
var web_start_callback: Variant
var web_show_setup_callback: Variant
var active_screen: String = ""
var canvas_scale: float = 1.0
var canvas_css_size: Vector2 = Vector2.ZERO
var layout_refresh_pending: bool = false
var join_available_colors: Array[String] = []
var room_preview_ready: bool = false
var room_preview_code: String = ""


func _ready() -> void:
	process_priority = 60
	intro = get_parent() as Node3D
	online = intro.get_node_or_null("OnlineSession")
	if online != null:
		if not online.is_connected("room_previewed", Callable(self, "_on_room_previewed")):
			online.connect("room_previewed", Callable(self, "_on_room_previewed"))
		if not online.is_connected("room_preview_failed", Callable(self, "_on_room_preview_failed")):
			online.connect("room_preview_failed", Callable(self, "_on_room_preview_failed"))
	_reset_seats()
	_build_shell()
	_build_web_test_hook()
	if not get_viewport().size_changed.is_connected(_layout_card):
		get_viewport().size_changed.connect(_layout_card)
	_layout_card.call_deferred()


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
		_show_knowledge_question()


func reset_for_intro() -> void:
	showing = false
	tutorial_requested = false
	joining_room_code = ""
	online_error_text = ""
	join_available_colors.clear()
	room_preview_ready = false
	room_preview_code = ""
	active_screen = ""
	if root != null:
		root.visible = false
	_clear_body()
	_publish_setup_state("hidden")


func _reset_seats() -> void:
	seats = [
		{"active": true, "color": "marble", "mode": "local", "label": "أنا"},
		{"active": false, "color": "blue", "mode": "local", "label": "اللاعب 2"},
		{"active": false, "color": "gold", "mode": "local", "label": "اللاعب 3"},
		{"active": false, "color": "green", "mode": "local", "label": "اللاعب 4"},
	]


func _build_shell() -> void:
	layer = CanvasLayer.new()
	layer.layer = 40
	add_child(layer)

	root = Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_STOP
	root.layout_direction = Control.LAYOUT_DIRECTION_RTL
	root.add_theme_font_override("font", ARABIC_FONT)
	root.visible = false
	layer.add_child(root)

	var shade := ColorRect.new()
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.color = Color(0.015, 0.018, 0.020, 0.68)
	shade.mouse_filter = Control.MOUSE_FILTER_STOP
	root.add_child(shade)

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
	var compact_screen: bool = canvas_css_size.x < 760.0 or canvas_css_size.y > canvas_css_size.x
	var width_css: float = maxf(260.0, canvas_css_size.x - 28.0)
	var height_css: float = maxf(320.0, canvas_css_size.y - 28.0)
	if not compact_screen:
		width_css = minf(width_css, 560.0)
		height_css = minf(height_css, 760.0)
	var width: float = minf(viewport.x - _ui_length(14.0), width_css / canvas_scale)
	var height: float = minf(viewport.y - _ui_length(14.0), height_css / canvas_scale)
	card.position = Vector2((viewport.x - width) * 0.5, (viewport.y - height) * 0.5)
	card.size = Vector2(width, height)
	if showing and not layout_refresh_pending:
		layout_refresh_pending = true
		call_deferred("_rebuild_active_screen")


func _canvas_metrics(viewport: Vector2) -> Dictionary:
	var css_size: Vector2 = viewport
	if OS.has_feature("web"):
		var raw: Variant = JavaScriptBridge.eval(
			"JSON.stringify((()=>{const c=document.getElementById('canvas');const r=c?c.getBoundingClientRect():{width:innerWidth,height:innerHeight};return{w:r.width||innerWidth,h:r.height||innerHeight};})())",
			true
		)
		var decoded: Variant = JSON.parse_string(str(raw))
		if decoded is Dictionary:
			var values: Dictionary = decoded as Dictionary
			css_size = Vector2(float(values.get("w", viewport.x)), float(values.get("h", viewport.y)))
	var scale_x: float = css_size.x / maxf(viewport.x, 1.0)
	var scale_y: float = css_size.y / maxf(viewport.y, 1.0)
	var scale: float = clampf(minf(scale_x, scale_y), 0.20, 4.0)
	return {"css_size": css_size, "scale": scale}


func _ui_length(css_pixels: float) -> float:
	return css_pixels / maxf(canvas_scale, 0.20)


func _ui_font_size(css_points: int) -> int:
	return maxi(12, int(round(float(css_points) / maxf(canvas_scale, 0.20))))


func _rebuild_active_screen() -> void:
	layout_refresh_pending = false
	if not showing:
		return
	match active_screen:
		"question":
			_show_knowledge_question()
		"invitation":
			_show_invitation(joining_room_code)
		"setup":
			_show_setup()


func _card_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color("#151719f5")
	style.border_color = Color("#ffffff2e")
	style.set_border_width_all(1)
	style.set_corner_radius_all(int(round(_ui_length(22.0))))
	style.shadow_color = Color(0, 0, 0, 0.45)
	style.shadow_size = int(round(_ui_length(18.0)))
	style.shadow_offset = Vector2(0, _ui_length(8.0))
	return style


func _clear_body() -> void:
	if body == null:
		return
	for child: Node in body.get_children():
		child.queue_free()


func _show_knowledge_question() -> void:
	active_screen = "question"
	_clear_body()
	var content := _stack(false)
	content.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_MINSIZE, int(round(_ui_length(24.0))))
	body.add_child(content)
	content.add_child(_label("هل تعرف اللعبة؟", 28, HORIZONTAL_ALIGNMENT_CENTER))
	content.add_child(_spacer(16.0))
	var yes := _button("نعم، أعرفها", Color("#f2f0e9"), Color("#26282a"))
	yes.pressed.connect(_open_setup.bind(false))
	content.add_child(yes)
	var no := _button("لا، أبغى أتعلم عليها", Color.WHITE, Color("#245c50"))
	# v112's useful tutorial was action-led: enter the real match and guide the
	# first move there.  Do not insert another reading screen before setup.
	no.pressed.connect(_open_setup.bind(true))
	content.add_child(no)


func _show_invitation(code: String) -> void:
	active_screen = "invitation"
	_clear_body()
	var content := _stack(false)
	content.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_MINSIZE, int(round(_ui_length(24.0))))
	body.add_child(content)
	content.add_child(_label("دعوة لعبة", 28, HORIZONTAL_ALIGNMENT_CENTER))
	content.add_child(_label("الغرفة " + code, 18, HORIZONTAL_ALIGNMENT_CENTER, Color("#cfd5d8")))
	if not online_error_text.is_empty():
		content.add_child(_label(online_error_text, 15, HORIZONTAL_ALIGNMENT_CENTER, Color("#f2aaa3")))
	content.add_child(_spacer(12.0))
	var join_label: String = "انضم" if room_preview_ready else ("إعادة" if not online_error_text.is_empty() else "…")
	var join := _button(join_label, Color.WHITE, Color("#245c50"))
	join.disabled = not room_preview_ready and online_error_text.is_empty()
	if room_preview_ready:
		join.pressed.connect(_open_join_setup.bind(code))
	else:
		join.pressed.connect(_retry_room_preview.bind(code))
	content.add_child(join)


func _request_room_preview(code: String) -> void:
	room_preview_code = code
	room_preview_ready = false
	join_available_colors.clear()
	if online == null:
		online = intro.get_node_or_null("OnlineSession")
	if online == null:
		online_error_text = "تعذر الاتصال."
		return
	online.call("preview_room", code)


func _retry_room_preview(code: String) -> void:
	online_error_text = ""
	_request_room_preview(code)
	_show_invitation(code)


func _on_room_previewed(preview: Dictionary) -> void:
	if str(preview.get("code", "")) != room_preview_code:
		return
	join_available_colors.clear()
	var available_values: Array = preview.get("availableColors", []) as Array
	for value: Variant in available_values:
		join_available_colors.append(str(value))
	if str(preview.get("status", "waiting")) != "waiting" or join_available_colors.is_empty():
		room_preview_ready = false
		online_error_text = "الغرفة غير متاحة."
	else:
		room_preview_ready = true
		online_error_text = ""
		if active_screen == "setup" and not join_available_colors.has(str(seats[0]["color"])):
			var first: Dictionary = seats[0]
			first["color"] = join_available_colors[0]
			seats[0] = first
	if active_screen == "setup":
		_show_setup()
	else:
		_show_invitation(joining_room_code)


func _on_room_preview_failed(_code: String) -> void:
	room_preview_ready = false
	online_error_text = "تعذر الاتصال. حاول مرة أخرى."
	if active_screen == "setup":
		_show_setup()
	else:
		_show_invitation(joining_room_code)


func _open_join_setup(code: String) -> void:
	joining_room_code = code
	online_error_text = ""
	tutorial_requested = false
	_reset_seats()
	if not join_available_colors.is_empty():
		var first: Dictionary = seats[0]
		first["color"] = join_available_colors[0]
		seats[0] = first
	_show_setup()


func _open_setup(with_tutorial: bool) -> void:
	joining_room_code = ""
	online_error_text = ""
	join_available_colors.clear()
	room_preview_ready = false
	room_preview_code = ""
	tutorial_requested = with_tutorial
	_show_setup()


func _show_setup() -> void:
	active_screen = "setup"
	_clear_body()
	var scroll := ScrollContainer.new()
	scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_MINSIZE, 14)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.mouse_filter = Control.MOUSE_FILTER_STOP
	body.add_child(scroll)

	var margin := MarginContainer.new()
	margin.custom_minimum_size = Vector2(maxf(card.size.x - _ui_length(44.0), _ui_length(260.0)), 0.0)
	margin.add_theme_constant_override("margin_left", int(round(_ui_length(10.0))))
	margin.add_theme_constant_override("margin_right", int(round(_ui_length(10.0))))
	margin.add_theme_constant_override("margin_top", int(round(_ui_length(12.0))))
	margin.add_theme_constant_override("margin_bottom", int(round(_ui_length(18.0))))
	scroll.add_child(margin)

	var content := _stack(true)
	margin.add_child(content)
	content.add_child(_label("اختر لونك" if not joining_room_code.is_empty() else "اللاعبون", 25, HORIZONTAL_ALIGNMENT_RIGHT))
	if joining_room_code.is_empty():
		content.add_child(_label("%d / 4" % _active_count(), 16, HORIZONTAL_ALIGNMENT_RIGHT, Color("#d9dddf")))
	if not online_error_text.is_empty():
		content.add_child(_label(online_error_text, 15, HORIZONTAL_ALIGNMENT_RIGHT, Color("#f2aaa3")))
	content.add_child(_spacer(8.0))

	for seat_index: int in range(1 if not joining_room_code.is_empty() else seats.size()):
		var seat: Dictionary = seats[seat_index]
		if bool(seat["active"]):
			content.add_child(_seat_row(seat_index))

	if joining_room_code.is_empty():
		var player_controls := HBoxContainer.new()
		player_controls.alignment = BoxContainer.ALIGNMENT_CENTER
		player_controls.add_theme_constant_override("separation", int(round(_ui_length(8.0))))
		var add_player := _button("＋ لاعب", Color.WHITE, Color("#255f50"))
		add_player.disabled = _active_count() >= 4
		add_player.pressed.connect(_add_player)
		player_controls.add_child(add_player)
		var remove_player := _button("−", Color("#e3e6e7"), Color("#34373a"))
		remove_player.disabled = _active_count() <= 1
		remove_player.pressed.connect(_remove_player)
		player_controls.add_child(remove_player)
		content.add_child(player_controls)
		content.add_child(_spacer(8.0))

	if joining_room_code.is_empty():
		var rounds_row := HBoxContainer.new()
		rounds_row.layout_direction = Control.LAYOUT_DIRECTION_RTL
		rounds_row.add_theme_constant_override("separation", int(round(_ui_length(12.0))))
		var rounds_label := _label("أشواط للفوز", 18, HORIZONTAL_ALIGNMENT_RIGHT)
		rounds_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		rounds_row.add_child(rounds_label)
		var rounds_picker := OptionButton.new()
		rounds_picker.add_item("٣ أشواط للفوز", 3)
		rounds_picker.add_item("٥ أشواط للفوز", 5)
		rounds_picker.select(0 if rounds == 3 else 1)
		rounds_picker.custom_minimum_size = Vector2(_ui_length(132.0), _ui_length(46.0))
		_apply_picker_font(rounds_picker)
		rounds_picker.item_selected.connect(_on_rounds_selected.bind(rounds_picker))
		rounds_row.add_child(rounds_picker)
		content.add_child(rounds_row)
	content.add_child(_spacer(12.0))

	var needs_second_player: bool = joining_room_code.is_empty() and _active_count() < 2
	var start := _button("انضم للغرفة" if not joining_room_code.is_empty() else ("أضف لاعبًا" if needs_second_player else "ابدأ اللعب"), Color("#0e1313"), Color("#f1f0ea"))
	start.add_theme_font_size_override("font_size", _ui_font_size(18))
	start.disabled = needs_second_player or (not joining_room_code.is_empty() and not room_preview_ready)
	start.pressed.connect(_emit_configuration)
	content.add_child(start)
	_publish_setup_metrics.call_deferred()


func _seat_row(seat_index: int) -> Control:
	var seat: Dictionary = seats[seat_index]
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _seat_style())
	panel.custom_minimum_size = Vector2(0, _ui_length(98.0))
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", int(round(_ui_length(8.0))))
	panel.add_child(box)

	var headline := HBoxContainer.new()
	headline.layout_direction = Control.LAYOUT_DIRECTION_RTL
	var title := _label(str(seat["label"]), 17, HORIZONTAL_ALIGNMENT_RIGHT)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	headline.add_child(title)
	var dot := _label("●", 18, HORIZONTAL_ALIGNMENT_LEFT, _palette_color(str(seat["color"])))
	headline.add_child(dot)
	box.add_child(headline)

	var choices := HBoxContainer.new()
	choices.layout_direction = Control.LAYOUT_DIRECTION_RTL
	choices.add_theme_constant_override("separation", int(round(_ui_length(8.0))))
	var color_picker := OptionButton.new()
	color_picker.custom_minimum_size = Vector2(0, _ui_length(44.0))
	color_picker.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for color_data: Dictionary in PALETTE:
		color_picker.add_item(str(color_data["name"]))
		if not joining_room_code.is_empty() and room_preview_ready and not join_available_colors.has(str(color_data["id"])):
			color_picker.set_item_disabled(color_picker.item_count - 1, true)
	color_picker.select(_palette_index(str(seat["color"])))
	color_picker.item_selected.connect(_on_color_selected.bind(seat_index))
	_apply_picker_font(color_picker)
	choices.add_child(color_picker)
	if seat_index == 0:
		# "أنا" is always the person holding this device.  Keeping that seat
		# local prevents a host from accidentally creating an unwinnable room.
		color_picker.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	else:
		var mode_picker := OptionButton.new()
		mode_picker.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		mode_picker.custom_minimum_size = Vector2(0, _ui_length(44.0))
		for mode_data: Dictionary in MODE_OPTIONS:
			mode_picker.add_item(str(mode_data["name"]))
		mode_picker.select(_mode_index(str(seat["mode"])))
		mode_picker.item_selected.connect(_on_mode_selected.bind(seat_index))
		_apply_picker_font(mode_picker)
		choices.add_child(mode_picker)
	box.add_child(choices)
	return panel


func _seat_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color("#212426")
	style.set_corner_radius_all(int(round(_ui_length(16.0))))
	style.content_margin_left = _ui_length(14.0)
	style.content_margin_right = _ui_length(14.0)
	style.content_margin_top = _ui_length(10.0)
	style.content_margin_bottom = _ui_length(10.0)
	return style


func _stack(expand: bool) -> VBoxContainer:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", int(round(_ui_length(10.0))))
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	if expand:
		box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return box


func _label(text_value: String, size: int, alignment: HorizontalAlignment, color: Color = Color.WHITE) -> Label:
	var label := Label.new()
	label.text = text_value
	label.horizontal_alignment = alignment
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_override("font", ARABIC_FONT)
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
	button.custom_minimum_size = Vector2(0, _ui_length(50.0))
	button.add_theme_font_override("font", ARABIC_FONT)
	button.add_theme_font_size_override("font_size", _ui_font_size(17))
	button.add_theme_color_override("font_color", foreground)
	button.add_theme_stylebox_override("normal", _button_style(background))
	button.add_theme_stylebox_override("hover", _button_style(background.lightened(0.10)))
	button.add_theme_stylebox_override("pressed", _button_style(background.darkened(0.12)))
	return button


func _button_style(background: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.set_corner_radius_all(int(round(_ui_length(14.0))))
	style.content_margin_left = _ui_length(14.0)
	style.content_margin_right = _ui_length(14.0)
	return style


func _spacer(height: float) -> Control:
	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(0, _ui_length(height))
	return spacer


func _apply_picker_font(picker: OptionButton) -> void:
	picker.layout_direction = Control.LAYOUT_DIRECTION_RTL
	picker.add_theme_font_override("font", ARABIC_FONT)
	picker.add_theme_font_size_override("font_size", _ui_font_size(16))
	var menu: PopupMenu = picker.get_popup()
	menu.add_theme_font_override("font", ARABIC_FONT)
	menu.add_theme_font_size_override("font_size", _ui_font_size(16))


func _publish_setup_metrics() -> void:
	if not OS.has_feature("web") or not showing or active_screen != "setup":
		return
	var arabic_ready: bool = ARABIC_FONT.has_char(0x0623) and ARABIC_FONT.has_char(0x0644) and ARABIC_FONT.has_char(0x064A)
	var card_width_css: float = card.size.x * canvas_scale
	var card_height_css: float = card.size.y * canvas_scale
	var body_font_css: float = float(_ui_font_size(17)) * canvas_scale
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakArabicFont='" + ("ready" if arabic_ready else "missing") + "';" +
		"document.body.dataset.yakolakSetupCardWidth='" + str(snappedf(card_width_css, 0.1)) + "';" +
		"document.body.dataset.yakolakSetupCardHeight='" + str(snappedf(card_height_css, 0.1)) + "';" +
		"document.body.dataset.yakolakSetupTextPx='" + str(snappedf(body_font_css, 0.1)) + "';",
		true
	)


func _active_count() -> int:
	var count: int = 0
	for seat: Dictionary in seats:
		if bool(seat["active"]):
			count += 1
	return count


func _add_player() -> void:
	var online_match: bool = _active_secondary_players_are_online()
	for index: int in range(seats.size()):
		var seat: Dictionary = seats[index]
		if not bool(seat["active"]):
			seat["active"] = true
			if index > 0 and online_match:
				seat["mode"] = "online"
			seats[index] = seat
			_show_setup()
			return


func _remove_player() -> void:
	for index: int in range(seats.size() - 1, 0, -1):
		var seat: Dictionary = seats[index]
		if bool(seat["active"]):
			seat["active"] = false
			seats[index] = seat
			_show_setup()
			return


func _on_color_selected(choice: int, seat_index: int) -> void:
	if choice < 0 or choice >= PALETTE.size() or seat_index < 0 or seat_index >= seats.size():
		return
	var requested: String = str(PALETTE[choice]["id"])
	var selected_seat: Dictionary = seats[seat_index]
	var previous: String = str(selected_seat["color"])
	if requested == previous:
		return
	for index: int in range(seats.size()):
		if index == seat_index:
			continue
		var other: Dictionary = seats[index]
		# Swap against inactive seats too.  Otherwise a colour chosen before
		# adding a player could reappear when that seat becomes active.
		if str(other["color"]) == requested:
			other["color"] = previous
			seats[index] = other
	selected_seat["color"] = requested
	seats[seat_index] = selected_seat
	_show_setup()


func _on_mode_selected(choice: int, seat_index: int) -> void:
	if choice < 0 or choice >= MODE_OPTIONS.size() or seat_index < 0 or seat_index >= seats.size():
		return
	var requested: String = str(MODE_OPTIONS[choice]["id"])
	var seat: Dictionary = seats[seat_index]
	seat["mode"] = requested
	seats[seat_index] = seat
	# The existing online protocol is a room-wide mode.  Keep the picker from
	# offering a mixed configuration that the server cannot actually play.
	# Local + bot remains freely mixable; choosing an invite makes every remote
	# seat an invite, and leaving invite mode returns the other seats to local.
	if requested == "online":
		for index: int in range(1, seats.size()):
			var other: Dictionary = seats[index]
			if bool(other["active"]):
				other["mode"] = "online"
				seats[index] = other
	else:
		for index: int in range(1, seats.size()):
			if index == seat_index:
				continue
			var other: Dictionary = seats[index]
			if bool(other["active"]) and str(other["mode"]) == "online":
				other["mode"] = "local"
				seats[index] = other
	_show_setup()


func _active_secondary_players_are_online() -> bool:
	var found: bool = false
	for index: int in range(1, seats.size()):
		var seat: Dictionary = seats[index]
		if not bool(seat["active"]):
			continue
		found = true
		if str(seat["mode"]) != "online":
			return false
	return found


func _on_rounds_selected(choice: int, picker: OptionButton) -> void:
	rounds = picker.get_item_id(choice)


func _emit_configuration() -> void:
	var players: Array[Dictionary] = []
	for index: int in range(seats.size()):
		var seat: Dictionary = seats[index]
		if not bool(seat["active"]):
			continue
		var palette: Dictionary = PALETTE[_palette_index(str(seat["color"]))]
		players.append({
			"seat": "p%d" % (players.size() + 1),
			"label": str(seat["label"]),
			"mode": "local" if players.is_empty() else str(seat["mode"]),
			"color": str(palette["id"]),
			"color_name": str(palette["name"]),
			"direction": str(palette["direction"]),
		})
	if players.is_empty():
		return
	root.visible = false
	showing = false
	_publish_setup_state("complete")
	configuration_ready.emit({"tutorial": tutorial_requested, "rounds": rounds, "players": players, "online_join_code": joining_room_code})


func show_online_error(error_code: String) -> void:
	showing = true
	root.visible = true
	joining_room_code = _room_code_from_url() if joining_room_code.is_empty() else joining_room_code
	online_error_text = "اللون محجوز، اختر لونًا آخر." if error_code == "color_taken" else "تعذر الاتصال. حاول مرة أخرى."
	_show_setup()
	if error_code == "color_taken" and not joining_room_code.is_empty():
		_request_room_preview(joining_room_code)


func show_setup_error(message: String) -> void:
	showing = true
	root.visible = true
	online_error_text = message
	_show_setup()


func _room_code_from_url() -> String:
	if not OS.has_feature("web"):
		return ""
	var value: Variant = JavaScriptBridge.eval("String(new URL(location.href).searchParams.get('room')||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6)", true)
	return str(value)


func _build_web_test_hook() -> void:
	if not OS.has_feature("web"):
		return
	web_start_callback = JavaScriptBridge.create_callback(_on_web_start_local)
	web_show_setup_callback = JavaScriptBridge.create_callback(_on_web_show_setup)
	var window: JavaScriptObject = JavaScriptBridge.get_interface("window")
	if window != null:
		window.set("yakolakTestStartLocal", web_start_callback)
		window.set("yakolakTestShowSetup", web_show_setup_callback)


func _on_web_show_setup(_arguments: Array) -> void:
	if showing:
		_open_setup(false)


func _on_web_start_local(_arguments: Array) -> void:
	if not showing:
		return
	root.visible = false
	showing = false
	_publish_setup_state("complete")
	configuration_ready.emit({
		"tutorial": false,
		"rounds": 3,
		"players": [
			{"seat": "p1", "label": "أنا", "mode": "local", "color": "marble", "color_name": "أبيض", "direction": "right"},
			{"seat": "p2", "label": "اللاعب 2", "mode": "bot", "color": "blue", "color_name": "أزرق", "direction": "back"},
		],
		"online_join_code": "",
	})


func _publish_setup_state(state: String) -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakSetup='" + state + "';", true)


func _palette_index(color_id: String) -> int:
	for index: int in range(PALETTE.size()):
		if str(PALETTE[index]["id"]) == color_id:
			return index
	return 0


func _palette_color(color_id: String) -> Color:
	return PALETTE[_palette_index(color_id)]["color"] as Color


func _mode_index(mode_id: String) -> int:
	for index: int in range(MODE_OPTIONS.size()):
		if str(MODE_OPTIONS[index]["id"]) == mode_id:
			return index
	return 0
