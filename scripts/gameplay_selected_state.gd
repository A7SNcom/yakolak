extends "res://scripts/gameplay_turn_transition_stale_safe.gd"

# UX-SELECT-44 — one clear, quiet selection treatment.
# `selected_index` remains the sole owner of selection state in gameplay.gd.
# This leaf only refines selected-piece presentation and webdriver observability.
const SELECT44_OUTLINE_GROW: float = 1.02
const SELECT44_EMISSION_ENERGY: float = 0.16
const SELECT44_LIGHT_OUTLINE := Color("#f8f2e7")
const SELECT44_DARK_OUTLINE := Color("#11161a")

var select44_start_callback: Variant
var select44_player_callback: Variant
var select44_lifecycle_callback: Variant
var select44_target_callback: Variant
var select44_target_revision: int = 0
var select44_matrix_active: bool = false


func _ready() -> void:
	super._ready()
	if not OS.has_feature("web") or not browser_automation:
		return
	select44_start_callback = JavaScriptBridge.create_callback(_on_web_select44_start_matrix)
	select44_player_callback = JavaScriptBridge.create_callback(_on_web_select44_set_player)
	select44_lifecycle_callback = JavaScriptBridge.create_callback(_on_web_select44_lifecycle)
	select44_target_callback = JavaScriptBridge.create_callback(_on_web_select44_refresh_pick_target)
	var window: JavaScriptObject = JavaScriptBridge.get_interface("window")
	if window != null:
		window.set("yakolakTestSelect44StartMatrix", select44_start_callback)
		window.set("yakolakTestSelect44SetPlayer", select44_player_callback)
		window.set("yakolakTestSelect44Lifecycle", select44_lifecycle_callback)
		window.set("yakolakTestSelect44RefreshPickTarget", select44_target_callback)
	_publish_selection_emphasis_state("ready")


func _selection_material(source: Material) -> StandardMaterial3D:
	var result: StandardMaterial3D
	if source is StandardMaterial3D:
		result = (source as StandardMaterial3D).duplicate() as StandardMaterial3D
	else:
		result = StandardMaterial3D.new()
		result.albedo_color = Color.WHITE

	var base_color: Color = result.albedo_color
	var luminance: float = base_color.r * 0.2126 + base_color.g * 0.7152 + base_color.b * 0.0722
	var outline_color: Color = SELECT44_DARK_OUTLINE if luminance >= 0.62 else SELECT44_LIGHT_OUTLINE

	# Preserve the actual player color. A very low-energy emission only keeps the
	# selected surface readable when turn lighting/camera angle suppresses highlights.
	result.emission_enabled = true
	result.emission = base_color.lightened(0.04)
	result.emission_energy_multiplier = SELECT44_EMISSION_ENERGY
	result.set_meta("yakolak_selected_state", true)

	# The outline is the primary cue: slightly thicker than the previous 0.72
	# pass, high-contrast, unshaded, and attached only to the selected material.
	var outline := StandardMaterial3D.new()
	outline.albedo_color = outline_color
	outline.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	outline.cull_mode = BaseMaterial3D.CULL_FRONT
	outline.grow = true
	outline.grow_amount = SELECT44_OUTLINE_GROW
	outline.roughness = 1.0
	outline.set_meta("yakolak_selection_outline", true)
	result.next_pass = outline

	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakSelectionStyle='contrast-outline-soft-emission';" +
			"document.body.dataset.yakolakSelectionOutline='" + ("dark" if luminance >= 0.62 else "light") + "';" +
			"document.body.dataset.yakolakSelectionOutlineGrow='%.2f';" % SELECT44_OUTLINE_GROW +
			"document.body.dataset.yakolakSelectionEmissionEnergy='%.2f';" % SELECT44_EMISSION_ENERGY,
			true
		)
	return result


func _publish_selection(record: Dictionary) -> void:
	super._publish_selection(record)
	_publish_selection_emphasis_state("selected")


func _publish_move_complete(record: Dictionary, cell: int) -> void:
	super._publish_move_complete(record, cell)
	_publish_selection_emphasis_state("move-commit")


func _publish_gameplay_state(state: String) -> void:
	super._publish_gameplay_state(state)
	_publish_selection_emphasis_state(state)


func _cancel_stale_selection_presentation() -> void:
	super._cancel_stale_selection_presentation()
	_publish_selection_emphasis_state("turn-change")


func _reset_board_for_round() -> void:
	super._reset_board_for_round()
	# A round boundary owns a full selection reset, including browser-facing state.
	# `selected_index` is already cleared below us; clear the published size/owner
	# in the same lifecycle so the previous stone cannot survive as stale UI state.
	_publish_selection_cleared_probe("round-reset")
	_publish_selection_emphasis_state("round-reset")


func _reset_session_transients() -> void:
	super._reset_session_transients()
	_publish_selection_emphasis_state("session-reset")


func _apply_online_board(board: Dictionary) -> void:
	super._apply_online_board(board)
	# Hydration clears selected_index/materials in the authoritative session layer,
	# but that path does not publish gameplay state. Clear all browser selection
	# observability in the same JS operation so no stale selected owner survives.
	_publish_selection_cleared_probe("reconnect-hydration")


func _publish_piece_test_targets() -> void:
	# The inherited webdriver helper exhaustively resolves every nested ring and is
	# useful to broad touch audits. UX-SELECT-44 needs only one exact rendered target
	# per tap; suppress the broad refresh after this focused matrix starts.
	if select44_matrix_active:
		return
	super._publish_piece_test_targets()


func _selection_emphasis_count() -> int:
	var count: int = 0
	for record_value: Variant in piece_records:
		var record: Dictionary = record_value as Dictionary
		var piece: MeshInstance3D = record.get("mesh", null) as MeshInstance3D
		if piece == null or piece.material_override == null:
			continue
		if piece.material_override.has_meta("yakolak_selected_state") and bool(piece.material_override.get_meta("yakolak_selected_state")):
			count += 1
	return count


func _selection_emphasis_owner() -> String:
	for record_value: Variant in piece_records:
		var record: Dictionary = record_value as Dictionary
		var piece: MeshInstance3D = record.get("mesh", null) as MeshInstance3D
		if piece == null or piece.material_override == null:
			continue
		if piece.material_override.has_meta("yakolak_selected_state") and bool(piece.material_override.get_meta("yakolak_selected_state")):
			return str(piece.name)
	return ""


func _publish_selection_emphasis_state(reason: String) -> void:
	if not OS.has_feature("web"):
		return
	var count: int = _selection_emphasis_count()
	var owner: String = _selection_emphasis_owner() if count == 1 else ""
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakSelectionEmphasisCount='%d';" % count +
		"document.body.dataset.yakolakSelectionEmphasisOwner=" + JSON.stringify(owner) + ";" +
		"document.body.dataset.yakolakSelectionEmphasisReason=" + JSON.stringify(reason) + ";",
		true
	)


func _publish_selection_cleared_probe(reason: String) -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakSelected='';" +
		"document.body.dataset.yakolakSelectedSize='';" +
		"document.body.dataset.yakolakSelectionEmphasisCount='0';" +
		"document.body.dataset.yakolakSelectionEmphasisOwner='';" +
		"document.body.dataset.yakolakSelectionEmphasisReason=" + JSON.stringify(reason) + ";",
		true
	)


func _on_web_select44_start_matrix(_arguments: Array) -> void:
	if not browser_automation or not waiting_for_setup:
		return
	select44_matrix_active = true
	if setup != null:
		setup.call("reset_for_intro")
	_on_configuration_ready({
		"tutorial": false,
		"rounds": 3,
		"players": [
			{"seat": "p1", "label": "أنا", "mode": "local", "color": "marble", "color_name": "أبيض", "direction": "right"},
			{"seat": "p2", "label": "اللاعب 2", "mode": "local", "color": "blue", "color_name": "أزرق", "direction": "back"},
			{"seat": "p3", "label": "اللاعب 3", "mode": "local", "color": "gold", "color_name": "ذهبي", "direction": "left"},
			{"seat": "p4", "label": "اللاعب 4", "mode": "local", "color": "green", "color_name": "أخضر", "direction": "front"},
		],
		"online_join_code": "",
	})


func _on_web_select44_set_player(arguments: Array) -> void:
	if not browser_automation or players.is_empty() or arguments.is_empty():
		return
	var index: int = clampi(int(arguments[0]), 0, players.size() - 1)
	current_player_index = index
	_start_turn()


func _on_web_select44_lifecycle(arguments: Array) -> void:
	if not browser_automation or arguments.is_empty():
		return
	var action: String = str(arguments[0])
	match action:
		"cancel":
			_clear_selection()
		"turn-change":
			_cancel_stale_selection_presentation()
		"round-reset":
			_reset_board_for_round()
		"reconnect-hydration":
			_apply_online_board({})
		_:
			return
	_publish_selection_emphasis_state("test-" + action)


func _on_web_select44_refresh_pick_target(arguments: Array) -> void:
	if not browser_automation or not match_initialized or not gameplay_ready or camera == null or arguments.size() < 2:
		return
	var side: int = clampi(int(arguments[0]), -1, 1)
	var size_name: String = str(arguments[1])
	if not size_name in ["small", "medium", "large"]:
		return
	var direction: String = _current_direction()
	var available: Array[int] = _available_stack_indices(direction, side)
	var piece_index: int = -1
	for candidate: int in available:
		if str((piece_records[candidate] as Dictionary).get("type", "")) == size_name:
			piece_index = candidate
			break
	var candidates: Array[int] = tray_indices if tray_open and tray_side == side else _current_piece_candidates()
	var internal_point := Vector2(-1.0, -1.0)
	if piece_index >= 0:
		internal_point = _visible_piece_test_pointer(piece_index, candidates)
	var canvas_rect: Rect2 = _gameplay_canvas_css_rect()
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var css_point := Vector2.ZERO
	if internal_point.x >= 0.0 and internal_point.y >= 0.0 and canvas_rect.size.x >= 1.0 and canvas_rect.size.y >= 1.0 and viewport_size.x >= 1.0 and viewport_size.y >= 1.0:
		var css_scale := Vector2(canvas_rect.size.x / viewport_size.x, canvas_rect.size.y / viewport_size.y)
		css_point = canvas_rect.position + internal_point * css_scale
	select44_target_revision += 1
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakSelect44TargetDirection=" + JSON.stringify(direction) + ";" +
		"document.body.dataset.yakolakSelect44TargetSide='%d';" % side +
		"document.body.dataset.yakolakSelect44TargetSize=" + JSON.stringify(size_name) + ";" +
		"document.body.dataset.yakolakSelect44TargetX='%s';" % str(css_point.x) +
		"document.body.dataset.yakolakSelect44TargetY='%s';" % str(css_point.y) +
		"document.body.dataset.yakolakSelect44TargetRevision='%d';" % select44_target_revision,
		true
	)
