extends RefCounted

# Copy and examples only. The canonical rules adapter identifies the patterns.
const DATA_PATH := "res://rules/win-presentation.json"
const Rules = preload("res://scripts/game_rules.gd")
static var _stages: Array = []

static func stages() -> Array:
	if _stages.is_empty():
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
		if parsed is Array: _stages = parsed
	return _stages.duplicate(true)

static func winner_text(occupied: Dictionary, records: Array, direction: String, player_name: String) -> String:
	if direction.is_empty(): return ""
	var types: Array[String] = []
	for pattern: Dictionary in Rules.winning_patterns(occupied,records,direction):
		var kind := str(pattern.type)
		if not types.has(kind): types.append(kind)
	var lines: Array[String] = []
	for stage: Dictionary in stages():
		if types.has(str(stage.pattern)): lines.append(str(stage.winner) % player_name)
	return "\n".join(lines)
