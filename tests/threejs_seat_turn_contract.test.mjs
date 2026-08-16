import assert from 'node:assert/strict';
import { __testing } from '../api/rooms.js';

const {
  SEAT_CONTRACT_VERSION,
  CANONICAL_COLOR_RING,
  advanceRoundState,
  applyMove,
  canonicalSeatTopology,
  createState,
  joinState,
  nextPlayableHandoff,
} = __testing;

assert.equal(SEAT_CONTRACT_VERSION, 1);
assert.deepEqual(CANONICAL_COLOR_RING, ['marble', 'blue', 'gold', 'green']);

assert.deepEqual(canonicalSeatTopology('gold', 3), [
  { seat: 'p1', color: 'gold' },
  { seat: 'p2', color: 'green' },
  { seat: 'p3', color: 'marble' },
]);
assert.deepEqual(canonicalSeatTopology('green', 4), [
  { seat: 'p1', color: 'green' },
  { seat: 'p2', color: 'marble' },
  { seat: 'p3', color: 'blue' },
  { seat: 'p4', color: 'gold' },
]);

// Arrival order must not become turn order.
{
  let state = createState('marble', 3, 3);
  state = joinState(state, 'p3', 'gold');
  state = joinState(state, 'p2', 'blue');
  assert.deepEqual(state.players.map(player => player.seat), ['p1', 'p2', 'p3']);
  assert.equal(state.turnSeat, 'p1');
  assert.equal(state.turnIndex, 0);
}

// A seat cannot claim a color other than its topology reservation.
assert.throws(
  () => joinState(createState('marble', 2, 3), 'p2', 'gold'),
  /seat_color_mismatch/,
);

// Round starters rotate once through canonical seat order and wrap.
{
  let state = createState('marble', 3, 3);
  state = joinState(state, 'p2', 'blue');
  state = joinState(state, 'p3', 'gold');
  const expected = ['p1', 'p2', 'p3', 'p1'];
  assert.equal(state.roundStarterSeat, expected[0]);
  for (let index = 1; index < expected.length; index += 1) {
    state = {
      ...state,
      status: 'finished',
      draw: true,
      winner: null,
      matchComplete: false,
      rematch: Object.fromEntries(state.players.map(player => [player.seat, false])),
    };
    state = advanceRoundState(state, 'p1');
    assert.equal(state.roundStarterSeat, expected[index]);
    assert.equal(state.turnSeat, expected[index]);
  }
}

// If p2 has no legal move but p1 still does, the scan wraps back to p1.
{
  let state = createState('marble', 2, 3);
  state = joinState(state, 'p2', 'blue');
  for (const cell of [0, 1, 2]) {
    for (const size of ['small', 'medium', 'large']) state.board[String(cell)][size] = 'blue';
  }
  const handoff = nextPlayableHandoff(state, 'p1');
  assert.equal(handoff.seat, 'p1');
  assert.deepEqual(handoff.skippedSeats, ['p2']);

  state = applyMove(state, 'p1', { cell: 3, size: 'small' });
  assert.equal(state.status, 'playing');
  assert.equal(state.turnSeat, 'p1');
  assert.deepEqual(state.skippedSeats, ['p2']);
  assert.deepEqual(state.lastHandoff, {
    fromSeat: 'p1',
    toSeat: 'p1',
    skippedSeats: ['p2'],
    reason: 'no-legal-move-skip',
  });
}

// Draw is possible only after the full ring has zero legal moves.
{
  let state = createState('marble', 2, 3);
  state = joinState(state, 'p2', 'blue');
  for (const cell of [0, 1, 2]) {
    for (const size of ['small', 'medium', 'large']) state.board[String(cell)][size] = 'blue';
  }
  for (const cell of [3, 4, 5]) {
    for (const size of ['small', 'medium', 'large']) state.board[String(cell)][size] = 'marble';
  }
  const handoff = nextPlayableHandoff(state, 'p1');
  assert.equal(handoff.seat, null);
  assert.deepEqual(handoff.skippedSeats, ['p2', 'p1']);
}

console.log('THREEJS_SEAT_TURN_CONTRACT_OK');
