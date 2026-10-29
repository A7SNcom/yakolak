extends SceneTree

const Copy = preload("res://scripts/win_presentation.gd")
const Rules = preload("res://scripts/game_rules.gd")
var failures: Array[String] = []
var checks := 0
var intro: Node
var game: Node
var setup: Node
var lesson
var camera: Camera3D
var held_camera: Transform3D

func _init() -> void:
	call_deferred("_run")

func _expect(value: bool, message: String) -> void:
	checks += 1
	if not value: failures.append(message)

func _watch(seconds: float) -> void:
	var until := Time.get_ticks_msec()+int(seconds*1000)
	var previous: Array[Transform3D] = []
	for record: Dictionary in game.piece_records: previous.append(record.mesh.transform)
	var at := Time.get_ticks_msec()
	var previous_camera := camera.transform
	var previous_frame_seconds := root.get_process_delta_time()
	while Time.get_ticks_msec()<until:
		await process_frame
		var now := Time.get_ticks_msec()
		# process_frame resumes before this frame's tweens. The displayed pose
		# includes the previous engine step, which can exceed a millisecond wall
		# sample in an uncapped headless run. Measure that real step as well.
		var delta := maxf(maxf(float(now-at)/1000.0,previous_frame_seconds),0.001)
		if lesson.active: _expect(camera.transform.is_equal_approx(held_camera),"lesson camera holds the actual entry pose")
		_expect(camera.position.distance_to(previous_camera.origin)<0.10+40.0*delta,"closing resumes the existing camera without a cut")
		previous_camera=camera.transform
		for i: int in range(game.piece_records.size()):
			var stone: MeshInstance3D = game.piece_records[i].mesh
			_expect(stone.visible,"lesson never hides a real stone")
			var distance := stone.position.distance_to(previous[i].origin)
			if distance<0.15+80.0*delta:
				checks+=1
			else:
				_expect(false,"stone motion has intermediate positions, including cancellation: stone=%d distance=%.4f elapsed=%.4f frame=%.4f previous_frame=%.4f request=%s stage=%d active=%s closing=%s" % [i,distance,delta,root.get_process_delta_time(),previous_frame_seconds,lesson.request,lesson.stage,str(lesson.active),str(lesson.closing)])
			previous[i]=stone.transform
		_expect(not game.match_initialized and game.occupied_slots.is_empty() and game.move_count==0,"lesson never mutates match authority")
		at=now
		previous_frame_seconds=root.get_process_delta_time()

func _until_ready() -> void:
	var until := Time.get_ticks_msec()+4500
	while lesson.busy and Time.get_ticks_msec()<until: await _watch(0.08)
	_expect(not lesson.busy,"demo finishes without waiting for an unbounded callback")

func _at_home() -> void:
	for i: int in range(game.piece_records.size()):
		_expect(game.piece_records[i].mesh.transform.is_equal_approx(game.home_transforms[i]),"lesson returns every stone to the same physical rack")

func _patterns() -> void:
	for spec: Dictionary in Copy.stages():
		var slots := {}
		var records: Array = []
		for move: Dictionary in spec.moves:
			slots["%d:%s" % [int(move.cell),move.size]]=records.size()
			records.append({"dir":"back","type":move.size})
		var patterns := Rules.winning_patterns(slots,records,"back")
		_expect(patterns.size()==1 and patterns[0].type==spec.pattern,"tutorial example matches its canonical win, not a heuristic")
		_expect(Copy.winner_text(slots,records,"back","ريم") == str(spec.winner) % "ريم","each winning type uses the actual player's name and exact copy")
		_expect(Copy.winner_text(slots,records,"front","ريم").is_empty(),"a different color cannot claim the win")
	var slots := {"0:large":0,"1:large":1,"2:large":2,"2:small":3,"2:medium":4}
	var records: Array = [{"dir":"back"},{"dir":"back"},{"dir":"back"},{"dir":"back"},{"dir":"back"}]
	var text := Copy.winner_text(slots,records,"back","أحمد")
	_expect(text.contains("أحمد هبطكم من البرج") and text.contains("أحمد سطركم تستطير !"),"simultaneous tower and line keep both correct messages")
	_expect(not text.contains("الدرج"),"multiple winning stones do not invent a graded line")
	_expect(Rules.winning_piece_indices(slots,records,"back").size()==5,"canonical union of simultaneous wins stays intact")
	var mixed := {"4:small":0,"4:medium":1,"4:large":2}
	_expect(Copy.winner_text(mixed,[{"dir":"back"},{"dir":"front"},{"dir":"back"}],"back","ريم").is_empty(),"mixed-color nesting is not a tower win")
	var unordered := {"0:small":0,"1:large":1,"2:medium":2}
	_expect(Copy.winner_text(unordered,records,"back","ريم").is_empty(),"unordered sizes are not a stair win")

func _run() -> void:
	_patterns()
	root.size=Vector2i(390,844)
	intro=preload("res://scenes/intro.tscn").instantiate()
	root.add_child(intro)
	await process_frame
	game=intro.get_node("PostIntroGameplay")
	setup=intro.get_node("SessionSetup")
	intro.call("_restart_intro")
	intro.call("_snap_final")
	intro.set("playing",false)
	intro.call("_publish_complete")
	await create_timer(1.5).timeout
	camera=intro.get("camera")
	lesson=setup.visual_lesson
	held_camera=camera.transform
	lesson.start("early-exit")
	await _watch(0.18)
	lesson.close("early-exit")
	await _watch(0.65)
	_expect(not lesson.active,"exit mid-placement completes")
	_at_home()
	held_camera=camera.transform
	lesson.start("three-ways")
	await _until_ready()
	_expect(lesson.stage==0 and lesson.moved.size()==3,"tower lands three real stones")
	lesson.next("stale-request")
	_expect(lesson.stage==0 and not lesson.busy,"stale controls cannot advance a new tutorial")
	lesson.next("three-ways")
	await _watch(0.15)
	lesson.close("three-ways")
	await _watch(0.65)
	_expect(not lesson.active,"exit while stones return completes")
	_at_home()
	held_camera=camera.transform
	lesson.start("complete")
	for index: int in range(3):
		await _until_ready()
		_expect(lesson.stage==index,"the short sequence preserves tower, stairs, line order")
		if index==0:
			root.size=Vector2i(844,390)
			await _watch(0.2)
		var positions: Array = []
		for i: int in lesson.moved: positions.append(game.piece_records[i].mesh.position)
		for move: Dictionary in Copy.stages()[index].moves:
			_expect(positions.has(game.CELL_COORDS[int(move.cell)]*game.U),"demo stones use the actual gameplay pockets")
		lesson.next("complete")
	await _watch(0.65)
	_expect(not lesson.active and bool(setup.visual_active) and game.waiting_for_setup,"finish returns to the existing setup, without creating a match")
	_at_home()
	# Exercise the actual result surface, not only the copy helper.
	setup.call("_on_visual_action",[JSON.stringify({"action":"start","rounds":3,"players":[{"color":"blue","mode":"local","label":"ريم","device_owner":"p1"},{"color":"marble","mode":"local","label":"أحمد","device_owner":"p1"}]})])
	game.turn_deadline_msec=0
	for move: Dictionary in Copy.stages()[1].moves:
		var i: int = game.call("_find_unplayed_piece","back",str(move.size))
		game.piece_records[i].played=true
		game.occupied_slots["%d:%s" % [int(move.cell),move.size]]=i
	game.call("_finish_round","back",game.call("_find_winning_pieces","back"))
	await process_frame
	await process_frame
	_expect(game.win_banner_label.text=="ريم دردبكم من الدرج" and game.win_banner.visible,"gameplay displays the correct named stair result")
	for dimensions: Vector2i in [Vector2i(320,568),Vector2i(390,844),Vector2i(844,390),Vector2i(1280,720)]:
		root.size=dimensions
		root.content_scale_size=dimensions
		game._layout_hud()
		var long_name := "عبدالرحمن محمد عبدالله"
		game.win_banner_label.text="%s هبطكم من البرج\n%s دردبكم من الدرج\n%s سطركم تستطير !" % [long_name,long_name,long_name]
		game._layout_win_banner()
		await process_frame
		await process_frame
		var panel: Rect2=game.win_banner.get_global_rect()
		var text: Rect2=game.win_banner_label.get_global_rect()
		_expect(panel.encloses(text),"banner background encloses the longest simultaneous result text")
		_expect(panel.position.x>=0 and panel.end.x<=dimensions.x+1 and panel.end.y<dimensions.y,"named win banner fits phone, landscape and desktop")
		_expect(game.win_banner_label.get_visible_line_count()==game.win_banner_label.get_line_count(),"win text wraps without clipped lines")
	intro.queue_free()
	await process_frame
	if failures.is_empty(): print("YAKOLAK_SHORT_WIN_TUTORIAL_OK checks=%d" % checks)
	else:
		for failure: String in failures: push_error(failure)
	quit(0 if failures.is_empty() else 1)
