export const GAME_COLORS = ['right', 'back', 'left', 'front'];
export const GAME_SIZES = ['s', 'm', 'l'];
export const GAME_PLAYER_COUNTS = [2, 3, 4];
export const GAME_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
];

export function createEmptyBoard() {
  return Object.fromEntries(
    Array.from({ length: 9 }, (_, zone) => [
      String(zone),
      { s: null, m: null, l: null }
    ])
  );
}

export function isGameColor(color) {
  return GAME_COLORS.includes(color);
}

export function isGameSize(size) {
  return GAME_SIZES.includes(size);
}

export function isPlayerCount(value) {
  return GAME_PLAYER_COUNTS.includes(Number(value));
}

export function isGameMove(move) {
  return Boolean(
    move &&
    Number.isInteger(move.zone) &&
    move.zone >= 0 &&
    move.zone < 9 &&
    isGameSize(move.size)
  );
}

export function piecesUsed(board, color, size) {
  if (!board || !isGameColor(color) || !isGameSize(size)) return 0;
  return Object.values(board).filter(slot => slot?.[size] === color).length;
}

export function listLegalMoves(board, color) {
  if (!board || !isGameColor(color)) return [];
  const moves = [];
  for (const size of GAME_SIZES) {
    if (piecesUsed(board, color, size) >= 3) continue;
    for (let zone = 0; zone < 9; zone += 1) {
      if (!board[String(zone)]?.[size]) moves.push({ zone, size, color });
    }
  }
  return moves;
}

export function hasLegalMove(board, color) {
  return listLegalMoves(board, color).length > 0;
}

export function winnerForBoard(board, color) {
  if (!board || !isGameColor(color)) return null;
  for (const line of GAME_LINES) {
    for (const size of GAME_SIZES) {
      if (line.every(zone => board[String(zone)]?.[size] === color)) {
        return {
          color,
          type: 'same-size',
          label: `خط ${size === 's' ? 'صغير' : size === 'm' ? 'وسط' : 'كبير'}`,
          cells: line.map(zone => ({ zone, size }))
        };
      }
    }
    for (const sequence of [['s', 'm', 'l'], ['l', 'm', 's']]) {
      if (sequence.every((size, index) => board[String(line[index])]?.[size] === color)) {
        return {
          color,
          type: 'graded',
          label: 'خط متدرج',
          cells: line.map((zone, index) => ({ zone, size: sequence[index] }))
        };
      }
    }
  }
  for (let zone = 0; zone < 9; zone += 1) {
    if (GAME_SIZES.every(size => board[String(zone)]?.[size] === color)) {
      return {
        color,
        type: 'cell',
        label: 'خانة كاملة',
        cells: GAME_SIZES.map(size => ({ zone, size }))
      };
    }
  }
  return null;
}

export function applyBoardMove(board, color, move) {
  if (!isGameColor(color) || !isGameMove(move)) throw new Error('invalid_move');
  if (piecesUsed(board, color, move.size) >= 3) throw new Error('no_piece_remaining');
  if (board?.[String(move.zone)]?.[move.size]) throw new Error('occupied_slot');
  const next = structuredClone(board);
  next[String(move.zone)][move.size] = color;
  return next;
}

export function nextPlayableTurn(players, currentIndex, board) {
  if (!Array.isArray(players) || players.length === 0) return null;
  for (let offset = 1; offset <= players.length; offset += 1) {
    const index = (Number(currentIndex || 0) + offset) % players.length;
    const color = typeof players[index] === 'string' ? players[index] : players[index]?.color;
    if (hasLegalMove(board, color)) return index;
  }
  return null;
}

export function resolveMove(board, players, turnIndex, move) {
  const current = players?.[Number(turnIndex || 0) % (players?.length || 1)];
  const color = typeof current === 'string' ? current : current?.color;
  if (!isGameColor(color)) throw new Error('invalid_turn');
  const nextBoard = applyBoardMove(board, color, move);
  const winner = winnerForBoard(nextBoard, color);
  const nextTurnIndex = winner ? Number(turnIndex || 0) : nextPlayableTurn(players, turnIndex, nextBoard);
  return {
    board: nextBoard,
    winner,
    draw: !winner && nextTurnIndex == null,
    turnIndex: nextTurnIndex == null ? Number(turnIndex || 0) : nextTurnIndex
  };
}
