import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const pairs = Object.freeze([
  ['YAKOLAK_PORTABLE_KIT/assets/ui/loading-star.svg', 'web/assets/kit/ui/loading-star.svg', 'text'],
  ['YAKOLAK_PORTABLE_KIT/assets/layout/world-layout.json', 'web/assets/kit/layout/world-layout.json', 'json'],
  ['YAKOLAK_PORTABLE_KIT/assets/layout/intro-scatter.csv', 'web/assets/kit/layout/intro-scatter.csv', 'text'],
  ['YAKOLAK_PORTABLE_KIT/assets/reference/approved-contract.json', 'web/assets/kit/reference/approved-contract.json', 'json'],
  ['YAKOLAK_PORTABLE_KIT/assets/table/table.svg', 'web/assets/kit/table/table.svg', 'text'],
]);

test('staged runtime kit copies cannot drift from canonical portable sources', async () => {
  for (const [sourcePath, runtimePath, mode] of pairs) {
    const [source, runtime] = await Promise.all([read(sourcePath), read(runtimePath)]);
    if (mode === 'json') {
      assert.deepEqual(JSON.parse(runtime), JSON.parse(source), `${runtimePath} semantic content drifted from ${sourcePath}`);
    } else {
      assert.equal(runtime, source, `${runtimePath} byte/text content drifted from ${sourcePath}`);
    }
  }
});

test('boot-critical assets load before renderer composition', async () => {
  const boot = await read('web/app/boot/boot.js');
  const loadIndex = boot.indexOf("await assetManager.loadGroup('boot-critical')");
  const rendererIndex = boot.indexOf('createRendererOwner({ mount: appElement })');
  assert.ok(loadIndex >= 0, 'boot must load boot-critical assets');
  assert.ok(rendererIndex >= 0, 'boot must create renderer after asset validation');
  assert.ok(loadIndex < rendererIndex, 'required assets must be ready before renderer composition');
  assert.match(boot, /dataset\.assetState = 'boot-critical-ready'/);
  assert.match(boot, /dataset\.bootState = 'asset-load-failed'/);
  assert.match(boot, /Required startup assets failed/);
});
