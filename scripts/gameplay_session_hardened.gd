extends "res://scripts/gameplay_session_resilient.gd"

# Online gameplay hardening: waiting for players is a distinct, unmistakable
# state. The physical board stays visible, but it is blocked until the
# authoritative room reaches `playing`.

var waiting_layer: CanvasLayer
var waiting_root: Control
var waiting_card: PanelContainer
var waiting_room_label: Label
var waiting_title_label: Label
var waiting_progress_label: Label
var waiting_exit_button: Button
var waiting_state_key: String = ""


func _ready() -> void:
	super._ready()
	_build_waiting_overlay()
	if not get_viewport().size_changed.is_connected(_layout_waiting_overlay):
		get_viewport().size_changed.connect(_layout_waiting_overlay)
	_sync_waiting_overlay()


func _process(delta: float) -> void:
	super._process(delta)
	_sync_waiting_overlay()


func _build_waiting_overlay() -> void:
	if waiting_layer != null:
		return
	waiting_layer = CanvasLayer.new()
	waiting_layer.layer = 35
	add_child(waiting_layer)

	waiting_root = Control.new()
	waiting_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	waiting_root.mouse_filter = Control.MOUSE_FILTER_STOP
	waiting_root.visible = false
	waiting_layer.add_child(waiting_root)

	waiting_card = PanelContainer.new()
	waiting_card.mouse_filter = Control.MOUSE_FILTER_STOP
	waiting_card.add_theme_stylebox_override("panel", _waiting_card_style())
	waiting_root.add_child(waiting_card)

	var content := VBoxContainer.new()
	content.alignment = BoxContainer.ALIGNMENT_CENTER
	content.add_theme_constant_override("separation", int(round(_hud_length(7.0))))
	waiting_card.add_child(content)

	waiting_room_label = _waiting_label("", 16, THMANYAH_MEDIUM, Color("#cbd7d9"))
	content.add_child(waiting_room_label)
	waiting_title_label = _waiting_label("بانتظار اللاعبين", 23, THMANYAH_BOLD, Color.WHITE)
	content.add_child(waiting_title_label)
	waiting_progress_label = _waiting_label("", 18, THMANYAH_MEDIUM, Color("#f2f0e9"))
	content.add_child(waiting_progress_label)

	waiting_exit_button = Button.new()
	waiting_exit_button.text = "خروج"
	waiting_exit_button.layout_direction = Control.LAYOUT_DIRECTION_RTL
	waiting_exit_button.focus_mode = Control.FOCUS_NONE
	waiting_exit_button.custom_minimum_size = Vector2(_hud_length(112.0), _hud_length(40.0))
	waiting_exit_button.add_theme_font_override("font", THMANYAH_MEDIUM)
	waiting_exit_button.add_theme_font_size_override("font_size", _hud_font_size(14))
	waiting_exit_button.add_theme_color_override("font_color", Color("#f4f7f6"))
	waiting_exit_button.add_theme_stylebox_override("normal", _waiting_button_style(Color(1.0, 1.0, 1.0, 0.07)))
	waiting_exit_button.add_theme_stylebox_override("hover", _waiting_button_style(Color(1.0, 1.0, 1.0, 0.12)))
	waiting_exit_button.add_theme_stylebox_override("pressed", _waiting_button_style(Color(1.0, 1.0, 1.0, 0.05)))
	waiting_exit_button.pressed.connect(_waiting_exit)
	content.add_child(waiting_exit_button)
	_layout_waiting_overlay()


func _waiting_label(text_value: String, size: int, font: Font, color: Color) -> Label:
	var label := Label.new()
	label.text = text_value
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.layout_direction = Control.LAYOUT_DIRECTION_RTL
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.add_theme_font_override("font", font)
	label.add_theme_font_size_override("font_size", _hud_font_size(size))
	label.add_theme_color_override("font_color", color)
	return label


func _waiting_card_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.035, 0.055, 0.067, 0.94)
	style.border_color = Color(0.85, 0.94, 0.95, 0.22)
	style.set_border_width_all(1)
	style.set_corner_radius_all(int(round(_hud_length(18.0))))
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.34)
	style.shadow_size = int(round(_hud_length(16.0)))
	style.shadow_offset = Vector2(0.0, _hud_length(6.0))
	style.content_margin_left = _hud_length(18.0)
	style.content_margin_right = _hud_length(18.0)
	style.content_margin_top = _hud_length(14.0)
	style.content_margin_bottom = _hud_length(14.0)
	return style


func _waiting_button_style(background: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.set_corner_radius_all(int(round(_hud_length(11.0))))
	return style


func _layout_waiting_overlay() -> void:
	if waiting_card == null:
		return
	var viewport: Vector2 = get_viewport().get_visible_rect().size
	var width: float = minf(_hud_length(360.0), maxf(_hud_length(280.0), viewport.x - _hud_length(24.0)))
	var height: float = _hud_length(174.0)
	waiting_card.position = Vector2(maxf(0.0, (viewport.x - width) * 0.5), _hud_length(18.0))
	waiting_card.size = Vector2(width, height)
	waiting_card.add_theme_stylebox_override("panel", _waiting_card_style())


func _waiting_exit() -> void:
	_return_to_setup()


func _waiting_room_code() -> String:
	var code: String = str(online_identity.get("code", ""))
	if not code.is_empty():
		return code
	if online != null:
		var online_room_value: Variant = online.get("room")
		if online_room_value is Dictionary:
			code = str((online_room_value as Dictionary).get("code", ""))
	return code


func _waiting_target_count() -> int:
	if online_target_players > 0:
		return online_target_players
	var configured: Array = pending_online_configuration.get("players", []) as Array
	return configured.size()


func _arabize_waiting(value: String) -> String:
	var result: String = value
	var western: Array[String] = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]
	var arabic: Array[String] = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"]
	for index: int in range(10):
		result = result.replace(western[index], arabic[index])
	return result


func _sync_waiting_overlay() -> void:
	if waiting_root == null:
		return
	var should_show: bool = online_active and online_waiting
	waiting_root.visible = should_show
	if not should_show:
		if waiting_state_key != "hidden":
			waiting_state_key = "hidden"
			if OS.has_feature("web"):
				JavaScriptBridge.eval(
					"document.body.dataset.yakolakOnlineWaiting='hidden';" +
					"delete document.body.dataset.yakolakOnlineWaitingJoined;" +
					"delete document.body.dataset.yakolakOnlineWaitingTarget;" +
					"delete document.body.dataset.yakolakOnlineWaitingCode;",
					true
				)
		return

	var code: String = _waiting_room_code()
	var joined: int = players.size()
	var target: int = maxi(_waiting_target_count(), joined)
	waiting_room_label.text = "تجهيز الغرفة…" if code.is_empty() else "الغرفة " + _arabize_waiting(code)
	waiting_title_label.text = "بانتظار اللاعبين"
	waiting_progress_label.text = _arabize_waiting("%d / %d" % [joined, target]) if target > 0 else "…"
	var key: String = "%s:%d:%d" % [code, joined, target]
	if key == waiting_state_key:
		return
	waiting_state_key = key
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakOnlineWaiting='visible';" +
			"document.body.dataset.yakolakOnlineWaitingJoined='" + str(joined) + "';" +
			"document.body.dataset.yakolakOnlineWaitingTarget='" + str(target) + "';" +
			"document.body.dataset.yakolakOnlineWaitingCode='" + code + "';",
			true
		)


func _sync_hud_visibility() -> void:
	super._sync_hud_visibility()
	if online_active and online_waiting:
		if turn_label != null:
			turn_label.visible = false
		if OS.has_feature("web"):
			JavaScriptBridge.eval("document.body.dataset.yakolakHudVisibility='waiting';", true)


func _sync_quick_menu() -> void:
	super._sync_quick_menu()
	if quick_round_button != null and online_active and round_complete and not match_complete and not online_cancelled:
		quick_round_button.visible = false
		_layout_quick_menu()
	if online_active and online_waiting:
		if quick_button != null:
			quick_button.visible = false
		if quick_panel != null:
			quick_panel.visible = false
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakOnlineRoundAction='" +
			("automatic" if online_active and round_complete and not match_complete and not online_cancelled else "manual") + "';",
			true
		)
