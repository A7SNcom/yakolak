import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  AUTHORITATIVE_API,
  AUTHORITATIVE_ROOM_ID_PATTERN,
  MUTATION_ID_PATTERN,
  SEAT_CREDENTIAL_PATTERN,
} from '../backend/cloudflare/src/authoritative-api.js';
import {
  AUTHORITATIVE_STORE_INTERFACE_VERSION,
  assertAuthoritativeStore,
  createInMemoryAuthoritativeStore,
  createTursoAuthoritativeStore,
} from '../backend/cloudflare/src/authoritative-store.js';
import { createWorker, __testing } from '../backend/cloudflare/src/worker.js';
import { emptyBoard } from '../web/app/shared/rules.js';

const PAGES_ORIGIN = 'https://a7sncom.github.io';
const P1_CREDENTIAL = 'p1_authority_credential_000000000001';
const P2_CREDENTIAL = 'p2_authority_credential_000000000002';
const TRACE_ID = '0123456789abcdef0123456789abcdef';
const REQUEST_ID = 'threejs062-request-0001';

function baseState() {
  return {
    protocol: 5,
    status: 'playing',
    targetPlayers: 2,
    targetRounds: 3,
    winsToMatch: 3,
    players: [
      { seat: 'p1', color: 'marble' },
      { seat: 'p2', color: 'blue' },
    ],
    turnIndex: 0,
    board: emptyBoard(),
    round: 1,
    completedRounds: 0,
    scores: { p1: 0, p2: 0 },
    winner: null,
    draw: false,
    lastMove: null,
    moveNumber: 0,
    matchComplete: false,
    matchWinner: null,
    matchWinners: [],
    rematch: { p1: false, p2: false },
    skippedSeat: null,
  };
}

function workerEnv() {
  return {
    CF_VERSION_METADATA: {
      id: 'worker-version-threejs062',
      tag: 'contract',
      timestamp: '2026-08-20T00:00:00.000Z',
    },
  };
}

async function memoryHarness() {
  const p1Hash = await __testing.sha256Hex(P1_CREDENTIAL);
  const p2Hash = await __testing.sha256Hex(P2_CREDENTIAL);
  const store = createInMemoryAuthoritativeStore({
    authoritativeRooms: [{
      roomId: '54',
      revision: 7,
      state: baseState(),
      seats: [
        { seatId: 'p1', credentialHash: p1Hash, credentialGeneration: 3 },
        { seatId: 'p2', credentialHash: p2Hash, credentialGeneration: 2 },
      ],
    }],
  });
  const worker = createWorker({
    createStore: () => store,
    randomUUID: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  });
  return { store, worker, env: workerEnv() };
}

function headers(credential = null) {
  const value = {
    origin: PAGES_ORIGIN,
    'x-request-id': REQUEST_ID,
    'x-trace-id': TRACE_ID,
  };
  if (credential) value.authorization = `Bearer ${credential}`;
  return value;
}

async function body(response) {
  const value = await response.json();
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('access-control-allow-origin'), PAGES_ORIGIN);
  return value;
}

function assertLockedCompatibility(value) {
  assert.equal(value.compatibility.protocol.id, 'yakolak-online-room');
  assert.equal(value.compatibility.protocol.version, '1');
  assert.equal(value.compatibility.capabilities.id, 'yakolak-online-room-capabilities-v1');
  assert.deepEqual(value.compatibility.capabilities.names, [
    'health.compatibility.v1',
    'room-probe.read.v1',
    'room-probe.write.v1',
  ]);
  assert.equal(value.compatibility.turso.id, 'yakolak-pages005-room-probe');
  assert.equal(value.compatibility.turso.version, 1);
}

test('THREEJS-062 locks one versioned API/capability/store identity without changing PAGES-005 identity', async () => {
  assert.equal(AUTHORITATIVE_API.schema, 'yakolak.authoritative-api/v1');
  assert.equal(AUTHORITATIVE_API.version, 1);
  assert.equal(AUTHORITATIVE_API.routePrefix, '/v1');
  assert.equal(AUTHORITATIVE_API.protocol.id, 'yakolak-online-room');
  assert.equal(AUTHORITATIVE_API.protocol.version, '1');
  assert.equal(AUTHORITATIVE_API.capabilities.id, 'yakolak-authoritative-api-capabilities-v1');
  assert.deepEqual(AUTHORITATIVE_API.capabilities.names, [
    'request-trace-envelope.v1',
    'seat-bearer-auth-framing.v1',
    'room-snapshot-envelope.v1',
    'room-mutation-envelope.v1',
    'shared-transition.move.v1',
    'authoritative-store-interface.v1',
  ]);
  assert.equal(AUTHORITATIVE_STORE_INTERFACE_VERSION, 1);
  assert.equal(AUTHORITATIVE_ROOM_ID_PATTERN.test('54'), true);
  assert.equal(AUTHORITATIVE_ROOM_ID_PATTERN.test('p1'), false);
  assert.equal(SEAT_CREDENTIAL_PATTERN.test(P1_CREDENTIAL), true);
  assert.equal(MUTATION_ID_PATTERN.test('m'.repeat(32)), true);

  const { worker, env } = await memoryHarness();
  const response = await worker.fetch(new Request('https://worker.invalid/v1/health', { headers: headers() }), env);
  assert.equal(response.status, 200);
  const value = await body(response);
  assert.equal(value.ok, true);
  assertLockedCompatibility(value);
  assert.equal(value.authoritativeApi.store.interfaceVersion, 1);
  assert.equal(value.authoritativeApi.store.mode, 'memory-contract');
  assert.equal(value.authoritativeApi.store.authoritativeRead, true);
  assert.equal(value.authoritativeApi.store.authoritativeMutation, true);
  assert.equal(value.authoritativeApi.store.invitationLookup, true);
  assert.equal(value.authoritativeApi.store.transactionalAuthority, true);
  assert.equal(value.authoritativeApi.store.durableMutationReceipts, false);
  assert.equal(value.request.requestId, REQUEST_ID);
  assert.equal(value.request.traceId, TRACE_ID);
  assert.equal(response.headers.get('x-request-id'), REQUEST_ID);
  assert.equal(response.headers.get('x-trace-id'), TRACE_ID);
});

test('PAGES-005 probe routes still use the same store object and locked compatibility identity', async () => {
  const { worker, env } = await memoryHarness();
  const roomId = 'p005-0123456789abcdef0123456789abcdef';
  const payload = { probe: 'PAGES-005-preserved', values: [3, 5] };
  const write = await worker.fetch(new Request('https://worker.invalid/__pages005/rooms', {
    method: 'POST',
    headers: { ...headers(), 'content-type': 'application/json' },
    body: JSON.stringify({ roomId, payload }),
  }), env);
  assert.equal(write.status, 201);
  const written = await body(write);
  assert.equal(written.room.roomId, roomId);
  assert.deepEqual(written.room.payload, payload);
  assertLockedCompatibility(written);

  const read = await worker.fetch(new Request(`https://worker.invalid/__pages005/rooms/${roomId}`, {
    headers: headers(),
  }), env);
  assert.equal(read.status, 200);
  const fetched = await body(read);
  assert.deepEqual(fetched.room.payload, payload);
  assert.equal(fetched.room.integrity, written.room.integrity);
});

test('authenticated snapshot derives seat server-side from hashed bearer and never returns the bearer', async () => {
  const { worker, env } = await memoryHarness();
  const response = await worker.fetch(new Request('https://worker.invalid/v1/rooms/54/snapshot', {
    headers: headers(P1_CREDENTIAL),
  }), env);
  assert.equal(response.status, 200);
  const value = await body(response);
  assert.equal(value.actor.seatId, 'p1');
  assert.equal(value.actor.credentialGeneration, 3);
  assert.equal(value.snapshot.roomId, '54');
  assert.equal(value.snapshot.revision, 7);
  assert.equal(value.snapshot.state.turnIndex, 0);
  assertLockedCompatibility(value);
  assert.equal(JSON.stringify(value).includes(P1_CREDENTIAL), false);

  const missing = await worker.fetch(new Request('https://worker.invalid/v1/rooms/54/snapshot', {
    headers: headers(),
  }), env);
  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).error, 'seat_credential_required');

  const rejected = await worker.fetch(new Request('https://worker.invalid/v1/rooms/54/snapshot', {
    headers: headers('wrong_credential_00000000000000000000'),
  }), env);
  assert.equal(rejected.status, 401);
  assert.equal((await rejected.json()).error, 'seat_credential_rejected');
});

test('move mutation is shared-transition + CAS/idempotency framed and never accepts client seat authority', async () => {
  const { worker, env } = await memoryHarness();
  const mutationId = 'm'.repeat(32);
  const requestPayload = {
    mutationId,
    expectedRevision: 7,
    action: 'move',
    payload: { cell: 0, size: 'small' },
  };

  const commit = await worker.fetch(new Request('https://worker.invalid/v1/rooms/54/mutations', {
    method: 'POST',
    headers: { ...headers(P1_CREDENTIAL), 'content-type': 'application/json' },
    body: JSON.stringify(requestPayload),
  }), env);
  assert.equal(commit.status, 200);
  const committed = await body(commit);
  assert.equal(committed.mutation.status, 'committed');
  assert.deepEqual(committed.mutation.receipt, {
    mutationId,
    action: 'move',
    actorSeatId: 'p1',
    revision: 8,
  });
  assert.equal(committed.snapshot.revision, 8);
  assert.equal(committed.snapshot.state.turnIndex, 1);
  assert.deepEqual(committed.snapshot.state.lastMove, { cell: 0, size: 'small', color: 'marble', seat: 'p1' });
  assert.equal(committed.snapshot.state.board['0'].small, 'marble');

  const duplicate = await worker.fetch(new Request('https://worker.invalid/v1/rooms/54/mutations', {
    method: 'POST',
    headers: { ...headers(P1_CREDENTIAL), 'content-type': 'application/json' },
    body: JSON.stringify(requestPayload),
  }), env);
  assert.equal(duplicate.status, 200);
  const replay = await body(duplicate);
  assert.equal(replay.mutation.status, 'duplicate');
  assert.deepEqual(replay.mutation.receipt, committed.mutation.receipt);
  assert.equal(replay.snapshot.revision, 8, 'duplicate must not advance authority again');
  assert.equal(replay.snapshot.state.moveNumber, 1, 'duplicate must not rerun shared transition');

  const reused = await worker.fetch(new Request('https://worker.invalid/v1/rooms/54/mutations', {
    method: 'POST',
    headers: { ...headers(P1_CREDENTIAL), 'content-type': 'application/json' },
    body: JSON.stringify({ ...requestPayload, payload: { cell: 1, size: 'small' } }),
  }), env);
  assert.equal(reused.status, 409);
  assert.equal((await reused.json()).error, 'mutation_id_reused');

  const stale = await worker.fetch(new Request('https://worker.invalid/v1/rooms/54/mutations', {
    method: 'POST',
    headers: { ...headers(P2_CREDENTIAL), 'content-type': 'application/json' },
    body: JSON.stringify({
      mutationId: 'n'.repeat(32),
      expectedRevision: 7,
      action: 'move',
      payload: { cell: 1, size: 'small' },
    }),
  }), env);
  assert.equal(stale.status, 409);
  const staleBody = await stale.json();
  assert.equal(staleBody.error, 'revision_conflict');
  assert.equal(staleBody.errorDetail.details.currentRevision, 8);
  assert.equal(staleBody.errorDetail.retryable, true);

  const injectedSeat = await worker.fetch(new Request('https://worker.invalid/v1/rooms/54/mutations', {
    method: 'POST',
    headers: { ...headers(P2_CREDENTIAL), 'content-type': 'application/json' },
    body: JSON.stringify({
      mutationId: 'o'.repeat(32),
      expectedRevision: 8,
      action: 'move',
      payload: { cell: 1, size: 'small' },
      seatId: 'p1',
    }),
  }), env);
  assert.equal(injectedSeat.status, 400);
  assert.equal((await injectedSeat.json()).error, 'invalid_mutation_envelope');
});

test('current Turso adapter is explicitly probe-only and fails authoritative calls closed until THREEJS-063', async () => {
  const store = createTursoAuthoritativeStore({
    TURSO_DATABASE_URL: 'libsql://example.invalid',
    TURSO_AUTH_TOKEN: 'test-only-not-a-live-secret',
  });
  assertAuthoritativeStore(store);
  assert.deepEqual(store.getCapabilities(), {
    interfaceVersion: 1,
    mode: 'turso-pages005-probe-only',
    authoritativeRead: false,
    authoritativeMutation: false,
    invitationLookup: false,
    transactionalAuthority: false,
    durableMutationReceipts: false,
  });
  await assert.rejects(store.authorizeSeat({ roomId: '54', credentialHash: 'a'.repeat(64) }), /authoritative_store_unavailable/);
  await assert.rejects(store.lookupInvitation({ locator: '42' }), /authoritative_store_unavailable/);
  await assert.rejects(store.transactAuthority({}), /authoritative_store_unavailable/);
  await assert.rejects(store.commitMutation({}), /authoritative_store_unavailable/);
});

test('CORS, bounded parsing, normalized errors and source ownership preserve PAGES-006/THREEJS-063 boundaries', async () => {
  const { worker, env } = await memoryHarness();
  const foreign = await worker.fetch(new Request('https://worker.invalid/v1/health', {
    headers: { origin: 'https://evil.example' },
  }), env);
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get('access-control-allow-origin'), null);
  const foreignBody = await foreign.json();
  assert.equal(foreignBody.error, 'origin_not_allowed');
  assert.equal(foreignBody.errorDetail.code, 'origin_not_allowed');

  const oversized = await worker.fetch(new Request('https://worker.invalid/v1/rooms/54/mutations', {
    method: 'POST',
    headers: { ...headers(P1_CREDENTIAL), 'content-type': 'application/json' },
    body: JSON.stringify({ padding: 'x'.repeat(__testing.MAX_BODY_BYTES + 1) }),
  }), env);
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error, 'payload_too_large');

  const workerSource = await readFile(new URL('../backend/cloudflare/src/worker.js', import.meta.url), 'utf8');
  const storeSource = await readFile(new URL('../backend/cloudflare/src/authoritative-store.js', import.meta.url), 'utf8');
  const apiSource = await readFile(new URL('../backend/cloudflare/src/authoritative-api.js', import.meta.url), 'utf8');
  assert.doesNotMatch(workerSource, /CREATE TABLE|INSERT INTO|SELECT .* FROM|DELETE FROM/i, 'route handlers must contain no Turso SQL');
  assert.match(storeSource, /THREEJS-063 owns the real Turso authoritative schema/);
  assert.match(storeSource, /authoritative_store_unavailable/);
  assert.match(storeSource, /lookupInvitation/);
  assert.match(storeSource, /transactAuthority/);
  assert.match(apiSource, /shared\/transitions\.js/);
  assert.doesNotMatch(apiSource, /function\s+applyMoveTransition|function\s+placePiece|function\s+winningPatterns/);
  assert.doesNotMatch(workerSource, /console\.(?:log|error)\([^\n]*(authorization|credential)/i, 'credentials must never enter logs');
  assert.doesNotMatch(workerSource, /logError\([^\n]*error\?\.message/, 'raw backend error messages must never reach logs');
  assert.match(workerSource, /logError\('request_failed', normalized\.code/);
});
