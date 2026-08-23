import assert from 'node:assert/strict';

import {
  FASTPLAY_DEFAULT_WINS_TO_MATCH,
  createFastplayInitialState,
  createFastplaySeats,
} from '../web/app/fastplay/local-match-config.js';

const expectedRing = [
  ['right', 'marble'],
  ['back', 'blue'],
  ['left', 'gold'],
  ['front', 'green'],
];

for (const targetPlayers of [2, 3, 4]) {
  const seatTypes = Array.from({ length: targetPlayers }, (_, index) => index % 2 === 0 ? 'human' : 'computer');
  const seats = createFastplaySeats({ targetPlayers, seatTypes });
  assert.equal(seats.length, targetPlayers);
  assert.deepEqual(seats.map(seat => [seat.seatId, seat.color]), expectedRing.slice(0, targetPlayers));
  assert.deepEqual(seats.map(seat => seat.type), seatTypes);

  const state = createFastplayInitialState({ targetPlayers, seatTypes });
  assert.equal(state.preferredColor, 'marble');
  assert.equal(state.targetPlayers, targetPlayers);
  assert.equal(state.winsToMatch, FASTPLAY_DEFAULT_WINS_TO_MATCH);
  assert.equal(state.winsToMatch, 3);
  assert.equal(state.activeSeatId, 'right');
  assert.equal(state.round, 1);
  assert.equal(state.lifecycle.phase, 'turn-loop');
  assert.deepEqual(state.seats.map(seat => [seat.seatId, seat.color, seat.type]), seats.map(seat => [seat.seatId, seat.color, seat.type]));
}

assert.deepEqual(createFastplaySeats({ targetPlayers: 2 }).map(seat => seat.type), ['human', 'computer']);
assert.throws(() => createFastplaySeats({ targetPlayers: 1 }), error => error.code === 'fastplay_invalid_player_count');
assert.throws(() => createFastplaySeats({ targetPlayers: 2, seatTypes: ['human', 'online-human'] }), error => error.code === 'fastplay_invalid_seat_type');

console.log('FASTPLAY-002 local match config contract: PASS');
