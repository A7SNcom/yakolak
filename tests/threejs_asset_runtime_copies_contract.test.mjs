import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

import { ASSET_LIST, ASSETS, runtimeAssetUrl } from '../web/app/assets/asset-manifest.js';

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

test('THREEJS-028 locks zero-font delivery and semantic static-asset provenance', async () => {
  const webRoot = new URL('../web/', import.meta.url);
  const entries = (await readdir(webRoot, { recursive: true })).map((entry) => String(entry).replaceAll('\\', '/'));
  const packagedFonts = entries.filter((entry) => /\.(?:woff2?|ttf|otf)$/i.test(entry));
  assert.deepEqual(packagedFonts, [], 'current Pages candidate must keep the PAGES-010 zero-font-file baseline');

  const cssFiles = entries.filter((entry) => /\.css$/i.test(entry));
  for (const relativePath of cssFiles) {
    const css = await readFile(new URL(relativePath, webRoot), 'utf8');
    assert.doesNotMatch(css, /@font-face/i, `${relativePath} must not introduce packaged fonts implicitly`);
  }

  const appCss = await readFile(new URL('../web/styles/app.css', import.meta.url), 'utf8');
  assert.match(appCss, /font-family:[^;]*system-ui[^;]*sans-serif/i, 'system fallback stack must remain explicit');
  assert.doesNotMatch(appCss, /Thmanyah/i, 'historical Thmanyah Sans must not enter Pages without an explicit admission change');

  const portable = JSON.parse(await readFile(new URL('../YAKOLAK_PORTABLE_KIT/assets/manifest.json', import.meta.url), 'utf8'));
  assert.ok(portable.excluded.includes('fonts'), 'portable kit must explicitly exclude historical fonts');
  assert.ok(portable.excluded.includes('duplicate_logos'), 'portable kit must explicitly exclude duplicate logos');

  assert.equal(entries.some((entry) => entry === 'yakolak-logo.svg'), false, 'orphan duplicate YAKOLAK logo must not return');
  assert.equal(entries.some((entry) => entry === 'assets/kit' || entry.startsWith('assets/kit/')), false, 'stale migration asset tree must not return');
  assert.equal(entries.some((entry) => entry === 'assets/icons/lucide' || entry.startsWith('assets/icons/lucide/')), false, 'historical Lucide icons are not current Pages assets');

  const semanticAssets = [
    [ASSETS.gameLogo, 'logos/YAKOLAK.svg', 'ee3703615cd42c4979a0001f1261014f108c6956', 5736],
    [ASSETS.companyLogo, 'logos/MTKYF.svg', '98b4ef63d06cbeb045d72895e6252143a5fce0a4', 8652],
    [ASSETS.loadingStar, 'ui/loading-star.svg', 'fb9b40a07c184a5c8aefb8c138ccd2c9f98c3eeb', 643],
  ];
  const nestedBase = 'https://example.invalid/yakolak/threejs/';

  for (const [asset, path, sha, bytes] of semanticAssets) {
    assert.equal(asset.source.path, path);
    assert.equal(asset.source.gitBlobSha, sha);
    assert.equal(asset.source.bytes, bytes);
    assert.equal(asset.runtime.versionId, `git:${sha}`);
    assert.equal(asset.runtime.integrity, `git-blob-sha1:${sha}`);
    assert.equal(
      runtimeAssetUrl(path, sha, nestedBase),
      `${nestedBase}runtime-assets/${path}?v=${sha}`,
      `${path} must resolve through the PAGES-003 app base with stable content identity`,
    );
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
