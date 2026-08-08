import assert from 'node:assert/strict';
import { __testing } from '../api/rooms.js';

const { PROTOCOL, applyMove, createState, joinState, normalizeCode, rematchState } = __testing;

assert.equal(PROTOCOL, 5);
assert.equal(normalizeCode('42'), '42');
assert.equal(normalizeCode('٤٢'), '42');
assert.equal(normalizeCode('۴۲'), '42');
assert.equal(normalizeCode('غرفة ٤٢'), '42');
assert.equal(createState('marble', 2, 3).protocol, 5);

function room() {
  return joinState(createState('marble', 2, 3), 'p2', 'blue');
}

function move(state, seat, cell, size) {
  return applyMove(state, seat, { cell, size });
}

assert.throws(
  () => joinState(createState('marble', 2, 3), 'p2', 'marble'),
  /color_taken/
);

let sameSize = room();
sameSize = move(sameSize, 'p1', 0, 'small');
sameSize = move(sameSize, 'p2', 8, 'large');
sameSize = move(sameSize, 'p1', 1, 'small');
sameSize = move(sameSize, 'p2', 7, 'medium');
sameSize = move(sameSize, 'p1', 2, 'small');
assert.equal(sameSize.status, 'finished');
assert.equal(sameSize.winner?.seat, 'p1');
assert.equal(sameSize.scores.p1, 1);

let graded = room();
graded = move(graded, 'p1', 0, 'small');
graded = move(graded, 'p2', 8, 'large');
graded = move(graded, 'p1', 1, 'medium');
graded = move(graded, 'p2', 7, 'medium');
graded = move(graded, 'p1', 2, 'large');
assert.equal(graded.status, 'finished');
assert.equal(graded.winner?.color, 'marble');

let stack = room();
stack = move(stack, 'p1', 4, 'small');
stack = move(stack, 'p2', 8, 'large');
stack = move(stack, 'p1', 4, 'medium');
stack = move(stack, 'p2', 7, 'medium');
stack = move(stack, 'p1', 4, 'large');
assert.equal(stack.status, 'finished');
assert.equal(stack.winner?.seat, 'p1');

let nextRound = rematchState(stack, 'p1');
assert.equal(nextRound.status, 'finished');
nextRound = rematchState(nextRound, 'p2');
assert.equal(nextRound.status, 'playing');
assert.equal(nextRound.round, 2);
assert.deepEqual(nextRound.board['4'], {});
assert.equal(nextRound.scores.p1, 1);

console.log('YAKOLAK_ONLINE_RULES_OK');
