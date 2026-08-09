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

# Premium selection treatment: preserve the stone exactly, then draw two crisp
# opaque contours. A thin dark keyline separates the stone from every possible
# background, while the brighter outer edge makes the selection unmistakable.
# Both passes are static and affect only the selected stone: no pulsing, alpha
# halo or per-frame shader work.
const SELECTION_KEYLINE_GROW: float = 0.18
const SELECTION_ACCENT_GROW: float = 0.46
const SELECTION_ACCENT_ENERGY: float = 1.35
const SELECTION_KEYLINE_COLOR := Color(0.012, 0.015, 0.020, 1.0)
const SELECTION_ACCENT_COLOR := Color(0.94, 0.975, 1.0, 1.0)

# Keep one stable 60-fps cadence whenever pixels move. A static board no longer
# drops the whole renderer to 30 fps (which can feel like a hitch on wake-up);
# instead Godot's low-processor mode sleeps between on-demand redraws. Geometry,
# materials, lighting, viewport resolution and effects are untouched.
const EFF_ACTIVE_FPS: int = 60
const EFF_IDLE_SLEEP_USEC: int = 6900
const EFF_IDLE_PROCESS_INTERVAL: float = 0.050
const EFF_INPUT_BOOST_MS: int = 700
const EFF_SCORE_BOOST_MS: int = 900
# A catastrophic hitch should not teleport the stone, but the animation must
# still finish promptly on a genuinely slow device. 15 Hz is the safety floor:
# it halves a 120-150 ms hitch while keeping a 520 ms move near one second even
# on a ~7 fps software-rendered browser.
const EFF_MAX_MOVE_STEP_SECONDS: float = 1.0 / 15.0

var _eff_idle_process_accumulator: float = 0.0
var _eff_boost_until_msec: int = 0
var _eff_frame_profile: int = -1
var _eff_move_tracking_piece: int = -1
var _eff_move_elapsed_msec: float = 0.0


func _ready() -> void:
	super._ready()
	_eff_apply_frame_budget(true)


func _process(delta: float) -> void:
	var now: int = Time.get_ticks_msec()
	var full_rate: bool = _eff_requires_full_rate(now)
	_eff_apply_frame_budget(full_rate)

	# The legacy placement interpolation advances from wall-clock milliseconds.
	# On a hitch that makes the stone jump a large distance on the next frame.
	# Feed it a capped, accumulated visual clock instead: a slow device takes a
	# little longer to finish the move rather than showing an ugly jump.
	if move_active:
		_eff_prepare_smoothed_move(delta)
	else:
		_eff_reset_move_clock()

	# Before gameplay starts, keep every approved intro/setup motion at 60 fps.
	# During a live match only the manual stone flight needs this full script
	# chain every rendered frame; idle state/timer checks are safe at 20 Hz.
	if not match_initialized or full_rate:
		_eff_idle_process_accumulator = 0.0
		super._process(delta)
		if not move_active:
			_eff_reset_move_clock()
		return

	_eff_idle_process_accumulator += maxf(delta, 0.0)
	if _eff_idle_process_accumulator < EFF_IDLE_PROCESS_INTERVAL:
		return
	var batched_delta: float = _eff_idle_process_accumulator
	_eff_idle_process_accumulator = 0.0
	super._process(batched_delta)
	if not move_active:
		_eff_reset_move_clock()


func _input(event: InputEvent) -> void:
	# Wake the renderer before any user-driven visual reaction. Mouse motion is
	# included so hover/desktop interaction always returns to full-rate rendering.
	if (
		event is InputEventScreenTouch
		or event is InputEventScreenDrag
		or event is InputEventMouseButton
		or event is InputEventMouseMotion
		or event is InputEventMagnifyGesture
	):
		_eff_boost_until_msec = maxi(_eff_boost_until_msec, Time.get_ticks_msec() + EFF_INPUT_BOOST_MS)
		_eff_apply_frame_budget(true)
	super._input(event)


func _eff_requires_full_rate(now: int) -> bool:
	if not match_initialized:
		return true
	if now < _eff_boost_until_msec:
		return true
	if move_active or camera_transition or action_in_progress or turn_camera_active:
		return true
	if tray_tween != null and tray_tween.is_valid() and tray_tween.is_running():
		return true
	if camera_tween != null and camera_tween.is_valid() and camera_tween.is_running():
		return true
	if stability_round_reset_tween != null and stability_round_reset_tween.is_valid() and stability_round_reset_tween.is_running():
		return true
	return false


func _eff_apply_frame_budget(full_rate: bool) -> void:
	if Engine.max_fps != EFF_ACTIVE_FPS:
		Engine.max_fps = EFF_ACTIVE_FPS

	var low_power: bool = not full_rate
	if OS.low_processor_usage_mode != low_power:
		OS.low_processor_usage_mode = low_power
	if OS.low_processor_usage_mode_sleep_usec != EFF_IDLE_SLEEP_USEC:
		OS.low_processor_usage_mode_sleep_usec = EFF_IDLE_SLEEP_USEC

	var profile: int = 1 if full_rate else 0
	if profile == _eff_frame_profile:
		return
	_eff_frame_profile = profile
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakGameplayFrameBudget='" + ("motion-60" if full_rate else "idle-on-demand") + "';" +
			"document.body.dataset.yakolakGameplayPowerMode='" + ("awake" if full_rate else "low-processor") + "';" +
			"document.body.dataset.yakolakGameplayVisualQuality='unchanged';",
			true
		)


func _eff_prepare_smoothed_move(delta: float) -> void:
	if move_piece_index < 0:
		return
	if _eff_move_tracking_piece != move_piece_index:
		_eff_move_tracking_piece = move_piece_index
		_eff_move_elapsed_msec = 0.0
	var visual_step: float = minf(maxf(delta, 0.0), EFF_MAX_MOVE_STEP_SECONDS)
	_eff_move_elapsed_msec += visual_step * 1000.0
	move_started_msec = Time.get_ticks_msec() - int(round(_eff_move_elapsed_msec))


func _eff_reset_move_clock() -> void:
	_eff_move_tracking_piece = -1
	_eff_move_elapsed_msec = 0.0


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
	_eff_boost_until_msec = Time.get_ticks_msec() + EFF_INPUT_BOOST_MS
	_eff_apply_frame_budget(true)
	super._enable_gameplay()
	_set_player_base_shadows(false)


func _reset_for_intro() -> void:
	# Preserve the approved intro exactly; its complex bases may cast shadows
	# during the cinematic. The cheaper shadow budget begins only after it ends.
	_eff_boost_until_msec = 0
	_eff_idle_process_accumulator = 0.0
	_eff_reset_move_clock()
	_eff_apply_frame_budget(true)
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
	_eff_boost_until_msec = maxi(_eff_boost_until_msec, Time.get_ticks_msec() + EFF_SCORE_BOOST_MS)
	_eff_apply_frame_budget(true)
	super._sync_score_markers()


func _selection_material(source: Material) -> StandardMaterial3D:
	# The parent already duplicates the real stone material. Replace its inherited
	# one-pass outline with a double-contrast inverted hull: dark separation next
	# to the stone + a restrained luminous outer edge. This remains readable on
	# white, black and colored stones without looking like a thick plastic shell.
	var result: StandardMaterial3D = super._selection_material(source)

	var keyline := StandardMaterial3D.new()
	keyline.albedo_color = SELECTION_KEYLINE_COLOR
	keyline.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	keyline.cull_mode = BaseMaterial3D.CULL_FRONT
	keyline.grow = true
	keyline.grow_amount = SELECTION_KEYLINE_GROW
	keyline.roughness = 1.0

	var accent := StandardMaterial3D.new()
	accent.albedo_color = SELECTION_ACCENT_COLOR
	accent.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	accent.cull_mode = BaseMaterial3D.CULL_FRONT
	accent.grow = true
	accent.grow_amount = SELECTION_ACCENT_GROW
	accent.roughness = 1.0
	accent.emission_enabled = true
	accent.emission = SELECTION_ACCENT_COLOR
	accent.emission_energy_multiplier = SELECTION_ACCENT_ENERGY

	keyline.next_pass = accent
	result.next_pass = keyline

	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakSelectionOutlineProfile='double-contrast-crisp';" +
			"document.body.dataset.yakolakSelectionHalo='none';" +
			"document.body.dataset.yakolakSelectionOutlineLayers='2';",
			true
		)
	return result


func _advance_turn_or_draw() -> void:
	# A turn may move only to another player. Never wrap the search back to the
	# player who just moved; if nobody else has a legal move, the round is over.
	for offset: int in range(1, players.size()):
		var candidate: int = (current_player_index + offset) % players.size()
		if _player_has_legal_move(_direction_for_player(candidate)):
			current_player_index = candidate
			_start_turn()
			return
	_finish_round("", [])
