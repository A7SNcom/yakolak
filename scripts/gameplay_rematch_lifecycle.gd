extends "res://scripts/gameplay_tutorial_showcase.gd"

# A completed local match is a new match lifecycle, not another round reset.
# Preserve the chosen configuration (players / wins-to-match) but rebuild every
# runtime and visual match state from the same clean baseline used for a fresh
# session. This deliberately does not reload the page or alter round rules.

var web_force_match_complete_callback: Variant
var web_rematch_callback: Variant


func _ready() -> void:
	super._ready()
	if not OS.has_feature("web"):
		return
	var test_fast: bool = bool(JavaScriptBridge.eval("new URL(location.href).searchParams.get('yakolakTestFast')==='1'", true))
	if not test_fast:
		return
	web_force_match_complete_callback = JavaScriptBridge.create_callback(_on_web_force_match_complete)
	web_rematch_callback = JavaScriptBridge.create_callback(_on_web_rematch)
	var window: JavaScriptObject = JavaScriptBridge.get_interface("window")
	if window != null:
		window.set("yakolakTestForceMatchComplete", web_force_match_complete_callback)
		window.set("yakolakTestRematch", web_rematch_callback)


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
