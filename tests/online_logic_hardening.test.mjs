import assert from 'node:assert/strict';
import { __testing } from '../api/rooms.js';

const {
  createState,
  joinState,
  leaveState,
  materializeUpdatedRow,
  preview,
  publicRoom,
  reconcilePresenceState,
  rematchState,
} = __testing;

function twoPlayerRoom() {
  return joinState(createState('marble', 2, 3), 'p2', 'blue');
}

// Turso rows can expose room_code as a non-enumerable property. The direct
// server response must preserve it without relying on {...row}.
{
  const state = twoPlayerRoom();
  const row = { version: 7, auth_json: '[]', state_json: JSON.stringify(state) };
  Object.defineProperty(row, 'room_code', { value: '64', enumerable: false });
  const updated = materializeUpdatedRow(row, state, 7, []);
  assert.equal(updated.room_code, '64');
  assert.equal(publicRoom(updated, state).code, '64');
}

// A guest leaving a waiting room must free only that seat, not destroy the
// host's room and invite.
{
  const waiting = joinState(createState('marble', 3, 3), 'p2', 'blue');
  const afterGuestLeave = leaveState(waiting, 'p2');
  assert.equal(afterGuestLeave.status, 'waiting');
  assert.deepEqual(afterGuestLeave.players.map(player => player.seat), ['p1']);
  assert.equal(afterGuestLeave.cancelledBy, null);
  assert.equal(leaveState(waiting, 'p1').status, 'cancelled');
}

// Preview exposes only what joining actually needs. Do not leak player list.
{
  const state = twoPlayerRoom();
  const row = { room_code: '42', state_json: JSON.stringify(state) };
  const shown = preview(row);
  assert.equal(shown.code, '42');
  assert.equal(Object.hasOwn(shown, 'players'), false);
}

// If the current player is stale but another player is alive, the room must
// not hang forever on the stale turn.
{
  const state = twoPlayerRoom();
  state.turnIndex = 1;
  const reconciled = reconcilePresenceState(state, ['p1']);
  assert.equal(reconciled.status, 'playing');
  assert.equal(reconciled.turnIndex, 0);
  assert.equal(reconciled.skippedSeat, 'p2');
}

// Non-final rounds can continue when the only connected player has already
// acknowledged the result. Match-complete replay remains explicit.
{
  let finished = twoPlayerRoom();
  finished = {
    ...finished,
    status: 'finished',
    round: 1,
    completedRounds: 1,
    rematch: { p1: true, p2: false },
    matchComplete: false,
  };
  const advanced = reconcilePresenceState(finished, ['p1']);
  assert.equal(advanced.status, 'playing');
  assert.equal(advanced.round, 2);
  assert.deepEqual(advanced.board['0'], {});

  const complete = { ...finished, matchComplete: true };
  assert.equal(reconcilePresenceState(complete, ['p1']).status, 'finished');
}

// Normal connected rematch semantics are unchanged.
{
  let state = twoPlayerRoom();
  state = { ...state, status: 'finished', rematch: { p1: false, p2: false } };
  state = rematchState(state, 'p1');
  assert.equal(state.status, 'finished');
  state = rematchState(state, 'p2');
  assert.equal(state.status, 'playing');
}

console.log('YAKOLAK_ONLINE_LOGIC_HARDENING_OK');