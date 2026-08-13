extends Node

# TURN-UI-08 / UX-TURN-35 / UX-TURN-37 / UX-TURN-38: exactly one compact top turn indicator.
# It consumes only the authoritative_turn_changed snapshot emitted by gameplay
# and never polls gameplay, camera, lighting, animation, or DOM state.
const Display = preload("res://scripts/ui_design.gd")
const INDICATOR_MIN_WIDTH: float = 56.0
const INDICATOR_MAX_WIDTH: float = 124.0
const INDICATOR_HEIGHT: float = 30.0
const INDICATOR_TOP_MIN: float = 12.0
const INDICATOR_SAFE_GAP: float = 8.0

var intro: Node3D
var gameplay: Node
var indicator_layer: CanvasLayer
var indicator_root: PanelContainer
var indicator_label: Label
var indicator_style: StyleBoxFlat
var indicator_width: float = INDICATOR_MIN_WIDTH
var indicator_color_key: String = ""
var indicator_local_turn: bool = false
var indicator_emphasis_key: String = ""
var indicator_owner_seat: String = ""
var indicator_remote_player_number: int = 0
var applied_revision: int = -1
var indicator_update_count: int = 0


func _ready() -> void:
	process_priority = 35
	set_process(false)
	intro = get_parent() as Node3D
	_build_indicator()
	call_deferred("_attach")


func _attach() -> void:
	if intro == null:
		intro = get_parent() as Node3D
	if intro == null:
		_hide_indicator(-1, "no-root")
		return
	gameplay = intro.get_node_or_null("PostIntroGameplay")
	if gameplay == null:
		_hide_indicator(-1, "no-gameplay")
		return
	_suppress_legacy_turn_surfaces_once()
	var callback := Callable(self, "_on_authoritative_turn_changed")
	if gameplay.has_signal("authoritative_turn_changed") and not gameplay.is_connected("authoritative_turn_changed", callback):
		gameplay.connect("authoritative_turn_changed", callback)
	if gameplay.has_method("authoritative_turn_snapshot"):
		var snapshot: Variant = gameplay.call("authoritative_turn_snapshot")
		if snapshot is Dictionary:
			_on_authoritative_turn_changed(snapshot as Dictionary)
	_publish_contract()


func _build_indicator() -> void:
	indicator_layer = CanvasLayer.new()
	indicator_layer.name = "AuthoritativeTurnIndicatorLayer"
	indicator_layer.layer = 22
	add_child(indicator_layer)

	indicator_style = StyleBoxFlat.new()
	indicator_style.bg_color = Color(0.035, 0.055, 0.062, 0.94)
	indicator_style.border_color = Color(1.0, 1.0, 1.0, 0.34)
	indicator_style.set_border_width_all(2)
	indicator_style.set_corner_radius_all(15)
	indicator_style.content_margin_left = 10.0
	indicator_style.content_margin_right = 10.0
	indicator_style.content_margin_top = 2.0
	indicator_style.content_margin_bottom = 2.0

	indicator_root = PanelContainer.new()
	indicator_root.name = "AuthoritativeTurnIndicator"
	indicator_root.anchor_left = 0.5
	indicator_root.anchor_right = 0.5
	indicator_root.anchor_top = 0.0
	indicator_root.anchor_bottom = 0.0
	indicator_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	indicator_root.add_theme_stylebox_override("panel", indicator_style)
	indicator_root.visible = false
	indicator_layer.add_child(indicator_root)

	indicator_label = Label.new()
	indicator_label.name = "TurnText"
	indicator_label.text = ""
	indicator_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	indicator_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	indicator_label.layout_direction = Control.LAYOUT_DIRECTION_RTL
	indicator_label.text_direction = Control.TEXT_DIRECTION_RTL
	indicator_label.language = "ar"
	indicator_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	indicator_label.clip_text = true
	indicator_label.add_theme_font_override("font", Display.FONT_MEDIUM)
	indicator_label.add_theme_font_size_override("font_size", 15)
	indicator_label.add_theme_color_override("font_color", Display.TEXT_PRIMARY)
	indicator_label.add_theme_color_override("font_outline_color", Color(0.0, 0.0, 0.0, 0.72))
	indicator_label.add_theme_constant_override("outline_size", 1)
	indicator_root.add_child(indicator_label)

	var viewport: Viewport = get_viewport()
	var layout_callback := Callable(self, "_layout_indicator")
	if not viewport.size_changed.is_connected(layout_callback):
		viewport.size_changed.connect(layout_callback)
	_layout_indicator()


func _suppress_legacy_turn_surfaces_once() -> void:
	var legacy_turn: Variant = gameplay.get("turn_label")
	if legacy_turn is Label:
		(legacy_turn as Label).visible = false
	var legacy_score: Variant = gameplay.get("score_label")
	if legacy_score is Label:
		(legacy_score as Label).visible = false


func _on_authoritative_turn_changed(snapshot: Dictionary) -> void:
	var revision: int = int(snapshot.get("revision", -1))
	if revision >= 0 and revision <= applied_revision:
		return
	applied_revision = revision
	indicator_update_count += 1
	if not bool(snapshot.get("valid", false)):
		_hide_indicator(revision, str(snapshot.get("lifecycle", "no-turn")))
		return

	var text: String = Display.display_text(_indicator_copy(snapshot))
	if text.is_empty():
		_hide_indicator(revision, "no-copy")
		return
	_apply_visual_state(snapshot)
	indicator_label.text = text
	indicator_width = clampf(26.0 + float(text.length()) * 8.2, INDICATOR_MIN_WIDTH, INDICATOR_MAX_WIDTH)
	_layout_indicator()
	indicator_root.visible = true
	_publish_state(true, text, snapshot)


func _apply_visual_state(snapshot: Dictionary) -> void:
	indicator_local_turn = bool(snapshot.get("local_turn", false))
	indicator_color_key = _indicator_color_key(snapshot)
	indicator_owner_seat = str(snapshot.get("seat", "")).strip_edges().to_lower()
	indicator_remote_player_number = 0
	indicator_style.set_border_width_all(2)

	# UX-TURN-37 changes one state only: an accepted authoritative local owner.
	# The existing capsule is inverted with shared design tokens so "دورك" wins
	# instantly by copy + contrast alone. There is no animation and no new HUD.
	if indicator_local_turn:
		indicator_emphasis_key = "local-semantic-contrast"
		indicator_style.border_color = Display.FOCUS_BORDER
		indicator_style.bg_color = Display.TEXT_PRIMARY
		indicator_label.add_theme_font_override("font", Display.FONT_BOLD)
		indicator_label.add_theme_color_override("font_color", Display.TEXT_DARK)
		indicator_label.add_theme_color_override("font_outline_color", Color(1.0, 1.0, 1.0, 0.0))
		indicator_label.add_theme_constant_override("outline_size", 0)
		return

	# UX-TURN-38: remote ownership is led by the stable authoritative seat label.
	# Player color remains a supporting border cue only; score/camera/light/tween
	# state is never consulted and therefore cannot replace the visible owner.
	indicator_remote_player_number = _remote_player_number(snapshot)
	indicator_emphasis_key = "remote-authoritative-owner"
	indicator_style.border_color = _indicator_cue_color(indicator_color_key)
	indicator_style.bg_color = Color(0.035, 0.055, 0.062, 0.94)
	indicator_label.add_theme_font_override("font", Display.FONT_BOLD)
	indicator_label.add_theme_color_override("font_color", Display.TEXT_PRIMARY)
	indicator_label.add_theme_color_override("font_outline_color", Color(0.0, 0.0, 0.0, 0.72))
	indicator_label.add_theme_constant_override("outline_size", 1)


func _indicator_color_key(snapshot: Dictionary) -> String:
	var key: String = str(snapshot.get("color", "")).strip_edges().to_lower()
	if key in ["marble", "blue", "gold", "green"]:
		return key
	return "neutral"


func _indicator_cue_color(key: String) -> Color:
	match key:
		"marble":
			return Color("#EEEAE0")
		"blue":
			return Color("#58A6FF")
		"gold":
			return Color("#E8BB55")
		"green":
			return Color("#4FD48A")
		_:
			return Color(1.0, 1.0, 1.0, 0.34)


func _indicator_copy(snapshot: Dictionary) -> String:
	if bool(snapshot.get("online", false)):
		if bool(snapshot.get("local_turn", false)):
			return "دورك"
		var number: int = _remote_player_number(snapshot)
		return "دور لاعب " + str(number) if number > 0 else ""
	var color_name: String = str(snapshot.get("color_name", ""))
	if not color_name.is_empty():
		return "دور " + color_name
	var fallback_number: int = int(snapshot.get("player_number", 0))
	return "دور لاعب " + str(fallback_number) if fallback_number > 0 else ""


func _remote_player_number(snapshot: Dictionary) -> int:
	# Online seat identity (p1, p2, ...) is stable across presentation motion and
	# is the same identity used by room authority. Array position is fallback only.
	var seat: String = str(snapshot.get("seat", "")).strip_edges().to_lower()
	if seat.begins_with("p") and seat.length() > 1:
		var suffix: String = seat.substr(1)
		if suffix.is_valid_int():
			var seat_number: int = int(suffix)
			if seat_number > 0:
				return seat_number
	return int(snapshot.get("player_number", 0))


func _hide_indicator(revision: int, lifecycle: String) -> void:
	if indicator_root != null:
		indicator_root.visible = false
	if indicator_label != null:
		indicator_label.text = ""
	indicator_color_key = ""
	indicator_local_turn = false
	indicator_emphasis_key = ""
	indicator_owner_seat = ""
	indicator_remote_player_number = 0
	_publish_hidden(revision, lifecycle)


func _layout_indicator() -> void:
	if indicator_root == null:
		return
	var top: float = maxf(INDICATOR_TOP_MIN, _safe_area_top() + INDICATOR_SAFE_GAP)
	indicator_root.offset_left = -indicator_width * 0.5
	indicator_root.offset_right = indicator_width * 0.5
	indicator_root.offset_top = top
	indicator_root.offset_bottom = top + INDICATOR_HEIGHT
	_publish_layout(top)


func _safe_area_top() -> float:
	var safe_top: float = 0.0
	var safe_rect: Rect2i = DisplayServer.get_display_safe_area()
	if safe_rect.position.y > 0:
		safe_top = float(safe_rect.position.y)
	if OS.has_feature("web"):
		var css_value: Variant = JavaScriptBridge.eval(
			"(()=>{const e=document.createElement('div');e.style.cssText='position:fixed;top:0;padding-top:env(safe-area-inset-top);visibility:hidden;pointer-events:none';document.body.appendChild(e);const v=parseFloat(getComputedStyle(e).paddingTop)||0;e.remove();return v;})()",
			true
		)
		if css_value != null:
			safe_top = maxf(safe_top, float(css_value))
	return safe_top


func _publish_contract() -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakTurnHud='authoritative-top';" +
		"document.body.dataset.yakolakTurnIndicatorContract='pass';" +
		"document.body.dataset.yakolakTurnIndicatorSource='authoritative-turn-signal';" +
		"document.body.dataset.yakolakTurnIndicatorPolling='none';" +
		"document.body.dataset.yakolakTurnIndicatorDigits='western-0-9';" +
		"document.body.dataset.yakolakTurnIndicatorOneGlance='copy+player-color';" +
		"document.body.dataset.yakolakTurnIndicatorLocalCue='semantic-copy+inverted-design-tokens';" +
		"document.body.dataset.yakolakTurnIndicatorRemoteOwnerSource='authoritative-seat';" +
		"document.body.dataset.yakolakTurnIndicatorRemoteColorRole='supporting-cue';" +
		"document.body.dataset.yakolakTurnIndicatorMotion='none';" +
		"document.body.dataset.yakolakTurnIndicatorStalePolicy='monotonic-revision';" +
		"document.body.dataset.yakolakTurnFocus='removed';",
		true
	)


func _publish_state(visible: bool, text: String, snapshot: Dictionary) -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakTurnIndicatorVisible='%s';" % ("true" if visible else "false") +
		"document.body.dataset.yakolakTurnIndicatorText='%s';" % _js(text) +
		"document.body.dataset.yakolakTurnIndicatorPlayer='%d';" % int(snapshot.get("player_number", 0)) +
		"document.body.dataset.yakolakTurnIndicatorSeat='%s';" % _js(indicator_owner_seat) +
		"document.body.dataset.yakolakTurnIndicatorRemotePlayer='%d';" % indicator_remote_player_number +
		"document.body.dataset.yakolakTurnIndicatorColor='%s';" % _js(indicator_color_key) +
		"document.body.dataset.yakolakTurnIndicatorLocal='%s';" % ("true" if indicator_local_turn else "false") +
		"document.body.dataset.yakolakTurnIndicatorEmphasis='%s';" % _js(indicator_emphasis_key) +
		"document.body.dataset.yakolakTurnIndicatorLifecycle='%s';" % _js(str(snapshot.get("lifecycle", ""))) +
		"document.body.dataset.yakolakTurnIndicatorRevision='%d';" % applied_revision +
		"document.body.dataset.yakolakTurnIndicatorUpdates='%d';" % indicator_update_count,
		true
	)


func _publish_hidden(revision: int, lifecycle: String) -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakTurnIndicatorVisible='false';" +
		"document.body.dataset.yakolakTurnIndicatorText='';" +
		"document.body.dataset.yakolakTurnIndicatorPlayer='0';" +
		"document.body.dataset.yakolakTurnIndicatorSeat='';" +
		"document.body.dataset.yakolakTurnIndicatorRemotePlayer='0';" +
		"document.body.dataset.yakolakTurnIndicatorColor='';" +
		"document.body.dataset.yakolakTurnIndicatorLocal='false';" +
		"document.body.dataset.yakolakTurnIndicatorEmphasis='';" +
		"document.body.dataset.yakolakTurnIndicatorLifecycle='%s';" % _js(lifecycle) +
		"document.body.dataset.yakolakTurnIndicatorRevision='%d';" % revision +
		"document.body.dataset.yakolakTurnIndicatorUpdates='%d';" % indicator_update_count,
		true
	)


func _publish_layout(top: float) -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakTurnIndicatorTop='%.1f';" % top +
		"document.body.dataset.yakolakTurnIndicatorWidth='%.1f';" % indicator_width +
		"document.body.dataset.yakolakTurnIndicatorHeight='%.1f';" % INDICATOR_HEIGHT +
		"document.body.dataset.yakolakTurnIndicatorPointer='ignore';" +
		"document.body.dataset.yakolakTurnIndicatorOverlay='true';",
		true
	)


func _js(value: String) -> String:
	return value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ").replace("\r", " ")
