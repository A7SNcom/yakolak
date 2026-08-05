extends Node

# Dedicated GUI button for round continuation/rematch.
# A real Control receives browser touch and mouse input more reliably than global input hooks.

var gameplay: Node
var layer: CanvasLayer
var action_button: Button


func _ready() -> void:
	gameplay = get_parent().get_node_or_null("LocalMatchGameplay")
	_build_button()
	set_process(true)


func _process(_delta: float) -> void:
	if gameplay == null or action_button == null:
		return
	action_button.visible = bool(gameplay.get("round_complete")) and not bool(gameplay.get("action_in_progress"))


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


func _activate() -> void:
	if gameplay == null:
		return
	if not bool(gameplay.get("round_complete")) or bool(gameplay.get("action_in_progress")):
		return
	action_button.visible = false
	print("YAKOLAK_ROUND_ACTION_BUTTON_ACTIVATED")
	gameplay.call("_on_round_action")
