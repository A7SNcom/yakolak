extends "res://scripts/pre_intro_star_to_table.gd"

var automation_fast: bool = false


func _ready() -> void:
	super._ready()
	if OS.has_feature("web"):
		automation_fast = bool(JavaScriptBridge.eval("Boolean(navigator.webdriver || new URLSearchParams(location.search).get('yakolakTestFast') === '1')", true))


func _process(delta: float) -> void:
	if not automation_fast:
		super._process(delta)
		return
	if completed or intro == null:
		return
	if not primed:
		primed = _prime_when_models_exist()
		return
	if not initialized:
		if corrections == null or not bool(corrections.get("validated")):
			return
		if visual_polish == null or not bool(visual_polish.get("initialized")):
			return
		initialized = _prepare_pixel_match()
		return
	if not match_published:
		match_wait_frames += 1
		if match_wait_frames >= 2:
			match_published = _publish_match_geometry()
		return
	if not handoff_started:
		if _dom_handoff_is_matched():
			_start_matched_handoff()
		return
	governed_elapsed_ms += 500.0
	var elapsed: float = governed_elapsed_ms
	if elapsed < TABLE_TOTAL_MS:
		_apply_table_and_camera(elapsed)
		_publish_timeline_phase(elapsed)
		return
	if not box_reveal_started:
		_publish_timeline_phase(TABLE_TOTAL_MS)
		_begin_closed_box_drop()
	var box_elapsed: float = elapsed - TABLE_TOTAL_MS
	_apply_closed_box_drop(minf(box_elapsed, CLOSED_BOX_DROP_MS))
	if box_elapsed >= CLOSED_BOX_DROP_MS:
		_snap_closed_box_landed()
		if published_phase < 6:
			published_phase = 6
			_publish_phase("box-closed-landed")
	if elapsed >= TOTAL_MS:
		_finish_and_start_intro()
