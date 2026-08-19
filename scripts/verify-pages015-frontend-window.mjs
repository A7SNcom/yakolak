#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';

const [activeDescriptorPath, previousDescriptorPath] = process.argv.slice(2);
const evidencePath = String(process.env.PAGES015_EVIDENCE_PATH || 'pages015-live-evidence.json');
const workerLockPath = new URL('../backend/cloudflare/WORKER_ROLLBACK_WINDOW.json', import.meta.url);
const apiOriginPath = new URL('../backend/cloudflare/API_ORIGIN.txt', import.meta.url);
const expectedCapabilities = [
  'health.compatibility.v1',
  'room-probe.read.v1',
  'room-probe.write.v1',
];
const frontends = [
  {
    role: 'active',
    releaseTag: String(process.env.ACTIVE_RELEASE_TAG || '').trim(),
    assetSha256: String(process.env.ACTIVE_ASSET_SHA256 || '').toLowerCase(),
    descriptorPath: activeDescriptorPath,
  },
  {
    role: 'previous',
    releaseTag: String(process.env.PREVIOUS_RELEASE_TAG || '').trim(),
    assetSha256: String(process.env.PREVIOUS_ASSET_SHA256 || '').toLowerCase(),
    descriptorPath: previousDescriptorPath,
  },
];

const evidenceBytes = fs.readFileSync(evidencePath);
const evidence = JSON.parse(evidenceBytes.toString('utf8'));
if (
  evidence?.gate !== 'PAGES-015' ||
  evidence?.verified !== true ||
  evidence?.liveHealthVerified !== true ||
  evidence?.corsHeadersVerified !== true ||
  evidence?.liveTursoRoundTripVerified !== true ||
  evidence?.protocolIdentity !== 'yakolak-online-room@1' ||
  evidence?.protocolVersion !== '1' ||
  evidence?.capabilityIdentity !== 'yakolak-online-room-capabilities-v1' ||
  !Array.isArray(evidence?.capabilities) ||
  evidence.capabilities.length !== expectedCapabilities.length ||
  expectedCapabilities.some((name) => !evidence.capabilities.includes(name)) ||
  evidence?.tursoSchemaId !== 'yakolak-pages005-room-probe' ||
  evidence?.tursoSchemaVersion !== 1 ||
  evidence?.migrationPolicy !== 'expand-contract-forward-only' ||
  evidence?.tursoDataRollbackRequired !== false ||
  !Array.isArray(evidence?.workerWindow) ||
  evidence.workerWindow.length !== 2
) {
  throw new Error('live Worker evidence must be complete before frontend-window verification');
}

const apiOrigin = fs.readFileSync(apiOriginPath, 'utf8').trim();
const workerLock = JSON.parse(fs.readFileSync(workerLockPath, 'utf8'));
const lockCapabilities = Array.isArray(workerLock?.capabilities) ? [...workerLock.capabilities].sort() : [];
const evidenceCapabilities = [...evidence.capabilities].sort();
const workerByRole = new Map(evidence.workerWindow.map((item) => [item?.role, item]));
const activeWorker = workerByRole.get('active');
const previousWorker = workerByRole.get('previous');
if (
  !/^https:\/\/[^/]+$/.test(apiOrigin) ||
  workerLock?.schemaVersion !== 1 ||
  workerLock?.gate !== 'PAGES-005' ||
  workerLock?.provider !== 'cloudflare-workers' ||
  workerLock?.workerName !== 'yakolak-room-api' ||
  workerLock?.apiOrigin !== apiOrigin ||
  evidence?.apiOrigin !== apiOrigin ||
  workerLock?.protocolIdentity !== evidence.protocolIdentity ||
  workerLock?.capabilityIdentity !== evidence.capabilityIdentity ||
  JSON.stringify(lockCapabilities) !== JSON.stringify(evidenceCapabilities) ||
  workerLock?.tursoSchemaId !== evidence.tursoSchemaId ||
  workerLock?.tursoSchemaVersion !== evidence.tursoSchemaVersion ||
  workerLock?.migrationPolicy !== 'expand-contract-forward-only' ||
  workerLock?.tursoDataRollbackRequired !== false ||
  workerLock?.traffic?.activePercent !== 100 ||
  workerLock?.traffic?.previousPercent !== 0 ||
  workerLock?.versionOverrideProof !== true ||
  workerLock?.browserCorsVerified !== true ||
  workerLock?.liveTursoRoundTripVerified !== true ||
  !/^[a-f0-9]{64}$/.test(String(workerLock?.finalEvidenceSha256 || '')) ||
  workerByRole.size !== 2 ||
  !activeWorker?.workerVersionId ||
  !previousWorker?.workerVersionId ||
  activeWorker.workerVersionId === previousWorker.workerVersionId ||
  activeWorker.workerVersionId !== workerLock?.activeWorkerVersionId ||
  previousWorker.workerVersionId !== workerLock?.previousWorkerVersionId ||
  activeWorker.healthVerified !== true ||
  previousWorker.healthVerified !== true ||
  activeWorker.tursoRoundTripVerified !== true ||
  previousWorker.tursoRoundTripVerified !== true
) {
  throw new Error('live Worker evidence does not match the locked PAGES-005 rollback identity');
}

function descriptorSha(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function validateDescriptor(item) {
  if (!item.releaseTag || !/^[a-f0-9]{64}$/.test(item.assetSha256)) {
    throw new Error(`invalid ${item.role} immutable frontend key`);
  }
  const bytes = fs.readFileSync(item.descriptorPath);
  const value = JSON.parse(bytes.toString('utf8'));
  if (
    value?.schemaVersion !== 1 ||
    value?.identity !== 'yakolak-online-frontend-compatibility-v1' ||
    value?.protocol?.id !== 'yakolak-online-room' ||
    String(value?.protocol?.version) !== String(evidence.protocolVersion) ||
    value?.capabilities?.id !== evidence.capabilityIdentity ||
    !Array.isArray(value?.capabilities?.required) ||
    evidence.capabilities.some((name) => !value.capabilities.required.includes(name)) ||
    value?.turso?.schemaId !== evidence.tursoSchemaId ||
    !Number.isInteger(value?.turso?.minVersion) ||
    !Number.isInteger(value?.turso?.maxVersion) ||
    evidence.tursoSchemaVersion < value.turso.minVersion ||
    evidence.tursoSchemaVersion > value.turso.maxVersion ||
    value?.migrationPolicy?.mode !== 'expand-contract-forward-only' ||
    value?.migrationPolicy?.tursoDataRollback !== false ||
    value?.mutationRequiresHealthProof !== true
  ) {
    throw new Error(`${item.role} immutable frontend compatibility descriptor is incompatible`);
  }
  return {
    role: item.role,
    releaseTag: item.releaseTag,
    assetSha256: item.assetSha256,
    descriptorSha256: descriptorSha(bytes),
    protocolIdentity: `${value.protocol.id}@${value.protocol.version}`,
    capabilityIdentity: value.capabilities.id,
    tursoRange: `${value.turso.schemaId}@${value.turso.minVersion}-${value.turso.maxVersion}`,
  };
}

const frontendWindow = frontends.map(validateDescriptor);
const workerWindow = evidence.workerWindow.map(({ role, workerVersionId }) => ({ role, workerVersionId }));
const pairings = frontendWindow.flatMap((frontend) => workerWindow.map((worker) => ({
  frontendRole: frontend.role,
  frontendKey: `${frontend.releaseTag}:${frontend.assetSha256}`,
  frontendDescriptorSha256: frontend.descriptorSha256,
  workerRole: worker.role,
  workerVersionId: worker.workerVersionId,
  verified: true,
})));
if (pairings.length !== 4) throw new Error('PAGES-015 requires exactly four active/previous frontend x Worker pairings');

evidence.frontendWindow = frontendWindow;
evidence.compatiblePairings = pairings;
evidence.frontendArchiveReverified = true;
evidence.rollbackWindowVerified = true;
evidence.workerLockIdentityVerified = true;
evidence.workerLockEvidenceSha256 = workerLock.finalEvidenceSha256;
evidence.frontendWindowVerifiedAt = new Date().toISOString();
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, frontendWindow, pairings }, null, 2));
