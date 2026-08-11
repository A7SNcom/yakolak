extends SceneTree

const TIMEOUT_MSEC: int = 5000

var failures: Array[String] = []
var intro: Node
var game: Node


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	intro = preload("res://scenes/intro.tscn").instantiate()
	root.add_child(intro)
	game = intro.get_node_or_null("PostIntroGameplay")
	_expect(game != null, "post-intro gameplay exists")
	if game == null:
		await _finish()
		return
	_expect(await _wait_until(Callable(self, "_consumer_ready_for_test")), "gameplay initializes and observes the current intro generation")
	if failures.size() > 0:
		await _finish()
		return

	# Structural ownership guard: handoff/reconnect is allowed to recover a lost
	# start delivery, but generation adoption must happen through the same public
	# start claim before the handoff consumer claim or token can be touched.
	var base_source: String = FileAccess.get_file_as_string("res://scripts/gameplay.gd")
	var delivery_start: int = base_source.find("func _accept_gameplay_handoff_delivery(generation: int, source: String = \"unknown\") -> void:")
	var delivery_end: int = base_source.find("\n\nfunc _consume_claimed_gameplay_handoff", delivery_start)
	var delivery_block: String = ""
	if delivery_start >= 0 and delivery_end > delivery_start:
		delivery_block = base_source.substr(delivery_start, delivery_end - delivery_start)
	var start_claim_position: int = delivery_block.find("call(\"accept_intro_run_started\", generation)")
	var handoff_claim_position: int = delivery_block.find("intro_handoff_claimed_generation = generation")
	_expect(start_claim_position >= 0, "handoff delivery enters the canonical intro-start claim")
	_expect(handoff_claim_position > start_claim_position, "intro-start claim precedes the handoff consumer claim")
	_expect(not delivery_block.contains("\n\tintro_generation_seen = generation"), "handoff delivery cannot directly adopt intro_generation_seen")

	var explicit_source: String = FileAccess.get_file_as_string("res://scripts/gameplay_explicit_handoff.gd")
	var ready_start: int = explicit_source.find("func _ready() -> void:")
	var ready_end: int = explicit_source.find("\n\nfunc _on_explicit_intro_run_started", ready_start)
	var ready_block: String = ""
	if ready_start >= 0 and ready_end > ready_start:
		ready_block = explicit_source.substr(ready_start, ready_end - ready_start)
	_expect(not ready_block.contains("intro_generation_seen = int(intro.get(\"intro_run_generation\"))"), "ready reconnect cannot adopt the generation directly")
	_expect(ready_block.contains("_accept_gameplay_handoff_delivery(ready_generation, \"ready-reconnect\")"), "ready reconnect redelivers through the shared handoff path")

	intro.set_process(false)
	game.set_process(false)
	var started_handler := Callable(game, "_on_explicit_intro_run_started")
	if intro.has_signal("intro_run_started") and intro.is_connected("intro_run_started", started_handler):
		intro.disconnect("intro_run_started", started_handler)
	var handoff_handler := Callable(game, "_on_explicit_gameplay_handoff_ready")
	if intro.has_signal("gameplay_handoff_ready") and intro.is_connected("gameplay_handoff_ready", handoff_handler):
		intro.disconnect("gameplay_handoff_ready", handoff_handler)

	# Lose both start delivery mechanisms and publish a real current-generation
	# handoff token. The handoff itself is the first surviving consumer delivery.
	# It must recover start/reset synchronously before claiming/consuming/enabling.
	var previous_generation: int = int(game.get("intro_generation_seen"))
	var handoff_generation: int = previous_generation + 1
	var resets_before_handoff: int = int(game.get("intro_run_started_reset_count"))
	var claims_before_handoff: int = int(game.get("intro_handoff_claim_count"))
	var consumes_before_handoff: int = int(intro.get("gameplay_handoff_consume_count"))
	var applications_before_handoff: int = int(game.get("intro_handoff_apply_count"))
	var start_polls_before_handoff: int = int(game.get("intro_run_started_poll_attempt_count"))
	game.set("move_count", 8)
	game.set("waiting_for_setup", true)
	intro.set("intro_run_generation", handoff_generation)
	_publish_pending_without_delivery(handoff_generation)
	_expect(int(game.get("intro_generation_seen")) == previous_generation, "missing start remains visible before handoff recovery")
	game.call("accept_intro_handoff", handoff_generation)
	_expect(int(game.get("intro_generation_seen")) == handoff_generation, "handoff recovery adopts generation through start claim")
	_expect(int(game.get("intro_run_started_reset_count")) == resets_before_handoff + 1, "handoff recovery performs exactly one missing start reset")
	_expect(int(game.get("intro_run_started_reset_generation")) == handoff_generation, "handoff recovery reset belongs to current generation")
	_expect(int(game.get("move_count")) == 0, "handoff recovery reset runs before gameplay ownership")
	_expect(not bool(game.get("waiting_for_setup")), "handoff recovery clears restored setup ownership")
	_expect(int(game.get("intro_handoff_claim_count")) == claims_before_handoff + 1, "handoff consumer claim occurs once after start recovery")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == consumes_before_handoff + 1, "handoff token is consumed once after reset")
	_expect(int(intro.get("gameplay_handoff_consumed_generation")) == handoff_generation, "consumed token belongs to recovered generation")
	_expect(int(game.get("intro_handoff_apply_count")) == applications_before_handoff + 1, "gameplay enables once after recovered reset")
	_expect(bool(game.get("gameplay_ready")), "gameplay is ready after the one recovered handoff")
	_expect(int(game.get("intro_run_started_poll_attempt_count")) == start_polls_before_handoff, "handoff recovery does not wait for or create start polling")

	game.call("accept_intro_handoff", handoff_generation)
	_expect(int(game.get("intro_run_started_reset_count")) == resets_before_handoff + 1, "duplicate handoff cannot repeat recovered reset")
	_expect(int(game.get("intro_handoff_claim_count")) == claims_before_handoff + 1, "duplicate handoff cannot repeat consumer claim")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == consumes_before_handoff + 1, "duplicate handoff cannot reconsume token")
	_expect(int(game.get("intro_handoff_apply_count")) == applications_before_handoff + 1, "duplicate handoff cannot re-enable gameplay")

	# Delayed initialization plus reconnect: adoption still enters the start claim,
	# but reset is held rather than skipped. Initialization completion must settle
	# that reset first, preserve the already-existing same-generation handoff claim,
	# then let the unchanged base wake consume and enable exactly once.
	var reconnect_generation: int = handoff_generation + 1
	var reconnect_resets_before: int = int(game.get("intro_run_started_reset_count"))
	var reconnect_claims_before: int = int(game.get("intro_handoff_claim_count"))
	var reconnect_consumes_before: int = int(intro.get("gameplay_handoff_consume_count"))
	var reconnect_applications_before: int = int(game.get("intro_handoff_apply_count"))
	var reconnect_wakes_before: int = int(game.get("intro_handoff_init_wake_count"))
	game.set("initialized", false)
	game.set("move_count", 13)
	game.set("waiting_for_setup", true)
	intro.set("intro_run_generation", reconnect_generation)
	_publish_pending_without_delivery(reconnect_generation)
	game.call("_accept_gameplay_handoff_delivery", reconnect_generation, "ready-reconnect")
	_expect(int(game.get("intro_generation_seen")) == reconnect_generation, "reconnect recovers the missing start claim")
	_expect(int(game.get("intro_run_started_pending_reset_generation")) == reconnect_generation, "reconnect preserves one delayed reset obligation")
	_expect(int(game.get("intro_run_started_reset_count")) == reconnect_resets_before, "reconnect cannot skip ahead and reset before initialization")
	_expect(int(game.get("intro_handoff_claim_count")) == reconnect_claims_before + 1, "reconnect establishes one handoff consumer claim")
	_expect(int(game.get("intro_handoff_pending_init_generation")) == reconnect_generation, "reconnect holds the claimed handoff for initialization")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == reconnect_consumes_before, "reconnect cannot consume token before delayed reset")
	_expect(int(game.get("intro_handoff_apply_count")) == reconnect_applications_before, "reconnect cannot enable before delayed reset")
	_expect(int(game.get("move_count")) == 13, "delayed reset side effects have not run early")

	game.call("_complete_gameplay_consumer_initialization")
	_expect(bool(game.get("initialized")), "delayed consumer initialization completes")
	_expect(int(game.get("intro_run_started_pending_reset_generation")) == -1, "completion settles reconnect reset obligation")
	_expect(int(game.get("intro_run_started_reset_count")) == reconnect_resets_before + 1, "completion applies reconnect reset exactly once")
	_expect(int(game.get("intro_run_started_reset_generation")) == reconnect_generation, "completion reset belongs to reconnect generation")
	_expect(int(game.get("move_count")) == 0, "completion applies reset before consuming reconnect token")
	_expect(not bool(game.get("waiting_for_setup")), "completion clears restored setup state before ownership")
	_expect(int(game.get("intro_handoff_init_wake_count")) == reconnect_wakes_before + 1, "completion wakes reconnect claim once")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == reconnect_consumes_before + 1, "completion consumes reconnect token once after reset")
	_expect(int(intro.get("gameplay_handoff_consumed_generation")) == reconnect_generation, "reconnect token consumption stays generation-bound")
	_expect(int(game.get("intro_handoff_apply_count")) == reconnect_applications_before + 1, "completion enables reconnect generation once")

	# The immediately following replay must own a fresh reset; no previous start or
	# handoff claim may suppress it. Keep signal/direct/polling absent so the next
	# handoff again proves start recovery is generation-scoped rather than global.
	var replay_generation: int = reconnect_generation + 1
	var replay_resets_before: int = int(game.get("intro_run_started_reset_count"))
	var replay_claims_before: int = int(game.get("intro_handoff_claim_count"))
	var replay_consumes_before: int = int(intro.get("gameplay_handoff_consume_count"))
	var replay_applications_before: int = int(game.get("intro_handoff_apply_count"))
	game.set("move_count", 5)
	game.set("waiting_for_setup", true)
	intro.set("intro_run_generation", replay_generation)
	_publish_pending_without_delivery(replay_generation)
	game.call("accept_intro_handoff", replay_generation)
	_expect(int(game.get("intro_generation_seen")) == replay_generation, "next replay gets a new start claim")
	_expect(int(game.get("intro_run_started_reset_count")) == replay_resets_before + 1, "next replay gets exactly one new reset")
	_expect(int(game.get("intro_run_started_reset_generation")) == replay_generation, "next replay reset belongs to new generation")
	_expect(int(game.get("intro_handoff_claim_count")) == replay_claims_before + 1, "next replay gets one new handoff claim")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == replay_consumes_before + 1, "next replay consumes one new token")
	_expect(int(game.get("intro_handoff_apply_count")) == replay_applications_before + 1, "next replay enables once")
	_expect(int(game.get("move_count")) == 0, "next replay reset precedes gameplay ownership")
	game.call("accept_intro_handoff", replay_generation)
	_expect(int(game.get("intro_run_started_reset_count")) == replay_resets_before + 1, "next replay reset remains one-shot after duplicate delivery")
	_expect(int(intro.get("gameplay_handoff_consume_count")) == replay_consumes_before + 1, "next replay token remains one-shot after duplicate delivery")

	await _finish()


func _publish_pending_without_delivery(generation: int) -> void:
	intro.set("gameplay_handoff_published_generation", generation)
	intro.set("gameplay_handoff_pending", true)
	intro.set("gameplay_handoff_emit_count", int(intro.get("gameplay_handoff_emit_count")) + 1)


func _consumer_ready_for_test() -> bool:
	if game == null or intro == null:
		return false
	var generation: int = int(intro.get("intro_run_generation"))
	return bool(game.get("initialized")) and generation > 0 and int(game.get("intro_generation_seen")) == generation


func _wait_until(predicate: Callable) -> bool:
	var deadline: int = Time.get_ticks_msec() + TIMEOUT_MSEC
	while Time.get_ticks_msec() < deadline:
		if bool(predicate.call()):
			return true
		await process_frame
	return false


func _expect(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)


func _finish() -> void:
	Engine.time_scale = 1.0
	if intro != null and is_instance_valid(intro):
		intro.queue_free()
		await process_frame
		await process_frame
		await process_frame
	if failures.is_empty():
		print("YAKOLAK_INTRO_HANDOFF_START_ADOPTION_OK handoff=recover-start reconnect=deferred-reset reset_before_consume=1 replay=fresh-reset")
		quit(0)
		return
	for failure: String in failures:
		push_error(failure)
	quit(1)
