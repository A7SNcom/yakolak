extends SceneTree

const Rules = preload("res://scripts/game_rules.gd")
var failures: Array[String] = []

func _init() -> void:
	_test_same_size_line()
	_test_graded_line()
	_test_complete_cell()
	_test_illegal_duplicate_slot()
	_test_seat_order()
	if failures.is_empty():
		print("YAKOLAK rules smoke tests passed")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)

func _expect(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)

func _inventory_for(color: String) -> Dictionary:
	return Rules.create_inventory([{"color": color, "type": "human", "score": 0}])

func _test_same_size_line() -> void:
	var board := Rules.create_empty_board()
	var inventory := _inventory_for("white")
	Rules.commit_move(board, inventory, "white", "small", 0)
	Rules.commit_move(board, inventory, "white", "small", 1)
	var result := Rules.commit_move(board, inventory, "white", "small", 2)
	_expect(result.accepted, "same-size final move must be accepted")
	_expect(result.victory.won, "same-size row must win")
	_expect(result.victory.type == "same_size_line", "same-size row must report same_size_line")

func _test_graded_line() -> void:
	var board := Rules.create_empty_board()
	var inventory := _inventory_for("blue")
	Rules.commit_move(board, inventory, "blue", "small", 0)
	Rules.commit_move(board, inventory, "blue", "medium", 1)
	var result := Rules.commit_move(board, inventory, "blue", "large", 2)
	_expect(result.victory.won, "graded row must win")
	_expect(result.victory.type == "graded_line", "graded row must report graded_line")

func _test_complete_cell() -> void:
	var board := Rules.create_empty_board()
	var inventory := _inventory_for("green")
	Rules.commit_move(board, inventory, "green", "small", 4)
	Rules.commit_move(board, inventory, "green", "medium", 4)
	var result := Rules.commit_move(board, inventory, "green", "large", 4)
	_expect(result.victory.won, "three sizes in one cell must win")
	_expect(result.victory.type == "complete_cell", "complete cell must report complete_cell")

func _test_illegal_duplicate_slot() -> void:
	var board := Rules.create_empty_board()
	var inventory := _inventory_for("gold")
	var first := Rules.commit_move(board, inventory, "gold", "medium", 6)
	var second := Rules.commit_move(board, inventory, "gold", "medium", 6)
	_expect(first.accepted, "first empty-slot move must be accepted")
	_expect(not second.accepted, "occupied size slot must reject a duplicate move")
	_expect(int(inventory.gold.medium) == 2, "rejected move must not consume inventory")

func _test_seat_order() -> void:
	var ordered := Rules.ordered_colors("gold", 4)
	_expect(ordered == ["gold", "green", "white", "blue"], "preferred color must rotate the fixed seat ring")
