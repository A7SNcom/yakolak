extends "res://scripts/gameplay_session_efficient.gd"

# Spectator tutorial restored from the pre-v112 learning journey.
# The learner watches three complete scripted examples on the real board:
# 1) same-size line, 2) graded small/medium/large line, 3) full stack/tower.
# No tutorial move requires user input; the real match starts only afterwards.
# Keep this journey compact: it is onboarding before the match, not a cutscene.

const SHOWCASE_CAMERA_POSITION := Vector3(11.8, 17.2, 12.8)
const SHOWCASE_CAMERA_TARGET := Vector3(0.0, 0.45, 0.0)
const SHOWCASE_CAMERA_SECONDS: float = 0.42
# The Web showcase reuses the actual scene, so it must teach the winning shapes
# without holding the player in a long 15-move cutscene. These timings retain
# readable motion while bounding the amount of animated work before the match.
const SHOWCASE_MOVE_SECONDS: float = 0.30
const SHOWCASE_RESET_SECONDS: float = 0.26
const SHOWCASE_LEAD_SECONDS: float = 0.55
const SHOWCASE_MOVE_GAP_SECONDS: float = 0.09
const SHOWCASE_RESULT_SECONDS: float = 0.85
const SHOWCASE_TO_MATCH_SECONDS: float = 0.32
const SHOWCASE_ARC_HEIGHT: float = 22.0 * U

var tutorial_showcase_running: bool = false
var tutorial_showcase_generation: int = 0


func _process(delta: float) -> void:
	if tutorial_showcase_running:
		# Keep the cinematic smooth and freeze turn/bot logic while the learner
		# is only observing the scripted examples.
		_eff_apply_frame_budget(true)
		return
	super._process(delta)


func _start_turn() -> void:
	if tutorial_active and not tutorial_complete and not online_active:
		if tutorial_showcase_running:
			return
		tutorial_showcase_running = true
		gameplay_ready = false
		turn_deadline_msec = 0
		bot_scheduled = false
		bot_due_msec = 0
		camera_transition = false
		_reset_tray_state()
		selected_index = -1
		selected_original_material = null
		_hide_markers()
		if result_button != null:
			result_button.visible = false
		_eff_apply_frame_budget(true)
		_publish_tutorial_stage("starting")
		call_deferred("_run_spectator_tutorial")
		return
	super._start_turn()


func _reset_for_intro() -> void:
	tutorial_showcase_generation += 1
	tutorial_showcase_running = false
	_publish_tutorial_stage("idle")
	super._reset_for_intro()


func _run_spectator_tutorial() -> void:
	var generation: int = tutorial_showcase_generation
	if not _showcase_valid(generation):
		return
	if home_transforms.size() != piece_records.size():
		_capture_home_state()
	if home_transforms.size() != piece_records.size():
		_finish_showcase_safely()
		return

	await _showcase_overview_camera()
	if not _showcase_valid(generation):
		return

	var hero: String = _showcase_hero_direction()
	var rival: String = _showcase_rival_direction(hero)

	await _showcase_demo(
		generation,
		"line",
		"الفوز بالسطر — ثلاث قطع من نفس الحجم على خط",
		[
			{"dir": hero, "cell": 0, "size": "large"},
			{"dir": hero, "cell": 1, "size": "large"},
			{"dir": hero, "cell": 2, "size": "large"},
		],
		"هكذا يكتمل السطر وتفوز"
	)
	if not _showcase_valid(generation):
		return

	await _showcase_demo(
		generation,
		"stairs",
		"الفوز بالدرج — صغير، وسط، كبير على خط",
		[
			{"dir": hero, "cell": 6, "size": "small"},
			{"dir": hero, "cell": 4, "size": "medium"},
			{"dir": hero, "cell": 2, "size": "large"},
		],
		"صغير ثم وسط ثم كبير: هذا هو الدرج الفائز"
	)
	if not _showcase_valid(generation):
		return

	await _showcase_demo(
		generation,
		"tower",
		"الفوز بالبرج — صغير، وسط، كبير في نفس الخانة",
		[
			{"dir": hero, "cell": 4, "size": "small"},
			{"dir": hero, "cell": 4, "size": "medium"},
			{"dir": hero, "cell": 4, "size": "large"},
		],
		"الثلاثة في خانة واحدة يصنعون برجًا فائزًا"
	)
	if not _showcase_valid(generation):
		return

	await _showcase_reset_board(true)
	if not _showcase_valid(generation):
		return

	tutorial_complete = true
	tutorial_active = false
	tutorial_showcase_running = false
	current_player_index = round_starter_index
	if turn_label != null:
		turn_label.text = "الآن تبدأ المباراة الحقيقية"
	if score_label != null:
		score_label.text = ""
	_publish_tutorial_stage("complete")
	await get_tree().create_timer(SHOWCASE_TO_MATCH_SECONDS).timeout
	if not match_initialized or online_active:
		return
	_start_turn()


func _showcase_demo(
	generation: int,
	stage: String,
	lead_text: String,
	moves: Array,
	win_text: String
) -> void:
	await _showcase_reset_board(true)
	if not _showcase_valid(generation):
		return
	_publish_tutorial_stage(stage)
	_showcase_caption(lead_text, stage)
	await get_tree().create_timer(SHOWCASE_LEAD_SECONDS).timeout

	for move_value: Variant in moves:
		if not _showcase_valid(generation):
			return
		var move: Dictionary = move_value as Dictionary
		await _showcase_place_piece(
			str(move.get("dir", "")),
			str(move.get("size", "")),
			int(move.get("cell", -1))
		)
		await get_tree().create_timer(SHOWCASE_MOVE_GAP_SECONDS).timeout

	if not _showcase_valid(generation):
		return
	var hero: String = _showcase_hero_direction()
	var winning: Array[int] = _find_winning_pieces(hero)
	if winning.size() == 3:
		_highlight_winning_pieces(winning)
	_showcase_caption(win_text, stage)
	await get_tree().create_timer(SHOWCASE_RESULT_SECONDS).timeout


func _showcase_place_piece(direction: String, size_name: String, cell: int) -> void:
	if cell < 0 or cell >= CELL_COORDS.size():
		return
	var piece_index: int = _find_unplayed_piece(direction, size_name)
	if piece_index < 0:
		return
	var record: Dictionary = piece_records[piece_index] as Dictionary
	var piece: MeshInstance3D = record.get("mesh") as MeshInstance3D
	if piece == null:
		return

	piece.visible = true
	if piece_index < home_materials.size():
		piece.material_override = _selection_material(home_materials[piece_index])
	var target: Vector3 = CELL_COORDS[cell] * U
	var midpoint: Vector3 = piece.position.lerp(target, 0.50) + Vector3.UP * SHOWCASE_ARC_HEIGHT
	var first_half: float = SHOWCASE_MOVE_SECONDS * 0.48
	var second_half: float = SHOWCASE_MOVE_SECONDS - first_half
	var tween: Tween = create_tween()
	tween.tween_property(piece, "position", midpoint, first_half).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(piece, "position", target, second_half).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
	await tween.finished

	piece.position = target
	piece.scale = Vector3.ONE * U
	if piece_index < home_materials.size():
		piece.material_override = home_materials[piece_index]
	record["played"] = true
	piece_records[piece_index] = record
	occupied_slots[_slot_key(cell, size_name)] = piece_index
	move_count += 1


func _showcase_reset_board(animate: bool) -> void:
	_reset_tray_state()
	selected_index = -1
	selected_original_material = null
	occupied_slots.clear()
	move_count = 0
	move_active = false
	move_piece_index = -1
	move_cell = -1
	winning_piece_indices.clear()
	_hide_markers()

	var tween: Tween
	if animate:
		tween = create_tween()
		tween.set_parallel(true)
	for index: int in range(piece_records.size()):
		var record: Dictionary = piece_records[index] as Dictionary
		record["played"] = false
		piece_records[index] = record
		var piece: MeshInstance3D = record.get("mesh") as MeshInstance3D
		if piece == null or index >= home_transforms.size():
			continue
		if index < home_materials.size():
			piece.material_override = home_materials[index]
		if animate:
			tween.tween_property(piece, "transform", home_transforms[index], SHOWCASE_RESET_SECONDS).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
		else:
			piece.transform = home_transforms[index]
	if animate and tween != null:
		await tween.finished
	_sync_active_sides()


func _showcase_overview_camera() -> void:
	if camera == null:
		return
	var target_transform := Transform3D(Basis.IDENTITY, SHOWCASE_CAMERA_POSITION).looking_at(SHOWCASE_CAMERA_TARGET, Vector3.UP)
	var tween: Tween = create_tween()
	tween.set_parallel(true)
	tween.tween_property(camera, "position", SHOWCASE_CAMERA_POSITION, SHOWCASE_CAMERA_SECONDS).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	tween.tween_property(camera, "quaternion", target_transform.basis.get_rotation_quaternion(), SHOWCASE_CAMERA_SECONDS).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	tween.tween_property(camera, "fov", 49.0, SHOWCASE_CAMERA_SECONDS).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	await tween.finished


func _showcase_hero_direction() -> String:
	if not players.is_empty():
		return str(players[0].get("direction", "right"))
	return "right"


func _showcase_rival_direction(hero: String) -> String:
	for player: Dictionary in players:
		var direction: String = str(player.get("direction", ""))
		if not direction.is_empty() and direction != hero:
			return direction
	for fallback: String in ["back", "left", "front", "right"]:
		if fallback != hero:
			return fallback
	return "back"


func _showcase_caption(text: String, stage: String) -> void:
	if turn_label != null:
		turn_label.text = text
	if score_label != null:
		match stage:
			"line": score_label.text = "1 / 3"
			"stairs": score_label.text = "2 / 3"
			"tower": score_label.text = "3 / 3"
			_: score_label.text = ""


func _showcase_valid(generation: int) -> bool:
	return tutorial_showcase_running and generation == tutorial_showcase_generation and match_initialized and not online_active


func _finish_showcase_safely() -> void:
	tutorial_complete = true
	tutorial_active = false
	tutorial_showcase_running = false
	_publish_tutorial_stage("fallback")
	_start_turn()


func _publish_tutorial_stage(stage: String) -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval(
		"document.body.dataset.yakolakTutorialExperience='spectator-three-demo';" +
		"document.body.dataset.yakolakTutorialStage='" + stage + "';" +
		"document.body.dataset.yakolakTutorialInteractive='false';",
		true
	)