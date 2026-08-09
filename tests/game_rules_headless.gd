extends SceneTree

const RULES = preload("res://scripts/game_rules.gd")
var failures: Array[String] = []

func _init() -> void:
	call_deferred("_run")

func _run() -> void:
	_expect(RULES.contract_version() == 2, "canonical rules contract v2 loads")
	_expect(RULES.sizes() == ["small", "medium", "large"], "three canonical sizes")
	_expect(RULES.copies_per_size() == 3, "three copies per size")
	_expect(RULES.is_valid_wins_to_match(3) and RULES.is_valid_wins_to_match(5), "3/5 are wins-to-match options")
	_expect(not RULES.is_valid_wins_to_match(4), "unsupported wins-to-match is rejected")

	var occupied: Dictionary = {}
	var records: Array = []
	for index: int in range(5):
		records.append({"dir": "right", "played": true, "type": "small"})
	# Last small at cell 2 completes both a same-size row and a full stack.
	occupied["0:small"] = 0
	occupied["1:small"] = 1
	occupied["2:small"] = 2
	occupied["2:medium"] = 3
	occupied["2:large"] = 4
	var winning: Array[int] = RULES.winning_piece_indices(occupied, records, "right")
	_expect(winning.size() == 5, "simultaneous line plus stack returns all five winning pieces")

	_expect(RULES.has_legal_cell_for_size({}, "small"), "empty board has a legal small slot")
	var filled_small: Dictionary = {}
	for cell: int in range(9):
		filled_small["%d:small" % cell] = cell
	_expect(not RULES.has_legal_cell_for_size(filled_small, "small"), "full size layer has no legal slot")
	_finish()

func _expect(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)

func _finish() -> void:
	if failures.is_empty():
		print("YAKOLAK_GAME_RULES_HEADLESS_OK")
		quit(0)
		return
	for failure: String in failures:
		push_error(failure)
	quit(1)
