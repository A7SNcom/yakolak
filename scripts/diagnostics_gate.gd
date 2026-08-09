extends Node

# Heavy browser diagnostics are valuable for QA, but should not continuously
# consume CPU/network during a normal player session. Enable them explicitly
# with ?yakolakDiagnostics=1 / ?yakolakTelemetry=1, or automatically in browser automation.
const DIAGNOSTIC_SCRIPTS: Array[String] = [
	"res://scripts/telemetry_monitor.gd",
	"res://scripts/telemetry_console_capture.gd",
	"res://scripts/telemetry_watchdog.gd",
]


func _ready() -> void:
	if not OS.has_feature("web"):
		return
	var enabled: bool = bool(JavaScriptBridge.eval(
		"(()=>{const p=new URL(location.href).searchParams;return p.get('yakolakDiagnostics')==='1'||p.get('yakolakTelemetry')==='1'||p.get('yakolakTelemetryTest')==='1'||navigator.webdriver===true;})()",
		true
	))
	if not enabled:
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakTelemetryMode='quiet';document.body.dataset.yakolakDiagnostics='off';",
			true
		)
		return

	for script_path: String in DIAGNOSTIC_SCRIPTS:
		var diagnostic_script := load(script_path) as Script
		if diagnostic_script == null:
			push_warning("YAKOLAK diagnostic script missing: " + script_path)
			continue
		var worker := Node.new()
		worker.set_script(diagnostic_script)
		add_child(worker)
	JavaScriptBridge.eval("document.body.dataset.yakolakDiagnostics='enabled';", true)
