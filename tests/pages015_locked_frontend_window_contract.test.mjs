import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const window = JSON.parse(
  readFileSync(new URL('../RELEASE_QUALIFICATION/ONLINE_FRONTEND_WINDOW.json', import.meta.url), 'utf8'),
);

const expected = {
  active: {
    releaseTag: 'pages-archive-2026-08-18-geeb3b8e1-t4e4e5dec',
    assetSha256: '3bb476e2ee76f372b9b945d160f6f1e9faad865eaacd9baef2b1384bd434fa5f',
    onlineCompatibilityDescriptorSha256: 'd309ec7ec33a613f56b81d9fe2adcb32fd70fe61b47080fb88dbaa6dd2a725f3',
    threejsCandidateSha: '4e4e5dec72ee71a06940c6db561dde8d24abd2d0',
    deploymentGeneration: 'sha256:984f30cf5df2117d86ae4c6fc304c0ad7b2efdf3dc4db3b3ab6557d16b7bba28',
    liveManifestSha256: 'ab6fed5a9d7b00e3f07da8ebd9e648525d62a86d19efebd116f2868eaa2f3b26',
  },
  previous: {
    releaseTag: 'pages-archive-2026-08-18-geeb3b8e1-t5cc89e05',
    assetSha256: '6769843ee45a807cffe8af8c8450e0afd7d08c45270e66512f1ad52462dfb560',
    onlineCompatibilityDescriptorSha256: '5084bf821578011dfa98a4fec994c74f445888e59a2ecc7b3f8c69a96e84c32b',
    threejsCandidateSha: '5cc89e05653b6461ed6a41332f374eaadb360945',
    deploymentGeneration: 'sha256:e4e2eaa97bcced485e456dd5a3e7f9ef2c0fad6db2255f8ce1f0bfaa88530b51',
    liveManifestSha256: '7acbfb04d9228fa4a0caef6b0d31b67b5f71117d54842861e0c2caa8341a77fa',
  },
};

test('PAGES-015 exact active and previous immutable frontend keys stay locked until qualification completes', () => {
  assert.equal(window.schemaVersion, 1);
  assert.equal(window.windowId, 'pages015-frontend-window-2026-08-18-v1');
  assert.equal(window.rules?.thisFileDoesNotConferEligibility, true);
  assert.equal(window.frontends?.length, 2);

  const byRole = new Map(window.frontends.map((item) => [item.role, item]));
  assert.deepEqual([...byRole.keys()].sort(), ['active', 'previous']);

  for (const role of ['active', 'previous']) {
    const item = byRole.get(role);
    const locked = expected[role];
    assert.ok(item, `missing ${role} frontend`);
    assert.equal(item.releaseTag, locked.releaseTag);
    assert.equal(item.assetName, 'pages-composite.tar');
    assert.equal(item.assetSha256, locked.assetSha256);
    assert.equal(item.onlineCompatibilityDescriptorSha256, locked.onlineCompatibilityDescriptorSha256);
    assert.equal(item.threejsCandidateSha, locked.threejsCandidateSha);
    assert.equal(item.deploymentGeneration, locked.deploymentGeneration);
    assert.equal(item.pages014LiveEvidence?.liveManifestSha256, locked.liveManifestSha256);
    assert.equal(item.pages014LiveEvidence?.verified, true);
    assert.equal(item.pages014LiveEvidence?.pageUrl, 'https://a7sncom.github.io/yakolak/');
  }
});
