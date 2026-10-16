extends SceneTree

# Replay canonical RoomAuthority output through the real production scene.
# This tests mesh/camera presentation, and makes no claim to test networking.
var failures: Array[String] = []
var checks: int = 0
var game: Node
var intro: Node
var online: Node

func _init() -> void:
	call_deferred("_run")

func _expect(condition: bool, message: String) -> void:
	checks += 1
	if not condition: failures.append(message)

func _accept(room: Dictionary, seat: String = "p1") -> void:
	online.set("room", room.duplicate(true))
	var identity := {"code":str(room["code"]),"seat":seat,"token":"presentation-test"}
	online.set("identity",identity)
	game.call("_on_online_room_changed",room,identity)

func _clean() -> void:
	game.call("_reset_session_transients")
	game.call("_clean_visual_board")
	game.set("waiting_for_setup",false)

func _piece(index: int) -> MeshInstance3D:
	return game.get("piece_records")[index]["mesh"] as MeshInstance3D

func _run() -> void:
	var cases: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://generated/online-presentation.json"))
	intro = preload("res://scenes/intro.tscn").instantiate()
	root.add_child(intro)
	await process_frame
	game = intro.get_node("PostIntroGameplay")
	online = intro.get_node("OnlineSession")
	intro.call("_restart_intro")
	intro.call("_snap_final")
	intro.set("playing",false)
	intro.call("_publish_complete")
	for frame in range(6): await process_frame
	_expect(bool(game.get("waiting_for_setup")),"real intro handoff initializes presentation")
	intro.get_node("SessionSetup").call("reset_for_intro")

	# All four identities keep their own perspective through all four turns.
	for viewport: Vector2i in [Vector2i(1280,900),Vector2i(390,844)]:
		root.size=viewport
		await process_frame
		for seat_number in range(1,5):
			_clean()
			var seat := "p%d" % seat_number
			_accept(cases.four[0],seat)
			var camera: Camera3D = game.get("camera")
			var fixed: Transform3D = camera.transform
			var fov: float = camera.fov
			var direction: String = game.get("players")[seat_number-1]["direction"]
			_expect(str(game.get("turn_presentation_settled_direction"))==direction,"camera belongs to "+seat)
			for snapshot: Dictionary in cases.four.slice(1):
				_accept(snapshot,seat)
				await process_frame
				_expect(camera.transform.is_equal_approx(fixed) and is_equal_approx(camera.fov,fov),"online turn never rotates "+seat)
				_expect(not bool(game.get("turn_camera_active")),"online view has no turn tween")
				_expect(int(game.get("current_player_index"))==int(snapshot.turnIndex),"fixed camera preserves accepted turn")
			await create_timer(0.6).timeout

	_clean()
	game.set("_rm_enabled",false)
	_accept(cases.two[0])
	# Choose a particular physical copy. A lower numbered later cell must never
	# steal this mesh, restart its motion, or rebuild the entire board.
	var selected: int = -1
	for index: int in range(game.get("piece_records").size()):
		var record: Dictionary = game.get("piece_records")[index]
		if record.dir=="right" and record.type=="small": selected=index
	game.call("_open_piece_tray",selected)
	game.call("_select_tray_piece",selected)
	await create_timer(0.4).timeout
	var selection_position: Vector3 = _piece(selected).position
	_accept(cases.two[0])
	_expect(int(game.get("selected_index"))==selected and bool(game.get("tray_open")),"same-board presence snapshot preserves live selection")
	_expect(_piece(selected).position.is_equal_approx(selection_position),"same-board update preserves tray position")
	_accept(cases.two[1])
	_expect(int(game.get("occupied_slots")["8:small"])==selected,"acknowledged move animates the selected physical copy")
	_expect(game.get("online_piece_motions").has(selected),"accepted move starts actual mesh tween")
	var target: Vector3 = game.CELL_COORDS[8]*game.U
	_expect(not _piece(selected).position.is_equal_approx(target),"move does not teleport immediately")
	await create_timer(0.20).timeout
	_expect(not _piece(selected).position.is_equal_approx(selection_position) and not _piece(selected).position.is_equal_approx(target),"stone visibly traverses its arc")
	var motion: Tween = game.get("online_piece_motions")[selected]
	_accept(cases.two[1])
	_expect(game.get("online_piece_motions")[selected]==motion,"duplicate/presence snapshot never restarts motion")
	# Fast subsequent remote and local commits can overlap visual arcs.
	_accept(cases.two[2])
	_accept(cases.two[3])
	_expect(int(game.get("occupied_slots")["8:small"])==selected,"adding a lower cell preserves every existing stone identity")
	_expect(game.get("online_piece_motions").size()>=2,"separate accepted moves keep independent visual motions")
	await create_timer(0.65).timeout
	_expect(_piece(selected).position.is_equal_approx(target),"stone lands at exact canonical coordinates")
	_expect(game.get("online_piece_motions").is_empty(),"completed motions release their handles")
	_expect(int(game.get("move_count"))==3 and int(game.get("current_player_index"))==1,"tween completion never changes authoritative board or turn")
	_accept(cases.two[4])
	_accept(cases.two[5])
	_expect(game.get("winning_piece_indices").size()==3,"winning meshes are known before synchronous result hooks")
	for winner: int in game.get("winning_piece_indices"):
		_expect(not game.get("victory_materials").has(winner),"winner never enters the nonwinner fade")
	await create_timer(0.65).timeout
	game.call("_set_victory_mix",1.0)
	var winning: Array = game.get("winning_piece_indices").duplicate()
	for index: int in game.get("occupied_slots").values():
		_expect(_piece(index).visible==winning.has(index),"full fade hides only nonwinning board stones")
	_accept(cases.vote)
	game.call("_set_victory_mix",1.0)
	for index: int in winning:
		_expect(_piece(index).visible and _piece(index).material_override==game.get("home_materials")[index],"consent snapshot keeps winners visible in their exact material")
	# Recovery hydrates truth without replaying already committed moves.
	online.set("reconnecting",true)
	_accept(cases.two[5])
	online.set("reconnecting",false)
	_expect(game.get("online_piece_motions").is_empty(),"reconnect snaps to full accepted board instead of replaying moves")
	game.call("_set_victory_mix",1.0)
	for index: int in game.get("winning_piece_indices"):
		_expect(_piece(index).visible,"reconnect preserves winning stones")
	_accept(cases.nextRound)

	_expect(bool(game.get("online_round_return_active")),"next online round reuses the existing physical return")
	_expect(not _piece(selected).position.is_equal_approx(game.get("home_transforms")[selected].origin),"continue never flashes board stones straight home")
	var return_motion: Tween = game.get("stability_round_reset_tween")
	await create_timer(0.2).timeout
	_accept(cases.nextRound)
	_expect(game.get("stability_round_reset_tween")==return_motion,"presence snapshots never restart the physical return")
	_expect(not bool(game.call("authoritative_turn_snapshot").get("valid",true)),"returning stones hold input until they land")
	_expect(game.get("victory_materials").is_empty() and game.get("winning_piece_indices").is_empty(),"round boundary clears old celebration ownership")
	_expect(game.get("occupied_slots").is_empty() and game.get("online_piece_motions").is_empty(),"round boundary cancels all old visual completions")
	await create_timer(1.1).timeout
	for index: int in range(game.get("piece_records").size()):
		_expect(_piece(index).position.is_equal_approx(game.get("home_transforms")[index].origin),"late callback cannot pull reset reserve back onto board")
	# Reduced motion keeps the same accepted board and readiness without arcs.
	_clean()
	game.set("_rm_enabled",true)
	_accept(cases.two[0])
	_accept(cases.two[1])
	_expect(game.get("online_piece_motions").is_empty(),"reduced motion commits the same visual final state without tween")
	var snap_index: int = game.get("occupied_slots")["8:small"]
	_expect(_piece(snap_index).position.is_equal_approx(target),"reduced motion lands on identical canonical position")
	# Mixed seats use a single host authority. The host's second local human
	# is playable on that device; bots remain remote-authoritative presentation.
	_clean()
	_accept(cases.mixed[2],"p1")
	_expect(bool(game.call("_online_controls_seat","p3")),"host owns local co-player seat")
	_expect(not bool(game.call("_online_controls_seat","p2")) and not bool(game.call("_online_controls_seat","p4")),"host cannot manually control guest or bot")
	_expect(str(game.get("players")[2]["mode"])=="local","host co-player is locally interactive")
	_expect(bool(online.call("_can_apply_move_intent",{"cell":1,"size":"small","seat":"p3"})),"transport retry guard accepts host co-player")
	_expect(not bool(online.call("_can_apply_move_intent",{"cell":1,"size":"small","seat":"p1"})),"transport retry never reinterprets stale host-seat intention")
	_expect(int(game.get("turn_deadline_msec"))-Time.get_ticks_msec()>29000,"host receives authoritative online clock")
	var timed: Dictionary = cases.mixed[2].duplicate(true)
	timed["turnRemainingMs"]=19000
	_accept(timed,"p1")
	game.call("_update_turn_countdown",Time.get_ticks_msec())
	_expect(game.get("turn_countdown").visible,"online turn timer becomes visible")
	_expect(str(game.get("turn_countdown_label").text).contains("19"),"timer shows accepted remaining seconds")
	timed["paused"]=true
	_accept(timed,"p1")
	_expect(int(game.get("turn_deadline_msec"))==0,"disconnect freezes engine timer")
	_accept(cases.mixed[3],"p1")
	_expect(str(game.get("players")[3]["mode"])=="online","engine never runs its own bot in a network room")
	_accept(cases.mixed[4],"p1")
	_expect(int(game.get("move_count"))==4,"authoritative bot move reaches the board")
	_expect(bool(online.call("_mutation_already_applied","move",{"cell":1,"size":"small","seat":"p3"}))==false,"bot last move does not acknowledge co-player intent")
	_clean()
	_accept(cases.mixed[2],"p2")
	_expect(not bool(game.call("_online_controls_seat","p3")),"guest cannot play host co-player")
	_expect(str(game.get("players")[2]["mode"])=="online","host co-player stays remote on guest device")

	# Click hides immediately. A late shared vote and a repeated snapshot do
	# not restore the button; only the next round clears the waiting state.
	_clean()
	_accept(cases.two[5],"p1")
	var fill: ProgressBar = game.get("continue_fill")
	_expect(fill.visible and fill.fill_mode==ProgressBar.FILL_END_TO_BEGIN and not fill.is_layout_rtl(),"continue fill advances from physical right to left")
	game.set("continue_due_msec",Time.get_ticks_msec()+5000)
	game.call("_sync_continue_controls")
	_expect(fill.value>=49 and fill.value<=51,"transparent fill tracks the ten-second duration")
	game.call("_on_round_action")
	_expect(not game.get("result_button").visible and game.get("continue_waiting").visible,"click hides continue and displays waiting")
	_accept(cases.vote,"p1")
	_expect(not game.get("result_button").visible,"accepted own vote keeps continue hidden")
	_accept(cases.nextRound,"p1")
	_expect(not bool(game.get("continue_pending")) and not game.get("continue_waiting").visible,"round change clears consent UI")
	_accept(cases.two[5],"p2")
	game.set("continue_due_msec",Time.get_ticks_msec()-1)
	game.call("_sync_continue_controls")
	_expect(bool(game.get("continue_pending")) and not game.get("result_button").visible,"elapsed deadline automatically presses once")
	game.call("_sync_continue_controls")
	_expect(int(game.get("continue_due_msec"))==0,"auto acknowledgement consumes its deadline")
	_expect(int(ProjectSettings.get_setting("rendering/anti_aliasing/quality/msaa_3d"))==Viewport.MSAA_4X,"project keeps four-sample edges on mobile")
	_expect(int(ProjectSettings.get_setting("rendering/lights_and_shadows/directional_shadow/size.mobile"))==4096,"mobile keeps detailed shadows")

	# A bot/remote may already move in the next round while stones are still
	# returning. Queue that accepted board and animate it after the shared reset.
	_clean()
	game.set("_rm_enabled",false)
	_accept(cases.two[5],"p1")
	_accept(cases.nextRound,"p1")
	var homeward: Tween = game.get("stability_round_reset_tween")
	_accept(cases.earlyNextMove,"p1")
	_expect(game.get("stability_round_reset_tween")==homeward and bool(game.get("online_round_return_active")),"early accepted move cannot cancel or snap the return")
	await create_timer(1.25).timeout
	_expect(not bool(game.get("online_round_return_active")),"return completes after every lift and staggered landing")
	_expect(game.get("occupied_slots").has("2:medium"),"early accepted board is rendered after return")
	await create_timer(0.6).timeout
	var early: int = game.get("occupied_slots")["2:medium"]
	_expect(_piece(early).position.is_equal_approx(game.CELL_COORDS[2]*game.U),"queued placement survives every stale return callback")
	# Recovery still snaps to truth and cancels old physical owners.
	_clean()
	_accept(cases.two[5],"p1")
	_accept(cases.nextRound,"p1")
	online.set("reconnecting",true)
	_accept(cases.earlyNextMove,"p1")
	online.set("reconnecting",false)
	_expect(not bool(game.get("online_round_return_active")) and game.get("stability_piece_tweens").is_empty(),"hydration cancels every home-return tween")
	await create_timer(1.2).timeout
	early=game.get("occupied_slots")["2:medium"]
	_expect(_piece(early).position.is_equal_approx(game.CELL_COORDS[2]*game.U),"late old return cannot overwrite rehydrated truth")
	var hud: Node = intro.get_node("TurnClarityHUD")
	_clean()
	_accept(cases.mixed[0],"p2")
	_expect(str(hud.get("indicator_label").text)=="دور أحمد","indicator uses actual host name")
	_accept(cases.mixed[1],"p2")
	_expect(str(hud.get("indicator_label").text)=="دور ريم","indicator uses actual local guest name")
	_accept(cases.mixed[2],"p2")
	_expect(str(hud.get("indicator_label").text)=="دور عمر","indicator uses actual shared-device co-player name")
	_accept(cases.mixed[3],"p2")
	_expect(str(hud.get("indicator_label").text).contains("يفكر"),"online bot retains the existing thinking indication")
	var renamed: Dictionary = cases.mixed[1].duplicate(true)
	renamed.players[1].name="سارة"
	_accept(renamed,"p2")
	_expect(str(hud.get("indicator_label").text)=="دور سارة","same-seat name update is part of the authoritative signal")
	intro.queue_free()
	await process_frame
	if failures.is_empty(): print("YAKOLAK_ONLINE_PRESENTATION_OK checks=%d fixed-seat+incremental-arcs+visible-winners" % checks)
	else:
		for failure: String in failures: push_error(failure)
	quit(0 if failures.is_empty() else 1)
