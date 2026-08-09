extends "res://scripts/gameplay_session_nested_pick.gd"

# Production efficiency layer. Parent gameplay logic can safely ask to sync UI
# every frame; this leaf only forwards the call when the visible state changed.
# Animations, camera tweens, input, rules and graphics remain untouched.
var _eff_hud_key: String = ""
var _eff_quick_key: String = ""
var _eff_waiting_key: String = ""
var _eff_score_key: String = ""


func _sync_hud_visibility() -> void:
	var key: String = "%s|%s|%s" % [str(match_initialized), str(online_active), str(online_waiting)]
	if key == _eff_hud_key:
		return
	_eff_hud_key = key
	super._sync_hud_visibility()


func _sync_quick_menu() -> void:
	var key: String = "%s|%s|%s|%s|%s|%s" % [
		str(match_initialized),
		str(round_complete),
		str(match_complete),
		str(online_cancelled),
		str(online_active),
		str(online_waiting),
	]
	if key == _eff_quick_key:
		return
	_eff_quick_key = key
	super._sync_quick_menu()


func _sync_waiting_overlay() -> void:
	if waiting_root == null:
		super._sync_waiting_overlay()
		return
	var should_show: bool = online_active and online_waiting
	var code: String = _waiting_room_code() if should_show else ""
	var joined: int = players.size() if should_show else 0
	var target: int = maxi(_waiting_target_count(), joined) if should_show else 0
	var key: String = "%s|%s|%d|%d" % [str(should_show), code, joined, target]
	if key == _eff_waiting_key:
		return
	_eff_waiting_key = key
	super._sync_waiting_overlay()


func _sync_score_markers() -> void:
	var key: String = "%s|%d|%d|%d|%d|%d" % [
		str(match_initialized),
		players.size(),
		int(scores.get("right", 0)),
		int(scores.get("left", 0)),
		int(scores.get("front", 0)),
		int(scores.get("back", 0)),
	]
	if key == _eff_score_key:
		return
	_eff_score_key = key
	super._sync_score_markers()
