extends "res://scripts/gameplay_selected_state.gd"

# UX-SELECT-46 — keep legal-selection authority unchanged, but remove work that
# does not need to block the first selected-state frame.
#
# The authoritative path remains:
# input -> rendered-mesh pick -> owner/legal-size validation -> selected_index.
# Only legal-marker painting is deferred until the selected piece has had one
# render opportunity. A generation token cancels stale marker work on rapid taps.

var _ux46_selection_material_cache: Dictionary = {}
var _ux46_marker_generation: int = 0
var _ux46_pointer_started_usec: int = 0
var _ux46_pointer_kind: String = ""
var _ux46_selection_serial: int = 0
var _ux46_legal_revision: int = 0
var _ux46_test_enabled: bool = false
var _ux46_start_requested: bool = false
var _ux46_start_callback: Variant
var _ux46_clear_callback: Variant
var _ux46_refresh_callback: Variant


func _ready() -> void:
	super._ready()
	if not OS.has_feature("web"):
		return
	# The focused bridge is available only to webdriver or an explicit task query.
	# Normal Production visits pay no test-hook cost and cannot enter this path.
	_ux46_test_enabled = browser_automation or bool(JavaScriptBridge.eval(
		"new URLSearchParams(window.location.search).has('uxSelect46')",
		true
	))
	if not _ux46_test_enabled:
		return
	_ux46_start_callback = JavaScriptBridge.create_callback(_on_web_ux46_start_pass_play)
	_ux46_clear_callback = JavaScriptBridge.create_callback(_on_web_ux46_clear_selection)
	_ux46_refresh_callback = JavaScriptBridge.create_callback(_on_web_ux46_refresh_pick_targets)
	var window: JavaScriptObject = JavaScriptBridge.get_interface("window")
	if window != null:
		window.set("yakolakUx46StartPassPlay", _ux46_start_callback)
		window.set("yakolakUx46ClearSelection", _ux46_clear_callback)
		window.set("yakolakUx46RefreshPickTargets", _ux46_refresh_callback)
	JavaScriptBridge.eval("document.body.dataset.yakolakUxSelect46Bridge='ready';", true)


func _process(delta: float) -> void:
	super._process(delta)
	if not _ux46_start_requested or match_initialized:
		return
	# Do not guess about lifecycle timing from DOM labels. Start through the same
	# configuration boundary only after gameplay has consumed the intro handoff and
	# captured every physical home transform/material.
	if not waiting_for_setup:
		return
	if piece_records.is_empty() or home_transforms.size() != piece_records.size() or home_materials.size() != piece_records.size():
		return
	_ux46_start_requested = false
	if setup != null:
		setup.call("reset_for_intro")
	_on_configuration_ready({
		"tutorial": false,
		"rounds": 3,
		"players": [
			{"seat": "p1", "label": "أنا", "mode": "local", "color": "marble", "color_name": "أبيض", "direction": "right"},
			{"seat": "p2", "label": "اللاعب 2", "mode": "local", "color": "blue", "color_name": "أزرق", "direction": "back"},
		],
		"online_join_code": "",
	})


func _input(event: InputEvent) -> void:
	var pressed: bool = false
	var pointer_kind: String = ""
	if event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		pressed = touch.pressed
		pointer_kind = "touch"
	elif event is InputEventMouseButton:
		var mouse := event as InputEventMouseButton
		pressed = mouse.pressed and mouse.button_index == MOUSE_BUTTON_LEFT
		pointer_kind = "mouse"

	if pressed and match_initialized and gameplay_ready and not move_active and not camera_transition and _current_mode() == "local":
		_ux46_pointer_started_usec = Time.get_ticks_usec()
		_ux46_pointer_kind = pointer_kind

	super._input(event)


func _selection_material(source: Material) -> StandardMaterial3D:
	if source == null:
		return super._selection_material(source)
	var cache_key: int = source.get_instance_id()
	var cached: Variant = _ux46_selection_material_cache.get(cache_key, null)
	if cached is StandardMaterial3D:
		return cached as StandardMaterial3D
	var material: StandardMaterial3D = super._selection_material(source)
	_ux46_selection_material_cache[cache_key] = material
	return material


func _hide_markers() -> void:
	# Any clear/move/turn/reset invalidates marker work that has not reached its
	# post-selection frame yet. The legal rules themselves are never deferred.
	_ux46_marker_generation += 1
	super._hide_markers()
	_ux46_publish_legal_targets("")


func _select_tray_piece(piece_index: int) -> void:
	if not tray_open or not tray_indices.has(piece_index):
		return

	# Preserve the existing single-owner selection invariant.
	for index: int in tray_indices:
		var tray_record: Dictionary = piece_records[index] as Dictionary
		var tray_piece: MeshInstance3D = tray_record["mesh"] as MeshInstance3D
		tray_piece.material_override = home_materials[index]

	# Clear any previous legal hints before mutating the selected owner. This also
	# cancels a deferred marker pass from a rapid earlier tap.
	_hide_markers()
	selected_index = piece_index
	var record: Dictionary = piece_records[selected_index] as Dictionary
	var mesh_instance: MeshInstance3D = record["mesh"] as MeshInstance3D
	selected_home_position = home_transforms[selected_index].origin
	selected_original_material = home_materials[selected_index]
	mesh_instance.material_override = _selection_material(selected_original_material)

	# Selected ownership and its visual material are published immediately. Legal
	# marker rendering is secondary feedback and moves behind the first draw.
	_publish_selection(record)
	var publish_done_usec: int = Time.get_ticks_usec()
	_ux46_selection_serial += 1
	var serial: int = _ux46_selection_serial
	var marker_generation: int = _ux46_marker_generation
	var pointer_started_usec: int = _ux46_pointer_started_usec
	var piece_color: Color = _piece_color(record)
	_ux46_finish_after_selected_frame(
		serial,
		marker_generation,
		piece_index,
		str(record["type"]),
		piece_color,
		pointer_started_usec,
		publish_done_usec,
		str(mesh_instance.name),
		_ux46_pointer_kind
	)


func _ux46_finish_after_selected_frame(
	serial: int,
	marker_generation: int,
	piece_index: int,
	size_name: String,
	piece_color: Color,
	pointer_started_usec: int,
	publish_done_usec: int,
	owner_name: String,
	pointer_kind: String
) -> void:
	await RenderingServer.frame_post_draw
	if serial != _ux46_selection_serial:
		return
	if marker_generation != _ux46_marker_generation:
		return
	if selected_index != piece_index or move_active:
		return

	var frame_usec: int = Time.get_ticks_usec()
	var processing_ms: float = 0.0
	var frame_ms: float = maxf(0.0, float(frame_usec - publish_done_usec) / 1000.0)
	var visible_ms: float = frame_ms
	if pointer_started_usec > 0 and publish_done_usec >= pointer_started_usec:
		processing_ms = float(publish_done_usec - pointer_started_usec) / 1000.0
		visible_ms = float(frame_usec - pointer_started_usec) / 1000.0

	# Publish the first-draw measurement before painting secondary legal markers,
	# so the metric represents selected-state feedback rather than hint rendering.
	if OS.has_feature("web") and _ux46_test_enabled:
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakUxSelect46Serial='%d';" % serial +
			"document.body.dataset.yakolakUxSelect46Owner=" + JSON.stringify(owner_name) + ";" +
			"document.body.dataset.yakolakUxSelect46Input=" + JSON.stringify(pointer_kind) + ";" +
			"document.body.dataset.yakolakUxSelect46ProcessingMs='%.3f';" % processing_ms +
			"document.body.dataset.yakolakUxSelect46FrameMs='%.3f';" % frame_ms +
			"document.body.dataset.yakolakUxSelect46VisibleMs='%.3f';" % visible_ms,
			true
		)

	# Preserve the exact production marker pulse/material behavior; only its work is
	# moved behind the first selected-state frame. GGH-009 publishes the exact same
	# canonical cell set immediately after that render pass, never a duplicate rule.
	super._update_legal_markers(size_name, piece_color)
	_ux46_publish_legal_targets(size_name)
	if OS.has_feature("web") and _ux46_test_enabled:
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakUxSelect46MarkerSerial='%d';" % serial +
			"document.body.dataset.yakolakUxSelect46MarkerOwner=" + JSON.stringify(owner_name) + ";",
			true
		)


func _ux46_publish_legal_targets(size_name: String) -> void:
	if not OS.has_feature("web"):
		return

	# GGH-009: publication, rendering, and click verification all consume the same
	# _is_legal_cell() authority already used by _handle_pointer/_begin_move.
	# Never cache a legal set across selection, move, turn, or reset boundaries.
	var selection_current: bool = (
		selected_index >= 0
		and not move_active
		and not size_name.is_empty()
		and size_name == _selected_size()
	)
	var legal_cells: Array[int] = []
	var click_points: Array[Dictionary] = []
	var visible_count: int = 0
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var canvas_rect: Rect2 = _gameplay_canvas_css_rect()
	var can_publish_points: bool = (
		selection_current
		and camera != null
		and viewport_size.x >= 1.0
		and viewport_size.y >= 1.0
		and canvas_rect.size.x >= 1.0
		and canvas_rect.size.y >= 1.0
	)
	var css_scale := Vector2.ONE
	if can_publish_points:
		css_scale = Vector2(canvas_rect.size.x / viewport_size.x, canvas_rect.size.y / viewport_size.y)

	if selection_current:
		for cell: int in range(target_markers.size()):
			if not _is_legal_cell(cell, size_name):
				continue
			legal_cells.append(cell)
			var marker: MeshInstance3D = target_markers[cell]
			if marker != null and marker.visible:
				visible_count += 1
			if not can_publish_points or marker == null or not marker.visible:
				continue
			if camera.is_position_behind(marker.global_position):
				continue
			var internal_point: Vector2 = camera.unproject_position(marker.global_position)
			if internal_point.x < 0.0 or internal_point.y < 0.0 or internal_point.x > viewport_size.x or internal_point.y > viewport_size.y:
				continue
			var css_point: Vector2 = canvas_rect.position + internal_point * css_scale
			click_points.append({"cell": cell, "x": css_point.x, "y": css_point.y})

	_ux46_legal_revision += 1
	var cells_payload: String = JSON.stringify(legal_cells)
	var points_payload: String = JSON.stringify(click_points)
	var state: String = "selected" if selection_current else "clear"
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakLegalTargetsState=" + JSON.stringify(state) + ";" +
		"document.body.dataset.yakolakLegalCells=" + JSON.stringify(cells_payload) + ";" +
		"document.body.dataset.yakolakLegalTargetPoints=" + JSON.stringify(points_payload) + ";" +
		"document.body.dataset.yakolakLegalCount='%d';" % legal_cells.size() +
		"document.body.dataset.yakolakLegalVisibleCount='%d';" % visible_count +
		"document.body.dataset.yakolakLegalSelectedSize=" + JSON.stringify(size_name if selection_current else "") + ";" +
		"document.body.dataset.yakolakLegalRevision='%d';" % _ux46_legal_revision,
		true
	)


func _on_web_ux46_start_pass_play(_arguments: Array) -> void:
	if not _ux46_test_enabled or match_initialized:
		return
	_ux46_start_requested = true


func _on_web_ux46_clear_selection(_arguments: Array) -> void:
	if not _ux46_test_enabled or not match_initialized:
		return
	_clear_selection()


func _on_web_ux46_refresh_pick_targets(_arguments: Array) -> void:
	if not _ux46_test_enabled or not match_initialized or not gameplay_ready or camera == null:
		return
	# Reuse the production mesh-triangle resolver; this hook only requests that the
	# already-existing exact target coordinates be published for Playwright.
	_publish_piece_test_targets()
