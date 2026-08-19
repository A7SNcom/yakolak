import assert from 'node:assert/strict';

import {
  LINES,
  RULES,
  SIZES,
  emptyBoard,
  placePiece,
  winningOutcomeAfterAcceptedPlacement,
} from '../web/app/shared/rules.js';
import { applyMoveTransition } from '../web/app/shared/transitions.js';

const COLOR = 'marble';

function sortedSlots(slots) {
  return [...slots]
    .map(({ cell, size }) => ({ cell, size }))
    .sort((a, b) => a.cell - b.cell || SIZES.indexOf(a.size) - SIZES.indexOf(b.size));
}

function add(board, cell, size, color = COLOR) {
  return placePiece(board, color, { cell, size });
}

let verifiedPatterns = 0;

// 8 lines × 3 sizes = 24 exact same-size-line fixtures.
for (const line of LINES) {
  for (const size of SIZES) {
    let board = emptyBoard();
    board = add(board, line[0], size);
    board = add(board, line[1], size);
    board = add(board, line[2], size);
    const outcome = winningOutcomeAfterAcceptedPlacement(board, COLOR, { cell: line[2], size });
    assert.equal(outcome.won, true);
    assert.equal(outcome.patterns.length, 1);
    assert.deepEqual(outcome.patterns[0], {
      type: 'same-size-line',
      line: [...line],
      slots: line.map(cell => ({ cell, size })),
    });
    assert.deepEqual(sortedSlots(outcome.winningSlots), sortedSlots(line.map(cell => ({ cell, size }))));
    assert(Object.isFrozen(outcome));
    assert(Object.isFrozen(outcome.patterns));
    assert(Object.isFrozen(outcome.winningSlots));
    verifiedPatterns += 1;
  }
}

// 8 lines × both graded orders = 16 exact graded-line fixtures.
for (const line of LINES) {
  for (const order of RULES.gradedOrders) {
    let board = emptyBoard();
    line.forEach((cell, index) => {
      board = add(board, cell, order[index]);
    });
    const finalCell = line[2];
    const finalSize = order[2];
    const outcome = winningOutcomeAfterAcceptedPlacement(board, COLOR, { cell: finalCell, size: finalSize });
    assert.equal(outcome.won, true);
    assert.equal(outcome.patterns.length, 1);
    assert.deepEqual(outcome.patterns[0], {
      type: 'graded-line',
      line: [...line],
      order: [...order],
      slots: line.map((cell, index) => ({ cell, size: order[index] })),
    });
    assert.deepEqual(
      sortedSlots(outcome.winningSlots),
      sortedSlots(line.map((cell, index) => ({ cell, size: order[index] }))),
    );
    verifiedPatterns += 1;
  }
}

// 9 cells × one complete-cell pattern = 9 exact complete-cell fixtures.
for (let cell = 0; cell < RULES.cellCount; cell += 1) {
  let board = emptyBoard();
  for (const size of SIZES) board = add(board, cell, size);
  const outcome = winningOutcomeAfterAcceptedPlacement(board, COLOR, { cell, size: 'large' });
  assert.equal(outcome.won, true);
  assert.equal(outcome.patterns.length, 1);
  assert.deepEqual(outcome.patterns[0], {
    type: 'complete-cell',
    cell,
    slots: SIZES.map(size => ({ cell, size })),
  });
  assert.deepEqual(sortedSlots(outcome.winningSlots), sortedSlots(SIZES.map(size => ({ cell, size }))));
  verifiedPatterns += 1;
}

assert.equal(verifiedPatterns, 49, 'must exhaustively cover 24 same-size + 16 graded + 9 complete-cell patterns');

// A win evaluator cannot run against a move that has not actually been committed.
assert.throws(
  () => winningOutcomeAfterAcceptedPlacement(emptyBoard(), COLOR, { cell: 0, size: 'small' }),
  /win_evaluation_requires_accepted_placement/,
);
assert.throws(
  () => winningOutcomeAfterAcceptedPlacement(emptyBoard(), COLOR, { cell: '0', size: 'small' }),
  /win_evaluation_requires_accepted_placement/,
);

function transitionState(board, score = 0) {
  return {
    status: 'playing',
    players: [
      { seat: 'p1', color: COLOR },
      { seat: 'p2', color: 'blue' },
    ],
    turnIndex: 0,
    board,
    scores: { p1: score, p2: 0 },
    completedRounds: 0,
    winsToMatch: 3,
    targetRounds: 3,
    round: 1,
    moveNumber: 0,
    winner: null,
    draw: false,
    lastMove: null,
    matchComplete: false,
    matchWinner: null,
    matchWinners: [],
    rematch: { p1: false, p2: false },
    skippedSeat: null,
  };
}

// Even if a malformed imported state already contains a win, a rejected placement
// must fail before win evaluation and cannot award another point.
let preExistingWin = emptyBoard();
for (const cell of [0, 1, 2]) preExistingWin = add(preExistingWin, cell, 'small');
const rejectedState = transitionState(preExistingWin, 1);
assert.throws(() => applyMoveTransition(rejectedState, 'p1', { cell: 0, size: 'small' }), /occupied_slot/);
assert.deepEqual(rejectedState.scores, { p1: 1, p2: 0 });
assert.equal(rejectedState.status, 'playing');

// One accepted placement completes two patterns simultaneously:
// - small same-size line [0,1,2]
// - complete cell 2
// The outcome returns five unique slots, but the round score advances once.
let multipleBefore = emptyBoard();
multipleBefore = add(multipleBefore, 0, 'small');
multipleBefore = add(multipleBefore, 1, 'small');
multipleBefore = add(multipleBefore, 2, 'medium');
multipleBefore = add(multipleBefore, 2, 'large');
const multiResult = applyMoveTransition(transitionState(multipleBefore), 'p1', { cell: 2, size: 'small' });
assert.equal(multiResult.status, 'finished');
assert.deepEqual(multiResult.scores, { p1: 1, p2: 0 }, 'multiple patterns must award exactly one round point');
assert.equal(multiResult.completedRounds, 1);
assert.deepEqual(multiResult.winner, { color: COLOR, seat: 'p1' });
const multiOutcome = winningOutcomeAfterAcceptedPlacement(multiResult.board, COLOR, { cell: 2, size: 'small' });
assert.equal(multiOutcome.patterns.length, 2);
assert.deepEqual(
  new Set(multiOutcome.patterns.map(pattern => pattern.type)),
  new Set(['same-size-line', 'complete-cell']),
);
assert.deepEqual(sortedSlots(multiOutcome.winningSlots), sortedSlots([
  { cell: 0, size: 'small' },
  { cell: 1, size: 'small' },
  { cell: 2, size: 'small' },
  { cell: 2, size: 'medium' },
  { cell: 2, size: 'large' },
]));

console.log('THREEJS-047 winning patterns contract: PASS patterns=49');
