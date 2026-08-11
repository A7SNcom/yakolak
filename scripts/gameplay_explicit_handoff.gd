extends "res://scripts/gameplay_state_inventory.gd"

# The production gameplay layer accepts intro ownership only after gameplay.gd
# consumed the explicit generation token. The legacy worker/playing guard below
# this layer remains a compatibility implementation detail, not the handoff
# contract used by the live scene.


func _intro_handoff_ready() -> bool:
	return _intro_handoff_is_consumed()
