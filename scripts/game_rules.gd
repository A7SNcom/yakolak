class_name YakolakRules
extends RefCounted

const COLORS := ["white", "blue", "gold", "green"]
const SIZES := ["small", "medium", "large"]
const WIN_LINES := [
	[0, 1, 2], [3, 4, 5], [6, 7, 8],
	[0, 3, 6], [1, 4, 7], [2, 5, 8],
	[0, 4, 8], [2, 4, 6]
]

static func create_empty_board() -> Array:
	var board: Array = []
	for _cell in range(9):
		board.append({"small": "", "medium": "", "large": ""})
	return board

static func create_inventory(seats: Array) -> Dictionary:
	var inventory := {}
	for seat in seats:
		inventory[seat.color] = {"small": 3, "medium": 3, "large": 3}
	return inventory

static func legal_cells(board: Array, inventory: Dictionary, color: String, size: String) -> Array:
	var result: Array = []
	if not inventory.has(color) or int(inventory[color].get(size, 0)) <= 0:
		return result
	for cell in range(9):
		if String(board[cell].get(size, "")) == "":
			result.append(cell)
	return result

static func is_legal_move(board: Array, inventory: Dictionary, color: String, size: String, cell: int) -> bool:
	if cell < 0 or cell >= 9:
		return false
	if not SIZES.has(size):
		return false
	if not inventory.has(color):
		return false
	if int(inventory[color].get(size, 0)) <= 0:
		return false
	return String(board[cell].get(size, "")) == ""

static func commit_move(board: Array, inventory: Dictionary, color: String, size: String, cell: int) -> Dictionary:
	if not is_legal_move(board, inventory, color, size, cell):
		return {"accepted": false, "reason": "illegal_move"}
	board[cell][size] = color
	inventory[color][size] = int(inventory[color][size]) - 1
	var victory := check_victory(board, color, cell, size)
	return {
		"accepted": true,
		"cell": cell,
		"size": size,
		"color": color,
		"victory": victory
	}

static func check_victory(board: Array, color: String, last_cell: int, last_size: String) -> Dictionary:
	# 1) Complete cell: all three sizes of one color in one cell.
	if String(board[last_cell]["small"]) == color \
	and String(board[last_cell]["medium"]) == color \
	and String(board[last_cell]["large"]) == color:
		return {
			"won": true,
			"type": "complete_cell",
			"pieces": [
				{"cell": last_cell, "size": "small"},
				{"cell": last_cell, "size": "medium"},
				{"cell": last_cell, "size": "large"}
			]
		}

	for line in WIN_LINES:
		if not line.has(last_cell):
			continue

		# 2) Same-size line.
		var same_size := true
		for cell in line:
			if String(board[cell][last_size]) != color:
				same_size = false
				break
		if same_size:
			var same_pieces: Array = []
			for cell in line:
				same_pieces.append({"cell": cell, "size": last_size})
			return {"won": true, "type": "same_size_line", "pieces": same_pieces}

		# 3) Graded line, small-medium-large or the reverse.
		for sequence in [["small", "medium", "large"], ["large", "medium", "small"]]:
			var graded := true
			for index in range(3):
				if String(board[line[index]][sequence[index]]) != color:
					graded = false
					break
			if graded:
				return {
					"won": true,
					"type": "graded_line",
					"pieces": [
						{"cell": line[0], "size": sequence[0]},
						{"cell": line[1], "size": sequence[1]},
						{"cell": line[2], "size": sequence[2]}
					]
				}

	return {"won": false, "type": "", "pieces": []}

static func all_moves(board: Array, inventory: Dictionary, color: String) -> Array:
	var moves: Array = []
	for size in SIZES:
		for cell in legal_cells(board, inventory, color, size):
			moves.append({"size": size, "cell": cell})
	return moves

static func has_legal_move(board: Array, inventory: Dictionary, color: String) -> bool:
	return not all_moves(board, inventory, color).is_empty()

static func choose_bot_move(board: Array, inventory: Dictionary, color: String, rng: RandomNumberGenerator) -> Dictionary:
	var moves := all_moves(board, inventory, color)
	if moves.is_empty():
		return {}

	# Win immediately whenever possible.
	for move in moves:
		var board_copy: Array = board.duplicate(true)
		var inventory_copy: Dictionary = inventory.duplicate(true)
		var result := commit_move(board_copy, inventory_copy, color, move.size, move.cell)
		if bool(result.victory.won):
			return move

	# Prefer center, then corners, then remaining cells. Larger pieces get a small early bias.
	var best_score := -9999.0
	var best_moves: Array = []
	for move in moves:
		var score := 0.0
		if int(move.cell) == 4:
			score += 5.0
		elif [0, 2, 6, 8].has(int(move.cell)):
			score += 2.5
		if String(move.size) == "large":
			score += 0.35
		elif String(move.size) == "medium":
			score += 0.2
		score += rng.randf_range(0.0, 1.0)
		if score > best_score + 0.001:
			best_score = score
			best_moves = [move]
		elif absf(score - best_score) <= 0.001:
			best_moves.append(move)
	return best_moves[rng.randi_range(0, best_moves.size() - 1)]

static func next_seat_with_move(current_index: int, seats: Array, board: Array, inventory: Dictionary) -> int:
	for offset in range(1, seats.size() + 1):
		var candidate := (current_index + offset) % seats.size()
		if has_legal_move(board, inventory, String(seats[candidate].color)):
			return candidate
	return -1

static func ordered_colors(preferred: String, player_count: int) -> Array:
	var start := COLORS.find(preferred)
	if start < 0:
		start = 0
	var ordered: Array = []
	for offset in range(player_count):
		ordered.append(COLORS[(start + offset) % COLORS.size()])
	return ordered
