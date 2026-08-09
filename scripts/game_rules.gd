extends RefCounted

# Canonical local rules adapter. The rule data itself lives in one shared JSON
# contract consumed by both Godot and the authoritative online engine.
const CONTRACT_PATH: String = "res://rules/yakolak-rules.json"
const DEFAULT_WINS_TO_MATCH: int = 3
static var _contract_cache: Dictionary = {}


static func contract() -> Dictionary:
	if not _contract_cache.is_empty():
		return _contract_cache
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(CONTRACT_PATH))
	if parsed is Dictionary:
		_contract_cache = (parsed as Dictionary).duplicate(true)
	return _contract_cache


static func contract_version() -> int:
	return int(contract().get("version", 0))


static func sizes() -> Array:
	return (contract().get("sizes", []) as Array).duplicate()


static func cell_count() -> int:
	return int(contract().get("cellCount", 9))


static func copies_per_size() -> int:
	return int(contract().get("copiesPerSizePerColor", 3))


static func is_valid_wins_to_match(value: int) -> bool:
	# JSON numeric values are parsed as floats by Godot. Compare by normalized
	# integer value so the shared [3, 5] contract is identical to Node's view.
	for option: Variant in contract().get("winsToMatchOptions", []) as Array:
		if int(option) == value:
			return true
	return false


static func normalize_wins_to_match(value: int) -> int:
	return value if is_valid_wins_to_match(value) else DEFAULT_WINS_TO_MATCH


static func has_legal_cell_for_size(occupied_slots: Dictionary, size_name: String) -> bool:
	if not sizes().has(size_name):
		return false
	for cell: int in range(cell_count()):
		if not occupied_slots.has(_slot_key(cell, size_name)):
			return true
	return false


static func player_has_legal_move(occupied_slots: Dictionary, piece_records: Array, direction: String) -> bool:
	for value: Variant in piece_records:
		var record: Dictionary = value as Dictionary
		if bool(record.get("played", false)) or str(record.get("dir", "")) != direction:
			continue
		if has_legal_cell_for_size(occupied_slots, str(record.get("type", ""))):
			return true
	return false


static func winning_piece_indices(occupied_slots: Dictionary, piece_records: Array, direction: String) -> Array[int]:
	var winning: Array[int] = []
	var seen: Dictionary = {}
	var rule_data: Dictionary = contract()
	var rule_sizes: Array = rule_data.get("sizes", []) as Array
	var lines: Array = rule_data.get("lines", []) as Array
	var graded_orders: Array = rule_data.get("gradedOrders", []) as Array

	for line_value: Variant in lines:
		var line: Array = line_value as Array
		for size_value: Variant in rule_sizes:
			_append_pattern(_line_piece_indices(occupied_slots, piece_records, line, [size_value, size_value, size_value], direction), winning, seen)
		for order_value: Variant in graded_orders:
			_append_pattern(_line_piece_indices(occupied_slots, piece_records, line, order_value as Array, direction), winning, seen)

	for cell: int in range(cell_count()):
		var stack: Array[int] = []
		for size_value: Variant in rule_sizes:
			var piece_index: int = _piece_at(occupied_slots, cell, str(size_value))
			if piece_index < 0 or _piece_direction(piece_records, piece_index) != direction:
				stack.clear()
				break
			stack.append(piece_index)
		_append_pattern(stack, winning, seen)
	return winning


static func _line_piece_indices(occupied_slots: Dictionary, piece_records: Array, line: Array, pattern_sizes: Array, direction: String) -> Array[int]:
	if line.size() != 3 or pattern_sizes.size() != 3:
		return []
	var found: Array[int] = []
	for offset: int in range(3):
		var piece_index: int = _piece_at(occupied_slots, int(line[offset]), str(pattern_sizes[offset]))
		if piece_index < 0 or _piece_direction(piece_records, piece_index) != direction:
			return []
		found.append(piece_index)
	return found


static func _append_pattern(pattern: Array[int], winning: Array[int], seen: Dictionary) -> void:
	if pattern.size() != 3:
		return
	for piece_index: int in pattern:
		if seen.has(piece_index):
			continue
		seen[piece_index] = true
		winning.append(piece_index)


static func _piece_at(occupied_slots: Dictionary, cell: int, size_name: String) -> int:
	var key: String = _slot_key(cell, size_name)
	return int(occupied_slots[key]) if occupied_slots.has(key) else -1


static func _piece_direction(piece_records: Array, piece_index: int) -> String:
	if piece_index < 0 or piece_index >= piece_records.size():
		return ""
	return str((piece_records[piece_index] as Dictionary).get("dir", ""))


static func _slot_key(cell: int, size_name: String) -> String:
	return "%d:%s" % [cell, size_name]
