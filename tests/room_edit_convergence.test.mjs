import assert from 'node:assert/strict';
import { __testing } from '../api/rooms.js';

const { applyRoomEdit, createState, joinState, requireCurrentVersion } = __testing;

function canonicalRoom(store) {
  return { code: '15', version: store.version, ...structuredClone(store.state) };
}

function client(seat, store) {
  return { seat, room: canonicalRoom(store) };
}

function hydrate(target, storeOrRoom) {
  target.room = 'state' in storeOrRoom ? canonicalRoom(storeOrRoom) : structuredClone(storeOrRoom);
  return target;
}

function config(room) {
  return {
    version: room.version,
    status: room.status,
    targetPlayers: room.targetPlayers,
    targetRounds: room.targetRounds,
    winsToMatch: room.winsToMatch,
    players: room.players,
    turnIndex: room.turnIndex,
    board: room.board,
  };
}

function assertConverged(clients, store) {
  const expected = config(canonicalRoom(store));
  for (const current of clients) assert.deepEqual(config(current.room), expected);
}

function attemptEdit(store, actor, changes, expectedVersion = actor.room.version) {
  try {
    requireCurrentVersion(expectedVersion, store.version);
    const next = applyRoomEdit(store.state, actor.seat, changes);
    store.state = next;
    store.version += 1;
    const room = canonicalRoom(store);
    hydrate(actor, room);
    return { ok: true, room };
  } catch (error) {
    if (error?.message === 'version_conflict') {
      const room = canonicalRoom(store);
      hydrate(actor, room);
      return { ok: false, error: 'version_conflict', room };
    }
    return { ok: false, error: error?.message || 'unknown', room: canonicalRoom(store) };
  }
}

function acceptJoin(store, seat, color) {
  store.state = joinState(store.state, seat, color);
  store.version += 1;
  return canonicalRoom(store);
}

const store = { version: 1, state: createState('marble', 3, 3) };
acceptJoin(store, 'p2', 'blue');
const host = client('p1', store);
const guest = client('p2', store);
const observer = client('p3', store);
const clients = [host, guest, observer];

// Every currently editable field must converge from the canonical state.
for (const changes of [
  { color: 'gold' },
  { targetRounds: 5 },
  { targetPlayers: 4 },
]) {
  const result = attemptEdit(store, host, changes);
  assert.equal(result.ok, true);
  for (const current of clients) hydrate(current, result.room);
  assertConverged(clients, store);
}
assert.equal(store.state.players.find(player => player.seat === 'p1')?.color, 'gold');
assert.equal(store.state.targetRounds, 5);
assert.equal(store.state.winsToMatch, 5);
assert.equal(store.state.targetPlayers, 4);

// A non-host cannot mutate even an otherwise-safe field.
{
  const before = canonicalRoom(store);
  const rejected = attemptEdit(store, guest, { targetRounds: 3 });
  assert.deepEqual(rejected, { ok: false, error: 'unauthorized', room: before });
  assert.deepEqual(canonicalRoom(store), before);
}

// Unsafe fields remain structurally unchanged.
{
  const before = canonicalRoom(store);
  const rejected = attemptEdit(store, host, {
    status: 'playing',
    turnIndex: 2,
    board: { '0': { large: 'green' } },
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error, 'unsafe_room_edit');
  assert.deepEqual(canonicalRoom(store), before);
}

// Two host editors opened from the same room version: exactly one write wins.
// The stale write receives the canonical winner instead of silently overwriting it.
{
  const tabA = client('p1', store);
  const tabB = client('p1', store);
  const sharedVersion = store.version;

  const accepted = attemptEdit(store, tabA, { targetRounds: 3 }, sharedVersion);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.room.version, sharedVersion + 1);
  assert.equal(accepted.room.targetRounds, 3);

  const stale = attemptEdit(store, tabB, { color: 'green' }, sharedVersion);
  assert.equal(stale.ok, false);
  assert.equal(stale.error, 'version_conflict');
  assert.equal(stale.room.version, accepted.room.version);
  assert.equal(stale.room.targetRounds, 3);
  assert.equal(stale.room.players.find(player => player.seat === 'p1')?.color, 'gold');

  // Reopen on the returned canonical version, then the second edit may be accepted
  // without losing the already-accepted first edit.
  const reopened = attemptEdit(store, tabB, { color: 'green' }, tabB.room.version);
  assert.equal(reopened.ok, true);
  assert.equal(reopened.room.targetRounds, 3);
  assert.equal(reopened.room.players.find(player => player.seat === 'p1')?.color, 'green');

  for (const current of clients) hydrate(current, store);
  assertConverged(clients, store);
}

// Reconnect after an accepted edit hydrates exactly the canonical room/version.
{
  const staleGuest = client('p2', { version: store.version - 2, state: structuredClone(store.state) });
  hydrate(staleGuest, store);
  assert.deepEqual(config(staleGuest.room), config(canonicalRoom(store)));
}

// Cancel/back/close are local editor lifecycle actions: drafts never mutate room state.
// Reopening starts from the current canonical snapshot/version.
{
  const before = canonicalRoom(store);
  const localDraft = { color: 'marble', targetPlayers: 3, targetRounds: 5 };
  assert.notDeepEqual(localDraft, {
    color: before.players.find(player => player.seat === 'p1')?.color,
    targetPlayers: before.targetPlayers,
    targetRounds: before.targetRounds,
  });
  assert.deepEqual(canonicalRoom(store), before);
  const reopened = client('p1', store);
  assert.equal(reopened.room.version, before.version);
  assert.deepEqual(config(reopened.room), config(before));
}

// The edited room remains joinable and starts only through canonical joins.
// Accepted edits survive the waiting -> playing transition.
{
  const p3Room = acceptJoin(store, 'p3', 'gold');
  assert.equal(p3Room.status, 'waiting');
  const p4Room = acceptJoin(store, 'p4', 'marble');
  assert.equal(p4Room.status, 'playing');
  assert.equal(p4Room.targetPlayers, 4);
  assert.equal(p4Room.targetRounds, 3);
  assert.equal(p4Room.winsToMatch, 3);
  assert.equal(p4Room.players.find(player => player.seat === 'p1')?.color, 'green');
  assert.equal(p4Room.turnIndex, 0);
  assert.deepEqual(p4Room.board, createState('green', 4, 3).board);

  const all = [host, guest, observer, client('p4', store)];
  for (const current of all) hydrate(current, store);
  assertConverged(all, store);
}

console.log('YAKOLAK_ROOM_EDIT_CONVERGENCE_OK');
