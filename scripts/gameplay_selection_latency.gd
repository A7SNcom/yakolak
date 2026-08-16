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
var _ux46_start_callback: Variant
var _ux46_clear_callback: Variant


func _ready() -> void:
	super._ready()
	if not OS.has_feature("web") or not browser_automation:
		return
	_ux46_start_callback = JavaScriptBridge.create_callback(_on_web_ux46_start_pass_play)
	_ux46_clear_callback = JavaScriptBridge.create_callback(_on_web_ux46_clear_selection)
	var window: JavaScriptObject = JavaScriptBridge.get_interface("window")
	if window != null:
		window.set("yakolakUx46StartPassPlay", _ux46_start_callback)
		window.set("yakolakUx46ClearSelection", _ux46_clear_callback)


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
	if OS.has_feature("web") and browser_automation:
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
	# moved behind the first selected-state frame.
	super._update_legal_markers(size_name, piece_color)
	if OS.has_feature("web") and browser_automation:
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakUxSelect46MarkerSerial='%d';" % serial +
			"document.body.dataset.yakolakUxSelect46MarkerOwner=" + JSON.stringify(owner_name) + ";",
			true
		)


func _on_web_ux46_start_pass_play(_arguments: Array) -> void:
	if not browser_automation or match_initialized:
		return
	# The current Flash entry intentionally no longer exposes the old broad setup
	# test callback. This focused hook enters the same configuration boundary and
	# exists only under navigator.webdriver.
	waiting_for_setup = true
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


func _on_web_ux46_clear_selection(_arguments: Array) -> void:
	if not browser_automation or not match_initialized:
		return
	_clear_selection()
