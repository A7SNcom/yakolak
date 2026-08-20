import assert from 'node:assert/strict';
import test from 'node:test';

import { createInMemoryAuthoritativeStore } from '../backend/cloudflare/src/authoritative-store.js';
import { createWorker, __testing } from '../backend/cloudflare/src/worker.js';
import { emptyBoard } from '../web/app/shared/rules.js';

const PAGES_ORIGIN = 'https://a7sncom.github.io';
const HOST_CREDENTIAL = 'green_host_credential_000000000000001';

function bootstrapState() {
  return {
    protocol: 5,
    status: 'waiting',
    lobbyGeneration: 0,
    preferredColor: null,
    targetPlayers: null,
    targetRounds: null,
    winsToMatch: null,
    players: [{ seat: 'front', color: 'green', type: 'host' }],
    turnIndex: 0,
    board: emptyBoard(),
    round: 1,
    completedRounds: 0,
    scores: { front: 0 },
    winner: null,
    draw: false,
    lastMove: null,
    moveNumber: 0,
    matchComplete: false,
    matchWinner: null,
    matchWinners: [],
    rematch: { front: false },
    skippedSeat: null,
  };
}

async function harness() {
  const credentialHash = await __testing.sha256Hex(HOST_CREDENTIAL);
  const store = createInMemoryAuthoritativeStore({
    authoritativeRooms: [{
      roomId: '54',
      revision: 4,
      state: bootstrapState(),
      seats: [{ seatId: 'front', credentialHash, credentialGeneration: 2 }],
    }],
  });
  return {
    store,
    worker: createWorker({
      createStore: () => store,
      randomUUID: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    }),
  };
}

function requestBody(mutationId, expectedRevision = 4) {
  return {
    mutationId,
    expectedRevision,
    action: 'configure-lobby',
    payload: {
      preferredColor: 'green',
      targetPlayers: 3,
      winsToMatch: 5,
      remainingSeatTypes: ['online', 'computer'],
    },
  };
}

function request(mutationId, expectedRevision = 4) {
  return new Request('https://worker.invalid/v1/rooms/54/mutations', {
    method: 'POST',
    headers: {
      origin: PAGES_ORIGIN,
      authorization: `Bearer ${HOST_CREDENTIAL}`,
      'content-type': 'application/json',
      'x-request-id': 'threejs064-request-0001',
      'x-trace-id': '0123456789abcdef0123456789abcdef',
    },
    body: JSON.stringify(requestBody(mutationId, expectedRevision)),
  });
}

test('THREEJS-064 Worker mutation route commits host-owned lobby configuration through the shared store transaction', async () => {
  const { worker } = await harness();
  const mutationId = 'configure_lobby_route_000000000001';
  const response = await worker.fetch(request(mutationId), {});
  const value = await response.json();
  assert.equal(response.status, 200);
  assert.equal(value.mutation.status, 'committed');
  assert.deepEqual(value.mutation.receipt, {
    mutationId,
    action: 'configure-lobby',
    actorSeatId: 'front',
    revision: 5,
  });
  assert.equal(value.snapshot.revision, 5);
  assert.equal(value.snapshot.state.preferredColor, 'green');
  assert.equal(value.snapshot.state.targetPlayers, 3);
  assert.equal(value.snapshot.state.winsToMatch, 5);
  assert.deepEqual(value.snapshot.state.players, [
    { seat: 'front', color: 'green', type: 'host' },
    { seat: 'right', color: 'marble', type: 'online' },
    { seat: 'back', color: 'blue', type: 'computer' },
  ]);
  assert.ok(value.authoritativeApi.capabilities.names.includes('authoritative-lobby-configuration.v1'));
});

test('THREEJS-064 Worker route replays duplicate config exactly once and leaves later edits to THREEJS-068', async () => {
  const { worker } = await harness();
  const mutationId = 'configure_lobby_route_000000000002';
  const first = await worker.fetch(request(mutationId), {});
  assert.equal(first.status, 200);
  const duplicate = await worker.fetch(request(mutationId), {});
  const duplicateValue = await duplicate.json();
  assert.equal(duplicate.status, 200);
  assert.equal(duplicateValue.mutation.status, 'duplicate');
  assert.equal(duplicateValue.snapshot.revision, 5);

  const edit = await worker.fetch(request('configure_lobby_route_000000000003', 5), {});
  const editValue = await edit.json();
  assert.equal(edit.status, 409);
  assert.equal(editValue.error, 'lobby_already_configured');
});
