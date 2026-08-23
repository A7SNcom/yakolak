import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUTHORITATIVE_OPERATION_NAMES,
  applyAuthoritativeMutation,
  normalizeApiError,
  normalizeMutationEnvelope,
} from '../backend/cloudflare/src/authoritative-api.js';
import {
  PLACEMENT_REJECTION_CODES,
  emptyBoard,
} from '../web/app/shared/rules.js';

const C = PLACEMENT_REJECTION_CODES;

function baseState(board = emptyBoard()) {
  return {
    protocol: 5,
    status: 'playing',
    targetPlayers: 2,
    targetRounds: 3,
    winsToMatch: 3,
    players: [
      { seat: 'p1', color: 'marble' },
      { seat: 'p2', color: 'blue' },
    ],
    turnIndex: 0,
    board,
    round: 1,
    completedRounds: 0,
    scores: { p1: 0, p2: 0 },
    winner: null,
    draw: false,
    lastMove: null,
    moveNumber: 0,
    matchComplete: false,
    matchWinner: null,
    matchWinners: [],
    rematch: { p1: false, p2: false },
    skippedSeat: null,
  };
}

function envelope(payload, mutationId = 'm'.repeat(32)) {
  return normalizeMutationEnvelope({
    mutationId,
    expectedRevision: 0,
    action: AUTHORITATIVE_OPERATION_NAMES.MOVE,
    payload,
  });
}

function rejectionCode(state, payload) {
  try {
    applyAuthoritativeMutation(state, 'p1', envelope(payload));
    assert.fail('expected authoritative placement rejection');
  } catch (error) {
    return error.code || error.message;
  }
}

test('THREEJS-046 backend authority preserves raw move values for shared strict legality', () => {
  const stringCell = envelope({ cell: '0', size: 'small' });
  assert.equal(stringCell.payload.cell, '0');
  assert.equal(rejectionCode(baseState(), stringCell.payload), C.INVALID_CELL);

  const invalidSize = envelope({ cell: 0, size: 'huge' }, 'n'.repeat(32));
  assert.equal(invalidSize.payload.size, 'huge');
  assert.equal(rejectionCode(baseState(), invalidSize.payload), C.INVALID_SIZE);

  assert.deepEqual(normalizeApiError(Object.assign(new Error(C.INVALID_CELL), { code: C.INVALID_CELL })), {
    status: 400,
    code: C.INVALID_CELL,
    retryable: false,
    details: null,
  });
  assert.deepEqual(normalizeApiError(Object.assign(new Error(C.INVALID_SIZE), { code: C.INVALID_SIZE })), {
    status: 400,
    code: C.INVALID_SIZE,
    retryable: false,
    details: null,
  });
});

test('THREEJS-046 backend authority shares occupancy and board-derived inventory codes', () => {
  const occupiedBoard = emptyBoard();
  occupiedBoard['4'].medium = 'blue';
  assert.equal(rejectionCode(baseState(occupiedBoard), { cell: 4, size: 'medium' }), C.OCCUPIED_SLOT);

  const exhaustedBoard = emptyBoard();
  for (const cell of [0, 1, 2]) exhaustedBoard[String(cell)].small = 'marble';
  assert.equal(rejectionCode(baseState(exhaustedBoard), { cell: 3, size: 'small' }), C.NO_PIECE_REMAINING);
});

test('THREEJS-046 backend authority still commits valid moves through shared transition', () => {
  const next = applyAuthoritativeMutation(baseState(), 'p1', envelope({ cell: 4, size: 'medium' }));
  assert.equal(next.board['4'].medium, 'marble');
  assert.deepEqual(next.lastMove, { cell: 4, size: 'medium', color: 'marble', seat: 'p1' });
  assert.equal(next.moveNumber, 1);
});
