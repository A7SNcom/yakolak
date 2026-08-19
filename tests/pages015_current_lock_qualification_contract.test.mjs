import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const verifierSource = fs.readFileSync(
  new URL('../scripts/verify-pages015-current-lock-qualification.mjs', import.meta.url),
  'utf8',
);
const finalizerSource = fs.readFileSync(
  new URL('../scripts/pages015-finalize-live-window.sh', import.meta.url),
  'utf8',
);
const frontendVerifierSource = fs.readFileSync(
  new URL('../scripts/verify-pages015-frontend-window.mjs', import.meta.url),
  'utf8',
);
const appendSource = fs.readFileSync(
  new URL('../scripts/append-pages015-qualification.mjs', import.meta.url),
  'utf8',
);
const legacyWorkflowSource = fs.readFileSync(
  new URL('../.github/workflows/pages-015-online-compatibility.yml', import.meta.url),
  'utf8',
);

const hex = (ch) => ch.repeat(64);
const workerLockEvidenceSha256 = hex('7');
const active = {
  role: 'active',
  releaseTag: 'pages-active',
  assetSha256: hex('a'),
  onlineCompatibilityDescriptorSha256: hex('c'),
  deploymentGeneration: `sha256:${hex('e')}`,
};
const previous = {
  role: 'previous',
  releaseTag: 'pages-previous',
  assetSha256: hex('b'),
  onlineCompatibilityDescriptorSha256: hex('d'),
  deploymentGeneration: `sha256:${hex('f')}`,
};
const activeKey = `${active.releaseTag}:${active.assetSha256}`;
const previousKey = `${previous.releaseTag}:${previous.assetSha256}`;
const capabilities = [
  'health.compatibility.v1',
  'room-probe.read.v1',
  'room-probe.write.v1',
];

function workerLock() {
  return {
    schemaVersion: 1,
    gate: 'PAGES-005',
    provider: 'cloudflare-workers',
    workerName: 'yakolak-room-api',
    apiOrigin: 'https://api.example.test',
    activeWorkerVersionId: 'worker-active',
    previousWorkerVersionId: 'worker-previous',
    protocolIdentity: 'yakolak-online-room@1',
    capabilityIdentity: 'yakolak-online-room-capabilities-v1',
    capabilities: [...capabilities],
    tursoSchemaId: 'yakolak-pages005-room-probe',
    tursoSchemaVersion: 1,
    traffic: { activePercent: 100, previousPercent: 0 },
    versionOverrideProof: true,
    browserCorsVerified: true,
    liveTursoRoundTripVerified: true,
    finalEvidenceSha256: workerLockEvidenceSha256,
    migrationPolicy: 'expand-contract-forward-only',
    tursoDataRollbackRequired: false,
  };
}

const pairings = [
  ['active', 'active', activeKey, active.onlineCompatibilityDescriptorSha256, 'worker-active'],
  ['active', 'previous', activeKey, active.onlineCompatibilityDescriptorSha256, 'worker-previous'],
  ['previous', 'active', previousKey, previous.onlineCompatibilityDescriptorSha256, 'worker-active'],
  ['previous', 'previous', previousKey, previous.onlineCompatibilityDescriptorSha256, 'worker-previous'],
].map(([frontendRole, workerRole, frontendKey, frontendDescriptorSha256, workerVersionId]) => ({
  frontendRole,
  workerRole,
  frontendKey,
  frontendDescriptorSha256,
  workerVersionId,
  verified: true,
}));

function backendRow(frontend) {
  return {
    schemaVersion: 1,
    event: 'backend_compatibility_verified',
    releaseTag: frontend.releaseTag,
    assetName: 'pages-composite.tar',
    assetSha256: frontend.assetSha256,
    frontendRole: frontend.role,
    frontendDescriptorSha256: frontend.onlineCompatibilityDescriptorSha256,
    frontendArchiveReverified: true,
    deploymentGeneration: frontend.deploymentGeneration,
    verified: true,
    safe: true,
    workerDeployment: 'cloudflare:worker-active',
    workerVersionId: 'worker-active',
    previousWorkerVersionId: 'worker-previous',
    workerLockEvidenceSha256,
    protocolIdentity: 'yakolak-online-room@1',
    protocolVersion: '1',
    capabilityIdentity: 'yakolak-online-room-capabilities-v1',
    capabilities: [...capabilities],
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

function fixture({ mutateLock, mutateRows } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pages015-current-lock-'));
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.mkdirSync(path.join(dir, 'RELEASE_QUALIFICATION'));
  fs.mkdirSync(path.join(dir, 'backend', 'cloudflare'), { recursive: true });

  const lock = workerLock();
  const rows = [backendRow(active), backendRow(previous)];
  mutateLock?.(lock);
  mutateRows?.(rows);

  fs.writeFileSync(path.join(dir, 'scripts', 'verify-pages015-current-lock-qualification.mjs'), verifierSource);
  fs.writeFileSync(
    path.join(dir, 'RELEASE_QUALIFICATION', 'ONLINE_FRONTEND_WINDOW.json'),
    JSON.stringify({
      schemaVersion: 1,
      frontends: [active, previous],
      rules: { thisFileDoesNotConferEligibility: true },
    }),
  );
  fs.writeFileSync(
    path.join(dir, 'RELEASE_QUALIFICATION', 'ledger.jsonl'),
    `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`,
  );
  fs.writeFileSync(path.join(dir, 'backend', 'cloudflare', 'API_ORIGIN.txt'), 'https://api.example.test\n');
  fs.writeFileSync(
    path.join(dir, 'backend', 'cloudflare', 'WORKER_ROLLBACK_WINDOW.json'),
    JSON.stringify(lock),
  );

  const result = spawnSync(
    process.execPath,
    [path.join(dir, 'scripts', 'verify-pages015-current-lock-qualification.mjs')],
    { encoding: 'utf8' },
  );
  fs.rmSync(dir, { recursive: true, force: true });
  return result;
}

test('current-lock verifier accepts only the complete qualification matching the current Worker window', () => {
  const result = fixture();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /qualified for the current Worker rollback lock/);
});

test('current-lock verifier rejects stale qualification after the Worker lock version changes', () => {
  const result = fixture({
    mutateLock: (lock) => {
      lock.activeWorkerVersionId = 'worker-active-new';
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not qualified for the current Worker rollback lock/);
});

test('current-lock verifier rejects the same tuple when the PAGES-005 lock evidence digest changes', () => {
  const result = fixture({
    mutateLock: (lock) => {
      lock.finalEvidenceSha256 = hex('6');
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not qualified for the current Worker rollback lock/);
});

test('current-lock verifier rejects active and previous rows from different live evidence', () => {
  const result = fixture({
    mutateRows: (rows) => {
      rows[1].evidenceSha256 = hex('8');
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not qualified for the current Worker rollback lock/);
});

test('frontend verification carries the exact PAGES-005 evidence digest into append-only qualification rows', () => {
  assert.match(
    frontendVerifierSource,
    /evidence\.workerLockEvidenceSha256 = workerLock\.finalEvidenceSha256/,
  );
  assert.match(appendSource, /evidence\?\.workerLockIdentityVerified !== true/);
  assert.match(appendSource, /workerLockEvidenceSha256 = evidence\.workerLockEvidenceSha256/);
  assert.match(appendSource, /workerLockEvidenceSha256,/);
});

test('finalizer cannot early-exit on historical qualification before validating the current Worker lock', () => {
  const lockValidation = finalizerSource.indexOf("jq -e --arg apiOrigin \"$api_origin\"");
  const lockExtraction = finalizerSource.indexOf("active_worker=\"$(jq -r '.activeWorkerVersionId'");
  const currentLockVerification = finalizerSource.indexOf(
    'node scripts/verify-pages015-current-lock-qualification.mjs >/dev/null 2>&1',
  );
  const liveProbe = finalizerSource.indexOf('node scripts/probe-pages015-live-compatibility.mjs');
  const append = finalizerSource.indexOf('node scripts/append-pages015-qualification.mjs');

  assert.ok(lockValidation >= 0);
  assert.ok(lockExtraction > lockValidation);
  assert.ok(currentLockVerification > lockExtraction);
  assert.ok(liveProbe > currentLockVerification);
  assert.ok(append > liveProbe);
  assert.doesNotMatch(finalizerSource, /PAGES-015 locked window is already fully qualified\.'\n\s*exit 0/);
});

test('manual fallback cannot early-exit or commit without current Worker lock verification', () => {
  const verifierCalls = legacyWorkflowSource.match(/node scripts\/verify-pages015-current-lock-qualification\.mjs/g) || [];
  assert.ok(verifierCalls.length >= 2, 'manual fallback must verify current lock before early exit and after append');
  assert.match(legacyWorkflowSource, /\.protocolIdentity == "yakolak-online-room@1"/);
  assert.match(legacyWorkflowSource, /\.capabilityIdentity == "yakolak-online-room-capabilities-v1"/);
  assert.match(legacyWorkflowSource, /\.finalEvidenceSha256 \| test\("\^\[a-f0-9\]\{64\}\$"\)/);
  const earlyExit = legacyWorkflowSource.indexOf("echo 'already=true'");
  const firstCurrentLock = legacyWorkflowSource.indexOf('node scripts/verify-pages015-current-lock-qualification.mjs');
  const append = legacyWorkflowSource.indexOf('node scripts/append-pages015-qualification.mjs');
  const lastCurrentLock = legacyWorkflowSource.lastIndexOf('node scripts/verify-pages015-current-lock-qualification.mjs');
  const commit = legacyWorkflowSource.indexOf("git commit -m 'PAGES-015 qualify active+previous frontend/Worker window'");
  assert.ok(firstCurrentLock >= 0 && firstCurrentLock < earlyExit);
  assert.ok(append >= 0 && append < lastCurrentLock);
  assert.ok(lastCurrentLock < commit);
});
