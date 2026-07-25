import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const V119_URL = process.env.V119_URL || 'http://127.0.0.1:4173';
const V120_URL = process.env.V120_URL || 'http://127.0.0.1:4174';
const CALIBRATION_URL = 'https://yakolak.vercel.app/api/calibration';
const out = new URL('../artifacts/v120-visual-comparison/', import.meta.url);
const outputPath = name => fileURLToPath(new URL(name, out));
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
    if (game.meshes?.['9']) game.meshes['9'].visible = true;
    game.debugTriggerWin?.('same-size', 'back');
  });
  await page.waitForTimeout(180);
  await page.evaluate(() => {
    const game = globalThis.__yakolakGame;
    game.clearHighlights?.();
    game.state.winner = null;
    game.state.locked = false;
    if (game.setupGroup) game.setupGroup.visible = false;
    if (game.meshes?.['9']) game.meshes['9'].visible = true;
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
    await writeFile(outputPath(name), Buffer.from(image.data, 'base64'));
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
    const boardMesh = game.meshes['9'];
    const board = boardMesh.material;
    const pieces = game.pieces || [];

    const renderPixels = () => {
      game.render();
      gl.finish();
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return { width, height, pixels };
    };

    const originalBoardVisible = boardMesh.visible;
    const originalPieceVisibility = pieces.map(piece => piece.mesh.visible);
    pieces.forEach(piece => { piece.mesh.visible = false; });
    boardMesh.visible = false;
    const background = renderPixels();
    boardMesh.visible = true;
    const boardFrame = renderPixels();
    pieces.forEach(piece => {
      piece.mesh.visible = Boolean(piece.placed && piece.dir === 'back');
    });
    const pieceFrame = renderPixels();

    pieces.forEach((piece, index) => { piece.mesh.visible = originalPieceVisibility[index]; });
    boardMesh.visible = originalBoardVisible;
    game.render();
    gl.finish();

    const srgbLinear = value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    };
    const luminanceAt = (pixels, index) =>
      0.2126 * srgbLinear(pixels[index]) +
      0.7152 * srgbLinear(pixels[index + 1]) +
      0.0722 * srgbLinear(pixels[index + 2]);
    const difference = (first, second, index) =>
      Math.abs(first[index] - second[index]) +
      Math.abs(first[index + 1] - second[index + 1]) +
      Math.abs(first[index + 2] - second[index + 2]);
    const median = values => {
      const sorted = [...values].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    };
    const round = value => Number(value.toFixed(5));
    const boardLuminance = [];
    const pieceLuminance = [];
    for (let index = 0; index < boardFrame.pixels.length; index += 12) {
      if (difference(boardFrame.pixels, background.pixels, index) >= 24) {
        boardLuminance.push(luminanceAt(boardFrame.pixels, index));
      }
      if (difference(pieceFrame.pixels, boardFrame.pixels, index) >= 24) {
        pieceLuminance.push(luminanceAt(pieceFrame.pixels, index));
      }
    }
    if (boardLuminance.length < 500 || pieceLuminance.length < 100) {
      throw new Error(`insufficient_render_samples:${boardLuminance.length}:${pieceLuminance.length}`);
    }
    const boardMedian = median(boardLuminance);
    const pieceMedian = median(pieceLuminance);
    const contrastRatio = (Math.max(boardMedian, pieceMedian) + 0.05) /
      (Math.min(boardMedian, pieceMedian) + 0.05);

    const frameTimes = [];
    for (let index = 0; index < 8; index += 1) {
      game.render();
      gl.finish();
    }
    for (let index = 0; index < 36; index += 1) {
      const started = performance.now();
      game.render();
      gl.finish();
      frameTimes.push(performance.now() - started);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    const percentile = (values, ratio) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor((sorted.length - 1) * ratio)];
    };
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
        median: Number(percentile(frameTimes, 0.5).toFixed(3)),
        p95: Number(percentile(frameTimes, 0.95).toFixed(3))
      },
      board: {
        visible: boardMesh.visible,
        color: `#${board.color.getHexString()}`,
        emissive: `#${board.emissive.getHexString()}`,
        emissiveIntensity: board.emissiveIntensity,
        roughness: board.roughness,
        metalness: board.metalness
      },
      renderedContrast: {
        boardMedianLuminance: round(boardMedian),
        bluePieceMedianLuminance: round(pieceMedian),
        luminanceGap: round(Math.abs(boardMedian - pieceMedian)),
        ratio: round(contrastRatio),
        boardSamples: boardLuminance.length,
        bluePieceSamples: pieceLuminance.length
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
  assert.equal(v120Mobile.board.color, '#706b64');
  assert.equal(v120Mobile.board.emissive, '#24211e');
  assert.equal(v120Mobile.board.emissiveIntensity, 0.04);

  const ratioGain = v120Mobile.renderedContrast.ratio / v119Mobile.renderedContrast.ratio - 1;
  const gapGain = v120Mobile.renderedContrast.luminanceGap / v119Mobile.renderedContrast.luminanceGap - 1;
  assert.ok(ratioGain >= 0.20, `rendered contrast ratio gain ${(ratioGain * 100).toFixed(1)}% is below 20%`);
  assert.ok(gapGain >= 0.20, `rendered luminance-gap gain ${(gapGain * 100).toFixed(1)}% is below 20%`);

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
      renderedContrastRatioGainPercent: Number((ratioGain * 100).toFixed(2)),
      renderedLuminanceGapGainPercent: Number((gapGain * 100).toFixed(2)),
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
  console.log('v120 neutral mobile board passed rendered contrast and zero-cost checks');
} catch (error) {
  await writeFile(new URL('results.json', out), JSON.stringify({ ok: false, error: error.stack || String(error), errors, consoleErrors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
