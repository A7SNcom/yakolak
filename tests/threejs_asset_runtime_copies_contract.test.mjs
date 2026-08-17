import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { ASSET_LIST } from '../web/app/assets/asset-manifest.js';

function gitBlobSha(bytes) {
  return createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex');
}

test('all generated runtime copies exactly match canonical portable assets', async () => {
  for (const asset of ASSET_LIST) {
    const source = await readFile(new URL(`../YAKOLAK_PORTABLE_KIT/assets/${asset.source.path}`, import.meta.url));
    const runtime = await readFile(new URL(`../web/runtime-assets/${asset.source.path}`, import.meta.url));
    assert.deepEqual(runtime, source, `runtime copy drifted: ${asset.source.path}`);
    assert.equal(runtime.byteLength, asset.source.bytes);
    assert.equal(gitBlobSha(runtime), asset.source.gitBlobSha);
  }
});

test('boot and scene required groups gate scene/shell exposure in order', async () => {
  const boot = await readFile(new URL('../web/app/boot/boot.js', import.meta.url), 'utf8');
  const bootLoad = boot.indexOf("await assetManager.loadGroup('boot-critical'");
  const rendererCreate = boot.indexOf('rendererOwner = createRendererOwner({ mount: appElement })');
  const sceneLoad = boot.indexOf("await assetManager.loadGroup('scene-critical'");
  const sceneCreate = boot.indexOf('previewScene = createPreviewScene(rendererOwner');
  const exposeCall = boot.indexOf('exposeReadyShell();', sceneLoad);

  assert.ok(bootLoad >= 0 && rendererCreate > bootLoad, 'boot-critical must gate renderer composition');
  assert.ok(sceneLoad > rendererCreate, 'scene-critical must load after renderer/loading surface exists');
  assert.ok(sceneCreate > sceneLoad, 'playable scene must wait for scene-critical assets');
  assert.ok(exposeCall > sceneLoad, 'game shell must not be exposed before required scene assets');
  assert.match(boot, /dataset\.bootState = 'asset-load-failed'/);
  assert.match(boot, /assetManager\.loadGroup\('optional'\)/);
});
