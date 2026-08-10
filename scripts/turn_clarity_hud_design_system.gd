extends "res://scripts/turn_clarity_hud.gd"

# Design-system adapter for the match HUD. Player accent and circular stone
# indicators remain semantic exceptions; generic surface/spacing/type do not.
const Design = preload("res://scripts/ui_design.gd")


func _build_hud() -> void:
	super._build_hud()
	if player_label != null:
		player_label.add_theme_font_override("font", Design.FONT_BOLD)
	if action_label != null:
		action_label.add_theme_font_override("font", Design.FONT_MEDIUM)
	for value: Variant in indicator_counts.values():
		if value is Label:
			(value as Label).add_theme_font_override("font", Design.FONT_MEDIUM)
	_publish_design_contract()


func _layout_hud() -> void:
	super._layout_hud()
	if content != null:
		content.add_theme_constant_override("separation", int(round(_u(Design.SPACE_2))))
	if header != null:
		header.add_theme_constant_override("separation", int(round(_u(Design.SPACE_2))))
	if pieces_row != null:
		pieces_row.add_theme_constant_override("separation", int(round(_u(Design.SPACE_3))))


func _apply_card_style(accent: Color, neutral: bool) -> void:
	var border: Color = Color(0.86, 0.94, 0.94, 0.18) if neutral else Color(accent, 0.88)
	var style: StyleBoxFlat = Design.surface_style(
		_u(1.0),
		0.90,
		Design.RADIUS_SURFACE,
		Vector4(Design.SPACE_3, Design.SPACE_2, Design.SPACE_3, Design.SPACE_2),
		border,
		10.0,
		3.0
	)
	if not neutral:
		style.set_border_width(SIDE_RIGHT, maxi(2, int(round(_u(4.0)))))
	card.add_theme_stylebox_override("panel", style)

	if action_chip != null:
		action_chip.add_theme_stylebox_override("panel", Design.chip_style(_u(1.0)))

	if not neutral and color_swatch != null:
		var swatch_style := StyleBoxFlat.new()
		swatch_style.bg_color = accent
		swatch_style.border_color = Color.WHITE
		swatch_style.set_border_width_all(maxi(1, int(round(_u(1.0)))))
		swatch_style.set_corner_radius_all(int(round(_u(Design.RADIUS_CHIP))))
		color_swatch.add_theme_stylebox_override("panel", swatch_style)


func _publish_design_contract() -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakDesignHud='tokens+primitives';" +
			"document.body.dataset.yakolakDesignHudSemanticExceptions='player-accent,stone-circles';",
			true
		)
