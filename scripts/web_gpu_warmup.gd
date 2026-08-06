extends Node

# Forces every final material and the expensive closed-shell shadow pass to render
# behind the HTML loader. The visible handoff is released only after frame pacing
# has settled, moving first-use shader/upload stalls out of the actual animation.

const MIN_WARMUP_FRAMES: int = 18
const REQUIRED_STABLE_FRAMES: int = 12
const MAX_WARMUP_FRAMES: int = 240
const STABLE_FRAME_SECONDS: float = 1.0 / 28.0

var intro: Node3D
var preintro: Node
var visual_polish: Node
var warm_nodes: Array[GeometryInstance3D] = []
var completed: bool = false
var released: bool = false
var loader_requested_match: bool = false
var warmup_frames: int = 0
var stable_frames: int = 0
var deferred_render_pending: bool = false


func _ready() -> void:
	process_priority = 175
	intro = get_parent() as Node3D
	preintro = intro.get_node_or_null("StarToTablePreIntro")
	visual_polish = intro.get_node_or_null("StudioVisualPolish")
	set_process(true)


func _process(delta: float) -> void:
	if intro == null or preintro == null or visual_polish == null:
		return

	_gate_loader_handoff()
	if completed:
		_release_when_loader_is_ready()
		return

	if not bool(preintro.get("primed")) or not bool(preintro.get("initialized")) or not bool(visual_polish.get("initialized")):
		return
	if warm_nodes.is_empty() and not _collect_warm_nodes():
		return

	if not deferred_render_pending:
		deferred_render_pending = true
		call_deferred("_force_hidden_render_pass")

	var applied_scale: float = maxf(Engine.time_scale, 0.001)
	var actual_frame_seconds: float = maxf(delta / applied_scale, 0.0001)
	warmup_frames += 1
	if actual_frame_seconds <= STABLE_FRAME_SECONDS:
		stable_frames += 1
	else:
		stable_frames = 0

	var stable_ready: bool = warmup_frames >= MIN_WARMUP_FRAMES and stable_frames >= REQUIRED_STABLE_FRAMES
	if stable_ready or warmup_frames >= MAX_WARMUP_FRAMES:
		completed = true
		call_deferred("_finish_hidden_render_pass")


func _collect_warm_nodes() -> bool:
	warm_nodes.clear()
	for child: Node in intro.get_children():
		if not child is GeometryInstance3D:
			continue
		var geometry := child as GeometryInstance3D
		var node_name: String = String(geometry.name)
		if node_name == "Board" or node_name == "Lid" or node_name.begins_with("Base_") or node_name.begins_with("Stone_"):
			warm_nodes.append(geometry)
	return warm_nodes.size() == 42


func _force_hidden_render_pass() -> void:
	deferred_render_pending = false
	if completed:
		return
	for geometry: GeometryInstance3D in warm_nodes:
		var node_name: String = String(geometry.name)
		geometry.visible = true
		geometry.cast_shadow = (
			GeometryInstance3D.SHADOW_CASTING_SETTING_ON
			if node_name == "Board" or node_name == "Lid" or node_name.begins_with("Base_")
			else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		)


func _finish_hidden_render_pass() -> void:
	for geometry: GeometryInstance3D in warm_nodes:
		geometry.visible = false
		geometry.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	print("YAKOLAK_GPU_WARMUP_COMPLETE frames=%d stable_frames=%d nodes=%d" % [warmup_frames, stable_frames, warm_nodes.size()])
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakWarmup='complete';" +
			"document.body.dataset.yakolakWarmupFrames='" + str(warmup_frames) + "';" +
			"document.body.dataset.yakolakWarmupNodes='" + str(warm_nodes.size()) + "';",
			true
		)


func _gate_loader_handoff() -> void:
	if not OS.has_feature("web") or released:
		return
	var state: Variant = JavaScriptBridge.eval("document.body.dataset.yakolakLoaderHandoff || ''", true)
	if str(state) == "matched":
		loader_requested_match = true
	JavaScriptBridge.eval("document.body.dataset.yakolakLoaderHandoff='warming-gpu';", true)


func _release_when_loader_is_ready() -> void:
	if released:
		return
	if not OS.has_feature("web"):
		released = true
		set_process(false)
		return
	if not loader_requested_match:
		return
	released = true
	JavaScriptBridge.eval("document.body.dataset.yakolakLoaderHandoff='matched';", true)
	print("YAKOLAK_GPU_WARMUP_RELEASE loader=matched")
	set_process(false)
