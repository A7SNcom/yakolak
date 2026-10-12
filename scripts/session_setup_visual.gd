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
var visual_prompt: Label3D
var visual_selection: MeshInstance3D
var visual_selected_color: String = ""
var visual_world_seats: Dictionary = {}

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
	visual_step = "profile"
	visual_selected_color = ""
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
	# Keep the accepted final intro shot. Setup must never introduce a new angle.
	cam.transform = visual_camera_snapshot["transform"]
	cam.projection = int(visual_camera_snapshot["projection"])
	cam.keep_aspect = int(visual_camera_snapshot["aspect"])
	cam.fov = float(visual_camera_snapshot["fov"])
	cam.size = float(visual_camera_snapshot["size"])
	cam.h_offset = float(visual_camera_snapshot["h"])
	cam.v_offset = float(visual_camera_snapshot["v"])
	_update_visual_prompt(cam)
	_update_world_seats(cam)

func _update_visual_prompt(cam: Camera3D) -> void:
	if visual_prompt == null:
		visual_prompt = Label3D.new()
		visual_prompt.name = "SetupWorldPrompt"
		visual_prompt.font = preload("res://assets/fonts/thmanyahsans-Medium.otf")
		visual_prompt.font_size = 64
		visual_prompt.outline_size = 10
		visual_prompt.outline_modulate = Color(0.0, 0.0, 0.0, 0.85)
		visual_prompt.modulate = Color("#f4f1e8")
		visual_prompt.pixel_size = 0.012
		visual_prompt.no_depth_test = true
		intro.add_child(visual_prompt)
	visual_prompt.position = Vector3(0.0, 1.2, 0.0)
	visual_prompt.global_basis = cam.global_basis
	var anchor := cam.unproject_position(visual_prompt.global_position)
	var depth := (visual_prompt.global_position - cam.global_position).dot(-cam.global_basis.z)
	visual_prompt.pixel_size = cam.project_position(anchor + Vector2(0,_ui_length(26.0)),depth).distance_to(visual_prompt.global_position) / 64.0
	visual_prompt.text = "اختر لونك" if visual_step == "color" else "اختر عدد اللاعبين"
	visual_prompt.visible = visual_active and visual_step != "profile"
	if visual_selection == null:
		visual_selection = MeshInstance3D.new()
		visual_selection.name = "SetupColorSelection"
		var ring := TorusMesh.new()
		ring.inner_radius = 1.08
		ring.outer_radius = 1.18
		visual_selection.mesh = ring
		var material := StandardMaterial3D.new()
		material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		material.albedo_color = Color("#f4dfad")
		visual_selection.material_override = material
		intro.add_child(visual_selection)
	visual_selection.visible = visual_active and visual_step == "color" and not visual_selected_color.is_empty()
	if visual_selection.visible:
		var offsets := {"right": Vector3(5.4,0.4,0), "back": Vector3(0,0.4,-5.4), "left": Vector3(-5.4,0.4,0), "front": Vector3(0,0.4,5.4)}
		visual_selection.position = offsets[str(PALETTE[_palette_index(visual_selected_color)]["direction"])]

func _update_world_seats(cam: Camera3D) -> void:
	var viewport := get_viewport().get_visible_rect().size
	var geometry := _visual_seat_points()

	for color: Dictionary in PALETTE:
		var key: String = color["id"]
		if not visual_world_seats.has(key):
			var group := Node3D.new()
			intro.add_child(group)
			var panel := MeshInstance3D.new()
			var quad := QuadMesh.new()
			panel.mesh = quad
			var material := StandardMaterial3D.new()
			material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			material.albedo_color = Color("#15221d")
			material.no_depth_test = true
			material.render_priority = 10
			panel.material_override = material
			group.add_child(panel)
			var label := Label3D.new()
			label.font = preload("res://assets/fonts/thmanyahsans-Medium.otf")
			label.font_size = 40
			label.outline_size = 3
			label.modulate = Color("#f4f1e8")
			label.no_depth_test = true
			label.render_priority = 11
			label.position.z = 0.02
			group.add_child(label)
			visual_world_seats[key] = {"node":group,"quad":quad,"label":label,"material":material}
		var record: Dictionary = visual_world_seats[key]
		var group := record["node"] as Node3D
		group.visible = visual_active and visual_step not in ["color","profile"]
		if not group.visible:
			continue
		var point := Vector2(geometry["controls"][key][0],geometry["controls"][key][1]) * canvas_css_size
		var screen_point := point / canvas_scale
		var depth := (intro.to_global(Vector3.ZERO)-cam.global_position).dot(-cam.global_basis.z)
		group.global_position = cam.project_position(screen_point,depth)
		group.global_basis = cam.global_basis
		var world_pixel := cam.project_position(screen_point+Vector2(_ui_length(1.0),0),depth).distance_to(group.global_position)
		var quad := record["quad"] as QuadMesh
		quad.size = Vector2(104,65) * world_pixel
		var label := record["label"] as Label3D
		label.pixel_size = world_pixel * 13.0 / 40.0
		for index: int in range(visual_preview_seats.size()):
			var seat := visual_preview_seats[index] as Dictionary
			if str(seat.get("color","")) != key:
				continue
			var mode := str(seat.get("mode","none"))
			var title := str(seat.get("name",""))
			if title.is_empty(): title = "لاعب %d" % (index+1)
			if title.length() > 12: title = title.left(11) + "…"
			var status: String = {"bot":"بوت","online":"أونلاين","local":"نفس الجهاز","none":"بدون"}.get(mode,"بدون")
			if index == 0: status = "أنت"
			label.text = "%d · %s\n%s" % [index+1,title,status]
			label.modulate = Color("#67716c") if mode == "none" else Color("#f4f1e8")
			(record["material"] as StandardMaterial3D).albedo_color = Color("#0d1512") if mode == "none" else Color("#15221d")

func _visual_seat_points() -> Dictionary:
	var points: Dictionary = {}
	if intro == null:
		return points
	var cam := intro.get("camera") as Camera3D
	if cam == null:
		return points
	var viewport := get_viewport().get_visible_rect().size
	var offsets := {"right": Vector3(5.4, 0.24, 0), "back": Vector3(0, 0.24, -5.4), "left": Vector3(-5.4, 0.24, 0), "front": Vector3(0, 0.24, 5.4)}
	var hit_points: Dictionary = {}
	for color: Dictionary in PALETTE:
		var anchor: Vector3 = offsets[str(color["direction"])]
		var point := cam.unproject_position(intro.to_global(anchor))
		# Seat controls stay beside their base; transparent color hit areas stay
		# directly over it, independently of the diagonal perspective.
		points[str(color["id"])] = [point.x / viewport.x, point.y / viewport.y]
		var corners: Array = []
		for delta: Vector3 in [Vector3(-1.5,0,-1.5),Vector3(1.5,0,-1.5),Vector3(1.5,0,1.5),Vector3(-1.5,0,1.5)]:
			var corner := cam.unproject_position(intro.to_global(anchor + delta))
			corners.append([corner.x / viewport.x, corner.y / viewport.y])
		hit_points[str(color["id"])] = corners
	var prompt_point := cam.unproject_position(intro.to_global(Vector3(0,1.2,0)))
	var center_css := prompt_point * canvas_scale
	var controls: Dictionary = {}
	for key: String in points:
		var point_css := Vector2(points[key][0],points[key][1]) * canvas_css_size
		var direction := (point_css-center_css).normalized()
		point_css += direction * 32.0
		var right_side := point_css.x >= center_css.x
		var lower_side := point_css.y >= center_css.y
		if canvas_css_size.x >= 430.0:
			# Wide views keep menus beside the table, clear of the center prompt.
			point_css.x = maxf(point_css.x,center_css.x+147.0) if right_side else minf(point_css.x,center_css.x-147.0)
			point_css.y = maxf(point_css.y,center_css.y+38.0) if lower_side else minf(point_css.y,center_css.y-38.0)
		else:
			# Portrait views have room vertically; don't cover count/confirm.
			point_css.y = maxf(point_css.y,center_css.y+130.0) if lower_side else minf(point_css.y,center_css.y-62.0)
		point_css.x = clampf(point_css.x,54.0,canvas_css_size.x-54.0)
		point_css.y = clampf(point_css.y,70.0,canvas_css_size.y-82.0)
		controls[key] = [point_css.x/canvas_css_size.x,point_css.y/canvas_css_size.y]
	return {"controls": controls, "world": true, "seats": points, "hits": hit_points, "prompt": [prompt_point.x / viewport.x,prompt_point.y / viewport.y]}

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
			visual_selected_color = str(payload.get("selected_color", ""))
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
	for value: Variant in visual_world_seats.values():
		(value["node"] as Node3D).hide()
	if visual_prompt != null:
		visual_prompt.hide()
	if visual_selection != null:
		visual_selection.hide()
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
