import assert from 'node:assert/strict';
import { __testing } from '../api/rooms.js';

const {
  applyMove,
  applyRoomEdit,
  createState,
  joinState,
  leaveState,
  materializeUpdatedRow,
  preview,
  publicRoom,
  reconcilePresenceState,
  rematchState,
  requireCurrentVersion,
  seatOwnership,
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

// ROOM-EDIT-14: one valid host edit stays inside the existing waiting-room
// state model and updates only the explicitly safe settings.
{
  let waiting = createState('marble', 3, 3);
  waiting = joinState(waiting, 'p2', 'blue');
  const edited = applyRoomEdit(waiting, 'p1', { color: 'gold', targetPlayers: 4, targetRounds: 5 });
  assert.equal(edited.status, 'waiting');
  assert.equal(edited.targetPlayers, 4);
  assert.equal(edited.targetRounds, 5);
  assert.equal(edited.winsToMatch, 5);
  assert.deepEqual(edited.players, [{ seat: 'p1', color: 'gold' }, { seat: 'p2', color: 'blue' }]);
  assert.deepEqual(edited.board, waiting.board);
  assert.equal(edited.turnIndex, waiting.turnIndex);
}

// ROOM-EDIT-14: stale writes must fail against the room version the editor saw;
// the handler returns the latest canonical room for this same error.
{
  assert.equal(requireCurrentVersion(7, 7), 7);
  assert.throws(() => requireCurrentVersion(6, 7), /version_conflict/);
}

// ROOM-EDIT-14: an authenticated guest is still unauthorized to edit host room
// settings, regardless of which safe field it tries to change.
{
  const waiting = joinState(createState('marble', 3, 3), 'p2', 'blue');
  assert.throws(() => applyRoomEdit(waiting, 'p2', { targetRounds: 5 }), /unauthorized/);
}

// ROOM-EDIT-14: rule mutation is forbidden after the lobby lifecycle ends.
{
  const playing = twoPlayerRoom();
  assert.equal(playing.status, 'playing');
  assert.throws(() => applyRoomEdit(playing, 'p1', { targetRounds: 5 }), /room_edit_forbidden/);
}

// ROOM-EDIT-14: the allowlist is structural, not UI-only. A forged payload
// cannot mutate authoritative turn/board/status fields or collapse a waiting
// lobby into a playing match by setting targetPlayers to the occupied count.
{
  let waiting = createState('marble', 3, 3);
  waiting = joinState(waiting, 'p2', 'blue');
  assert.throws(() => applyRoomEdit(waiting, 'p1', { turnIndex: 1 }), /unsafe_room_edit/);
  assert.throws(() => applyRoomEdit(waiting, 'p1', { targetPlayers: 2 }), /unsafe_room_edit/);
  assert.throws(() => applyRoomEdit(waiting, 'p1', { color: 'blue' }), /color_taken/);
}

// Online seat ownership is one-to-one and independent from color/request ids:
// one credential cannot own two active seats, one seat cannot have two owners,
// and credentials for seats that already left are not part of active ownership.
{
  let state = createState('marble', 3, 3);
  state = joinState(state, 'p2', 'blue');
  const auth = [
    { seat: 'p1', hash: 'host-hash', joinKey: 'create-key' },
    { seat: 'p2', hash: 'guest-hash', joinKey: 'join-key-1' },
  ];
  const ownership = seatOwnership(state, [
    ...auth,
    { seat: 'p4', hash: 'stale-hash', joinKey: 'old-request' },
  ]);
  assert.equal(ownership.hashToSeat.get('guest-hash'), 'p2');
  assert.equal(ownership.seatToHash.get('p2'), 'guest-hash');
  assert.deepEqual(ownership.auth.map(entry => entry.seat), ['p1', 'p2']);

  const threePlayers = joinState(state, 'p3', 'gold');
  assert.throws(
    () => seatOwnership(threePlayers, [...auth, { seat: 'p3', hash: 'guest-hash', joinKey: 'join-key-2' }]),
    /identity_conflict/
  );
  assert.throws(
    () => seatOwnership(state, [...auth, { seat: 'p2', hash: 'other-owner', joinKey: 'join-key-2' }]),
    /identity_conflict/
  );
  assert.throws(() => joinState(state, 'p3', 'blue'), /color_taken/);
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

// Turn selection must never wrap all the way back to the player who just moved.
// If every other player has exhausted all legal pieces, the round ends instead
// of granting a second consecutive move to the current player.
{
  let state = twoPlayerRoom();
  state = {
    ...state,
    board: {
      '0': { small: 'blue' },
      '1': { small: 'blue' },
      '2': { small: 'blue' },
      '3': { medium: 'blue' },
      '4': { medium: 'blue' },
      '5': { medium: 'blue' },
      '6': { large: 'blue' },
      '7': { large: 'blue' },
      '8': { large: 'blue' },
    },
    turnIndex: 0,
  };
  const after = applyMove(state, 'p1', { cell: 0, size: 'medium' });
  assert.equal(after.status, 'finished');
  assert.equal(after.draw, true);
  assert.equal(after.lastMove?.seat, 'p1');
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