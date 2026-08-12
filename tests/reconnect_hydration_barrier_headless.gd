extends SceneTree

const OnlineSession = preload("res://scripts/online_session_reconnect_hydration.gd")

var failures: Array[String] = []


func _init() -> void:
	_test_player4_reconnect_input_barrier()
	_test_commit_before_response_does_not_resubmit()
	_test_stale_cached_version_cannot_rollback()
	if failures.is_empty():
		print("YAKOLAK_RESILIENCE_29_RECONNECT_HYDRATION_OK")
		quit(0)
		return
	for failure: String in failures:
		push_error(failure)
	quit(1)


func _test_player4_reconnect_input_barrier() -> void:
	var session: Node = _session(_room(10, 3, "cached-p4"), "p4")
	session.call("_mark_reconnecting", "test-player4")
	_expect(bool(session.get("reconnect_hydration_pending")), "P4 reconnect must enter hydration barrier")
	_expect(bool(session.get("reconnecting")), "P4 reconnect must expose transport recovery state")

	# Transport recovery must not itself reopen gameplay. A 204/success can clear
	# reconnect UI while the independent authoritative hydration barrier stays shut.
	session.call("_mark_connected")
	_expect(not bool(session.get("reconnecting")), "transport recovery did not clear reconnect UI state")
	_expect(bool(session.get("reconnect_hydration_pending")), "transport recovery incorrectly opened gameplay hydration barrier")

	# This is the concrete regression: before RESILIENCE-29, submit_move inherited
	# the prioritized path and would accept this stale click, preempting the full
	# reconnect poll. While hydrating it must be ignored without starting a request.
	session.call("submit_move", 1, "medium")
	_expect(not bool(session.get("busy")), "P4 reconnect accepted gameplay input before authoritative hydration")
	_expect((session.get("durable_action_queue") as Array).is_empty(), "P4 reconnect queued stale gameplay input")

	var incomplete: Dictionary = _room(11, 2, "missing-seat")
	incomplete["players"] = (incomplete["players"] as Array).slice(0, 3)
	session.call("_accept_room", incomplete)
	_expect(int((session.get("room") as Dictionary).get("version", -1)) == 10, "snapshot without local seat crossed hydration barrier")
	_expect(bool(session.get("reconnect_hydration_pending")), "incomplete P4 snapshot reopened gameplay")

	var authoritative: Dictionary = _room(11, 3, "authoritative-p4")
	session.call("_accept_room", authoritative)
	var applied: Dictionary = session.get("room") as Dictionary
	_expect(int(applied.get("version", -1)) == 11, "P4 authoritative version was not applied")
	_expect(int(applied.get("turnIndex", -1)) == 3, "P4 authoritative turn was not applied")
	_expect(str(((applied.get("board", {}) as Dictionary).get("0", {}) as Dictionary).get("small", "")) == "authoritative-p4", "P4 authoritative board was not applied")
	_expect(not bool(session.get("reconnect_hydration_pending")), "P4 barrier did not open after complete snapshot")
	session.free()


func _test_commit_before_response_does_not_resubmit() -> void:
	var session: Node = _session(_room(20, 3, "before-commit"), "p4")
	session.set("pending_mutation_kind", "move")
	session.set("pending_mutation_payload", {
		"action": "move",
		"code": "42",
		"version": 20,
		"cell": 4,
		"size": "small",
		"mutationId": "resilience29-stable-mutation-id",
	})
	session.set("pending_mutation_attempts", 0)
	session.call("_mark_reconnecting", "commit-response-lost")

	var committed: Dictionary = _room(21, 0, "committed-p4")
	committed["lastMove"] = {"seat": "p4", "cell": 4, "size": "small"}
	committed["moveNumber"] = 8
	session.call("_accept_room", committed)

	_expect(str(session.get("pending_mutation_kind")).is_empty(), "committed move remained pending after newer authoritative version")
	_expect((session.get("pending_mutation_payload") as Dictionary).is_empty(), "committed move payload survived hydration")
	_expect(int(session.get("request_sequence")) == 0, "commit-before-response hydration resubmitted an already committed move")
	_expect(not bool(session.get("busy")), "commit-before-response hydration started a duplicate request")
	_expect(not bool(session.get("reconnect_hydration_pending")), "commit-before-response barrier did not resolve")
	_expect(int((session.get("room") as Dictionary).get("turnIndex", -1)) == 0, "post-commit authoritative turn was not preserved")
	session.free()


func _test_stale_cached_version_cannot_rollback() -> void:
	var session: Node = _session(_room(7, 1, "cached-v7"), "p4")
	session.call("_mark_reconnecting", "stale-cache")

	var stale_event: Dictionary = _room(6, 0, "stale-v6")
	session.call("_accept_room", stale_event)
	var after_stale: Dictionary = session.get("room") as Dictionary
	_expect(int(after_stale.get("version", -1)) == 7, "stale reconnect event rolled room version backward")
	_expect(str(((after_stale.get("board", {}) as Dictionary).get("0", {}) as Dictionary).get("small", "")) == "cached-v7", "stale reconnect event reapplied old board data")
	_expect(bool(session.get("reconnect_hydration_pending")), "stale reconnect event opened gameplay barrier")

	var canonical: Dictionary = _room(9, 3, "canonical-v9")
	session.call("_accept_room", canonical)
	var hydrated: Dictionary = session.get("room") as Dictionary
	_expect(int(hydrated.get("version", -1)) == 9, "newer authoritative room did not replace stale cached version")
	_expect(int(hydrated.get("turnIndex", -1)) == 3, "newer authoritative turn did not replace stale cached turn")
	_expect(str(((hydrated.get("board", {}) as Dictionary).get("0", {}) as Dictionary).get("small", "")) == "canonical-v9", "newer authoritative board did not replace stale cached board")
	_expect(not bool(session.get("reconnect_hydration_pending")), "canonical snapshot did not release stale-cache barrier")
	session.free()


func _session(initial_room: Dictionary, seat: String) -> Node:
	var session: Node = OnlineSession.new()
	session.set("active", true)
	session.set("identity", {"token": "test-token", "seat": seat, "code": "42"})
	session.set("room", initial_room.duplicate(true))
	return session


func _room(version: int, turn_index: int, marker: String) -> Dictionary:
	return {
		"code": "42",
		"version": version,
		"protocol": 5,
		"status": "playing",
		"players": [
			{"seat": "p1", "color": "marble"},
			{"seat": "p2", "color": "blue"},
			{"seat": "p3", "color": "gold"},
			{"seat": "p4", "color": "green"},
		],
		"turnIndex": turn_index,
		"board": {"0": {"small": marker}},
		"round": 1,
		"completedRounds": 0,
		"scores": {"p1": 0, "p2": 0, "p3": 0, "p4": 0},
		"winner": null,
		"draw": false,
		"lastMove": null,
		"moveNumber": 0,
		"matchComplete": false,
		"matchWinner": null,
		"matchWinners": [],
		"rematch": {"p1": false, "p2": false, "p3": false, "p4": false},
	}


func _expect(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)
