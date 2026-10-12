extends SceneTree

class SetupHost:
	extends Node3D
	var camera: Camera3D
	var playing: bool = false

const Setup = preload("res://scripts/session_setup_flash_entry.gd")
var failures: Array[String] = []
var checks := 0

func _init() -> void:
	call_deferred("_run")

func _run() -> void:
	for dimensions: Vector2i in [Vector2i(320, 568), Vector2i(360, 640), Vector2i(390, 844), Vector2i(768, 1024), Vector2i(1366, 768), Vector2i(844, 390), Vector2i(568, 320), Vector2i(280, 320)]:
		var viewport := SubViewport.new()
		viewport.size = dimensions
		root.add_child(viewport)
		var host := SetupHost.new()
		viewport.add_child(host)
		var setup = Setup.new()
		host.add_child(setup)
		await _frames(3)
		setup.show_after_intro()
		await _check(setup, dimensions, "question")
		_expect(setup.dialog_close_button.text == "رجوع" and setup.dialog_close_button.icon == null, "navigation describes its real action")
		setup.dialog_close_button.pressed.emit()
		await _check(setup, dimensions, "room_entry")
		_expect(not setup.dialog_close_button.visible, "entry has no meaningless close/back control")
		setup._show_join_room()
		await _check(setup, dimensions, "join_room")
		setup.dialog_close_button.pressed.emit()
		_expect(setup.active_screen == "room_entry", "join back returns to entry")
		setup._show_invitation("12")
		await _check(setup, dimensions, "invitation")
		setup._prepare_first_run_question()
		setup._open_first_run_setup(false)
		await _check(setup, dimensions, "count")
		setup._choose_player_count(4)
		await _check(setup, dimensions, "mode")
		setup._begin_custom_setup()
		await _check(setup, dimensions, "custom")
		setup.wizard_step = "rounds"
		setup._show_setup()
		await _check(setup, dimensions, "rounds")
		setup.wizard_step = "color"
		setup._show_setup()
		await _check(setup, dimensions, "color")
		setup._show_online_learning_disclosure()
		await _check(setup, dimensions, "learning-disclosure")
		setup.dialog_close_button.pressed.emit()
		_expect(setup.active_screen == "setup", "disclosure back is functional")
		setup.online_ui_state_id = "request-failed"
		setup._show_online_state_screen()
		await _check(setup, dimensions, "online_state")
		# Change orientation while the same content is alive.
		viewport.size = Vector2i(dimensions.y, dimensions.x)
		setup._layout_card()
		await _check(setup, viewport.size, "resize")
		host.queue_free()
		viewport.queue_free()
		await _frames(2)
	if failures.is_empty():
		print("YAKOLAK_DIALOG_LAYOUT_OK checks=%d viewport_sizes=8 screens=12 navigation=covered" % checks)
		quit(0)
	else:
		for failure: String in failures:
			push_error(failure)
		quit(1)

func _frames(count: int) -> void:
	for i: int in range(count):
		await process_frame

func _check(setup, dimensions: Vector2i, screen: String) -> void:
	await _frames(12)
	checks += 1
	var key := "%s %s" % [str(dimensions), screen]
	var bounds := Rect2(Vector2.ZERO, Vector2(dimensions))
	var rect: Rect2 = setup.card.get_global_rect()
	_expect(bounds.grow(1.0).encloses(rect), key + " card remains inside viewport " + str(rect))
	_expect(setup.body.get_child_count() == 1, key + " exactly one current content tree")
	var scroll_rect: Rect2 = setup.dialog_scroll.get_global_rect()
	if setup.dialog_close_button.visible:
		var back_rect: Rect2 = setup.dialog_close_button.get_global_rect()
		_expect(rect.grow(1.0).encloses(back_rect), key + " navigation inside card")
		_expect(not back_rect.intersects(scroll_rect), key + " navigation cannot cover content")
	var original_width: float = setup.card.size.x
	setup._fit_card_to_content()
	await _frames(3)
	_expect(absf(setup.card.size.x - original_width) < 0.1, key + " width stable after content fitting")
	_check_horizontal_controls(setup.body, scroll_rect, key)
	var bar: VScrollBar = setup.dialog_scroll.get_v_scroll_bar()
	if setup.body.custom_minimum_size.y > scroll_rect.size.y + 1.0:
		_expect(bar.max_value - bar.page > 0.0, key + " long content has a real scroll range")
		setup.dialog_scroll.scroll_vertical = int(bar.max_value)
		await _frames(2)
		var content: Control = setup.body.get_child(0)
		_expect(content.get_global_rect().end.y <= scroll_rect.end.y + 1.0, key + " last actions reachable by scrolling")
		setup.dialog_scroll.scroll_vertical = 0

func _check_horizontal_controls(node: Node, bounds: Rect2, key: String) -> void:
	for child: Node in node.get_children():
		if child is Control and (child as Control).is_visible_in_tree() and (child is Label or child is BaseButton or child is LineEdit):
			var rect: Rect2 = (child as Control).get_global_rect()
			_expect(rect.position.x >= bounds.position.x - 1.0 and rect.end.x <= bounds.end.x + 1.0, key + " text/control fits horizontally: " + str(child.name) + " " + str(rect))
		_check_horizontal_controls(child, bounds, key)

func _expect(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)
