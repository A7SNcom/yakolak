import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const v119Url = process.env.V119_URL;
const v120Url = process.env.V120_URL;
if (!v119Url || !v120Url) throw new Error('V119_URL and V120_URL are required');

const outputDir = new URL('../artifacts/v120-visual-comparison/', import.meta.url);
const outputPath = name => fileURLToPath(new URL(name, outputDir));
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

function watch(page, label) {
  page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      consoleErrors.push(`${label}: ${message.text()}`);
    }
  });
}

async function waitForClient(page, version) {
  await page.waitForFunction(expected => {
    const versionReady = expected === 120
      ? Boolean(globalThis.__yakolakV120 && globalThis.__yakolakMobileClarityV120)
      : !globalThis.__yakolakV120 && Boolean(globalThis.__yakolakV119LastMove);
    return document.body.classList.contains('yakolak-ready') &&
      Boolean(globalThis.__yakolakOnlineV114) &&
      Boolean(globalThis.__yakolakGame?.renderer) &&
      versionReady;
  }, version, { timeout: 50_000 });
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

async function waitForPlayingScene(page) {
  await page.waitForFunction(() =>
    globalThis.__yakolakOnlineV114?.room?.status === 'playing' &&
    globalThis.__yakolakGame?.state?.configured === true,
  null, { timeout: 35_000 });
  await page.waitForTimeout(900);
}

async function waitForMove(page) {
  await page.waitForFunction(() =>
    globalThis.__yakolakOnlineV114?.room?.moveNumber >= 1 &&
    globalThis.__yakolakGame?.pieces?.some(piece => piece.placed),
  null, { timeout: 35_000 });
  await page.evaluate(() => {
    document.querySelector('vercel-live-feedback')?.remove();
    document.getElementById('yakolakOnlineDialog')?.classList.remove('open');
    globalThis.__yakolakGame?.setResponsiveOverview?.();
    globalThis.__yakolakGame?.render?.();
  });
  await page.waitForTimeout(700);
}

async function capture(page, name) {
  await page.evaluate(() => document.querySelector('vercel-live-feedback')?.remove());
  const session = await page.context().newCDPSession(page);
  try {
    const shot = await session.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false
    });
    await writeFile(outputPath(name), Buffer.from(shot.data, 'base64'));
  } finally {
    await session.detach();
  }
}

async function measurePerformance(page) {
  return page.evaluate(async () => {
    const game = globalThis.__yakolakGame;
    const renderer = game.renderer;
    const boardMaterial = game.meshes?.['9']?.material;
    const scene = game.gameGroup?.parent;
    if (!renderer || !scene || !boardMaterial || !game.render) throw new Error('render_metrics_unavailable');

    game.setResponsiveOverview?.();
    for (let index = 0; index < 30; index += 1) {
      await new Promise(resolve => requestAnimationFrame(() => {
        game.render();
        resolve();
      }));
    }

    const frameIntervals = [];
    const submitTimes = [];
    let previous = performance.now();
    for (let index = 0; index < 150; index += 1) {
      await new Promise(resolve => requestAnimationFrame(now => {
        frameIntervals.push(now - previous);
        previous = now;
        const started = performance.now();
        game.render();
        submitTimes.push(performance.now() - started);
        resolve();
      }));
    }

    const percentile = (values, ratio) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
    };
    const rounded = value => Number(value.toFixed(3));
    const buffer = renderer.getDrawingBufferSize(new game.THREE.Vector2());
    let lights = 0;
    scene.traverse(object => { if (object.isLight) lights += 1; });
    const attributes = renderer.getContext().getContextAttributes();

    return {
      pixelRatio: renderer.getPixelRatio(),
      drawingBuffer: { width: buffer.x, height: buffer.y },
      canvasCss: {
        width: renderer.domElement.getBoundingClientRect().width,
        height: renderer.domElement.getBoundingClientRect().height
      },
      render: {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        lines: renderer.info.render.lines,
        points: renderer.info.render.points
      },
      memory: {
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures
      },
      lights,
      shadowsEnabled: renderer.shadowMap.enabled,
      antialias: Boolean(attributes?.antialias),
      frameMs: {
        median: rounded(percentile(frameIntervals.slice(5), 0.5)),
        p95: rounded(percentile(frameIntervals.slice(5), 0.95))
      },
      renderSubmitMs: {
        median: rounded(percentile(submitTimes.slice(5), 0.5)),
        p95: rounded(percentile(submitTimes.slice(5), 0.95))
      },
      board: {
        color: `#${boardMaterial.color.getHexString()}`,
        emissive: boardMaterial.emissive ? `#${boardMaterial.emissive.getHexString()}` : null,
        emissiveIntensity: boardMaterial.emissiveIntensity ?? null,
        roughness: boardMaterial.roughness,
        metalness: boardMaterial.metalness
      }
    };
  });
}

async function move(page, token, code, state, zone, size) {
  const result = await api(page, {
    action: 'move',
    code,
    version: state.version,
    zone,
    size
  }, token);
  return result.room;
}

async function runVersion({ label, version, url }) {
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1
  });
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });

  try {
    const desktop = await desktopContext.newPage();
    const mobile = await mobileContext.newPage();
    watch(desktop, `${label}-desktop`);
    watch(mobile, `${label}-mobile`);

    await Promise.all([
      desktop.goto(url, { waitUntil: 'domcontentloaded', timeout: 65_000 }),
      mobile.goto(url, { waitUntil: 'domcontentloaded', timeout: 65_000 })
    ]);
    await Promise.all([waitForClient(desktop, version), waitForClient(mobile, version)]);

    const created = await api(desktop, {
      action: 'create',
      color: 'right',
      targetPlayers: 2,
      targetRounds: 3
    });
    const code = created.room.code;
    const joined = await api(mobile, { action: 'join', code, color: 'back' });

    await installIdentity(desktop, { code, token: created.token, seat: created.seat });
    await installIdentity(mobile, { code, token: joined.token, seat: joined.seat });

    const target = new URL(url);
    target.searchParams.set('room', code);
    await Promise.all([
      desktop.goto(target.toString(), { waitUntil: 'domcontentloaded', timeout: 65_000 }),
      mobile.goto(target.toString(), { waitUntil: 'domcontentloaded', timeout: 65_000 })
    ]);
    await Promise.all([waitForClient(desktop, version), waitForClient(mobile, version)]);
    await Promise.all([waitForPlayingScene(desktop), waitForPlayingScene(mobile)]);

    await move(desktop, created.token, code, joined.room, 0, 'l');
    await Promise.all([waitForMove(desktop), waitForMove(mobile)]);

    await Promise.all([
      capture(desktop, `${label}-desktop.png`),
      capture(mobile, `${label}-mobile.png`)
    ]);

    const [desktopMetrics, mobileMetrics] = await Promise.all([
      measurePerformance(desktop),
      measurePerformance(mobile)
    ]);

    return { code, desktop: desktopMetrics, mobile: mobileMetrics };
  } finally {
    await desktopContext.close();
    await mobileContext.close();
  }
}

function assertSameRenderCost(before, after, viewport) {
  assert.equal(after.pixelRatio, before.pixelRatio, `${viewport}: pixel ratio changed`);
  assert.deepEqual(after.drawingBuffer, before.drawingBuffer, `${viewport}: drawing buffer changed`);
  assert.deepEqual(after.canvasCss, before.canvasCss, `${viewport}: CSS canvas size changed`);
  assert.deepEqual(after.render, before.render, `${viewport}: render primitives changed`);
  assert.deepEqual(after.memory, before.memory, `${viewport}: GPU resource counts changed`);
  assert.equal(after.lights, before.lights, `${viewport}: light count changed`);
  assert.equal(after.shadowsEnabled, before.shadowsEnabled, `${viewport}: shadow mode changed`);
  assert.equal(after.antialias, before.antialias, `${viewport}: antialias mode changed`);
}

try {
  const before = await runVersion({ label: 'v119', version: 119, url: v119Url });
  const after = await runVersion({ label: 'v120', version: 120, url: v120Url });

  assertSameRenderCost(before.desktop, after.desktop, 'desktop');
  assertSameRenderCost(before.mobile, after.mobile, 'mobile');
  assert.deepEqual(after.desktop.board, before.desktop.board, 'desktop board material must stay unchanged');
  assert.notEqual(after.mobile.board.color, before.mobile.board.color, 'mobile board color must change');
  assert.equal(after.mobile.board.color, '#5b6875');
  assert.equal(after.mobile.board.emissive, '#1f2b36');
  assert.equal(after.mobile.board.emissiveIntensity, 0.08);

  const submitRatio = (next, base) => Number((next / Math.max(base, 0.001)).toFixed(3));
  const result = {
    ok: true,
    urls: { v119: new URL(v119Url).origin, v120: new URL(v120Url).origin },
    viewports: {
      desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
      mobile: { width: 390, height: 844, deviceScaleFactor: 2 }
    },
    v119: before,
    v120: after,
    comparison: {
      desktopSubmitMedianRatio: submitRatio(after.desktop.renderSubmitMs.median, before.desktop.renderSubmitMs.median),
      mobileSubmitMedianRatio: submitRatio(after.mobile.renderSubmitMs.median, before.mobile.renderSubmitMs.median),
      desktopFrameMedianDeltaMs: Number((after.desktop.frameMs.median - before.desktop.frameMs.median).toFixed(3)),
      mobileFrameMedianDeltaMs: Number((after.mobile.frameMs.median - before.mobile.frameMs.median).toFixed(3)),
      renderCostStructurallyIdentical: true,
      desktopMaterialUnchanged: true,
      mobileMaterialChangedOnly: true
    },
    errors,
    consoleErrors
  };
  await writeFile(new URL('results.json', outputDir), JSON.stringify(result, null, 2));
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  console.log('v120 visual and render-cost comparison passed');
} catch (error) {
  const failure = { ok: false, error: error.stack || String(error), errors, consoleErrors };
  await writeFile(new URL('results.json', outputDir), JSON.stringify(failure, null, 2));
  throw error;
} finally {
  await browser.close();
}
