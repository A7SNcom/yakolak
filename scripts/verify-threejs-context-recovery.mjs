import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.THREEJS_TEST_URL || 'http://127.0.0.1:4173/';
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
});

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.documentElement.dataset.bootState === 'ready');

  const extensionAvailable = await page.evaluate(() => {
    const shell = window.__YAKOLAK_THREEJS_SHELL__;
    const gl = shell?.canvas?.getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    window.__THREEJS_014_LOSE_CONTEXT__ = extension;
    return true;
  });
  assert.equal(extensionAvailable, true, 'Chromium must expose WEBGL_lose_context for the recovery regression');

  const before = await page.evaluate(() => ({
    context: window.__YAKOLAK_THREEJS_SHELL__.getGraphicsContextSnapshot(),
    presentation: window.__YAKOLAK_THREEJS_SHELL__.getPresentationSnapshot(),
  }));
  assert.equal(before.context.state, 'ready');

  await page.evaluate(() => window.__THREEJS_014_LOSE_CONTEXT__.loseContext());
  await page.waitForFunction(() => window.__YAKOLAK_THREEJS_SHELL__?.getGraphicsContextSnapshot()?.state === 'lost');

  const lostStart = await page.evaluate(() => ({
    context: window.__YAKOLAK_THREEJS_SHELL__.getGraphicsContextSnapshot(),
    presentation: window.__YAKOLAK_THREEJS_SHELL__.getPresentationSnapshot(),
    status: document.querySelector('#boot-status')?.textContent,
  }));
  assert.equal(lostStart.context.canUseGpu, false);
  assert.equal(lostStart.presentation.graphicsAvailable, false);
  assert.match(lostStart.status || '', /lost|pausing/i);

  await page.waitForTimeout(220);
  const lostEnd = await page.evaluate(() => window.__YAKOLAK_THREEJS_SHELL__.getPresentationSnapshot());
  assert.equal(lostEnd.frameCount, lostStart.presentation.frameCount, 'frame count must freeze while WebGL context is lost');
  assert.equal(lostEnd.framePending, false, 'no RAF may remain scheduled while WebGL context is lost');

  await page.evaluate(() => window.__THREEJS_014_LOSE_CONTEXT__.restoreContext());
  await page.waitForFunction((expectedRestoreCount) => {
    const snapshot = window.__YAKOLAK_THREEJS_SHELL__?.getGraphicsContextSnapshot();
    return snapshot?.state === 'ready' && snapshot.restoreCount === expectedRestoreCount;
  }, before.context.restoreCount + 1);

  const restored = await page.evaluate(() => ({
    context: window.__YAKOLAK_THREEJS_SHELL__.getGraphicsContextSnapshot(),
    presentation: window.__YAKOLAK_THREEJS_SHELL__.getPresentationSnapshot(),
    recoveryHidden: document.querySelector('#graphics-recovery')?.hidden,
    bootState: document.documentElement.dataset.bootState,
  }));

  assert.equal(restored.context.generation, before.context.generation + 1);
  assert.equal(restored.context.restoreCount, before.context.restoreCount + 1, 'one real loss cycle must produce one resource restore');
  assert.equal(restored.presentation.restoredResourceGeneration, restored.context.generation, 'preview resources must be rebound to the restored generation');
  assert.equal(restored.presentation.graphicsAvailable, true);
  assert.equal(restored.recoveryHidden, true, 'failure UI must stay hidden after successful recovery');
  assert.equal(restored.bootState, 'ready');

  await page.waitForTimeout(180);
  const resumed = await page.evaluate(() => window.__YAKOLAK_THREEJS_SHELL__.getPresentationSnapshot());
  assert.ok(resumed.frameCount > lostEnd.frameCount, 'presentation must resume after successful WebGL restoration');
  assert.deepEqual(pageErrors, [], `page errors after context recovery: ${pageErrors.join('; ')}`);

  console.log(JSON.stringify({
    ok: true,
    viewport: '390x844',
    before: before.context,
    lost: lostStart.context,
    restored: restored.context,
    frameCountWhileLost: lostEnd.frameCount,
    frameCountAfterResume: resumed.frameCount,
    restoredResourceGeneration: restored.presentation.restoredResourceGeneration,
  }));
} finally {
  await browser.close();
}
