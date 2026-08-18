import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bootstrap = readFileSync(new URL('../scripts/pages005-bootstrap-live.sh', import.meta.url), 'utf8');
const orchestrator = readFileSync(new URL('../scripts/pages015-orchestrate-qualification.sh', import.meta.url), 'utf8');

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

test('PAGES-015 status receipt uses the bound jq readiness variables', () => {
  assert.match(orchestrator, /activeArchiveQualified: \$activeArchiveReady/);
  assert.match(orchestrator, /previousArchiveQualified: \$previousArchiveReady/);
  assert.match(orchestrator, /workerRollbackWindowLocked: \$workerWindowReady/);
  assert.doesNotMatch(orchestrator, /previousArchiveQualified: \$previous_archive/);
});
