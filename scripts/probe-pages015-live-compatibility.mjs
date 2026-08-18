#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  EXPECTED_ONLINE_PROTOCOL,
  REQUIRED_ONLINE_CAPABILITIES,
  validateOnlineCompatibility,
} from '../web/app/session/online-compatibility.js';

const apiOrigin = String(process.env.API_ORIGIN || '').replace(/\/$/, '');
const activeVersion = String(process.env.ACTIVE_WORKER_VERSION || '').trim();
const previousVersion = String(process.env.PREVIOUS_WORKER_VERSION || '').trim();
const evidencePath = String(process.env.PAGES015_EVIDENCE_PATH || 'pages015-live-evidence.json');

if (!/^https:\/\/[^/]+$/.test(apiOrigin)) throw new Error('PAGES-015 requires locked HTTPS API_ORIGIN');
if (!activeVersion || !previousVersion || activeVersion === previousVersion) {
  throw new Error('PAGES-015 requires distinct active and previous Worker version IDs');
}

const workerName = 'yakolak-room-api';
const pagesOrigin = 'https://a7sncom.github.io';

function overrideHeader(versionId) {
  return `${workerName}="${versionId}"`;
}

function headersFor(versionId, extra = {}) {
  return {
    origin: pagesOrigin,
    'cloudflare-workers-version-overrides': overrideHeader(versionId),
    ...extra,
  };
}

async function readJson(response, label) {
  const body = await response.json().catch(() => null);
  if (!body) throw new Error(`${label}: response was not JSON`);
  return body;
}

function assertCors(response, label) {
  if (response.headers.get('access-control-allow-origin') !== pagesOrigin) {
    throw new Error(`${label}: Pages CORS origin missing`);
  }
}

function assertIdentity(body, expectedVersion, label) {
  const validated = validateOnlineCompatibility(body?.compatibility, { requireWorkerVersion: true });
  if (validated.workerVersionId !== expectedVersion) {
    throw new Error(`${label}: requested Worker ${expectedVersion}, observed ${validated.workerVersionId}`);
  }
  return validated;
}

async function probeVersion(role, versionId) {
  const healthResponse = await fetch(`${apiOrigin}/health?pages015=${crypto.randomUUID()}`, {
    headers: headersFor(versionId, { 'cache-control': 'no-cache' }),
  });
  assertCors(healthResponse, `${role} health`);
  const health = await readJson(healthResponse, `${role} health`);
  if (healthResponse.status !== 200 || health.ok !== true) {
    throw new Error(`${role} health failed: HTTP ${healthResponse.status} ${JSON.stringify(health)}`);
  }
  const identity = assertIdentity(health, versionId, `${role} health`);

  const roomId = `p005-${crypto.randomBytes(16).toString('hex')}`;
  const payload = {
    probe: 'PAGES-015',
    role,
    workerVersionId: versionId,
    nonce: crypto.randomUUID(),
    writtenAt: new Date().toISOString(),
  };

  const writeResponse = await fetch(`${apiOrigin}/__pages005/rooms`, {
    method: 'POST',
    headers: headersFor(versionId, {
      'content-type': 'application/json',
      'cache-control': 'no-cache',
    }),
    body: JSON.stringify({ roomId, payload }),
  });
  assertCors(writeResponse, `${role} write`);
  const write = await readJson(writeResponse, `${role} write`);
  if (writeResponse.status !== 201 || write.ok !== true || write.room?.roomId !== roomId) {
    throw new Error(`${role} write failed: HTTP ${writeResponse.status} ${JSON.stringify(write)}`);
  }
  assertIdentity(write, versionId, `${role} write`);

  const readResponse = await fetch(`${apiOrigin}/__pages005/rooms/${roomId}?pages015=${crypto.randomUUID()}`, {
    headers: headersFor(versionId, { 'cache-control': 'no-cache' }),
  });
  assertCors(readResponse, `${role} read`);
  const read = await readJson(readResponse, `${role} read`);
  if (readResponse.status !== 200 || read.ok !== true || read.room?.roomId !== roomId) {
    throw new Error(`${role} read failed: HTTP ${readResponse.status} ${JSON.stringify(read)}`);
  }
  const readIdentity = assertIdentity(read, versionId, `${role} read`);
  if (JSON.stringify(read.room.payload) !== JSON.stringify(payload)) {
    throw new Error(`${role} Turso round trip payload mismatch`);
  }
  if (!/^[a-f0-9]{64}$/.test(String(read.room.integrity || ''))) {
    throw new Error(`${role} Turso round trip integrity digest missing`);
  }

  if (
    identity.protocolId !== readIdentity.protocolId ||
    identity.protocolVersion !== readIdentity.protocolVersion ||
    identity.capabilityId !== readIdentity.capabilityId ||
    identity.tursoSchemaId !== readIdentity.tursoSchemaId ||
    identity.tursoSchemaVersion !== readIdentity.tursoSchemaVersion
  ) {
    throw new Error(`${role} compatibility identity changed between health and snapshot`);
  }

  return {
    role,
    workerVersionId: versionId,
    healthVerified: true,
    corsHeadersVerified: true,
    tursoRoundTripVerified: true,
    roomId,
    integrity: read.room.integrity,
    identity,
  };
}

const active = await probeVersion('active', activeVersion);
const previous = await probeVersion('previous', previousVersion);

for (const field of ['protocolId', 'protocolVersion', 'capabilityId', 'tursoSchemaId', 'tursoSchemaVersion']) {
  if (active.identity[field] !== previous.identity[field]) {
    throw new Error(`Worker rollback window identity mismatch at ${field}`);
  }
}

const evidence = {
  schemaVersion: 1,
  gate: 'PAGES-015',
  verified: true,
  apiOrigin,
  pagesOrigin,
  protocolIdentity: `${EXPECTED_ONLINE_PROTOCOL.id}@${EXPECTED_ONLINE_PROTOCOL.version}`,
  protocolVersion: EXPECTED_ONLINE_PROTOCOL.version,
  capabilityIdentity: REQUIRED_ONLINE_CAPABILITIES.id,
  capabilities: [...REQUIRED_ONLINE_CAPABILITIES.names],
  tursoSchemaId: active.identity.tursoSchemaId,
  tursoSchemaVersion: active.identity.tursoSchemaVersion,
  migrationPolicy: 'expand-contract-forward-only',
  tursoDataRollbackRequired: false,
  workerWindow: [active, previous],
  liveHealthVerified: true,
  corsHeadersVerified: true,
  liveTursoRoundTripVerified: true,
  recordedAt: new Date().toISOString(),
};

fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
