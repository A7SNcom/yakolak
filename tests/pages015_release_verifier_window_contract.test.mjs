import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const verifierSource = fs.readFileSync(new URL('../scripts/verify-release-qualification.mjs', import.meta.url), 'utf8');
const hex = (ch) => ch.repeat(64);
const activeTag = 'pages-active';
const previousTag = 'pages-previous';
const activeAsset = hex('a');
const previousAsset = hex('b');
const activeDescriptor = hex('c');
const previousDescriptor = hex('d');
const activeGeneration = `sha256:${hex('e')}`;
const previousGeneration = `sha256:${hex('f')}`;
const activeKey = `${activeTag}:${activeAsset}`;
const previousKey = `${previousTag}:${previousAsset}`;
const requiredCapabilities = [
  'health.compatibility.v1',
  'room-probe.read.v1',
  'room-probe.write.v1',
];

function archiveRow(tag, asset, descriptor, generation) {
  return {
    schemaVersion: 1,
    event: 'archive_verified',
    releaseTag: tag,
    assetName: 'pages-composite.tar',
    assetSha256: asset,
    immutable: true,
    releaseAttestationVerified: true,
    archiveSha256Verified: true,
    nonProductionRestoreVerified: true,
    onlineCompatibilityDescriptorSha256: descriptor,
    deploymentGenerationInArchive: generation,
  };
}

function generationRow(tag, asset, generation, manifestChar) {
  return {
    schemaVersion: 1,
    event: 'deployment_generation_verified',
    releaseTag: tag,
    assetName: 'pages-composite.tar',
    assetSha256: asset,
    verified: true,
    deploymentGeneration: generation,
    pagesDeploymentStatus: 'succeed',
    manifestVerified: true,
    archiveMatchVerified: true,
    pages014LiveEvidenceVerified: true,
    publicRuntimeProtocolSha256: hex('1'),
    protocolVersion: '1',
    contentIdentitySha256: hex('2'),
    liveManifestSha256: hex(manifestChar),
    pages014VerifierWorkflowRunId: 123,
    pages014VerifierJobId: 456,
  };
}

const pairings = [
  ['active', 'active', activeKey, activeDescriptor, 'worker-active'],
  ['active', 'previous', activeKey, activeDescriptor, 'worker-previous'],
  ['previous', 'active', previousKey, previousDescriptor, 'worker-active'],
  ['previous', 'previous', previousKey, previousDescriptor, 'worker-previous'],
].map(([frontendRole, workerRole, frontendKey, frontendDescriptorSha256, workerVersionId]) => ({
  frontendRole,
  workerRole,
  frontendKey,
  frontendDescriptorSha256,
  workerVersionId,
  verified: true,
}));

function backendRow({ tag, asset, role, descriptor, generation }) {
  return {
    schemaVersion: 1,
    event: 'backend_compatibility_verified',
    releaseTag: tag,
    assetName: 'pages-composite.tar',
    assetSha256: asset,
    frontendRole: role,
    frontendDescriptorSha256: descriptor,
    frontendArchiveReverified: true,
    deploymentGeneration: generation,
    verified: true,
    safe: true,
    workerDeployment: 'cloudflare:worker-active',
    workerVersionId: 'worker-active',
    previousWorkerVersionId: 'worker-previous',
    protocolIdentity: 'yakolak-online-room@1',
    protocolVersion: '1',
    capabilityIdentity: 'yakolak-online-room-capabilities-v1',
    capabilities: [...requiredCapabilities],
    tursoTuple: 'yakolak-pages005-room-probe@1',
    tursoSchemaId: 'yakolak-pages005-room-probe',
    tursoSchemaVersion: 1,
    migrationPolicy: 'expand-contract-forward-only',
    tursoDataRollbackRequired: false,
    liveHealthVerified: true,
    browserCorsVerified: true,
    liveTursoRoundTripVerified: true,
    rollbackWindowVerified: true,
    compatibleFrontendWindow: [activeKey, previousKey],
    compatibleWorkerWindow: ['active:worker-active', 'previous:worker-previous'],
    compatiblePairings: structuredClone(pairings),
    apiOrigin: 'https://api.example.test',
    evidenceSha256: hex('9'),
  };
}

function completeRows() {
  return [
    archiveRow(activeTag, activeAsset, activeDescriptor, activeGeneration),
    generationRow(activeTag, activeAsset, activeGeneration, '3'),
    archiveRow(previousTag, previousAsset, previousDescriptor, previousGeneration),
    generationRow(previousTag, previousAsset, previousGeneration, '4'),
    backendRow({ tag: activeTag, asset: activeAsset, role: 'active', descriptor: activeDescriptor, generation: activeGeneration }),
    backendRow({ tag: previousTag, asset: previousAsset, role: 'previous', descriptor: previousDescriptor, generation: previousGeneration }),
  ];
}

function runVerifier(rows, tag = activeTag, asset = activeAsset) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pages015-verifier-'));
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.mkdirSync(path.join(dir, 'RELEASE_QUALIFICATION'));
  fs.writeFileSync(path.join(dir, 'scripts', 'verify-release-qualification.mjs'), verifierSource);
  fs.writeFileSync(
    path.join(dir, 'RELEASE_QUALIFICATION', 'ledger.jsonl'),
    `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`,
  );
  const result = spawnSync(process.execPath, [path.join(dir, 'scripts', 'verify-release-qualification.mjs'), tag, asset], {
    encoding: 'utf8',
  });
  fs.rmSync(dir, { recursive: true, force: true });
  return result;
}

test('strict release verifier requires and accepts the complete active+previous backend window', () => {
  const rows = completeRows();
  const active = runVerifier(rows, activeTag, activeAsset);
  const previous = runVerifier(rows, previousTag, previousAsset);
  assert.equal(active.status, 0, active.stderr);
  assert.equal(previous.status, 0, previous.stderr);
  assert.match(active.stdout, /full active\+previous backend window verified/);
  assert.match(previous.stdout, /full active\+previous backend window verified/);
});

test('strict release verifier rejects a lone frontend backend qualification', () => {
  const rows = completeRows().filter(
    (row) => !(row.event === 'backend_compatibility_verified' && row.frontendRole === 'previous'),
  );
  const result = runVerifier(rows);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /complete_backend_window_sibling/);
});

test('strict release verifier rejects sibling backend evidence from a different Worker/Turso proof', () => {
  const rows = completeRows();
  const sibling = rows.find(
    (row) => row.event === 'backend_compatibility_verified' && row.frontendRole === 'previous',
  );
  sibling.evidenceSha256 = hex('8');
  const result = runVerifier(rows);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /complete_backend_window_sibling/);
});

test('strict release verifier rejects capability supersets and non-exact Worker deployment identity', () => {
  for (const mutate of [
    (row) => row.capabilities.push('unexpected.capability.v1'),
    (row) => { row.workerDeployment = 'cloudflare:other-worker'; },
  ]) {
    const rows = completeRows();
    const current = rows.find(
      (row) => row.event === 'backend_compatibility_verified' && row.frontendRole === 'active',
    );
    mutate(current);
    const result = runVerifier(rows);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /complete_backend_compatibility_verified/);
  }
});
