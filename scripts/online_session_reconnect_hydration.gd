extends "res://scripts/online_session_hardened.gd"

# LIGHTING-11: authoritative reconnect hydration must receive an accepted room
# snapshot before turn presentation becomes valid again. A normal incremental
# poll can return 204 when the room version did not change while disconnected,
# so the first recovery poll deliberately asks for a full snapshot. This stays
# inside the transport owner; lighting never guesses or reuses stale turn state.
func _poll() -> void:
	if not reconnecting:
		super._poll()
		return
	var preserved_version: int = int(room.get("version", 0))
	room["version"] = -1
	super._poll()
	room["version"] = preserved_version
