import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { ASSET_LIST, ASSET_GROUPS, unavailableRequiredAssets } from '../web/app/assets/asset-manifest.js';
import { createAssetManager, AssetGroupNotReadyError } from '../web/app/assets/asset-manager.js';

const portable = JSON.parse(await readFile(new URL('../YAKOLAK_PORTABLE_KIT/assets/manifest.json', import.meta.url), 'utf8'));

function mockAsset({ id = 'test.asset', group = 'boot-critical', type = 'text', ready = true, required = true } = {}) {
  return Object.freeze({
    logicalId: id,
    group,
    source: Object.freeze({ path: `test/${id}`, role: 'test', required, gitBlobSha: 'a'.repeat(40), bytes: 4 }),
    runtime: Object.freeze({ url: ready ? `/assets/${id}?v=aaaaaaaaaaaa` : null, type, ready, plannedUrl: ready ? null : `/assets/runtime/${id}` }),
    runtimeRequired: required,
  });
}

function response(body, status = 200) {
  const bytes = new TextEncoder().encode(body);
  return new Response(bytes, { status, headers: { 'content-length': String(bytes.byteLength) } });
}

test('runtime manifest covers the definitive portable manifest exactly', () => {
  const sourcePaths = ASSET_LIST.map((asset) => asset.source.path).sort();
  const portablePaths = portable.assets.map((asset) => asset.path).sort();
  assert.deepEqual(sourcePaths, portablePaths);

  for (const item of portable.assets) {
    const runtime = ASSET_LIST.find((asset) => asset.source.path === item.path);
    assert.ok(runtime, `missing runtime manifest entry for ${item.path}`);
    assert.equal(runtime.source.required, item.required, `portable required flag drift for ${item.path}`);
    assert.match(runtime.source.gitBlobSha, /^[0-9a-f]{40}$/);
    assert.ok(ASSET_GROUPS[runtime.group], `unknown group for ${item.path}`);
  }
});

test('ready runtime URLs are local, immutable-versioned and boot group is loadable', () => {
  const ready = ASSET_LIST.filter((asset) => asset.runtime.ready);
  assert.ok(ready.length >= 5);
  for (const asset of ready) {
    assert.match(asset.runtime.url, /^\/assets\//);
    assert.match(asset.runtime.url, /\?v=[0-9a-f]{12}$/);
    assert.doesNotMatch(asset.runtime.url, /^https?:\/\//);
  }
  assert.deepEqual(unavailableRequiredAssets('boot-critical'), []);
});

test('scene-critical readiness is honest until conversion tasks land', () => {
  const blockers = unavailableRequiredAssets('scene-critical');
  const ids = blockers.map((asset) => asset.logicalId);
  assert.ok(ids.includes('model.board-and-lid'));
  assert.ok(ids.includes('model.player-base'));
  assert.ok(ids.includes('model.piece-small'));
  assert.ok(ids.includes('model.piece-medium'));
  assert.ok(ids.includes('model.piece-large'));
  assert.ok(ids.includes('model.score-marker'));
  assert.ok(ids.includes('scene.room-spec'));
});

test('manager deduplicates concurrent loads and caches successful results', async () => {
  const asset = mockAsset();
  let calls = 0;
  const manager = createAssetManager({
    manifest: [asset],
    fetchImpl: async () => {
      calls += 1;
      await Promise.resolve();
      return response('test');
    },
  });

  const first = manager.loadAsset(asset.logicalId);
  const second = manager.loadAsset(asset.logicalId);
  assert.equal(first, second, 'concurrent requests must share one loader promise');
  assert.equal(await first, 'test');
  assert.equal(await manager.loadAsset(asset.logicalId), 'test');
  assert.equal(calls, 1, 'cache/dedupe must prevent duplicate network loads');
});

test('failed assets require explicit retry and retry does not duplicate attempts', async () => {
  const asset = mockAsset({ id: 'retry.asset' });
  let calls = 0;
  const manager = createAssetManager({
    manifest: [asset],
    fetchImpl: async () => {
      calls += 1;
      return calls === 1 ? response('no', 503) : response('ok');
    },
  });

  await assert.rejects(manager.loadAsset(asset.logicalId), /HTTP 503/);
  await assert.rejects(manager.loadAsset(asset.logicalId), /HTTP 503|Previous attempt failed/);
  assert.equal(calls, 1, 'failed state must not secretly retry');
  assert.equal(await manager.loadAsset(asset.logicalId, { retry: true }), 'ok');
  assert.equal(calls, 2);
  assert.equal(manager.getState(asset.logicalId).attempts, 2);
});

test('group cancellation aborts in-flight work and leaves a cancellable state', async () => {
  const asset = mockAsset({ id: 'cancel.asset' });
  const manager = createAssetManager({
    manifest: [asset],
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true });
    }),
  });

  const operation = manager.startGroupLoad('boot-critical');
  operation.cancel('test-cancel');
  await assert.rejects(operation.promise, (error) => error?.name === 'AssetGroupLoadError' || error?.name === 'AbortError');
  assert.equal(manager.getState(asset.logicalId).status, 'cancelled');
});

test('required unavailable scene assets block the group before any fetch occurs', async () => {
  const blocked = mockAsset({ id: 'blocked.asset', group: 'scene-critical', ready: false, required: true });
  let calls = 0;
  const manager = createAssetManager({ manifest: [blocked], fetchImpl: async () => { calls += 1; return response('unexpected'); } });
  await assert.rejects(manager.loadGroup('scene-critical'), AssetGroupNotReadyError);
  assert.equal(calls, 0);
});

test('optional unavailable assets degrade to null without network fetch or authoritative guess', async () => {
  const optional = mockAsset({ id: 'optional.asset', group: 'optional', ready: false, required: false });
  let calls = 0;
  const manager = createAssetManager({ manifest: [optional], fetchImpl: async () => { calls += 1; return response('unexpected'); } });
  const result = await manager.loadGroup('optional');
  assert.equal(result.values.get(optional.logicalId), null);
  assert.equal(manager.getState(optional.logicalId).status, 'optional-unavailable');
  assert.equal(calls, 0);
});
