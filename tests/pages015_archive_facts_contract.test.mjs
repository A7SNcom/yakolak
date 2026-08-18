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
