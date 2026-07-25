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
      globalThis.__yakolakGame?.renderer && correctVersion;
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
      const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels;
    };
    const originalBoardVisible = boardMesh.visible;
    const originalPieceVisibility = pieces.map(piece => piece.mesh.visible);
    pieces.forEach(piece => { piece.mesh.visible = false; });
    boardMesh.visible = false;
    const background = renderPixels();
    boardMesh.visible = true;
    const boardFrame = renderPixels();
    pieces.forEach(piece => { piece.mesh.visible = Boolean(piece.placed && piece.dir === 'back'); });
    const pieceFrame = renderPixels();
    pieces.forEach((piece, index) => { piece.mesh.visible = originalPieceVisibility[index]; });
    boardMesh.visible = originalBoardVisible;
    game.render();
    gl.finish();

    const difference = (first, second, index) =>
      Math.abs(first[index] - second[index]) +
      Math.abs(first[index + 1] - second[index + 1]) +
      Math.abs(first[index + 2] - second[index + 2]);
    const median = values => {
      const sorted = [...values].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    };
    const boardChannels = [[], [], []];
    const pieceChannels = [[], [], []];
    for (let index = 0; index < boardFrame.length; index += 12) {
      if (difference(boardFrame, background, index) >= 24) {
        boardChannels[0].push(boardFrame[index]);
        boardChannels[1].push(boardFrame[index + 1]);
        boardChannels[2].push(boardFrame[index + 2]);
      }
      if (difference(pieceFrame, boardFrame, index) >= 24) {
        pieceChannels[0].push(pieceFrame[index]);
        pieceChannels[1].push(pieceFrame[index + 1]);
        pieceChannels[2].push(pieceFrame[index + 2]);
      }
    }
    if (boardChannels[0].length < 500 || pieceChannels[0].length < 100) {
      throw new Error(`insufficient_render_samples:${boardChannels[0].length}:${pieceChannels[0].length}`);
    }
    const boardRgb = boardChannels.map(median);
    const pieceRgb = pieceChannels.map(median);
    const srgbLinear = value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    };
    const luminance = rgb => {
      const linear = rgb.map(srgbLinear);
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const lab = rgb => {
      const linear = rgb.map(srgbLinear);
      const xyz = [
        linear[0] * 0.4124564 + linear[1] * 0.3575761 + linear[2] * 0.1804375,
        linear[0] * 0.2126729 + linear[1] * 0.7151522 + linear[2] * 0.0721750,
        linear[0] * 0.0193339 + linear[1] * 0.1191920 + linear[2] * 0.9503041
      ];
      const white = [0.95047, 1, 1.08883];
      const delta = 6 / 29;
      const f = xyz.map((value, index) => {
        const ratio = value / white[index];
        return ratio > delta ** 3 ? Math.cbrt(ratio) : ratio / (3 * delta ** 2) + 4 / 29;
      });
      return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
    };
    const boardLab = lab(boardRgb);
    const pieceLab = lab(pieceRgb);
    const deltaE76 = Math.hypot(
      boardLab[0] - pieceLab[0],
      boardLab[1] - pieceLab[1],
      boardLab[2] - pieceLab[2]
    );
    const boardLuminance = luminance(boardRgb);
    const pieceLuminance = luminance(pieceRgb);
    const luminanceRatio = (Math.max(boardLuminance, pieceLuminance) + 0.05) /
      (Math.min(boardLuminance, pieceLuminance) + 0.05);

    const frameTimes = [];
    for (let index = 0; index < 8; index += 1) { game.render(); gl.finish(); }
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
    const round = value => Number(value.toFixed(4));

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
        color: `#${board.color.getHexString()}`,
        emissive: `#${board.emissive.getHexString()}`,
        emissiveIntensity: board.emissiveIntensity,
        roughness: board.roughness,
        metalness: board.metalness
      },
      renderedContrast: {
        boardMedianRgb: boardRgb.map(Math.round),
        bluePieceMedianRgb: pieceRgb.map(Math.round),
        deltaE76: round(deltaE76),
        luminanceRatio: round(luminanceRatio),
        luminanceGap: round(Math.abs(boardLuminance - pieceLuminance)),
        boardSamples: boardChannels[0].length,
        bluePieceSamples: pieceChannels[0].length
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

  const perceptualGain = v120Mobile.renderedContrast.deltaE76 /
    v119Mobile.renderedContrast.deltaE76 - 1;
  const luminanceRetention = v120Mobile.renderedContrast.luminanceRatio /
    v119Mobile.renderedContrast.luminanceRatio;
  assert.ok(perceptualGain >= 0.20, `rendered perceptual contrast gain ${(perceptualGain * 100).toFixed(1)}% is below 20%`);
  assert.ok(luminanceRetention >= 0.90, `rendered luminance contrast retained only ${(luminanceRetention * 100).toFixed(1)}%`);

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
      renderedPerceptualContrastGainPercent: Number((perceptualGain * 100).toFixed(2)),
      renderedLuminanceContrastRetentionPercent: Number((luminanceRetention * 100).toFixed(2)),
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
  console.log('v120 rendered perceptual contrast and zero-cost checks passed');
} catch (error) {
  await writeFile(new URL('results.json', out), JSON.stringify({ ok: false, error: error.stack || String(error), errors, consoleErrors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
