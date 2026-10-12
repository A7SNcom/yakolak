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
		host.camera.position = Vector3(17.6,14.432,17.6)
		host.camera.look_at(Vector3(0,0.35,0),Vector3.UP)
		host.camera.fov = 45
		var original := host.camera.transform
		var setup = Setup.new()
		host.add_child(setup)
		await process_frame
		setup.show_after_intro()
		await process_frame
		_expect(not setup.card.visible, "legacy scroll window hidden")
		_expect(not setup.dialog_navigation.visible, "legacy back hidden")
		_expect(host.camera.projection == Camera3D.PROJECTION_PERSPECTIVE, "intro perspective preserved")
		_expect(host.camera.transform.is_equal_approx(original), "exact final intro shot")
		setup.visual_step = "color"
		setup.visual_selected_color = "blue"
		setup._apply_visual_camera()
		_expect(setup.visual_prompt is Label3D and setup.visual_prompt.text == "اختر لونك", "real world prompt")
		_expect(setup.visual_prompt.global_basis.is_equal_approx(host.camera.global_basis), "prompt faces camera")
		_expect(setup.visual_selection.visible,"selected color has world highlight")
		var geometry: Dictionary = setup._visual_seat_points()
		var points: Dictionary = geometry["seats"]
		_expect(points["marble"][0] > .5 and points["blue"][1] < .5 and points["gold"][0] < .5 and points["green"][1] > .5,"counterclockwise projection")
		for value: Variant in points.values():
			_expect(value[0] >= 0 and value[0] <= 1 and value[1] >= 0 and value[1] <= 1,"projected color stays on table")
		_expect(geometry["hits"].size() == 4,"four projected touch regions")
		var prompt := Vector2(geometry["prompt"][0]*dimensions.x,geometry["prompt"][1]*dimensions.y)
		var reserved := Rect2(prompt + Vector2(-86,-18),Vector2(172,104))
		var occupied: Array[Rect2] = []
		for value: Variant in geometry["controls"].values():
			var point := Vector2(value[0]*dimensions.x,value[1]*dimensions.y)
			var rect := Rect2(point-Vector2(52,32.5),Vector2(104,65))
			_expect(not rect.intersects(reserved),"world seat avoids center controls %s" % dimensions)
			for other: Rect2 in occupied: _expect(not rect.intersects(other),"world seats do not overlap %s" % dimensions)
			occupied.append(rect)

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
		print("YAKOLAK_VISUAL_SETUP_OK sizes=6 camera=intro_perspective configuration=validated")
		quit(0)
	else:
		for failure: String in failures: push_error(failure)
		quit(1)
func _expect(condition: bool, message: String) -> void:
	if not condition: failures.append(message)
