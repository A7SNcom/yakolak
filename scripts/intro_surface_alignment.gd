extends Node

# The approved meshes are re-centered to their physical floor during STL import.
# Board and player-base thickness is 12 source units, so every piece must finish
# on that real top surface rather than at the legacy model-origin coordinate.

const UNIT := 0.04
const SURFACE_HEIGHT := 12.0 * UNIT

var aligned := false


func _process(_delta: float) -> void:
	if aligned:
		return
	var intro := get_parent()
	if intro == null:
		return
	var pieces_value = intro.get("pieces")
	if not pieces_value is Array or (pieces_value as Array).size() != 36:
		return

	for piece_value in pieces_value as Array:
		var piece := piece_value as MeshInstance3D
		var target: Vector3 = piece.get_meta("target_position")
		target.y += SURFACE_HEIGHT
		piece.set_meta("target_position", target)

	aligned = true
	print("YAKOLAK_APPROVED_SURFACES_ALIGNED")
	set_process(false)
