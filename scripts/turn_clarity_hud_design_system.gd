extends "res://scripts/turn_clarity_hud.gd"

# The former 2D turn card has been retired. Keep this adapter because the scene
# references it, and publish the design contract for automated visual checks.


func _ready() -> void:
	super._ready()
	_publish_design_contract()


func _publish_design_contract() -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakDesignHud='removed-redundant-panel';" +
			"document.body.dataset.yakolakDesignTurnCue='localized-3d-light';",
			true
		)
