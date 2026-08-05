extends "res://scripts/gameplay_match.gd"

# Web-safe round continuation owned by the match controller itself.
# A full-screen transparent browser action layer is enabled only after a round ends.

var web_round_action_visible: bool = false


func _ready() -> void:
	super._ready()
	_build_web_round_action()


func _process(delta: float) -> void:
	super._process(delta)
	if not OS.has_feature("web"):
		return

	var should_show: bool = round_complete and not action_in_progress
	_set_web_round_action_visible(should_show)
	if not should_show:
		return

	var requested: Variant = JavaScriptBridge.eval("document.body.dataset.yakolakRoundAction||''", true)
	if str(requested) == "1":
		JavaScriptBridge.eval("document.body.dataset.yakolakRoundAction='';", true)
		print("YAKOLAK_ROUND_ACTION_ACTIVATED")
		_on_round_action()


func _on_round_action() -> void:
	_set_web_round_action_visible(false)
	super._on_round_action()


func _reset_for_intro() -> void:
	_set_web_round_action_visible(false)
	super._reset_for_intro()


func _build_web_round_action() -> void:
	if not OS.has_feature("web"):
		return
	var script: String = "(function(){document.body.dataset.yakolakRoundAction='';document.body.dataset.yakolakRoundActionVisible='false';var request=function(e){if(document.body.dataset.yakolakRoundActionVisible!=='true'){return;}e.preventDefault();e.stopPropagation();document.body.dataset.yakolakRoundAction='1';};if(!window.__yakolakRoundCapture){window.__yakolakRoundCapture=true;document.addEventListener('pointerdown',request,true);document.addEventListener('touchstart',request,{capture:true,passive:false});document.addEventListener('mousedown',request,true);}var b=document.getElementById('yakolak-round-action');if(!b){b=document.createElement('button');b.id='yakolak-round-action';b.type='button';b.setAttribute('aria-label','بدء الجولة التالية');b.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647;display:none;border:0;padding:0;background:rgba(0,0,0,0.001);cursor:pointer;pointer-events:auto;touch-action:manipulation;-webkit-tap-highlight-color:transparent;';b.addEventListener('pointerdown',request,{passive:false});b.addEventListener('touchstart',request,{passive:false});b.addEventListener('mousedown',request,{passive:false});b.addEventListener('click',request,{passive:false});document.body.appendChild(b);}})();"
	JavaScriptBridge.eval(script, true)
	print("YAKOLAK_ROUND_ACTION_WEB_READY")


func _set_web_round_action_visible(visible: bool) -> void:
	if not OS.has_feature("web") or visible == web_round_action_visible:
		return
	web_round_action_visible = visible
	var display_value: String = "block" if visible else "none"
	var visible_value: String = "true" if visible else "false"
	JavaScriptBridge.eval("var b=document.getElementById('yakolak-round-action');if(b){b.style.display='%s';}document.body.dataset.yakolakRoundActionVisible='%s';if('%s'==='false'){document.body.dataset.yakolakRoundAction='';}" % [display_value, visible_value, visible_value], true)
	print("YAKOLAK_ROUND_ACTION_VISIBLE value=%s" % visible_value)
