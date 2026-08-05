extends "res://scripts/gameplay_match.gd"

# Web-safe round continuation owned by the match controller itself.
# The browser writes a one-shot flag; this script reads it from the same node
# that owns round_complete and action_in_progress.

var web_round_action_visible: bool = false


func _ready() -> void:
	super._ready()
	_build_web_round_action()


func _process(delta: float) -> void:
	super._process(delta)
	if not OS.has_feature("web") or not round_complete or action_in_progress:
		return
	var requested: Variant = JavaScriptBridge.eval("document.body.dataset.yakolakRoundAction||''", true)
	if str(requested) == "1":
		JavaScriptBridge.eval("document.body.dataset.yakolakRoundAction='';", true)
		print("YAKOLAK_ROUND_ACTION_ACTIVATED")
		_on_round_action()


func _finish_round(winner: String, winning: Array[int]) -> void:
	super._finish_round(winner, winning)
	_set_web_round_action_visible(true)


func _on_round_action() -> void:
	_set_web_round_action_visible(false)
	super._on_round_action()


func _reset_for_intro() -> void:
	_set_web_round_action_visible(false)
	super._reset_for_intro()


func _build_web_round_action() -> void:
	if not OS.has_feature("web"):
		return
	var script: String = "(function(){document.body.dataset.yakolakRoundAction='';document.body.dataset.yakolakRoundActionVisible='false';var request=function(e){var s=document.body.dataset.yakolakMatchState||'';if(s!=='round-complete'&&s!=='match-complete'){return;}e.preventDefault();e.stopPropagation();document.body.dataset.yakolakRoundAction='1';};if(!window.__yakolakRoundCapture){window.__yakolakRoundCapture=true;document.addEventListener('pointerdown',request,true);document.addEventListener('touchstart',request,{capture:true,passive:false});document.addEventListener('mousedown',request,true);}var b=document.getElementById('yakolak-round-action');if(!b){b=document.createElement('button');b.id='yakolak-round-action';b.type='button';b.setAttribute('aria-label','بدء الجولة التالية');b.style.cssText='position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(420px,90vw);height:130px;z-index:2147483647;display:none;border:0;padding:0;background:rgba(0,0,0,0.001);cursor:pointer;pointer-events:auto;touch-action:manipulation;-webkit-tap-highlight-color:transparent;';b.addEventListener('pointerdown',request,{passive:false});b.addEventListener('click',request,{passive:false});document.body.appendChild(b);}})();"
	JavaScriptBridge.eval(script, true)
	print("YAKOLAK_ROUND_ACTION_WEB_READY")


func _set_web_round_action_visible(visible: bool) -> void:
	if not OS.has_feature("web") or visible == web_round_action_visible:
		return
	web_round_action_visible = visible
	var display_value: String = "block" if visible else "none"
	JavaScriptBridge.eval("var b=document.getElementById('yakolak-round-action');if(b){b.style.display='%s';}document.body.dataset.yakolakRoundActionVisible='%s';if(!%s){document.body.dataset.yakolakRoundAction='';}" % [display_value, "true" if visible else "false", "true" if visible else "false"], true)
	print("YAKOLAK_ROUND_ACTION_VISIBLE value=%s" % str(visible))
