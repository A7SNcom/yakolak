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
		await create_timer(1.35).timeout
		_expect(not setup.card.visible, "legacy scroll window hidden")
		_expect(not setup.dialog_navigation.visible, "legacy back hidden")
		_expect(host.camera.projection == Camera3D.PROJECTION_PERSPECTIVE, "intro perspective preserved")
		_expect(host.camera.basis.is_equal_approx(original.basis), "intro angle preserved")
		setup.visual_step = "color"
		setup.visual_selected_color = "blue"
		setup._apply_visual_camera()
		_expect(setup.visual_prompt is Label3D and setup.visual_prompt.text == "اختر لونك", "real world prompt")
		_expect(setup.visual_prompt.global_basis.is_equal_approx(host.camera.global_basis), "prompt faces camera")
		setup.visual_preview_seats = [{"color":"blue","mode":"local"},{"color":"gold","mode":"bot"},{"color":"green","mode":"none"},{"color":"marble","mode":"none"}]
		setup._update_visual_seats()
		await create_timer(0.32).timeout
		_expect((setup.visual_lights["blue"] as OmniLight3D).light_energy > (setup.visual_lights["gold"] as OmniLight3D).light_energy,"selected color gets stronger light")
		for record: Dictionary in setup.visual_piece_visibility.values():
			if record.has("preview_material"):
				var material := record["preview_material"] as BaseMaterial3D
				_expect(material.albedo_color.is_equal_approx(record["original_color"]),"selection lighting preserves original piece color")
		var geometry: Dictionary = setup._visual_seat_points()
		var points: Dictionary = geometry["seats"]
		_expect(points["marble"][0] > .5 and points["blue"][1] < .5 and points["gold"][0] < .5 and points["green"][1] > .5,"counterclockwise projection")
		for value: Variant in points.values():
			_expect(value[0] >= 0 and value[0] <= 1 and value[1] >= 0 and value[1] <= 1,"projected color stays on table")
		_expect(geometry["hits"].size() == 4,"four projected touch regions")
		var board: Array = geometry["board"]
		var rect := Rect2(board[0],board[1],board[2],board[3])
		_expect(rect.size.x > dimensions.x*.65 or rect.size.y > dimensions.y*.40,"table fills available region %s" % dimensions)
		_expect(geometry["prompt"][1]*dimensions.y < rect.position.y,"prompt is above the table")
		_expect(geometry["actions"][1]*dimensions.y > rect.end.y,"choices are below the table")
		setup.visual_step = "count"
		setup._apply_visual_camera()
		_expect(not (setup.visual_world_seats["blue"]["node"] as Node3D).visible,"no seat numbers before count selected")
		setup.visual_step = "ready"
		setup._apply_visual_camera()
		var label: Label3D = setup.visual_world_seats["blue"]["label"]
		_expect(not label.visible,"seat text is rendered by the glass DOM layer, not duplicated in 3D")
		_expect(label.font.has_char(0x2304),"arrow font glyph is available in web export")

		var payload := {"rounds":5,"players":[{"color":"green","mode":"local","label":"أحمد"},{"color":"marble","mode":"bot","label":"بوت"},{"color":"blue","mode":"local","label":"ريم"}]}
		var result: Dictionary = setup._validated_visual_configuration(payload)
		_expect(result.get("rounds") == 5 and result.get("tutorial") == false,"playable configuration")
		_expect(result["players"][0]["direction"] == "front","host direction")
		payload["players"][1]["color"] = "green"
		_expect(setup._validated_visual_configuration(payload).is_empty(),"reject duplicate colors")
		payload["players"][1]["color"] = "marble"
		payload["players"][1]["mode"] = "online"
		_expect(setup._validated_visual_configuration(payload).is_empty(),"no fake online start")
		payload["players"][1]["mode"] = "local"
		payload["players"][1]["label"] = ""
		var optional_name: Dictionary = setup._validated_visual_configuration(payload)
		_expect(optional_name.get("players",[]).size() == 3 and optional_name["players"][1]["label"].begins_with("لاعب "),"blank local name uses a color fallback")
		setup._close_visual_setup()
		_expect(host.camera.transform.is_equal_approx(original),"restore gameplay camera")
		viewport.queue_free()
		await process_frame
	if failures.is_empty():
		print("YAKOLAK_VISUAL_SETUP_OK sizes=6 camera=framed_intro_angle configuration=validated")
		quit(0)
	else:
		for failure: String in failures: push_error(failure)
		quit(1)
func _expect(condition: bool, message: String) -> void:
	if not condition: failures.append(message)
