extends "res://scripts/gameplay_session_resilient.gd"

# Final gameplay polish for online rounds. Non-final online rounds already
# advance automatically; do not show a second manual action that can duplicate
# the same rematch request while recovery logic is working.

func _sync_quick_menu() -> void:
	super._sync_quick_menu()
	if quick_round_button == null:
		return
	if online_active and round_complete and not match_complete and not online_cancelled:
		quick_round_button.visible = false
		_layout_quick_menu()
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakOnlineRoundAction='" +
			("automatic" if online_active and round_complete and not match_complete and not online_cancelled else "manual") + "';",
			true
		)
