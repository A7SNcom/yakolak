// THREEJS-044/046/047: one browser/backend-safe rules implementation.
// `rules/yakolak-rules.json` remains the versioned data contract; contract tests
// fail if this browser-safe data mirror or gameplay semantics drift.

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

export const PLACEMENT_REJECTION_CODES = Object.freeze({
  UNKNOWN_SEAT: 'unknown_seat',
  INVALID_CELL: 'invalid_cell',
  INVALID_SIZE: 'invalid_size',
  OCCUPIED_SLOT: 'occupied_slot',
  NO_PIECE_REMAINING: 'no_piece_remaining',
});

function rulesError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function legacyNormalizePlacement(move) {
  return {
    cell: Number(move?.cell),
    size: String(move?.size || ''),
  };
}

function normalizedPlacementRejection(board, color, cell, size) {
  if (board?.[String(cell)]?.[size]) return PLACEMENT_REJECTION_CODES.OCCUPIED_SLOT;
  if (countPieces(board, color, size) >= RULES.copiesPerSizePerColor) {
    return PLACEMENT_REJECTION_CODES.NO_PIECE_REMAINING;
  }
  return null;
}

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

export function remainingInventoryForColor(board, color) {
  const remaining = {};
  for (const size of SIZES) {
    const count = countPieces(board, color, size);
    if (count > RULES.copiesPerSizePerColor) throw rulesError('invalid_piece_count');
    remaining[size] = RULES.copiesPerSizePerColor - count;
  }
  return Object.freeze(remaining);
}

export function deriveRemainingInventory(board, seats) {
  if (!Array.isArray(seats)) throw rulesError('invalid_inventory_state');
  return Object.freeze(Object.fromEntries(seats.map(seat => [
    seat.seatId,
    remainingInventoryForColor(board, seat.color),
  ])));
}

export function deriveRemainingInventoryFromState(state) {
  return deriveRemainingInventory(state?.board, state?.seats);
}

// Canonical placement validation is strict: callers must already carry the
// normalized integer/string intent schema. Device or transport coercion is not
// part of gameplay legality.
export function placementRejectionCode(board, color, move) {
  const cell = move?.cell;
  const size = move?.size;
  if (!Number.isInteger(cell) || cell < 0 || cell >= RULES.cellCount) {
    return PLACEMENT_REJECTION_CODES.INVALID_CELL;
  }
  if (typeof size !== 'string' || !SIZES.includes(size)) {
    return PLACEMENT_REJECTION_CODES.INVALID_SIZE;
  }
  return normalizedPlacementRejection(board, color, cell, size);
}

export function validatePlacementForSeat(state, seatId, move) {
  const seat = Array.isArray(state?.seats)
    ? state.seats.find(candidate => candidate?.seatId === seatId)
    : null;
  if (!seat) return Object.freeze({ ok: false, code: PLACEMENT_REJECTION_CODES.UNKNOWN_SEAT });

  const code = placementRejectionCode(state?.board, seat.color, move);
  if (code) return Object.freeze({ ok: false, code });

  return Object.freeze({
    ok: true,
    code: null,
    placement: Object.freeze({
      seatId,
      color: seat.color,
      cell: move.cell,
      size: move.size,
    }),
  });
}

// Protocol-v5 compatibility wrapper: v5 historically coerces cell/size and groups
// invalid cell/size as `invalid_move`. It still calls the same normalized
// occupancy/piece-availability core, so only the historical input envelope differs.
export function validatePlacement(board, color, move) {
  const { cell, size } = legacyNormalizePlacement(move);
  if (!Number.isInteger(cell) || cell < 0 || cell >= RULES.cellCount || !SIZES.includes(size)) {
    return 'invalid_move';
  }
  return normalizedPlacementRejection(board, color, cell, size);
}

export function placePiece(board, color, move) {
  const error = validatePlacement(board, color, move);
  if (error) throw rulesError(error);
  const { cell, size } = legacyNormalizePlacement(move);
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

export function uniqueWinningSlots(patterns) {
  const slots = new Map();
  for (const pattern of patterns || []) {
    for (const slot of pattern.slots || []) slots.set(`${slot.cell}:${slot.size}`, { cell: slot.cell, size: slot.size });
  }
  return [...slots.values()];
}

// Canonical win evaluation is bound to the placement that was just accepted.
// The reducer passes the normalized committed placement only after placePiece has
// succeeded. This prevents a pre-existing board pattern or rejected click from
// becoming a second scoring trigger.
export function winningOutcomeAfterAcceptedPlacement(board, color, move) {
  const cell = move?.cell;
  const size = move?.size;
  if (
    !Number.isInteger(cell) ||
    cell < 0 ||
    cell >= RULES.cellCount ||
    typeof size !== 'string' ||
    !SIZES.includes(size) ||
    board?.[String(cell)]?.[size] !== color
  ) throw rulesError('win_evaluation_requires_accepted_placement');

  const patterns = winningPatterns(board, color);
  const winningSlots = uniqueWinningSlots(patterns);
  return deepFreeze({
    won: patterns.length > 0,
    patterns,
    winningSlots,
  });
}

// Historical/query helper retained for protocol-v5 compatibility. Canonical move
// reducers use winningOutcomeAfterAcceptedPlacement instead.
export function winner(board, color) {
  return winningPatterns(board, color).length > 0;
}

export function hasLegalMove(board, color) {
  for (const size of SIZES) {
    for (let cell = 0; cell < RULES.cellCount; cell += 1) {
      if (placementRejectionCode(board, color, { cell, size }) === null) return true;
    }
  }
  return false;
}
