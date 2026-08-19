import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const scriptPath = new URL('../scripts/pages015-archive-window-entry-v2.sh', import.meta.url);
const source = fs.readFileSync(scriptPath, 'utf8');
const outputMarker = `> "$assets/IMMUTABLE_FACTS.json"`;
const factsEnd = source.indexOf(outputMarker);
assert.notEqual(factsEnd, -1, 'archive helper must generate IMMUTABLE_FACTS.json');
const factsStart = source.lastIndexOf('jq -n', factsEnd);
assert.notEqual(factsStart, -1, 'IMMUTABLE_FACTS generation must use deterministic jq');
const factsBlock = source.slice(factsStart, factsEnd + outputMarker.length);
const frontendWindow = JSON.parse(
  fs.readFileSync(new URL('../RELEASE_QUALIFICATION/ONLINE_FRONTEND_WINDOW.json', import.meta.url), 'utf8'),
);

const historicalOrder = [
  'schemaVersion: 1,',
  'releaseTag: $releaseTag,',
  'releaseTargetSha: $releaseTargetSha,',
  'source: {',
  'deploymentGeneration: $generation,',
  'contentIdentitySha256: $contentIdentity,',
  'liveManifestSha256: $liveManifestSha,',
  'pages014VerifierRunId: $pages014VerifierRunId,',
  'onlineCompatibilityDescriptorSha256: $descriptorSha,',
  'archives: {',
  'mutationPolicy: "immutable-release-bytes-never-change"',
];

const lockedFrontendWindow = {
  active: {
    releaseTag: 'pages-archive-2026-08-18-geeb3b8e1-t4e4e5dec',
    assetSha256: '3bb476e2ee76f372b9b945d160f6f1e9faad865eaacd9baef2b1384bd434fa5f',
    descriptorSha256: 'd309ec7ec33a613f56b81d9fe2adcb32fd70fe61b47080fb88dbaa6dd2a725f3',
    candidateSha: '4e4e5dec72ee71a06940c6db561dde8d24abd2d0',
    generation: 'sha256:984f30cf5df2117d86ae4c6fc304c0ad7b2efdf3dc4db3b3ab6557d16b7bba28',
    liveManifestSha256: 'ab6fed5a9d7b00e3f07da8ebd9e648525d62a86d19efebd116f2868eaa2f3b26',
  },
  previous: {
    releaseTag: 'pages-archive-2026-08-18-geeb3b8e1-t5cc89e05',
    assetSha256: '6769843ee45a807cffe8af8c8450e0afd7d08c45270e66512f1ad52462dfb560',
    descriptorSha256: '5084bf821578011dfa98a4fec994c74f445888e59a2ecc7b3f8c69a96e84c32b',
    candidateSha: '5cc89e05653b6461ed6a41332f374eaadb360945',
    generation: 'sha256:e4e2eaa97bcced485e456dd5a3e7f9ef2c0fad6db2255f8ce1f0bfaa88530b51',
    liveManifestSha256: '7acbfb04d9228fa4a0caef6b0d31b67b5f71117d54842861e0c2caa8341a77fa',
  },
};

test('PAGES-015 preserves the historical immutable-facts field order', () => {
  let previous = -1;
  for (const marker of historicalOrder) {
    const index = factsBlock.indexOf(marker);
    assert.ok(index > previous, `missing or out-of-order immutable fact: ${marker}`);
    assert.equal(factsBlock.indexOf(marker, index + marker.length), -1, `duplicate immutable fact marker: ${marker}`);
    previous = index;
  }
});

test('PAGES-015 immutable release asset contains facts, not later qualification state', () => {
  for (const forbidden of [
    'backendCompatibilityState',
    'deploymentGenerationState',
    'backend_compatibility_verified',
    'archive_verified',
    'deployment_generation_verified',
    'qualificationId',
    'safe: true',
    'verified: true',
  ]) {
    assert.equal(factsBlock.includes(forbidden), false, `qualification state leaked into IMMUTABLE_FACTS: ${forbidden}`);
  }
});

test('PAGES-014 job proof remains external while its immutable run identity stays in facts', () => {
  assert.match(factsBlock, /pages014VerifierRunId:\s*\$pages014VerifierRunId/);
  assert.equal(factsBlock.includes('pages014VerifierJobId'), false);
  assert.equal(factsBlock.includes('PAGES014_VERIFIER_JOB_ID'), false);
});

test('PAGES-015 active and previous immutable frontend identities remain exactly locked', () => {
  assert.equal(frontendWindow.schemaVersion, 1);
  assert.equal(frontendWindow.windowId, 'pages015-frontend-window-2026-08-18-v1');
  assert.equal(frontendWindow.rules?.thisFileDoesNotConferEligibility, true);
  assert.equal(frontendWindow.frontends?.length, 2);
  const byRole = new Map(frontendWindow.frontends.map((item) => [item.role, item]));
  assert.deepEqual([...byRole.keys()].sort(), ['active', 'previous']);

  for (const role of ['active', 'previous']) {
    const item = byRole.get(role);
    const locked = lockedFrontendWindow[role];
    assert.ok(item, `missing locked ${role} frontend`);
    assert.equal(item.releaseTag, locked.releaseTag);
    assert.equal(item.assetName, 'pages-composite.tar');
    assert.equal(item.assetSha256, locked.assetSha256);
    assert.equal(item.onlineCompatibilityDescriptorSha256, locked.descriptorSha256);
    assert.equal(item.threejsCandidateSha, locked.candidateSha);
    assert.equal(item.deploymentGeneration, locked.generation);
    assert.equal(item.pages014LiveEvidence?.liveManifestSha256, locked.liveManifestSha256);
    assert.equal(item.pages014LiveEvidence?.verified, true);
    assert.equal(item.pages014LiveEvidence?.pageUrl, 'https://a7sncom.github.io/yakolak/');
  }
});
