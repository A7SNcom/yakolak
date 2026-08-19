#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';

const HEX64 = /^[a-f0-9]{64}$/;
const GENERATION = /^sha256:[a-f0-9]{64}$/;
const REQUIRED_CAPABILITIES = [
  'health.compatibility.v1',
  'room-probe.read.v1',
  'room-probe.write.v1',
];
const ledgerPath = new URL('../RELEASE_QUALIFICATION/ledger.jsonl', import.meta.url);
const windowPath = new URL('../RELEASE_QUALIFICATION/ONLINE_FRONTEND_WINDOW.json', import.meta.url);
const evidencePath = String(process.env.PAGES015_EVIDENCE_PATH || 'pages015-live-evidence.json');

const lockedWindow = JSON.parse(fs.readFileSync(windowPath, 'utf8'));
if (
  lockedWindow?.schemaVersion !== 1 ||
  lockedWindow?.rules?.thisFileDoesNotConferEligibility !== true ||
  lockedWindow?.rules?.bothRequireArchiveVerified !== true ||
  lockedWindow?.rules?.bothRequireDeploymentGenerationVerified !== true ||
  lockedWindow?.rules?.bothRequireSuccessfulPages014LiveEvidence !== true ||
  lockedWindow?.rules?.bothRequireExactArchivedCompatibilityDescriptorDigest !== true ||
  !Array.isArray(lockedWindow.frontends) ||
  lockedWindow.frontends.length !== 2
) {
  throw new Error('locked PAGES-015 frontend window is invalid');
}

function exactStringSet(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort())
  );
}

function lockedRole(role) {
  const item = lockedWindow.frontends.find((candidate) => candidate.role === role);
  if (
    !item ||
    !item.releaseTag ||
    !HEX64.test(String(item.assetSha256 || '')) ||
    !HEX64.test(String(item.onlineCompatibilityDescriptorSha256 || '')) ||
    !GENERATION.test(String(item.deploymentGeneration || '')) ||
    !HEX64.test(String(item.pages014LiveEvidence?.liveManifestSha256 || '')) ||
    item.pages014LiveEvidence?.verified !== true
  ) {
    throw new Error(`invalid locked ${role} frontend window entry`);
  }
  return item;
}

const frontendWindow = ['active', 'previous'].map((role) => {
  const locked = lockedRole(role);
  const releaseTag = String(process.env[`${role.toUpperCase()}_RELEASE_TAG`] || '').trim();
  const assetSha256 = String(process.env[`${role.toUpperCase()}_ASSET_SHA256`] || '').toLowerCase();
  if (releaseTag !== locked.releaseTag || assetSha256 !== locked.assetSha256) {
    throw new Error(`${role} frontend key does not match the locked PAGES-015 window`);
  }
  return {
    role,
    releaseTag,
    assetSha256,
    descriptorSha256: locked.onlineCompatibilityDescriptorSha256,
    deploymentGeneration: locked.deploymentGeneration,
    liveManifestSha256: locked.pages014LiveEvidence.liveManifestSha256,
  };
});

if (
  frontendWindow[0].releaseTag === frontendWindow[1].releaseTag &&
  frontendWindow[0].assetSha256 === frontendWindow[1].assetSha256
) {
  throw new Error('active and previous frontend archive keys must be distinct');
}
if (process.env.PAGES015_BROWSER_CORS_VERIFIED !== 'true') {
  throw new Error('browser CORS proof is mandatory before ledger append');
}

const evidenceBytes = fs.readFileSync(evidencePath);
const evidence = JSON.parse(evidenceBytes.toString('utf8'));
if (
  evidence?.gate !== 'PAGES-015' ||
  evidence?.verified !== true ||
  evidence?.liveHealthVerified !== true ||
  evidence?.liveTursoRoundTripVerified !== true ||
  evidence?.corsHeadersVerified !== true ||
  evidence?.frontendArchiveReverified !== true ||
  evidence?.rollbackWindowVerified !== true ||
  evidence?.workerLockIdentityVerified !== true ||
  !HEX64.test(String(evidence?.workerLockEvidenceSha256 || '')) ||
  evidence?.protocolIdentity !== 'yakolak-online-room@1' ||
  evidence?.protocolVersion !== '1' ||
  evidence?.capabilityIdentity !== 'yakolak-online-room-capabilities-v1' ||
  !exactStringSet(evidence?.capabilities, REQUIRED_CAPABILITIES) ||
  evidence?.tursoSchemaId !== 'yakolak-pages005-room-probe' ||
  evidence?.tursoSchemaVersion !== 1 ||
  evidence?.migrationPolicy !== 'expand-contract-forward-only' ||
  evidence?.tursoDataRollbackRequired !== false ||
  typeof evidence?.apiOrigin !== 'string' ||
  !/^https:\/\/[^/]+$/.test(evidence.apiOrigin) ||
  !Array.isArray(evidence.workerWindow) ||
  evidence.workerWindow.length !== 2 ||
  !Array.isArray(evidence.frontendWindow) ||
  evidence.frontendWindow.length !== 2 ||
  !Array.isArray(evidence.compatiblePairings) ||
  evidence.compatiblePairings.length !== 4
) {
  throw new Error('live PAGES-015 evidence is incomplete or malformed');
}

const workerByRole = new Map(evidence.workerWindow.map((item) => [item.role, item]));
const activeWorker = workerByRole.get('active');
const previousWorker = workerByRole.get('previous');
if (
  workerByRole.size !== 2 ||
  !activeWorker?.workerVersionId ||
  !previousWorker?.workerVersionId ||
  activeWorker.workerVersionId === previousWorker.workerVersionId ||
  activeWorker.healthVerified !== true ||
  previousWorker.healthVerified !== true ||
  activeWorker.tursoRoundTripVerified !== true ||
  previousWorker.tursoRoundTripVerified !== true
) {
  throw new Error('invalid proven Worker rollback window');
}

for (const item of frontendWindow) {
  const proven = evidence.frontendWindow.find((row) => row.role === item.role);
  if (
    !proven ||
    proven.releaseTag !== item.releaseTag ||
    proven.assetSha256 !== item.assetSha256 ||
    proven.descriptorSha256 !== item.descriptorSha256
  ) {
    throw new Error(`${item.role} frontend evidence is not bound to the locked immutable archive descriptor`);
  }
}

const expectedPairings = [
  ['active', 'active', activeWorker.workerVersionId],
  ['active', 'previous', previousWorker.workerVersionId],
  ['previous', 'active', activeWorker.workerVersionId],
  ['previous', 'previous', previousWorker.workerVersionId],
];
for (const [frontendRole, workerRole, workerVersionId] of expectedPairings) {
  const frontend = frontendWindow.find((item) => item.role === frontendRole);
  const pair = evidence.compatiblePairings.find(
    (candidate) => candidate.frontendRole === frontendRole && candidate.workerRole === workerRole,
  );
  if (
    !pair ||
    pair.verified !== true ||
    pair.workerVersionId !== workerVersionId ||
    pair.frontendKey !== `${frontend.releaseTag}:${frontend.assetSha256}` ||
    pair.frontendDescriptorSha256 !== frontend.descriptorSha256
  ) {
    throw new Error(`missing exact compatible pairing ${frontendRole}/${workerRole}`);
  }
}

const rows = fs.readFileSync(ledgerPath, 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`invalid ledger JSON line ${index + 1}: ${error.message}`);
    }
  });

function keyedRows(item) {
  return rows.filter(
    (row) =>
      row.releaseTag === item.releaseTag &&
      String(row.assetSha256 || '').toLowerCase() === item.assetSha256,
  );
}

function prerequisites(item) {
  const keyed = keyedRows(item);
  const archive = [...keyed].reverse().find(
    (row) =>
      row.event === 'archive_verified' &&
      row.assetName === 'pages-composite.tar' &&
      row.immutable === true &&
      row.releaseAttestationVerified === true &&
      row.archiveSha256Verified === true &&
      row.nonProductionRestoreVerified === true &&
      row.onlineCompatibilityDescriptorSha256 === item.descriptorSha256 &&
      row.deploymentGenerationInArchive === item.deploymentGeneration,
  );
  const generation = [...keyed].reverse().find(
    (row) =>
      row.event === 'deployment_generation_verified' &&
      row.assetName === 'pages-composite.tar' &&
      row.verified === true &&
      row.deploymentGeneration === item.deploymentGeneration &&
      row.pagesDeploymentStatus === 'succeed' &&
      row.manifestVerified === true &&
      row.archiveMatchVerified === true &&
      row.pages014LiveEvidenceVerified === true &&
      row.liveManifestSha256 === item.liveManifestSha256 &&
      HEX64.test(String(row.publicRuntimeProtocolSha256 || '')) &&
      row.protocolVersion === '1' &&
      HEX64.test(String(row.contentIdentitySha256 || '')),
  );
  if (!archive || !generation) {
    throw new Error(
      `${item.role} frontend missing strong prerequisite qualification: ` +
      `${!archive ? 'archive_verified ' : ''}${!generation ? 'deployment_generation_verified' : ''}`.trim(),
    );
  }
  if (archive.deploymentGenerationInArchive !== generation.deploymentGeneration) {
    throw new Error(`${item.role} archive/generation identity mismatch`);
  }
  return { archive, generation };
}

const evidenceSha256 = crypto.createHash('sha256').update(evidenceBytes).digest('hex');
const workerLockEvidenceSha256 = evidence.workerLockEvidenceSha256;
const activeWorkerVersion = activeWorker.workerVersionId;
const previousWorkerVersion = previousWorker.workerVersionId;
const compatibleFrontendWindow = frontendWindow.map(
  (item) => `${item.releaseTag}:${item.assetSha256}`,
);
const compatibleWorkerWindow = [
  `active:${activeWorkerVersion}`,
  `previous:${previousWorkerVersion}`,
];

const events = [];
for (const item of frontendWindow) {
  const { archive, generation } = prerequisites(item);
  const qualificationId = crypto.createHash('sha256').update(JSON.stringify({
    event: 'backend_compatibility_verified',
    releaseTag: item.releaseTag,
    assetSha256: item.assetSha256,
    frontendDescriptorSha256: item.descriptorSha256,
    deploymentGeneration: generation.deploymentGeneration,
    activeWorkerVersion,
    previousWorkerVersion,
    protocolIdentity: evidence.protocolIdentity,
    capabilityIdentity: evidence.capabilityIdentity,
    tursoSchemaId: evidence.tursoSchemaId,
    tursoSchemaVersion: evidence.tursoSchemaVersion,
    workerLockEvidenceSha256,
  })).digest('hex');

  if (rows.some((row) => row.qualificationId === qualificationId && row.verified === true)) {
    continue;
  }

  if (archive.onlineCompatibilityDescriptorSha256 !== item.descriptorSha256) {
    throw new Error(`${item.role} descriptor changed after immutable archive proof`);
  }

  events.push({
    schemaVersion: 1,
    event: 'backend_compatibility_verified',
    qualificationId,
    releaseTag: item.releaseTag,
    assetName: 'pages-composite.tar',
    assetSha256: item.assetSha256,
    frontendRole: item.role,
    frontendDigest: item.assetSha256,
    frontendDescriptorSha256: item.descriptorSha256,
    frontendArchiveReverified: true,
    deploymentGeneration: generation.deploymentGeneration,
    verified: true,
    safe: true,
    workerDeployment: `cloudflare:${activeWorkerVersion}`,
    workerVersionId: activeWorkerVersion,
    previousWorkerVersionId: previousWorkerVersion,
    workerLockEvidenceSha256,
    protocolIdentity: evidence.protocolIdentity,
    protocolVersion: evidence.protocolVersion,
    capabilityIdentity: evidence.capabilityIdentity,
    capabilities: evidence.capabilities,
    tursoTuple: `${evidence.tursoSchemaId}@${evidence.tursoSchemaVersion}`,
    tursoSchemaId: evidence.tursoSchemaId,
    tursoSchemaVersion: evidence.tursoSchemaVersion,
    migrationPolicy: evidence.migrationPolicy,
    tursoDataRollbackRequired: false,
    liveHealthVerified: true,
    browserCorsVerified: true,
    liveTursoRoundTripVerified: true,
    rollbackWindowVerified: true,
    compatibleFrontendWindow,
    compatibleWorkerWindow,
    compatiblePairings: evidence.compatiblePairings,
    apiOrigin: evidence.apiOrigin,
    evidenceSha256,
    workflowRunId: String(process.env.GITHUB_RUN_ID || ''),
    recordedAt: new Date().toISOString(),
  });
}

if (events.length) {
  fs.appendFileSync(ledgerPath, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`);
}

console.log(JSON.stringify({
  ok: true,
  appended: events.length,
  qualificationIds: events.map((event) => event.qualificationId),
}, null, 2));
