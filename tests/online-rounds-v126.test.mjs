import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyOnlineMove,
  createOnlineState,
  joinOnlineState,
  requestOnlineRematch
} from '../src/online-rules-v118.js';

function playRound(state, firstSeat, firstColor, secondSeat, size) {
  const secondColor = state.players.find(player => player.seat === secondSeat).color;
  const moves = [
    [firstSeat, 0, size],
    [secondSeat, 3, size === 's' ? 'm' : 's'],
    [firstSeat, 1, size],
    [secondSeat, 4, size === 's' ? 'm' : 's'],
    [firstSeat, 2, size]
  ];
  let next = state;
  for (const [seat, zone, moveSize] of moves) next = applyOnlineMove(next, seat, { zone, size: moveSize });
  assert.equal(next.winner?.color, firstColor);
  assert.notEqual(next.winner?.color, secondColor);
  return next;
}

function acceptNextRound(state) {
  const oneReady = requestOnlineRematch(state, 'p1');
  assert.equal(oneReady.status, 'finished');
  assert.equal(oneReady.rematch.p1, true);
  return requestOnlineRematch(oneReady, 'p2');
}

test('two-player rounds, scores, final result, and full rematch stay coherent', () => {
  let state = createOnlineState('right', 2, 3);
  state = joinOnlineState(state, 'p2', 'back');

  state = playRound(state, 'p1', 'right', 'p2', 'l');
  assert.equal(state.completedRounds, 1);
  assert.equal(state.scores.p1, 1);
  assert.equal(state.matchComplete, false);

  state = acceptNextRound(state);
  assert.equal(state.status, 'playing');
  assert.equal(state.round, 2);
  assert.equal(state.turnIndex, 1);
  assert.equal(state.scores.p1, 1);

  state = playRound(state, 'p2', 'back', 'p1', 'm');
  state = acceptNextRound(state);
  assert.equal(state.round, 3);
  assert.equal(state.turnIndex, 0);

  state = playRound(state, 'p1', 'right', 'p2', 's');
  assert.equal(state.matchComplete, true);
  assert.equal(state.completedRounds, 3);
  assert.deepEqual(state.scores, { p1: 2, p2: 1 });
  assert.equal(state.matchWinner?.seat, 'p1');

  state = acceptNextRound(state);
  assert.equal(state.status, 'playing');
  assert.equal(state.round, 1);
  assert.equal(state.completedRounds, 0);
  assert.deepEqual(state.scores, { p1: 0, p2: 0 });
});
