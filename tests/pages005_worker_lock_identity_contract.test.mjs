import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bootstrap = readFileSync(new URL('../scripts/pages005-bootstrap-live.sh', import.meta.url), 'utf8');
const orchestrator = readFileSync(new URL('../scripts/pages015-orchestrate-qualification.sh', import.meta.url), 'utf8');
const finalizer = readFileSync(new URL('../scripts/pages015-finalize-live-window.sh', import.meta.url), 'utf8');
const frontendVerifier = readFileSync(new URL('../scripts/verify-pages015-frontend-window.mjs', import.meta.url), 'utf8');
const legacy = readFileSync(new URL('../.github/workflows/pages-015-online-compatibility.yml', import.meta.url), 'utf8');

const expectedCapabilities = [
  'health.compatibility.v1',
  'room-probe.read.v1',
  'room-probe.write.v1',
];

test('PAGES-005 Worker rollback lock persists explicit protocol capability and Turso identity', () => {
  for (const field of [
    'protocolIdentity',
    'capabilityIdentity',
    'capabilities',
    'tursoSchemaId',
    'tursoSchemaVersion',
  ]) {
    assert.match(bootstrap, new RegExp(`${field}: \\$proof\\[0\\]\\.${field}`));
  }
  assert.match(bootstrap, /--slurpfile proof "\$final_evidence"/);
  assert.match(bootstrap, /\.protocolIdentity == "yakolak-online-room@1"/);
  assert.match(bootstrap, /\.capabilityIdentity == "yakolak-online-room-capabilities-v1"/);
  assert.match(bootstrap, /\.tursoSchemaId == "yakolak-pages005-room-probe"/);
  assert.match(bootstrap, /\.tursoSchemaVersion == 1/);
});

test('PAGES-015 refuses a Worker rollback lock with incomplete compatibility identity', () => {
  assert.match(orchestrator, /\.protocolIdentity == "yakolak-online-room@1"/);
  assert.match(orchestrator, /\.capabilityIdentity == "yakolak-online-room-capabilities-v1"/);
  assert.match(orchestrator, /\.tursoSchemaId == "yakolak-pages005-room-probe"/);
  assert.match(orchestrator, /\.tursoSchemaVersion == 1/);
  for (const capability of expectedCapabilities) {
    assert.match(orchestrator, new RegExp(`\\.capabilities \\| index\\("${capability.replaceAll('.', '\\.') }"\\)`));
  }
});

test('PAGES-015 finalizer binds the live Worker proof to the locked identity', () => {
  assert.match(finalizer, /\.protocolIdentity == "yakolak-online-room@1"/);
  assert.match(finalizer, /\.capabilityIdentity == "yakolak-online-room-capabilities-v1"/);
  assert.match(finalizer, /\.tursoSchemaId == "yakolak-pages005-room-probe"/);
  assert.match(finalizer, /\.tursoSchemaVersion == 1/);
  assert.match(finalizer, /locked_protocol_identity=/);
  assert.match(finalizer, /locked_capability_identity=/);
  assert.match(finalizer, /locked_capabilities_json=/);
  assert.match(finalizer, /locked_turso_schema_id=/);
  assert.match(finalizer, /locked_turso_schema_version=/);
  assert.match(finalizer, /\.protocolIdentity == \$protocol/);
  assert.match(finalizer, /\.capabilityIdentity == \$capability/);
  assert.match(finalizer, /\(\.capabilities \| sort\) == \$capabilities/);
  assert.match(finalizer, /\.tursoSchemaId == \$tursoId/);
  assert.match(finalizer, /\.tursoSchemaVersion == \$tursoVersion/);
  assert.match(finalizer, /\.workerVersionId == \$active/);
  assert.match(finalizer, /\.workerVersionId == \$previous/);
});

test('shared frontend verifier binds live evidence to the exact Worker lock before pairings', () => {
  assert.match(frontendVerifier, /WORKER_ROLLBACK_WINDOW\.json/);
  assert.match(frontendVerifier, /API_ORIGIN\.txt/);
  assert.match(frontendVerifier, /workerLock\?\.protocolIdentity !== evidence\.protocolIdentity/);
  assert.match(frontendVerifier, /workerLock\?\.capabilityIdentity !== evidence\.capabilityIdentity/);
  assert.match(frontendVerifier, /workerLock\?\.tursoSchemaId !== evidence\.tursoSchemaId/);
  assert.match(frontendVerifier, /workerLock\?\.tursoSchemaVersion !== evidence\.tursoSchemaVersion/);
  assert.match(frontendVerifier, /activeWorker\.workerVersionId !== workerLock\?\.activeWorkerVersionId/);
  assert.match(frontendVerifier, /previousWorker\.workerVersionId !== workerLock\?\.previousWorkerVersionId/);
  assert.match(frontendVerifier, /evidence\.workerLockIdentityVerified = true/);

  const finalizerVerify = finalizer.indexOf('node scripts/verify-pages015-frontend-window.mjs');
  const finalizerAppend = finalizer.indexOf('node scripts/append-pages015-qualification.mjs');
  assert.ok(finalizerVerify >= 0 && finalizerAppend > finalizerVerify, 'finalizer must bind Worker lock before ledger append');

  assert.match(legacy, /PAGES015_EVIDENCE_PATH: pages015-live-evidence\.json/);
  const legacyVerify = legacy.indexOf('node scripts/verify-pages015-frontend-window.mjs');
  const legacyAppend = legacy.indexOf('node scripts/append-pages015-qualification.mjs');
  assert.ok(legacyVerify >= 0 && legacyAppend > legacyVerify, 'manual fallback must bind Worker lock before ledger append');
});

test('PAGES-015 status receipt uses the bound jq readiness variables', () => {
  assert.match(orchestrator, /activeArchiveQualified: \$activeArchiveReady/);
  assert.match(orchestrator, /previousArchiveQualified: \$previousArchiveReady/);
  assert.match(orchestrator, /workerRollbackWindowLocked: \$workerWindowReady/);
  assert.doesNotMatch(orchestrator, /previousArchiveQualified: \$previous_archive/);
});
