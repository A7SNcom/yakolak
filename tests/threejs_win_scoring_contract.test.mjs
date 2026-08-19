import assert from 'node:assert/strict';

import { emptyBoard } from '../web/app/shared/rules.js';
import {
  createCanonicalSessionState,
  parseCanonicalSessionState,
  serializeCanonicalSessionState,
} from '../web/app/session/canonical-session-state.js';
import { commitAuthoritativeDraw } from '../web/app/session/draw-resolution.js';
import {
  canonicalWinResult,
  commitAuthoritativeRoundWin,
} from '../web/app/session/win-resolution.js';

const seats = [
  { seatId: 'right', type: 'host-human', color: 'marble', ready: true },
  { seatId: 'back', type: 'computer', color: 'blue', ready: true },
];

function winningBoard() {
  const board = emptyBoard();
  board['0'].small = 'marble';
  board['1'].small = 'marble';
  board['2'].small = 'marble';
  board['2'].medium = 'marble';
  board['2'].large = 'marble';
  return board;
}

function winCandidate({
  winsToMatch = 3,
  rightScore = 0,
  backScore = 0,
  completedRounds = 0,
  revision = 40,
  board = winningBoard(),
  activeSeatId = 'right',
  lastMove = { seatId: 'right', color: 'marble', cell: 2, size: 'small' },
  lifecycle = { phase: 'turn-loop' },
} = {}) {
  return createCanonicalSessionState({
    preferredColor: 'marble',
    targetPlayers: 2,
    winsToMatch,
    seats,
    board,
    activeSeatId,
    deadlineAtMs: 1_787_167_000_000,
    scores: { right: rightScore, back: backScore },
    completedRounds,
    revision,
    lastMove,
    lifecycle,
  });
}

// One accepted placement completes two patterns at once (small line + complete cell)
// but the winner receives exactly one score point and the round closes once.
const candidate = winCandidate({ winsToMatch: 5, rightScore: 1, completedRounds: 99 });
const boardBefore = structuredClone(candidate.board);
const inventoryBefore = structuredClone(candidate.inventory);
const committed = commitAuthoritativeRoundWin(candidate, { expectedRevision: 40 });
const won = committed.state;
assert.equal(committed.result.patterns.length, 2);
assert.deepEqual(new Set(committed.result.patterns.map(pattern => pattern.type)), new Set(['same-size-line', 'complete-cell']));
assert.equal(won.scores.right, 2, 'multi-pattern move awards one point only');
assert.equal(won.scores.back, 0);
assert.equal(won.completedRounds, 100);
assert.equal(won.matchComplete, false, 'completedRounds=100 cannot finish a 5-win match');
assert.equal(won.matchWinner, null);
assert.deepEqual(won.matchWinners, []);
assert.deepEqual(won.winner, { seatId: 'right', color: 'marble' });
assert.equal(won.draw, false);
assert.equal(won.lifecycle.phase, 'win');
assert.equal(won.activeSeatId, null);
assert.equal(won.deadlineAtMs, null);
assert.equal(won.revision, 40, 'THREEJS-052 does not invent revision advancement');
assert.equal(won.roundEndRevision, 40);
assert.deepEqual(won.board, boardBefore);
assert.deepEqual(won.inventory, inventoryBefore);

// Re-applying the result cannot duplicate score. Re-evaluating the same immutable
// original state produces the same +1 result, never a cumulative +2 side effect.
assert.throws(() => commitAuthoritativeRoundWin(won, { expectedRevision: 40 }), /round_already_ended/);
const sameOriginalAgain = commitAuthoritativeRoundWin(candidate, { expectedRevision: 40 });
assert.equal(sameOriginalAgain.state.scores.right, 2);
assert.equal(candidate.scores.right, 1, 'input canonical state remains unchanged');

// Score follows the actual stable winning seat, not host position/preferred color.
const blueBoard = emptyBoard();
blueBoard['0'].small = 'blue';
blueBoard['1'].small = 'blue';
blueBoard['2'].small = 'blue';
const blueWin = commitAuthoritativeRoundWin(winCandidate({
  board: blueBoard,
  activeSeatId: 'back',
  lastMove: { seatId: 'back', color: 'blue', cell: 2, size: 'small' },
  rightScore: 2,
  backScore: 1,
  revision: 46,
}), { expectedRevision: 46 }).state;
assert.deepEqual(blueWin.winner, { seatId: 'back', color: 'blue' });
assert.deepEqual(blueWin.scores, { right: 2, back: 2 });
assert.equal(blueWin.matchComplete, false);

// Match completion is score-threshold-only for both locked options.
const reachThree = commitAuthoritativeRoundWin(winCandidate({
  winsToMatch: 3,
  rightScore: 2,
  completedRounds: 500,
  revision: 41,
}), { expectedRevision: 41 }).state;
assert.equal(reachThree.scores.right, 3);
assert.equal(reachThree.matchComplete, true);
assert.deepEqual(reachThree.matchWinner, { seatId: 'right', color: 'marble', wins: 3 });
assert.deepEqual(reachThree.matchWinners, [{ seatId: 'right', color: 'marble', wins: 3 }]);

const reachFive = commitAuthoritativeRoundWin(winCandidate({
  winsToMatch: 5,
  rightScore: 4,
  completedRounds: 1,
  revision: 42,
}), { expectedRevision: 42 }).state;
assert.equal(reachFive.scores.right, 5);
assert.equal(reachFive.matchComplete, true);
assert.deepEqual(reachFive.matchWinner, { seatId: 'right', color: 'marble', wins: 5 });

// Merely reaching the configured number of completed rounds does not complete a match.
const completedRoundsEqualsThree = commitAuthoritativeRoundWin(winCandidate({
  winsToMatch: 3,
  rightScore: 0,
  completedRounds: 2,
  revision: 43,
}), { expectedRevision: 43 }).state;
assert.equal(completedRoundsEqualsThree.completedRounds, 3);
assert.equal(completedRoundsEqualsThree.scores.right, 1);
assert.equal(completedRoundsEqualsThree.matchComplete, false);

const completedRoundsEqualsFive = commitAuthoritativeRoundWin(winCandidate({
  winsToMatch: 5,
  rightScore: 1,
  completedRounds: 4,
  revision: 44,
}), { expectedRevision: 44 }).state;
assert.equal(completedRoundsEqualsFive.completedRounds, 5);
assert.equal(completedRoundsEqualsFive.scores.right, 2);
assert.equal(completedRoundsEqualsFive.matchComplete, false);

// Draws add zero score and completedRounds crossing winsToMatch remains irrelevant.
function trueDrawBoard() {
  const board = emptyBoard();
  const assign = (color, size, cells) => {
    for (const cell of cells) board[String(cell)][size] = color;
  };
  assign('marble', 'small', [1, 6, 7]);
  assign('blue', 'small', [2, 3, 4]);
  assign('marble', 'medium', [2, 6, 8]);
  assign('blue', 'medium', [0, 4, 7]);
  assign('marble', 'large', [0, 1, 4]);
  assign('blue', 'large', [2, 7, 8]);
  return board;
}
const drawCandidate = createCanonicalSessionState({
  preferredColor: 'marble',
  targetPlayers: 2,
  winsToMatch: 3,
  seats,
  board: trueDrawBoard(),
  activeSeatId: 'right',
  scores: { right: 2, back: 1 },
  completedRounds: 2,
  revision: 45,
  lifecycle: { phase: 'turn-loop' },
});
const drawn = commitAuthoritativeDraw(drawCandidate, { expectedRevision: 45 }).state;
assert.equal(drawn.completedRounds, 3);
assert.deepEqual(drawn.scores, { right: 2, back: 1 }, 'draw adds no score');
assert.equal(drawn.matchComplete, false, 'completedRounds reaching 3 cannot complete match');

// Win proof is tied to canonical lastMove / active seat and accepted-placement slot.
assert.throws(() => commitAuthoritativeRoundWin(winCandidate({
  lastMove: { seatId: 'right', color: 'marble', cell: 8, size: 'medium' },
  board: (() => {
    const board = winningBoard();
    board['8'].medium = 'marble';
    return board;
  })(),
}), { expectedRevision: 40 }), /winning_move_not_proven/);
assert.throws(() => commitAuthoritativeRoundWin(winCandidate({
  activeSeatId: 'back',
}), { expectedRevision: 40 }), /winning_move_not_active_seat/);
assert.throws(() => commitAuthoritativeRoundWin(winCandidate(), { expectedRevision: 39 }), /stale_win_revision/);
assert.throws(() => commitAuthoritativeRoundWin(winCandidate({
  lifecycle: {
    phase: 'turn-loop',
    interrupt: 'context-lost',
    recoveryTarget: 'turn-loop',
    presentationGeneration: 1,
  },
}), { expectedRevision: 40 }), /win_requires_uninterrupted_transition/);
assert.throws(() => commitAuthoritativeRoundWin(winCandidate({
  winsToMatch: 3,
  rightScore: 3,
}), { expectedRevision: 40 }), /match_threshold_already_reached/);

// Persisted canonical win result keeps exact round-end revision independently from
// later live revision movement.
const hydrated = parseCanonicalSessionState(serializeCanonicalSessionState(reachThree));
assert.deepEqual(canonicalWinResult(hydrated), {
  type: 'win',
  winner: { seatId: 'right', color: 'marble' },
  endRevision: 41,
  scores: { right: 3, back: 0 },
  matchComplete: true,
  matchWinner: { seatId: 'right', color: 'marble', wins: 3 },
});
const laterRevision = JSON.parse(serializeCanonicalSessionState(reachThree));
laterRevision.revision = 99;
assert.equal(canonicalWinResult(laterRevision).endRevision, 41);

console.log('THREEJS-052 win scoring contract: PASS');
