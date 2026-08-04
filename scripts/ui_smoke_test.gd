extends SceneTree

const MAIN_SCENE := "res://scenes/main.tscn"
var failed := false

func _init() -> void:
	call_deferred("_run")

func _run() -> void:
	var packed := ResourceLoader.load(MAIN_SCENE, "PackedScene", ResourceLoader.CACHE_MODE_IGNORE) as PackedScene
	if packed == null:
		push_error("YAKOLAK UI smoke: main scene failed to load")
		quit(1)
		return
	var game := packed.instantiate()
	if game == null:
		push_error("YAKOLAK UI smoke: main scene failed to instantiate")
		quit(1)
		return
	root.add_child(game)
	for _frame in range(10):
		await process_frame
	if not _contains_start_button(game):
		push_error("YAKOLAK UI smoke: start button was not created")
		quit(1)
		return
	print("YAKOLAK UI smoke test passed: start button exists")
	quit(0)

func _contains_start_button(node: Node) -> bool:
	if node is Button and "ابدأ اللعبة" in String(node.text):
		return true
	for child in node.get_children():
		if _contains_start_button(child):
			return true
	return false
