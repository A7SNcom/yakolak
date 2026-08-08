extends "res://scripts/gameplay_session_camera_safe.gd"

# Gameplay presentation: true Thmanyah Sans hierarchy, a minimal floating menu,
# and physical score stars inspired by the accepted Three.js scoring behavior.
# Score/result overlays stay out of the player's sightline so the board remains
# the primary interface at all times.

const THMANYAH_REGULAR = preload("res://assets/fonts/thmanyahsans-Regular.otf")
const THMANYAH_LIGHT = preload("res://assets/fonts/thmanyahsans-Light.otf")
const THMANYAH_MEDIUM = preload("res://assets/fonts/thmanyahsans-Medium.otf")
const THMANYAH_BOLD = preload("res://assets/fonts/thmanyahsans-Bold.otf")
const SCORE_STAR_SCALE: float = 0.052
const SCORE_STAR_LANE_DISTANCE: float = 4.30
const SCORE_STAR_DROP_HEIGHT: float = 7.0
const SCORE_STAR_DROP_SECONDS: float = 0.68
const SCORE_STAR_OFFSETS: Array[float] = [0.0, -0.62, 0.62, -1.24, 1.24]
const SCORE_AXES: Dictionary = {
	"right": Vector3(1.0, 0.0, 0.0),
	"left": Vector3(-1.0, 0.0, 0.0),
	"front": Vector3(0.0, 0.0, 1.0),
	"back": Vector3(0.0, 0.0, -1.0),
}

var quick_layer: CanvasLayer
var quick_root: Control
var quick_button: Button
var quick_panel: PanelContainer
var quick_round_button: Button
var quick_sound_button: Button
var quick_pointer_block_until: int = 0
var score_star_root: Node3D
var rendered_score_counts: Dictionary = {}
var local_round_auto_due_msec: int = 0
var hud_visibility_state: String = ""
var quick_visibility_state: String = ""


func _ready() -> void:
	super._ready()
	_apply_thmanyah_to_hud()
	_build_quick_menu()
	call_deferred("_ensure_score_star_root")
	_layout_hud()
	_sync_hud_visibility()
	_sync_quick_menu()
	_publish_score_star_state()


func _process(delta: float) -> void:
	super._process(delta)
	_sync_score_stars()
	_sync_hud_visibility()
	_sync_quick_menu()
	_maybe_auto_advance_round()


func _input(event: InputEvent) -> void:
	var pressed: bool = false
	var position: Vector2 = Vector2.ZERO
	if event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		pressed = touch.pressed
		position = touch.position
	elif event is InputEventMouseButton:
		var mouse := event as InputEventMouseButton
		pressed = mouse.pressed and mouse.button_index == MOUSE_BUTTON_LEFT
		position = mouse.position
	if pressed and quick_button != null and quick_button.visible:
		if Time.get_ticks_msec() < quick_pointer_block_until:
			get_viewport().set_input_as_handled()
			return
		if quick_button.get_global_rect().has_point(position):
			return
		if quick_panel != null and quick_panel.visible:
			if quick_panel.get_global_rect().has_point(position):
				return
			quick_panel.visible = false
			quick_pointer_block_until = Time.get_ticks_msec() + 280
			get_viewport().set_input_as_handled()
			return
	super._input(event)


func _apply_thmanyah_to_hud() -> void:
	if turn_label != null:
		turn_label.add_theme_font_override("font", THMANYAH_MEDIUM)
	if score_label != null:
		score_label.add_theme_font_override("font", THMANYAH_LIGHT)
	if result_button != null:
		result_button.add_theme_font_override("font", THMANYAH_BOLD)


func _build_quick_menu() -> void:
	quick_layer = CanvasLayer.new()
	quick_layer.layer = 30
	add_child(quick_layer)

	quick_root = Control.new()
	quick_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	quick_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	quick_layer.add_child(quick_root)

	quick_button = Button.new()
	quick_button.text = "•••"
	quick_button.focus_mode = Control.FOCUS_NONE
	quick_button.add_theme_font_override("font", THMANYAH_BOLD)
	quick_button.add_theme_font_size_override("font_size", _hud_font_size(17))
	quick_button.add_theme_color_override("font_color", Color("#f4f7f6"))
	quick_button.add_theme_color_override("font_hover_color", Color.WHITE)
	quick_button.add_theme_stylebox_override("normal", _quick_style(Color(0.035, 0.055, 0.067, 0.86), 15.0))
	quick_button.add_theme_stylebox_override("hover", _quick_style(Color(0.055, 0.085, 0.096, 0.94), 15.0))
	quick_button.add_theme_stylebox_override("pressed", _quick_style(Color(0.025, 0.045, 0.055, 0.96), 15.0))
	quick_button.pressed.connect(_toggle_quick_menu)
	quick_root.add_child(quick_button)

	quick_panel = PanelContainer.new()
	quick_panel.add_theme_stylebox_override("panel", _quick_style(Color(0.035, 0.055, 0.067, 0.94), 17.0))
	quick_panel.visible = false
	quick_root.add_child(quick_panel)

	var menu := VBoxContainer.new()
	menu.add_theme_constant_override("separation", int(round(_hud_length(7.0))))
	quick_panel.add_child(menu)

	quick_round_button = _quick_action("الجولة التالية")
	quick_round_button.add_theme_font_override("font", THMANYAH_BOLD)
	quick_round_button.pressed.connect(_quick_round_action)
	quick_round_button.visible = false
	menu.add_child(quick_round_button)

	quick_sound_button = _quick_action("الصوت")
	quick_sound_button.pressed.connect(_toggle_sound)
	menu.add_child(quick_sound_button)
	var exit := _quick_action("خروج")
	exit.pressed.connect(_quick_exit)
	menu.add_child(exit)
	_layout_quick_menu()


func _quick_action(text_value: String) -> Button:
	var button := Button.new()
	button.text = text_value
	button.layout_direction = Control.LAYOUT_DIRECTION_RTL
	button.focus_mode = Control.FOCUS_NONE
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.custom_minimum_size = Vector2(_hud_length(142.0), _hud_length(44.0))
	button.add_theme_font_override("font", THMANYAH_MEDIUM)
	button.add_theme_font_size_override("font_size", _hud_font_size(15))
	button.add_theme_color_override("font_color", Color("#f4f7f6"))
	button.add_theme_color_override("font_hover_color", Color.WHITE)
	button.add_theme_stylebox_override("normal", _quick_action_style(Color(1.0, 1.0, 1.0, 0.055)))
	button.add_theme_stylebox_override("hover", _quick_action_style(Color(1.0, 1.0, 1.0, 0.11)))
	button.add_theme_stylebox_override("pressed", _quick_action_style(Color(1.0, 1.0, 1.0, 0.07)))
	return button


func _quick_style(background: Color, radius_css: float) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.border_color = Color(0.85, 0.94, 0.95, 0.20)
	style.set_border_width_all(1)
	style.set_corner_radius_all(int(round(_hud_length(radius_css))))
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.30)
	style.shadow_size = int(round(_hud_length(10.0)))
	style.shadow_offset = Vector2(0.0, _hud_length(4.0))
	style.content_margin_left = _hud_length(8.0)
	style.content_margin_right = _hud_length(8.0)
	style.content_margin_top = _hud_length(7.0)
	style.content_margin_bottom = _hud_length(7.0)
	return style


func _quick_action_style(background: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.set_corner_radius_all(int(round(_hud_length(11.0))))
	return style


func _layout_hud() -> void:
	super._layout_hud()
	if turn_label != null:
		turn_label.offset_left = _hud_length(70.0)
	_layout_quick_menu()
	_apply_thmanyah_to_hud()


func _layout_quick_menu() -> void:
	if quick_button == null or quick_panel == null:
		return
	var margin: float = _hud_length(12.0)
	var button_size: float = _hud_length(48.0)
	quick_button.position = Vector2(margin, margin)
	quick_button.size = Vector2(button_size, button_size)
	quick_button.add_theme_font_size_override("font_size", _hud_font_size(17))
	quick_panel.position = Vector2(margin, margin + button_size + _hud_length(8.0))
	var action_count: int = 3 if quick_round_button != null and quick_round_button.visible else 2
	quick_panel.size = Vector2(_hud_length(158.0), _hud_length(18.0 + float(action_count) * 51.0))
	for child: Node in quick_panel.get_children():
		if child is VBoxContainer:
			(child as VBoxContainer).add_theme_constant_override("separation", int(round(_hud_length(7.0))))


func _toggle_quick_menu() -> void:
	if quick_panel == null or not match_initialized:
		return
	quick_panel.visible = not quick_panel.visible


func _toggle_sound() -> void:
	AudioServer.set_bus_mute(0, not AudioServer.is_bus_mute(0))


func _quick_exit() -> void:
	if quick_panel != null:
		quick_panel.visible = false
	_return_to_setup()


func _quick_round_action() -> void:
	if quick_panel != null:
		quick_panel.visible = false
	if online_cancelled:
		_return_to_setup()
		return
	_on_round_action()


func _on_round_action() -> void:
	local_round_auto_due_msec = 0
	super._on_round_action()


func _show_round_result() -> void:
	# Keep the board itself as the result presentation. A physical score star
	# lands in front of the winner; no score sheet or modal covers the game.
	if result_button != null:
		result_button.visible = false
	local_round_auto_due_msec = 0
	if not online_active and not match_complete:
		local_round_auto_due_msec = Time.get_ticks_msec() + 1250
	_publish_result_overlay_state()


func _maybe_auto_advance_round() -> void:
	if local_round_auto_due_msec <= 0:
		return
	if Time.get_ticks_msec() < local_round_auto_due_msec:
		return
	local_round_auto_due_msec = 0
	if round_complete and not match_complete and not online_active and not action_in_progress:
		_on_round_action()


func _sync_hud_visibility() -> void:
	var show_turn: bool = match_initialized or online_active
	if turn_label != null:
		turn_label.visible = show_turn
	if score_label != null:
		score_label.visible = false
	if result_button != null:
		result_button.visible = false
	var state: String = "visible" if show_turn else "hidden"
	if state == hud_visibility_state:
		return
	hud_visibility_state = state
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakHudVisibility='" + state + "';" +
			"document.body.dataset.yakolakScoreHud='hidden';" +
			"document.body.dataset.yakolakResultOverlay='hidden';" +
			"document.body.dataset.yakolakGameplayFont='thmanyah';" +
			"document.body.dataset.yakolakGameplayFontWeights='regular,medium,bold';",
			true
		)


func _sync_quick_menu() -> void:
	if quick_button == null:
		return
	var should_show: bool = match_initialized
	quick_button.visible = should_show
	if quick_panel != null and not should_show:
		quick_panel.visible = false
	if quick_round_button != null:
		quick_round_button.visible = should_show and round_complete
		if online_cancelled:
			quick_round_button.text = "عودة للإعداد"
		elif match_complete:
			quick_round_button.text = "إعادة المباراة"
		else:
			quick_round_button.text = "الجولة التالية"
	_layout_quick_menu()
	var state: String = "ready" if should_show else "hidden"
	if state == quick_visibility_state:
		return
	quick_visibility_state = state
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakQuickMenu='" + state + "';", true)


func _ensure_score_star_root() -> void:
	if score_star_root != null or intro == null:
		return
	var existing := intro.get_node_or_null("GameplayScoreStars") as Node3D
	if existing != null:
		score_star_root = existing
		return
	score_star_root = Node3D.new()
	score_star_root.name = "GameplayScoreStars"
	intro.add_child(score_star_root)


func _sync_score_stars() -> void:
	_ensure_score_star_root()
	if score_star_root == null:
		return
	if not match_initialized:
		if score_star_root.get_child_count() > 0 or not rendered_score_counts.is_empty():
			_clear_score_stars()
		return

	var must_rebuild: bool = false
	for direction_value: Variant in SCORE_AXES.keys():
		var direction: String = str(direction_value)
		if int(scores.get(direction, 0)) < int(rendered_score_counts.get(direction, 0)):
			must_rebuild = true
			break
	if must_rebuild:
		_clear_score_stars()

	for player: Dictionary in players:
		var direction: String = str(player.get("direction", ""))
		if direction.is_empty():
			continue
		var current: int = int(scores.get(direction, 0))
		var rendered: int = int(rendered_score_counts.get(direction, 0))
		while rendered < current:
			if not _spawn_score_star(direction, rendered):
				break
			rendered += 1
		rendered_score_counts[direction] = rendered


func _spawn_score_star(direction: String, score_index: int) -> bool:
	if intro == null or score_star_root == null:
		return false
	var source := intro.get_node_or_null("ApprovedStarTableSVG") as MeshInstance3D
	if source == null or source.mesh == null:
		return false
	var axis: Vector3 = SCORE_AXES.get(direction, Vector3(1.0, 0.0, 0.0)) as Vector3
	var tangent := Vector3(-axis.z, 0.0, axis.x)
	var offset: float = SCORE_STAR_OFFSETS[score_index % SCORE_STAR_OFFSETS.size()]
	var landing := axis * SCORE_STAR_LANE_DISTANCE + tangent * offset + Vector3(0.0, 0.16, 0.0)

	var material := StandardMaterial3D.new()
	material.albedo_color = Color("#d8dde0")
	material.roughness = 0.46
	material.metallic = 0.24
	material.cull_mode = BaseMaterial3D.CULL_DISABLED

	var star := MeshInstance3D.new()
	star.name = "ScoreStar_%s_%d" % [direction, score_index + 1]
	star.mesh = source.mesh
	star.material_override = material
	star.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	star.position = landing + Vector3.UP * SCORE_STAR_DROP_HEIGHT
	star.scale = Vector3.ONE * 0.010
	star.quaternion = (Quaternion(Vector3.RIGHT, deg_to_rad(22.0)) * Quaternion(Vector3.UP, deg_to_rad(28.0)) * source.quaternion).normalized()
	score_star_root.add_child(star)

	var tween: Tween = create_tween()
	tween.set_parallel(true)
	tween.tween_property(star, "position", landing, SCORE_STAR_DROP_SECONDS).set_trans(Tween.TRANS_QUART).set_ease(Tween.EASE_IN)
	tween.tween_property(star, "scale", Vector3.ONE * SCORE_STAR_SCALE, SCORE_STAR_DROP_SECONDS).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(star, "quaternion", source.quaternion, SCORE_STAR_DROP_SECONDS).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	_publish_score_star_state()
	return true


func _clear_score_stars() -> void:
	if score_star_root != null:
		for child: Node in score_star_root.get_children():
			score_star_root.remove_child(child)
			child.queue_free()
	rendered_score_counts.clear()
	_publish_score_star_state()


func _publish_score_star_state() -> void:
	if not OS.has_feature("web"):
		return
	var count: int = score_star_root.get_child_count() if score_star_root != null else 0
	JavaScriptBridge.eval("document.body.dataset.yakolakScoreStars='%d';" % count, true)


func _publish_result_overlay_state() -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakResultOverlay='hidden';" +
			"document.body.dataset.yakolakScoreHud='hidden';",
			true
		)


func _return_to_setup() -> void:
	local_round_auto_due_msec = 0
	_clear_score_stars()
	super._return_to_setup()
	_sync_hud_visibility()
