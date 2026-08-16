import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  ASSET_LIST,
  ASSET_GROUPS,
  ASSETS,
  PORTABLE_MANIFEST,
  runtimePayloadBytes,
  runtimePayloadGitBlobSha,
  unavailableRequiredAssets,
} from '../web/app/assets/asset-manifest.js';
import {
  AssetGroupLoadError,
  AssetIntegrityError,
  AssetLoadCancelledError,
  createAssetManager,
} from '../web/app/assets/asset-manager.js';

const portableBytes = await readFile(new URL('../YAKOLAK_PORTABLE_KIT/assets/manifest.json', import.meta.url));
const portable = JSON.parse(portableBytes.toString('utf8'));

function gitBlobSha(bytes) {
  return createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex');
}

function mockAsset({ id = 'test.asset', group = 'boot-critical', body = 'test', required = true, type = 'text', sha = null, bytes = null } = {}) {
  const bodyBytes = new TextEncoder().encode(body);
  const hash = sha || gitBlobSha(bodyBytes);
  return Object.freeze({
    logicalId: id,
    group,
    source: Object.freeze({ path: `test/${id}`, role: 'test', required, gitBlobSha: hash, bytes: bytes ?? bodyBytes.byteLength }),
    runtime: Object.freeze({ url: `/runtime-assets/test/${id}?v=${hash}`, type, ready: true, versionId: `git:${hash}`, integrity: `git-blob-sha1:${hash}` }),
    runtimeRequired: required,
  });
}

function response(body, status = 200) {
  const bytes = new TextEncoder().encode(body);
  return new Response(bytes, { status, headers: { 'content-length': String(bytes.byteLength) } });
}

test('runtime manifest exactly covers definitive portable sources while derived payloads keep their own immutable identities', () => {
  assert.equal(gitBlobSha(portableBytes), PORTABLE_MANIFEST.gitBlobSha);
  assert.deepEqual(ASSET_LIST.map((asset) => asset.source.path).sort(), portable.assets.map((asset) => asset.path).sort());
  assert.equal(ASSET_LIST.length, 18);

  for (const portableEntry of portable.assets) {
    const asset = ASSET_LIST.find((entry) => entry.source.path === portableEntry.path);
    assert.ok(asset);
    assert.equal(asset.source.required, portableEntry.required);
    assert.equal(asset.runtimeRequired, portableEntry.required);
    assert.ok(ASSET_GROUPS[asset.group]);
    assert.match(asset.source.gitBlobSha, /^[0-9a-f]{40}$/);
    assert.match(runtimePayloadGitBlobSha(asset), /^[0-9a-f]{40}$/);
    assert.ok(Number.isInteger(runtimePayloadBytes(asset)) && runtimePayloadBytes(asset) > 0);
    assert.equal(asset.runtime.versionId, `git:${runtimePayloadGitBlobSha(asset)}`);
    assert.equal(asset.runtime.integrity, `git-blob-sha1:${runtimePayloadGitBlobSha(asset)}`);
    assert.match(asset.runtime.url, new RegExp(`\\?v=${runtimePayloadGitBlobSha(asset)}$`));
    if (portableEntry.required) assert.equal(ASSET_GROUPS[asset.group].blocking, true);
    else assert.equal(asset.group, 'optional');
  }

  assert.equal(ASSETS.boardAndLid.source.path, 'models/board-and-lid.stl');
  assert.equal(ASSETS.boardAndLid.source.gitBlobSha, '024d109cea081d65eedc067b2fdaac46c9c10227');
  assert.equal(ASSETS.boardAndLid.runtime.type, 'glb-components');
  assert.equal(ASSETS.boardAndLid.runtime.url, '/assets/models/board-and-lid.glb?v=9a7e3410f641735e08a2944efa366cca2a66ee99');
  assert.equal(runtimePayloadBytes(ASSETS.boardAndLid), 2595544);
  assert.equal(runtimePayloadGitBlobSha(ASSETS.boardAndLid), '9a7e3410f641735e08a2944efa366cca2a66ee99');

  assert.deepEqual(unavailableRequiredAssets('boot-critical'), []);
  assert.deepEqual(unavailableRequiredAssets('scene-critical'), []);
});

test('concurrent group loads deduplicate to one operation', async () => {
  const asset = mockAsset();
  let calls = 0;
  const manager = createAssetManager({ manifest: [asset], fetchImpl: async () => { calls += 1; await Promise.resolve(); return response('test'); } });
  const first = manager.loadGroup('boot-critical');
  const second = manager.loadGroup('boot-critical');
  assert.equal(first, second);
  await first;
  assert.equal(calls, 1);
  assert.equal(manager.get(asset.logicalId), 'test');
  assert.equal(manager.snapshot('boot-critical').status, 'ready');
});

test('required group failure rolls back successful siblings and exposes no partial cache', async () => {
  const good = mockAsset({ id: 'good.asset', body: 'good' });
  const missing = mockAsset({ id: 'missing.asset', body: 'miss' });
  const manager = createAssetManager({
    manifest: [good, missing],
    fetchImpl: async (url) => url.includes('missing.asset') ? response('nope', 503) : response('good'),
  });
  await assert.rejects(manager.loadGroup('boot-critical'), AssetGroupLoadError);
  assert.equal(manager.get(good.logicalId), undefined);
  assert.equal(manager.get(missing.logicalId), undefined);
  assert.equal(manager.snapshot('boot-critical').status, 'failed');
});

test('integrity mismatch fails closed for required assets', async () => {
  const badSha = 'a'.repeat(40);
  const asset = mockAsset({ id: 'integrity.asset', body: 'test', sha: badSha });
  const manager = createAssetManager({ manifest: [asset], fetchImpl: async () => response('test') });
  await assert.rejects(manager.loadGroup('boot-critical'), (error) => {
    assert.equal(error.name, 'AssetGroupLoadError');
    assert.equal(error.failures[0].name, AssetIntegrityError.name);
    return true;
  });
  assert.equal(manager.get(asset.logicalId), undefined);
});

test('optional failures degrade safely while successful optional assets commit', async () => {
  const good = mockAsset({ id: 'optional.good', group: 'optional', body: 'good', required: false });
  const bad = mockAsset({ id: 'optional.bad', group: 'optional', body: 'bad!', required: false });
  const manager = createAssetManager({
    manifest: [good, bad],
    fetchImpl: async (url) => url.includes('optional.bad') ? response('nope', 404) : response('good'),
  });
  const result = await manager.loadGroup('optional');
  assert.equal(result.progress.status, 'degraded');
  assert.equal(manager.get(good.logicalId), 'good');
  assert.equal(manager.get(bad.logicalId), undefined);
});

test('cancellation rolls back staged required resources', async () => {
  const asset = mockAsset({ id: 'cancel.asset' });
  const manager = createAssetManager({
    manifest: [asset],
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true })),
  });
  const operation = manager.startGroupLoad('boot-critical');
  operation.cancel('test-cancel');
  await assert.rejects(operation.promise, AssetLoadCancelledError);
  assert.equal(manager.snapshot('boot-critical').status, 'cancelled');
  assert.equal(manager.get(asset.logicalId), undefined);
});

test('explicit retry starts exactly one fresh group run after failure', async () => {
  const asset = mockAsset({ id: 'retry.asset' });
  let calls = 0;
  const manager = createAssetManager({
    manifest: [asset],
    fetchImpl: async () => {
      calls += 1;
      return calls === 1 ? response('nope', 503) : response('test');
    },
  });
  await assert.rejects(manager.loadGroup('boot-critical'), AssetGroupLoadError);
  const firstRetry = manager.loadGroup('boot-critical', { retry: true });
  const duplicateRetry = manager.loadGroup('boot-critical', { retry: true });
  assert.equal(firstRetry, duplicateRetry);
  await firstRetry;
  assert.equal(calls, 2);
  assert.equal(manager.snapshot('boot-critical').attempt, 2);
  assert.equal(manager.get(asset.logicalId), 'test');
});
