import assert from 'node:assert/strict';

import {
  PLACEMENT_REJECTION_CODES,
  deriveRemainingInventoryFromState,
  emptyBoard,
  placementRejectionCode,
  validatePlacement,
  validatePlacementForSeat,
} from '../web/app/shared/rules.js';
import {
  createCanonicalSessionState,
  serializeCanonicalSessionState,
} from '../web/app/session/canonical-session-state.js';

const C = PLACEMENT_REJECTION_CODES;
assert.deepEqual(C, {
  UNKNOWN_SEAT: 'unknown_seat',
  INVALID_CELL: 'invalid_cell',
  INVALID_SIZE: 'invalid_size',
  OCCUPIED_SLOT: 'occupied_slot',
  NO_PIECE_REMAINING: 'no_piece_remaining',
});
assert(Object.isFrozen(C));

const seats = [
  { seatId: 'seat-human', type: 'human', color: 'marble', ready: true },
  { seatId: 'seat-bot', type: 'computer', color: 'blue', ready: true },
];
const state = createCanonicalSessionState({
  targetPlayers: 2,
  winsToMatch: 3,
  seats,
  activeSeatId: 'seat-human',
  lifecycle: { phase: 'turn-loop' },
});

const accepted = {
  ok: true,
  code: null,
  placement: { seatId: 'seat-human', color: 'marble', cell: 4, size: 'medium' },
};

// Human input, bot choice, local authority and future backend authority all call
// the same source-independent validator; presentation/origin cannot alter legality.
for (const caller of ['human', 'bot', 'local-authority', 'backend-authority']) {
  assert.deepEqual(
    validatePlacementForSeat(state, 'seat-human', { cell: 4, size: 'medium' }),
    accepted,
    `${caller} must receive identical placement legality`,
  );
}
assert(Object.isFrozen(validatePlacementForSeat(state, 'seat-human', { cell: 4, size: 'medium' })));

assert.equal(placementRejectionCode(state.board, 'marble', { cell: -1, size: 'small' }), C.INVALID_CELL);
assert.equal(placementRejectionCode(state.board, 'marble', { cell: 9, size: 'small' }), C.INVALID_CELL);
assert.equal(placementRejectionCode(state.board, 'marble', { cell: 1.5, size: 'small' }), C.INVALID_CELL);
assert.equal(placementRejectionCode(state.board, 'marble', { cell: '0', size: 'small' }), C.INVALID_CELL, 'canonical path must not coerce cell strings');
assert.equal(placementRejectionCode(state.board, 'marble', { cell: 0, size: 'huge' }), C.INVALID_SIZE);
assert.equal(placementRejectionCode(state.board, 'marble', { cell: 0, size: new String('small') }), C.INVALID_SIZE, 'canonical path must not coerce class instances');
assert.deepEqual(validatePlacementForSeat(state, 'missing-seat', { cell: 0, size: 'small' }), { ok: false, code: C.UNKNOWN_SEAT });

const occupiedBoard = emptyBoard();
occupiedBoard['4'].medium = 'blue';
const occupiedState = createCanonicalSessionState({ seats, board: occupiedBoard });
assert.equal(placementRejectionCode(occupiedState.board, 'marble', { cell: 4, size: 'medium' }), C.OCCUPIED_SLOT);
assert.deepEqual(validatePlacementForSeat(occupiedState, 'seat-human', { cell: 4, size: 'medium' }), { ok: false, code: C.OCCUPIED_SLOT });

const exhaustedBoard = emptyBoard();
for (const cell of [0, 1, 2]) exhaustedBoard[String(cell)].small = 'marble';
const exhaustedState = createCanonicalSessionState({ seats, board: exhaustedBoard });
assert.deepEqual(exhaustedState.inventory['seat-human'], { small: 0, medium: 3, large: 3 });
assert.deepEqual(deriveRemainingInventoryFromState(exhaustedState)['seat-human'], { small: 0, medium: 3, large: 3 });
assert.equal(placementRejectionCode(exhaustedState.board, 'marble', { cell: 3, size: 'small' }), C.NO_PIECE_REMAINING);
assert.deepEqual(validatePlacementForSeat(exhaustedState, 'seat-human', { cell: 3, size: 'small' }), { ok: false, code: C.NO_PIECE_REMAINING });

// Serialized inventory is a checked snapshot convenience, never the legality source.
const fakeMorePieces = JSON.parse(serializeCanonicalSessionState(exhaustedState));
fakeMorePieces.inventory['seat-human'].small = 3;
assert.deepEqual(
  validatePlacementForSeat(fakeMorePieces, 'seat-human', { cell: 3, size: 'small' }),
  { ok: false, code: C.NO_PIECE_REMAINING },
  'placement must derive availability from board, not mutable inventory counters',
);
const fakeNoPieces = JSON.parse(serializeCanonicalSessionState(state));
fakeNoPieces.inventory['seat-human'].medium = 0;
assert.deepEqual(
  validatePlacementForSeat(fakeNoPieces, 'seat-human', { cell: 4, size: 'medium' }),
  accepted,
  'a stale counter cannot reject a move while board-derived inventory remains',
);

// Protocol-v5 keeps only its historical input envelope/error grouping; it still
// reaches the same shared occupancy/piece-availability core.
assert.equal(validatePlacement(emptyBoard(), 'marble', { cell: '0', size: 'small' }), null, 'v5 string-cell coercion remains historical compatibility');
assert.equal(validatePlacement(emptyBoard(), 'marble', { cell: 9, size: 'small' }), 'invalid_move');
assert.equal(validatePlacement(emptyBoard(), 'marble', { cell: 0, size: 'huge' }), 'invalid_move');
assert.equal(validatePlacement(occupiedBoard, 'marble', { cell: 4, size: 'medium' }), C.OCCUPIED_SLOT);
assert.equal(validatePlacement(exhaustedBoard, 'marble', { cell: 3, size: 'small' }), C.NO_PIECE_REMAINING);

console.log('THREEJS-046 placement/inventory contract: PASS');
