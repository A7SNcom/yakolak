import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  assetHref,
  buildAppStateUrl,
  buildInvitationUrl,
  buildSetupUrl,
  deriveAppBaseUrl,
  readAppState,
  resolveAppUrl,
  workerHref,
} from '../web/app/core/app-url.js';
import { runtimeAssetUrl } from '../web/app/assets/asset-manifest.js';

const SHA = 'a'.repeat(40);
const CASES = Object.freeze([
  Object.freeze({
    name: 'migration preview',
    moduleUrl: 'https://a7sncom.github.io/yakolak/threejs/app/core/app-url.js',
    basePath: '/yakolak/threejs/',
  }),
  Object.freeze({
    name: 'post-cutover production',
    moduleUrl: 'https://a7sncom.github.io/yakolak/app/core/app-url.js',
    basePath: '/yakolak/',
  }),
]);

test('one application base is derived from the deployed module location at preview and cutover prefixes', () => {
  for (const scenario of CASES) {
    const base = deriveAppBaseUrl(scenario.moduleUrl);
    assert.equal(base.origin, 'https://a7sncom.github.io', scenario.name);
    assert.equal(base.pathname, scenario.basePath, scenario.name);
    assert.equal(resolveAppUrl('app/boot/boot.js', base).pathname, `${scenario.basePath}app/boot/boot.js`, scenario.name);
    assert.equal(resolveAppUrl('vendor/three/r185/three.module.js', base).pathname, `${scenario.basePath}vendor/three/r185/three.module.js`, scenario.name);
  }
});

test('GLB, runtime copies, textures, fonts, icons, manifest modules and workers stay inside the application base', () => {
  for (const scenario of CASES) {
    const base = deriveAppBaseUrl(scenario.moduleUrl);
    const glb = new URL(runtimeAssetUrl('/assets/models/piece-small.glb', SHA, base));
    const texture = new URL(runtimeAssetUrl('table/albedo.png', SHA, base));

    assert.equal(glb.pathname, `${scenario.basePath}assets/models/piece-small.glb`, scenario.name);
    assert.equal(glb.search, `?v=${SHA}`, scenario.name);
    assert.equal(texture.pathname, `${scenario.basePath}runtime-assets/table/albedo.png`, scenario.name);
    assert.equal(assetHref('fonts/example.woff2', base), `https://a7sncom.github.io${scenario.basePath}assets/fonts/example.woff2`, scenario.name);
    assert.equal(assetHref('icons/example.svg', base), `https://a7sncom.github.io${scenario.basePath}assets/icons/example.svg`, scenario.name);
    assert.equal(resolveAppUrl('app/assets/asset-manifest.js', base).pathname, `${scenario.basePath}app/assets/asset-manifest.js`, scenario.name);
    assert.equal(workerHref('app/workers/example-worker.js', base), `https://a7sncom.github.io${scenario.basePath}app/workers/example-worker.js`, scenario.name);
  }
});

test('invitation and setup state use query/hash without changing the static pathname', () => {
  for (const scenario of CASES) {
    const base = deriveAppBaseUrl(scenario.moduleUrl);
    const invitation = buildInvitationUrl('opaque-seat-token', base);
    const setup = buildSetupUrl('host', base);
    const combined = buildAppStateUrl({ invitation: 'opaque-seat-token', setup: 'host' }, base);

    assert.equal(invitation.pathname, scenario.basePath, scenario.name);
    assert.equal(invitation.searchParams.get('invite'), 'opaque-seat-token', scenario.name);
    assert.equal(setup.pathname, scenario.basePath, scenario.name);
    assert.equal(setup.hash, '#setup=host', scenario.name);
    assert.equal(combined.pathname, scenario.basePath, scenario.name);
    assert.deepEqual(readAppState(combined, base), { invitation: 'opaque-seat-token', setup: 'host' }, scenario.name);
  }
});

test('HTML static imports are document-relative and contain no migration or cutover prefix', async () => {
  const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');

  assert.match(html, /href="\.\/styles\/app\.css"/);
  assert.match(html, /"three": "\.\/vendor\/three\/r185\/three\.module\.js"/);
  assert.match(html, /"three\/addons\/": "\.\/vendor\/three\/r185\/addons\/"/);
  assert.match(html, /src="\.\/app\/boot\/boot\.js"/);
  assert.doesNotMatch(html, /\/yakolak\//i);
  assert.doesNotMatch(html, /\/threejs\//i);
});

test('application URL resolver rejects origin/path escapes instead of silently leaving the app root', () => {
  const base = deriveAppBaseUrl(CASES[0].moduleUrl);
  assert.throws(() => resolveAppUrl('../outside.js', base), /escaped APP_BASE_URL/);
  assert.throws(() => resolveAppUrl('https://evil.example/app.js', base), /must be relative/);
  assert.throws(() => resolveAppUrl('//evil.example/app.js', base), /must be relative/);
});
