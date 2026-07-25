import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const previewUrl = process.env.PREVIEW_URL;
if (!previewUrl) throw new Error('PREVIEW_URL is required');

const outputDir = new URL('../artifacts/v119-online-visual/', import.meta.url);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--use-angle=swiftshader'
  ]
});

const errors = [];
const consoleErrors = [];

function watch(page, name) {
  page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(`${name}: ${message.text()}`);
  });
}

async function waitForClient(page) {
  await page.waitForFunction(() =>
    document.body.classList.contains('yakolak-ready') &&
    globalThis.__yakolakOnlineV114 &&
    globalThis.__yakolakV119LastMove,
  null, { timeout: 45_000 });
  await page.evaluate(() => document.querySelector('vercel-live-feedback')?.remove());
}

async function api(page, body, token = null) {
  return page.evaluate(async ({ body, token }) => {
    const response = await fetch('/api/rooms-v118', {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${response.status}:${payload.error || 'request_failed'}`);
    return payload;
  }, { body, token });
}

async function installIdentity(page, identity) {
  await page.evaluate(value => {
    sessionStorage.setItem(`yakolak-online-v117:${value.code}`, JSON.stringify(value));
  }, identity);
}

async function waitForRoom(page, predicateText) {
  await page.waitForFunction(predicateText, null, { timeout: 30_000 });
  await page.waitForTimeout(800);
}

async function markerMetrics(page) {
  return page.evaluate(() => {
    const marker = globalThis.__yakolakGame?.gameGroup?.children?.find(
      object => object?.userData?.v119SubtleLastMove
    );
    if (!marker) return null;
    return {
      inner: marker.geometry?.parameters?.innerRadius,
      outer: marker.geometry?.parameters?.outerRadius,
      opacity: marker.material?.opacity,
      depthTest: marker.material?.depthTest,
      depthWrite: marker.material?.depthWrite,
      renderOrder: marker.renderOrder,
      visible: marker.visible !== false
    };
  });
}

async function move(page, token, state, zone, size) {
  const result = await api(page, {
    action: 'move',
    code: state.code,
    version: state.version,
    zone,
    size
  }, token);
  return result.room;
}

let desktopContext;
let mobileContext;
try {
  desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1
  });
  mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });

  const desktop = await desktopContext.newPage();
  const mobile = await mobileContext.newPage();
  watch(desktop, 'desktop');
  watch(mobile, 'mobile');

  await Promise.all([
    desktop.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 }),
    mobile.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  ]);
  await Promise.all([waitForClient(desktop), waitForClient(mobile)]);

  const created = await api(desktop, {
    action: 'create',
    color: 'right',
    targetPlayers: 2,
    targetRounds: 3
  });
  const code = created.room.code;
  const joined = await api(mobile, {
    action: 'join',
    code,
    color: 'back'
  });

  await installIdentity(desktop, { code, token: created.token, seat: created.seat });
  await installIdentity(mobile, { code, token: joined.token, seat: joined.seat });

  const target = new URL(previewUrl);
  target.searchParams.set('room', code);
  await Promise.all([
    desktop.goto(target.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 }),
    mobile.goto(target.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 })
  ]);
  await Promise.all([waitForClient(desktop), waitForClient(mobile)]);
  await Promise.all([
    waitForRoom(desktop, () => globalThis.__yakolakOnlineV114?.room?.status === 'playing'),
    waitForRoom(mobile, () => globalThis.__yakolakOnlineV114?.room?.status === 'playing')
  ]);

  let state = joined.room;
  state = await move(desktop, created.token, state, 0, 'l');
  await Promise.all([
    waitForRoom(desktop, () => globalThis.__yakolakOnlineV114?.room?.moveNumber >= 1),
    waitForRoom(mobile, () => globalThis.__yakolakOnlineV114?.room?.moveNumber >= 1)
  ]);

  const activeDesktop = await markerMetrics(desktop);
  const activeMobile = await markerMetrics(mobile);
  for (const metrics of [activeDesktop, activeMobile]) {
    assert.ok(metrics, 'active last-move marker must exist');
    assert.equal(metrics.inner, 30.5);
    assert.equal(metrics.outer, 33);
    assert.equal(metrics.opacity, 0.42);
    assert.equal(metrics.depthTest, true);
    assert.equal(metrics.depthWrite, false);
  }

  await desktop.screenshot({ path: new URL('desktop-playing.png', outputDir), fullPage: false });
  await mobile.screenshot({ path: new URL('mobile-playing.png', outputDir), fullPage: false });

  state = await move(mobile, joined.token, state, 3, 'l');
  state = await move(desktop, created.token, state, 1, 'l');
  state = await move(mobile, joined.token, state, 4, 'l');
  state = await move(desktop, created.token, state, 2, 'l');
  assert.equal(state.status, 'finished');
  assert.equal(state.winner?.color, 'right');

  await Promise.all([
    waitForRoom(desktop, () => globalThis.__yakolakOnlineV114?.room?.status === 'finished'),
    waitForRoom(mobile, () => globalThis.__yakolakOnlineV114?.room?.status === 'finished')
  ]);
  await Promise.all([
    desktop.evaluate(() => document.getElementById('yakolakOnlineDialog')?.classList.remove('open')),
    mobile.evaluate(() => document.getElementById('yakolakOnlineDialog')?.classList.remove('open'))
  ]);
  await Promise.all([desktop.waitForTimeout(500), mobile.waitForTimeout(500)]);

  const finishedDesktop = await markerMetrics(desktop);
  const finishedMobile = await markerMetrics(mobile);
  for (const metrics of [finishedDesktop, finishedMobile]) {
    assert.ok(metrics, 'finished last-move marker must exist');
    assert.equal(metrics.inner, 30.5);
    assert.equal(metrics.outer, 33);
    assert.equal(metrics.opacity, 0.28);
    assert.equal(metrics.depthTest, true);
  }

  await desktop.screenshot({ path: new URL('desktop-finished.png', outputDir), fullPage: false });
  await mobile.screenshot({ path: new URL('mobile-finished.png', outputDir), fullPage: false });

  const result = {
    ok: true,
    preview: new URL(previewUrl).origin,
    roomCode: code,
    viewports: {
      desktop: { width: 1440, height: 900 },
      mobile: { width: 390, height: 844, deviceScaleFactor: 2 }
    },
    active: { desktop: activeDesktop, mobile: activeMobile },
    finished: { desktop: finishedDesktop, mobile: finishedMobile },
    winner: state.winner,
    errors,
    consoleErrors
  };
  await writeFile(new URL('results.json', outputDir), JSON.stringify(result, null, 2));
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  console.log('v119 real online desktop/mobile visual playtest passed');
} catch (error) {
  const failure = { ok: false, error: error.stack || String(error), errors, consoleErrors };
  await writeFile(new URL('results.json', outputDir), JSON.stringify(failure, null, 2));
  throw error;
} finally {
  await desktopContext?.close();
  await mobileContext?.close();
  await browser.close();
}
