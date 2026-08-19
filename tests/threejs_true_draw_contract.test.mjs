import assert from 'node:assert/strict';

import {
  createCanonicalSessionState,
  parseCanonicalSessionState,
  serializeCanonicalSessionState,
} from '../web/app/session/canonical-session-state.js';
import {
  canonicalDrawResult,
  commitAuthoritativeDraw,
  proveCanonicalDraw,
} from '../web/app/session/draw-resolution.js';
import { beginAuthoritativeLocalTurnDeadline } from '../web/app/session/local-turn-deadline.js';
import {
  applyAuthoritativeLocalTimeout,
  createExpiredLocalTimeoutIntent,
} from '../web/app/session/local-timeout.js';
import { emptyBoard } from '../web/app/shared/rules.js';

const configuredSeats = [
  { seatId: 'right', type: 'host-human', color: 'marble', ready: true },
  { seatId: 'back', type: 'computer', color: 'blue', ready: true },
];

function assign(board, color, size, cells) {
  for (const cell of cells) board[String(cell)][size] = color;
  return board;
}

// Both players have placed all three copies of every size, so neither can move.
// The arrangement was chosen to avoid every same-size, graded and complete-cell win.
function trueDrawBoard() {
  let board = emptyBoard();
  board = assign(board, 'marble', 'small', [1, 6, 7]);
  board = assign(board, 'blue', 'small', [2, 3, 4]);
  board = assign(board, 'marble', 'medium', [2, 6, 8]);
  board = assign(board, 'blue', 'medium', [0, 4, 7]);
  board = assign(board, 'marble', 'large', [0, 1, 4]);
  board = assign(board, 'blue', 'large', [2, 7, 8]);
  return board;
}

function stateWith(board, overrides = {}) {
  return createCanonicalSessionState({
    preferredColor: 'marble',
    targetPlayers: 2,
    winsToMatch: 3,
    seats: configuredSeats,
    board,
    activeSeatId: 'right',
    scores: { right: 2, back: 1 },
    round: 5,
    completedRounds: 4,
    revision: 22,
    lifecycle: {
      phase: 'turn-loop',
      interrupt: null,
      recoveryTarget: null,
      presentationGeneration: 8,
    },
    ...overrides,
  });
}

const candidate = stateWith(trueDrawBoard(), { deadlineAtMs: 1_787_166_000_000 });
const proof = proveCanonicalDraw(candidate);
assert.equal(proof.allSeatsBlocked, true);
assert.equal(proof.hasWinningPattern, false);
assert.equal(proof.isDraw, true);
assert.deepEqual(proof.seats, [
  { seatId: 'right', color: 'marble', hasLegalMove: false, winningPatternCount: 0 },
  { seatId: 'back', color: 'blue', hasLegalMove: false, winningPatternCount: 0 },
]);

const boardBefore = structuredClone(candidate.board);
const inventoryBefore = structuredClone(candidate.inventory);
const scoresBefore = structuredClone(candidate.scores);
const committed = commitAuthoritativeDraw(candidate, { expectedRevision: 22 });
const drawn = committed.state;
assert.equal(drawn.draw, true);
assert.equal(drawn.winner, null);
assert.equal(drawn.lifecycle.phase, 'draw');
assert.equal(drawn.lifecycle.presentationGeneration, 9);
assert.equal(drawn.activeSeatId, null);
assert.equal(drawn.deadlineAtMs, null);
assert.equal(drawn.completedRounds, 5);
assert.equal(drawn.revision, 22, 'THREEJS-051 records but does not invent revision advancement');
assert.equal(drawn.roundEndRevision, 22, 'exact end revision is preserved canonically');
assert.deepEqual(drawn.scores, scoresBefore, 'draw awards zero score');
assert.deepEqual(drawn.board, boardBefore, 'draw cannot change board');
assert.deepEqual(drawn.inventory, inventoryBefore, 'draw cannot change inventory');
assert.deepEqual(drawn.skips, [
  { seatId: 'right', reason: 'no_legal_move' },
  { seatId: 'back', reason: 'no_legal_move' },
]);
assert.deepEqual(committed.result, {
  type: 'draw',
  endRevision: 22,
  scores: { right: 2, back: 1 },
});

const hydrated = parseCanonicalSessionState(serializeCanonicalSessionState(drawn));
assert.deepEqual(canonicalDrawResult(hydrated), {
  type: 'draw',
  endRevision: 22,
  scores: { right: 2, back: 1 },
}, 'hydration must preserve canonical draw result + exact end revision');

// Later revision movement must not rewrite the recorded round-end revision.
const laterRevision = JSON.parse(serializeCanonicalSessionState(drawn));
laterRevision.revision = 23;
assert.deepEqual(canonicalDrawResult(laterRevision), {
  type: 'draw',
  endRevision: 22,
  scores: { right: 2, back: 1 },
});

// Presentation evidence is never sufficient. Fake no-move/timeout skips on a board
// with legal placements cannot force draw because the resolver recomputes rules.
const fakeNoMovePresentation = stateWith(emptyBoard(), {
  skips: [
    { seatId: 'right', reason: 'no_legal_move' },
    { seatId: 'back', reason: 'no_legal_move' },
  ],
});
assert.equal(proveCanonicalDraw(fakeNoMovePresentation).isDraw, false);
assert.throws(
  () => commitAuthoritativeDraw(fakeNoMovePresentation, { expectedRevision: 22 }),
  /draw_not_proven/,
);
const fakeTimeoutPresentation = stateWith(emptyBoard(), {
  skips: [{ seatId: 'right', reason: 'timeout' }],
});
assert.throws(
  () => commitAuthoritativeDraw(fakeTimeoutPresentation, { expectedRevision: 22 }),
  /draw_not_proven/,
);

// All seats blocked is still not a draw if a winning pattern already exists.
let winningBlocked = emptyBoard();
for (const size of ['small', 'medium', 'large']) {
  winningBlocked = assign(winningBlocked, 'marble', size, [0, 1, 2]);
  winningBlocked = assign(winningBlocked, 'blue', size, [3, 4, 5]);
}
const malformedWinningEnd = stateWith(winningBlocked);
const winningProof = proveCanonicalDraw(malformedWinningEnd);
assert.equal(winningProof.allSeatsBlocked, true);
assert.equal(winningProof.hasWinningPattern, true);
assert.equal(winningProof.isDraw, false);
assert.throws(
  () => commitAuthoritativeDraw(malformedWinningEnd, { expectedRevision: 22 }),
  /draw_superseded_by_win/,
);

// Revision/lifecycle are authority gates; stale or repeated draw application cannot
// increment completedRounds a second time.
assert.throws(() => commitAuthoritativeDraw(candidate, { expectedRevision: 21 }), /stale_draw_revision/);
assert.throws(() => commitAuthoritativeDraw(drawn, { expectedRevision: 22 }), /draw_requires_turn_loop|round_already_ended/);
assert.equal(drawn.completedRounds, 5);
assert.throws(() => commitAuthoritativeDraw(stateWith(trueDrawBoard(), {
  lifecycle: {
    phase: 'turn-loop',
    interrupt: 'context-lost',
    recoveryTarget: 'turn-loop',
    presentationGeneration: 8,
  },
}), { expectedRevision: 22 }), /draw_requires_uninterrupted_transition/);

// Integration with THREEJS-050 recovery path: timeout may observe all seats blocked,
// but it cannot set draw. The authoritative draw resolver independently proves it.
const isOnlineSeatType = type => type === 'online-human';
const timed = beginAuthoritativeLocalTurnDeadline(stateWith(trueDrawBoard(), { deadlineAtMs: null }), {
  nowMs: 1_787_166_100_000,
  isOnlineSeatType,
});
const timeoutAttempt = createExpiredLocalTimeoutIntent(timed, {
  nowMs: timed.deadlineAtMs,
  isOnlineSeatType,
});
const timeoutResult = applyAuthoritativeLocalTimeout(timed, timeoutAttempt, {
  nowMs: timed.deadlineAtMs,
  isOnlineSeatType,
});
assert.equal(timeoutResult.status, 'requires-draw-resolution');
assert.equal(timeoutResult.nextState, null);
assert.equal(timed.draw, false);
const afterTimeoutProof = commitAuthoritativeDraw(timed, { expectedRevision: timed.revision });
assert.equal(afterTimeoutProof.state.draw, true);
assert.deepEqual(afterTimeoutProof.state.scores, timed.scores);

console.log('THREEJS-051 true draw contract: PASS');
