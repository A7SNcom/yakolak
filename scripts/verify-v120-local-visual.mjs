import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const V119_URL = process.env.V119_URL || 'http://127.0.0.1:4173';
const V120_URL = process.env.V120_URL || 'http://127.0.0.1:4174';
const CALIBRATION_URL = 'https://yakolak.vercel.app/api/calibration';
const out = new URL('../artifacts/v120-visual-comparison/', import.meta.url);
const file = name => fileURLToPath(new URL(name, out));
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
    '--disable-renderer-backgrounding'
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

async function useProductionCalibration(page) {
  await page.route('**/api/calibration', async route => {
    const response = await page.context().request.get(CALIBRATION_URL, { timeout: 30_000 });
    await route.fulfill({ response });
  });
}

async function prepareScene(page, version) {
  await page.waitForFunction(expected => {
    const correctVersion = expected === 120
      ? Boolean(globalThis.__yakolakV120 && globalThis.__yakolakMobileClarityV120)
      : Boolean(globalThis.__yakolakV119LastMove) && !globalThis.__yakolakV120;
    return document.body.classList.contains('yakolak-ready') &&
      globalThis.__yakolakGame?.renderer &&
      correctVersion;
  }, version, { timeout: 50_000 });

  await page.evaluate(() => {
    const game = globalThis.__yakolakGame;
    document.querySelector('vercel-live-feedback')?.remove();
    document.getElementById('yakolakGameSetup')?.classList.add('hidden');
    document.getElementById('yakolakTutorialDialog')?.classList.remove('open');
    document.getElementById('yakolakOnlineDialog')?.classList.remove('open');
    if (game.setupGroup) game.setupGroup.visible = false;
    game.debugTriggerWin?.('same-size', 'back');
  });
  await page.waitForTimeout(180);
  await page.evaluate(() => {
    const game = globalThis.__yakolakGame;
    game.clearHighlights?.();
    game.state.winner = null;
    game.state.locked = false;
    if (game.setupGroup) game.setupGroup.visible = false;
    document.getElementById('yakolakGameSetup')?.classList.add('hidden');
    document.getElementById('yakolakOnlineDialog')?.classList.remove('open');
    game.setResponsiveOverview?.();
    game.render?.();
  });
  await page.waitForTimeout(450);
}

async function capture(page, name) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const image = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false
    });
    await writeFile(file(name), Buffer.from(image.data, 'base64'));
  } finally {
    await cdp.detach();
  }
}

async function measure(page) {
  await page.bringToFront();
  return page.evaluate(async () => {
    const game = globalThis.__yakolakGame;
    const renderer = game.renderer;
    const gl = renderer.getContext();
    const scene = game.gameGroup.parent;
    const board = game.meshes['9'].material;
    const sample = [];

    for (let i = 0; i < 8; i += 1) {
      game.render();
      gl.finish();
    }
    for (let i = 0; i < 36; i += 1) {
      const started = performance.now();
      game.render();
      gl.finish();
      sample.push(performance.now() - started);
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    const percentile = (values, ratio) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor((sorted.length - 1) * ratio)];
    };
    const round = value => Number(value.toFixed(3));
    const buffer = renderer.getDrawingBufferSize(new game.THREE.Vector2());
    let lights = 0;
    scene.traverse(object => { if (object.isLight) lights += 1; });
    game.render();
    gl.finish();

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
      shadows: renderer.shadowMap.enabled,
      antialias: Boolean(gl.getContextAttributes()?.antialias),
      fullFrameMs: {
        median: round(percentile(sample, 0.5)),
        p95: round(percentile(sample, 0.95))
      },
      board: {
        color: `#${board.color.getHexString()}`,
        emissive: `#${board.emissive.getHexString()}`,
        emissiveIntensity: board.emissiveIntensity,
        roughness: board.roughness,
        metalness: board.metalness
      }
    };
  });
}

async function run(label, version, url, viewport) {
  const context = await browser.newContext(viewport);
  try {
    const page = await context.newPage();
    watch(page, label);
    await useProductionCalibration(page);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 65_000 });
    await prepareScene(page, version);
    await capture(page, `${label}.png`);
    return await measure(page);
  } finally {
    await context.close();
  }
}

function assertCostEqual(before, after, label) {
  for (const key of ['pixelRatio', 'drawingBuffer', 'canvasCss', 'render', 'memory', 'lights', 'shadows', 'antialias']) {
    assert.deepEqual(after[key], before[key], `${label}: ${key} changed`);
  }
}

try {
  const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
  const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

  const v119Desktop = await run('v119-desktop', 119, V119_URL, desktop);
  const v120Desktop = await run('v120-desktop', 120, V120_URL, desktop);
  const v119Mobile = await run('v119-mobile', 119, V119_URL, mobile);
  const v120Mobile = await run('v120-mobile', 120, V120_URL, mobile);

  assertCostEqual(v119Desktop, v120Desktop, 'desktop');
  assertCostEqual(v119Mobile, v120Mobile, 'mobile');
  assert.deepEqual(v120Desktop.board, v119Desktop.board, 'desktop board material changed');
  assert.equal(v120Mobile.board.color, '#5b6875');
  assert.equal(v120Mobile.board.emissive, '#1f2b36');
  assert.equal(v120Mobile.board.emissiveIntensity, 0.08);
  assert.notDeepEqual(v120Mobile.board, v119Mobile.board, 'mobile board material did not change');

  const results = {
    ok: true,
    source: {
      v119: 'main served locally with production calibration',
      v120: 'PR head served locally with production calibration',
      previewCommit: process.env.V120_COMMIT || null
    },
    viewports: {
      desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
      mobile: { width: 390, height: 844, deviceScaleFactor: 2 }
    },
    v119: { desktop: v119Desktop, mobile: v119Mobile },
    v120: { desktop: v120Desktop, mobile: v120Mobile },
    comparison: {
      desktopMedianDeltaMs: Number((v120Desktop.fullFrameMs.median - v119Desktop.fullFrameMs.median).toFixed(3)),
      mobileMedianDeltaMs: Number((v120Mobile.fullFrameMs.median - v119Mobile.fullFrameMs.median).toFixed(3)),
      structuralRenderCostIdentical: true,
      desktopMaterialIdentical: true,
      mobileMaterialOnlyChanged: true
    },
    errors,
    consoleErrors
  };
  await writeFile(new URL('results.json', out), JSON.stringify(results, null, 2));
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  console.log('v120 deterministic local visual comparison passed');
} catch (error) {
  await writeFile(new URL('results.json', out), JSON.stringify({ ok: false, error: error.stack || String(error), errors, consoleErrors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
