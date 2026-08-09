import assert from 'node:assert/strict';
import { __testing } from '../api/rooms.js';

const {
  applyMove,
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

// A guest that disappears while a 3/4-player lobby is waiting must not reserve
// its seat/color indefinitely. The host is deliberately retained.
{
  let waiting = createState('marble', 4, 3);
  waiting = joinState(waiting, 'p2', 'blue');
  waiting = joinState(waiting, 'p3', 'gold');
  const cleaned = reconcilePresenceState(waiting, ['p1', 'p3']);
  assert.equal(cleaned.status, 'waiting');
  assert.deepEqual(cleaned.players.map(player => player.seat), ['p1', 'p3']);
  assert.equal(Object.hasOwn(cleaned.scores, 'p2'), false);
  assert.equal(Object.hasOwn(cleaned.rematch, 'p2'), false);
}

// Preview exposes only what joining actually needs. Do not leak player list.
{
  const state = twoPlayerRoom();
  const row = { room_code: '42', state_json: JSON.stringify(state) };
  const shown = preview(row);
  assert.equal(shown.code, '42');
  assert.equal(Object.hasOwn(shown, 'players'), false);
}

// Presence must never mutate an active turn. This reproduces the room-54 bug:
// after p1 moves, p2 owns the turn. Even if p2 appears stale, p1 cannot receive
// the turn again and cannot legally make a second consecutive move.
{
  let state = twoPlayerRoom();
  state = applyMove(state, 'p1', { cell: 4, size: 'medium' });
  assert.equal(state.turnIndex, 1);
  const reconciled = reconcilePresenceState(state, ['p1']);
  assert.equal(reconciled.turnIndex, 1);
  assert.equal(reconciled.skippedSeat, null);
  assert.throws(
    () => applyMove(reconciled, 'p1', { cell: 0, size: 'small' }),
    /not_your_turn/
  );
}

// Presence also cannot advance a finished round. Every player in the match must
// explicitly acknowledge the next round; connection freshness is not a vote.
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
  const unchanged = reconcilePresenceState(finished, ['p1']);
  assert.equal(unchanged.status, 'finished');
  assert.equal(unchanged.round, 1);

  const advanced = rematchState(unchanged, 'p2');
  assert.equal(advanced.status, 'playing');
  assert.equal(advanced.round, 2);
  assert.deepEqual(advanced.board['0'], {});

  const complete = { ...finished, matchComplete: true };
  assert.equal(reconcilePresenceState(complete, ['p1']).status, 'finished');
  const firstReplayVote = rematchState(complete, 'p1');
  assert.equal(firstReplayVote.status, 'finished');
  const replay = rematchState(firstReplayVote, 'p2');
  assert.equal(replay.status, 'playing');
  assert.equal(replay.round, 1);
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