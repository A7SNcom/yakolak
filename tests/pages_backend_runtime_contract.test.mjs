import assert from 'node:assert/strict';
import test from 'node:test';
import { createInMemoryAuthoritativeStore } from '../backend/cloudflare/src/authoritative-store.js';
import { createWorker, __testing } from '../backend/cloudflare/src/worker.js';

function createMemoryStore() {
  return createInMemoryAuthoritativeStore();
}

function workerEnv() {
  return {
    CF_VERSION_METADATA: {
      id: 'worker-version-test',
      tag: 'test',
      timestamp: '2026-08-18T00:00:00.000Z',
    },
  };
}

function assertCompatibility(body) {
  assert.equal(body.compatibility.protocol.id, 'yakolak-online-room');
  assert.equal(body.compatibility.protocol.version, '1');
  assert.equal(body.compatibility.capabilities.id, 'yakolak-online-room-capabilities-v1');
  assert.deepEqual(body.compatibility.capabilities.names, [
    'health.compatibility.v1',
    'room-probe.read.v1',
    'room-probe.write.v1',
  ]);
  assert.equal(body.compatibility.turso.id, 'yakolak-pages005-room-probe');
  assert.equal(body.compatibility.turso.version, 1);
  assert.equal(body.compatibility.turso.migrationPolicy, 'expand-contract-forward-only');
  assert.equal(body.compatibility.turso.dataRollbackRequired, false);
  assert.equal(body.compatibility.worker.versionId, 'worker-version-test');
}

test('PAGES-005 worker imports shared rules and uses the locked Pages origin', async () => {
  assert.equal(__testing.PAGES_ORIGIN, 'https://a7sncom.github.io');
  assert.equal(__testing.isAllowedOrigin('https://a7sncom.github.io'), true);
  assert.equal(__testing.isAllowedOrigin('https://example.com'), false);
  assert.match(__testing.createRoomId(), __testing.ROOM_ID_PATTERN);
  assert.match(await __testing.sha256Hex('yakolak'), /^[a-f0-9]{64}$/);
});

test('PAGES-015 health exposes protocol/capability/Turso/Worker identity with Pages CORS', async () => {
  const worker = createWorker({ createStore: () => createMemoryStore() });
  const response = await worker.fetch(new Request('https://worker.invalid/health', {
    headers: { origin: 'https://a7sncom.github.io' },
  }), workerEnv());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://a7sncom.github.io');
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
  const body = await response.json();
  assert.equal(body.ok, true);
  assertCompatibility(body);
  assert.equal(body.authoritativeApi.store.mode, 'memory-contract');
});

test('PAGES-005 HTTP room write/read round trip preserves payload and snapshot identity', async () => {
  const store = createMemoryStore();
  const worker = createWorker({ createStore: () => store });
  const roomId = 'p005-0123456789abcdef0123456789abcdef';
  const payload = { probe: 'PAGES-005', version: 1, values: [3, 5] };
  const env = workerEnv();

  const write = await worker.fetch(new Request('https://worker.invalid/__pages005/rooms', {
    method: 'POST',
    headers: {
      origin: 'https://a7sncom.github.io',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ roomId, payload }),
  }), env);
  assert.equal(write.status, 201);
  const written = await write.json();
  assert.equal(written.ok, true);
  assert.equal(written.room.roomId, roomId);
  assert.deepEqual(written.room.payload, payload);
  assertCompatibility(written);

  const read = await worker.fetch(new Request(`https://worker.invalid/__pages005/rooms/${roomId}`, {
    headers: { origin: 'https://a7sncom.github.io' },
  }), env);
  assert.equal(read.status, 200);
  const fetched = await read.json();
  assert.equal(fetched.ok, true);
  assert.equal(fetched.room.roomId, roomId);
  assert.deepEqual(fetched.room.payload, payload);
  assert.equal(fetched.room.integrity, written.room.integrity);
  assertCompatibility(fetched);
});

test('PAGES-005 rejects foreign browser origins', async () => {
  const worker = createWorker({ createStore: () => createMemoryStore() });
  const response = await worker.fetch(new Request('https://worker.invalid/health', {
    headers: { origin: 'https://evil.example' },
  }), workerEnv());
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'origin_not_allowed');
});

test('PAGES-005 normalizes public HTTP errors without leaking internal failures', async () => {
  const worker = createWorker({ createStore: () => createMemoryStore() });
  const env = workerEnv();
  const origin = 'https://a7sncom.github.io';

  const invalidPayload = await worker.fetch(new Request('https://worker.invalid/__pages005/rooms', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: '{',
  }), env);
  assert.equal(invalidPayload.status, 400);
  assert.equal((await invalidPayload.json()).error, 'invalid_payload');

  const missingRoom = await worker.fetch(new Request(
    'https://worker.invalid/__pages005/rooms/p005-ffffffffffffffffffffffffffffffff',
    { headers: { origin } },
  ), env);
  assert.equal(missingRoom.status, 404);
  assert.equal((await missingRoom.json()).error, 'room_not_found');

  const oversizedPayload = await worker.fetch(new Request('https://worker.invalid/__pages005/rooms', {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      'content-length': String(__testing.MAX_BODY_BYTES + 1),
    },
    body: '{}',
  }), env);
  assert.equal(oversizedPayload.status, 413);
  assert.equal((await oversizedPayload.json()).error, 'payload_too_large');

  const failingWorker = createWorker({
    createStore: () => {
      throw new Error('sensitive_internal_failure');
    },
  });
  const internalFailure = await failingWorker.fetch(new Request('https://worker.invalid/health', {
    headers: { origin },
  }), env);
  assert.equal(internalFailure.status, 500);
  const internalBody = await internalFailure.json();
  assert.equal(internalBody.error, 'online_server_error');
  assert.equal(JSON.stringify(internalBody).includes('sensitive_internal_failure'), false);
});
