extends Node

# Forces every final material and the expensive closed-shell shadow pass to render
# behind the HTML loader. It then hides the warmup geometry and measures the real
# post-warmup frame cadence before releasing the visible handoff.

const HEAVY_RENDER_FRAMES: int = 14
const REQUIRED_POST_HIDE_STABLE_FRAMES: int = 12
const MAX_POST_HIDE_FRAMES: int = 60
const STABLE_FRAME_SECONDS: float = 1.0 / 28.0

var intro: Node3D
var preintro: Node
var visual_polish: Node
var warm_nodes: Array[GeometryInstance3D] = []
var completed: bool = false
var released: bool = false
var loader_requested_match: bool = false
var heavy_render_started: bool = false
var geometry_hidden: bool = false
var heavy_render_frames: int = 0
var post_hide_frames: int = 0
var stable_frames: int = 0


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

	if not heavy_render_started:
		heavy_render_started = true
		_show_warm_nodes()
		return

	if not geometry_hidden:
		heavy_render_frames += 1
		if heavy_render_frames >= HEAVY_RENDER_FRAMES:
			_hide_warm_nodes()
			geometry_hidden = true
		return

	var applied_scale: float = maxf(Engine.time_scale, 0.001)
	var actual_frame_seconds: float = maxf(delta / applied_scale, 0.0001)
	post_hide_frames += 1
	if actual_frame_seconds <= STABLE_FRAME_SECONDS:
		stable_frames += 1
	else:
		stable_frames = 0

	if stable_frames >= REQUIRED_POST_HIDE_STABLE_FRAMES or post_hide_frames >= MAX_POST_HIDE_FRAMES:
		_complete_warmup()


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


func _show_warm_nodes() -> void:
	for geometry: GeometryInstance3D in warm_nodes:
		var node_name: String = String(geometry.name)
		geometry.visible = true
		geometry.cast_shadow = (
			GeometryInstance3D.SHADOW_CASTING_SETTING_ON
			if node_name == "Board" or node_name == "Lid" or node_name.begins_with("Base_")
			else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		)
	print("YAKOLAK_GPU_WARMUP_RENDER_START nodes=%d heavy_frames=%d" % [warm_nodes.size(), HEAVY_RENDER_FRAMES])


func _hide_warm_nodes() -> void:
	for geometry: GeometryInstance3D in warm_nodes:
		geometry.visible = false
		geometry.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	print("YAKOLAK_GPU_WARMUP_RENDER_END heavy_frames=%d" % heavy_render_frames)


func _complete_warmup() -> void:
	completed = true
	print("YAKOLAK_GPU_WARMUP_COMPLETE heavy_frames=%d settle_frames=%d stable_frames=%d nodes=%d" % [heavy_render_frames, post_hide_frames, stable_frames, warm_nodes.size()])
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakWarmup='complete';" +
			"document.body.dataset.yakolakWarmupHeavyFrames='" + str(heavy_render_frames) + "';" +
			"document.body.dataset.yakolakWarmupSettleFrames='" + str(post_hide_frames) + "';" +
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
