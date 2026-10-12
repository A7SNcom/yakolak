extends SceneTree
func _init() -> void:
	call_deferred("_run")
func _run() -> void:
	var failures := 0
	for dimensions: Vector2i in [Vector2i(280,320),Vector2i(320,568),Vector2i(390,844),Vector2i(844,390),Vector2i(1366,768)]:
		var viewport := SubViewport.new()
		viewport.size = dimensions
		root.add_child(viewport)
		var gameplay := Node.new()
		viewport.add_child(gameplay)
		gameplay.set_script(load("res://scripts/gameplay_session_hardened.gd"))
		gameplay.set_process(false)
		gameplay.call("_build_waiting_overlay")
		gameplay.call("_build_quick_menu")
		(gameplay.get("waiting_root") as Control).visible = true
		for i in range(4):
			await process_frame
		gameplay.call("_layout_waiting_overlay")
		gameplay.call("_layout_quick_menu")
		await process_frame
		var bounds := Rect2(Vector2.ZERO, Vector2(dimensions))
		for key in ["waiting_card", "quick_panel"]:
			var panel: Control = gameplay.get(key)
			if not bounds.grow(1.0).encloses(panel.get_global_rect()):
				push_error("%s %s overflow %s" % [str(dimensions),key,str(panel.get_global_rect())])
				failures += 1
		viewport.queue_free()
		await process_frame
	if failures == 0:
		print("YAKOLAK_SECONDARY_DIALOGS_OK viewports=5 waiting+quick-menu")
	quit(failures)
