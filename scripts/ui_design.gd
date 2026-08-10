extends RefCounted
class_name YakolakDesign

# Small, game-specific 2D design system. Keep all generic UI geometry and
# interaction states here; domain visuals (player colours, stones, score marks)
# stay with their owning gameplay components.

const VERSION := "yakolak-2d-v1"

const FONT_LIGHT = preload("res://assets/fonts/thmanyahsans-Light.otf")
const FONT_REGULAR = preload("res://assets/fonts/thmanyahsans-Regular.otf")
const FONT_MEDIUM = preload("res://assets/fonts/thmanyahsans-Medium.otf")
const FONT_BOLD = preload("res://assets/fonts/thmanyahsans-Bold.otf")

const TEXT_PRIMARY := Color("#f4f7f6")
const TEXT_MUTED := Color("#cbd7d9")
const TEXT_DARK := Color("#10201f")
const SURFACE := Color("#091014")
const SURFACE_BORDER := Color(0.85, 0.94, 0.95, 0.20)
const FOCUS_BORDER := Color(0.94, 0.97, 0.96, 0.96)
const SHADOW := Color(0.0, 0.0, 0.0, 0.32)

const SPACE_1 := 4.0
const SPACE_2 := 8.0
const SPACE_3 := 12.0
const SPACE_4 := 16.0
const SPACE_6 := 24.0

const RADIUS_CHIP := 10.0
const RADIUS_CONTROL := 14.0
const RADIUS_SURFACE := 18.0
const TOUCH_MIN := 48.0

const FONT_CAPTION := 14
const FONT_BODY := 16
const FONT_TITLE := 24

const HOVER_LIGHTEN := 0.06
const PRESSED_DARKEN := 0.08


static func font_for_size(size: int) -> Font:
	if size >= 22:
		return FONT_BOLD
	if size <= FONT_CAPTION:
		return FONT_LIGHT
	return FONT_MEDIUM


static func surface_style(
	unit: float,
	alpha: float = 0.92,
	radius_css: float = RADIUS_SURFACE,
	padding_css: Vector4 = Vector4(16.0, 12.0, 16.0, 12.0),
	border_color: Color = SURFACE_BORDER,
	shadow_size_css: float = 12.0,
	shadow_y_css: float = 4.0
) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(SURFACE.r, SURFACE.g, SURFACE.b, alpha)
	style.border_color = border_color
	style.set_border_width_all(maxi(1, int(round(unit))))
	style.set_corner_radius_all(int(round(radius_css * unit)))
	style.shadow_color = SHADOW
	style.shadow_size = int(round(shadow_size_css * unit))
	style.shadow_offset = Vector2(0.0, shadow_y_css * unit)
	style.content_margin_left = padding_css.x * unit
	style.content_margin_top = padding_css.y * unit
	style.content_margin_right = padding_css.z * unit
	style.content_margin_bottom = padding_css.w * unit
	return style


static func button_style(
	unit: float,
	background: Color,
	state: String = "normal",
	focused: bool = false,
	radius_css: float = RADIUS_CONTROL
) -> StyleBoxFlat:
	var resolved := background
	if state == "hover":
		resolved = background.lightened(HOVER_LIGHTEN)
	elif state == "pressed":
		resolved = background.darkened(PRESSED_DARKEN)
	elif state == "focus":
		resolved = background.lightened(0.04)

	var style := StyleBoxFlat.new()
	style.bg_color = resolved
	style.border_color = FOCUS_BORDER if focused else Color(1.0, 1.0, 1.0, 0.10)
	style.set_border_width_all(2 if focused else 1)
	style.set_corner_radius_all(int(round(radius_css * unit)))
	style.content_margin_left = SPACE_3 * unit
	style.content_margin_right = SPACE_3 * unit
	style.content_margin_top = SPACE_1 * unit
	style.content_margin_bottom = SPACE_1 * unit
	if focused:
		style.shadow_color = Color(0.92, 0.98, 0.96, 0.18)
		style.shadow_size = int(round(7.0 * unit))
	return style


static func chip_style(unit: float, background: Color = Color(1.0, 1.0, 1.0, 0.09)) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.set_corner_radius_all(int(round(RADIUS_CHIP * unit)))
	style.content_margin_left = SPACE_2 * unit
	style.content_margin_right = SPACE_2 * unit
	style.content_margin_top = SPACE_1 * unit
	style.content_margin_bottom = SPACE_1 * unit
	return style


static func apply_button_contract(
	button: Button,
	unit: float,
	font_size: int,
	foreground: Color,
	background: Color,
	font: Font = FONT_MEDIUM
) -> void:
	button.layout_direction = Control.LAYOUT_DIRECTION_RTL
	button.text_direction = Control.TEXT_DIRECTION_RTL
	button.language = "ar"
	button.focus_mode = Control.FOCUS_ALL
	button.custom_minimum_size.y = maxf(button.custom_minimum_size.y, TOUCH_MIN * unit)
	button.add_theme_font_override("font", font)
	button.add_theme_font_size_override("font_size", font_size)
	button.add_theme_color_override("font_color", foreground)
	button.add_theme_color_override("font_hover_color", foreground)
	button.add_theme_color_override("font_pressed_color", foreground)
	button.add_theme_color_override("font_focus_color", foreground)
	button.add_theme_color_override("font_disabled_color", Color(foreground.r, foreground.g, foreground.b, 0.42))
	button.add_theme_stylebox_override("normal", button_style(unit, background, "normal"))
	button.add_theme_stylebox_override("hover", button_style(unit, background, "hover"))
	button.add_theme_stylebox_override("pressed", button_style(unit, background, "pressed"))
	button.add_theme_stylebox_override("focus", button_style(unit, background, "focus", true))
