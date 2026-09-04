extends "res://scripts/gameplay_tutorial_showcase.gd"

# A completed local match is a new match lifecycle, not another round reset.
# Preserve the chosen configuration (players / wins-to-match) but rebuild every
# runtime and visual match state from the same clean baseline used for a fresh
# session. This deliberately does not reload the page or alter round rules.
#
# MATCH-END-40 keeps the completed-match choices symmetric across local/online:
# rematch stays room-authoritative, while returning to setup detaches only this
# client from an already-terminal online match. Active-match leave/cancellation
# semantics remain unchanged.

var web_force_match_complete_callback: Variant
var web_rematch_callback: Variant
var web_rematch_lifecycle_test_callback: Variant
var web_post_match_return_callback: Variant

var post_match_status_label: Label
var post_match_secondary_button: Button
var post_match_action_pending: String = ""


func _ready() -> void:
	super._ready()
	_build_post_match_status_label()
	_build_post_match_secondary_button()
	_publish_post_match_action_state()
	if not OS.has_feature("web"):
		return
	var test_fast: bool = bool(JavaScriptBridge.eval("new URL(location.href).searchParams.get('yakolakTestFast')==='1'", true))
	if not test_fast:
		return
	web_force_match_complete_callback = JavaScriptBridge.create_callback(_on_web_force_match_complete)
	web_rematch_callback = JavaScriptBridge.create_callback(_on_web_rematch)
	web_rematch_lifecycle_test_callback = JavaScriptBridge.create_callback(_on_web_run_rematch_lifecycle_test)
	web_post_match_return_callback = JavaScriptBridge.create_callback(_on_web_post_match_return)
	var window: JavaScriptObject = JavaScriptBridge.get_interface("window")
	if window != null:
		window.set("yakolakTestForceMatchComplete", web_force_match_complete_callback)
		window.set("yakolakTestRematch", web_rematch_callback)
		window.set("yakolakTestRunRematchLifecycle", web_rematch_lifecycle_test_callback)
		window.set("yakolakTestPostMatchReturn", web_post_match_return_callback)


func _input(event: InputEvent) -> void:
	if not (round_complete and match_complete):
		super._input(event)
		return
	var pointer_press: bool = false
	var pointer_position := Vector2.ZERO
	if event is InputEventScreenTouch:
		var touch_event := event as InputEventScreenTouch
		pointer_press = touch_event.pressed
		pointer_position = touch_event.position
	elif event is InputEventMouseButton:
		var mouse_event := event as InputEventMouseButton
		pointer_press = mouse_event.pressed and mouse_event.button_index == MOUSE_BUTTON_LEFT
		pointer_position = mouse_event.position
	if not pointer_press:
		return
	var on_primary: bool = result_button != null and result_button.visible and result_button.get_global_rect().has_point(pointer_position)
	var on_secondary: bool = post_match_secondary_button != null and post_match_secondary_button.visible and post_match_secondary_button.get_global_rect().has_point(pointer_position)
	if on_primary or on_secondary:
		return
	get_viewport().set_input_as_handled()


func _build_post_match_status_label() -> void:
	if hud_layer == null or post_match_status_label != null:
		return
	post_match_status_label = Label.new()
	post_match_status_label.name = "PostMatchStatus"
	post_match_status_label.set_anchors_preset(Control.PRESET_CENTER)
	post_match_status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	post_match_status_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	post_match_status_label.layout_direction = Control.LAYOUT_DIRECTION_RTL
	post_match_status_label.text_direction = Control.TEXT_DIRECTION_RTL
	post_match_status_label.language = "ar"
	post_match_status_label.add_theme_font_override("font", ARABIC_FONT)
	post_match_status_label.add_theme_color_override("font_color", Color("#f3f4f4"))
	post_match_status_label.add_theme_color_override("font_outline_color", Color(0.02, 0.02, 0.02, 0.92))
	post_match_status_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	post_match_status_label.focus_mode = Control.FOCUS_NONE
	post_match_status_label.visible = false
	hud_layer.add_child(post_match_status_label)


func _build_post_match_secondary_button() -> void:
	if hud_layer == null or post_match_secondary_button != null:
		return
	post_match_secondary_button = Button.new()
	post_match_secondary_button.name = "PostMatchSecondaryAction"
	post_match_secondary_button.set_anchors_preset(Control.PRESET_CENTER)
	post_match_secondary_button.offset_left = -132.0
	post_match_secondary_button.offset_top = 74.0
	post_match_secondary_button.offset_right = 132.0
	post_match_secondary_button.offset_bottom = 122.0
	post_match_secondary_button.layout_direction = Control.LAYOUT_DIRECTION_RTL
	post_match_secondary_button.text_direction = Control.TEXT_DIRECTION_RTL
	post_match_secondary_button.language = "ar"
	post_match_secondary_button.focus_mode = Control.FOCUS_NONE
	post_match_secondary_button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	post_match_secondary_button.add_theme_font_override("font", ARABIC_FONT)
	post_match_secondary_button.add_theme_font_size_override("font_size", 17)
	post_match_secondary_button.add_theme_color_override("font_color", Color.WHITE)
	post_match_secondary_button.add_theme_color_override("font_hover_color", Color.WHITE)
	post_match_secondary_button.add_theme_color_override("font_pressed_color", Color.WHITE)
	post_match_secondary_button.add_theme_color_override("font_disabled_color", Color("#b9c4c0"))

	var normal := StyleBoxFlat.new()
	normal.bg_color = Color("#15181aec")
	normal.corner_radius_top_left = 14
	normal.corner_radius_top_right = 14
	normal.corner_radius_bottom_left = 14
	normal.corner_radius_bottom_right = 14
	normal.border_width_left = 1
	normal.border_width_top = 1
	normal.border_width_right = 1
	normal.border_width_bottom = 1
	normal.border_color = Color("#ffffff24")
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = Color("#285e51")
	var pressed := normal.duplicate() as StyleBoxFlat
	pressed.bg_color = Color("#174438")
	var disabled := normal.duplicate() as StyleBoxFlat
	disabled.bg_color = Color("#15181ab8")
	post_match_secondary_button.add_theme_stylebox_override("normal", normal)
	post_match_secondary_button.add_theme_stylebox_override("hover", hover)
	post_match_secondary_button.add_theme_stylebox_override("pressed", pressed)
	post_match_secondary_button.add_theme_stylebox_override("disabled", disabled)
	post_match_secondary_button.add_theme_stylebox_override("focus", normal)
	post_match_secondary_button.visible = false
	post_match_secondary_button.pressed.connect(_on_post_match_secondary_action)
	hud_layer.add_child(post_match_secondary_button)


func _layout_hud() -> void:
	super._layout_hud()
	if match_complete:
		_layout_post_match_affordance()


func _layout_post_match_affordance() -> void:
	if result_button == null:
		return
	var action_half_width: float = _hud_length(148.0)
	result_button.offset_left = -action_half_width
	result_button.offset_top = _hud_length(-10.0)
	result_button.offset_right = action_half_width
	result_button.offset_bottom = _hud_length(46.0)
	result_button.add_theme_font_size_override("font_size", _hud_font_size(20))
	var primary_normal := _result_style(Color("#1f6f5d"))
	primary_normal.border_color = Color("#8fdac7")
	var primary_hover := _result_style(Color("#2f856a"))
	primary_hover.border_color = Color("#b5eadc")
	var primary_pressed := _result_style(Color("#174438"))
	primary_pressed.border_color = Color("#8fdac7")
	var primary_disabled := _result_style(Color("#29463f"))
	primary_disabled.border_color = Color("#6f8f86")
	var primary_focus := primary_normal.duplicate() as StyleBoxFlat
	primary_focus.border_color = Color("#ffffffcc")
	primary_focus.set_border_width_all(maxi(2, int(round(_hud_length(2.0)))))
	result_button.add_theme_stylebox_override("normal", primary_normal)
	result_button.add_theme_stylebox_override("hover", primary_hover)
	result_button.add_theme_stylebox_override("pressed", primary_pressed)
	result_button.add_theme_stylebox_override("disabled", primary_disabled)
	result_button.add_theme_stylebox_override("focus", primary_focus)
	result_button.add_theme_color_override("font_disabled_color", Color("#c8d9d4"))
	if post_match_status_label != null:
		var status_half_width: float = _hud_length(179.0)
		post_match_status_label.offset_left = -status_half_width
		post_match_status_label.offset_top = _hud_length(-108.0)
		post_match_status_label.offset_right = status_half_width
		post_match_status_label.offset_bottom = _hud_length(-22.0)
		post_match_status_label.add_theme_font_size_override("font_size", _hud_font_size(22))
		post_match_status_label.add_theme_constant_override("outline_size", maxi(1, int(round(_hud_length(3.0)))))
	if post_match_secondary_button != null:
		var secondary_half_width: float = _hud_length(132.0)
		post_match_secondary_button.offset_left = -secondary_half_width
		post_match_secondary_button.offset_top = _hud_length(58.0)
		post_match_secondary_button.offset_right = secondary_half_width
		post_match_secondary_button.offset_bottom = _hud_length(106.0)
		post_match_secondary_button.add_theme_font_size_override("font_size", _hud_font_size(17))


func _show_round_result() -> void:
	super._show_round_result()
	if not match_complete:
		_hide_post_match_status_label()
		_hide_post_match_secondary_button()
		_layout_hud()
		if result_button != null:
			result_button.disabled = false
		_publish_post_match_action_state()
		return

	# Result/status is deliberately non-interactive; the existing round-action
	# button remains the primary rematch action so lifecycle/focus semantics stay intact.
	var leaders: Array[String] = _match_leaders()
	if post_match_status_label != null:
		if leaders.size() == 1:
			post_match_status_label.text = "بطل المباراة: %s" % _player_name(leaders[0])
		else:
			post_match_status_label.text = "تعادل المباراة"
		post_match_status_label.visible = true
	if result_button != null:
		result_button.text = "إعادة المباراة"
		result_button.visible = true

	# At final match end, online leave is a terminal client detach: the room/result
	# remain authoritative for everyone else, so the same setup action is safe.
	if post_match_secondary_button != null:
		post_match_secondary_button.text = "العودة للإعدادات"
		post_match_secondary_button.visible = true
	_layout_hud()
	_sync_post_match_controls()
	_publish_post_match_action_state()


func _on_round_action() -> void:
	if not round_complete or action_in_progress:
		return
	if online_active:
		if online_cancelled or not match_complete:
			super._on_round_action()
			return
		# One user decision creates one immutable transport intent. The transport
		# owns retry/deduplication with mutationId; this UI lock prevents a second
		# tap from creating a second rematch vote while the first is unresolved.
		if online == null:
			return
		post_match_action_pending = "rematch"
		action_in_progress = true
		_sync_post_match_controls()
		_publish_post_match_action_state()
		online.call("request_rematch")
		return
	if not match_complete:
		super._on_round_action()
		return
	post_match_action_pending = "rematch"
	_restart_completed_local_match()


func _on_post_match_secondary_action() -> void:
	if not round_complete or not match_complete or action_in_progress:
		return
	post_match_action_pending = "setup"
	action_in_progress = true
	_sync_post_match_controls()
	_publish_post_match_action_state()
	_return_to_setup()


func _on_online_room_changed(remote: Dictionary, identity: Dictionary) -> void:
	super._on_online_room_changed(remote, identity)
	if post_match_action_pending != "rematch":
		return
	var status: String = str(remote.get("status", ""))
	if status == "finished":
		# The local vote is accepted but other players may still need to choose.
		# Keep result visible and the action locked; no duplicate vote is useful.
		_sync_post_match_controls()
		_publish_post_match_action_state()
		return
	post_match_action_pending = ""
	action_in_progress = false
	_hide_post_match_secondary_button()
	if result_button != null:
		result_button.disabled = false
	_publish_post_match_action_state()


func _on_online_error(code: String) -> void:
	post_match_action_pending = ""
	action_in_progress = false
	_hide_post_match_secondary_button()
	if result_button != null:
		result_button.disabled = false
	super._on_online_error(code)
	_publish_post_match_action_state()


func _return_to_setup() -> void:
	post_match_action_pending = ""
	action_in_progress = false
	_hide_post_match_status_label()
	_hide_post_match_secondary_button()
	if result_button != null:
		result_button.disabled = false
	super._return_to_setup()
	_publish_cleanliness_state()
	_publish_post_match_action_state()


func _reset_for_intro() -> void:
	post_match_action_pending = ""
	action_in_progress = false
	_hide_post_match_status_label()
	_hide_post_match_secondary_button()
	if result_button != null:
		result_button.disabled = false
	super._reset_for_intro()
	_publish_post_match_action_state()


func _restart_completed_local_match() -> void:
	# Invalidate every delayed callback/tween from the finished match before
	# touching its state. The same runtime is intentionally reused.
	action_in_progress = true
	_lock_intro_replay()
	session_generation += 1
	_reset_session_transients()
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.body.dataset.yakolakSelected='';document.body.dataset.yakolakSelectedSize='';", true)
	action_in_progress = true
	_clean_visual_board()
	_reset_online_round_auto()

	# Keep only configuration. Everything produced by the previous match is new.
	scores.clear()
	for player: Dictionary in players:
		scores[str(player.get("direction", ""))] = 0
	current_player_index = 0
	round_starter_index = 0
	round_number = 1
	turn_deadline_msec = 0
	round_complete = false
	match_complete = false
	round_winner = ""
	winning_piece_indices.clear()
	bot_scheduled = false
	bot_due_msec = 0
	camera_transition = false
	waiting_for_setup = false
	match_initialized = not players.is_empty()

	_sync_active_sides()
	_update_hud()
	post_match_action_pending = ""
	_hide_post_match_status_label()
	_hide_post_match_secondary_button()
	if result_button != null:
		result_button.disabled = false
	_publish_cleanliness_state()
	action_in_progress = false
	_publish_post_match_action_state()
	if not match_initialized:
		return
	_start_turn()
	_publish_match_state("ready")
	print("YAKOLAK_MATCH_REMATCH_CLEAN generation=%d players=%d" % [session_generation, players.size()])


func _sync_post_match_controls() -> void:
	var locked: bool = not post_match_action_pending.is_empty()
	if result_button != null and match_complete:
		result_button.disabled = locked
	if post_match_secondary_button != null:
		post_match_secondary_button.disabled = locked


func _hide_post_match_status_label() -> void:
	if post_match_status_label != null:
		post_match_status_label.visible = false
		post_match_status_label.text = ""


func _hide_post_match_secondary_button() -> void:
	if post_match_secondary_button != null:
		post_match_secondary_button.visible = false
		post_match_secondary_button.disabled = false


func _publish_post_match_action_state() -> void:
	if not OS.has_feature("web"):
		return
	var primary: String = "rematch" if match_complete and not online_cancelled else ""
	var secondary: String = "setup" if match_complete and post_match_secondary_button != null and post_match_secondary_button.visible else ""
	var result_text: String = post_match_status_label.text if post_match_status_label != null and post_match_status_label.visible else ""
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakPostMatchPrimary=" + JSON.stringify(primary) + ";" +
		"document.body.dataset.yakolakPostMatchSecondary=" + JSON.stringify(secondary) + ";" +
		"document.body.dataset.yakolakPostMatchPending=" + JSON.stringify(post_match_action_pending) + ";" +
		"document.body.dataset.yakolakPostMatchResult=" + JSON.stringify(result_text) + ";",
		true
	)


func _on_web_force_match_complete(_arguments: Array) -> void:
	# Leave the JavaScript callback before production gameplay publishes browser
	# state back through JavaScriptBridge. This avoids a re-entrant bridge stall.
	call_deferred("_force_match_complete_for_test")


func _force_match_complete_for_test() -> void:
	if not match_initialized or online_active or round_complete or players.is_empty():
		return
	var winner: String = _current_direction()
	scores[winner] = maxi(total_rounds - 1, 0)
	_finish_round(winner, [])


func _on_web_rematch(_arguments: Array) -> void:
	# Same production action used by "إعادة المباراة", scheduled after returning
	# from the browser callback so its state publications are never re-entrant.
	call_deferred("_on_round_action")


func _on_web_post_match_return(_arguments: Array) -> void:
	# Same production action used by the local "العودة للإعدادات" button.
	call_deferred("_on_post_match_secondary_action")


func _on_web_run_rematch_lifecycle_test(_arguments: Array) -> void:
	call_deferred("_run_rematch_lifecycle_test")


func _run_rematch_lifecycle_test() -> void:
	if not match_initialized or online_active or players.is_empty():
		_publish_rematch_test_result(false, 0, ["match-not-ready"])
		return
	var failures: Array[String] = []
	var completed_cycles: int = 0
	for cycle: int in range(1, 4):
		_test_dirty_completed_match()
		# This is the exact production action behind the rematch button/path.
		_on_round_action()
		var cycle_failures: Array[String] = _test_clean_rematch_state(cycle)
		if not cycle_failures.is_empty():
			failures.append_array(cycle_failures)
			break
		completed_cycles = cycle
	_publish_rematch_test_result(failures.is_empty() and completed_cycles == 3, completed_cycles, failures)


func _test_dirty_completed_match() -> void:
	# Represent the end of a dirty prior match without running round progression:
	# winner, score, turn, used stone, occupied slot, old selection and visual
	# result marker are all intentionally stale before the real rematch action.
	action_in_progress = false
	post_match_action_pending = ""
	var winner_index: int = mini(1, players.size() - 1)
	current_player_index = winner_index
	round_starter_index = winner_index
	round_number = maxi(total_rounds, 2)
	var winner: String = _current_direction()
	round_complete = true
	match_complete = true
	round_winner = winner
	scores[winner] = maxi(total_rounds, 1)
	move_count = 1

	var piece_index: int = -1
	for index: int in range(piece_records.size()):
		var record: Dictionary = piece_records[index] as Dictionary
		if str(record.get("dir", "")) == winner:
			piece_index = index
			break
	if piece_index >= 0:
		var record: Dictionary = piece_records[piece_index] as Dictionary
		record["played"] = true
		piece_records[piece_index] = record
		var size_name: String = str(record.get("type", "large"))
		occupied_slots[_slot_key(0, size_name)] = piece_index
		winning_piece_indices = [piece_index]
		selected_index = piece_index
		var piece: MeshInstance3D = record.get("mesh", null) as MeshInstance3D
		if piece != null:
			piece.position += Vector3.UP * 2.0

	_ensure_score_marker_root()
	if score_marker_root != null:
		var stale_marker := Node3D.new()
		stale_marker.name = "RematchLifecycleTestMarker"
		score_marker_root.add_child(stale_marker)
	_publish_score_marker_state()
	_publish_cleanliness_state()
	_show_round_result()
	_publish_match_state("match-complete")


func _test_clean_rematch_state(cycle: int) -> Array[String]:
	var failures: Array[String] = []
	if current_player_index != 0:
		failures.append("cycle-%d-current-player-%d" % [cycle, current_player_index])
	if round_starter_index != 0:
		failures.append("cycle-%d-round-starter-%d" % [cycle, round_starter_index])
	if round_number != 1:
		failures.append("cycle-%d-round-%d" % [cycle, round_number])
	if round_complete or match_complete:
		failures.append("cycle-%d-complete-flags" % cycle)
	if not round_winner.is_empty() or not winning_piece_indices.is_empty():
		failures.append("cycle-%d-winner" % cycle)
	if selected_index != -1 or tray_open or not tray_indices.is_empty():
		failures.append("cycle-%d-selection" % cycle)
	if move_count != 0 or move_active or move_piece_index != -1 or move_cell != -1:
		failures.append("cycle-%d-move-state" % cycle)
	if not occupied_slots.is_empty():
		failures.append("cycle-%d-occupied-%d" % [cycle, occupied_slots.size()])
	if not post_match_action_pending.is_empty() or action_in_progress:
		failures.append("cycle-%d-post-match-action" % cycle)
	for direction_value: Variant in scores.keys():
		if int(scores.get(str(direction_value), 0)) != 0:
			failures.append("cycle-%d-score-%s" % [cycle, str(direction_value)])
	for index: int in range(piece_records.size()):
		var record: Dictionary = piece_records[index] as Dictionary
		if bool(record.get("played", false)):
			failures.append("cycle-%d-played-%d" % [cycle, index])
			break
		var piece: MeshInstance3D = record.get("mesh", null) as MeshInstance3D
		if piece != null and index < home_transforms.size() and not piece.transform.is_equal_approx(home_transforms[index]):
			failures.append("cycle-%d-stray-%d" % [cycle, index])
			break
	if score_marker_root != null and score_marker_root.get_child_count() != 0:
		failures.append("cycle-%d-score-markers-%d" % [cycle, score_marker_root.get_child_count()])
	return failures


func _publish_rematch_test_result(passed: bool, cycles: int, failures: Array[String]) -> void:
	if not OS.has_feature("web"):
		return
	var detail: String = "|".join(failures).replace("'", "")
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakRematchLifecycle='%s';" % ("passed" if passed else "failed") +
		"document.body.dataset.yakolakRematchCycles='%d';" % cycles +
		"document.body.dataset.yakolakRematchFailures='%s';" % detail,
		true
	)
	print("YAKOLAK_REMATCH_LIFECYCLE_%s cycles=%d failures=%s" % ["OK" if passed else "FAIL", cycles, detail])
