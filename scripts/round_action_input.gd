extends Node

# Reliable round/rematch activation for mobile Web builds.
# Kept separate from gameplay rules so the approved match controller stays unchanged.

var gameplay: Node


func _ready() -> void:
	process_priority = -100
	gameplay = get_parent().get_node_or_null("LocalMatchGameplay")
	set_process_input(true)


func _input(event: InputEvent) -> void:
	if gameplay == null:
		return
	if not bool(gameplay.get("round_complete")) or bool(gameplay.get("action_in_progress")):
		return

	var activate: bool = false
	if event is InputEventScreenTouch:
		activate = (event as InputEventScreenTouch).pressed
	elif event is InputEventMouseButton:
		var mouse := event as InputEventMouseButton
		activate = mouse.pressed and mouse.button_index == MOUSE_BUTTON_LEFT
	elif event is InputEventKey:
		var key := event as InputEventKey
		activate = key.pressed and not key.echo and (key.keycode == KEY_ENTER or key.keycode == KEY_SPACE)

	if not activate:
		return
	get_viewport().set_input_as_handled()
	gameplay.call("_on_round_action")
