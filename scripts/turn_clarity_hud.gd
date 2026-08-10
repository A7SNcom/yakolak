extends Node

# Turn clarity is communicated in the 3D scene, not with a redundant HUD card.
# The active player's physical base gets a localized, soft light so the player
# can understand whose turn it is without reading labels or inventory counts.
const PLAYER_COLORS: Dictionary = {
	"marble": Color("#ffffff"),
	"blue": Color("#3e72e6"),
	"gold": Color("#d9a34a"),
	"green": Color("#20a77d"),
}
const DIRECTION_VECTORS: Dictionary = {
	"right": Vector3(1.0, 0.0, 0.0),
	"back": Vector3(0.0, 0.0, -1.0),
	"left": Vector3(-1.0, 0.0, 0.0),
	"front": Vector3(0.0, 0.0, 1.0),
}
const BASE_RADIUS: float = 135.0 * 0.04
const FOCUS_INSET: float = 0.24
const FOCUS_HEIGHT: float = 2.55
const FOCUS_RANGE: float = 4.65
const FOCUS_ENERGY: float = 1.28
const FOCUS_TRANSITION: float = 0.30
const FOCUS_NEUTRAL: Color = Color("#fff0da")

var intro: Node3D
var gameplay: Node
var turn_light: OmniLight3D
var focus_tween: Tween
var active_direction: String = ""
var next_sync_msec: int = 0


func _ready() -> void:
	process_priority = 35
	intro = get_parent() as Node3D
	call_deferred("_attach")


func _process(_delta: float) -> void:
	if gameplay == null:
		_attach()
	if gameplay == null:
		return
	_suppress_legacy_hud()
	var now: int = Time.get_ticks_msec()
	if now < next_sync_msec:
		return
	next_sync_msec = now + 60
	_sync_focus(false)


func _attach() -> void:
	if intro == null:
		intro = get_parent() as Node3D
	if intro == null:
		return
	gameplay = intro.get_node_or_null("PostIntroGameplay")
	if gameplay == null:
		return
	if turn_light == null:
		_build_focus_light()
	_sync_focus(true)
	_publish_contract()


func _build_focus_light() -> void:
	turn_light = OmniLight3D.new()
	turn_light.name = "ActiveTurnFocusLight"
	turn_light.light_color = FOCUS_NEUTRAL
	turn_light.light_energy = 0.0
	turn_light.omni_range = FOCUS_RANGE
	turn_light.omni_attenuation = 1.45
	turn_light.shadow_enabled = false
	turn_light.visible = false
	intro.add_child(turn_light)


func _suppress_legacy_hud() -> void:
	# The old textual turn/score labels are intentionally not replaced with
	# another panel. The board itself carries the turn cue now.
	var legacy_turn: Variant = gameplay.get("turn_label")
	if legacy_turn is Label:
		(legacy_turn as Label).visible = false
	var legacy_score: Variant = gameplay.get("score_label")
	if legacy_score is Label:
		(legacy_score as Label).visible = false


func _sync_focus(force: bool) -> void:
	if turn_light == null:
		return
	if not _has_live_turn():
		_hide_focus(force)
		return
	var player: Dictionary = _current_player_data()
	var direction: String = str(player.get("direction", ""))
	if not DIRECTION_VECTORS.has(direction):
		_hide_focus(force)
		return
	var color_key: String = str(player.get("color", ""))
	if not force and direction == active_direction and turn_light.visible:
		_publish_state(true, direction, color_key)
		return
	_show_focus(direction, color_key, force)


func _has_live_turn() -> bool:
	if not _flag("match_initialized"):
		return false
	if _flag("online_active") and _flag("online_waiting"):
		return false
	if _flag("round_complete") or _flag("match_complete") or _flag("online_cancelled"):
		return false
	if _flag("tutorial_showcase_running"):
		return false
	return not _current_player_data().is_empty()


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


func _flag(property_name: String) -> bool:
	var value: Variant = gameplay.get(property_name)
	return bool(value) if value != null else false


func _show_focus(direction: String, color_key: String, instant: bool) -> void:
	var axis: Vector3 = DIRECTION_VECTORS[direction] as Vector3
	var target_position: Vector3 = axis * (BASE_RADIUS - FOCUS_INSET) + Vector3.UP * FOCUS_HEIGHT
	var accent: Color = PLAYER_COLORS.get(color_key, Color.WHITE) as Color
	# Keep the lighting natural: the player's colour is only a slight tint.
	var target_color: Color = FOCUS_NEUTRAL.lerp(accent.lightened(0.35), 0.14)
	if focus_tween != null and focus_tween.is_valid():
		focus_tween.kill()
	turn_light.visible = true
	if instant or active_direction.is_empty():
		turn_light.position = target_position
		turn_light.light_color = target_color
		turn_light.light_energy = FOCUS_ENERGY
	else:
		focus_tween = create_tween()
		focus_tween.set_parallel(true)
		focus_tween.tween_property(turn_light, "position", target_position, FOCUS_TRANSITION).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
		focus_tween.tween_property(turn_light, "light_color", target_color, FOCUS_TRANSITION).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
		focus_tween.tween_property(turn_light, "light_energy", FOCUS_ENERGY, FOCUS_TRANSITION).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	active_direction = direction
	_publish_state(true, direction, color_key)


func _hide_focus(instant: bool) -> void:
	if turn_light == null:
		return
	if focus_tween != null and focus_tween.is_valid():
		focus_tween.kill()
	if instant or not turn_light.visible:
		turn_light.light_energy = 0.0
		turn_light.visible = false
	else:
		focus_tween = create_tween()
		focus_tween.tween_property(turn_light, "light_energy", 0.0, 0.18).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
		focus_tween.finished.connect(func() -> void:
			if turn_light != null and turn_light.light_energy <= 0.01:
				turn_light.visible = false
		)
	active_direction = ""
	_publish_state(false, "", "")


func _publish_contract() -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakTurnHud='removed';" +
		"document.body.dataset.yakolakTurnFocusContract='pass';" +
		"document.body.dataset.yakolakTurnFocusMode='localized-3d-light';" +
		"document.body.dataset.yakolakTurnFocusNoPanel='true';",
		true
	)


func _publish_state(visible: bool, direction: String, color_key: String) -> void:
	if not OS.has_feature("web"):
		return
	var energy: float = turn_light.light_energy if turn_light != null and visible else 0.0
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakTurnHud='removed';" +
		"document.body.dataset.yakolakTurnFocus='%s';" % ("active" if visible else "hidden") +
		"document.body.dataset.yakolakTurnFocusDirection='%s';" % _js(direction) +
		"document.body.dataset.yakolakTurnFocusColor='%s';" % _js(color_key) +
		"document.body.dataset.yakolakTurnFocusEnergy='%.2f';" % energy,
		true
	)


func _js(value: String) -> String:
	return value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ").replace("\r", " ")
