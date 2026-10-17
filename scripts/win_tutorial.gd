extends RefCounted

# A presentation on the existing table while setup owns input. Never initializes
# a match, writes occupied_slots/played/scores, or submits a network command.
const Copy = preload("res://scripts/win_presentation.gd")
const Motion = preload("res://scripts/scene_motion.gd")
var owner: Node
var game: Node
var motion
var active := false
var busy := false
var closing := false
var stage := 0
var generation := 0
var request := ""
var moved: Array[int] = []
var touched: Array[int] = []
var home_poses: Dictionary = {}

func _init(node: Node) -> void:
	owner = node
	motion = Motion.new(node)
	game = node.get_parent().get_node("PostIntroGameplay")

func start(id: String) -> void:
	if active or bool(game.get("match_initialized")): return
	active = true
	busy = true
	closing = false
	stage = 0
	request = id
	generation += 1
	var token := generation
	home_poses.clear()
	touched.clear()
	for index: int in range(game.get("piece_records").size()):
		home_poses[index] = game.get("home_transforms")[index]
	var camera_motion: Tween = owner.get("visual_zoom_tween")
	if camera_motion != null and camera_motion.is_valid(): camera_motion.pause()
	_publish()
	# Intro-to-rest placement can still be settling when Learn is tapped quickly.
	var rest: Tween = game.get("rest_tween")
	if rest != null and rest.is_valid() and rest.is_running(): await rest.finished
	if not _valid(token): return
	_show_stage(0,token)

func next(id: String) -> void:
	if not active or busy or id != request: return
	if stage >= Copy.stages().size()-1:
		close(id)
	else:
		_show_stage(stage+1,generation)

func close(id: String) -> void:
	if not active or closing or id != request: return
	closing = true
	generation += 1
	var token := generation
	busy = true
	_publish()
	# Retarget from the displayed mid-flight pose, including an interrupted demo.
	motion.cancel_flights()
	_return_stones(true)
	await owner.get_tree().create_timer(_seconds(0.48)+0.06).timeout
	if not _valid(token): return
	active = false
	busy = false
	closing = false
	touched.clear()
	var camera_motion: Tween = owner.get("visual_zoom_tween")
	if camera_motion != null and camera_motion.is_valid(): camera_motion.play()
	_publish(true)

func cancel() -> void:
	# Intro replay owns the new physical reset; stale lesson callbacks own nothing.
	generation += 1
	motion.cancel()
	active = false
	busy = false
	closing = false
	moved.clear()
	touched.clear()
	home_poses.clear()
	_publish(true)

func _show_stage(index: int, token: int) -> void:
	busy = true
	_publish()
	if not moved.is_empty():
		_return_stones()
		await owner.get_tree().create_timer(_seconds(0.48)+0.06).timeout
		if not _valid(token): return
	stage = index
	_publish()
	var records: Array = game.get("piece_records")
	for move: Dictionary in Copy.stages()[stage].moves:
		if not _valid(token): return
		var selected := -1
		for i: int in range(records.size()):
			if str(records[i].dir)=="back" and str(records[i].type)==str(move.size) and not moved.has(i):
				selected = i
				break
		if selected < 0:
			close(request)
			return
		moved.append(selected)
		if not touched.has(selected): touched.append(selected)
		var mesh: MeshInstance3D = records[selected].mesh
		var target: Transform3D = home_poses[selected]
		target.origin = game.CELL_COORDS[int(move.cell)] * game.U
		motion.travel(mesh,target,_seconds(0.42),0.0,0.9)
		await owner.get_tree().create_timer(_seconds(0.42)+0.03).timeout
		if not _valid(token): return
	busy = false
	_publish()

func _return_stones(all_touched: bool = false) -> void:
	for index: int in (touched if all_touched else moved):
		var mesh: MeshInstance3D = game.get("piece_records")[index].mesh
		motion.travel(mesh,home_poses[index],_seconds(0.48),0.0,1.0)
	moved.clear()

func _seconds(value: float) -> float:
	# Keep a perceivable short transition with reduced motion, never teleport.
	return minf(value,0.16) if bool(owner.get("visual_reduce_motion")) else value

func _valid(token: int) -> bool:
	return active and token==generation and is_instance_valid(owner) and bool(owner.get("visual_active"))

func _publish(closed: bool = false) -> void:
	if not OS.has_feature("web"): return
	var payload := {"request":request,"stage":stage,"busy":busy,"closed":closed}
	JavaScriptBridge.eval("if(window.YakolakSetup)window.YakolakSetup.lesson("+JSON.stringify(payload)+");",true)
