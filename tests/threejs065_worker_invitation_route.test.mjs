import assert from 'node:assert/strict';
import test from 'node:test';

import { createInMemoryAuthoritativeStore } from '../backend/cloudflare/src/authoritative-store.js';
import { createWorker, __testing } from '../backend/cloudflare/src/worker.js';

const PAGES_ORIGIN = 'https://a7sncom.github.io';
const HOST_CREDENTIAL = 'threejs065_host_credential_00000001';

function configuredState() {
  return {
    protocol: 5,
    status: 'waiting',
    lobbyGeneration: 1,
    preferredColor: 'green',
    targetPlayers: 3,
    targetRounds: 3,
    winsToMatch: 3,
    players: [
      { seat: 'front', color: 'green', type: 'host' },
      { seat: 'right', color: 'marble', type: 'online' },
      { seat: 'back', color: 'blue', type: 'computer' },
    ],
    turnIndex: 0,
    board: Array.from({ length: 9 }, () => ({ small: null, medium: null, large: null })),
    round: 1,
    completedRounds: 0,
    scores: { front: 0, right: 0, back: 0 },
    winner: null,
    draw: false,
    lastMove: null,
    moveNumber: 0,
    matchComplete: false,
    matchWinner: null,
    matchWinners: [],
    rematch: { front: false, right: false, back: false },
    skippedSeat: null,
  };
}

async function harness() {
  const credentialHash = await __testing.sha256Hex(HOST_CREDENTIAL);
  const store = createInMemoryAuthoritativeStore({
    authoritativeRooms: [{
      roomId: '54',
      revision: 4,
      state: configuredState(),
      seats: [{ seatId: 'front', credentialHash, credentialGeneration: 2 }],
    }],
    nowMs: () => 10_000,
    randomUint32: () => 0,
  });
  const worker = createWorker({
    createStore: () => store,
    randomUUID: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  });
  return { store, worker };
}

function mutationRequest(body) {
  return new Request('https://worker.invalid/v1/rooms/54/mutations', {
    method: 'POST',
    headers: {
      origin: PAGES_ORIGIN,
      authorization: `Bearer ${HOST_CREDENTIAL}`,
      'content-type': 'application/json',
      'x-request-id': 'threejs065-request-0001',
      'x-trace-id': '0123456789abcdef0123456789abcdef',
    },
    body: JSON.stringify(body),
  });
}

test('THREEJS-065 Worker allocates one exact Online-seat invitation and public code resolution exposes preview only', async () => {
  const { worker } = await harness();
  const mutationId = 'threejs065_worker_allocate_0000001';
  const allocate = await worker.fetch(mutationRequest({
    mutationId,
    expectedRevision: 4,
    action: 'allocate-invitation',
    payload: { seatId: 'right' },
  }), {});
  const allocated = await allocate.json();
  assert.equal(allocate.status, 200);
  assert.equal(allocated.mutation.status, 'committed');
  assert.equal(allocated.mutation.receipt.action, 'allocate-invitation');
  assert.equal(allocated.snapshot.revision, 5);
  assert.deepEqual(allocated.invitation, {
    invitationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    locator: '00',
    roomId: '54',
    seatId: 'right',
    color: 'marble',
    lobbyGeneration: 1,
    state: 'open',
    expiresAtMs: 610000,
  });

  const resolved = await worker.fetch(new Request('https://worker.invalid/v1/invitations/00', {
    method: 'GET',
    headers: { origin: PAGES_ORIGIN },
  }), {});
  const preview = await resolved.json();
  assert.equal(resolved.status, 200);
  assert.deepEqual(preview.invitation, allocated.invitation);
  assert.equal(JSON.stringify(preview).includes(HOST_CREDENTIAL), false);
  assert.equal(Object.hasOwn(preview.invitation, 'credential'), false);
  assert.equal(Object.hasOwn(preview.invitation, 'claimVerifier'), false);

  const duplicate = await worker.fetch(mutationRequest({
    mutationId,
    expectedRevision: 4,
    action: 'allocate-invitation',
    payload: { seatId: 'right' },
  }), {});
  const duplicateValue = await duplicate.json();
  assert.equal(duplicate.status, 200);
  assert.equal(duplicateValue.mutation.status, 'duplicate');
  assert.deepEqual(duplicateValue.invitation, allocated.invitation);
});

test('THREEJS-065 revoke releases public code resolution while leaving claim/credential semantics unimplemented', async () => {
  const { worker } = await harness();
  const allocatedResponse = await worker.fetch(mutationRequest({
    mutationId: 'threejs065_worker_allocate_0000002',
    expectedRevision: 4,
    action: 'allocate-invitation',
    payload: { seatId: 'right' },
  }), {});
  const allocated = await allocatedResponse.json();

  const revoke = await worker.fetch(mutationRequest({
    mutationId: 'threejs065_worker_revoke_00000001',
    expectedRevision: 5,
    action: 'revoke-invitation',
    payload: { invitationId: allocated.invitation.invitationId },
  }), {});
  const revoked = await revoke.json();
  assert.equal(revoke.status, 200);
  assert.equal(revoked.invitation.state, 'revoked');
  assert.equal(revoked.snapshot.revision, 6);

  const missing = await worker.fetch(new Request('https://worker.invalid/v1/invitations/00', {
    method: 'GET',
    headers: { origin: PAGES_ORIGIN },
  }), {});
  const missingValue = await missing.json();
  assert.equal(missing.status, 404);
  assert.equal(missingValue.error, 'invitation_not_found');
});

test('THREEJS-065 Worker refuses invitation allocation for Computer seats', async () => {
  const { worker } = await harness();
  const response = await worker.fetch(mutationRequest({
    mutationId: 'threejs065_worker_computer_0000001',
    expectedRevision: 4,
    action: 'allocate-invitation',
    payload: { seatId: 'back' },
  }), {});
  const value = await response.json();
  assert.equal(response.status, 409);
  assert.equal(value.error, 'invitation_online_seat_required');
});
