extends "res://scripts/session_setup_flash_entry.gd"

# One browser-native setup surface. Godot owns the real table, camera and match
# configuration; the DOM owns inputs, accessibility and responsive controls.
var visual_active: bool = false
var visual_callback: Variant
var visual_camera_snapshot: Dictionary = {}
var visual_preview_seats: Array = []
var visual_step: String = "color"
var visual_last_viewport := Vector2.ZERO
var visual_piece_visibility: Dictionary = {}
var visual_inactive_material: StandardMaterial3D

func _ready() -> void:
	super._ready()
	process_priority = 1200
	if OS.has_feature("web"):
		visual_callback = JavaScriptBridge.create_callback(_on_visual_action)
		var window: JavaScriptObject = JavaScriptBridge.get_interface("window")
		if window != null:
			window.set("yakolakVisualSetupAction", visual_callback)
	if online != null and not online.room_state_changed.is_connected(_on_visual_room_state):
		online.room_state_changed.connect(_on_visual_room_state)

func show_after_intro() -> void:
	if visual_active:
		return
	showing = true
	visual_active = true
	visual_step = "color"
	active_screen = "visual"
	tutorial_requested = false
	card.hide()
	if dialog_backdrop != null:
		dialog_backdrop.hide()
	if dialog_navigation != null:
		dialog_navigation.hide()
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	visual_preview_seats.clear()
	visual_last_viewport = Vector2.ZERO
	_apply_visual_camera()
	_publish_setup_state("visible")
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakDialogStage='visual';if(window.YakolakSetup)window.YakolakSetup.open({online:false,mixed:false});else window.yakolakPendingVisualSetup={online:false,mixed:false};", true)
	_publish_visual_geometry()

func _process(_delta: float) -> void:
	if not visual_active:
		return
	_apply_visual_camera()
	var viewport := get_viewport().get_visible_rect().size
	if viewport != visual_last_viewport:
		_publish_visual_geometry()

func _layout_card() -> void:
	if visual_active:
		_apply_visual_camera()
		_publish_visual_geometry.call_deferred()
		return
	super._layout_card()

func _input(event: InputEvent) -> void:
	if visual_active:
		get_viewport().set_input_as_handled()
		return
	super._input(event)

func _unhandled_key_input(event: InputEvent) -> void:
	if not visual_active:
		super._unhandled_key_input(event)

func _apply_split_framing() -> void:
	if visual_active:
		_apply_visual_camera()
		return
	super._apply_split_framing()

func animate_setup_entry() -> void:
	if not visual_active:
		super.animate_setup_entry()

func _apply_visual_camera() -> void:
	if intro == null:
		return
	var cam := intro.get("camera") as Camera3D
	if cam == null:
		return
	if visual_camera_snapshot.is_empty():
		visual_camera_snapshot = {"transform": cam.transform, "projection": cam.projection, "size": cam.size, "fov": cam.fov, "h": cam.h_offset, "v": cam.v_offset, "aspect": cam.keep_aspect}
	if setup_camera_tween != null and setup_camera_tween.is_valid():
		setup_camera_tween.kill()
	var viewport := get_viewport().get_visible_rect().size
	var metrics := _canvas_metrics(viewport)
	canvas_scale = float(metrics["scale"])
	canvas_css_size = metrics["css_size"] as Vector2
	var landscape := canvas_css_size.x > canvas_css_size.y
	var spare_height := 190.0 if landscape else 240.0
	var pixels_per_unit := maxf(3.0, minf((canvas_css_size.x - 140.0) / 14.0, (canvas_css_size.y - spare_height) / 14.0))
	cam.projection = Camera3D.PROJECTION_ORTHOGONAL
	cam.keep_aspect = Camera3D.KEEP_HEIGHT
	cam.size = canvas_css_size.y / pixels_per_unit
	cam.h_offset = 0.0
	cam.v_offset = 0.0
	cam.position = Vector3(0.0, 24.0, 0.0)
	cam.look_at(intro.to_global(Vector3.ZERO), Vector3(0.0, 0.0, -1.0))

func _visual_seat_points() -> Dictionary:
	var points: Dictionary = {}
	if intro == null:
		return points
	var cam := intro.get("camera") as Camera3D
	if cam == null:
		return points
	var viewport := get_viewport().get_visible_rect().size
	var center := cam.unproject_position(intro.to_global(Vector3.ZERO))
	var offsets := {"right": Vector3(5.4, 0.24, 0), "back": Vector3(0, 0.24, -5.4), "left": Vector3(-5.4, 0.24, 0), "front": Vector3(0, 0.24, 5.4)}
	for color: Dictionary in PALETTE:
		var point := cam.unproject_position(intro.to_global(offsets[str(color["direction"])]))
		point += (point - center).normalized() * _ui_length(34.0 if canvas_css_size.y >= 480.0 else 24.0)
		points[str(color["id"])] = [point.x / viewport.x, point.y / viewport.y]
	return points

func _publish_visual_geometry() -> void:
	if not visual_active:
		return
	visual_last_viewport = get_viewport().get_visible_rect().size
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.yakolakPendingVisualGeometry=" + JSON.stringify(_visual_seat_points()) + ";if(window.YakolakSetup)window.YakolakSetup.geometry(window.yakolakPendingVisualGeometry);", true)

func _on_visual_action(arguments: Array) -> void:
	if not visual_active or arguments.is_empty():
		return
	var parsed: Variant = JSON.parse_string(str(arguments[0]))
	if not parsed is Dictionary:
		return
	var payload := parsed as Dictionary
	match str(payload.get("action", "")):
		"preview":
			visual_preview_seats = payload.get("all_seats", []) as Array
			visual_step = str(payload.get("step", "color"))
			_update_visual_seats()
		"start":
			_accept_visual_configuration(payload)
		"join":
			show_setup_error("الأونلاين غير متاح حالياً")

func _update_visual_seats() -> void:
	if intro == null:
		return
	var records: Variant = intro.get("pieces")
	if not records is Array:
		return
	for item: Variant in records:
		var record := item as Dictionary
		var mesh := record.get("mesh") as GeometryInstance3D
		if mesh == null:
			continue
		var key := mesh.get_instance_id()
		if not visual_piece_visibility.has(key):
			visual_piece_visibility[key] = {"node": mesh, "visible": mesh.visible, "material": mesh.material_override}
		var enabled := visual_step == "color"
		for value: Variant in visual_preview_seats:
			var seat := value as Dictionary
			var palette := PALETTE[_palette_index(str(seat.get("color", "")))]
			if str(palette["direction"]) == str(record.get("dir", "")):
				enabled = enabled or str(seat.get("mode", "none")) != "none"
		mesh.visible = true
		if visual_inactive_material == null:
			visual_inactive_material = StandardMaterial3D.new()
			visual_inactive_material.albedo_color = Color("#182421")
			visual_inactive_material.roughness = 0.95
		# GeometryInstance3D.transparency is ignored by the Web Compatibility
		# renderer. A real opaque material keeps absent seats visibly dark.
		mesh.material_override = visual_piece_visibility[key]["material"] if enabled else visual_inactive_material

func _validated_visual_configuration(payload: Dictionary) -> Dictionary:
	var values: Variant = payload.get("players", [])
	if not values is Array or values.size() < 2 or values.size() > 4:
		return {}
	var selected_rounds := int(payload.get("rounds", 3))
	if selected_rounds not in [3, 5]:
		return {}
	var configured: Array[Dictionary] = []
	var colors: Array[String] = []
	for index: int in range(values.size()):
		if not values[index] is Dictionary:
			return {}
		var player := values[index] as Dictionary
		var color := str(player.get("color", ""))
		if color not in ["marble", "blue", "gold", "green"] or colors.has(color):
			return {}
		colors.append(color)
		var mode := str(player.get("mode", ""))
		# Static GitHub hosting has no room server. Never turn a requested remote
		# player into a bot/local player silently or pretend a room was created.
		if mode not in ["local", "bot"] or str(player.get("device_owner", "p1")) != "p1":
			return {}
		if index == 0 and mode != "local":
			return {}
		var label := str(player.get("label", "")).strip_edges().left(24)
		if mode == "local" and label.length() < 2:
			return {}
		var palette := PALETTE[_palette_index(color)]
		configured.append({"seat": "p%d" % (index + 1), "label": label, "mode": mode, "color": color, "color_name": palette["name"], "direction": palette["direction"]})
	return {"tutorial": false, "rounds": selected_rounds, "players": configured, "online_join_code": ""}

func _accept_visual_configuration(payload: Dictionary) -> void:
	var configuration := _validated_visual_configuration(payload)
	if configuration.is_empty():
		show_setup_error("راجع حالات اللاعبين")
		return
	_close_visual_setup()
	_publish_setup_state("complete")
	configuration_ready.emit(configuration)

func _restore_visual_camera() -> void:
	if intro != null and not visual_camera_snapshot.is_empty():
		var cam := intro.get("camera") as Camera3D
		if cam != null:
			cam.transform = visual_camera_snapshot["transform"]
			cam.projection = int(visual_camera_snapshot["projection"])
			cam.keep_aspect = int(visual_camera_snapshot["aspect"])
			cam.size = float(visual_camera_snapshot["size"])
			cam.fov = float(visual_camera_snapshot["fov"])
			cam.h_offset = float(visual_camera_snapshot["h"])
			cam.v_offset = float(visual_camera_snapshot["v"])
	visual_camera_snapshot.clear()
	for value: Variant in visual_piece_visibility.values():
		var record := value as Dictionary
		if is_instance_valid(record["node"]):
			var mesh := record["node"] as GeometryInstance3D
			mesh.visible = bool(record["visible"])
			mesh.material_override = record["material"]
	visual_piece_visibility.clear()

func _close_visual_setup() -> void:
	visual_active = false
	showing = false
	root.hide()
	_restore_visual_camera()
	if OS.has_feature("web"):
		JavaScriptBridge.eval("if(window.YakolakSetup)window.YakolakSetup.close();", true)

func reset_for_intro() -> void:
	_close_visual_setup()
	super.reset_for_intro()

func hide_for_online_restore() -> void:
	_close_visual_setup()
	super.hide_for_online_restore()

func show_setup_error(message: String) -> void:
	showing = true
	visual_active = true
	_apply_visual_camera()
	if OS.has_feature("web"):
		JavaScriptBridge.eval("if(window.YakolakSetup)window.YakolakSetup.error(" + JSON.stringify(message) + ");", true)

func show_online_error(_error_code: String) -> void:
	show_setup_error("الأونلاين غير متاح حالياً")

func _on_visual_room_state(room: Dictionary, _identity: Dictionary) -> void:
	if visual_active and OS.has_feature("web"):
		# Only public names and seat IDs enter the UI; never room credentials.
		var participants: Array[Dictionary] = []
		for value: Variant in room.get("players", []):
			var player := value as Dictionary
			participants.append({"seat": str(player.get("seat", "")), "name": str(player.get("name", player.get("label", "")))})
		JavaScriptBridge.eval("if(window.YakolakSetup)window.YakolakSetup.room(" + JSON.stringify({"players": participants}) + ");", true)
