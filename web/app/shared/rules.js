// THREEJS-044: one browser/backend-safe rules implementation.
// `rules/yakolak-rules.json` remains the versioned data contract; the parity
// test must fail if this browser-safe data mirror drifts from that file.

const RULES_DATA = {
  version: 2,
  playerCounts: [2, 3, 4],
  colors: ['marble', 'blue', 'gold', 'green'],
  sizes: ['small', 'medium', 'large'],
  copiesPerSizePerColor: 3,
  totalPieces: 36,
  winsToMatchOptions: [3, 5],
  cellCount: 9,
  lines: [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ],
  gradedOrders: [
    ['small', 'medium', 'large'],
    ['large', 'medium', 'small'],
  ],
};

// Preserve the public mutability/freeze shape of the pre-refactor v5 module:
// RULES is top-level frozen, while exported convenience lists are frozen copies.
export const RULES = Object.freeze(structuredClone(RULES_DATA));
export const COLORS = Object.freeze([...RULES.colors]);
export const SIZES = Object.freeze([...RULES.sizes]);
export const LINES = Object.freeze(RULES.lines.map(line => Object.freeze([...line])));

export function isValidPlayerCount(value) {
  return RULES.playerCounts.includes(Number(value));
}

export function isValidWinsToMatch(value) {
  return RULES.winsToMatchOptions.includes(Number(value));
}

export function emptyBoard() {
  return Object.fromEntries(Array.from({ length: RULES.cellCount }, (_, index) => [String(index), {}]));
}

export function countPieces(board, color, size) {
  return Object.values(board || {}).filter(cell => cell?.[size] === color).length;
}

export function validatePlacement(board, color, move) {
  const cell = Number(move?.cell);
  const size = String(move?.size || '');
  if (!Number.isInteger(cell) || cell < 0 || cell >= RULES.cellCount || !SIZES.includes(size)) return 'invalid_move';
  if (board?.[String(cell)]?.[size]) return 'occupied_slot';
  if (countPieces(board, color, size) >= RULES.copiesPerSizePerColor) return 'no_piece_remaining';
  return null;
}

export function placePiece(board, color, move) {
  const error = validatePlacement(board, color, move);
  if (error) throw new Error(error);
  const cell = Number(move.cell);
  const size = String(move.size);
  const next = structuredClone(board);
  next[String(cell)] ||= {};
  next[String(cell)][size] = color;
  return next;
}

export function winningPatterns(board, color) {
  const patterns = [];
  for (const line of LINES) {
    for (const size of SIZES) {
      if (line.every(cell => board?.[String(cell)]?.[size] === color)) {
        patterns.push({ type: 'same-size-line', line: [...line], slots: line.map(cell => ({ cell, size })) });
      }
    }
    for (const order of RULES.gradedOrders) {
      if (line.every((cell, index) => board?.[String(cell)]?.[order[index]] === color)) {
        patterns.push({ type: 'graded-line', line: [...line], order: [...order], slots: line.map((cell, index) => ({ cell, size: order[index] })) });
      }
    }
  }
  for (let cell = 0; cell < RULES.cellCount; cell += 1) {
    if (SIZES.every(size => board?.[String(cell)]?.[size] === color)) {
      patterns.push({ type: 'complete-cell', cell, slots: SIZES.map(size => ({ cell, size })) });
    }
  }
  return patterns;
}

export function winner(board, color) {
  return winningPatterns(board, color).length > 0;
}

export function hasLegalMove(board, color) {
  for (const size of SIZES) {
    if (countPieces(board, color, size) >= RULES.copiesPerSizePerColor) continue;
    for (let cell = 0; cell < RULES.cellCount; cell += 1) {
      if (!board?.[String(cell)]?.[size]) return true;
    }
  }
  return false;
}

export function uniqueWinningSlots(patterns) {
  const slots = new Map();
  for (const pattern of patterns || []) {
    for (const slot of pattern.slots || []) slots.set(`${slot.cell}:${slot.size}`, { cell: slot.cell, size: slot.size });
  }
  return [...slots.values()];
}
