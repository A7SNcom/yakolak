#!/usr/bin/env node
import fs from 'node:fs';

const HEX64 = /^[a-f0-9]{64}$/;
const GENERATION = /^sha256:[a-f0-9]{64}$/;
const REQUIRED_CAPABILITIES = [
  'health.compatibility.v1',
  'room-probe.read.v1',
  'room-probe.write.v1',
];

const window = JSON.parse(
  fs.readFileSync(new URL('../RELEASE_QUALIFICATION/ONLINE_FRONTEND_WINDOW.json', import.meta.url), 'utf8'),
);
const apiOrigin = fs
  .readFileSync(new URL('../backend/cloudflare/API_ORIGIN.txt', import.meta.url), 'utf8')
  .trim();
const lock = JSON.parse(
  fs.readFileSync(new URL('../backend/cloudflare/WORKER_ROLLBACK_WINDOW.json', import.meta.url), 'utf8'),
);
const rows = fs
  .readFileSync(new URL('../RELEASE_QUALIFICATION/ledger.jsonl', import.meta.url), 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`invalid ledger JSON line ${index + 1}: ${error.message}`);
    }
  });

function exactStringSet(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort())
  );
}

function canonicalPairings(pairings) {
  if (!Array.isArray(pairings)) return null;
  return pairings
    .map((pair) => ({
      frontendRole: pair?.frontendRole,
      workerRole: pair?.workerRole,
      frontendKey: pair?.frontendKey,
      frontendDescriptorSha256: pair?.frontendDescriptorSha256,
      workerVersionId: pair?.workerVersionId,
      verified: pair?.verified,
    }))
    .sort((a, b) =>
      `${a.frontendRole}/${a.workerRole}`.localeCompare(`${b.frontendRole}/${b.workerRole}`),
    );
}

if (!/^https:\/\/[^/]+$/.test(apiOrigin) || apiOrigin.endsWith('.vercel.app')) {
  throw new Error('invalid locked API_ORIGIN');
}

if (
  lock?.schemaVersion !== 1 ||
  lock?.gate !== 'PAGES-005' ||
  lock?.provider !== 'cloudflare-workers' ||
  lock?.workerName !== 'yakolak-room-api' ||
  lock?.apiOrigin !== apiOrigin ||
  typeof lock?.activeWorkerVersionId !== 'string' ||
  lock.activeWorkerVersionId.length === 0 ||
  typeof lock?.previousWorkerVersionId !== 'string' ||
  lock.previousWorkerVersionId.length === 0 ||
  lock.activeWorkerVersionId === lock.previousWorkerVersionId ||
  lock?.protocolIdentity !== 'yakolak-online-room@1' ||
  lock?.capabilityIdentity !== 'yakolak-online-room-capabilities-v1' ||
  !exactStringSet(lock?.capabilities, REQUIRED_CAPABILITIES) ||
  lock?.tursoSchemaId !== 'yakolak-pages005-room-probe' ||
  lock?.tursoSchemaVersion !== 1 ||
  lock?.traffic?.activePercent !== 100 ||
  lock?.traffic?.previousPercent !== 0 ||
  lock?.versionOverrideProof !== true ||
  lock?.browserCorsVerified !== true ||
  lock?.liveTursoRoundTripVerified !== true ||
  !HEX64.test(String(lock?.finalEvidenceSha256 || '')) ||
  lock?.migrationPolicy !== 'expand-contract-forward-only' ||
  lock?.tursoDataRollbackRequired !== false
) {
  throw new Error('current Worker rollback lock is incomplete or malformed');
}

if (
  window?.schemaVersion !== 1 ||
  window?.rules?.thisFileDoesNotConferEligibility !== true ||
  !Array.isArray(window?.frontends) ||
  window.frontends.length !== 2
) {
  throw new Error('locked frontend window is invalid');
}

const frontendByRole = new Map(window.frontends.map((item) => [item.role, item]));
const activeFrontend = frontendByRole.get('active');
const previousFrontend = frontendByRole.get('previous');
for (const [role, item] of [['active', activeFrontend], ['previous', previousFrontend]]) {
  if (
    !item ||
    item.role !== role ||
    typeof item.releaseTag !== 'string' ||
    item.releaseTag.length === 0 ||
    !HEX64.test(String(item.assetSha256 || '')) ||
    !HEX64.test(String(item.onlineCompatibilityDescriptorSha256 || '')) ||
    !GENERATION.test(String(item.deploymentGeneration || ''))
  ) {
    throw new Error(`invalid ${role} frontend lock entry`);
  }
}

const frontendKeys = {
  active: `${activeFrontend.releaseTag}:${activeFrontend.assetSha256}`,
  previous: `${previousFrontend.releaseTag}:${previousFrontend.assetSha256}`,
};
if (frontendKeys.active === frontendKeys.previous) {
  throw new Error('active and previous frontend keys must be distinct');
}

const expectedWorkerWindow = [
  `active:${lock.activeWorkerVersionId}`,
  `previous:${lock.previousWorkerVersionId}`,
];
const expectedFrontendWindow = [frontendKeys.active, frontendKeys.previous];
const frontendIdentity = {
  active: activeFrontend,
  previous: previousFrontend,
};

function completeCurrentLockRow(row, role) {
  const frontend = frontendIdentity[role];
  if (
    row?.event !== 'backend_compatibility_verified' ||
    row?.frontendRole !== role ||
    row?.releaseTag !== frontend.releaseTag ||
    String(row?.assetSha256 || '').toLowerCase() !== frontend.assetSha256 ||
    row?.frontendDescriptorSha256 !== frontend.onlineCompatibilityDescriptorSha256 ||
    row?.deploymentGeneration !== frontend.deploymentGeneration ||
    row?.verified !== true ||
    row?.safe !== true ||
    row?.frontendArchiveReverified !== true ||
    row?.workerDeployment !== `cloudflare:${lock.activeWorkerVersionId}` ||
    row?.workerVersionId !== lock.activeWorkerVersionId ||
    row?.previousWorkerVersionId !== lock.previousWorkerVersionId ||
    row?.protocolIdentity !== lock.protocolIdentity ||
    row?.protocolVersion !== '1' ||
    row?.capabilityIdentity !== lock.capabilityIdentity ||
    !exactStringSet(row?.capabilities, lock.capabilities) ||
    row?.tursoTuple !== `${lock.tursoSchemaId}@${lock.tursoSchemaVersion}` ||
    row?.tursoSchemaId !== lock.tursoSchemaId ||
    row?.tursoSchemaVersion !== lock.tursoSchemaVersion ||
    row?.migrationPolicy !== lock.migrationPolicy ||
    row?.tursoDataRollbackRequired !== false ||
    row?.liveHealthVerified !== true ||
    row?.browserCorsVerified !== true ||
    row?.liveTursoRoundTripVerified !== true ||
    row?.rollbackWindowVerified !== true ||
    row?.apiOrigin !== apiOrigin ||
    !HEX64.test(String(row?.evidenceSha256 || '')) ||
    !exactStringSet(row?.compatibleFrontendWindow, expectedFrontendWindow) ||
    !exactStringSet(row?.compatibleWorkerWindow, expectedWorkerWindow) ||
    !Array.isArray(row?.compatiblePairings) ||
    row.compatiblePairings.length !== 4
  ) {
    return false;
  }

  const pairByRole = new Map();
  for (const pair of row.compatiblePairings) {
    const key = `${pair?.frontendRole}/${pair?.workerRole}`;
    if (
      !['active/active', 'active/previous', 'previous/active', 'previous/previous'].includes(key) ||
      pairByRole.has(key) ||
      pair?.verified !== true
    ) {
      return false;
    }
    const pairFrontend = frontendIdentity[pair.frontendRole];
    const expectedWorkerVersion =
      pair.workerRole === 'active' ? lock.activeWorkerVersionId : lock.previousWorkerVersionId;
    if (
      pair?.frontendKey !== frontendKeys[pair.frontendRole] ||
      pair?.frontendDescriptorSha256 !== pairFrontend.onlineCompatibilityDescriptorSha256 ||
      pair?.workerVersionId !== expectedWorkerVersion
    ) {
      return false;
    }
    pairByRole.set(key, pair);
  }
  return pairByRole.size === 4;
}

const activeRows = rows.filter((row) => completeCurrentLockRow(row, 'active'));
const previousRows = rows.filter((row) => completeCurrentLockRow(row, 'previous'));
let matched = null;
for (const activeRow of activeRows) {
  const activePairs = JSON.stringify(canonicalPairings(activeRow.compatiblePairings));
  matched = previousRows.find(
    (previousRow) =>
      previousRow.evidenceSha256 === activeRow.evidenceSha256 &&
      JSON.stringify(canonicalPairings(previousRow.compatiblePairings)) === activePairs,
  );
  if (matched) break;
}

if (!matched) {
  console.error('PAGES-015 ledger is not qualified for the current Worker rollback lock');
  process.exit(1);
}

console.log('PAGES-015 ledger is qualified for the current Worker rollback lock');
