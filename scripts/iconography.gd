extends Node

# YAKOLAK icon system: one vector family for generic UI controls.
# Keep game/brand symbols (loading star, stones, score markers) domain-specific.
# Lucide 1.27.0 uses a 24px grid and 2px rounded stroke by default.
const ICON_SYSTEM := "lucide-svg-1.27.0"
const ICON_RATIO := 0.46
const ICON_MIN_PX := 18

# Scene-owned resources make SVG dependencies explicit to Godot's Web exporter.
# This avoids relying on font glyphs or runtime/network icon loading.
@export var close_icon: Texture2D
@export var menu_icon: Texture2D

var apply_attempts: int = 0


func _ready() -> void:
	if not get_viewport().size_changed.is_connected(_on_viewport_resized):
		get_viewport().size_changed.connect(_on_viewport_resized)
	call_deferred("_apply_after_ready")


func _apply_after_ready() -> void:
	await get_tree().process_frame
	_apply_iconography()


func _on_viewport_resized() -> void:
	apply_attempts = 0
	call_deferred("_apply_iconography")


func _apply_iconography() -> void:
	apply_attempts += 1
	var root := get_parent()
	if root == null:
		return

	var close_ok := false
	var menu_ok := false
	var setup := root.get_node_or_null("SessionSetup")
	if setup != null and close_icon != null:
		var close_value: Variant = setup.get("dialog_close_button")
		if close_value is Button:
			var close_button := close_value as Button
			_apply_icon_button(close_button, close_icon, "إغلاق")
			close_ok = close_button.text.is_empty() and close_button.icon == close_icon

	var gameplay := root.get_node_or_null("PostIntroGameplay")
	if gameplay != null and menu_icon != null:
		var menu_value: Variant = gameplay.get("quick_button")
		if menu_value is Button:
			var menu_button := menu_value as Button
			_apply_icon_button(menu_button, menu_icon, "القائمة")
			menu_ok = menu_button.text.is_empty() and menu_button.icon == menu_icon

	if (not close_ok or not menu_ok) and apply_attempts < 4:
		call_deferred("_retry_next_frame")
		return

	_publish_icon_audit(close_ok, menu_ok)
	if close_ok and menu_ok:
		print("YAKOLAK_ICON_AUDIT_OK system=%s controls=close,menu rtl=non-directional" % ICON_SYSTEM)
	else:
		push_error("YAKOLAK_ICON_AUDIT_FAILED close=%s menu=%s resources=%s/%s" % [str(close_ok), str(menu_ok), str(close_icon != null), str(menu_icon != null)])


func _retry_next_frame() -> void:
	await get_tree().process_frame
	_apply_iconography()


func _apply_icon_button(button: Button, texture: Texture2D, accessible_name: String) -> void:
	# The visual meaning is carried by SVG, never by a Unicode glyph or icon font.
	button.text = ""
	button.icon = texture
	button.expand_icon = true
	button.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
	button.tooltip_text = accessible_name

	var side: float = minf(button.size.x, button.size.y)
	if side <= 1.0:
		side = minf(button.custom_minimum_size.x, button.custom_minimum_size.y)
	if side <= 1.0:
		side = 48.0
	var icon_width: int = maxi(ICON_MIN_PX, int(round(side * ICON_RATIO)))
	button.add_theme_constant_override("icon_max_width", icon_width)

	var normal := Color("#f4f7f6")
	button.add_theme_color_override("icon_normal_color", normal)
	button.add_theme_color_override("icon_hover_color", Color.WHITE)
	button.add_theme_color_override("icon_pressed_color", Color.WHITE)
	button.add_theme_color_override("icon_focus_color", Color.WHITE)
	button.add_theme_color_override("icon_disabled_color", Color(normal.r, normal.g, normal.b, 0.42))
	button.set_meta("yakolak_icon_system", ICON_SYSTEM)
	button.set_meta("yakolak_icon_grid", 24)
	button.set_meta("yakolak_icon_stroke", 2)


func _publish_icon_audit(close_ok: bool, menu_ok: bool) -> void:
	if not OS.has_feature("web"):
		return
	var passed := close_ok and menu_ok
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakIconSystem='" + ICON_SYSTEM + "';" +
		"document.body.dataset.yakolakIconClose='x|icon-only|24-grid|stroke-2';" +
		"document.body.dataset.yakolakIconMenu='ellipsis|icon-only|24-grid|stroke-2';" +
		"document.body.dataset.yakolakIconRtl='no-directional-controls';" +
		"document.body.dataset.yakolakIconAudit='" + ("passed" if passed else "failed") + "';",
		true
	)
