extends "res://scripts/gameplay_session_nested_pick.gd"

# Production efficiency layer. Parent gameplay logic can safely ask to sync UI
# every frame; this leaf only forwards the call when the visible state changed.
# Animations, camera tweens, input, rules and graphics remain untouched.
var _eff_hud_key: String = ""
var _eff_quick_key: String = ""
var _eff_waiting_key: String = ""
var _eff_score_key: String = ""

# Selection treatment: preserve the stone's real material and draw one opaque,
# adaptive high-contrast contour. The previous transparent cyan second shell
# looked fuzzy and made the selected silhouette less readable, especially on
# small/nested stones. One crisp shell is both clearer and cheaper to render.
const SELECTION_DARK_GROW: float = 0.42
const SELECTION_LIGHT_GROW: float = 0.48
const SELECTION_LIGHT_ENERGY: float = 1.90
const SELECTION_DARK_COLOR := Color(0.012, 0.014, 0.018, 1.0)
const SELECTION_LIGHT_COLOR := Color(1.0, 0.985, 0.94, 1.0)


func _sync_hud_visibility() -> void:
	var key: String = "%s|%s|%s" % [str(match_initialized), str(online_active), str(online_waiting)]
	if key == _eff_hud_key:
		return
	_eff_hud_key = key
	super._sync_hud_visibility()


func _sync_quick_menu() -> void:
	var key: String = "%s|%s|%s|%s|%s|%s" % [
		str(match_initialized),
		str(round_complete),
		str(match_complete),
		str(online_cancelled),
		str(online_active),
		str(online_waiting),
	]
	if key == _eff_quick_key:
		return
	_eff_quick_key = key
	super._sync_quick_menu()


func _sync_waiting_overlay() -> void:
	if waiting_root == null:
		super._sync_waiting_overlay()
		return
	var should_show: bool = online_active and online_waiting
	var code: String = _waiting_room_code() if should_show else ""
	var joined: int = players.size() if should_show else 0
	var target: int = maxi(_waiting_target_count(), joined) if should_show else 0
	var key: String = "%s|%s|%d|%d" % [str(should_show), code, joined, target]
	if key == _eff_waiting_key:
		return
	_eff_waiting_key = key
	super._sync_waiting_overlay()


func _sync_score_markers() -> void:
	var key: String = "%s|%d|%d|%d|%d|%d" % [
		str(match_initialized),
		players.size(),
		int(scores.get("right", 0)),
		int(scores.get("left", 0)),
		int(scores.get("front", 0)),
		int(scores.get("back", 0)),
	]
	if key == _eff_score_key:
		return
	_eff_score_key = key
	super._sync_score_markers()


func _selection_material(source: Material) -> StandardMaterial3D:
	# Keep the approved real stone material from the parent, but replace every
	# inherited outline/halo pass with a single clean inverted-hull contour.
	var result: StandardMaterial3D = super._selection_material(source)
	var base_color: Color = result.albedo_color
	var luminance: float = base_color.r * 0.2126 + base_color.g * 0.7152 + base_color.b * 0.0722
	var use_dark_outline: bool = luminance > 0.62
	var outline_color: Color = SELECTION_DARK_COLOR if use_dark_outline else SELECTION_LIGHT_COLOR
	var outline_grow: float = SELECTION_DARK_GROW if use_dark_outline else SELECTION_LIGHT_GROW

	var outline := StandardMaterial3D.new()
	outline.albedo_color = outline_color
	outline.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	outline.cull_mode = BaseMaterial3D.CULL_FRONT
	outline.grow = true
	outline.grow_amount = outline_grow
	outline.roughness = 1.0
	if not use_dark_outline:
		outline.emission_enabled = true
		outline.emission = outline_color
		outline.emission_energy_multiplier = SELECTION_LIGHT_ENERGY

	# Deliberately replace the parent's next_pass chain so no fuzzy transparent
	# halo survives from older selection treatments.
	result.next_pass = outline

	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakSelectionOutlineProfile='single-crisp-adaptive';" +
			"document.body.dataset.yakolakSelectionHalo='none';",
			true
		)
	return result
