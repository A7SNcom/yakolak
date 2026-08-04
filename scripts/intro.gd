extends Node3D

const U := 0.04
const ASSET_ROOT := "res://YAKOLAK_PORTABLE_KIT/assets"
const GENERATED_ROOT := "res://generated"
const TABLE_TOP_Y := -0.64
const GAME_Y := TABLE_TOP_Y + 0.032

const SIDE_ORDER := ["right", "left", "front", "back"]
const SIDE_COLORS := {
	"right": Color("#f1eee6"),
	"back": Color("#3769a5"),
	"left": Color("#b78a44"),
	"front": Color("#2f856a")
}
const SIDE_ROTATIONS := {
	"right": 0.0,
	"back": -90.0,
	"left": 180.0,
	"front": 90.0
}
const BASE_TARGETS := {
	"right": Vector3(135.0 * U, GAME_Y, 0.0),
	"back": Vector3(0.0, GAME_Y, -135.0 * U),
	"left": Vector3(-135.0 * U, GAME_Y, 0.0),
	"front": Vector3(0.0, GAME_Y, 135.0 * U)
}

var camera: Camera3D
var wall_star: Sprite3D
var board: MeshInstance3D
var lid: MeshInstance3D
var bases := {}
var pieces: Array = []
var active_tweens: Array = []
var action_button: Button
var sequence_cancelled := false
var intro_complete := false


func _ready() -> void:
	_build_environment()
	_build_room()
	_build_table()
	_build_wall_brand()
	_build_camera()
	_build_original_game_assets()
	_build_action_button()
	get_viewport().size_changed.connect(_on_viewport_size_changed)
	_mark_browser("scene-ready")
	_run_intro.call_deferred()


func _build_environment() -> void:
	var world_environment := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("#f7f7f4")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#fffdf8")
	environment.ambient_light_energy = 0.62
	environment.tonemap_mode = Environment.TONE_MAPPER_ACES
	environment.tonemap_exposure = 1.0
	world_environment.environment = environment
	add_child(world_environment)

	var key := DirectionalLight3D.new()
	key.rotation_degrees = Vector3(-52.0, -28.0, 0.0)
	key.light_energy = 1.15
	key.light_color = Color("#fffaf0")
	key.shadow_enabled = true
	add_child(key)

	var fill := OmniLight3D.new()
	fill.position = Vector3(-12.0, 16.0, 10.0)
	fill.light_energy = 0.28
	fill.omni_range = 70.0
	fill.light_color = Color("#dfe9f7")
	add_child(fill)

	var rim := OmniLight3D.new()
	rim.position = Vector3(14.0, 12.0, -14.0)
	rim.light_energy = 0.38
	rim.omni_range = 70.0
	rim.light_color = Color("#fff0d5")
	add_child(rim)


func _build_room() -> void:
	var floor := _box(Vector3(192.0, 0.35, 192.0), Color("#deddd7"), 0.92)
	floor.position = Vector3(0.0, -26.0, 0.0)
	add_child(floor)

	var back_wall := _box(Vector3(192.0, 76.0, 0.35), Color("#f7f7f4"), 0.98)
	back_wall.position = Vector3(0.0, 12.0, -96.0)
	add_child(back_wall)

	var left_wall := _box(Vector3(0.35, 76.0, 192.0), Color("#f4f4f0"), 0.98)
	left_wall.position = Vector3(-96.0, 12.0, 0.0)
	add_child(left_wall)

	var right_wall := _box(Vector3(0.35, 76.0, 192.0), Color("#fafaf7"), 0.98)
	right_wall.position = Vector3(96.0, 12.0, 0.0)
	add_child(right_wall)

	var ceiling := _box(Vector3(192.0, 0.35, 192.0), Color("#f7f7f4"), 1.0)
	ceiling.position = Vector3(0.0, 50.0, 0.0)
	add_child(ceiling)


func _build_table() -> void:
	var pedestal := MeshInstance3D.new()
	var pedestal_mesh := CylinderMesh.new()
	pedestal_mesh.top_radius = 2.0
	pedestal_mesh.bottom_radius = 2.35
	pedestal_mesh.height = 24.5
	pedestal_mesh.radial_segments = 48
	pedestal.mesh = pedestal_mesh
	pedestal.material_override = _material(Color("#999ea3"), 0.82)
	pedestal.position = Vector3(0.0, -13.1, 0.0)
	pedestal.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(pedestal)

	var top := MeshInstance3D.new()
	var top_mesh := CylinderMesh.new()
	top_mesh.top_radius = 8.25
	top_mesh.bottom_radius = 8.0
	top_mesh.height = 0.8
	top_mesh.radial_segments = 96
	top.mesh = top_mesh
	top.material_override = _material(Color("#aeb2b6"), 0.72)
	top.position = Vector3(0.0, TABLE_TOP_Y - 0.4, 0.0)
	top.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(top)


func _build_wall_brand() -> void:
	var logo_texture := load(ASSET_ROOT + "/logos/YAKOLAK.svg") as Texture2D
	var company_texture := load(ASSET_ROOT + "/logos/MTKYF.svg") as Texture2D
	var star_texture := load(ASSET_ROOT + "/ui/loading-star.svg") as Texture2D

	var logo := Sprite3D.new()
	logo.texture = logo_texture
	logo.pixel_size = 0.018
	logo.position = Vector3(0.0, 13.0, -95.78)
	logo.modulate = Color("#3f3f3f")
	logo.no_depth_test = false
	add_child(logo)

	var company := Sprite3D.new()
	company.texture = company_texture
	company.pixel_size = 0.008
	company.position = Vector3(0.0, 6.2, -95.76)
	company.modulate = Color("#696969")
	add_child(company)

	wall_star = Sprite3D.new()
	wall_star.texture = star_texture
	wall_star.pixel_size = 0.010
	wall_star.position = Vector3(0.0, 23.0, -95.74)
	wall_star.modulate = Color("#3f3f3f")
	add_child(wall_star)


func _build_camera() -> void:
	camera = Camera3D.new()
	camera.current = true
	camera.fov = 42.0
	camera.near = 0.1
	camera.far = 300.0
	camera.transform = _camera_transform(
		Vector3(0.0, 10.0, -61.36),
		Vector3(0.0, 10.0, -94.16)
	)
	add_child(camera)


func _build_original_game_assets() -> void:
	board = _mesh_from_generated("board.obj", _material(Color("#4a5562"), 0.66))
	board.name = "ApprovedBoardSTL"
	board.scale = Vector3.ONE * U
	board.position = Vector3(0.0, GAME_Y, 0.0)
	add_child(board)

	lid = _mesh_from_generated("lid.obj", _material(Color("#525d68"), 0.62))
	lid.name = "ApprovedLidSTL"
	lid.scale = Vector3.ONE * U
	lid.position = Vector3(0.0, GAME_Y + 62.5 * U, 0.0)
	lid.rotation_degrees = Vector3(0.0, 180.0, 0.0)
	add_child(lid)

	for side in SIDE_ORDER:
		var base := _mesh_from_generated("player_base.obj", _material(Color("#59636e"), 0.70))
		base.name = "ApprovedBase_%s" % side
		base.scale = Vector3.ONE * (U * 0.12)
		base.position = Vector3(0.0, TABLE_TOP_Y - 4.0, 0.0)
		base.rotation_degrees = Vector3(0.0, float(SIDE_ROTATIONS[side]), 0.0)
		base.set_meta("target_position", BASE_TARGETS[side])
		add_child(base)
		bases[side] = base

	_load_scattered_pieces()


func _load_scattered_pieces() -> void:
	var csv_path := ASSET_ROOT + "/layout/intro-scatter.csv"
	var file := FileAccess.open(csv_path, FileAccess.READ)
	if file == null:
		_fail("تعذر قراءة توزيع أحجار الانترو الأصلي")
		return
	file.get_csv_line()
	while not file.eof_reached():
		var row := file.get_csv_line()
		if row.size() < 10 or String(row[0]).is_empty():
			continue
		var side := String(row[1])
		var stack_slot := int(row[2])
		var size_code := String(row[3])
		var mesh_name := _piece_mesh_name(size_code)
		var piece := _mesh_from_generated(mesh_name, _material(SIDE_COLORS[side], 0.30))
		piece.name = "ApprovedPiece_%s_%s_%s" % [side, str(stack_slot), size_code]
		piece.scale = Vector3.ONE * U
		piece.position = Vector3(
			float(row[4]) * U,
			GAME_Y + float(row[5]) * U,
			float(row[6]) * U
		)
		piece.rotation_degrees = Vector3(float(row[7]), float(row[8]), float(row[9]))
		piece.set_meta("side", side)
		piece.set_meta("target_position", _home_target(side, stack_slot))
		piece.set_meta("target_rotation", Vector3.ZERO)
		add_child(piece)
		pieces.append(piece)

	if pieces.size() != 36:
		_fail("عدد أحجار الانترو لا يساوي 36")


func _build_action_button() -> void:
	var canvas := CanvasLayer.new()
	canvas.layer = 20
	add_child(canvas)

	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	margin.offset_left = -126.0
	margin.offset_right = -22.0
	margin.offset_top = 20.0
	margin.offset_bottom = 68.0
	canvas.add_child(margin)

	action_button = Button.new()
	action_button.text = "SKIP"
	action_button.focus_mode = Control.FOCUS_NONE
	action_button.add_theme_font_size_override("font_size", 16)
	action_button.add_theme_color_override("font_color", Color.WHITE)
	action_button.add_theme_stylebox_override("normal", _button_style(Color(0.12, 0.12, 0.12, 0.72)))
	action_button.add_theme_stylebox_override("hover", _button_style(Color(0.08, 0.08, 0.08, 0.90)))
	action_button.pressed.connect(_on_action_pressed)
	margin.add_child(action_button)


func _run_intro() -> void:
	await get_tree().process_frame
	if sequence_cancelled:
		return
	await _animate_star()
	if sequence_cancelled:
		return
	await _wait_seconds(0.28)
	await _reveal_room()
	if sequence_cancelled:
		return
	await _wait_seconds(0.62)
	await _shake_lid()
	if sequence_cancelled:
		return
	await _lift_lid()
	if sequence_cancelled:
		return

	for side in SIDE_ORDER:
		await _assemble_base(side)
		if sequence_cancelled:
			return
		await _assemble_pieces(side)
		if sequence_cancelled:
			return
		await _wait_seconds(0.12)

	_complete_intro()


func _animate_star() -> void:
	var original_position := wall_star.position
	var original_scale := wall_star.scale
	var tween := _new_tween()
	tween.set_trans(Tween.TRANS_CUBIC)
	tween.set_ease(Tween.EASE_IN_OUT)
	tween.tween_property(wall_star, "position", original_position + Vector3(0.0, 1.4, 0.0), 0.23)
	tween.parallel().tween_property(wall_star, "scale", original_scale * Vector3(0.92, 1.08, 1.0), 0.23)
	tween.tween_property(wall_star, "position", original_position, 0.18)
	tween.parallel().tween_property(wall_star, "scale", original_scale * Vector3(1.12, 0.86, 1.0), 0.18)
	tween.tween_property(wall_star, "scale", original_scale, 0.20)
	tween.parallel().tween_property(wall_star, "rotation_degrees", Vector3(0.0, 0.0, 24.0), 0.20)
	tween.tween_property(wall_star, "rotation_degrees", Vector3.ZERO, 0.21)
	await tween.finished


func _reveal_room() -> void:
	var tween := _new_tween()
	tween.set_trans(Tween.TRANS_CUBIC)
	tween.set_ease(Tween.EASE_IN_OUT)
	tween.tween_property(camera, "transform", _play_camera_transform(), 2.20)
	await tween.finished


func _shake_lid() -> void:
	var base_rotation := lid.rotation_degrees
	var tween := _new_tween()
	tween.set_trans(Tween.TRANS_SINE)
	tween.set_ease(Tween.EASE_IN_OUT)
	for angle in [4.0, -5.0, 3.5, -3.0, 1.5, 0.0]:
		tween.tween_property(lid, "rotation_degrees", base_rotation + Vector3(0.0, 0.0, angle), 0.07)
	await tween.finished


func _lift_lid() -> void:
	var tween := _new_tween()
	tween.set_trans(Tween.TRANS_CUBIC)
	tween.set_ease(Tween.EASE_IN_OUT)
	tween.tween_property(lid, "position", lid.position + Vector3(0.0, 740.0 * U, 0.0), 0.90)
	tween.parallel().tween_property(lid, "rotation_degrees", lid.rotation_degrees + Vector3(0.0, 18.0, 5.0), 0.90)
	await tween.finished
	lid.visible = false


func _assemble_base(side: String) -> void:
	var base: MeshInstance3D = bases[side]
	var target: Vector3 = base.get_meta("target_position")
	var target_scale := Vector3.ONE * U
	var tween := _new_tween()
	tween.set_trans(Tween.TRANS_CUBIC)
	tween.set_ease(Tween.EASE_IN_OUT)
	tween.tween_property(base, "position", Vector3(0.0, target.y + 1.6, 0.0), 0.26)
	tween.parallel().tween_property(base, "scale", target_scale, 0.26)
	tween.tween_property(base, "position", target + Vector3(0.0, 1.6, 0.0), 0.62)
	tween.tween_property(base, "position", target, 0.28)
	await tween.finished


func _assemble_pieces(side: String) -> void:
	var side_pieces: Array = []
	for piece in pieces:
		if String(piece.get_meta("side")) == side:
			side_pieces.append(piece)

	for index in range(side_pieces.size()):
		var piece: MeshInstance3D = side_pieces[index]
		var target: Vector3 = piece.get_meta("target_position")
		var midpoint := piece.position.lerp(target, 0.5) + Vector3(0.0, 30.0 * U, 0.0)
		var tween := _new_tween()
		tween.set_trans(Tween.TRANS_CUBIC)
		tween.set_ease(Tween.EASE_IN_OUT)
		tween.tween_interval(float(index) * 0.042)
		tween.tween_property(piece, "position", midpoint, 0.425)
		tween.parallel().tween_property(piece, "rotation_degrees", Vector3.ZERO, 0.425)
		tween.tween_property(piece, "position", target, 0.425)
	await _wait_seconds(0.85 + float(side_pieces.size() - 1) * 0.042)


func _complete_intro() -> void:
	if intro_complete:
		return
	intro_complete = true
	action_button.text = "REPLAY"
	_mark_browser("complete")


func _snap_final() -> void:
	for tween in active_tweens:
		if tween != null and tween.is_valid():
			tween.kill()
	camera.transform = _play_camera_transform()
	wall_star.rotation_degrees = Vector3.ZERO
	wall_star.scale = Vector3.ONE
	lid.visible = false
	for side in SIDE_ORDER:
		var base: MeshInstance3D = bases[side]
		base.position = base.get_meta("target_position")
		base.scale = Vector3.ONE * U
	for piece in pieces:
		piece.position = piece.get_meta("target_position")
		piece.rotation_degrees = Vector3.ZERO
	_complete_intro()


func _on_action_pressed() -> void:
	if intro_complete:
		get_tree().reload_current_scene()
		return
	sequence_cancelled = true
	_snap_final()


func _on_viewport_size_changed() -> void:
	if intro_complete:
		camera.transform = _play_camera_transform()


func _home_target(side: String, stack_slot: int) -> Vector3:
	var offset := float(stack_slot) * 48.0 * U
	match side:
		"right":
			return Vector3(135.0 * U, GAME_Y + 2.0 * U, offset)
		"back":
			return Vector3(offset, GAME_Y + 2.0 * U, -135.0 * U)
		"left":
			return Vector3(-135.0 * U, GAME_Y + 2.0 * U, offset)
		_:
			return Vector3(offset, GAME_Y + 2.0 * U, 135.0 * U)


func _piece_mesh_name(size_code: String) -> String:
	match size_code:
		"s":
			return "piece_small.obj"
		"m":
			return "piece_medium.obj"
		_:
			return "piece_large.obj"


func _play_camera_transform() -> Transform3D:
	var viewport_size := get_viewport().get_visible_rect().size
	var aspect := viewport_size.x / maxf(1.0, viewport_size.y)
	if aspect < 0.82:
		return _camera_transform(Vector3(13.2, 22.4, 18.2), Vector3(0.0, 0.72, 0.0))
	if aspect < 1.35:
		return _camera_transform(Vector3(9.8, 13.0, 11.4), Vector3(0.0, 0.0, 0.0))
	return _camera_transform(Vector3(20.8, 17.2, 20.8), Vector3(0.0, 0.0, 0.0))


func _camera_transform(position: Vector3, target: Vector3) -> Transform3D:
	return Transform3D(Basis(), position).looking_at(target, Vector3.UP)


func _mesh_from_generated(file_name: String, material: Material) -> MeshInstance3D:
	var resource := load(GENERATED_ROOT + "/" + file_name)
	if resource == null or not resource is Mesh:
		_fail("تعذر تحميل المجسم الأصلي: " + file_name)
	var instance := MeshInstance3D.new()
	instance.mesh = resource as Mesh
	instance.material_override = material
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	return instance


func _box(size: Vector3, color: Color, roughness: float) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = size
	var instance := MeshInstance3D.new()
	instance.mesh = mesh
	instance.material_override = _material(color, roughness)
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	return instance


func _material(color: Color, roughness: float) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = roughness
	material.metallic = 0.03
	return material


func _button_style(color: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.corner_radius_top_left = 12
	style.corner_radius_top_right = 12
	style.corner_radius_bottom_left = 12
	style.corner_radius_bottom_right = 12
	return style


func _new_tween() -> Tween:
	var tween := create_tween()
	active_tweens.append(tween)
	return tween


func _wait_seconds(seconds: float) -> void:
	await get_tree().create_timer(seconds).timeout


func _mark_browser(state: String) -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakIntro = '%s';" % state,
			true
		)


func _fail(message: String) -> void:
	push_error(message)
	_mark_browser("error")
