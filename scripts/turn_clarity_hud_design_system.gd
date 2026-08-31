extends "res://scripts/turn_clarity_hud.gd"

# TURN-UI-08 design adapter: the only turn surface is the fixed top-center,
# authoritative event-driven capsule defined by turn_clarity_hud.gd.


func _ready() -> void:
	super._ready()
	_publish_design_contract()


func _publish_design_contract() -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"document.body.dataset.yakolakDesignHud='single-authoritative-turn-indicator';" +
			"document.body.dataset.yakolakDesignTurnCue='top-center-responsive-capsule';document.body.dataset.yakolakDesignTurnCueMobile='prominent-css-space';" +
			"document.body.dataset.yakolakDesignTurnCueAnimation='none';" +
			"document.body.dataset.yakolakDesignTurnCueLayout='overlay-no-shift';",
			true
		)
