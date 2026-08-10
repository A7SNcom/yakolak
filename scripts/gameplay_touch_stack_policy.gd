extends "res://scripts/gameplay_interaction_feedback.gd"

# Closed nested L/M/S stones are one gameplay target: the stack. The exact size
# is chosen only after the tray separates the three stones. Therefore a missed
# finger-center may be rescued when every visible probe agrees on the same stack
# side, even if probes touch different nested sizes. Once the tray is open we
# keep the stricter exact-size policy from the parent picker.
const STACK_TOUCH_RADII_CSS: Array[float] = [9.0, 18.0]
const STACK_TOUCH_ANGLES: int = 8


func _touch_piece_at_pointer(screen_position: Vector2, candidate_indices: Array[int]) -> int:
	if tray_open:
		return super._touch_piece_at_pointer(screen_position, candidate_indices)

	var exact: int = _mesh_piece_at_pointer(screen_position, candidate_indices)
	if exact >= 0:
		return exact
	if not _touch_rescue_allowed(screen_position):
		return -1

	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var resolved_side: int = 999
	var representative: int = -1
	var agreeing_hits: int = 0
	for radius_css: float in STACK_TOUCH_RADII_CSS:
		for angle_index: int in range(STACK_TOUCH_ANGLES):
			var angle: float = TAU * float(angle_index) / float(STACK_TOUCH_ANGLES)
			var probe: Vector2 = screen_position + _touch_css_offset_to_internal(radius_css, angle)
			if probe.x < 0.0 or probe.y < 0.0 or probe.x >= viewport_size.x or probe.y >= viewport_size.y:
				continue
			var hit: int = _mesh_piece_at_pointer(probe, candidate_indices)
			if hit < 0:
				continue
			var side: int = int((piece_records[hit] as Dictionary).get("side", 999))
			if representative < 0:
				representative = hit
				resolved_side = side
			elif side != resolved_side:
				# Neighboring stacks both lie inside the finger neighborhood: do not guess.
				return -1
			agreeing_hits += 1

	return representative if representative >= 0 and agreeing_hits >= 2 else -1
