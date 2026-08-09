extends Node

# Visibility gate only. Layout, typography and framing are owned by the compact
# split-screen SessionSetup subclass. The guard opens the UI only after the real
# intro is finished, then hands the first rendered frame to the setup motion.

const UI_VERSION := "split-gate-v2-motion"

var intro: Node3D
var preintro: Node
var setup: Node
var root: Control
var last_gate: String = ""


func _ready() -> void:
	process_priority = 1000
	intro = get_parent() as Node3D
	preintro = intro.get_node_or_null("StarToTablePreIntro")
	setup = intro.get_node_or_null("SessionSetup")
	set_process(true)


func _process(_delta: float) -> void:
	if setup == null:
		setup = intro.get_node_or_null("SessionSetup")
		if setup == null:
			return
	root = setup.get("root") as Control
	if root == null:
		return
	var showing: bool = bool(setup.get("showing"))
	if not showing:
		root.visible = false
		_set_gate("hidden")
		return
	if not _real_intro_finished():
		root.visible = false
		_set_gate("waiting-intro")
		return

	var just_opened: bool = last_gate != "open"
	root.visible = true
	if just_opened and setup.has_method("animate_setup_entry"):
		# Run before the frame is drawn so the panel never flashes at full opacity.
		setup.call("animate_setup_entry")
	_set_gate("open")
	if just_opened:
		setup.call_deferred("_apply_split_framing")


func _real_intro_finished() -> bool:
	if intro == null:
		return false
	if preintro != null and not bool(preintro.get("completed")):
		return false
	return not bool(intro.get("playing"))


func _set_gate(state: String) -> void:
	if state == last_gate:
		return
	last_gate = state
	if OS.has_feature("web"):
		var setup_state: String = "visible" if state == "open" else "hidden"
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakSetupGate='" + state + "';" +
			"document.body.dataset.yakolakSetupUi='" + UI_VERSION + "';" +
			"document.body.dataset.yakolakSetup='" + setup_state + "';",
			true
		)
