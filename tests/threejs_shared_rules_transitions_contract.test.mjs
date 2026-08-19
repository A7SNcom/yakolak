import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import * as sharedRules from '../web/app/shared/rules.js';
import * as v5RulesAdapter from '../api/game-rules.js';
import {
  advanceRoundTransition,
  applyMoveTransition,
  finishRoundTransition,
  nextPlayablePlayerIndex,
  restartMatchTransition,
} from '../web/app/shared/transitions.js';

const rulesJson = JSON.parse(await readFile(new URL('../rules/yakolak-rules.json', import.meta.url), 'utf8'));
assert.deepEqual(sharedRules.RULES, rulesJson, 'browser-safe rule data must exactly match rules/yakolak-rules.json');

for (const name of [
  'RULES', 'COLORS', 'SIZES', 'LINES', 'isValidPlayerCount', 'isValidWinsToMatch',
  'emptyBoard', 'countPieces', 'validatePlacement', 'placePiece', 'winningPatterns',
  'winner', 'hasLegalMove', 'uniqueWinningSlots',
]) {
  assert.equal(v5RulesAdapter[name], sharedRules[name], `v5 adapter must re-export shared ${name}`);
}

for (const relative of ['../web/app/shared/rules.js', '../web/app/shared/transitions.js']) {
  const source = await readFile(new URL(relative, import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from\s+['"]node:|\bprocess\.|\bdocument\.|\bwindow\.|\bfetch\s*\(/, `${relative} must remain browser-safe and pure`);
}

const adapterSource = await readFile(new URL('../api/game-rules.js', import.meta.url), 'utf8');
assert.match(adapterSource, /export \* from '\.\.\/web\/app\/shared\/rules\.js'/);
assert.doesNotMatch(adapterSource, /yakolak-rules\.json|function\s+validatePlacement|function\s+winningPatterns/, 'v5 adapter must not retain duplicate rule logic');

assert.equal(sharedRules.isValidPlayerCount(2), true);
assert.equal(sharedRules.isValidPlayerCount('4'), true);
assert.equal(sharedRules.isValidPlayerCount(5), false);
assert.equal(sharedRules.isValidWinsToMatch('3'), true);
assert.equal(sharedRules.isValidWinsToMatch(4), false);

const empty = sharedRules.emptyBoard();
assert.deepEqual(Object.keys(empty), ['0', '1', '2', '3', '4', '5', '6', '7', '8']);
assert.equal(sharedRules.validatePlacement(empty, 'marble', { cell: 0, size: 'small' }), null);
assert.equal(sharedRules.validatePlacement(empty, 'marble', { cell: 9, size: 'small' }), 'invalid_move');

const occupied = sharedRules.placePiece(empty, 'blue', { cell: 0, size: 'small' });
assert.equal(sharedRules.validatePlacement(occupied, 'marble', { cell: 0, size: 'small' }), 'occupied_slot');
assert.deepEqual(empty['0'], {}, 'placePiece must not mutate the input board');

let exhausted = sharedRules.emptyBoard();
for (const cell of [0, 1, 2]) exhausted = sharedRules.placePiece(exhausted, 'marble', { cell, size: 'medium' });
assert.equal(sharedRules.validatePlacement(exhausted, 'marble', { cell: 3, size: 'medium' }), 'no_piece_remaining');

let sameSize = sharedRules.emptyBoard();
for (const cell of [0, 1, 2]) sameSize = sharedRules.placePiece(sameSize, 'marble', { cell, size: 'small' });
assert.equal(sharedRules.winner(sameSize, 'marble'), true);
assert.deepEqual(sharedRules.winningPatterns(sameSize, 'marble')[0], {
  type: 'same-size-line',
  line: [0, 1, 2],
  slots: [{ cell: 0, size: 'small' }, { cell: 1, size: 'small' }, { cell: 2, size: 'small' }],
});

let graded = sharedRules.emptyBoard();
graded = sharedRules.placePiece(graded, 'blue', { cell: 0, size: 'small' });
graded = sharedRules.placePiece(graded, 'blue', { cell: 1, size: 'medium' });
graded = sharedRules.placePiece(graded, 'blue', { cell: 2, size: 'large' });
assert.equal(sharedRules.winningPatterns(graded, 'blue').some(pattern => pattern.type === 'graded-line'), true);

let completeCell = sharedRules.emptyBoard();
for (const size of sharedRules.SIZES) completeCell = sharedRules.placePiece(completeCell, 'gold', { cell: 4, size });
assert.equal(sharedRules.winningPatterns(completeCell, 'gold').some(pattern => pattern.type === 'complete-cell'), true);

function baseState(overrides = {}) {
  return {
    protocol: 5,
    status: 'playing',
    targetPlayers: 2,
    targetRounds: 3,
    winsToMatch: 3,
    players: [{ seat: 'p1', color: 'marble' }, { seat: 'p2', color: 'blue' }],
    turnIndex: 0,
    board: sharedRules.emptyBoard(),
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
    ...overrides,
  };
}

const initial = baseState();
const moved = applyMoveTransition(initial, 'p1', { cell: 0, size: 'small' });
assert.equal(moved.turnIndex, 1, 'current v5 player-array order remains caller-supplied transition input');
assert.deepEqual(moved.lastMove, { cell: 0, size: 'small', color: 'marble', seat: 'p1' });
assert.equal(moved.moveNumber, 1);
assert.deepEqual(initial.board['0'], {}, 'transition must be pure');
assert.throws(() => applyMoveTransition(initial, 'p2', { cell: 0, size: 'small' }), /not_your_turn/);
assert.throws(() => applyMoveTransition({ ...initial, status: 'finished' }, 'p1', { cell: 0, size: 'small' }), /room_not_playing/);

let nearWinBoard = sharedRules.emptyBoard();
nearWinBoard = sharedRules.placePiece(nearWinBoard, 'marble', { cell: 0, size: 'small' });
nearWinBoard = sharedRules.placePiece(nearWinBoard, 'marble', { cell: 1, size: 'small' });
const roundWin = applyMoveTransition(baseState({ board: nearWinBoard }), 'p1', { cell: 2, size: 'small' });
assert.equal(roundWin.status, 'finished');
assert.deepEqual(roundWin.winner, { color: 'marble', seat: 'p1' });
assert.equal(roundWin.scores.p1, 1);
assert.equal(roundWin.completedRounds, 1);
assert.equal(roundWin.matchComplete, false);

const matchWin = applyMoveTransition(baseState({ board: nearWinBoard, scores: { p1: 2, p2: 1 } }), 'p1', { cell: 2, size: 'small' });
assert.equal(matchWin.matchComplete, true);
assert.deepEqual(matchWin.matchWinner, { seat: 'p1', color: 'marble', wins: 3 });
assert.deepEqual(matchWin.matchWinners, [{ seat: 'p1', color: 'marble', wins: 3 }]);

const finished = finishRoundTransition(baseState(), { draw: true, lastMove: { cell: 8, size: 'large', color: 'marble', seat: 'p1' } });
assert.equal(finished.status, 'finished');
assert.equal(finished.draw, true);
assert.equal(finished.completedRounds, 1);
assert.deepEqual(finished.scores, { p1: 0, p2: 0 });

const advanced = advanceRoundTransition({ ...roundWin, matchComplete: false }, 'p2');
assert.equal(advanced.status, 'playing');
assert.equal(advanced.round, 2);
assert.equal(advanced.turnIndex, 1, 'legacy v5 round starter formula must remain parity-locked until THREEJS-048');
assert.deepEqual(advanced.board, sharedRules.emptyBoard());
assert.deepEqual(advanced.rematch, { p1: false, p2: false });

const restarted = restartMatchTransition(matchWin);
assert.equal(restarted.status, 'playing');
assert.equal(restarted.round, 1);
assert.equal(restarted.completedRounds, 0);
assert.equal(restarted.turnIndex, 0);
assert.deepEqual(restarted.scores, { p1: 0, p2: 0 });
assert.deepEqual(restarted.board, sharedRules.emptyBoard());

assert.equal(nextPlayablePlayerIndex(baseState(), 0), 1);
assert.equal(nextPlayablePlayerIndex(baseState(), 0, ['p1']), -1, 'allowedSeats filters candidates without defining a new seat topology');

console.log('THREEJS-044 shared rules/transitions contract: PASS');
