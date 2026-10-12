extends SceneTree
class SetupHost:
	extends Node3D
	var camera: Camera3D
	var playing: bool = false
	var pieces: Array = []
const Setup = preload("res://scripts/session_setup_visual.gd")
var failures: Array[String] = []
func _init() -> void:
	call_deferred("_run")
func _run() -> void:
	for dimensions: Vector2i in [Vector2i(320,568),Vector2i(390,844),Vector2i(768,1024),Vector2i(1366,768),Vector2i(844,390),Vector2i(568,320)]:
		var viewport := SubViewport.new()
		viewport.size = dimensions
		root.add_child(viewport)
		var host := SetupHost.new()
		viewport.add_child(host)
		host.camera = Camera3D.new()
		host.add_child(host.camera)
		host.camera.current = true
		host.camera.position = Vector3(0,10,12)
		var original := host.camera.transform
		var setup = Setup.new()
		host.add_child(setup)
		await process_frame
		setup.show_after_intro()
		await process_frame
		_expect(not setup.card.visible, "legacy scroll window hidden")
		_expect(not setup.dialog_navigation.visible, "legacy back hidden")
		_expect(host.camera.projection == Camera3D.PROJECTION_ORTHOGONAL, "top camera")
		_expect((-host.camera.global_basis.z).dot(Vector3.DOWN) > 0.999, "camera points vertically down")
		var points: Dictionary = setup._visual_seat_points()
		_expect(points["marble"][0] > .5 and points["blue"][1] < .5 and points["gold"][0] < .5 and points["green"][1] > .5,"counterclockwise projection")
		var half_width := clampf(dimensions.x * .12,86,142)/2.0
		if dimensions.y < 480: half_width = 49
		for value: Variant in points.values():
			var p := Vector2(value[0]*dimensions.x,value[1]*dimensions.y)
			_expect(p.x-half_width >= 8 and p.x+half_width <= dimensions.x-8,"horizontal clearance %s %s" % [dimensions,p])
			_expect(p.y-30 >= 40 and p.y+30 <= dimensions.y-48,"vertical clearance %s %s" % [dimensions,p])
		var payload := {"rounds":5,"players":[{"color":"green","mode":"local","label":"أحمد"},{"color":"marble","mode":"bot","label":"بوت"},{"color":"blue","mode":"local","label":"ريم"}]}
		var result: Dictionary = setup._validated_visual_configuration(payload)
		_expect(result.get("rounds") == 5 and result.get("tutorial") == false,"playable configuration")
		_expect(result["players"][0]["direction"] == "front","host direction")
		payload["players"][1]["color"] = "green"
		_expect(setup._validated_visual_configuration(payload).is_empty(),"reject duplicate colors")
		payload["players"][1]["color"] = "marble"
		payload["players"][1]["mode"] = "online"
		_expect(setup._validated_visual_configuration(payload).is_empty(),"no fake online start")
		setup._close_visual_setup()
		_expect(host.camera.transform.is_equal_approx(original),"restore gameplay camera")
		viewport.queue_free()
		await process_frame
	if failures.is_empty():
		print("YAKOLAK_VISUAL_SETUP_OK sizes=6 camera=top_down configuration=validated")
		quit(0)
	else:
		for failure: String in failures: push_error(failure)
		quit(1)
func _expect(condition: bool, message: String) -> void:
	if not condition: failures.append(message)
