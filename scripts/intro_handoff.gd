extends "res://scripts/intro.gd"

# Explicit lifecycle contract between the visual intro and gameplay.
# `playing` remains a visual-clock flag and may be false during internal pauses.
# Gameplay receives control only by consuming the one-shot token published from
# the real intro completion path.
signal intro_run_started(generation: int)
signal gameplay_handoff_ready(generation: int)

var intro_run_generation: int = 0
var gameplay_handoff_pending: bool = false
var gameplay_handoff_published_generation: int = -1
var gameplay_handoff_consumed_generation: int = -1
var gameplay_handoff_emit_count: int = 0
var gameplay_handoff_consume_count: int = 0


func _restart_intro() -> void:
	intro_run_generation += 1
	# A replay invalidates any stale, unconsumed token from the previous run.
	gameplay_handoff_pending = false
	super._restart_intro()
	print("YAKOLAK_INTRO_RUN_STARTED generation=%d" % intro_run_generation)
	intro_run_started.emit(intro_run_generation)
	_dispatch_intro_run_started(intro_run_generation)


func _publish_complete() -> void:
	# Both the root wall-clock path and SmoothIntroTimeline reach this method only
	# after snapping the accepted final frame. Publishing here keeps the handoff
	# independent from every temporary value of `playing` used during pre-intro.
	super._publish_complete()
	_publish_gameplay_handoff()


func _publish_gameplay_handoff() -> void:
	if intro_run_generation <= 0:
		return
	if gameplay_handoff_published_generation == intro_run_generation:
		return
	gameplay_handoff_published_generation = intro_run_generation
	gameplay_handoff_pending = true
	gameplay_handoff_emit_count += 1
	print("YAKOLAK_INTRO_HANDOFF_READY generation=%d emits=%d" % [intro_run_generation, gameplay_handoff_emit_count])
	# Publish observability before dispatch. Signal delivery/direct dispatch are
	# synchronous, so a successful consumer leaves `consumed` as the final state.
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakIntroHandoffEvent='ready';" +
			"document.body.dataset.yakolakIntroHandoffGeneration='" + str(intro_run_generation) + "';",
			true
		)
	gameplay_handoff_ready.emit(intro_run_generation)
	_dispatch_gameplay_handoff(intro_run_generation)


func _dispatch_intro_run_started(generation: int) -> void:
	# Signals remain the decoupled lifecycle API. The direct scene dispatch is a
	# deterministic delivery path for exported Web builds, where the consumer may
	# have script processing disabled after setup. Both paths hit the same token.
	var gameplay: Node = get_node_or_null("PostIntroGameplay")
	if gameplay == null:
		_publish_dispatch_probe("yakolakIntroRunDispatch", "missing-node")
		return
	if not gameplay.has_method("accept_intro_run_started"):
		_publish_dispatch_probe("yakolakIntroRunDispatch", "missing-method")
		return
	_publish_dispatch_probe("yakolakIntroRunDispatch", "calling")
	gameplay.call("accept_intro_run_started", generation)
	_publish_dispatch_probe("yakolakIntroRunDispatch", "called")


func _dispatch_gameplay_handoff(generation: int) -> void:
	var gameplay: Node = get_node_or_null("PostIntroGameplay")
	if gameplay == null:
		_publish_dispatch_probe("yakolakIntroHandoffDispatch", "missing-node")
		return
	if not gameplay.has_method("accept_intro_handoff"):
		_publish_dispatch_probe("yakolakIntroHandoffDispatch", "missing-method")
		return
	_publish_dispatch_probe("yakolakIntroHandoffDispatch", "calling")
	gameplay.call("accept_intro_handoff", generation)
	_publish_dispatch_probe("yakolakIntroHandoffDispatch", "called")


func _publish_dispatch_probe(key: String, value: String) -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval("document.body.dataset.%s='%s';" % [key, value], true)


func consume_gameplay_handoff(expected_generation: int = -1) -> bool:
	if not gameplay_handoff_pending:
		return false
	if expected_generation >= 0 and expected_generation != intro_run_generation:
		return false
	if gameplay_handoff_published_generation != intro_run_generation:
		gameplay_handoff_pending = false
		return false
	gameplay_handoff_pending = false
	gameplay_handoff_consumed_generation = gameplay_handoff_published_generation
	gameplay_handoff_consume_count += 1
	print("YAKOLAK_INTRO_HANDOFF_CONSUMED generation=%d consumes=%d" % [gameplay_handoff_consumed_generation, gameplay_handoff_consume_count])
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakIntroHandoffEvent='consumed';" +
			"document.body.dataset.yakolakIntroHandoffConsumedGeneration='" + str(gameplay_handoff_consumed_generation) + "';",
			true
		)
	return true
