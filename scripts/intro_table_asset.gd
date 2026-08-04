extends Node

const TABLE_RESOURCE := "res://generated/table.obj"
const TABLE_TOP_Y := -0.64
const TABLE_THICKNESS := 0.8

var applied := false


func _process(_delta: float) -> void:
	if applied:
		return
	var intro := get_parent()
	if intro == null:
		return
	var table_mesh = load(TABLE_RESOURCE)
	if table_mesh == null or not table_mesh is Mesh:
		return

	var old_top: MeshInstance3D = null
	for child in intro.get_children():
		if not child is MeshInstance3D:
			continue
		var candidate := child as MeshInstance3D
		if candidate.mesh is CylinderMesh and candidate.position.y > -2.0:
			old_top = candidate
			break
	if old_top == null:
		return

	var approved_top := MeshInstance3D.new()
	approved_top.name = "ApprovedExtrudedTableSVG"
	approved_top.mesh = table_mesh as Mesh
	var material := intro.call("_material", Color("#aeb2b6"), 0.72) as StandardMaterial3D
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	approved_top.material_override = material
	approved_top.position = Vector3(0.0, TABLE_TOP_Y - TABLE_THICKNESS, 0.0)
	approved_top.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	intro.add_child(approved_top)
	old_top.queue_free()

	applied = true
	print("YAKOLAK_APPROVED_TABLE_SVG_APPLIED")
	set_process(false)
