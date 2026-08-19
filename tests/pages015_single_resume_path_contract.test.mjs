import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const legacy = readFileSync(new URL('../.github/workflows/pages-015-online-compatibility.yml', import.meta.url), 'utf8');
const archive = readFileSync(new URL('../.github/workflows/pages-015-window-archive.yml', import.meta.url), 'utf8');
const pages005 = readFileSync(new URL('../.github/workflows/pages-005-cloudflare-backend.yml', import.meta.url), 'utf8');
const pages012 = readFileSync(new URL('../.github/workflows/pages-012-immutable-release.yml', import.meta.url), 'utf8');
const rollback = readFileSync(new URL('../.github/workflows/pages-012-rollback.yml', import.meta.url), 'utf8');
const orchestrator = readFileSync(new URL('../scripts/pages015-orchestrate-qualification.sh', import.meta.url), 'utf8');

function onBlock(yaml) {
  const start = yaml.indexOf('on:\n');
  assert.ok(start >= 0, 'workflow must declare on:');
  const permissions = yaml.indexOf('\npermissions:', start);
  assert.ok(permissions > start, 'workflow must declare permissions after on:');
  return yaml.slice(start, permissions);
}

function sharedLedgerLock(yaml) {
  assert.match(yaml, /concurrency:\n\s+group: pages-release-qualification-ledger\n\s+cancel-in-progress: false/);
}

test('legacy PAGES-015 compatibility workflow is manual fallback only', () => {
  const block = onBlock(legacy);
  assert.match(block, /workflow_dispatch:/);
  assert.doesNotMatch(block, /\bpush:/);
  assert.doesNotMatch(block, /\bschedule:/);
});

test('legacy fallback keeps a distinct manual-only identity and shared ledger lock', () => {
  assert.match(legacy, /^name: PAGES-015 online compatibility qualification/m);
  assert.match(legacy, /backend_compatibility_verified|append-pages015-qualification/);
  sharedLedgerLock(legacy);
});

test('PAGES-015 archive fallback is manual-only and shares the qualification-ledger lock', () => {
  assert.match(archive, /^name: PAGES-015 Frontend Window Archive/m);
  assert.match(archive, /archive_verified|pages015-archive-window-entry-v2\.sh/);
  const block = onBlock(archive);
  assert.match(block, /workflow_dispatch:/);
  assert.doesNotMatch(block, /\bpush:/);
  assert.doesNotMatch(block, /\bschedule:/);
  assert.doesNotMatch(block, /\bworkflow_run:/);
  sharedLedgerLock(archive);
});

test('PAGES-005 may verify on push but live deploy stays manual-only and serialized with PAGES-015', () => {
  assert.match(onBlock(pages005), /\bpush:/);
  const deploy = pages005.indexOf('\n  deploy:\n');
  assert.ok(deploy >= 0, 'PAGES-005 workflow must keep a deploy job');
  const deployBlock = pages005.slice(deploy);
  assert.match(deployBlock, /if: github\.event_name == 'workflow_dispatch'/);
  assert.match(deployBlock, /bash scripts\/pages005-bootstrap-live\.sh/);
  sharedLedgerLock(deployBlock);
});

test('historical PAGES-012 release workflow is retired, manual-only, and read-only', () => {
  assert.match(pages012, /^name: PAGES-012 Immutable Release Archive/m);
  const block = onBlock(pages012);
  assert.match(block, /workflow_dispatch:/);
  assert.doesNotMatch(block, /\bpush:/);
  assert.doesNotMatch(block, /\bschedule:/);
  assert.doesNotMatch(block, /\bworkflow_run:/);
  sharedLedgerLock(pages012);
  assert.match(pages012, /permissions:\n\s+contents: read/);
  assert.match(pages012, /historical evidence only/);
  assert.match(pages012, /PAGES-015 Frontend Window Archive/);
  for (const forbidden of [
    'contents: write',
    'PAGES_RELEASE_ADMIN_TOKEN',
    'RELEASE_QUALIFICATION/ledger.jsonl',
    'gh release',
    'git push',
    'archive_verified',
    'draft_staged',
  ]) {
    assert.ok(!pages012.includes(forbidden), `retired PAGES-012 workflow must not contain ${forbidden}`);
  }
});

test('public exact-byte rollback is current-window compatibility gated while non-production restore stays available', () => {
  assert.match(rollback, /^name: PAGES-012 Immutable Exact-Byte Rollback/m);
  sharedLedgerLock(rollback);
  assert.match(rollback, /deploy_pages:\n\s+description: Deploy to GitHub Pages after verification[\s\S]*?default: false/);
  assert.match(rollback, /Non-production restore proof/);
  assert.match(rollback, /if: steps\.mode\.outputs\.deploy != 'true'/);
  assert.match(rollback, /ONLINE_FRONTEND_WINDOW\.json/);
  assert.match(rollback, /verify-release-qualification\.mjs/);
  const currentLockCalls = rollback.match(/verify-pages015-current-lock-qualification\.mjs/g) || [];
  assert.ok(currentLockCalls.length >= 2, 'public rollback must validate the current Worker lock before upload and deploy');

  const preUploadQualification = rollback.indexOf('Require current PAGES-015 compatibility before public rollback upload');
  const upload = rollback.indexOf('uses: actions/upload-pages-artifact@v4');
  const finalQualification = rollback.indexOf('Fail closed if the compatibility window changed before deploy');
  const deploy = rollback.indexOf('uses: actions/deploy-pages@v4');
  const liveIdentity = rollback.indexOf('Prove live rollback generation equals the locked immutable archive');
  const smoke = rollback.indexOf('HTTP smoke restored root and Three.js');
  assert.ok(preUploadQualification >= 0 && upload > preUploadQualification);
  assert.ok(finalQualification >= 0 && deploy > finalQualification);
  assert.ok(liveIdentity > deploy && smoke > liveIdentity, 'live manifest identity proof must run after deploy and before smoke success');
  assert.match(rollback, /pages014LiveEvidence\.liveManifestSha256/);
  assert.match(rollback, /\.deploymentGeneration/);
  assert.match(rollback, /Cache-Control: no-cache, no-store, must-revalidate/);
  assert.match(rollback, /live_sha.*expected_manifest_sha/);
  assert.match(rollback, /live_generation.*expected_generation/);

  const deployJob = rollback.slice(rollback.indexOf('\n  deploy:\n'));
  assert.match(deployJob, /concurrency:\n\s+group: yakolak-pages-composite\n\s+cancel-in-progress: false/);
});

test('authoritative orchestrator cannot report complete or early-exit on stale Worker qualification', () => {
  const archiveStart = orchestrator.indexOf('archive_key_ready() {');
  const archiveEnd = orchestrator.indexOf('\n}\n\nworker_window_ready()', archiveStart);
  assert.ok(archiveStart >= 0 && archiveEnd > archiveStart, 'archive_key_ready helper must exist');
  const archiveReady = orchestrator.slice(archiveStart, archiveEnd);
  for (const marker of [
    '.godotRootSha == $root',
    '.threejsCandidateSha == $candidate',
    '.deploymentGenerationInArchive == $generation',
    '.publicRuntimeProtocolSha256 == $runtime',
    '.protocolVersion == "1"',
    '.contentIdentitySha256 == $content',
    '.pagesDeploymentStatus == "succeed"',
    '.liveManifestSha256 == $liveManifest',
    '.pages014VerifierWorkflowRunId == $verifierRun',
    '.pages014VerifierJobId == $verifierJob',
    '.sourceCompositeRunId == $sourceRun',
  ]) {
    assert.ok(archiveReady.includes(marker), `archive readiness must bind ${marker}`);
  }

  const functionStart = orchestrator.indexOf('full_qualification_ready() {');
  const functionEnd = orchestrator.indexOf('\n}\n\nrecord_status()', functionStart);
  assert.ok(functionStart >= 0 && functionEnd > functionStart, 'full_qualification_ready helper must exist');
  const helper = orchestrator.slice(functionStart, functionEnd);
  const activeStrict = helper.indexOf('verify-release-qualification.mjs "$active_tag" "$active_digest"');
  const previousStrict = helper.indexOf('verify-release-qualification.mjs "$previous_tag" "$previous_digest"');
  const currentLock = helper.indexOf('verify-pages015-current-lock-qualification.mjs');
  assert.ok(activeStrict >= 0 && previousStrict > activeStrict && currentLock > previousStrict);

  const statusComplete = orchestrator.indexOf('full_qualification_ready && complete=true');
  const earlyExit = orchestrator.indexOf('if full_qualification_ready; then');
  const finalizer = orchestrator.indexOf('bash scripts/pages015-finalize-live-window.sh');
  const postFinalizer = orchestrator.indexOf("full_qualification_ready || { echo 'finalizer returned without complete current-lock qualification'");
  assert.ok(statusComplete > functionEnd, 'status complete must use current-lock-bound helper');
  assert.ok(earlyExit > statusComplete, 'early completion must use current-lock-bound helper');
  assert.ok(finalizer > earlyExit && postFinalizer > finalizer, 'post-finalizer completion must re-use current-lock-bound helper');
  assert.match(orchestrator, /already fully qualified for both immutable frontend keys and the current Worker rollback lock/);
});
