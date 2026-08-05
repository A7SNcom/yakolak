extends Node

# Dedicated round continuation/rematch action.
# Native Godot Control remains as fallback. Web builds use a transparent DOM button
# that writes a one-shot flag read by Godot, avoiding browser callback inconsistencies.

var gameplay: Node
var layer: CanvasLayer
var action_button: Button
var web_visible: bool = false


func _ready() -> void:
	process_priority = 100
	gameplay = get_parent().get_node_or_null("LocalMatchGameplay")
	_build_button()
	_build_web_button()
	set_process(true)


func _process(_delta: float) -> void:
	if gameplay == null or action_button == null:
		return
	var should_show: bool = bool(gameplay.get("round_complete")) and not bool(gameplay.get("action_in_progress"))
	action_button.visible = should_show
	if not OS.has_feature("web"):
		return
	if should_show != web_visible:
		web_visible = should_show
		var display_value: String = "block" if should_show else "none"
		JavaScriptBridge.eval("var b=document.getElementById('yakolak-round-action');if(b){b.style.display='%s';}document.body.dataset.yakolakRoundActionVisible='%s';" % [display_value, "true" if should_show else "false"], true)
		if should_show:
			print("YAKOLAK_ROUND_ACTION_VISIBLE")
	if should_show:
		var requested: Variant = JavaScriptBridge.eval("document.body.dataset.yakolakRoundAction||''", true)
		if str(requested) == "1":
			JavaScriptBridge.eval("document.body.dataset.yakolakRoundAction='';", true)
			_activate()


func _build_button() -> void:
	layer = CanvasLayer.new()
	layer.layer = 30
	add_child(layer)

	action_button = Button.new()
	action_button.name = "RoundActionButton"
	action_button.set_anchors_preset(Control.PRESET_CENTER)
	action_button.offset_left = -210.0
	action_button.offset_top = -65.0
	action_button.offset_right = 210.0
	action_button.offset_bottom = 65.0
	action_button.text = ""
	action_button.flat = true
	action_button.focus_mode = Control.FOCUS_NONE
	action_button.mouse_filter = Control.MOUSE_FILTER_STOP
	action_button.visible = false
	action_button.button_down.connect(_activate)
	layer.add_child(action_button)


func _build_web_button() -> void:
	if not OS.has_feature("web"):
		return
	var script: String = "(function(){document.body.dataset.yakolakRoundAction='';document.body.dataset.yakolakRoundActionVisible='false';var b=document.getElementById('yakolak-round-action');if(!b){b=document.createElement('button');b.id='yakolak-round-action';b.type='button';b.setAttribute('aria-label','بدء الجولة التالية');b.style.cssText='position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(420px,90vw);height:130px;z-index:2147483647;display:none;border:0;padding:0;background:rgba(0,0,0,0.001);cursor:pointer;pointer-events:auto;touch-action:manipulation;-webkit-tap-highlight-color:transparent;';var request=function(e){e.preventDefault();e.stopPropagation();document.body.dataset.yakolakRoundAction='1';};b.addEventListener('pointerdown',request,{passive:false});b.addEventListener('click',request,{passive:false});document.body.appendChild(b);}})();"
	JavaScriptBridge.eval(script, true)
	print("YAKOLAK_ROUND_ACTION_WEB_READY")


func _activate() -> void:
	if gameplay == null:
		return
	if not bool(gameplay.get("round_complete")) or bool(gameplay.get("action_in_progress")):
		return
	action_button.visible = false
	if OS.has_feature("web"):
		web_visible = false
		JavaScriptBridge.eval("var b=document.getElementById('yakolak-round-action');if(b){b.style.display='none';}document.body.dataset.yakolakRoundAction='';document.body.dataset.yakolakRoundActionVisible='false';", true)
	print("YAKOLAK_ROUND_ACTION_BUTTON_ACTIVATED")
	gameplay.call("_on_round_action")
