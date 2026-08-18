#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';

const ledgerPath = new URL('../RELEASE_QUALIFICATION/ledger.jsonl', import.meta.url);
const evidencePath = String(process.env.PAGES015_EVIDENCE_PATH || 'pages015-live-evidence.json');

const frontendWindow = [
  {
    role: 'active',
    releaseTag: String(process.env.ACTIVE_RELEASE_TAG || '').trim(),
    assetSha256: String(process.env.ACTIVE_ASSET_SHA256 || '').toLowerCase(),
  },
  {
    role: 'previous',
    releaseTag: String(process.env.PREVIOUS_RELEASE_TAG || '').trim(),
    assetSha256: String(process.env.PREVIOUS_ASSET_SHA256 || '').toLowerCase(),
  },
];

for (const item of frontendWindow) {
  if (!item.releaseTag || !/^[a-f0-9]{64}$/.test(item.assetSha256)) {
    throw new Error(`invalid ${item.role} immutable frontend key`);
  }
}
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
  evidence?.workerWindow?.length !== 2
) {
  throw new Error('live PAGES-015 evidence is incomplete');
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
  const archive = keyed.find(
    (row) =>
      row.event === 'archive_verified' &&
      row.immutable === true &&
      row.releaseAttestationVerified === true &&
      row.archiveSha256Verified === true &&
      row.nonProductionRestoreVerified === true,
  );
  const generation = [...keyed].reverse().find(
    (row) =>
      row.event === 'deployment_generation_verified' &&
      row.verified === true &&
      typeof row.deploymentGeneration === 'string' &&
      row.deploymentGeneration.length > 0,
  );
  if (!archive || !generation) {
    throw new Error(
      `${item.role} frontend missing prerequisite qualification: ` +
      `${!archive ? 'archive_verified ' : ''}${!generation ? 'deployment_generation_verified' : ''}`.trim(),
    );
  }
  return { generation };
}

const evidenceSha256 = crypto.createHash('sha256').update(evidenceBytes).digest('hex');
const workerWindow = evidence.workerWindow.map((item) => ({
  role: item.role,
  versionId: item.workerVersionId,
}));
const activeWorkerVersion = workerWindow.find((item) => item.role === 'active')?.versionId;
const previousWorkerVersion = workerWindow.find((item) => item.role === 'previous')?.versionId;
if (!activeWorkerVersion || !previousWorkerVersion || activeWorkerVersion === previousWorkerVersion) {
  throw new Error('invalid Worker rollback window evidence');
}

const compatibleFrontendWindow = frontendWindow.map(
  (item) => `${item.releaseTag}:${item.assetSha256}`,
);
const compatibleWorkerWindow = workerWindow.map(
  (item) => `${item.role}:${item.versionId}`,
);

const events = [];
for (const item of frontendWindow) {
  const { generation } = prerequisites(item);
  const qualificationId = crypto.createHash('sha256').update(JSON.stringify({
    event: 'backend_compatibility_verified',
    releaseTag: item.releaseTag,
    assetSha256: item.assetSha256,
    deploymentGeneration: generation.deploymentGeneration,
    activeWorkerVersion,
    previousWorkerVersion,
    protocolIdentity: evidence.protocolIdentity,
    capabilityIdentity: evidence.capabilityIdentity,
    tursoSchemaId: evidence.tursoSchemaId,
    tursoSchemaVersion: evidence.tursoSchemaVersion,
  })).digest('hex');

  if (rows.some((row) => row.qualificationId === qualificationId && row.verified === true)) {
    continue;
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
    deploymentGeneration: generation.deploymentGeneration,
    verified: true,
    safe: true,
    workerDeployment: `cloudflare:${activeWorkerVersion}`,
    workerVersionId: activeWorkerVersion,
    previousWorkerVersionId: previousWorkerVersion,
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
