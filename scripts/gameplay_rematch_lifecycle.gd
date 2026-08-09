extends "res://scripts/gameplay_tutorial_showcase.gd"

# A completed local match is a new match lifecycle, not another round reset.
# Preserve the chosen configuration (players / wins-to-match) but rebuild every
# runtime and visual match state from the same clean baseline used for a fresh
# session. This deliberately does not reload the page or alter round rules.

var web_force_match_complete_callback: Variant
var web_rematch_callback: Variant
var web_rematch_lifecycle_test_callback: Variant


func _ready() -> void:
	super._ready()
	if not OS.has_feature("web"):
		return
	var test_fast: bool = bool(JavaScriptBridge.eval("new URL(location.href).searchParams.get('yakolakTestFast')==='1'", true))
	if not test_fast:
		return
	web_force_match_complete_callback = JavaScriptBridge.create_callback(_on_web_force_match_complete)
	web_rematch_callback = JavaScriptBridge.create_callback(_on_web_rematch)
	web_rematch_lifecycle_test_callback = JavaScriptBridge.create_callback(_on_web_run_rematch_lifecycle_test)
	var window: JavaScriptObject = JavaScriptBridge.get_interface("window")
	if window != null:
		window.set("yakolakTestForceMatchComplete", web_force_match_complete_callback)
		window.set("yakolakTestRematch", web_rematch_callback)
		window.set("yakolakTestRunRematchLifecycle", web_rematch_lifecycle_test_callback)


func _on_round_action() -> void:
	if not round_complete or action_in_progress:
		return
	# Online rematches remain server-authoritative, and an unfinished local
	# match still uses the existing next-round path unchanged.
	if online_active or not match_complete:
		super._on_round_action()
		return
	_restart_completed_local_match()


func _restart_completed_local_match() -> void:
	# Invalidate every delayed callback/tween from the finished match before
	# touching its state. The same runtime is intentionally reused.
	action_in_progress = true
	_lock_intro_replay()
	session_generation += 1
	_reset_session_transients()
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
	_publish_cleanliness_state()
	action_in_progress = false
	if not match_initialized:
		return
	_start_turn()
	_publish_match_state("ready")
	print("YAKOLAK_MATCH_REMATCH_CLEAN generation=%d players=%d" % [session_generation, players.size()])


func _on_web_force_match_complete(_arguments: Array) -> void:
	if not match_initialized or online_active or round_complete or players.is_empty():
		return
	var winner: String = _current_direction()
	# Deterministically enter the real match-complete path without spending the
	# test on round progression. _finish_round still performs the production win.
	scores[winner] = maxi(total_rounds - 1, 0)
	_finish_round(winner, [])


func _on_web_rematch(_arguments: Array) -> void:
	# Test the same production action used by "إعادة المباراة"; no reload and no
	# direct mutation of the reset state from the browser harness.
	_on_round_action()


func _on_web_run_rematch_lifecycle_test(_arguments: Array) -> void:
	if not match_initialized or online_active or players.is_empty():
		_publish_rematch_test_result(false, 0, ["match-not-ready"])
		return
	var failures: Array[String] = []
	for cycle: int in range(1, 4):
		_test_dirty_completed_match()
		if not match_complete:
			failures.append("cycle-%d-did-not-complete" % cycle)
			break
		# This is the exact production action behind the rematch button/path.
		_on_round_action()
		failures.append_array(_test_clean_rematch_state(cycle))
		if not failures.is_empty():
			break
	_publish_rematch_test_result(failures.is_empty(), 3 if failures.is_empty() else 0, failures)


func _test_dirty_completed_match() -> void:
	# Create representative state from the match that is about to end: a used
	# stone, occupied slot, non-zero move count, non-zero score and a different
	# active player. The production finish path then creates winner/result state.
	var winner_index: int = mini(1, players.size() - 1)
	current_player_index = winner_index
	var winner: String = _current_direction()
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
		move_count = 1
		var piece: MeshInstance3D = record.get("mesh", null) as MeshInstance3D
		if piece != null:
			piece.position += Vector3.UP * 2.0
	scores[winner] = maxi(total_rounds - 1, 0)
	_finish_round(winner, [])


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
	if not round_winner.is_empty():
		failures.append("cycle-%d-winner-%s" % [cycle, round_winner])
	if selected_index != -1 or tray_open or not tray_indices.is_empty():
		failures.append("cycle-%d-selection" % cycle)
	if move_count != 0 or move_active or move_piece_index != -1 or move_cell != -1:
		failures.append("cycle-%d-move-state" % cycle)
	if not occupied_slots.is_empty():
		failures.append("cycle-%d-occupied-%d" % [cycle, occupied_slots.size()])
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
