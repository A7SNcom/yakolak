extends Node

# Match-state HUD: one compact glance should answer four questions without
# competing with the physical board: whose turn, which colour, which piece
# sizes are currently playable, and what action is possible now.
const THMANYAH_REGULAR = preload("res://assets/fonts/thmanyahsans-Regular.otf")
const THMANYAH_MEDIUM = preload("res://assets/fonts/thmanyahsans-Medium.otf")
const THMANYAH_BOLD = preload("res://assets/fonts/thmanyahsans-Bold.otf")

const PLAYER_COLORS: Dictionary = {
	"marble": Color("#eeeae0"),
	"blue": Color("#3e72e6"),
	"gold": Color("#d9a34a"),
	"green": Color("#20a77d"),
}
const SIZE_ORDER: Array[String] = ["large", "medium", "small"]
const SIZE_DIAMETERS: Dictionary = {"large": 20.0, "medium": 15.0, "small": 10.0}
const ACTION_TEXT: Dictionary = {
	"choose": "اختر قطعة",
	"place": "ضعها",
	"placing": "تُوضَع…",
	"turn-transition": "استعد",
	"submitting": "إرسال…",
	"bot-thinking": "يفكر…",
	"waiting": "انتظر",
	"round-prep": "تجهيز الجولة",
	"tutorial": "شاهد المثال",
	"round-complete": "انتهت الجولة",
	"match-complete": "انتهت المباراة",
	"room-ended": "انتهت الغرفة",
	"readying": "استعد",
}

var gameplay: Node
var hud_layer: CanvasLayer
var hud_root: Control
var card: PanelContainer
var content: VBoxContainer
var header: HBoxContainer
var color_swatch: Panel
var player_label: Label
var action_chip: PanelContainer
var action_label: Label
var pieces_row: HBoxContainer
var indicator_tokens: Dictionary = {}
var indicator_counts: Dictionary = {}
var last_state_key: String = ""
var next_sync_msec: int = 0


func _ready() -> void:
	if not get_viewport().size_changed.is_connected(_on_viewport_resized):
		get_viewport().size_changed.connect(_on_viewport_resized)
	call_deferred("_attach")


func _process(_delta: float) -> void:
	if gameplay == null:
		_attach()
	if gameplay == null:
		return
	# The legacy banner is re-enabled by its own process every frame. Suppress it
	# after that process so only one turn hierarchy is ever visible.
	_suppress_legacy_hud()
	var now: int = Time.get_ticks_msec()
	if now < next_sync_msec:
		return
	next_sync_msec = now + 60
	_sync(false)


func _attach() -> void:
	gameplay = get_parent().get_node_or_null("PostIntroGameplay")
	if gameplay == null:
		return
	if hud_layer == null:
		_build_hud()
	_layout_hud()
	_run_state_matrix_test()
	_sync(true)


func _build_hud() -> void:
	hud_layer = CanvasLayer.new()
	hud_layer.layer = 24
	add_child(hud_layer)

	hud_root = Control.new()
	hud_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hud_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud_layer.add_child(hud_root)

	card = PanelContainer.new()
	card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud_root.add_child(card)

	content = VBoxContainer.new()
	content.layout_direction = Control.LAYOUT_DIRECTION_RTL
	card.add_child(content)

	header = HBoxContainer.new()
	header.add_theme_constant_override("separation", int(round(_u(8.0))))
	content.add_child(header)

	color_swatch = Panel.new()
	color_swatch.custom_minimum_size = Vector2(_u(17.0), _u(17.0))
	color_swatch.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	header.add_child(color_swatch)

	player_label = Label.new()
	player_label.layout_direction = Control.LAYOUT_DIRECTION_RTL
	player_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	player_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	player_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	player_label.clip_text = true
	player_label.add_theme_font_override("font", THMANYAH_BOLD)
	player_label.add_theme_color_override("font_color", Color("#f7faf9"))
	header.add_child(player_label)

	action_chip = PanelContainer.new()
	action_chip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	header.add_child(action_chip)
	action_label = Label.new()
	action_label.layout_direction = Control.LAYOUT_DIRECTION_RTL
	action_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	action_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	action_label.add_theme_font_override("font", THMANYAH_MEDIUM)
	action_label.add_theme_color_override("font_color", Color.WHITE)
	action_chip.add_child(action_label)

	pieces_row = HBoxContainer.new()
	pieces_row.alignment = BoxContainer.ALIGNMENT_END
	pieces_row.add_theme_constant_override("separation", int(round(_u(12.0))))
	content.add_child(pieces_row)
	for size_name: String in SIZE_ORDER:
		_build_piece_indicator(size_name)

	card.visible = false


func _build_piece_indicator(size_name: String) -> void:
	var holder := HBoxContainer.new()
	holder.alignment = BoxContainer.ALIGNMENT_CENTER
	holder.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	holder.add_theme_constant_override("separation", int(round(_u(4.0))))
	pieces_row.add_child(holder)

	var token := Panel.new()
	var diameter: float = float(SIZE_DIAMETERS[size_name])
	token.custom_minimum_size = Vector2(_u(diameter), _u(diameter))
	token.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	holder.add_child(token)
	indicator_tokens[size_name] = token

	var count := Label.new()
	count.text = "0"
	count.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	count.add_theme_font_override("font", THMANYAH_MEDIUM)
	count.add_theme_color_override("font_color", Color("#f1f5f4"))
	holder.add_child(count)
	indicator_counts[size_name] = count


func _on_viewport_resized() -> void:
	if card == null or gameplay == null:
		return
	_layout_hud()
	_sync(true)


func _layout_hud() -> void:
	if card == null:
		return
	var viewport: Vector2 = get_viewport().get_visible_rect().size
	var margin: float = _u(12.0)
	var available: float = maxf(_u(180.0), viewport.x - _u(76.0))
	var width: float = minf(_u(318.0), available)
	var height: float = _u(82.0)
	card.custom_minimum_size = Vector2(width, height)
	card.position = Vector2(maxf(margin, viewport.x - width - margin), _u(12.0))
	card.size = Vector2(width, height)
	content.add_theme_constant_override("separation", int(round(_u(7.0))))
	header.add_theme_constant_override("separation", int(round(_u(8.0))))
	pieces_row.add_theme_constant_override("separation", int(round(_u(12.0))))
	color_swatch.custom_minimum_size = Vector2(_u(17.0), _u(17.0))
	player_label.add_theme_font_size_override("font_size", _font(17))
	action_label.add_theme_font_size_override("font_size", _font(14))
	for size_name: String in SIZE_ORDER:
		var token := indicator_tokens[size_name] as Panel
		var diameter: float = float(SIZE_DIAMETERS[size_name])
		token.custom_minimum_size = Vector2(_u(diameter), _u(diameter))
		var count := indicator_counts[size_name] as Label
		count.add_theme_font_size_override("font_size", _font(13))


func _u(css_pixels: float) -> float:
	if gameplay != null and gameplay.has_method("_hud_length"):
		return float(gameplay.call("_hud_length", css_pixels))
	return css_pixels


func _font(css_points: int) -> int:
	if gameplay != null and gameplay.has_method("_hud_font_size"):
		return int(gameplay.call("_hud_font_size", css_points))
	return css_points


func _suppress_legacy_hud() -> void:
	var legacy_turn: Variant = gameplay.get("turn_label")
	if legacy_turn is Label:
		(legacy_turn as Label).visible = false
	var legacy_score: Variant = gameplay.get("score_label")
	if legacy_score is Label:
		(legacy_score as Label).visible = false


func _sync(force: bool) -> void:
	if card == null:
		return
	var state: Dictionary = _derive_state()
	if not bool(state.get("visible", false)):
		card.visible = false
		last_state_key = "hidden"
		_publish_state(state)
		return

	var availability: Dictionary = _piece_availability(str(state.get("direction", "")))
	var selected_size: String = _selected_size()
	var key: String = "%s|%s|%s|%s|%d|%d|%d" % [
		str(state.get("action", "")),
		str(state.get("player_text", "")),
		str(state.get("color", "")),
		selected_size,
		int((availability.get("large", {}) as Dictionary).get("available", 0)),
		int((availability.get("medium", {}) as Dictionary).get("available", 0)),
		int((availability.get("small", {}) as Dictionary).get("available", 0)),
	]
	if not force and key == last_state_key:
		return
	last_state_key = key
	card.visible = true
	player_label.text = str(state.get("player_text", ""))
	action_label.text = str(ACTION_TEXT.get(str(state.get("action", "readying")), "استعد"))
	var no_turn: bool = bool(state.get("no_turn", false))
	color_swatch.visible = not no_turn
	pieces_row.visible = not no_turn
	var accent: Color = PLAYER_COLORS.get(str(state.get("color", "")), Color("#d7dfdd")) as Color
	_apply_card_style(accent, no_turn)
	if not no_turn:
		for size_name: String in SIZE_ORDER:
			var item: Dictionary = availability.get(size_name, {}) as Dictionary
			_update_piece_indicator(size_name, int(item.get("available", 0)), bool(item.get("legal", false)), selected_size == size_name, accent)
	_publish_state(state, availability, selected_size)


func _derive_state() -> Dictionary:
	var initialized: bool = _flag("match_initialized")
	if not initialized:
		return {"visible": false, "action": "hidden"}
	if _flag("online_active") and _flag("online_waiting"):
		# The dedicated room overlay owns this pre-match state; showing a turn
		# card here would falsely imply that somebody can already play.
		return {"visible": false, "action": "online-waiting"}

	var player: Dictionary = _current_player_data()
	var mode: String = str(player.get("mode", "local"))
	var selected: int = int(gameplay.get("selected_index"))
	var flags: Dictionary = {
		"cancelled": _flag("online_cancelled"),
		"match_complete": _flag("match_complete"),
		"round_complete": _flag("round_complete"),
		"tutorial": _flag("tutorial_showcase_running"),
		"action_in_progress": _flag("action_in_progress"),
		"move_active": _flag("move_active"),
		"camera_transition": _flag("camera_transition"),
		"submitting": _flag("online_active") and mode == "local" and not _flag("gameplay_ready") and selected >= 0,
		"mode": mode,
		"selected": selected >= 0,
		"ready": _flag("gameplay_ready"),
	}
	var action: String = _action_key_from_flags(flags)
	var no_turn: bool = action in ["tutorial", "round-complete", "match-complete", "room-ended"]
	var color_key: String = str(player.get("color", ""))
	var color_name: String = str(player.get("color_name", color_key))
	var label: String = str(player.get("label", color_name))
	var player_text: String
	if action == "tutorial":
		player_text = "شرح اللعبة"
	elif no_turn:
		player_text = "لا يوجد دور"
	else:
		player_text = "دور %s · %s" % [label, color_name]
	return {
		"visible": true,
		"action": action,
		"no_turn": no_turn,
		"player_text": player_text,
		"player_label": label,
		"color": color_key,
		"color_name": color_name,
		"direction": str(player.get("direction", "")),
	}


func _action_key_from_flags(flags: Dictionary) -> String:
	if bool(flags.get("cancelled", false)):
		return "room-ended"
	if bool(flags.get("match_complete", false)):
		return "match-complete"
	if bool(flags.get("round_complete", false)):
		return "round-complete"
	if bool(flags.get("tutorial", false)):
		return "tutorial"
	if bool(flags.get("action_in_progress", false)):
		return "round-prep"
	if bool(flags.get("move_active", false)):
		return "placing"
	if bool(flags.get("camera_transition", false)):
		return "turn-transition"
	if bool(flags.get("submitting", false)):
		return "submitting"
	var mode: String = str(flags.get("mode", "local"))
	if mode == "bot":
		return "bot-thinking"
	if mode == "online":
		return "waiting"
	if bool(flags.get("selected", false)):
		return "place"
	if bool(flags.get("ready", false)):
		return "choose"
	return "readying"


func _current_player_data() -> Dictionary:
	var players_value: Variant = gameplay.get("players")
	if not (players_value is Array):
		return {}
	var current_players: Array = players_value as Array
	var index: int = int(gameplay.get("current_player_index"))
	if index < 0 or index >= current_players.size():
		return {}
	var value: Variant = current_players[index]
	return value as Dictionary if value is Dictionary else {}


func _piece_availability(direction: String) -> Dictionary:
	var result: Dictionary = {
		"large": {"remaining": 0, "available": 0, "legal": false},
		"medium": {"remaining": 0, "available": 0, "legal": false},
		"small": {"remaining": 0, "available": 0, "legal": false},
	}
	var records_value: Variant = gameplay.get("piece_records")
	if not (records_value is Array):
		return result
	for value: Variant in records_value as Array:
		if not (value is Dictionary):
			continue
		var record: Dictionary = value as Dictionary
		if bool(record.get("played", false)) or str(record.get("dir", "")) != direction:
			continue
		var size_name: String = str(record.get("type", ""))
		if not result.has(size_name):
			continue
		var entry: Dictionary = result[size_name] as Dictionary
		entry["remaining"] = int(entry.get("remaining", 0)) + 1
		result[size_name] = entry
	for size_name: String in SIZE_ORDER:
		var entry: Dictionary = result[size_name] as Dictionary
		var remaining: int = int(entry.get("remaining", 0))
		var legal: bool = remaining > 0
		if legal and gameplay.has_method("_has_legal_cell_for_size"):
			legal = bool(gameplay.call("_has_legal_cell_for_size", size_name))
		entry["legal"] = legal
		entry["available"] = remaining if legal else 0
		result[size_name] = entry
	return result


func _selected_size() -> String:
	var index: int = int(gameplay.get("selected_index"))
	var records_value: Variant = gameplay.get("piece_records")
	if index < 0 or not (records_value is Array):
		return ""
	var records: Array = records_value as Array
	if index >= records.size() or not (records[index] is Dictionary):
		return ""
	return str((records[index] as Dictionary).get("type", ""))


func _flag(property_name: String) -> bool:
	var value: Variant = gameplay.get(property_name)
	return bool(value) if value != null else false


func _apply_card_style(accent: Color, neutral: bool) -> void:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.025, 0.043, 0.052, 0.90)
	style.border_color = Color(0.86, 0.94, 0.94, 0.18) if neutral else Color(accent, 0.88)
	style.set_border_width_all(maxi(1, int(round(_u(1.0)))))
	style.set_border_width(SIDE_RIGHT, max(2, int(round(_u(4.0)))))
	style.set_corner_radius_all(int(round(_u(16.0))))
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.28)
	style.shadow_size = int(round(_u(9.0)))
	style.shadow_offset = Vector2(0.0, _u(3.0))
	style.content_margin_left = _u(12.0)
	style.content_margin_right = _u(12.0)
	style.content_margin_top = _u(9.0)
	style.content_margin_bottom = _u(8.0)
	card.add_theme_stylebox_override("panel", style)

	var chip_style := StyleBoxFlat.new()
	chip_style.bg_color = Color(1.0, 1.0, 1.0, 0.09)
	chip_style.set_corner_radius_all(int(round(_u(10.0))))
	chip_style.content_margin_left = _u(9.0)
	chip_style.content_margin_right = _u(9.0)
	chip_style.content_margin_top = _u(3.0)
	chip_style.content_margin_bottom = _u(3.0)
	action_chip.add_theme_stylebox_override("panel", chip_style)

	if not neutral:
		var swatch_style := StyleBoxFlat.new()
		swatch_style.bg_color = accent
		swatch_style.border_color = Color.WHITE
		swatch_style.set_border_width_all(maxi(1, int(round(_u(1.0)))))
		swatch_style.set_corner_radius_all(int(round(_u(9.0))))
		color_swatch.add_theme_stylebox_override("panel", swatch_style)


func _update_piece_indicator(size_name: String, available: int, legal: bool, selected: bool, accent: Color) -> void:
	var token := indicator_tokens[size_name] as Panel
	var count := indicator_counts[size_name] as Label
	count.text = str(available)
	count.modulate = Color.WHITE if legal else Color(1.0, 1.0, 1.0, 0.38)
	var style := StyleBoxFlat.new()
	if selected:
		style.bg_color = Color(accent, 0.96)
		style.border_color = Color.WHITE
	elif legal:
		style.bg_color = Color(accent, 0.22)
		style.border_color = Color(accent, 0.96)
	else:
		style.bg_color = Color(1.0, 1.0, 1.0, 0.04)
		style.border_color = Color(1.0, 1.0, 1.0, 0.16)
	style.set_border_width_all(maxi(1, int(round(_u(1.5 if selected else 1.0)))))
	var diameter: float = float(SIZE_DIAMETERS[size_name])
	style.set_corner_radius_all(int(round(_u(diameter * 0.5))))
	token.add_theme_stylebox_override("panel", style)


func _publish_state(state: Dictionary, availability: Dictionary = {}, selected_size: String = "") -> void:
	if not OS.has_feature("web"):
		return
	var visible: bool = bool(state.get("visible", false)) and card != null and card.visible
	var action: String = str(state.get("action", "hidden"))
	var no_turn: bool = bool(state.get("no_turn", false))
	var large: Dictionary = availability.get("large", {}) as Dictionary
	var medium: Dictionary = availability.get("medium", {}) as Dictionary
	var small: Dictionary = availability.get("small", {}) as Dictionary
	var viewport: Vector2 = get_viewport().get_visible_rect().size
	var area_ratio: float = 0.0
	if visible and viewport.x > 0.0 and viewport.y > 0.0:
		area_ratio = (card.size.x * card.size.y) / (viewport.x * viewport.y)
	var scale_value: Variant = gameplay.get("hud_canvas_scale")
	var canvas_scale: float = float(scale_value) if scale_value != null else 1.0
	var guess_free: bool = true
	if visible and not no_turn:
		guess_free = not str(state.get("player_label", "")).is_empty() and not str(state.get("color_name", "")).is_empty() and not action.is_empty()
	var script: String = (
		"document.body.dataset.yakolakTurnHud='%s';" % ("visible" if visible else "hidden") +
		"document.body.dataset.yakolakTurnHudState='%s';" % _js(action) +
		"document.body.dataset.yakolakTurnHudPlayer='%s';" % _js(str(state.get("player_label", ""))) +
		"document.body.dataset.yakolakTurnHudPlayerText='%s';" % _js(str(state.get("player_text", ""))) +
		"document.body.dataset.yakolakTurnHudColor='%s';" % _js(str(state.get("color", ""))) +
		"document.body.dataset.yakolakTurnHudColorName='%s';" % _js(str(state.get("color_name", ""))) +
		"document.body.dataset.yakolakTurnHudSelectedSize='%s';" % _js(selected_size) +
		"document.body.dataset.yakolakTurnHudLarge='%d';" % int(large.get("available", 0)) +
		"document.body.dataset.yakolakTurnHudMedium='%d';" % int(medium.get("available", 0)) +
		"document.body.dataset.yakolakTurnHudSmall='%d';" % int(small.get("available", 0)) +
		"document.body.dataset.yakolakTurnHudLargeLegal='%s';" % ("true" if bool(large.get("legal", false)) else "false") +
		"document.body.dataset.yakolakTurnHudMediumLegal='%s';" % ("true" if bool(medium.get("legal", false)) else "false") +
		"document.body.dataset.yakolakTurnHudSmallLegal='%s';" % ("true" if bool(small.get("legal", false)) else "false") +
		"document.body.dataset.yakolakTurnHudNoGuess='%s';" % ("true" if guess_free else "false") +
		"document.body.dataset.yakolakTurnHudAreaRatio='%.5f';" % area_ratio +
		"document.body.dataset.yakolakTurnHudWidthPx='%.1f';" % (card.size.x * canvas_scale if card != null else 0.0) +
		"document.body.dataset.yakolakTurnHudHeightPx='%.1f';" % (card.size.y * canvas_scale if card != null else 0.0) +
		"window.__yakolakTurnHudHistory=window.__yakolakTurnHudHistory||[];" +
		"if(window.__yakolakTurnHudHistory.at(-1)!=='%s'){window.__yakolakTurnHudHistory.push('%s');if(window.__yakolakTurnHudHistory.length>40)window.__yakolakTurnHudHistory.shift();}" % [_js(action), _js(action)]
	)
	JavaScriptBridge.eval(script, true)


func _run_state_matrix_test() -> void:
	if not OS.has_feature("web"):
		return
	var cases: Array[Dictionary] = [
		{"flags": {"cancelled": true}, "want": "room-ended"},
		{"flags": {"match_complete": true}, "want": "match-complete"},
		{"flags": {"round_complete": true}, "want": "round-complete"},
		{"flags": {"tutorial": true}, "want": "tutorial"},
		{"flags": {"action_in_progress": true}, "want": "round-prep"},
		{"flags": {"move_active": true}, "want": "placing"},
		{"flags": {"camera_transition": true}, "want": "turn-transition"},
		{"flags": {"submitting": true}, "want": "submitting"},
		{"flags": {"mode": "bot"}, "want": "bot-thinking"},
		{"flags": {"mode": "online"}, "want": "waiting"},
		{"flags": {"mode": "local", "selected": true}, "want": "place"},
		{"flags": {"mode": "local", "ready": true}, "want": "choose"},
		{"flags": {"mode": "local"}, "want": "readying"},
	]
	var failures: Array[String] = []
	for test_case: Dictionary in cases:
		var actual: String = _action_key_from_flags(test_case["flags"] as Dictionary)
		var wanted: String = str(test_case["want"])
		if actual != wanted:
			failures.append("%s!=%s" % [actual, wanted])
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakTurnHudMatrix='%s';document.body.dataset.yakolakTurnHudMatrixCount='%d';" % ["pass" if failures.is_empty() else _js(",".join(failures)), cases.size()],
		true
	)


func _js(value: String) -> String:
	return value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ")
