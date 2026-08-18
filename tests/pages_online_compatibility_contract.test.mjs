import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EXPECTED_ONLINE_PROTOCOL,
  REQUIRED_ONLINE_CAPABILITIES,
  createOnlineCompatibilityGate,
  validateOnlineCompatibility,
} from '../web/app/session/online-compatibility.js';
import { createCanonicalOnlineSession } from '../web/app/session/canonical-online-session.js';
import {
  ONLINE_CAPABILITIES,
  ONLINE_PROTOCOL,
  TURSO_SCHEMA,
  compatibilityIdentity,
} from '../backend/cloudflare/src/compatibility.js';

function liveIdentity({ protocolVersion = '1', workerVersionId = 'worker-active-v1' } = {}) {
  return {
    protocol: { id: ONLINE_PROTOCOL.id, version: protocolVersion },
    capabilities: { id: ONLINE_CAPABILITIES.id, names: [...ONLINE_CAPABILITIES.names] },
    turso: { ...TURSO_SCHEMA },
    worker: {
      provider: 'cloudflare-workers',
      versionId: workerVersionId,
      versionTag: null,
      versionTimestamp: '2026-08-18T00:00:00.000Z',
    },
  };
}

test('PAGES-015 browser and Worker compatibility identities stay aligned', () => {
  assert.deepEqual(EXPECTED_ONLINE_PROTOCOL, ONLINE_PROTOCOL);
  assert.equal(REQUIRED_ONLINE_CAPABILITIES.id, ONLINE_CAPABILITIES.id);
  assert.deepEqual([...REQUIRED_ONLINE_CAPABILITIES.names], [...ONLINE_CAPABILITIES.names]);
  assert.equal(TURSO_SCHEMA.id, 'yakolak-pages005-room-probe');
  assert.equal(TURSO_SCHEMA.version, 1);

  const identity = compatibilityIdentity({
    CF_VERSION_METADATA: { id: 'worker-v1', tag: 'stable', timestamp: '2026-08-18T00:00:00.000Z' },
  });
  const validated = validateOnlineCompatibility(identity, { requireWorkerVersion: true });
  assert.equal(validated.workerVersionId, 'worker-v1');
});

test('PAGES-015 online mutation fails closed before transport while compatibility is unverified', async () => {
  let submitCalls = 0;
  const session = createCanonicalOnlineSession({
    roomId: 'room-1',
    seatId: 'seat-1',
    playerId: 'player-1',
    submitMove: async () => {
      submitCalls += 1;
      return { ok: true };
    },
  });

  await assert.rejects(
    session.submitMoveIntent({ moveId: 'move-1', cell: 3 }),
    (error) => error?.code === 'online_compatibility_unverified',
  );
  assert.equal(submitCalls, 0);
  assert.deepEqual(session.snapshot().submittedMoveIds, []);
});

test('PAGES-015 compatible health unlocks mutation and compatible snapshot keeps it unlocked', async () => {
  const identity = liveIdentity();
  const gate = createOnlineCompatibilityGate({
    apiOrigin: 'https://api.example.test',
    fetchImpl: async () => new Response(JSON.stringify({
      ok: true,
      compatibility: identity,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });

  await gate.refresh();
  assert.equal(gate.snapshot().compatible, true);

  let submitCalls = 0;
  const session = createCanonicalOnlineSession({
    roomId: 'room-1',
    seatId: 'seat-1',
    playerId: 'player-1',
    compatibilityGate: gate,
    submitMove: async () => {
      submitCalls += 1;
      return { ok: true, compatibility: identity };
    },
  });

  const result = await session.submitMoveIntent({ moveId: 'move-1', cell: 3 });
  assert.equal(result.submitted, true);
  assert.equal(submitCalls, 1);
  assert.equal(session.snapshot().onlineCompatibility.compatible, true);
});

test('PAGES-015 incompatible health never reaches mutation transport', async () => {
  const gate = createOnlineCompatibilityGate({
    apiOrigin: 'https://api.example.test',
    fetchImpl: async () => new Response(JSON.stringify({
      ok: true,
      compatibility: liveIdentity({ protocolVersion: '999' }),
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });

  await assert.rejects(gate.refresh(), (error) => error?.code === 'online_protocol_incompatible');

  let submitCalls = 0;
  const session = createCanonicalOnlineSession({
    roomId: 'room-1',
    seatId: 'seat-1',
    playerId: 'player-1',
    compatibilityGate: gate,
    submitMove: async () => {
      submitCalls += 1;
    },
  });

  await assert.rejects(
    session.submitMoveIntent({ moveId: 'move-2', cell: 5 }),
    (error) => error?.code === 'online_protocol_incompatible',
  );
  assert.equal(submitCalls, 0);
  assert.deepEqual(session.snapshot().submittedMoveIds, []);
});

test('PAGES-015 a changed snapshot identity closes the gate for subsequent mutations', async () => {
  const identity = liveIdentity();
  const gate = createOnlineCompatibilityGate({
    apiOrigin: 'https://api.example.test',
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, compatibility: identity }), { status: 200 }),
  });
  await gate.refresh();

  assert.throws(
    () => gate.observeSnapshot({ compatibility: liveIdentity({ protocolVersion: '2' }) }),
    (error) => error?.code === 'online_protocol_incompatible',
  );
  assert.equal(gate.snapshot().compatible, false);
});
