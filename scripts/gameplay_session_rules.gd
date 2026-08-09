extends "res://scripts/gameplay_session.gd"

# Active gameplay rules gate. Presentation subclasses inherit from this layer,
# so local play, bots, round flow and online snapshots all normalize against
# the same canonical contract before the visual/session code runs.
const GAME_RULES = preload("res://scripts/game_rules.gd")


func _on_configuration_ready(configuration: Dictionary) -> void:
	var normalized: Dictionary = configuration.duplicate(true)
	var requested: int = int(normalized.get("wins_to_match", normalized.get("rounds", GAME_RULES.DEFAULT_WINS_TO_MATCH)))
	var wins_to_match: int = GAME_RULES.normalize_wins_to_match(requested)
	normalized["wins_to_match"] = wins_to_match
	# Keep the legacy transport/UI key while its meaning is explicitly wins-to-match.
	normalized["rounds"] = wins_to_match
	super._on_configuration_ready(normalized)


func _apply_online_room(remote: Dictionary) -> void:
	var normalized: Dictionary = remote.duplicate(true)
	var requested: int = int(normalized.get("winsToMatch", normalized.get("targetRounds", GAME_RULES.DEFAULT_WINS_TO_MATCH)))
	var wins_to_match: int = GAME_RULES.normalize_wins_to_match(requested)
	normalized["winsToMatch"] = wins_to_match
	normalized["targetRounds"] = wins_to_match
	super._apply_online_room(normalized)
	if str(normalized.get("status", "")) == "finished" and not round_winner.is_empty():
		var winning: Array[int] = _find_winning_pieces(round_winner)
		winning_piece_indices = winning.duplicate()
		if not winning.is_empty():
			_highlight_winning_pieces(winning)


func _player_has_legal_move(direction: String) -> bool:
	return GAME_RULES.player_has_legal_move(occupied_slots, piece_records, direction)


func _has_legal_cell_for_size(size_name: String) -> bool:
	return GAME_RULES.has_legal_cell_for_size(occupied_slots, size_name)


func _find_winning_pieces(direction: String) -> Array[int]:
	# Return the union of every pattern completed by the move. The old engine
	# stopped at the first pattern, which hid simultaneous line+stack wins.
	return GAME_RULES.winning_piece_indices(occupied_slots, piece_records, direction)


func _finish_round(winner: String, winning: Array[int]) -> void:
	total_rounds = GAME_RULES.normalize_wins_to_match(total_rounds)
	super._finish_round(winner, winning)


func _rules_contract_version() -> int:
	return GAME_RULES.contract_version()
