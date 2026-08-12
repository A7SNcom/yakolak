extends "res://scripts/gameplay_state_inventory.gd"

# The production gameplay layer accepts intro ownership only from the explicit
# lifecycle contract exposed by intro_handoff.gd. Signals are the observer API;
# the root also directly dispatches the same explicit event in exported Web so
# delivery never depends on one mechanism. Polling remains a final loss-recovery
# fallback, but all delivery sources now enter the shared base consumer claim.
# The one-shot generation token is still the single authority that can transfer
# ownership. Readiness itself lives in the shared gameplay base so subclasses
# cannot redefine the contract.

# `intro_generation_seen` is the shared start-event claim across explicit signal,
# direct dispatch, handoff/reconnect recovery, and the base polling fallback. Once
# one path claims a current generation, every duplicate path is a no-op.
var intro_run_started_reset_generation: int = -1
var intro_run_started_reset_count: int = 0
# A replay can arrive before gameplay has finished building its consumer state.
# Keep only the newest generation's reset obligation. This is not ownership: the
# existing handoff token/consumer claim remain the only path that can enable play.
var intro_run_started_pending_reset_generation: int = -1

# The delivery claim itself lives in gameplay.gd so signal, direct, reconnect,
# and frame polling cannot own separate consumption paths. This layer only adds
# Web observability for that shared claim.
var intro_handoff_consumer_probe: String = ""
# Observability is generation-bound independently from ownership. The probe may
# advance for a fresh replay, but a consumed generation is terminal and stale or
# duplicate intro-start delivery can never replace its successful final state.
var intro_handoff_consumer_probe_generation: int = -1
var intro_handoff_consumer_probe_terminal_generation: int = -1

# A normal online move commit has no user decision, so it must never borrow the
# full-screen waiting card. Keep the exact move intent guarded locally while the
# authoritative transport owns commit/retry/dedupe. A tiny hint appears only if
# acknowledgement is genuinely slow and never receives pointer input.
const ONLINE_MOVE_PENDING_HINT_DELAY_MS: int = 650
var online_move_commit_pending: bool = false
var online_move_pending_started_msec: int = 0
var online_move_pending_hint_visible: bool = false
var online_move_pending_hint_suppressed: bool = false


func _ready() -> void:
	super._ready()
	if intro == null:
		_publish_consumer_probe("ready-no-intro")
		return
	var ready_generation: int = int(intro.get("intro_run_generation"))
	var started_handler := Callable(self, "_on_explicit_intro_run_started")
	if intro.has_signal("intro_run_started") and not intro.is_connected("intro_run_started", started_handler):
		intro.connect("intro_run_started", started_handler)
	var handoff_handler := Callable(self, "_on_explicit_gameplay_handoff_ready")
	if intro.has_signal("gameplay_handoff_ready") and not intro.is_connected("gameplay_handoff_ready", handoff_handler):
		intro.connect("gameplay_handoff_ready", handoff_handler)
	_publish_consumer_probe("connected", ready_generation)
	# Scene ordering can make an already-published lifecycle token exist before a
	# consumer reconnect. Reconnect is only another delivery source into the same
	# handoff path, which now recovers any missing start claim/reset first; it never
	# adopts intro_generation_seen directly or bypasses the ownership token.
	_accept_gameplay_handoff_delivery(ready_generation, "ready-reconnect")


func _process(delta: float) -> void:
	super._process(delta)
	_sync_online_move_pending_affordance()


func _begin_move(cell: int) -> void:
	if not online_active:
		super._begin_move(cell)
		return
	# Only the action that could duplicate the unresolved authoritative intent is
	# locked. The rest of gameplay/UI input stays live and the transport keeps its
	# existing immutable mutationId/version safety as a second line of defence.
	if online_move_commit_pending:
		_trace_online_move_pending("duplicate-commit-blocked")
		return
	if selected_index < 0 or online == null:
		super._begin_move(cell)
		return
	online_move_commit_pending = true
	online_move_pending_started_msec = Time.get_ticks_msec()
	online_move_pending_hint_suppressed = false
	_hide_online_move_pending_hint("new-intent")
	_trace_online_move_pending("armed")
	super._begin_move(cell)
	# gameplay_session intentionally locks gameplay_ready for generic waits. This
	# pending move is narrower: restore input and let this override reject only a
	# second commit until an authoritative room resolution arrives.
	if online_move_commit_pending and match_initialized and not round_complete and _current_mode() == "local":
		gameplay_ready = true
	# Parent state inventory still records `submitting-move` for diagnostics. Hide
	# its full-rect STOP control in the same synchronous stack before a frame can
	# render or intercept input.
	_sync_waiting_overlay()


func _sync_waiting_overlay() -> void:
	super._sync_waiting_overlay()
	if online_ui_state_id != "submitting-move" or waiting_root == null:
		return
	waiting_root.visible = false
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakOnlineWaiting='hidden';" +
			"document.body.dataset.yakolakMoveBlocker='removed';",
			true
		)


func _sync_online_move_pending_affordance() -> void:
	if not online_move_commit_pending or online_move_pending_hint_visible or online_move_pending_hint_suppressed:
		return
	if Time.get_ticks_msec() - online_move_pending_started_msec < ONLINE_MOVE_PENDING_HINT_DELAY_MS:
		return
	if online == null or bool(online.get("reconnecting")):
		online_move_pending_hint_suppressed = true
		return
	_show_online_move_pending_hint()


func _show_online_move_pending_hint() -> void:
	if online_move_pending_hint_visible or not OS.has_feature("web"):
		return
	online_move_pending_hint_visible = true
	JavaScriptBridge.eval(
		"(()=>{let e=document.getElementById('yakolak-move-pending');if(!e){e=document.createElement('div');e.id='yakolak-move-pending';e.setAttribute('role','status');e.setAttribute('aria-live','polite');e.style.cssText='position:fixed;left:50%;top:max(12px,env(safe-area-inset-top));transform:translateX(-50%);z-index:2147482998;padding:5px 9px;border-radius:999px;background:#151719b8;color:#fff;font:600 12px system-ui;direction:rtl;pointer-events:none;box-shadow:0 2px 10px #0004;white-space:nowrap';document.body.appendChild(e);}e.textContent='تثبيت…';document.body.dataset.yakolakMovePending='subtle';document.body.dataset.yakolakMovePendingSurface='non-blocking';})();",
		true
	)
	_trace_online_move_pending("hint-shown")


func _hide_online_move_pending_hint(reason: String) -> void:
	var had_hint: bool = online_move_pending_hint_visible
	online_move_pending_hint_visible = false
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"(()=>{const e=document.getElementById('yakolak-move-pending');if(e)e.remove();delete document.body.dataset.yakolakMovePending;delete document.body.dataset.yakolakMovePendingSurface;})();",
			true
		)
	if had_hint:
		_trace_online_move_pending("hint-hidden:" + reason)


func _clear_online_move_commit_pending(reason: String) -> void:
	var had_pending: bool = online_move_commit_pending
	online_move_commit_pending = false
	online_move_pending_started_msec = 0
	online_move_pending_hint_suppressed = false
	_hide_online_move_pending_hint(reason)
	if had_pending:
		_trace_online_move_pending("resolved:" + reason)


func _on_online_room_changed(remote: Dictionary, identity: Dictionary) -> void:
	# Any accepted authoritative room emission resolves this UI/input pending
	# intent: commit, explicit rejection snapshot, or turn/status/version change.
	_clear_online_move_commit_pending("room-resolution")
	super._on_online_room_changed(remote, identity)


func _on_online_error(code: String) -> void:
	_clear_online_move_commit_pending("error:" + code)
	super._on_online_error(code)


func _on_connection_state_changed(state: String, detail: String) -> void:
	if state == "reconnecting" and online_move_commit_pending:
		# Timeout/transient reconnect may still retry the exact mutation. Keep the
		# commit guard, but the pending-copy affordance must disappear immediately
		# and must not reappear until an authoritative room resolves the intent.
		online_move_pending_hint_suppressed = true
		_hide_online_move_pending_hint("reconnect:" + detail)
	super._on_connection_state_changed(state, detail)


func _return_to_setup() -> void:
	_clear_online_move_commit_pending("return-to-setup")
	super._return_to_setup()


func _reset_for_intro() -> void:
	_clear_online_move_commit_pending("intro-reset")
	super._reset_for_intro()


func _trace_online_move_pending(event: String) -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval(
		"(()=>{const e=" + JSON.stringify(event) + ",d=document.body.dataset;d.yakolakMovePendingTrace=(d.yakolakMovePendingTrace?d.yakolakMovePendingTrace+'|':'')+e;d.yakolakMoveInputPolicy='commit-only';})();",
		true
	)


func _on_explicit_intro_run_started(generation: int) -> void:
	accept_intro_run_started(generation)


func _on_explicit_gameplay_handoff_ready(generation: int) -> void:
	accept_intro_handoff(generation)


func accept_intro_run_started(generation: int) -> void:
	if intro == null:
		intro = get_parent() as Node3D
	if intro == null:
		_publish_consumer_probe("intro-start-no-root", generation)
		return
	if generation != int(intro.get("intro_run_generation")):
		_publish_consumer_probe("intro-start-stale-generation", generation)
		return
	# Signal delivery, direct Web dispatch, handoff/reconnect recovery, and polling
	# all enter here. The first path claims the generation through
	# `intro_generation_seen`; every duplicate path exits before mutating gameplay
	# or resetting session/restore state.
	if generation == intro_generation_seen:
		_publish_consumer_probe("intro-start-duplicate-generation", generation)
		return
	# A replay owns a new generation even if gameplay initialization is still
	# incomplete. Cancel any held handoff from the old generation immediately;
	# completion of initialization must never wake stale ownership work.
	_cancel_pending_gameplay_handoff_initialization()
	intro_generation_seen = generation
	gameplay_ready = false
	if initialized:
		intro_run_started_pending_reset_generation = -1
		_apply_intro_run_started_reset(generation)
	else:
		# Only the newest pre-init replay keeps a reset obligation. A later replay
		# silently replaces this integer before any reset side effect can occur.
		intro_run_started_pending_reset_generation = generation
	_publish_consumer_probe("intro-started", generation)


func _complete_gameplay_consumer_initialization() -> void:
	# `_initialize_when_ready()` has already built the consumer state when this
	# callback is reached. Apply the newest deferred intro reset synchronously
	# before the base completion can wake an already-claimed handoff generation.
	if initialized:
		return
	_apply_pending_intro_run_started_reset()
	super._complete_gameplay_consumer_initialization()


func _apply_pending_intro_run_started_reset() -> void:
	var generation: int = intro_run_started_pending_reset_generation
	if generation <= 0:
		return
	intro_run_started_pending_reset_generation = -1
	if intro == null:
		return
	if generation != intro_generation_seen:
		return
	if generation != int(intro.get("intro_run_generation")):
		return
	# A same-generation handoff may already have claimed its token delivery while
	# initialization was delayed. `_reset_for_intro()` intentionally cancels held
	# handoffs, so preserve only this already-existing current claim across the
	# reset; the token remains authoritative and is consumed later by the base wake.
	_apply_intro_run_started_reset(generation, true)


func _apply_intro_run_started_reset(generation: int, preserve_claimed_handoff: bool = false) -> void:
	if intro == null:
		return
	if generation <= 0:
		return
	if generation != int(intro.get("intro_run_generation")):
		return
	if generation == intro_run_started_reset_generation:
		return
	var held_handoff_generation: int = intro_handoff_pending_init_generation if preserve_claimed_handoff else -1
	intro_run_started_reset_generation = generation
	intro_run_started_reset_count += 1
	_reset_for_intro()
	# Restoring this value does not claim or consume anything. It only retains the
	# current generation's claim that existed before the reset, and only while the
	# original pending token is still current and authoritative.
	if (
		preserve_claimed_handoff
		and held_handoff_generation == generation
		and intro_handoff_claimed_generation == generation
		and int(intro.get("intro_run_generation")) == generation
		and int(intro.get("gameplay_handoff_published_generation")) == generation
		and bool(intro.get("gameplay_handoff_pending"))
	):
		intro_handoff_pending_init_generation = held_handoff_generation
	print("YAKOLAK_INTRO_RUN_RESET generation=%d resets=%d" % [generation, intro_run_started_reset_count])


func accept_intro_handoff(generation: int) -> void:
	if intro == null:
		intro = get_parent() as Node3D
	_accept_gameplay_handoff_delivery(generation, "explicit")


func _publish_intro_handoff_consumer_probe(value: String, generation: int) -> void:
	# Handoff diagnostics already know which delivery generation caused them.
	# Never infer a different current replay for this path; invalid/unbound values
	# are intentionally ignored rather than contaminating a valid generation probe.
	if generation <= 0:
		return
	_publish_consumer_probe(value, generation)


func _publish_consumer_probe(value: String, generation: int = -1) -> void:
	var observed_generation: int = generation
	if observed_generation <= 0 and intro != null:
		observed_generation = int(intro.get("intro_run_generation"))
	var next_value: String = value
	if observed_generation > 0:
		# A future diagnostic cannot become the live probe before the root reaches
		# that generation. Older diagnostics are rejected by the monotonic check below.
		if intro != null and observed_generation > int(intro.get("intro_run_generation")):
			return
		# A stale start belongs to its delivered generation, not whichever replay is
		# current now. Never let an older/future stale delivery move the live probe.
		if next_value == "intro-start-stale-generation" and intro != null:
			if observed_generation != int(intro.get("intro_run_generation")):
				return
		if intro_handoff_consumer_probe_generation > observed_generation:
			return
		# The root's consumed generation is authoritative even across reconnects.
		# Reassert terminal success rather than allowing a later diagnostic write.
		if intro != null and int(intro.get("gameplay_handoff_consumed_generation")) == observed_generation:
			next_value = "handoff-consumed"
		elif intro_handoff_consumer_probe_terminal_generation == observed_generation:
			return
		# Same-generation duplicate/stale start diagnostics are lower-priority than
		# an already accepted start or any handoff state for that generation.
		var start_diagnostic: bool = (
			next_value == "intro-start-duplicate-generation"
			or next_value == "intro-start-stale-generation"
		)
		var existing_progressed: bool = (
			intro_handoff_consumer_probe == "intro-started"
			or intro_handoff_consumer_probe.begins_with("handoff-")
		)
		if (
			start_diagnostic
			and intro_handoff_consumer_probe_generation == observed_generation
			and existing_progressed
		):
			return
		intro_handoff_consumer_probe_generation = observed_generation
		if next_value == "handoff-consumed":
			intro_handoff_consumer_probe_terminal_generation = observed_generation
	intro_handoff_consumer_probe = next_value
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakIntroHandoffConsumer='%s';document.body.dataset.yakolakIntroHandoffConsumerGeneration='%d';" % [next_value, observed_generation],
			true
		)