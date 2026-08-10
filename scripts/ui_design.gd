extends RefCounted
class_name YakolakDesign

# Game-specific 2D design system. The physical table stays visually dominant;
# generic UI should read as a restrained game layer, not a stack of app cards.

const VERSION := "yakolak-2d-v2"

const FONT_LIGHT = preload("res://assets/fonts/thmanyahsans-Light.otf")
const FONT_REGULAR = preload("res://assets/fonts/thmanyahsans-Regular.otf")
const FONT_MEDIUM = preload("res://assets/fonts/thmanyahsans-Medium.otf")
const FONT_BOLD = preload("res://assets/fonts/thmanyahsans-Bold.otf")

# Warm ivory ties the flat UI to the marble pieces; cool muted text recedes.
const TEXT_PRIMARY := Color("#f7f5ef")
const TEXT_MUTED := Color("#b9c5c4")
const TEXT_DARK := Color("#101817")
const SURFACE := Color("#0b1114")
const SURFACE_BORDER := Color(0.85, 0.94, 0.95, 0.08)
const FOCUS_BORDER := Color(0.96, 0.97, 0.93, 0.98)
const SHADOW := Color(0.0, 0.0, 0.0, 0.38)

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
const FONT_TITLE := 26

const HOVER_LIGHTEN := 0.055
const PRESSED_DARKEN := 0.075


static func font_for_size(size: int) -> Font:
	if size >= 22:
		return FONT_BOLD
	if size <= FONT_CAPTION:
		return FONT_LIGHT
	return FONT_MEDIUM


static func surface_style(
	unit: float,
	alpha: float = 0.84,
	radius_css: float = RADIUS_SURFACE,
	padding_css: Vector4 = Vector4(16.0, 12.0, 16.0, 12.0),
	border_color: Color = SURFACE_BORDER,
	shadow_size_css: float = 14.0,
	shadow_y_css: float = 5.0
) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(SURFACE.r, SURFACE.g, SURFACE.b, alpha)
	style.border_color = border_color
	# Hairlines are reserved for semantic emphasis/focus. Generic surfaces rely
	# on depth and contrast instead of putting every group in another rectangle.
	var border_width: int = maxi(1, int(round(unit))) if border_color.a >= 0.12 else 0
	style.set_border_width_all(border_width)
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
	var luma: float = background.r * 0.2126 + background.g * 0.7152 + background.b * 0.0722
	var is_light_primary: bool = background.a >= 0.75 and luma >= 0.62
	var resolved := background
	# Old setup screens supplied several saturated dark fills. Preserve a hint of
	# their meaning while pulling them into one charcoal game palette so only the
	# ivory primary action wins the hierarchy.
	if background.a >= 0.60 and luma < 0.28:
		resolved = background.lerp(Color(0.055, 0.085, 0.095, background.a), 0.58)
	if state == "hover":
		resolved = resolved.lightened(HOVER_LIGHTEN)
	elif state == "pressed":
		resolved = resolved.darkened(PRESSED_DARKEN)
	elif state == "focus":
		resolved = resolved.lightened(0.04)

	var style := StyleBoxFlat.new()
	style.bg_color = resolved
	style.border_color = FOCUS_BORDER if focused else Color(1.0, 1.0, 1.0, 0.0)
	style.set_border_width_all(2 if focused else 0)
	style.set_corner_radius_all(int(round(radius_css * unit)))
	style.content_margin_left = SPACE_4 * unit
	style.content_margin_right = SPACE_4 * unit
	style.content_margin_top = SPACE_1 * unit
	style.content_margin_bottom = SPACE_1 * unit
	if is_light_primary and not focused:
		style.shadow_color = Color(0.0, 0.0, 0.0, 0.24)
		style.shadow_size = int(round(6.0 * unit))
		style.shadow_offset = Vector2(0.0, 2.0 * unit)
	if focused:
		style.shadow_color = Color(0.92, 0.98, 0.96, 0.18)
		style.shadow_size = int(round(7.0 * unit))
	return style


static func chip_style(unit: float, background: Color = Color(1.0, 1.0, 1.0, 0.075)) -> StyleBoxFlat:
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
