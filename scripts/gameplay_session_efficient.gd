extends "res://scripts/gameplay_session_nested_pick.gd"

# Production efficiency layer. Parent gameplay logic can safely ask to sync UI
# every frame; this leaf only forwards the call when the visible state changed.
# Animations, camera tweens, input, rules and graphics remain untouched.
var _eff_hud_key: String = ""
var _eff_quick_key: String = ""
var _eff_waiting_key: String = ""
var _eff_score_key: String = ""

# Selection treatment: keep the stone's real material, then use a thin,
# high-contrast inverted-hull edge plus one soft halo pass. This is clearer
# than the old thick flat shell without adding any per-frame animation work.
const SELECTION_CORE_GROW: float = 0.30
const SELECTION_HALO_GROW: float = 0.62
const SELECTION_CORE_ENERGY: float = 1.55
const SELECTION_HALO_ENERGY: float = 0.72
const SELECTION_HALO_ALPHA: float = 0.16
const SELECTION_HALO_COLOR := Color(0.46, 0.86, 1.0, 1.0)


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
	# Start from the approved material-preserving implementation, but replace
	# its coarse single shell with a crisp core + restrained halo.
	var result: StandardMaterial3D = super._selection_material(source)
	var base_color: Color = result.albedo_color
	var luminance: float = base_color.r * 0.2126 + base_color.g * 0.7152 + base_color.b * 0.0722
	var core_color: Color = Color(0.025, 0.028, 0.035, 1.0) if luminance > 0.62 else Color(0.985, 0.995, 1.0, 1.0)

	var core := StandardMaterial3D.new()
	core.albedo_color = core_color
	core.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	core.cull_mode = BaseMaterial3D.CULL_FRONT
	core.grow = true
	core.grow_amount = SELECTION_CORE_GROW
	core.roughness = 1.0
	core.emission_enabled = true
	core.emission = core_color
	core.emission_energy_multiplier = SELECTION_CORE_ENERGY

	var halo := StandardMaterial3D.new()
	halo.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	halo.albedo_color = Color(SELECTION_HALO_COLOR.r, SELECTION_HALO_COLOR.g, SELECTION_HALO_COLOR.b, SELECTION_HALO_ALPHA)
	halo.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	halo.cull_mode = BaseMaterial3D.CULL_FRONT
	halo.grow = true
	halo.grow_amount = SELECTION_HALO_GROW
	halo.roughness = 1.0
	halo.emission_enabled = true
	halo.emission = SELECTION_HALO_COLOR
	halo.emission_energy_multiplier = SELECTION_HALO_ENERGY

	core.next_pass = halo
	result.next_pass = core

	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakSelectionOutlineProfile='crisp-soft-halo';" +
			"document.body.dataset.yakolakSelectionHalo='soft-cyan';",
			true
		)
	return result
