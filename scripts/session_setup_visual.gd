extends "res://scripts/session_setup_flash_entry.gd"

const Layout = preload("res://scripts/game_layout.gd")

# One browser-native setup surface. Godot owns the real table, camera and match
# configuration; the DOM owns inputs, accessibility and responsive controls.
var visual_font: Font
var visual_active: bool = false
var visual_callback: Variant
var visual_camera_snapshot: Dictionary = {}
var visual_intro_camera_snapshot: Dictionary = {}
var visual_intro_camera_generation: int = -1
var visual_preview_seats: Array = []
var visual_step: String = "color"
var visual_last_viewport := Vector2.ZERO
var visual_piece_visibility: Dictionary = {}
var visual_inactive_material: StandardMaterial3D
var visual_prompt: Label3D
var visual_lights: Dictionary = {}
var visual_light_tween: Tween
var visual_light_key: String = ""
var visual_prompt_tween: Tween
var visual_prompt_stage: String = ""
var visual_overlay_open: bool = false
var visual_count_chosen: bool = false
var visual_fit_viewport := Vector2.ZERO
var visual_fit_ready: bool = false
var visual_fitted_transform := Transform3D.IDENTITY
var visual_board_rect := Rect2()
var visual_board_corners: Array[Vector3] = []
var visual_zoom_mix: float = 0.0
var visual_zoom_tween: Tween
var visual_selected_color: String = ""
var visual_reserved_colors: Array = []
var visual_world_seats: Dictionary = {}
var visual_entry_generation: int = 0
var visual_entry_acknowledged: bool = false
var visual_entry_check_elapsed: float = 0.0
var visual_resume_configuration: Dictionary = {}
var visual_lobby_angle := 0.0
var visual_geometry_elapsed := 0.0
var visual_reduce_motion := false
var visual_motion = preload("res://scripts/scene_motion.gd").new(self)
var visual_refit_start := Transform3D.IDENTITY
var visual_refit_start_fov := 50.0
var visual_refit_started := false

func _ready() -> void:
	super._ready()
	visual_font = preload("res://assets/fonts/thmanyahsans-Medium.otf").duplicate()
	visual_font.fallbacks = [ARABIC_FONT]
	process_priority = 1200
	if OS.has_feature("web"):
		visual_reduce_motion = bool(JavaScriptBridge.eval("matchMedia('(prefers-reduced-motion: reduce)').matches",true))
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
	# Lock the finished intro before exposing setup controls, including on Safari.
	if intro != null:
		intro.set_process_unhandled_input(false)
	showing = true
	visual_active = true
	visual_step = "ready" if not visual_resume_configuration.is_empty() else "entry"
	visual_lobby_angle = 0.0
	visual_entry_generation += 1
	visual_entry_acknowledged = false
	visual_entry_check_elapsed = 0.0
	visual_count_chosen = false
	visual_selected_color = ""
	active_screen = "visual"
	tutorial_requested = false
	card.hide()
	if dialog_backdrop != null:
		dialog_backdrop.hide()
	if dialog_navigation != null:
		dialog_navigation.hide()
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# Publish the entry before camera/material work. Browser readiness is a
	# durable, acknowledged request rather than a one-shot nested bridge call.
	_publish_setup_state("visible")
	_publish_visual_entry_request()
	visual_preview_seats.clear()
	visual_last_viewport = Vector2.ZERO
	visual_fit_viewport = Vector2.ZERO
	visual_board_corners.clear()
	# Keep the intro shot as the first frame, then settle into the playable table
	# framing gently instead of snapping to a much closer camera position.
	visual_zoom_mix = 0.0
	if visual_zoom_tween != null and visual_zoom_tween.is_valid(): visual_zoom_tween.kill()
	visual_zoom_tween = create_tween()
	visual_zoom_tween.tween_property(self,"visual_zoom_mix",1.0,1.25).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_apply_visual_camera()
	_publish_visual_geometry()

func _publish_visual_entry_request() -> void:
	if not OS.has_feature("web"):
		return
	var request := str(visual_entry_generation)
	JavaScriptBridge.eval(
		"window.yakolakPendingVisualSetup={online:true,mixed:true,resume:"+JSON.stringify(visual_resume_configuration)+",request:'" + request + "'};" +
		"document.body.dataset.yakolakDialogStage='visual';" +
		"document.body.dataset.yakolakVisualSetupRequest='" + request + "';",
		true
	)

func _process(delta: float) -> void:
	if not visual_active:
		return
	if OS.has_feature("web") and not visual_entry_acknowledged:
		visual_entry_check_elapsed += delta
		if visual_entry_check_elapsed >= 0.25:
			visual_entry_check_elapsed = 0.0
			visual_entry_acknowledged = bool(JavaScriptBridge.eval(
				"document.body.dataset.yakolakVisualSetupAck==='" + str(visual_entry_generation) + "'",
				true
			))
			if not visual_entry_acknowledged:
				_publish_visual_entry_request()
	var orbiting := visual_step=="entry" and not visual_overlay_open and visual_zoom_mix>=0.999 and not visual_reduce_motion
	if orbiting: visual_lobby_angle += delta*0.020
	visual_geometry_elapsed += delta
	_apply_visual_camera()
	var viewport := get_viewport().get_visible_rect().size
	if viewport != visual_last_viewport or visual_zoom_mix < 1.0 or (orbiting and visual_geometry_elapsed>=0.10):
		visual_geometry_elapsed=0.0
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
	var generation := int(intro.get("intro_run_generation")) if intro.has_signal("intro_run_started") else 1
	if visual_intro_camera_snapshot.is_empty() or generation != visual_intro_camera_generation:
		visual_intro_camera_snapshot = visual_camera_snapshot.duplicate()
		visual_intro_camera_generation = generation
	if setup_camera_tween != null and setup_camera_tween.is_valid():
		setup_camera_tween.kill()
	var viewport := get_viewport().get_visible_rect().size
	var metrics := _canvas_metrics(viewport)
	canvas_scale = float(metrics["scale"])
	canvas_css_size = metrics["css_size"] as Vector2
	var actual_pose := cam.transform
	var actual_fov := cam.fov
	# Preserve the accepted intro angle; fit the table without rotating the camera.
	cam.transform = visual_intro_camera_snapshot["transform"]
	cam.projection = int(visual_intro_camera_snapshot["projection"])
	cam.keep_aspect = int(visual_intro_camera_snapshot["aspect"])
	cam.fov = float(visual_intro_camera_snapshot["fov"])
	cam.size = float(visual_intro_camera_snapshot["size"])
	cam.h_offset = float(visual_intro_camera_snapshot["h"])
	cam.v_offset = float(visual_intro_camera_snapshot["v"])
	if viewport != visual_fit_viewport or visual_fit_ready != (visual_step == "ready"):
		_fit_visual_table(cam, viewport)
		visual_refit_start = actual_pose
		visual_refit_start_fov = actual_fov
		visual_lobby_angle = 0.0
		visual_zoom_mix = 0.0
		if visual_zoom_tween != null and visual_zoom_tween.is_valid(): visual_zoom_tween.kill()
		visual_zoom_tween = create_tween()
		visual_zoom_tween.tween_property(self,"visual_zoom_mix",1.0,0.0 if visual_reduce_motion else (0.65 if visual_refit_started else 1.25)).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		visual_refit_started = true
	cam.transform = visual_refit_start.interpolate_with(visual_fitted_transform,visual_zoom_mix)
	cam.fov = lerpf(visual_refit_start_fov,float(visual_intro_camera_snapshot["fov"]),visual_zoom_mix)
	if visual_lobby_angle!=0.0:
		# A very slow bounded orbit preserves the approved framing at every angle.
		var orbit := Basis(Vector3.UP,0.12*sin(visual_lobby_angle))
		var center := Vector3(0,0.35,0)
		cam.position = center+orbit*(cam.position-center)
		cam.basis = orbit*cam.basis
	# UI anchors follow the rendered table throughout the refit, not its future bounds.
	if not visual_board_corners.is_empty(): visual_board_rect = _project_visual_board(cam)
	var game := intro.get_node_or_null("PostIntroGameplay")
	if game != null: game.call("_set_studio_backdrop_visible",cam.position.z>=-13.2)
	_update_visual_prompt(cam)
	_update_world_seats(cam)

func lobby_camera_target() -> Dictionary:
	var cam := intro.get("camera") as Camera3D
	if cam==null or visual_intro_camera_snapshot.is_empty(): return {}
	var saved := {"transform":cam.transform,"fov":cam.fov}
	var viewport := get_viewport().get_visible_rect().size
	var metrics := _canvas_metrics(viewport)
	canvas_scale=float(metrics["scale"])
	canvas_css_size=metrics["css_size"]
	cam.transform=visual_intro_camera_snapshot["transform"]
	cam.fov=float(visual_intro_camera_snapshot["fov"])
	_capture_visual_board_corners()
	var previous_step := visual_step
	visual_step = "ready" if not visual_resume_configuration.is_empty() else "entry"
	_fit_visual_table(cam,viewport)
	visual_step = previous_step
	var target := {"transform":visual_fitted_transform,"fov":cam.fov}
	cam.transform=saved["transform"]
	cam.fov=float(saved["fov"])
	return target

func _capture_visual_board_corners() -> void:
	visual_board_corners.clear()
	var nodes: Array = []
	if intro.has_method("_base_final"):
		nodes.append(intro.get("board"))
		for value: Variant in (intro.get("bases") as Dictionary).values(): nodes.append(value)
		for value: Variant in (intro.get("pieces") as Array): nodes.append((value as Dictionary).get("mesh"))
	for value: Variant in nodes:
		var mesh := value as MeshInstance3D
		if mesh == null or mesh.mesh == null: continue
		var box := mesh.get_aabb()
		var pose := mesh.global_transform
		# Fit the destination scene, never airborne exits or stones on the board.
		var game := intro.get_node_or_null("PostIntroGameplay")
		if game != null:
			var homes: Array = game.get("home_transforms")
			var records: Array = game.get("piece_records")
			for index: int in range(mini(homes.size(),records.size())):
				if records[index].get("mesh")==mesh:
					pose = intro.global_transform * (homes[index] as Transform3D)
					break
			var base_homes: Dictionary = game.get("base_home_poses")
			for direction: String in base_homes:
				if intro.get_node_or_null("Base_%s" % direction)==mesh: pose = intro.global_transform * (base_homes[direction] as Transform3D)
		for i: int in range(8): visual_board_corners.append(pose * box.get_endpoint(i))
	if visual_board_corners.is_empty():
		for x: float in [-6.8,6.8]:
			for z: float in [-6.8,6.8]: visual_board_corners.append(intro.to_global(Vector3(x,0.24,z)))

func _project_visual_board(cam: Camera3D) -> Rect2:
	var first := cam.unproject_position(visual_board_corners[0]) * canvas_scale
	var bounds := Rect2(first,Vector2.ZERO)
	for point: Vector3 in visual_board_corners: bounds = bounds.expand(cam.unproject_position(point) * canvas_scale)
	return bounds

func _fit_visual_table(cam: Camera3D, viewport: Vector2) -> void:
	if visual_board_corners.is_empty(): _capture_visual_board_corners()
	visual_fit_viewport = viewport
	visual_fit_ready = visual_step == "ready"
	var width := canvas_css_size.x
	var height := canvas_css_size.y
	var short_view := height < 480.0
	# Reserve the outer glass wall on narrow player-selection screens. The
	# color hit targets and gameplay retain their existing camera framing.
	var ready_mobile := visual_fit_ready and width < 700.0
	var available := Vector2(width*(0.74 if ready_mobile else 0.90),height*(0.46 if short_view else 0.52))
	var center := Vector2(width*0.5,height*(0.49 if short_view else 0.51))
	var focus := intro.to_global(Vector3(0,0.35,0))
	var basis: Basis = visual_intro_camera_snapshot["transform"].basis
	var low := 8.0
	var high := 90.0
	cam.basis = basis
	for i: int in range(15):
		var distance := (low+high)*0.5
		cam.global_position = focus + cam.global_basis.z*distance
		var bounds := _project_visual_board(cam)
		if bounds.size.x > available.x or bounds.size.y > available.y: low = distance
		else: high = distance
	cam.global_position = focus + cam.global_basis.z*high
	var bounds := _project_visual_board(cam)
	var depth := (focus-cam.global_position).dot(-cam.global_basis.z)
	cam.global_position += cam.project_position(bounds.get_center()/canvas_scale,depth)-cam.project_position(center/canvas_scale,depth)
	visual_board_rect = _project_visual_board(cam)
	visual_fitted_transform = cam.transform

func _update_visual_prompt(cam: Camera3D) -> void:
	if visual_prompt == null:
		visual_prompt = Label3D.new()
		visual_prompt.name = "SetupWorldPrompt"
		visual_prompt.font = visual_font
		visual_prompt.font_size = 64
		visual_prompt.outline_size = 6
		visual_prompt.outline_modulate = Color(0,0,0,0.7)
		visual_prompt.modulate = Color("#f4f1e8")
		visual_prompt.no_depth_test = false
		visual_prompt.hide()
		intro.add_child(visual_prompt)
	var prompt_gap := 104.0 if visual_step=="color" and not visual_reserved_colors.is_empty() else 42.0
	var screen := Vector2(canvas_css_size.x*0.5,maxf(48.0,visual_board_rect.position.y-prompt_gap)) / canvas_scale
	var depth := (intro.to_global(Vector3.ZERO)-cam.global_position).dot(-cam.global_basis.z)
	visual_prompt.global_position = cam.project_position(screen,depth)
	visual_prompt.global_basis = cam.global_basis
	var prompt_size := clampf(canvas_css_size.x * 0.034, 26.0, 44.0)
	visual_prompt.pixel_size = cam.project_position(screen+Vector2(0,_ui_length(prompt_size)),depth).distance_to(visual_prompt.global_position)/64.0
	var stage := visual_step if not visual_overlay_open else "overlay"
	if stage == visual_prompt_stage: return
	visual_prompt_stage = stage
	if visual_prompt_tween != null and visual_prompt_tween.is_valid(): visual_prompt_tween.kill()
	visual_prompt_tween = create_tween()
	if stage not in ["color","count","rounds"]:
		visual_prompt_tween.tween_property(visual_prompt,"modulate:a",0.0,0.12)
		visual_prompt_tween.tween_callback(visual_prompt.hide)
	else:
		visual_prompt.text = {"color":"اختر لونك","count":"كم لاعب؟","rounds":"كم شوط للفوز؟"}[stage]
		visual_prompt.modulate.a = 0.0
		visual_prompt.show()
		visual_prompt_tween.tween_property(visual_prompt,"modulate:a",1.0,0.22)

func _update_world_seats(cam: Camera3D) -> void:
	var geometry := _visual_seat_points()
	for color: Dictionary in PALETTE:
		var key: String = color["id"]
		if not visual_world_seats.has(key):
			var label := Label3D.new()
			label.font = visual_font
			label.font_size = 40
			label.outline_size = 3
			label.outline_modulate = Color(0,0,0,0.6)
			label.no_depth_test = false
			intro.add_child(label)
			visual_world_seats[key] = {"node":label,"label":label}
		var label := visual_world_seats[key]["label"] as Label3D
		# DOM labels share these projected anchors.  They are clearer above the
		# WebGL canvas (and can have the glass treatment) than a depth-tested 3D
		# label, which is inconsistent between Safari and desktop renderers.
		label.visible = false
		if not label.visible: continue
		var point := Vector2(geometry["controls"][key][0],geometry["controls"][key][1]) * canvas_css_size / canvas_scale
		var depth := (intro.to_global(Vector3.ZERO)-cam.global_position).dot(-cam.global_basis.z)
		label.global_position = cam.project_position(point,depth)
		label.global_basis = cam.global_basis
		var world_pixel := cam.project_position(point+Vector2(_ui_length(1.0),0),depth).distance_to(label.global_position)
		label.pixel_size = world_pixel*15.0/40.0
		for index: int in range(visual_preview_seats.size()):
			var seat := visual_preview_seats[index] as Dictionary
			if str(seat.get("color","")) != key: continue
			var mode := str(seat.get("mode","none"))
			var status: String = {"bot":"بوت","online":"أونلاين","local":"نفس الجهاز","none":"بدون"}.get(mode,"بدون")
			if index == 0: status = "أنت"
			label.text = "%s\n%d  ⌄" % [status,index+1]
			label.modulate = Color("#758078") if mode == "none" else Color("#f4f1e8")

func _visual_seat_points() -> Dictionary:
	var points: Dictionary = {}
	if intro == null:
		return points
	var cam := intro.get("camera") as Camera3D
	if cam == null:
		return points
	var viewport := get_viewport().get_visible_rect().size
	var offsets := {"right": Vector3(Layout.REST_CENTER, 6.0*Layout.UNIT, 0), "back": Vector3(0, 6.0*Layout.UNIT, -Layout.REST_CENTER), "left": Vector3(-Layout.REST_CENTER, 6.0*Layout.UNIT, 0), "front": Vector3(0, 6.0*Layout.UNIT, Layout.REST_CENTER)}
	var hit_points: Dictionary = {}
	var control_angles: Dictionary = {}
	for color: Dictionary in PALETTE:
		var anchor: Vector3 = offsets[str(color["direction"])]
		var point := cam.unproject_position(intro.to_global(anchor))
		# Follow the projected long edge of this rack, including the opposing
		# slopes of the two near players. Screen-left/right alone is insufficient.
		var tangent := Vector3.FORWARD if str(color["direction"]) in ["right", "left"] else Vector3.RIGHT
		var edge := cam.unproject_position(intro.to_global(anchor+tangent))-point
		var angle := rad_to_deg(edge.angle())
		if angle>90.0: angle-=180.0
		if angle< -90.0: angle+=180.0
		control_angles[str(color["id"])] = clampf(angle,-10.0,10.0)
		# Seat controls stay beside their base; transparent color hit areas stay
		# directly over it, independently of the diagonal perspective.
		points[str(color["id"])] = [point.x / viewport.x, point.y / viewport.y]
		var corners: Array = []
		for delta: Vector3 in [Vector3(-1.5,0,-1.5),Vector3(1.5,0,-1.5),Vector3(1.5,0,1.5),Vector3(-1.5,0,1.5)]:
			var corner := cam.unproject_position(intro.to_global(anchor + delta))
			corners.append([corner.x / viewport.x, corner.y / viewport.y])
		hit_points[str(color["id"])] = corners
	var controls: Dictionary = {}
	for key: String in points:
		var p := Vector2(points[key][0],points[key][1])*canvas_css_size
		# Status sits immediately above the player's pieces, not in a card.
		p.y -= 42.0
		p.x = clampf(p.x,44.0,canvas_css_size.x-44.0)
		p.y = clampf(p.y,72.0,canvas_css_size.y-110.0)
		controls[key] = [p.x/canvas_css_size.x,p.y/canvas_css_size.y]
	var heading := Vector2(canvas_css_size.x*0.5,maxf(48.0,visual_board_rect.position.y-42.0))
	var actions := Vector2(canvas_css_size.x*0.5,minf(canvas_css_size.y-70.0,visual_board_rect.end.y+30.0))
	return {"controls":controls,"control_angles":control_angles,"world":true,"seats":points,"hits":hit_points,"prompt":[heading.x/canvas_css_size.x,heading.y/canvas_css_size.y],"actions":[actions.x/canvas_css_size.x,actions.y/canvas_css_size.y],"board":[visual_board_rect.position.x,visual_board_rect.position.y,visual_board_rect.size.x,visual_board_rect.size.y]}

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
			visual_reserved_colors = payload.get("reserved_colors", []) as Array
			visual_overlay_open = bool(payload.get("overlay_open", false))
			visual_count_chosen = bool(payload.get("count_chosen", visual_step in ["ready","rounds"]))
			_update_visual_seats()
		"start":
			_accept_visual_configuration(payload)
		"join":
			var code := str(payload.get("code",""))
			if code.length()!=3 or not code.is_valid_int():
				show_setup_error("اكتب رمزًا من 3 أرقام")
				return
			var name := str(payload.get("name","لاعب")).left(24)
			var color := str(payload.get("color","marble"))
			var configuration := {"tutorial":false,"rounds":3,"online_join_code":code,"players":[{"seat":"p1","label":name,"mode":"local","color":color,"color_name":"","direction":"right"}]}
			_close_visual_setup(true)
			_publish_setup_state("complete")
			configuration_ready.emit(configuration)

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
		var selected_direction := ""
		if visual_step == "color" and not visual_selected_color.is_empty():
			selected_direction = str(PALETTE[_palette_index(visual_selected_color)]["direction"])
		var enabled := selected_direction.is_empty() and not visual_count_chosen
		if not selected_direction.is_empty():
			enabled = str(record.get("dir", "")) == selected_direction
		else:
			for value: Variant in visual_preview_seats:
				var seat := value as Dictionary
				var palette := PALETTE[_palette_index(str(seat.get("color", "")))]
				if str(palette["direction"]) == str(record.get("dir", "")):
					enabled = enabled or str(seat.get("mode", "none")) != "none"
		for reserved_color: Dictionary in PALETTE:
			if visual_reserved_colors.has(str(reserved_color["id"])) and str(reserved_color["direction"])==str(record.get("dir","")): enabled=true
		mesh.visible = true
		if visual_inactive_material == null:
			visual_inactive_material = StandardMaterial3D.new()
			visual_inactive_material.albedo_color = Color("#191a1c")
			visual_inactive_material.roughness = 0.95
		var saved: Dictionary = visual_piece_visibility[key]
		var source := saved["material"] as BaseMaterial3D
		if source == null: continue
		var target: Color = source.albedo_color if enabled else (source.albedo_color.lerp(Color.BLACK,0.70) if not selected_direction.is_empty() else visual_inactive_material.albedo_color)
		visual_motion.tint(mesh, source, target, 0.0 if visual_reduce_motion else 0.32, source if enabled else null)

	_update_visual_lighting()

func _visual_reduced_motion() -> bool:
	return OS.has_feature("web") and bool(JavaScriptBridge.eval("matchMedia('(prefers-reduced-motion: reduce)').matches",true))

func _update_visual_lighting() -> void:
	var offsets := {"right":Vector3(Layout.REST_CENTER,3.2,0),"back":Vector3(0,3.2,-Layout.REST_CENTER),"left":Vector3(-Layout.REST_CENTER,3.2,0),"front":Vector3(0,3.2,Layout.REST_CENTER)}
	var signature := visual_step+":"+visual_selected_color+":"+JSON.stringify(visual_preview_seats)
	if signature == visual_light_key: return
	visual_light_key = signature
	if visual_light_tween != null and visual_light_tween.is_valid(): visual_light_tween.kill()
	visual_light_tween = create_tween().set_parallel(true)
	for color: Dictionary in PALETTE:
		var key: String = color["id"]
		if not visual_lights.has(key):
			var light := OmniLight3D.new()
			light.position = offsets[str(color["direction"])]
			light.omni_range = 6.8
			light.omni_attenuation = 1.05
			# White lighting changes intensity without tinting the original piece.
			light.light_color = Color.WHITE
			light.light_energy = 0.0
			intro.add_child(light)
			visual_lights[key] = light
		var target := 0.62
		if visual_step == "color" and not visual_selected_color.is_empty(): target = 0.62 if key == visual_selected_color else 0.0
		if visual_reserved_colors.has(key): target=0.62
		if visual_count_chosen:
			for value: Variant in visual_preview_seats:
				var seat := value as Dictionary
				if str(seat.get("color","")) == key and str(seat.get("mode","")) == "none": target = 0.08
		var light := visual_lights[key] as OmniLight3D
		light.visible = true
		visual_light_tween.tween_property(light,"light_energy",target,0.28).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	# Do not recolor or emit from the meshes here: the selected base is highlighted
	# by a neutral white light, so its original white/blue/gold/green hue stays true.

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
		# Remote seats are carried unchanged to the real WebRTC host transport.
		if mode not in ["local", "bot", "online"] or str(player.get("device_owner", "p1")) != "p1":
			return {}
		if index == 0 and mode != "local":
			return {}
		var palette := PALETTE[_palette_index(color)]
		var label := str(player.get("label", "")).strip_edges().left(24)
		if label.is_empty():
			label = ("لاعب " if mode == "local" else "كمبيوتر ") + str(palette["name"])
		configured.append({"seat": "p%d" % (index + 1), "label": label, "mode": mode, "color": color, "color_name": palette["name"], "direction": palette["direction"]})
	return {"tutorial": false, "rounds": selected_rounds, "players": configured, "online_join_code": ""}

func _accept_visual_configuration(payload: Dictionary) -> void:
	var configuration := _validated_visual_configuration(payload)
	if configuration.is_empty():
		show_setup_error("راجع حالات اللاعبين")
		return
	_close_visual_setup(true)
	visual_resume_configuration.clear()
	_publish_setup_state("complete")
	configuration_ready.emit(configuration)

func _restore_visual_camera(preserve_pose: bool = false) -> void:
	if not preserve_pose and intro != null and not visual_camera_snapshot.is_empty():
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
		if is_instance_valid(record["node"]) and record["material"] is BaseMaterial3D:
			var source := record["material"] as BaseMaterial3D
			visual_motion.tint(record["node"], source, source.albedo_color, 0.0 if visual_reduce_motion else 0.32, source)
	visual_piece_visibility.clear()

func _close_visual_setup(preserve_pose: bool = false) -> void:
	visual_active = false
	for value: Variant in visual_world_seats.values():
		(value["node"] as Node3D).hide()
	if visual_prompt != null:
		visual_prompt.hide()
	if visual_prompt_tween != null and visual_prompt_tween.is_valid(): visual_prompt_tween.kill()
	if visual_light_tween != null and visual_light_tween.is_valid(): visual_light_tween.kill()
	if not visual_lights.is_empty(): visual_light_tween = create_tween().set_parallel(true)
	for value: Variant in visual_lights.values(): visual_light_tween.tween_property(value,"light_energy",0.0,0.0 if visual_reduce_motion else 0.32)
	visual_light_key = ""
	visual_prompt_stage = ""
	showing = false
	root.hide()
	if visual_zoom_tween != null and visual_zoom_tween.is_valid(): visual_zoom_tween.kill()
	_restore_visual_camera(preserve_pose)
	if OS.has_feature("web"):
		JavaScriptBridge.eval("if(window.YakolakSetup)window.YakolakSetup.close();", true)

func reset_for_intro() -> void:
	_close_visual_setup(true)
	visual_refit_started = false
	super.reset_for_intro()

func hide_for_online_restore() -> void:
	_close_visual_setup(true)
	super.hide_for_online_restore()

func show_setup_error(message: String) -> void:
	if not visual_active: visual_fit_viewport = Vector2.ZERO
	showing = true
	visual_active = true
	_apply_visual_camera()
	if OS.has_feature("web"):
		JavaScriptBridge.eval("if(window.YakolakSetup)window.YakolakSetup.error(" + JSON.stringify(message) + ");", true)

func show_online_error(error_code: String) -> void:
	if not visual_active: visual_fit_viewport = Vector2.ZERO
	showing = true
	visual_active = true
	_apply_visual_camera()
	if OS.has_feature("web"):
		JavaScriptBridge.eval("if(window.YakolakSetup)window.YakolakSetup.networkError("+JSON.stringify(error_code)+");",true)
	else:
		show_setup_error("تعذر الاتصال بالغرفة")

func _on_visual_room_state(room: Dictionary, _identity: Dictionary) -> void:
	if visual_active and OS.has_feature("web"):
		# Only public names and seat IDs enter the UI; never room credentials.
		var participants: Array[Dictionary] = []
		for value: Variant in room.get("players", []):
			var player := value as Dictionary
			participants.append({"seat": str(player.get("seat", "")), "name": str(player.get("name", player.get("label", "")))})
		JavaScriptBridge.eval("if(window.YakolakSetup)window.YakolakSetup.room(" + JSON.stringify({"players": participants,"code":str(room.get("code",""))}) + ");", true)
