extends "res://scripts/online_session_hardened.gd"

# Web transport efficiency layer.
# Keep the online system dormant during local/offline play and avoid crossing
# the Godot <-> browser bridge every rendered frame while a request is running.
# Network behavior, gameplay, graphics, input and camera logic stay unchanged.
const BRIDGE_EVENT_CHECK_MS: int = 34

var next_bridge_event_check_msec: int = 0


func _process(_delta: float) -> void:
	if not OS.has_feature("web"):
		return

	# Local/offline play should make the online transport essentially dormant.
	if not active and not busy and bootstrap_kind.is_empty():
		return

	var now: int = Time.get_ticks_msec()
	if now >= next_wake_check_msec:
		next_wake_check_msec = now + WAKE_CHECK_MS
		_consume_browser_wake()

	if busy:
		# Async browser responses do not need a JS bridge round-trip at render FPS.
		# ~30 Hz keeps added response latency below one 30-fps frame while sharply
		# reducing bridge churn on CPU-constrained browsers and phones.
		if now >= next_bridge_event_check_msec:
			next_bridge_event_check_msec = now + BRIDGE_EVENT_CHECK_MS
			if _consume_bridge_event():
				return

		if request_started_msec > 0 and now - request_started_msec >= REQUEST_TIMEOUT_MS + 900:
			var timed_out_kind: String = inflight_kind
			var timed_out_payload: Dictionary = inflight_payload.duplicate(true)
			_abort_active_request()
			_clear_inflight()
			_handle_request_failure(timed_out_kind, timed_out_payload, "online_timeout", 0)
		return

	if not bootstrap_kind.is_empty() and not active:
		if now >= next_bootstrap_retry_msec:
			_request_post(bootstrap_kind, bootstrap_payload)
		return

	if not active or room.is_empty():
		return
	if now >= next_poll_msec:
		_poll()
