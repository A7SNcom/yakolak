extends Node

# Browser-only observability for deterministic Playwright verification.
# It never changes normal player input or rules. During browser automation only,
# the turn deadline is held so slow software rendering cannot create false timeouts.

var intro: Node3D
var match_controller: Node
var camera: Camera3D
var automation: bool = false
var last_publish_msec: int = -1000


func _ready() -> void:
	process_priority = 100
	intro = get_parent() as Node3D
	match_controller = intro.get_node_or_null("LocalMatchGameplay")
	if OS.has_feature("web"):
		automation = bool(JavaScriptBridge.eval("Boolean(navigator.webdriver)", true))
	set_process(true)


func _process(_delta: float) -> void:
	if match_controller == null:
		match_controller = intro.get_node_or_null("LocalMatchGameplay")
		return
	if not bool(match_controller.get("match_initialized")):
		return
	if automation and not bool(match_controller.get("round_complete")):
		match_controller.set("turn_deadline_msec", Time.get_ticks_msec() + 600000)
	var now: int = Time.get_ticks_msec()
	if now - last_publish_msec < 220:
		return
	last_publish_msec = now
	_publish_visible_targets()


func _publish_visible_targets() -> void:
	if not OS.has_feature("web") or not bool(match_controller.get("gameplay_ready")):
		return
	camera = match_controller.get("camera") as Camera3D
	var records_value: Variant = match_controller.get("piece_records")
	if camera == null or not records_value is Array:
		return
	var records: Array = records_value as Array
	var direction: String = str(match_controller.call("_current_direction"))
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var center: Vector2 = viewport_size * 0.5
	var best_by_size: Dictionary = {}
	var distance_by_size: Dictionary = {}

	for index: int in range(records.size()):
		var record: Dictionary = records[index] as Dictionary
		if bool(record.get("played", false)) or str(record.get("dir", "")) != direction:
			continue
		var size_name: String = str(record.get("type", ""))
		var mesh_instance := record.get("mesh") as MeshInstance3D
		if mesh_instance == null:
			continue
		var offset: Vector3
		match size_name:
			"large": offset = Vector3(17.0, 0.0, 9.5)
			"medium": offset = Vector3(12.5, 0.0, 7.0)
			_: offset = Vector3(8.0, 0.0, 4.5)
		var point: Vector2 = camera.unproject_position(mesh_instance.to_global(offset))
		var visible: bool = point.x >= 0.0 and point.x <= viewport_size.x and point.y >= 0.0 and point.y <= viewport_size.y
		var distance: float = point.distance_squared_to(center) + (0.0 if visible else 100000000.0)
		if not distance_by_size.has(size_name) or distance < float(distance_by_size[size_name]):
			distance_by_size[size_name] = distance
			best_by_size[size_name] = {"index": index, "point": point, "name": str(mesh_instance.name)}

	if best_by_size.is_empty():
		return
	var script: String = ""
	for size_name: String in ["small", "medium", "large"]:
		if not best_by_size.has(size_name):
			continue
		var best: Dictionary = best_by_size[size_name] as Dictionary
		var point: Vector2 = best["point"] as Vector2
		var cap: String = size_name.capitalize()
		script += "document.body.dataset.yakolakTest%sX='%s';" % [cap, str(point.x)]
		script += "document.body.dataset.yakolakTest%sY='%s';" % [cap, str(point.y)]

	var generic_size: String = "large" if best_by_size.has("large") else str(best_by_size.keys()[0])
	var generic: Dictionary = best_by_size[generic_size] as Dictionary
	var generic_point: Vector2 = generic["point"] as Vector2
	script += "document.body.dataset.yakolakTestPieceX='%s';" % str(generic_point.x)
	script += "document.body.dataset.yakolakTestPieceY='%s';" % str(generic_point.y)
	script += "document.body.dataset.yakolakTestPiece='%s';" % str(generic["name"])
	script += "document.body.dataset.yakolakVerificationTarget='visible-nearest';"
	JavaScriptBridge.eval(script, true)
