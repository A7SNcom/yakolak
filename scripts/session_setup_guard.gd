extends Node

# Presentation guard for the post-intro setup.
# Keeps the setup completely invisible until BOTH the 2D->3D/closed-box handoff
# and the real unboxing have finished, then tightens the Godot Control layout for
# Arabic mobile UI without touching the approved intro geometry/timeline.

const UI_FONT = preload("res://assets/fonts/DejaVuSans.ttf")
const UI_VERSION: String = "setup-guard-polish-v1"

var intro: Node3D
var preintro: Node
var setup: Node
var root: Control
var card: PanelContainer
var rebuild_pending: bool = false
var last_desired_size: Vector2 = Vector2.ZERO
var last_screen: String = ""


func _ready() -> void:
	process_priority = 1000
	intro = get_parent() as Node3D
	preintro = intro.get_node_or_null("StarToTablePreIntro")
	setup = intro.get_node_or_null("SessionSetup")
	set_process(true)
	if not get_viewport().size_changed.is_connected(_request_refresh):
		get_viewport().size_changed.connect(_request_refresh)
	call_deferred("_refresh", true)


func _process(_delta: float) -> void:
	if setup == null:
		setup = intro.get_node_or_null("SessionSetup")
		if setup == null:
			return
	root = setup.get("root") as Control
	card = setup.get("card") as PanelContainer
	if root == null or card == null:
		return

	var showing: bool = bool(setup.get("showing"))
	var intro_finished: bool = _real_intro_finished()
	if not showing:
		root.visible = false
		return

	# SessionSetup can be asked to show once while pre-intro intentionally sets
	# intro.playing=false for the rigid closed-box drop. Never let that internal
	# state leak onto screen; rendering happens after this process pass.
	if not intro_finished:
		root.visible = false
		_publish_gate("waiting-intro")
		return

	root.visible = true
	_publish_gate("open")
	_refresh(false)


func _real_intro_finished() -> bool:
	if intro == null or preintro == null:
		return false
	return bool(preintro.get("completed")) and not bool(intro.get("playing"))


func _request_refresh() -> void:
	call_deferred("_refresh", true)


func _refresh(force_rebuild: bool = false) -> void:
	if setup == null:
		return
	root = setup.get("root") as Control
	card = setup.get("card") as PanelContainer
	if root == null or card == null:
		return

	var desired: Vector2 = _desired_card_size()
	var screen: String = str(setup.get("active_screen"))
	var changed: bool = card.size.distance_to(desired) > _ui(1.5) or screen != last_screen
	if changed:
		card.size = desired
		_center_card()
		last_desired_size = desired
		last_screen = screen
		if not rebuild_pending and (force_rebuild or not screen.is_empty()):
			rebuild_pending = true
			call_deferred("_rebuild_after_layout")
	else:
		_center_card()
	_polish_tree(root)
	_publish_metrics()


func _rebuild_after_layout() -> void:
	rebuild_pending = false
	if setup == null or card == null:
		return
	# Rebuild after resizing so SessionSetup computes its inner minimum widths
	# from the corrected compact card instead of the old near-fullscreen width.
	setup.call("_rebuild_active_screen")
	call_deferred("_polish_current_tree")


func _polish_current_tree() -> void:
	if root != null:
		_polish_tree(root)
		_center_card()
		_publish_metrics()


func _desired_card_size() -> Vector2:
	var viewport: Vector2 = get_viewport().get_visible_rect().size
	var scale: float = maxf(float(setup.get("canvas_scale")), 0.20)
	var css: Vector2 = setup.get("canvas_css_size") as Vector2
	if css.x < 1.0 or css.y < 1.0:
		css = viewport * scale

	var width_css: float = minf(500.0, maxf(286.0, css.x - (32.0 if css.x < 700.0 else 56.0)))
	var screen: String = str(setup.get("active_screen"))
	var height_css: float
	match screen:
		"question":
			height_css = minf(320.0, css.y - 28.0)
		"invitation":
			height_css = minf(380.0, css.y - 28.0)
		"setup":
			if css.y < 620.0:
				height_css = css.y - 32.0
			else:
				var active_count: int = int(setup.call("_active_count"))
				var preferred: float = 470.0 + maxf(0.0, float(active_count - 1)) * 82.0
				height_css = minf(minf(preferred, 720.0), css.y - 32.0)
		_:
			height_css = minf(520.0, css.y - 28.0)

	var width: float = minf(viewport.x - _ui(16.0), width_css / scale)
	var height: float = minf(viewport.y - _ui(16.0), maxf(280.0, height_css) / scale)
	return Vector2(maxf(_ui(286.0), width), maxf(_ui(280.0), height))


func _center_card() -> void:
	if card == null:
		return
	var viewport: Vector2 = get_viewport().get_visible_rect().size
	card.position = Vector2(
		maxf(0.0, (viewport.x - card.size.x) * 0.5),
		maxf(0.0, (viewport.y - card.size.y) * 0.5)
	)
	card.add_theme_stylebox_override("panel", _card_style())


func _polish_tree(node: Node) -> void:
	if node is Control:
		var control := node as Control
		control.layout_direction = Control.LAYOUT_DIRECTION_RTL

	if node is Label:
		var label := node as Label
		label.add_theme_font_override("font", UI_FONT)
		label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.22))
		label.add_theme_constant_override("shadow_offset_x", int(round(_ui(0.5))))
		label.add_theme_constant_override("shadow_offset_y", int(round(_ui(0.8))))
		label.clip_text = false

	elif node is OptionButton:
		var picker := node as OptionButton
		picker.add_theme_font_override("font", UI_FONT)
		picker.add_theme_font_size_override("font_size", _font_size(16 if _card_css_width() >= 360.0 else 15))
		picker.custom_minimum_size.y = maxf(picker.custom_minimum_size.y, _ui(48.0))
		picker.custom_minimum_size.x = maxf(picker.custom_minimum_size.x, _ui(122.0))
		picker.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		picker.add_theme_color_override("font_color", Color("#f6f6f4"))
		picker.add_theme_color_override("font_hover_color", Color.WHITE)
		picker.add_theme_color_override("font_pressed_color", Color.WHITE)
		picker.add_theme_color_override("font_focus_color", Color.WHITE)
		picker.add_theme_color_override("font_disabled_color", Color("#a9adaf"))
		picker.add_theme_stylebox_override("normal", _picker_style(Color("#2b2e31")))
		picker.add_theme_stylebox_override("hover", _picker_style(Color("#34383b")))
		picker.add_theme_stylebox_override("pressed", _picker_style(Color("#24272a")))
		picker.add_theme_stylebox_override("focus", _picker_style(Color("#34383b")))
		var popup: PopupMenu = picker.get_popup()
		popup.add_theme_font_override("font", UI_FONT)
		popup.add_theme_font_size_override("font_size", _font_size(16))
		popup.add_theme_color_override("font_color", Color("#f6f6f4"))
		popup.add_theme_color_override("font_hover_color", Color.WHITE)

	elif node is Button:
		var button := node as Button
		button.add_theme_font_override("font", UI_FONT)
		button.custom_minimum_size.y = maxf(button.custom_minimum_size.y, _ui(50.0))
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.alignment = HORIZONTAL_ALIGNMENT_CENTER
		# Avoid glyphs that were inconsistent in the exported font/theme.
		if button.text == "＋ لاعب":
			button.text = "إضافة لاعب +"
		elif button.text == "−":
			button.text = "حذف لاعب"
		var foreground: Color = button.get_theme_color("font_color")
		button.add_theme_color_override("font_hover_color", foreground)
		button.add_theme_color_override("font_pressed_color", foreground)
		button.add_theme_color_override("font_focus_color", foreground)
		button.add_theme_color_override("font_disabled_color", Color(foreground.r, foreground.g, foreground.b, 0.48))

	elif node is PanelContainer and node != card:
		var panel := node as PanelContainer
		panel.custom_minimum_size.y = maxf(panel.custom_minimum_size.y, _ui(104.0))

	elif node is HBoxContainer:
		var row := node as HBoxContainer
		row.add_theme_constant_override("separation", int(round(_ui(10.0))))

	for child: Node in node.get_children():
		_polish_tree(child)


func _card_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color("#111315f7")
	style.border_color = Color("#ffffff24")
	style.set_border_width_all(1)
	style.set_corner_radius_all(int(round(_ui(20.0))))
	style.shadow_color = Color(0, 0, 0, 0.48)
	style.shadow_size = int(round(_ui(16.0)))
	style.shadow_offset = Vector2(0, _ui(7.0))
	return style


func _picker_style(background: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.border_color = Color("#ffffff18")
	style.set_border_width_all(1)
	style.set_corner_radius_all(int(round(_ui(12.0))))
	style.content_margin_left = _ui(12.0)
	style.content_margin_right = _ui(12.0)
	style.content_margin_top = _ui(6.0)
	style.content_margin_bottom = _ui(6.0)
	return style


func _ui(css_pixels: float) -> float:
	if setup == null:
		return css_pixels
	return css_pixels / maxf(float(setup.get("canvas_scale")), 0.20)


func _font_size(css_points: int) -> int:
	return maxi(12, int(round(float(css_points) / maxf(float(setup.get("canvas_scale")), 0.20))))


func _card_css_width() -> float:
	if card == null or setup == null:
		return 0.0
	return card.size.x * maxf(float(setup.get("canvas_scale")), 0.20)


func _publish_gate(state: String) -> void:
	if not OS.has_feature("web"):
		return
	var setup_state: String = "visible" if state == "open" else "hidden"
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakSetupGate='" + state + "';" +
		"document.body.dataset.yakolakSetupUi='" + UI_VERSION + "';" +
		"document.body.dataset.yakolakSetup='" + setup_state + "';",
		true
	)


func _publish_metrics() -> void:
	if not OS.has_feature("web") or card == null or setup == null:
		return
	var scale: float = maxf(float(setup.get("canvas_scale")), 0.20)
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakSetupPolishedWidth='" + str(snappedf(card.size.x * scale, 0.1)) + "';" +
		"document.body.dataset.yakolakSetupPolishedHeight='" + str(snappedf(card.size.y * scale, 0.1)) + "';",
		true
	)
