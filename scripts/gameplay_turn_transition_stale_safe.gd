extends "res://scripts/gameplay_authoritative_turn_state.gd"

# UX-TURN-40: authoritative turn/lifecycle revisions own presentation retargeting.
# Authority, room reconciliation, move validation, and network retry behavior stay
# in the inherited layers. This final production layer only cancels/retargets
# camera + selection presentation; lighting and the compact indicator already
# consume the same monotonic authoritative signal in their own single owners.

var turn_presentation_applied_revision: int = -1
var turn_presentation_serial: int = 0
var turn_presentation_target_direction: String = ""
var turn_presentation_settled_direction: String = ""
var turn_presentation_target_revision: int = -1
var turn_presentation_target_lifecycle: String = ""
var turn_presentation_retarget_count: int = 0
var turn_presentation_cancel_count: int = 0
var turn_presentation_stale_finish_count: int = 0

# UX-TURN-41: cache mobile safe-area/layout data so the inherited per-frame quick
# menu sync never needs to query browser CSS on every frame.
var turn41_safe_insets_css: Vector4 = Vector4.ZERO
var turn41_safe_viewport_size: Vector2 = Vector2(-1.0, -1.0)
var turn41_safe_insets_read_msec: int = -10000
const TURN41_SAFE_INSET_REFRESH_MS: int = 500
var turn41_layout_publish_key: String = ""


func _process(delta: float) -> void:
	super._process(delta)
	if quick_button == null or quick_panel == null:
		return
	if Time.get_ticks_msec() - turn41_safe_insets_read_msec >= TURN41_SAFE_INSET_REFRESH_MS:
		_layout_quick_menu()


func _transition_to_current_player() -> void:
	# Online presentation starts only after the authoritative room snapshot is
	# published. Offline/shared-device play keeps its established camera/tutorial
	# lifecycle untouched.
	if online_active:
		return
	super._transition_to_current_player()


func _publish_authoritative_turn_state(lifecycle: String) -> void:
	super._publish_authoritative_turn_state(lifecycle)
	# UX-TURN-40 is deliberately scoped to accepted online authority. Offline
	# presentation remains owned by the inherited gameplay camera path.
	if not online_active or authoritative_turn_cached_snapshot.is_empty():
		return
	_retarget_authoritative_turn_presentation(authoritative_turn_cached_snapshot.duplicate(true))


func _retarget_authoritative_turn_presentation(snapshot: Dictionary) -> void:
	var revision: int = int(snapshot.get("revision", -1))
	if revision >= 0 and revision <= turn_presentation_applied_revision:
		return
	if revision >= 0:
		turn_presentation_applied_revision = revision

	_cancel_stale_selection_presentation()

	if not bool(snapshot.get("valid", false)):
		_cancel_turn_camera_presentation(revision, str(snapshot.get("lifecycle", "no-turn")))
		return

	var direction: String = str(snapshot.get("direction", ""))
	var lifecycle: String = str(snapshot.get("lifecycle", ""))
	if not DIRECTION_VECTORS.has(direction) or camera == null:
		_cancel_turn_camera_presentation(revision, "invalid-direction" if lifecycle.is_empty() else lifecycle)
		return

	if turn_camera_active and turn_presentation_target_direction == direction:
		# Same visual target, newer authority. Keep the in-flight motion instead of
		# restarting it, but transfer its completion metadata to the latest revision
		# so the old callback cannot settle/publish the previous authoritative owner.
		turn_presentation_target_revision = revision
		turn_presentation_target_lifecycle = lifecycle
		turn_presentation_retarget_count += 1
		_publish_turn_presentation_state("retarget-adopted", revision, lifecycle)
		return
	if not turn_camera_active and turn_presentation_settled_direction == direction:
		turn_presentation_target_direction = direction
		turn_presentation_target_revision = revision
		turn_presentation_target_lifecycle = lifecycle
		_publish_turn_presentation_state("settled", revision, lifecycle)
		return

	_start_authoritative_turn_camera(direction, revision, lifecycle)


func _start_authoritative_turn_camera(direction: String, revision: int, lifecycle: String) -> void:
	turn_presentation_serial += 1
	var serial: int = turn_presentation_serial
	if camera_tween != null and camera_tween.is_valid():
		camera_tween.kill()
		turn_presentation_retarget_count += 1
	camera_tween = null

	var axis: Vector3 = DIRECTION_VECTORS.get(direction, Vector3(1.0, 0.0, 0.0)) as Vector3
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var aspect: float = viewport_size.x / maxf(viewport_size.y, 1.0)
	var portrait_weight: float = clampf((0.92 - aspect) / 0.46, 0.0, 1.0)
	var radius: float = lerpf(18.5, 28.0, portrait_weight)
	var height: float = lerpf(15.5, 23.0, portrait_weight)
	var target_fov: float = lerpf(50.0, 72.0, portrait_weight)

	turn_presentation_target_direction = direction
	turn_presentation_target_revision = revision
	turn_presentation_target_lifecycle = lifecycle
	turn_camera_direction = direction
	turn_camera_start_position = camera.position
	turn_camera_target_position = axis * radius + Vector3(0.0, height, 0.0)
	turn_camera_start_fov = camera.fov
	turn_camera_target_fov = target_fov
	turn_camera_effective_fov = _effective_turn_fov(target_fov)
	turn_camera_focus = Vector3(0.0, 0.42, 0.0)
	turn_camera_active = true
	camera_transition = true
	camera.current = true
	_ensure_game_scene_visible()

	var crosses_back_wall: bool = turn_camera_start_position.z < STUDIO_WALL_SAFE_Z or turn_camera_target_position.z < STUDIO_WALL_SAFE_Z
	_set_studio_backdrop_visible(not crosses_back_wall)

	camera_tween = create_tween()
	camera_tween.tween_method(
		Callable(self, "_apply_authoritative_turn_camera_progress").bind(serial),
		0.0,
		1.0,
		CAMERA_TRANSITION
	).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	camera_tween.finished.connect(_finish_authoritative_turn_camera.bind(serial, direction))
	_apply_authoritative_turn_camera_progress(0.0, serial)
	_publish_turn_camera(direction, aspect, radius, height, target_fov)
	_publish_effective_turn_fov(target_fov, turn_camera_effective_fov)
	_publish_camera_health("start")
	_publish_turn_presentation_state("transitioning", revision, lifecycle)


func _apply_authoritative_turn_camera_progress(progress: float, serial: int) -> void:
	if serial != turn_presentation_serial or not turn_camera_active or camera == null:
		return
	var t: float = clampf(progress, 0.0, 1.0)
	camera.position = turn_camera_start_position.lerp(turn_camera_target_position, t)
	camera.fov = lerpf(turn_camera_start_fov, turn_camera_effective_fov, t)
	camera.current = true
	camera.look_at(turn_camera_focus, Vector3.UP)


func _finish_authoritative_turn_camera(serial: int, direction: String) -> void:
	if serial != turn_presentation_serial:
		turn_presentation_stale_finish_count += 1
		return
	if direction != turn_presentation_target_direction:
		turn_presentation_stale_finish_count += 1
		return
	var snapshot: Dictionary = authoritative_turn_snapshot()
	if not bool(snapshot.get("valid", false)) or str(snapshot.get("direction", "")) != direction:
		turn_presentation_stale_finish_count += 1
		return
	var settled_revision: int = int(snapshot.get("revision", turn_presentation_target_revision))
	var settled_lifecycle: String = str(snapshot.get("lifecycle", turn_presentation_target_lifecycle))
	if settled_revision < turn_presentation_target_revision:
		turn_presentation_stale_finish_count += 1
		return

	camera_tween = null
	turn_presentation_target_revision = settled_revision
	turn_presentation_target_lifecycle = settled_lifecycle
	turn_presentation_settled_direction = direction
	# The inherited camera-safe finisher snaps exactly once, restores backdrop
	# visibility, and preserves the existing offline readiness behavior. Online
	# readiness remains authoritative and is never delayed by this presentation.
	super._finish_camera_transition()
	_publish_turn_presentation_state("settled", settled_revision, settled_lifecycle)


func _cancel_turn_camera_presentation(revision: int, lifecycle: String) -> void:
	turn_presentation_serial += 1
	if camera_tween != null and camera_tween.is_valid():
		camera_tween.kill()
		turn_presentation_cancel_count += 1
	camera_tween = null
	turn_camera_active = false
	camera_transition = false
	turn_presentation_target_direction = ""
	turn_presentation_settled_direction = ""
	turn_presentation_target_revision = revision
	turn_presentation_target_lifecycle = lifecycle
	if camera != null:
		camera.current = true
		_ensure_game_scene_visible()
		_set_studio_backdrop_visible(camera.position.z >= STUDIO_WALL_SAFE_Z)
	_publish_turn_presentation_state("cancelled", revision, lifecycle)


func _cancel_stale_selection_presentation() -> void:
	# Selection/tray motion is presentation only. Kill it before restoring pieces
	# so no old tween can lift or recolor the previous owner's stones afterward.
	if tray_tween != null and tray_tween.is_valid():
		tray_tween.kill()
	tray_tween = null
	if tray_open:
		_close_piece_tray(-1, true)
	elif selected_index >= 0 and not move_active:
		super._clear_selection()


func _publish_turn_presentation_state(state: String, revision: int, lifecycle: String) -> void:
	if not OS.has_feature("web"):
		return
	var tween_state: String = "running" if camera_tween != null and camera_tween.is_valid() else "none"
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakTurnPresentationOwner='authoritative-revision-controller';" +
		"document.body.dataset.yakolakTurnPresentationState='%s';" % _turn_js(state) +
		"document.body.dataset.yakolakTurnPresentationRevision='%d';" % revision +
		"document.body.dataset.yakolakTurnPresentationLifecycle='%s';" % _turn_js(lifecycle) +
		"document.body.dataset.yakolakTurnPresentationTarget='%s';" % _turn_js(turn_presentation_target_direction) +
		"document.body.dataset.yakolakTurnPresentationSettled='%s';" % _turn_js(turn_presentation_settled_direction) +
		"document.body.dataset.yakolakTurnPresentationTween='%s';" % tween_state +
		"document.body.dataset.yakolakTurnPresentationSerial='%d';" % turn_presentation_serial +
		"document.body.dataset.yakolakTurnPresentationTargetRevision='%d';" % turn_presentation_target_revision +
		"document.body.dataset.yakolakTurnPresentationRetargets='%d';" % turn_presentation_retarget_count +
		"document.body.dataset.yakolakTurnPresentationCancels='%d';" % turn_presentation_cancel_count +
		"document.body.dataset.yakolakTurnPresentationStaleFinishes='%d';" % turn_presentation_stale_finish_count +
		"document.body.dataset.yakolakTurnPresentationSelection='%d';" % selected_index +
		"document.body.dataset.yakolakTurnPresentationTray='%s';" % ("open" if tray_open else "closed"),
		true
	)


# UX-TURN-41 owns only the floating Settings geometry. It does not resize or
# translate the gameplay canvas/camera. On the narrowest portrait, the button
# moves below the turn capsule only when its touch rect would enter the capsule's
# 8px reserved band. Wider screens retain the approved top-right placement.
func _layout_quick_menu() -> void:
	if quick_button == null or quick_panel == null:
		return
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var now_msec: int = Time.get_ticks_msec()
	var viewport_changed: bool = viewport_size != turn41_safe_viewport_size
	var safe_refresh_due: bool = now_msec - turn41_safe_insets_read_msec >= TURN41_SAFE_INSET_REFRESH_MS
	if viewport_changed or safe_refresh_due:
		turn41_safe_viewport_size = viewport_size
		turn41_safe_insets_read_msec = now_msec
		var refreshed_safe: Vector4 = _turn41_read_safe_insets_css(viewport_size)
		if refreshed_safe != turn41_safe_insets_css:
			turn41_safe_insets_css = refreshed_safe
			turn41_layout_publish_key = ""

	var left_margin_css: float = maxf(12.0, turn41_safe_insets_css.x + 8.0)
	var top_css: float = maxf(12.0, turn41_safe_insets_css.y + 8.0)
	var right_margin_css: float = maxf(12.0, turn41_safe_insets_css.z + 8.0)
	var button_size := Vector2(_hud_length(96.0), _hud_length(48.0))
	var panel_width: float = _hud_length(158.0)
	var button_x: float = maxf(_hud_length(left_margin_css), viewport_size.x - _hud_length(right_margin_css) - button_size.x)
	var panel_x: float = maxf(_hud_length(left_margin_css), viewport_size.x - _hud_length(right_margin_css) - panel_width)
	var top: float = _hud_length(top_css)

	var indicator_top_css: float = maxf(12.0, turn41_safe_insets_css.y + 8.0)
	var indicator_reserved_width: float = _hud_length(124.0)
	var indicator_reserved := Rect2(
		Vector2((viewport_size.x - indicator_reserved_width) * 0.5, _hud_length(indicator_top_css)),
		Vector2(indicator_reserved_width, _hud_length(30.0))
	).grow(_hud_length(8.0))
	var proposed_button := Rect2(Vector2(button_x, top), button_size)
	if proposed_button.intersects(indicator_reserved):
		top = indicator_reserved.position.y + indicator_reserved.size.y

	quick_button.position = Vector2(button_x, top)
	quick_button.size = button_size
	quick_button.add_theme_font_size_override("font_size", _hud_font_size(14))
	quick_panel.position = Vector2(panel_x, top + button_size.y + _hud_length(8.0))
	var action_count: int = 3 if quick_round_button != null and quick_round_button.visible else 2
	quick_panel.size = Vector2(panel_width, _hud_length(18.0 + float(action_count) * 55.0))
	for child: Node in quick_panel.get_children():
		if child is VBoxContainer:
			var menu := child as VBoxContainer
			menu.add_theme_constant_override("separation", int(round(_hud_length(7.0))))
			for action: Node in menu.get_children():
				if action is Button:
					(action as Button).custom_minimum_size.y = _hud_length(48.0)

	_turn41_publish_layout(viewport_size, Rect2(quick_button.position, quick_button.size))


func _turn41_read_safe_insets_css(viewport_size: Vector2) -> Vector4:
	if OS.has_feature("web"):
		var raw: Variant = JavaScriptBridge.eval(
			"JSON.stringify((()=>{const e=document.createElement('div');e.style.cssText='position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left)';document.body.appendChild(e);const s=getComputedStyle(e);const v={l:parseFloat(s.paddingLeft)||0,t:parseFloat(s.paddingTop)||0,r:parseFloat(s.paddingRight)||0,b:parseFloat(s.paddingBottom)||0};e.remove();return v;})())",
			true
		)
		var decoded: Variant = JSON.parse_string(str(raw))
		if decoded is Dictionary:
			var values := decoded as Dictionary
			return Vector4(
				maxf(0.0, float(values.get("l", 0.0))),
				maxf(0.0, float(values.get("t", 0.0))),
				maxf(0.0, float(values.get("r", 0.0))),
				maxf(0.0, float(values.get("b", 0.0)))
			)
		return Vector4.ZERO

	var safe_rect: Rect2i = DisplayServer.get_display_safe_area()
	if safe_rect.size.x <= 0 or safe_rect.size.y <= 0:
		return Vector4.ZERO
	return Vector4(
		maxf(0.0, float(safe_rect.position.x)),
		maxf(0.0, float(safe_rect.position.y)),
		maxf(0.0, viewport_size.x - float(safe_rect.position.x + safe_rect.size.x)),
		maxf(0.0, viewport_size.y - float(safe_rect.position.y + safe_rect.size.y))
	)


func _turn41_publish_layout(viewport_size: Vector2, button_rect: Rect2) -> void:
	if not OS.has_feature("web"):
		return
	var scale: float = maxf(hud_canvas_scale, 0.20)
	var x_css: float = button_rect.position.x * scale
	var y_css: float = button_rect.position.y * scale
	var width_css: float = button_rect.size.x * scale
	var height_css: float = button_rect.size.y * scale
	var panel_state: String = "open" if quick_panel != null and quick_panel.visible else "closed"
	var key: String = "%.1f:%.1f:%.1f:%.1f:%.1f:%.1f:%s:%.0fx%.0f" % [
		x_css, y_css, width_css, height_css,
		turn41_safe_insets_css.y, turn41_safe_insets_css.z,
		panel_state, viewport_size.x, viewport_size.y
	]
	if key == turn41_layout_publish_key:
		return
	turn41_layout_publish_key = key
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakTurn41QuickMenu='safe-turn-band';" +
		"document.body.dataset.yakolakTurn41QuickMenuX='%.1f';" % x_css +
		"document.body.dataset.yakolakTurn41QuickMenuY='%.1f';" % y_css +
		"document.body.dataset.yakolakTurn41QuickMenuWidth='%.1f';" % width_css +
		"document.body.dataset.yakolakTurn41QuickMenuHeight='%.1f';" % height_css +
		"document.body.dataset.yakolakTurn41QuickMenuPanel='%s';" % panel_state +
		"document.body.dataset.yakolakTurn41SafeTop='%.1f';" % turn41_safe_insets_css.y +
		"document.body.dataset.yakolakTurn41SafeRight='%.1f';" % turn41_safe_insets_css.z +
		"document.body.dataset.yakolakTurn41TouchTarget='48px-min';" +
		"document.body.dataset.yakolakTurn41CameraPolicy='overlay-only-no-projection-change';",
		true
	)
