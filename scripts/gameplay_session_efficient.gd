extends "res://scripts/gameplay_session_nested_pick.gd"

# Production efficiency layer. Keep visual quality and gameplay behaviour, but
# avoid allocations/work that do not change what the player sees.
var _eff_hud_initialized: bool = false
var _eff_hud_match: bool = false
var _eff_hud_online: bool = false
var _eff_hud_waiting: bool = false

var _eff_quick_mask: int = -1

var _eff_waiting_initialized: bool = false
var _eff_waiting_visible: bool = false
var _eff_waiting_code: String = ""
var _eff_waiting_joined: int = -1
var _eff_waiting_target: int = -1

var _eff_score_initialized: bool = false
var _eff_score_generation: int = -1
var _eff_score_match: bool = false
var _eff_score_players: int = -1
var _eff_score_right: int = -1
var _eff_score_left: int = -1
var _eff_score_front: int = -1
var _eff_score_back: int = -1

# Selection treatment: preserve the stone's real material and draw one opaque,
# adaptive high-contrast contour. One crisp shell is both clearer and cheaper
# than a transparent multi-pass halo.
const SELECTION_DARK_GROW: float = 0.42
const SELECTION_LIGHT_GROW: float = 0.48
const SELECTION_LIGHT_ENERGY: float = 1.90
const SELECTION_DARK_COLOR := Color(0.012, 0.014, 0.018, 1.0)
const SELECTION_LIGHT_COLOR := Color(1.0, 0.985, 0.94, 1.0)


func _build_piece_colliders() -> void:
	# The old path copied every triangle from all 36 meshes into concave physics
	# shapes. Those shapes then moved with tray/move animations, forcing costly
	# broadphase/shape updates in WebAssembly. Nested first-tap selection is
	# already geometric, so lightweight local AABB boxes are sufficient for the
	# remaining direct tray ray-pick while leaving rendered meshes untouched.
	for index: int in range(piece_records.size()):
		var record: Dictionary = piece_records[index] as Dictionary
		var mesh_instance := record.get("mesh") as MeshInstance3D
		if mesh_instance == null or mesh_instance.mesh == null:
			continue
		var aabb: AABB = mesh_instance.mesh.get_aabb()
		if aabb.size.length_squared() <= 0.000001:
			continue

		var shape := BoxShape3D.new()
		shape.size = Vector3(
			maxf(aabb.size.x, 0.1),
			maxf(aabb.size.y, 0.1),
			maxf(aabb.size.z, 0.1)
		)
		var body := StaticBody3D.new()
		body.name = "PiecePickBody_%02d" % index
		body.collision_layer = PIECE_LAYER
		body.collision_mask = 0
		body.set_meta("piece_index", index)
		var collision := CollisionShape3D.new()
		collision.shape = shape
		collision.position = aabb.get_center()
		body.add_child(collision)
		mesh_instance.add_child(body)


func _enable_gameplay() -> void:
	super._enable_gameplay()
	_set_player_base_shadows(false)


func _reset_for_intro() -> void:
	# Preserve the approved intro exactly; its complex bases may cast shadows
	# during the cinematic. The cheaper shadow budget begins only after it ends.
	_set_player_base_shadows(true)
	super._reset_for_intro()


func _set_player_base_shadows(enabled: bool) -> void:
	if intro == null:
		return
	for direction: String in ["right", "left", "front", "back"]:
		var base := intro.get_node_or_null("Base_%s" % direction) as GeometryInstance3D
		if base != null:
			base.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if enabled else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakGameplayShadowBudget='" + ("intro-full" if enabled else "static-bases-off") + "';" +
			"document.body.dataset.yakolakPieceColliderProfile='primitive-aabb';",
			true
		)


func _sync_hud_visibility() -> void:
	if _eff_hud_initialized and _eff_hud_match == match_initialized and _eff_hud_online == online_active and _eff_hud_waiting == online_waiting:
		return
	_eff_hud_initialized = true
	_eff_hud_match = match_initialized
	_eff_hud_online = online_active
	_eff_hud_waiting = online_waiting
	super._sync_hud_visibility()


func _sync_quick_menu() -> void:
	var mask: int = 0
	if match_initialized:
		mask |= 1
	if round_complete:
		mask |= 2
	if match_complete:
		mask |= 4
	if online_cancelled:
		mask |= 8
	if online_active:
		mask |= 16
	if online_waiting:
		mask |= 32
	if mask == _eff_quick_mask:
		return
	_eff_quick_mask = mask
	super._sync_quick_menu()


func _sync_waiting_overlay() -> void:
	if waiting_root == null:
		super._sync_waiting_overlay()
		return
	var should_show: bool = online_active and online_waiting
	if not should_show:
		if _eff_waiting_initialized and not _eff_waiting_visible:
			return
		_eff_waiting_initialized = true
		_eff_waiting_visible = false
		_eff_waiting_code = ""
		_eff_waiting_joined = 0
		_eff_waiting_target = 0
		super._sync_waiting_overlay()
		return

	var code: String = _waiting_room_code()
	var joined: int = players.size()
	var target: int = maxi(_waiting_target_count(), joined)
	if _eff_waiting_initialized and _eff_waiting_visible and _eff_waiting_code == code and _eff_waiting_joined == joined and _eff_waiting_target == target:
		return
	_eff_waiting_initialized = true
	_eff_waiting_visible = true
	_eff_waiting_code = code
	_eff_waiting_joined = joined
	_eff_waiting_target = target
	super._sync_waiting_overlay()


func _sync_score_markers() -> void:
	var right_score: int = int(scores.get("right", 0))
	var left_score: int = int(scores.get("left", 0))
	var front_score: int = int(scores.get("front", 0))
	var back_score: int = int(scores.get("back", 0))
	if (
		_eff_score_initialized
		and _eff_score_generation == session_generation
		and _eff_score_match == match_initialized
		and _eff_score_players == players.size()
		and _eff_score_right == right_score
		and _eff_score_left == left_score
		and _eff_score_front == front_score
		and _eff_score_back == back_score
	):
		return
	_eff_score_initialized = true
	_eff_score_generation = session_generation
	_eff_score_match = match_initialized
	_eff_score_players = players.size()
	_eff_score_right = right_score
	_eff_score_left = left_score
	_eff_score_front = front_score
	_eff_score_back = back_score
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
