import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  THREEJS061_LIVE_URL,
  assertThreejs061RootStillGodot,
  deriveThreejs061PagesUrls,
  normalizeThreejs061LiveUrl,
  sha256Hex,
  validateThreejs061DeploymentManifest,
  validateThreejs061RuntimeConfig,
} from '../scripts/threejs061-live-acceptance-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runnerSource = readFileSync(path.join(root, 'scripts/verify-threejs061-live-local.mjs'), 'utf8');
const workflowSource = readFileSync(path.join(root, '.github/workflows/threejs-optional-checks.yml'), 'utf8');

const candidate = '5e336ba4b850f2c3a00b05dd150e62fb77109a88';
const rootSha = '0123456789abcdef0123456789abcdef01234567';
const runtimeConfig = Buffer.from(`${JSON.stringify({
  frontendSha: candidate,
  protocolVersion: '1',
  apiOrigin: null,
  environment: 'production',
  branch: 'threejs-rebuild',
  apiOriginState: 'absent',
}, null, 2)}\n`);
const runtimeHash = sha256Hex(runtimeConfig);
const manifest = {
  schemaVersion: 1,
  generationSchema: 'pages-deployment-generation-v1',
  deploymentGeneration: `sha256:${'a'.repeat(64)}`,
  godotRootSha: rootSha,
  threejsCandidateSha: candidate,
  publicRuntimeProtocol: { sha256: runtimeHash, protocolVersion: '1' },
  contentIdentity: {
    algorithm: 'sha256-canonical-file-manifest-v1',
    sha256: 'b'.repeat(64),
    excludes: ['deployment-manifest.json'],
  },
};

assert.equal(THREEJS061_LIVE_URL, 'https://a7sncom.github.io/yakolak/threejs/');
assert.equal(normalizeThreejs061LiveUrl(), THREEJS061_LIVE_URL);
assert.throws(() => normalizeThreejs061LiveUrl('http://127.0.0.1:4173/'), /threejs061_live_url_must_be_exact_pages_candidate/);
assert.throws(() => normalizeThreejs061LiveUrl('https://a7sncom.github.io/yakolak/'), /threejs061_live_url_must_be_exact_pages_candidate/);
assert.throws(() => normalizeThreejs061LiveUrl('https://a7sncom.github.io/yakolak/threejs/?stale=1'), /threejs061_live_url_must_be_exact_pages_candidate/);

assert.deepEqual(deriveThreejs061PagesUrls(), {
  threejsUrl: 'https://a7sncom.github.io/yakolak/threejs/',
  rootUrl: 'https://a7sncom.github.io/yakolak/',
  manifestUrl: 'https://a7sncom.github.io/yakolak/deployment-manifest.json',
  runtimeConfigUrl: 'https://a7sncom.github.io/yakolak/threejs/runtime-config.json',
});

const identity = validateThreejs061DeploymentManifest(manifest, { expectedCandidateSha: candidate });
assert.equal(identity.deploymentGeneration, manifest.deploymentGeneration);
assert.equal(identity.godotRootSha, rootSha);
assert.equal(identity.threejsCandidateSha, candidate);
assert.equal(identity.publicRuntimeProtocolSha256, runtimeHash);
assert.equal(identity.protocolVersion, '1');
assert.equal(identity.contentIdentitySha256, 'b'.repeat(64));
assert.throws(() => validateThreejs061DeploymentManifest({ ...manifest, threejsCandidateSha: rootSha }, { expectedCandidateSha: candidate }), /threejs061_live_candidate_mismatch/);
assert.throws(() => validateThreejs061DeploymentManifest({ ...manifest, deploymentGeneration: candidate }, { expectedCandidateSha: candidate }), /threejs061_invalid_deployment_generation/);
assert.throws(() => validateThreejs061DeploymentManifest({ ...manifest, schemaVersion: 2 }, { expectedCandidateSha: candidate }), /threejs061_manifest_schema_version_mismatch/);

const runtimeIdentity = validateThreejs061RuntimeConfig(runtimeConfig, identity);
assert.equal(runtimeIdentity.frontendSha, candidate);
assert.equal(runtimeIdentity.sha256, runtimeHash);
assert.equal(runtimeIdentity.environment, 'production');
assert.throws(() => validateThreejs061RuntimeConfig(Buffer.from('{}\n'), identity), /threejs061_runtime_config_hash_mismatch/);

assert.equal(assertThreejs061RootStillGodot('<html>Godot game</html>', '<html>THREEJS REBUILD</html>'), true);
assert.throws(() => assertThreejs061RootStillGodot('<p>THREEJS REBUILD</p>', '<p>THREEJS REBUILD</p>'), /threejs061_root_no_longer_godot/);
assert.throws(() => assertThreejs061RootStillGodot('<p>Godot</p>', '<p>preview</p>'), /threejs061_threejs_marker_missing/);

// The runner must be exact-generation live acceptance, never a local/dev-server substitute.
assert.match(runnerSource, /THREEJS061_EXPECTED_CANDIDATE_SHA/);
assert.match(runnerSource, /waitForExactLiveGeneration/);
assert.match(runnerSource, /validateThreejs061DeploymentManifest/);
assert.match(runnerSource, /validateThreejs061RuntimeConfig/);
assert.match(runnerSource, /assertThreejs061RootStillGodot/);
assert.doesNotMatch(runnerSource, /127\.0\.0\.1|localhost|python3 -m http\.server/);

// Representative full matches are required for all-human and Human+Computer at 2/3/4 seats.
assert.match(runnerSource, /for \(const playerCount of \[2, 3, 4\]\)/);
assert.match(runnerSource, /playFullMatch\(\{ playerCount, mixed: false \}\)/);
assert.match(runnerSource, /playFullMatch\(\{ playerCount, mixed: true \}\)/);
assert.match(runnerSource, /winsToMatch:\s*3/);
assert.match(runnerSource, /matchWinner\?\.wins !== 3/);
assert.match(runnerSource, /createComputerTurnProducer/);

// Required acceptance dimensions must be explicit in the live evidence path.
for (const required of [
  '18_000',
  'createExpiredLocalTimeoutIntent',
  'canonical skip order mismatch',
  'true draw mismatch',
  'createLocalRestartRequest',
  'createLocalRematchRequest',
  'canonical-serialized-snapshot-across-real-page-reload',
  'WEBGL_lose_context',
  'APP_BASE_URL',
  'DRAG_RELEASE',
  'KEYBOARD_CONFIRM',
  'GAMEPAD_CONFIRM',
  'GAMEPLAY_PRESENTATION_SOURCES.TAP',
  'GAMEPLAY_PRESENTATION_SOURCES.CLICK',
]) assert.match(runnerSource, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

assert.match(runnerSource, /threejs061-live-local-evidence\.json/);
assert.match(runnerSource, /status = 'passed'/);
assert.match(runnerSource, /status = 'failed'/);

// Workflow remains manual-only; live-local must require an explicit candidate SHA and upload evidence.
assert.match(workflowSource, /workflow_dispatch:/);
assert.match(workflowSource, /live-local/);
assert.match(workflowSource, /expected_candidate_sha/);
assert.match(workflowSource, /THREEJS061_EXPECTED_CANDIDATE_SHA/);
assert.match(workflowSource, /verify-threejs061-live-local\.mjs/);
assert.match(workflowSource, /threejs061-live-local-evidence/);
assert.doesNotMatch(workflowSource, /push:/);

console.log('THREEJS-061 live Pages acceptance contract: PASS');
