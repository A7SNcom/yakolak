extends Node

const Rules = preload("res://scripts/game_rules.gd")
const VERSION := "2.1.0"
const TURN_SECONDS := 18
const UNIT := 0.04

const COLOR_VALUES := {
	"white": Color("#f5f1e8"),
	"blue": Color("#1967d2"),
	"gold": Color("#d6a936"),
	"green": Color("#249a63")
}
const COLOR_AR := {
	"white": "الأبيض",
	"blue": "الأزرق",
	"gold": "الذهبي",
	"green": "الأخضر"
}
const SIZE_AR := {
	"small": "صغير",
	"medium": "وسط",
	"large": "كبير"
}

var rng := RandomNumberGenerator.new()

var world_root: Node3D
var camera: Camera3D
var board_root: Node3D
var pieces_root: Node3D
var score_root: Node3D
var wall_brand: Node3D

var canvas: CanvasLayer
var setup_panel: PanelContainer
var setup_content: VBoxContainer
var hud_panel: PanelContainer
var action_panel: PanelContainer
var action_content: VBoxContainer
var round_label: Label
var turn_label: Label
var timer_label: Label
var scores_label: Label
var status_label: Label
var size_buttons := {}
var cell_buttons: Array = []

var preferred_color := "white"
var player_count := 2
var round_count := 3
var seat_types := {}
var seats: Array = []
var board: Array = []
var inventory := {}
var current_index := 0
var starting_index := 0
var round_number := 1
var selected_size := ""
var state_revision := 0
var turn_deadline_ms := 0
var pending_input := false
var match_active := false
var intro_active := true
var last_timer_value := -1

var home_piece_nodes := {}
var placed_piece_nodes := {}
var score_nodes: Array = []


func _ready() -> void:
	rng.randomize()
	_build_world()
	_build_ui()
	_show_intro_menu()
	get_viewport().size_changed.connect(_on_viewport_size_changed)


func _process(_delta: float) -> void:
	if not match_active or pending_input or turn_deadline_ms <= 0:
		return
	var remaining_ms := turn_deadline_ms - Time.get_ticks_msec()
	var seconds := maxi(0, int(ceil(float(remaining_ms) / 1000.0)))
	if seconds != last_timer_value:
		last_timer_value = seconds
		timer_label.text = "⏱ %02d" % seconds
		if seconds <= 5:
			timer_label.add_theme_color_override("font_color", Color("#b42318"))
		else:
			timer_label.add_theme_color_override("font_color", Color("#171717"))
	if remaining_ms <= 0:
		pending_input = true
		_handle_timeout.call_deferred(state_revision)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("cancel") and match_active and not pending_input:
		selected_size = ""
		status_label.text = "تم إلغاء الاختيار"
		_refresh_action_controls()


# -----------------------------------------------------------------------------
# World
# -----------------------------------------------------------------------------

func _build_world() -> void:
	world_root = Node3D.new()
	world_root.name = "World"
	add_child(world_root)

	var environment := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#efede8")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("#fffaf0")
	env.ambient_light_energy = 0.72
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.environment = env
	world_root.add_child(environment)

	var key := DirectionalLight3D.new()
	key.rotation_degrees = Vector3(-52.0, -28.0, 0.0)
	key.light_energy = 1.15
	key.shadow_enabled = true
	world_root.add_child(key)

	var fill := OmniLight3D.new()
	fill.position = Vector3(-5.0, 7.5, 6.0)
	fill.light_energy = 2.2
	fill.omni_range = 24.0
	fill.light_color = Color("#e8f0ff")
	world_root.add_child(fill)

	var rim := OmniLight3D.new()
	rim.position = Vector3(6.0, 5.0, -7.0)
	rim.light_energy = 1.4
	rim.omni_range = 20.0
	rim.light_color = Color("#ffe7ba")
	world_root.add_child(rim)

	_build_room()
	_build_table_and_board()

	camera = Camera3D.new()
	camera.fov = 45.0
	camera.current = true
	world_root.add_child(camera)
	camera.transform = _camera_transform(Vector3(0.0, 4.0, 2.0), Vector3(0.0, 4.0, -9.8))


func _build_room() -> void:
	var floor := _mesh_box(Vector3(24.0, 0.25, 24.0), Color("#d9d5cd"), 0.92)
	floor.position = Vector3(0.0, -0.55, 0.0)
	world_root.add_child(floor)

	var back_wall := _mesh_box(Vector3(24.0, 10.0, 0.3), Color("#f7f6f2"), 0.96)
	back_wall.position = Vector3(0.0, 4.4, -10.0)
	world_root.add_child(back_wall)

	var side_wall := _mesh_box(Vector3(0.3, 10.0, 20.0), Color("#ebe8e1"), 0.96)
	side_wall.position = Vector3(-12.0, 4.4, 0.0)
	world_root.add_child(side_wall)

	wall_brand = Node3D.new()
	wall_brand.position = Vector3(0.0, 0.0, -9.78)
	world_root.add_child(wall_brand)

	var brand := Label3D.new()
	brand.text = "YAKOLAK"
	brand.font_size = 118
	brand.modulate = Color("#191919")
	brand.outline_size = 2
	brand.position = Vector3(0.0, 4.55, 0.0)
	brand.pixel_size = 0.006
	wall_brand.add_child(brand)

	var subtitle := Label3D.new()
	subtitle.text = "GODOT  •  VERSION 2.1"
	subtitle.font_size = 40
	subtitle.modulate = Color("#5f5f5f")
	subtitle.position = Vector3(0.0, 3.55, 0.0)
	subtitle.pixel_size = 0.006
	wall_brand.add_child(subtitle)

	var star := Label3D.new()
	star.text = "★"
	star.font_size = 112
	star.modulate = Color("#d6a936")
	star.position = Vector3(0.0, 5.7, 0.0)
	star.pixel_size = 0.006
	wall_brand.add_child(star)


func _build_table_and_board() -> void:
	var table := MeshInstance3D.new()
	var table_mesh := CylinderMesh.new()
	table_mesh.top_radius = 7.7
	table_mesh.bottom_radius = 7.25
	table_mesh.height = 0.72
	table_mesh.radial_segments = 64
	table.mesh = table_mesh
	table.material_override = _material(Color("#aaa49a"), 0.78)
	table.position = Vector3(0.0, -0.12, 0.0)
	world_root.add_child(table)

	board_root = Node3D.new()
	board_root.name = "Board"
	world_root.add_child(board_root)

	var board_base := _mesh_box(Vector3(5.55, 0.20, 5.55), Color("#2c2d30"), 0.58)
	board_base.position = Vector3(0.0, 0.38, 0.0)
	board_root.add_child(board_base)

	for cell in range(9):
		var center := _cell_position(cell)
		for size in Rules.SIZES:
			var guide := MeshInstance3D.new()
			guide.mesh = _torus_for_size(size, true)
			guide.material_override = _material(Color(0.68, 0.68, 0.68, 0.38), 0.72, true)
			guide.position = center + Vector3(0.0, 0.01, 0.0)
			board_root.add_child(guide)

	pieces_root = Node3D.new()
	pieces_root.name = "Pieces"
	world_root.add_child(pieces_root)

	score_root = Node3D.new()
	score_root.name = "ScoreMarkers"
	world_root.add_child(score_root)

	_create_all_home_pieces()


func _create_all_home_pieces() -> void:
	home_piece_nodes.clear()
	for color_name in Rules.COLORS:
		home_piece_nodes[color_name] = {"small": [], "medium": [], "large": []}
		var centers := _home_centers(color_name)
		for stack_index in range(3):
			var base := _mesh_box(Vector3(1.45, 0.14, 1.45), Color("#3b3c40"), 0.62)
			base.position = centers[stack_index] + Vector3(0.0, -0.08, 0.0)
			base.set_meta("owner_color", color_name)
			pieces_root.add_child(base)
			for size_index in range(Rules.SIZES.size()):
				var size: String = Rules.SIZES[size_index]
				var piece := MeshInstance3D.new()
				piece.name = "%s_%s_%d" % [color_name, size, stack_index]
				piece.mesh = _torus_for_size(size, false)
				piece.material_override = _material(COLOR_VALUES[color_name], 0.28)
				piece.position = centers[stack_index] + Vector3(0.0, float(size_index) * 0.018, 0.0)
				piece.set_meta("home_position", piece.position)
				piece.set_meta("placed", false)
				piece.set_meta("owner_color", color_name)
				piece.set_meta("piece_size", size)
				piece.visible = false
				pieces_root.add_child(piece)
				home_piece_nodes[color_name][size].append(piece)


func _mesh_box(size: Vector3, color: Color, roughness: float) -> MeshInstance3D:
	var instance := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	instance.mesh = mesh
	instance.material_override = _material(color, roughness)
	return instance


func _material(color: Color, roughness: float, transparent := false) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = roughness
	material.metallic = 0.05
	if transparent or color.a < 0.999:
		material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	return material


func _torus_for_size(size: String, guide: bool) -> TorusMesh:
	var mesh := TorusMesh.new()
	match size:
		"small":
			mesh.inner_radius = 0.22
			mesh.outer_radius = 0.46
		"medium":
			mesh.inner_radius = 0.47
			mesh.outer_radius = 0.75
		_:
			mesh.inner_radius = 0.78
			mesh.outer_radius = 1.08
	mesh.rings = 40 if not guide else 28
	mesh.ring_segments = 16 if not guide else 10
	return mesh


func _cell_position(cell: int) -> Vector3:
	var row := cell / 3
	var col := cell % 3
	return Vector3((float(col) - 1.0) * 48.0 * UNIT, 0.61, (float(row) - 1.0) * 48.0 * UNIT)


func _home_centers(color_name: String) -> Array:
	match color_name:
		"white":
			return [Vector3(5.4, 0.61, -1.92), Vector3(5.4, 0.61, 0.0), Vector3(5.4, 0.61, 1.92)]
		"blue":
			return [Vector3(-1.92, 0.61, -5.4), Vector3(0.0, 0.61, -5.4), Vector3(1.92, 0.61, -5.4)]
		"gold":
			return [Vector3(-5.4, 0.61, -1.92), Vector3(-5.4, 0.61, 0.0), Vector3(-5.4, 0.61, 1.92)]
		_:
			return [Vector3(-1.92, 0.61, 5.4), Vector3(0.0, 0.61, 5.4), Vector3(1.92, 0.61, 5.4)]


func _camera_transform(position: Vector3, target: Vector3) -> Transform3D:
	return Transform3D(Basis(), position).looking_at(target, Vector3.UP)


func _play_camera_transform() -> Transform3D:
	var aspect := get_viewport().get_visible_rect().size.x / maxf(1.0, get_viewport().get_visible_rect().size.y)
	if aspect < 0.82:
		return _camera_transform(Vector3(0.0, 14.0, 14.8), Vector3(0.0, 0.35, 0.0))
	if aspect < 1.35:
		return _camera_transform(Vector3(9.2, 11.6, 13.2), Vector3(0.0, 0.35, 0.0))
	return _camera_transform(Vector3(9.0, 10.4, 11.8), Vector3(0.0, 0.35, 0.0))


# -----------------------------------------------------------------------------
# UI
# -----------------------------------------------------------------------------

func _build_ui() -> void:
	canvas = CanvasLayer.new()
	add_child(canvas)

	setup_panel = PanelContainer.new()
	setup_panel.set_anchors_preset(Control.PRESET_CENTER)
	setup_panel.offset_left = -285.0
	setup_panel.offset_right = 285.0
	setup_panel.offset_top = -250.0
	setup_panel.offset_bottom = 250.0
	setup_panel.add_theme_stylebox_override("panel", _panel_style(Color(0.985, 0.98, 0.965, 0.96), 22))
	canvas.add_child(setup_panel)

	var setup_margin := MarginContainer.new()
	setup_margin.add_theme_constant_override("margin_left", 30)
	setup_margin.add_theme_constant_override("margin_right", 30)
	setup_margin.add_theme_constant_override("margin_top", 28)
	setup_margin.add_theme_constant_override("margin_bottom", 28)
	setup_panel.add_child(setup_margin)
	setup_content = VBoxContainer.new()
	setup_content.alignment = BoxContainer.ALIGNMENT_CENTER
	setup_content.add_theme_constant_override("separation", 14)
	setup_margin.add_child(setup_content)

	hud_panel = PanelContainer.new()
	hud_panel.set_anchors_preset(Control.PRESET_TOP_WIDE)
	hud_panel.offset_left = 16.0
	hud_panel.offset_right = -16.0
	hud_panel.offset_top = 14.0
	hud_panel.offset_bottom = 84.0
	hud_panel.add_theme_stylebox_override("panel", _panel_style(Color(0.985, 0.98, 0.965, 0.93), 16))
	canvas.add_child(hud_panel)
	var hud_margin := MarginContainer.new()
	hud_margin.add_theme_constant_override("margin_left", 18)
	hud_margin.add_theme_constant_override("margin_right", 18)
	hud_margin.add_theme_constant_override("margin_top", 10)
	hud_margin.add_theme_constant_override("margin_bottom", 10)
	hud_panel.add_child(hud_margin)
	var hud := HBoxContainer.new()
	hud.add_theme_constant_override("separation", 18)
	hud_margin.add_child(hud)
	round_label = _label("الجولة", 20, HORIZONTAL_ALIGNMENT_LEFT)
	turn_label = _label("الدور", 20, HORIZONTAL_ALIGNMENT_CENTER)
	turn_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	timer_label = _label("⏱ 18", 23, HORIZONTAL_ALIGNMENT_CENTER)
	scores_label = _label("", 18, HORIZONTAL_ALIGNMENT_RIGHT)
	scores_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hud.add_child(round_label)
	hud.add_child(turn_label)
	hud.add_child(timer_label)
	hud.add_child(scores_label)

	action_panel = PanelContainer.new()
	action_panel.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	action_panel.offset_left = 14.0
	action_panel.offset_right = -14.0
	action_panel.offset_top = -218.0
	action_panel.offset_bottom = -14.0
	action_panel.add_theme_stylebox_override("panel", _panel_style(Color(0.985, 0.98, 0.965, 0.95), 18))
	canvas.add_child(action_panel)
	var action_margin := MarginContainer.new()
	action_margin.add_theme_constant_override("margin_left", 20)
	action_margin.add_theme_constant_override("margin_right", 20)
	action_margin.add_theme_constant_override("margin_top", 14)
	action_margin.add_theme_constant_override("margin_bottom", 14)
	action_panel.add_child(action_margin)
	action_content = VBoxContainer.new()
	action_content.add_theme_constant_override("separation", 9)
	action_margin.add_child(action_content)
	status_label = _label("", 18, HORIZONTAL_ALIGNMENT_CENTER)
	action_content.add_child(status_label)
	var controls := HBoxContainer.new()
	controls.alignment = BoxContainer.ALIGNMENT_CENTER
	controls.add_theme_constant_override("separation", 18)
	action_content.add_child(controls)

	var sizes_box := VBoxContainer.new()
	sizes_box.custom_minimum_size = Vector2(190, 0)
	sizes_box.add_theme_constant_override("separation", 7)
	controls.add_child(sizes_box)
	var sizes_title := _label("اختر حجم الحجر", 17, HORIZONTAL_ALIGNMENT_CENTER)
	sizes_box.add_child(sizes_title)
	for size in Rules.SIZES:
		var button := _button(SIZE_AR[size], 18)
		button.pressed.connect(_select_size.bind(size))
		sizes_box.add_child(button)
		size_buttons[size] = button

	var grid_box := VBoxContainer.new()
	grid_box.custom_minimum_size = Vector2(280, 0)
	grid_box.add_theme_constant_override("separation", 7)
	controls.add_child(grid_box)
	var grid_title := _label("اختر خانة", 17, HORIZONTAL_ALIGNMENT_CENTER)
	grid_box.add_child(grid_title)
	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 7)
	grid.add_theme_constant_override("v_separation", 7)
	grid_box.add_child(grid)
	for cell in range(9):
		var cell_button := _button(str(cell + 1), 18)
		cell_button.custom_minimum_size = Vector2(76, 42)
		cell_button.pressed.connect(_cell_pressed.bind(cell))
		grid.add_child(cell_button)
		cell_buttons.append(cell_button)

	hud_panel.visible = false
	action_panel.visible = false


func _panel_style(color: Color, radius: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.corner_radius_top_left = radius
	style.corner_radius_top_right = radius
	style.corner_radius_bottom_left = radius
	style.corner_radius_bottom_right = radius
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.18)
	style.shadow_size = 12
	style.border_width_left = 1
	style.border_width_right = 1
	style.border_width_top = 1
	style.border_width_bottom = 1
	style.border_color = Color(0.1, 0.1, 0.1, 0.08)
	return style


func _label(text: String, font_size: int, alignment: HorizontalAlignment) -> Label:
	var label := Label.new()
	label.text = text
	label.horizontal_alignment = alignment
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", Color("#171717"))
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return label


func _button(text: String, font_size: int) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(0, 46)
	button.add_theme_font_size_override("font_size", font_size)
	button.focus_mode = Control.FOCUS_ALL
	return button


func _clear_setup() -> void:
	for child in setup_content.get_children():
		child.queue_free()


func _add_setup_title(title: String, subtitle := "") -> void:
	var heading := _label(title, 31, HORIZONTAL_ALIGNMENT_CENTER)
	heading.add_theme_color_override("font_color", Color("#111111"))
	setup_content.add_child(heading)
	if subtitle != "":
		var detail := _label(subtitle, 17, HORIZONTAL_ALIGNMENT_CENTER)
		detail.add_theme_color_override("font_color", Color("#5b5b5b"))
		setup_content.add_child(detail)


func _add_back_button(callback: Callable) -> void:
	var back := _button("رجوع", 17)
	back.pressed.connect(callback)
	setup_content.add_child(back)


func _show_intro_menu() -> void:
	intro_active = true
	setup_panel.visible = true
	_clear_setup()
	_add_setup_title("ياكلك", "نسخة 2.1 الجديدة — Godot + GDScript")
	var description := _label("بناء جديد بالكامل بمنطق لعب واحد ومستقل عن العرض.", 18, HORIZONTAL_ALIGNMENT_CENTER)
	description.add_theme_color_override("font_color", Color("#4f4f4f"))
	setup_content.add_child(description)
	var start := _button("ابدأ اللعبة", 22)
	start.custom_minimum_size = Vector2(0, 58)
	start.pressed.connect(_begin_setup)
	setup_content.add_child(start)
	var version := _label("YAKOLAK %s • Godot 4.7.1" % VERSION, 14, HORIZONTAL_ALIGNMENT_CENTER)
	version.add_theme_color_override("font_color", Color("#747474"))
	setup_content.add_child(version)


func _begin_setup() -> void:
	pending_input = true
	setup_panel.visible = false
	var tween := create_tween()
	tween.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	tween.tween_property(camera, "transform", _play_camera_transform(), 2.2)
	await tween.finished
	intro_active = false
	pending_input = false
	_show_color_step()


func _show_color_step() -> void:
	setup_panel.visible = true
	_clear_setup()
	_add_setup_title("اختر لونك المفضل", "سيكون هذا اللون أول مقعد في ترتيب اللعب")
	for color_name in Rules.COLORS:
		var button := _button(COLOR_AR[color_name], 20)
		button.add_theme_color_override("font_color", Color("#101010") if color_name != "blue" else Color.WHITE)
		var normal := _panel_style(COLOR_VALUES[color_name], 13)
		button.add_theme_stylebox_override("normal", normal)
		button.add_theme_stylebox_override("hover", normal)
		button.pressed.connect(_choose_color.bind(color_name))
		setup_content.add_child(button)


func _choose_color(color_name: String) -> void:
	preferred_color = color_name
	_show_count_step()


func _show_count_step() -> void:
	_clear_setup()
	_add_setup_title("كم عدد اللاعبين؟", "اختر 2 أو 3 أو 4 مقاعد")
	for count in [2, 3, 4]:
		var button := _button("%d لاعبين" % count, 20)
		button.pressed.connect(_choose_player_count.bind(count))
		setup_content.add_child(button)
	_add_back_button(_show_color_step)


func _choose_player_count(count: int) -> void:
	player_count = count
	seat_types.clear()
	var ordered := Rules.ordered_colors(preferred_color, player_count)
	seat_types[ordered[0]] = "human"
	for index in range(1, ordered.size()):
		seat_types[ordered[index]] = "computer"
	_show_seat_step()


func _show_seat_step() -> void:
	_clear_setup()
	_add_setup_title("حدد نوع كل مقعد", "نفس القواعد تعمل للبشر والكمبيوتر")
	var ordered := Rules.ordered_colors(preferred_color, player_count)
	var you := _label("%s — أنت" % COLOR_AR[ordered[0]], 19, HORIZONTAL_ALIGNMENT_CENTER)
	setup_content.add_child(you)
	for index in range(1, ordered.size()):
		var color_name: String = ordered[index]
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 12)
		var name_label := _label(COLOR_AR[color_name], 18, HORIZONTAL_ALIGNMENT_RIGHT)
		name_label.custom_minimum_size = Vector2(130, 42)
		row.add_child(name_label)
		var option := OptionButton.new()
		option.custom_minimum_size = Vector2(260, 44)
		option.add_item("كمبيوتر")
		option.add_item("لاعب محلي")
		option.selected = 0 if seat_types[color_name] == "computer" else 1
		option.item_selected.connect(_seat_type_changed.bind(color_name))
		row.add_child(option)
		setup_content.add_child(row)
	var online_note := _label("الأونلاين سيستخدم نفس المحرك المنطقي عبر Authority Adapter في الإصدار التالي.", 14, HORIZONTAL_ALIGNMENT_CENTER)
	online_note.add_theme_color_override("font_color", Color("#6b6255"))
	setup_content.add_child(online_note)
	var continue_button := _button("متابعة", 20)
	continue_button.pressed.connect(_show_round_step)
	setup_content.add_child(continue_button)
	_add_back_button(_show_count_step)


func _seat_type_changed(index: int, color_name: String) -> void:
	seat_types[color_name] = "computer" if index == 0 else "human"


func _show_round_step() -> void:
	_clear_setup()
	_add_setup_title("عدد الجولات", "النقاط تستمر بين الجولات")
	for count in [3, 5]:
		var button := _button("%d جولات" % count, 20)
		button.pressed.connect(_choose_round_count.bind(count))
		setup_content.add_child(button)
	_add_back_button(_show_seat_step)


func _choose_round_count(count: int) -> void:
	round_count = count
	_show_ready_step()


func _show_ready_step() -> void:
	_clear_setup()
	_add_setup_title("جاهزون؟", "راجع الإعداد ثم ابدأ")
	var ordered := Rules.ordered_colors(preferred_color, player_count)
	var lines: Array[String] = []
	for color_name in ordered:
		var type_text := "كمبيوتر" if seat_types[color_name] == "computer" else "لاعب محلي"
		lines.append("%s — %s" % [COLOR_AR[color_name], type_text])
	var summary := _label("\n".join(lines) + "\n\nعدد الجولات: %d" % round_count, 18, HORIZONTAL_ALIGNMENT_CENTER)
	setup_content.add_child(summary)
	var start := _button("ابدأ المباراة", 22)
	start.custom_minimum_size = Vector2(0, 58)
	start.pressed.connect(_start_match)
	setup_content.add_child(start)
	_add_back_button(_show_round_step)


# -----------------------------------------------------------------------------
# Match lifecycle
# -----------------------------------------------------------------------------

func _start_match() -> void:
	seats.clear()
	var ordered := Rules.ordered_colors(preferred_color, player_count)
	for color_name in ordered:
		seats.append({
			"color": color_name,
			"type": seat_types[color_name],
			"score": 0
		})
	board = Rules.create_empty_board()
	inventory = Rules.create_inventory(seats)
	starting_index = 0
	current_index = 0
	round_number = 1
	state_revision = 1
	selected_size = ""
	placed_piece_nodes.clear()
	_clear_score_markers()
	_prepare_piece_visibility()
	setup_panel.visible = false
	hud_panel.visible = true
	action_panel.visible = true
	await _play_unboxing()
	_start_turn()


func _prepare_piece_visibility() -> void:
	var active_colors: Array = []
	for seat in seats:
		active_colors.append(seat.color)
	for color_name in Rules.COLORS:
		for size in Rules.SIZES:
			for piece in home_piece_nodes[color_name][size]:
				piece.visible = active_colors.has(color_name)
				piece.position = piece.get_meta("home_position")
				piece.scale = Vector3.ONE
				piece.set_meta("placed", false)


func _play_unboxing() -> void:
	pending_input = true
	status_label.text = "تجهيز الطاولة…"
	var order := ["white", "gold", "green", "blue"]
	for color_name in order:
		if not home_piece_nodes.has(color_name):
			continue
		for size in Rules.SIZES:
			for piece in home_piece_nodes[color_name][size]:
				if not piece.visible:
					continue
				var final_position: Vector3 = piece.get_meta("home_position")
				piece.position = final_position + Vector3(0.0, 2.2, 0.0)
				var tween := create_tween()
				tween.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
				tween.tween_property(piece, "position", final_position, 0.34)
		await get_tree().create_timer(0.12).timeout
	pending_input = false


func _start_turn() -> void:
	if seats.is_empty():
		return
	match_active = true
	pending_input = false
	selected_size = ""
	last_timer_value = -1
	turn_deadline_ms = Time.get_ticks_msec() + TURN_SECONDS * 1000
	var seat: Dictionary = seats[current_index]
	round_label.text = "الجولة %d/%d" % [round_number, round_count]
	turn_label.text = "الدور: %s" % COLOR_AR[seat.color]
	status_label.text = "اختر حجم الحجر" if seat.type == "human" else "الكمبيوتر يفكر…"
	_update_scores()
	_refresh_action_controls()
	if seat.type == "computer":
		pending_input = true
		_run_bot_turn(state_revision)


func _select_size(size: String) -> void:
	if not match_active or pending_input:
		return
	var seat: Dictionary = seats[current_index]
	if seat.type != "human":
		return
	var legal := Rules.legal_cells(board, inventory, seat.color, size)
	if legal.is_empty():
		status_label.text = "لا توجد حركة متاحة لهذا الحجم"
		return
	selected_size = size
	status_label.text = "اختر الخانة للحجر %s" % SIZE_AR[size]
	_refresh_action_controls()


func _cell_pressed(cell: int) -> void:
	if selected_size == "" or pending_input or not match_active:
		return
	_attempt_move(selected_size, cell, state_revision)


func _attempt_move(size: String, cell: int, expected_revision: int) -> void:
	if expected_revision != state_revision or pending_input or not match_active:
		return
	var seat: Dictionary = seats[current_index]
	if not Rules.is_legal_move(board, inventory, seat.color, size, cell):
		status_label.text = "حركة غير صالحة — اختر خانة أخرى"
		_refresh_action_controls()
		return
	pending_input = true
	_refresh_action_controls()
	var result := Rules.commit_move(board, inventory, seat.color, size, cell)
	if not result.accepted:
		pending_input = false
		status_label.text = "تم رفض الحركة"
		_refresh_action_controls()
		return
	state_revision += 1
	selected_size = ""
	status_label.text = "تم اعتماد الحركة"
	await _animate_piece_to_cell(seat.color, size, cell)
	if bool(result.victory.won):
		await _finish_round_win(seat.color, result.victory)
		return
	var next_index := Rules.next_seat_with_move(current_index, seats, board, inventory)
	if next_index < 0:
		await _finish_round_draw()
		return
	current_index = next_index
	pending_input = false
	_start_turn()


func _animate_piece_to_cell(color_name: String, size: String, cell: int) -> void:
	var piece := _take_home_piece(color_name, size)
	if piece == null:
		return
	piece.set_meta("placed", true)
	placed_piece_nodes["%d:%s" % [cell, size]] = piece
	var target := _cell_position(cell)
	var start: Vector3 = piece.position
	var mid := (start + target) * 0.5 + Vector3(0.0, 1.5, 0.0)
	var tween := create_tween()
	tween.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	tween.tween_property(piece, "position", mid, 0.24)
	tween.tween_property(piece, "position", target + Vector3(0.0, _size_height(size), 0.0), 0.28)
	await tween.finished


func _take_home_piece(color_name: String, size: String) -> MeshInstance3D:
	for piece in home_piece_nodes[color_name][size]:
		if piece.visible and not bool(piece.get_meta("placed")):
			return piece
	return null


func _size_height(size: String) -> float:
	match size:
		"small": return 0.07
		"medium": return 0.045
		_: return 0.02


func _run_bot_turn(expected_revision: int) -> void:
	await get_tree().create_timer(rng.randf_range(0.42, 0.74)).timeout
	if expected_revision != state_revision or not match_active:
		return
	var seat: Dictionary = seats[current_index]
	var move := Rules.choose_bot_move(board, inventory, seat.color, rng)
	pending_input = false
	if move.is_empty():
		pending_input = true
		await _handle_timeout(expected_revision)
		return
	_attempt_move(move.size, move.cell, expected_revision)


func _handle_timeout(expected_revision: int) -> void:
	if expected_revision != state_revision or not match_active:
		pending_input = false
		return
	var seat: Dictionary = seats[current_index]
	status_label.text = "انتهى وقت %s — تم تجاوز الدور" % COLOR_AR[seat.color]
	state_revision += 1
	await get_tree().create_timer(0.52).timeout
	var next_index := Rules.next_seat_with_move(current_index, seats, board, inventory)
	if next_index < 0:
		await _finish_round_draw()
		return
	current_index = next_index
	pending_input = false
	_start_turn()


func _finish_round_win(color_name: String, victory: Dictionary) -> void:
	match_active = false
	turn_deadline_ms = 0
	for seat in seats:
		if seat.color == color_name:
			seat.score = int(seat.score) + 1
			_add_score_marker(color_name, int(seat.score))
			break
	_update_scores()
	status_label.text = "فاز %s بالجولة!" % COLOR_AR[color_name]
	await _pulse_winning_pieces(victory.pieces)
	_show_round_result("فوز %s" % COLOR_AR[color_name], _victory_text(victory.type))


func _finish_round_draw() -> void:
	match_active = false
	turn_deadline_ms = 0
	status_label.text = "انتهت الجولة بالتعادل"
	await get_tree().create_timer(1.0).timeout
	_show_round_result("تعادل", "لا توجد أي حركة قانونية متبقية")


func _pulse_winning_pieces(pieces: Array) -> void:
	var nodes: Array = []
	for item in pieces:
		var key := "%d:%s" % [int(item.cell), String(item.size)]
		if placed_piece_nodes.has(key):
			nodes.append(placed_piece_nodes[key])
	for pulse in range(5):
		var up := create_tween().set_parallel(true)
		for piece in nodes:
			up.tween_property(piece, "scale", Vector3.ONE * 1.18, 0.16)
		await up.finished
		var down := create_tween().set_parallel(true)
		for piece in nodes:
			down.tween_property(piece, "scale", Vector3.ONE, 0.16)
		await down.finished


func _victory_text(type: String) -> String:
	match type:
		"complete_cell": return "أكمل الأحجام الثلاثة في خانة واحدة"
		"graded_line": return "أكمل خطًا متدرجًا: صغير، وسط، كبير"
		_: return "أكمل خطًا من الحجم نفسه"


func _show_round_result(title: String, detail: String) -> void:
	action_panel.visible = false
	setup_panel.visible = true
	_clear_setup()
	_add_setup_title(title, detail)
	if round_number >= round_count:
		_show_match_end_content()
	else:
		var continue_button := _button("الجولة التالية", 21)
		continue_button.pressed.connect(_next_round)
		setup_content.add_child(continue_button)
		var exit := _button("العودة للإعداد", 17)
		exit.pressed.connect(_return_to_setup)
		setup_content.add_child(exit)


func _next_round() -> void:
	round_number += 1
	starting_index = (starting_index + 1) % seats.size()
	current_index = starting_index
	state_revision += 1
	board = Rules.create_empty_board()
	inventory = Rules.create_inventory(seats)
	selected_size = ""
	await _return_pieces_home()
	placed_piece_nodes.clear()
	setup_panel.visible = false
	action_panel.visible = true
	_start_turn()


func _show_match_end_content() -> void:
	var high_score := -1
	for seat in seats:
		high_score = maxi(high_score, int(seat.score))
	var winners: Array[String] = []
	for seat in seats:
		if int(seat.score) == high_score:
			winners.append(COLOR_AR[seat.color])
	var result_text := "الفائز: %s" % winners[0] if winners.size() == 1 else "تعادل بين: %s" % "، ".join(winners)
	var result := _label(result_text, 21, HORIZONTAL_ALIGNMENT_CENTER)
	setup_content.add_child(result)
	var rematch := _button("إعادة المباراة", 21)
	rematch.pressed.connect(_rematch)
	setup_content.add_child(rematch)
	var setup := _button("العودة للإعداد", 18)
	setup.pressed.connect(_return_to_setup)
	setup_content.add_child(setup)


func _rematch() -> void:
	for seat in seats:
		seat.score = 0
	_clear_score_markers()
	round_number = 1
	starting_index = 0
	current_index = 0
	state_revision += 1
	board = Rules.create_empty_board()
	inventory = Rules.create_inventory(seats)
	await _return_pieces_home()
	placed_piece_nodes.clear()
	setup_panel.visible = false
	action_panel.visible = true
	_update_scores()
	_start_turn()


func _return_to_setup() -> void:
	match_active = false
	pending_input = false
	turn_deadline_ms = 0
	await _return_pieces_home()
	placed_piece_nodes.clear()
	hud_panel.visible = false
	action_panel.visible = false
	_clear_score_markers()
	_show_color_step()


func _return_pieces_home() -> void:
	var tween := create_tween().set_parallel(true)
	for color_name in Rules.COLORS:
		for size in Rules.SIZES:
			for piece in home_piece_nodes[color_name][size]:
				if bool(piece.get_meta("placed")):
					tween.tween_property(piece, "position", piece.get_meta("home_position"), 0.58).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
				piece.scale = Vector3.ONE
				piece.set_meta("placed", false)
	if tween.is_running():
		await tween.finished


func _add_score_marker(color_name: String, score: int) -> void:
	var marker := MeshInstance3D.new()
	var mesh := CylinderMesh.new()
	mesh.top_radius = 0.18
	mesh.bottom_radius = 0.18
	mesh.height = 0.09
	mesh.radial_segments = 24
	marker.mesh = mesh
	marker.material_override = _material(COLOR_VALUES[color_name], 0.3)
	var offset := (float(score - 1) - 1.0) * 0.5
	match color_name:
		"white": marker.position = Vector3(4.45, 0.56, offset)
		"blue": marker.position = Vector3(offset, 0.56, -4.45)
		"gold": marker.position = Vector3(-4.45, 0.56, offset)
		_: marker.position = Vector3(offset, 0.56, 4.45)
	score_root.add_child(marker)
	score_nodes.append(marker)


func _clear_score_markers() -> void:
	for marker in score_nodes:
		if is_instance_valid(marker):
			marker.queue_free()
	score_nodes.clear()


func _update_scores() -> void:
	var parts: Array[String] = []
	for seat in seats:
		parts.append("%s %d" % [COLOR_AR[seat.color], int(seat.score)])
	scores_label.text = "  |  ".join(parts)


func _refresh_action_controls() -> void:
	if seats.is_empty():
		return
	var seat: Dictionary = seats[current_index]
	var human_turn := match_active and not pending_input and seat.type == "human"
	for size in Rules.SIZES:
		var button: Button = size_buttons[size]
		button.disabled = not human_turn or Rules.legal_cells(board, inventory, seat.color, size).is_empty()
		button.button_pressed = selected_size == size
	var legal_cells: Array = []
	if human_turn and selected_size != "":
		legal_cells = Rules.legal_cells(board, inventory, seat.color, selected_size)
	for cell in range(9):
		cell_buttons[cell].disabled = not legal_cells.has(cell)


func _on_viewport_size_changed() -> void:
	if camera == null or intro_active:
		return
	camera.transform = _play_camera_transform()
	var portrait := get_viewport().get_visible_rect().size.x < get_viewport().get_visible_rect().size.y
	if portrait:
		action_panel.offset_top = -270.0
	else:
		action_panel.offset_top = -218.0
