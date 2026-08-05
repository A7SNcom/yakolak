extends "res://scripts/gameplay_match.gd"

# Web-safe round continuation owned by the match controller itself.
# The browser invokes a retained Godot callback directly and also writes a one-shot
# dataset flag as a fallback, so touch and mouse work reliably across browsers.

var web_round_action_visible: bool = false
var web_round_callback: Variant
var web_last_request_count: int = 0


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

	var request_count_value: Variant = JavaScriptBridge.eval("Number(document.body.dataset.yakolakRoundActionRequests||0)", true)
	var request_count: int = int(request_count_value)
	if request_count > web_last_request_count:
		web_last_request_count = request_count
		print("YAKOLAK_ROUND_ACTION_REQUEST count=%d" % request_count)

	var requested_value: Variant = JavaScriptBridge.eval("String(document.body.dataset.yakolakRoundAction||'')", true)
	var requested: String = str(requested_value)
	if requested == "1" or requested.contains("1"):
		JavaScriptBridge.eval("document.body.dataset.yakolakRoundAction='';", true)
		print("YAKOLAK_ROUND_ACTION_FLAG_ACTIVATED")
		_on_round_action()


func _on_web_round_action(_arguments: Array) -> void:
	print("YAKOLAK_ROUND_ACTION_CALLBACK")
	if round_complete and not action_in_progress:
		_on_round_action()


func _on_round_action() -> void:
	_set_web_round_action_visible(false)
	super._on_round_action()


func _reset_for_intro() -> void:
	_set_web_round_action_visible(false)
	web_last_request_count = 0
	super._reset_for_intro()


func _build_web_round_action() -> void:
	if not OS.has_feature("web"):
		return
	web_round_callback = JavaScriptBridge.create_callback(_on_web_round_action)
	var window: JavaScriptObject = JavaScriptBridge.get_interface("window")
	if window != null:
		window.set("yakolakRoundActionCallback", web_round_callback)
	var script: String = "(function(){document.body.dataset.yakolakRoundAction='';document.body.dataset.yakolakRoundActionRequests='0';document.body.dataset.yakolakRoundActionVisible='false';var request=function(e){if(document.body.dataset.yakolakRoundActionVisible!=='true'){return;}e.preventDefault();e.stopPropagation();var n=Number(document.body.dataset.yakolakRoundActionRequests||0)+1;document.body.dataset.yakolakRoundActionRequests=String(n);document.body.dataset.yakolakRoundAction='1';if(typeof window.yakolakRoundActionCallback==='function'){window.yakolakRoundActionCallback();}};if(!window.__yakolakRoundCapture){window.__yakolakRoundCapture=true;document.addEventListener('pointerdown',request,true);document.addEventListener('touchstart',request,{capture:true,passive:false});document.addEventListener('mousedown',request,true);}var b=document.getElementById('yakolak-round-action');if(!b){b=document.createElement('button');b.id='yakolak-round-action';b.type='button';b.setAttribute('aria-label','بدء الجولة التالية');b.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647;display:none;border:0;padding:0;background:rgba(0,0,0,0.001);cursor:pointer;pointer-events:auto;touch-action:manipulation;-webkit-tap-highlight-color:transparent;';b.addEventListener('pointerdown',request,{passive:false});b.addEventListener('touchstart',request,{passive:false});b.addEventListener('mousedown',request,{passive:false});b.addEventListener('click',request,{passive:false});document.body.appendChild(b);}})();"
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
