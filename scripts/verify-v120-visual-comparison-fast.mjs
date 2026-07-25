import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const V119_URL = process.env.V119_URL;
const V120_URL = process.env.V120_URL;
if (!V119_URL || !V120_URL) throw new Error('V119_URL and V120_URL are required');

const out = new URL('../artifacts/v120-visual-comparison/', import.meta.url);
const pathFor = name => fileURLToPath(new URL(name, out));
await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--use-angle=swiftshader',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows'
  ]
});

const pageErrors = [];
const consoleErrors = [];
const watch = (page, label) => {
  page.on('pageerror', error => pageErrors.push(`${label}: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      consoleErrors.push(`${label}: ${message.text()}`);
    }
  });
};

async function ready(page, version) {
  await page.waitForFunction(expected => {
    const correctVersion = expected === 120
      ? Boolean(globalThis.__yakolakV120 && globalThis.__yakolakMobileClarityV120)
      : Boolean(globalThis.__yakolakV119LastMove) && !globalThis.__yakolakV120;
    return document.body.classList.contains('yakolak-ready') &&
      globalThis.__yakolakGame?.renderer &&
      globalThis.__yakolakOnlineV114 &&
      correctVersion;
  }, version, { timeout: 50_000 });
  await page.evaluate(() => document.querySelector('vercel-live-feedback')?.remove());
}

async function roomApi(page, body, token = '') {
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
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${response.status}:${data.error || 'request_failed'}`);
    return data;
  }, { body, token });
}

async function screenshot(page, filename) {
  await page.evaluate(() => {
    document.querySelector('vercel-live-feedback')?.remove();
    document.getElementById('yakolakOnlineDialog')?.classList.remove('open');
    globalThis.__yakolakGame?.setResponsiveOverview?.();
    globalThis.__yakolakGame?.render?.();
  });
  await page.waitForTimeout(500);
  const cdp = await page.context().newCDPSession(page);
  try {
    const image = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false
    });
    await writeFile(pathFor(filename), Buffer.from(image.data, 'base64'));
  } finally {
    await cdp.detach();
  }
}

async function metrics(page) {
  await page.bringToFront();
  return page.evaluate(async () => {
    const game = globalThis.__yakolakGame;
    const renderer = game.renderer;
    const scene = game.gameGroup.parent;
    const material = game.meshes['9'].material;
    game.setResponsiveOverview?.();

    for (let i = 0; i < 15; i += 1) {
      await new Promise(resolve => requestAnimationFrame(() => { game.render(); resolve(); }));
    }
    const intervals = [];
    const submits = [];
    let previous = performance.now();
    for (let i = 0; i < 60; i += 1) {
      await new Promise(resolve => requestAnimationFrame(now => {
        intervals.push(now - previous);
        previous = now;
        const start = performance.now();
        game.render();
        submits.push(performance.now() - start);
        resolve();
      }));
    }
    const p = (values, ratio) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor((sorted.length - 1) * ratio)];
    };
    const round = value => Number(value.toFixed(3));
    const buffer = renderer.getDrawingBufferSize(new game.THREE.Vector2());
    let lights = 0;
    scene.traverse(object => { if (object.isLight) lights += 1; });
    game.render();
    return {
      pixelRatio: renderer.getPixelRatio(),
      drawingBuffer: { width: buffer.x, height: buffer.y },
      canvasCss: {
        width: renderer.domElement.getBoundingClientRect().width,
        height: renderer.domElement.getBoundingClientRect().height
      },
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      lines: renderer.info.render.lines,
      points: renderer.info.render.points,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      lights,
      shadows: renderer.shadowMap.enabled,
      antialias: Boolean(renderer.getContext().getContextAttributes()?.antialias),
      frameMedianMs: round(p(intervals.slice(3), 0.5)),
      frameP95Ms: round(p(intervals.slice(3), 0.95)),
      submitMedianMs: round(p(submits.slice(3), 0.5)),
      submitP95Ms: round(p(submits.slice(3), 0.95)),
      board: {
        color: `#${material.color.getHexString()}`,
        emissive: `#${material.emissive.getHexString()}`,
        emissiveIntensity: material.emissiveIntensity,
        roughness: material.roughness,
        metalness: material.metalness
      }
    };
  });
}

async function runDeployment(label, version, baseUrl) {
  console.log(`${label}: loading`);
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  try {
    const desktop = await desktopContext.newPage();
    const mobile = await mobileContext.newPage();
    watch(desktop, `${label}-desktop`);
    watch(mobile, `${label}-mobile`);
    await Promise.all([
      desktop.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 65_000 }),
      mobile.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 65_000 })
    ]);
    await Promise.all([ready(desktop, version), ready(mobile, version)]);

    const created = await roomApi(desktop, { action: 'create', color: 'right', targetPlayers: 2, targetRounds: 3 });
    const joined = await roomApi(mobile, { action: 'join', code: created.room.code, color: 'back' });
    for (const [page, identity] of [
      [desktop, { code: created.room.code, token: created.token, seat: created.seat }],
      [mobile, { code: created.room.code, token: joined.token, seat: joined.seat }]
    ]) {
      await page.evaluate(value => sessionStorage.setItem(`yakolak-online-v117:${value.code}`, JSON.stringify(value)), identity);
    }
    const roomUrl = new URL(baseUrl);
    roomUrl.searchParams.set('room', created.room.code);
    await Promise.all([
      desktop.goto(roomUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 65_000 }),
      mobile.goto(roomUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 65_000 })
    ]);
    await Promise.all([ready(desktop, version), ready(mobile, version)]);
    await Promise.all([desktop, mobile].map(page => page.waitForFunction(() =>
      globalThis.__yakolakOnlineV114?.room?.status === 'playing' && globalThis.__yakolakGame?.state?.configured,
    null, { timeout: 35_000 })));

    await roomApi(desktop, {
      action: 'move', code: created.room.code, version: joined.room.version, zone: 0, size: 'l'
    }, created.token);
    await Promise.all([desktop, mobile].map(page => page.waitForFunction(() =>
      globalThis.__yakolakOnlineV114?.room?.moveNumber >= 1 && globalThis.__yakolakGame?.pieces?.some(piece => piece.placed),
    null, { timeout: 35_000 })));

    await screenshot(desktop, `${label}-desktop.png`);
    await screenshot(mobile, `${label}-mobile.png`);
    console.log(`${label}: measuring desktop`);
    const desktopMetrics = await metrics(desktop);
    console.log(`${label}: measuring mobile`);
    const mobileMetrics = await metrics(mobile);
    return { roomCode: created.room.code, desktop: desktopMetrics, mobile: mobileMetrics };
  } finally {
    await desktopContext.close();
    await mobileContext.close();
  }
}

function sameCost(before, after, name) {
  for (const key of ['pixelRatio', 'drawingBuffer', 'canvasCss', 'calls', 'triangles', 'lines', 'points', 'geometries', 'textures', 'lights', 'shadows', 'antialias']) {
    assert.deepEqual(after[key], before[key], `${name}: ${key} changed`);
  }
}

try {
  const v119 = await runDeployment('v119', 119, V119_URL);
  const v120 = await runDeployment('v120', 120, V120_URL);
  sameCost(v119.desktop, v120.desktop, 'desktop');
  sameCost(v119.mobile, v120.mobile, 'mobile');
  assert.deepEqual(v120.desktop.board, v119.desktop.board, 'desktop material changed');
  assert.equal(v120.mobile.board.color, '#5b6875');
  assert.equal(v120.mobile.board.emissive, '#1f2b36');
  assert.equal(v120.mobile.board.emissiveIntensity, 0.08);
  assert.notDeepEqual(v120.mobile.board, v119.mobile.board, 'mobile material did not change');

  const result = {
    ok: true,
    viewports: { desktop: '1440x900@1', mobile: '390x844@2' },
    v119,
    v120,
    comparison: {
      desktopFrameDeltaMs: Number((v120.desktop.frameMedianMs - v119.desktop.frameMedianMs).toFixed(3)),
      mobileFrameDeltaMs: Number((v120.mobile.frameMedianMs - v119.mobile.frameMedianMs).toFixed(3)),
      desktopSubmitDeltaMs: Number((v120.desktop.submitMedianMs - v119.desktop.submitMedianMs).toFixed(3)),
      mobileSubmitDeltaMs: Number((v120.mobile.submitMedianMs - v119.mobile.submitMedianMs).toFixed(3)),
      structuralRenderCostIdentical: true,
      desktopMaterialIdentical: true,
      mobileMaterialOnlyChanged: true
    },
    pageErrors,
    consoleErrors
  };
  await writeFile(new URL('results.json', out), JSON.stringify(result, null, 2));
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  console.log('v120 fast visual comparison passed');
} catch (error) {
  await writeFile(new URL('results.json', out), JSON.stringify({ ok: false, error: error.stack || String(error), pageErrors, consoleErrors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
