extends "res://scripts/gameplay_session_ui.gd"

# Final gameplay safety layer. Every new session starts from the captured
# physical home state, stale tweens can never finish inside a newer match, and
# online rounds advance automatically from one deterministic owner client.
const Display = preload("res://scripts/ui_design.gd")

const ONLINE_NEXT_ROUND_DELAY_MS: int = 1100

var online_round_auto_due_msec: int = 0
var online_round_auto_key: String = ""
var online_round_auto_sent: bool = false
var stability_round_reset_tween: Tween
var session_generation: int = 0
var web_return_to_setup_callback: Variant


func _ready() -> void:
	super._ready()
	if OS.has_feature("web"):
		var enabled: Variant = JavaScriptBridge.eval("new URL(location.href).searchParams.get('yakolakTestFast')==='1'", true)
		if bool(enabled):
			web_return_to_setup_callback = JavaScriptBridge.create_callback(_on_web_return_to_setup)
			var window: JavaScriptObject = JavaScriptBridge.get_interface("window")
			if window != null:
				window.set("yakolakTestReturnToSetup", web_return_to_setup_callback)


func _process(delta: float) -> void:
	super._process(delta)
	_maybe_auto_advance_online_round()


func _update_hud() -> void:
	super._update_hud()
	if turn_label != null:
		turn_label.text = Display.display_text(turn_label.text)
	if score_label != null:
		score_label.text = Display.display_text(score_label.text)
	if result_button != null:
		result_button.text = Display.display_text(result_button.text)


func _show_round_result() -> void:
	super._show_round_result()
	if turn_label == null:
		return
	if match_complete:
		var leaders: Array[String] = _match_leaders()
		turn_label.text = "فاز %s بالمباراة" % _player_name(leaders[0]) if leaders.size() == 1 else "تعادل المباراة"
	elif round_winner.is_empty():
		turn_label.text = "تعادل الجولة"
	else:
		turn_label.text = "فاز %s بالجولة" % _player_name(round_winner)
	turn_label.text = Display.display_text(turn_label.text)


func _on_configuration_ready(configuration: Dictionary) -> void:
	if waiting_for_setup:
		session_generation += 1
		_reset_session_transients()
		_clean_visual_board()
		players.clear()
		scores.clear()
		online_identity.clear()
		online_turn_key = ""
		online_last_move_number = -1
		online_target_players = 0
		online_cancelled = false
		_reset_online_round_auto()
	super._on_configuration_ready(configuration)


func _on_online_error(code: String) -> void:
	# Active-match transient failures are absorbed by OnlineSession. If an error
	# reaches gameplay it is a genuine bootstrap/fatal failure, so never leave a
	# half-played board underneath the setup screen.
	session_generation += 1
	_reset_session_transients()
	_clean_visual_board()
	_reset_online_round_auto()
	super._on_online_error(code)
	players.clear()
	scores.clear()
	online_identity.clear()
	online_turn_key = ""
	online_last_move_number = -1
	online_target_players = 0
	_update_hud()
	_publish_cleanliness_state()


func _apply_online_room(remote: Dictionary) -> void:
	super._apply_online_room(remote)
	var status: String = str(remote.get("status", ""))
	var complete: bool = bool(remote.get("matchComplete", false))
	if status == "finished" and not complete and online_active and not online_cancelled:
		var key: String = "%s:%d" % [str(remote.get("code", "")), int(remote.get("round", 1))]
		if key != online_round_auto_key:
			online_round_auto_key = key
			online_round_auto_sent = false
			online_round_auto_due_msec = Time.get_ticks_msec() + ONLINE_NEXT_ROUND_DELAY_MS if str(online_identity.get("seat", "")) == "p1" else 0
	elif status == "playing":
		online_round_auto_due_msec = 0
		online_round_auto_sent = false
	elif status == "waiting" or status == "cancelled" or complete:
		online_round_auto_due_msec = 0


func _maybe_auto_advance_online_round() -> void:
	if online_round_auto_due_msec <= 0 or online_round_auto_sent:
		return
	if Time.get_ticks_msec() < online_round_auto_due_msec:
		return
	online_round_auto_due_msec = 0
	if not online_active or online == null or not match_initialized or not round_complete or match_complete or online_cancelled:
		return
	if str(online_identity.get("seat", "")) != "p1":
		return
	online_round_auto_sent = true
	online.call("request_rematch")


func _reset_board_for_round() -> void:
	# Track the reset tween. The old implementation kept it only in a local
	# variable, allowing a reset from an abandoned game to finish inside a new
	# one and move stones/state after the new match had already started.
	gameplay_ready = false
	round_complete = false
	round_winner = ""
	winning_piece_indices.clear()
	occupied_slots.clear()
	move_count = 0
	move_active = false
	move_piece_index = -1
	move_cell = -1
	_reset_tray_state()
	selected_index = -1
	selected_original_material = null
	_hide_markers()
	if result_button != null:
		result_button.visible = false

	if stability_round_reset_tween != null and stability_round_reset_tween.is_valid():
		stability_round_reset_tween.kill()
	stability_round_reset_tween = null
	var generation: int = session_generation
	for index: int in range(piece_records.size()):
		var record: Dictionary = piece_records[index] as Dictionary
		record["played"] = false
		piece_records[index] = record
		var piece: MeshInstance3D = record["mesh"] as MeshInstance3D
		if index < home_materials.size():
			piece.material_override = home_materials[index]
		if index < home_transforms.size():
			if stability_round_reset_tween == null:
				stability_round_reset_tween = create_tween()
				stability_round_reset_tween.set_parallel(true)
			stability_round_reset_tween.tween_property(piece, "transform", home_transforms[index], ROUND_RESET_DURATION).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	if stability_round_reset_tween != null:
		stability_round_reset_tween.finished.connect(_finish_stability_round_reset.bind(generation))
	else:
		# A stale/empty reset must not start a Tween with zero Tweeners.
		call_deferred("_finish_stability_round_reset", generation)
	_publish_match_state("round-reset")


func _finish_stability_round_reset(generation: int) -> void:
	stability_round_reset_tween = null
	if generation != session_generation or not match_initialized or waiting_for_setup:
		return
	action_in_progress = false
	_start_turn()


func _close_piece_tray(skip_index: int = -1, immediate: bool = false) -> void:
	# Create the closing Tween lazily. Near the end of a match the tray can hold
	# only the selected piece; skipping that piece used to leave an empty Tween
	# and Godot emitted "started with no Tweeners".
	if not tray_open:
		return
	var closing: Array[int] = tray_indices.duplicate()
	tray_open = false
	tray_indices.clear()
	if tray_tween != null and tray_tween.is_valid():
		tray_tween.kill()
	tray_tween = null
	var close_tween: Tween = null
	for index: int in closing:
		if index == skip_index:
			continue
		var record: Dictionary = piece_records[index] as Dictionary
		var piece: MeshInstance3D = record["mesh"] as MeshInstance3D
		piece.material_override = home_materials[index]
		if bool(record.get("played", false)):
			continue
		if immediate:
			piece.position = home_transforms[index].origin
		else:
			if close_tween == null:
				close_tween = create_tween()
				close_tween.set_parallel(true)
				tray_tween = close_tween
			close_tween.tween_property(piece, "position", home_transforms[index].origin, TRAY_OPEN_DURATION).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	if skip_index < 0:
		selected_index = -1
		selected_original_material = null
		_hide_markers()
		_publish_gameplay_state("ready")
	_publish_tray_state("closed")


func _return_to_setup() -> void:
	session_generation += 1
	_reset_session_transients()
	_clean_visual_board()
	_reset_online_round_auto()
	super._return_to_setup()
	players.clear()
	scores.clear()
	online_identity.clear()
	online_turn_key = ""
	online_last_move_number = -1
	online_target_players = 0
	pending_online_configuration.clear()
	restoring_online = false
	online_cancelled = false
	_update_hud()
	_publish_cleanliness_state()


func _reset_session_transients() -> void:
	if camera_tween != null and camera_tween.is_valid():
		camera_tween.kill()
	camera_tween = null
	if tray_tween != null and tray_tween.is_valid():
		tray_tween.kill()
	tray_tween = null
	if stability_round_reset_tween != null and stability_round_reset_tween.is_valid():
		stability_round_reset_tween.kill()
	stability_round_reset_tween = null

	action_in_progress = false
	camera_transition = false
	bot_scheduled = false
	bot_due_msec = 0
	turn_deadline_msec = 0
	move_active = false
	move_piece_index = -1
	move_cell = -1
	move_started_msec = 0
	move_from = Vector3.ZERO
	move_to = Vector3.ZERO
	move_from_scale = Vector3.ONE
	last_pointer_msec = -1000
	last_pointer_position = Vector2(-9999.0, -9999.0)
	_reset_tray_state()
	selected_index = -1
	selected_home_position = Vector3.ZERO
	selected_original_material = null
	_hide_markers()


func _clean_visual_board() -> void:
	occupied_slots.clear()
	move_count = 0
	round_complete = false
	match_complete = false
	round_winner = ""
	winning_piece_indices.clear()
	_clear_score_markers()
	if result_button != null:
		result_button.visible = false
	if quick_panel != null:
		quick_panel.visible = false

	for index: int in range(piece_records.size()):
		var record: Dictionary = piece_records[index] as Dictionary
		record["played"] = false
		piece_records[index] = record
		var piece: MeshInstance3D = record["mesh"] as MeshInstance3D
		if piece == null:
			continue
		if index < home_transforms.size():
			piece.transform = home_transforms[index]
		else:
			piece.scale = Vector3.ONE * U
		if index < home_materials.size():
			piece.material_override = home_materials[index]
		piece.visible = true
		for child: Node in piece.get_children():
			if child is StaticBody3D and child.has_meta("piece_index"):
				(child as StaticBody3D).collision_layer = PIECE_LAYER

	for direction_value: Variant in COLOR_TO_DIRECTION.values():
		var base: Node3D = intro.get_node_or_null("Base_%s" % str(direction_value)) as Node3D
		if base != null:
			base.visible = true
	_publish_cleanliness_state()


func _reset_online_round_auto() -> void:
	online_round_auto_due_msec = 0
	online_round_auto_key = ""
	online_round_auto_sent = false


func _publish_cleanliness_state() -> void:
	if not OS.has_feature("web"):
		return
	var played_count: int = 0
	var stray_count: int = 0
	for index: int in range(piece_records.size()):
		var record: Dictionary = piece_records[index] as Dictionary
		if bool(record.get("played", false)):
			played_count += 1
		var piece: MeshInstance3D = record.get("mesh", null) as MeshInstance3D
		if piece != null and index < home_transforms.size() and not piece.transform.is_equal_approx(home_transforms[index]):
			stray_count += 1
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakResiduePlayed='%d';" % played_count +
		"document.body.dataset.yakolakResidueOccupied='%d';" % occupied_slots.size() +
		"document.body.dataset.yakolakResidueStray='%d';" % stray_count,
		true
	)


func _on_web_return_to_setup(_arguments: Array) -> void:
	_return_to_setup()
