import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:4174';
const ROOMS_URL = 'https://yakolak.vercel.app/api/rooms-v118';
const CALIBRATION_URL = 'https://yakolak.vercel.app/api/calibration';
const COLORS = ['right', 'back', 'left', 'front'];
const outputDir = new URL('../artifacts/v120-online-all-colors/', import.meta.url);
const outputPath = name => fileURLToPath(new URL(name, outputDir));
await mkdir(outputDir, { recursive: true });

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

async function proxyLiveServices(page) {
  await page.route('**/api/calibration', async route => {
    const response = await page.context().request.get(CALIBRATION_URL, { timeout: 30_000 });
    await route.fulfill({ response });
  });
  await page.route('**/api/rooms-v118', async route => {
    const request = route.request();
    const headers = { ...request.headers() };
    delete headers.host;
    delete headers['content-length'];
    const response = await page.context().request.fetch(ROOMS_URL, {
      method: request.method(),
      headers,
      data: request.postDataBuffer() || undefined,
      timeout: 35_000
    });
    await route.fulfill({ response });
  });
}

async function waitForClient(page) {
  await page.waitForFunction(() =>
    document.body.classList.contains('yakolak-ready') &&
    Boolean(globalThis.__yakolakV120) &&
    Boolean(globalThis.__yakolakMobileClarityV120) &&
    Boolean(globalThis.__yakolakOnlineV114) &&
    Boolean(globalThis.__yakolakGame?.renderer),
  null, { timeout: 55_000 });
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

async function move(page, identity, code, state, zone, size) {
  const result = await api(page, {
    action: 'move',
    code,
    version: state.version,
    zone,
    size
  }, identity.token);
  return result.room;
}

async function prepareVisibleScene(page) {
  await page.waitForFunction(() => {
    const room = globalThis.__yakolakOnlineV114?.room;
    const pieces = globalThis.__yakolakGame?.pieces || [];
    return room?.status === 'playing' && room.moveNumber >= 8 &&
      pieces.filter(piece => piece.placed).length >= 8 &&
      new Set(pieces.filter(piece => piece.placed).map(piece => piece.dir)).size === 4;
  }, null, { timeout: 45_000 });
  await page.evaluate(() => {
    document.querySelector('vercel-live-feedback')?.remove();
    document.getElementById('yakolakGameSetup')?.classList.add('hidden');
    document.getElementById('yakolakTutorialDialog')?.classList.remove('open');
    document.getElementById('yakolakOnlineDialog')?.classList.remove('open');
    const game = globalThis.__yakolakGame;
    if (game.setupGroup) game.setupGroup.visible = false;
    if (game.meshes?.['9']) game.meshes['9'].visible = true;
    game.clearHighlights?.();
    game.setResponsiveOverview?.();
    game.render?.();
  });
  await page.waitForTimeout(800);
}

async function capture(page, name) {
  const session = await page.context().newCDPSession(page);
  try {
    const image = await session.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false
    });
    await writeFile(outputPath(name), Buffer.from(image.data, 'base64'));
  } finally {
    await session.detach();
  }
}

async function renderedColorMetrics(page) {
  return page.evaluate(expectedColors => {
    const game = globalThis.__yakolakGame;
    const renderer = game.renderer;
    const gl = renderer.getContext();
    const boardMesh = game.meshes['9'];
    const pieces = game.pieces || [];
    const placed = pieces.filter(piece => piece.placed);

    const renderPixels = () => {
      game.render();
      gl.finish();
      const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels;
    };
    const difference = (first, second, index) =>
      Math.abs(first[index] - second[index]) +
      Math.abs(first[index + 1] - second[index + 1]) +
      Math.abs(first[index + 2] - second[index + 2]);
    const median = values => {
      const sorted = [...values].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    };
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
    const deltaE = (first, second) => Math.hypot(
      first[0] - second[0], first[1] - second[1], first[2] - second[2]
    );
    const round = value => Number(value.toFixed(3));

    const originalBoardVisible = boardMesh.visible;
    const originalVisibility = pieces.map(piece => piece.mesh.visible);
    pieces.forEach(piece => { piece.mesh.visible = false; });
    boardMesh.visible = false;
    const background = renderPixels();
    boardMesh.visible = true;
    const boardFrame = renderPixels();

    const boardChannels = [[], [], []];
    for (let index = 0; index < boardFrame.length; index += 12) {
      if (difference(boardFrame, background, index) >= 24) {
        boardChannels[0].push(boardFrame[index]);
        boardChannels[1].push(boardFrame[index + 1]);
        boardChannels[2].push(boardFrame[index + 2]);
      }
    }
    if (boardChannels[0].length < 500) throw new Error(`insufficient_board_samples:${boardChannels[0].length}`);
    const boardRgb = boardChannels.map(median);
    const boardLab = lab(boardRgb);
    const boardLuminance = luminance(boardRgb);
    const colors = {};

    for (const color of expectedColors) {
      pieces.forEach(piece => { piece.mesh.visible = Boolean(piece.placed && piece.dir === color); });
      const colorFrame = renderPixels();
      const channels = [[], [], []];
      for (let index = 0; index < colorFrame.length; index += 8) {
        if (difference(colorFrame, boardFrame, index) >= 22) {
          channels[0].push(colorFrame[index]);
          channels[1].push(colorFrame[index + 1]);
          channels[2].push(colorFrame[index + 2]);
        }
      }
      if (channels[0].length < 80) throw new Error(`insufficient_${color}_samples:${channels[0].length}`);
      const rgb = channels.map(median);
      const pieceLuminance = luminance(rgb);
      colors[color] = {
        placedPieces: placed.filter(piece => piece.dir === color).length,
        medianRgb: rgb.map(Math.round),
        samples: channels[0].length,
        deltaE76: round(deltaE(boardLab, lab(rgb))),
        luminanceRatio: round((Math.max(boardLuminance, pieceLuminance) + 0.05) /
          (Math.min(boardLuminance, pieceLuminance) + 0.05))
      };
    }

    pieces.forEach((piece, index) => { piece.mesh.visible = originalVisibility[index]; });
    boardMesh.visible = originalBoardVisible;
    game.render();
    gl.finish();

    return {
      board: {
        materialColor: `#${boardMesh.material.color.getHexString()}`,
        medianRgb: boardRgb.map(Math.round),
        samples: boardChannels[0].length
      },
      colors,
      placed: placed.map(piece => ({ color: piece.dir, size: piece.type, zone: piece.zoneIndex })),
      moveNumber: globalThis.__yakolakOnlineV114?.room?.moveNumber,
      roomPlayers: globalThis.__yakolakOnlineV114?.room?.players
    };
  }, COLORS);
}

let desktopContext;
let mobileContext;
try {
  desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
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
  await Promise.all([proxyLiveServices(desktop), proxyLiveServices(mobile)]);

  await Promise.all([
    desktop.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 65_000 }),
    mobile.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 65_000 })
  ]);
  await Promise.all([waitForClient(desktop), waitForClient(mobile)]);

  const created = await api(desktop, {
    action: 'create', color: 'right', targetPlayers: 4, targetRounds: 3
  });
  const code = created.room.code;
  const back = await api(desktop, { action: 'join', code, color: 'back' });
  const left = await api(desktop, { action: 'join', code, color: 'left' });
  const front = await api(desktop, { action: 'join', code, color: 'front' });
  const identities = [created, back, left, front].map(result => ({
    code,
    token: result.token,
    seat: result.seat
  }));

  await installIdentity(desktop, identities[0]);
  await installIdentity(mobile, identities[1]);
  const roomUrl = new URL(APP_URL);
  roomUrl.searchParams.set('room', code);
  await Promise.all([
    desktop.goto(roomUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 65_000 }),
    mobile.goto(roomUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 65_000 })
  ]);
  await Promise.all([waitForClient(desktop), waitForClient(mobile)]);
  await Promise.all([
    desktop.waitForFunction(() => globalThis.__yakolakOnlineV114?.room?.status === 'playing', null, { timeout: 40_000 }),
    mobile.waitForFunction(() => globalThis.__yakolakOnlineV114?.room?.status === 'playing', null, { timeout: 40_000 })
  ]);

  let state = front.room;
  const moves = [
    [0, 0, 'l'], [1, 1, 'l'], [2, 2, 'l'], [3, 3, 'l'],
    [0, 4, 'm'], [1, 5, 'm'], [2, 6, 'm'], [3, 7, 'm']
  ];
  for (const [identityIndex, zone, size] of moves) {
    state = await move(desktop, identities[identityIndex], code, state, zone, size);
  }
  assert.equal(state.status, 'playing');
  assert.equal(state.moveNumber, 8);

  await Promise.all([prepareVisibleScene(desktop), prepareVisibleScene(mobile)]);
  await capture(desktop, 'desktop-all-colors.png');
  await capture(mobile, 'mobile-all-colors.png');
  const [desktopMetrics, mobileMetrics] = await Promise.all([
    renderedColorMetrics(desktop), renderedColorMetrics(mobile)
  ]);

  for (const [viewport, metrics] of Object.entries({ desktop: desktopMetrics, mobile: mobileMetrics })) {
    assert.equal(metrics.moveNumber, 8, `${viewport}: move synchronization failed`);
    assert.equal(metrics.roomPlayers.length, 4, `${viewport}: four-player room missing`);
    assert.deepEqual(metrics.roomPlayers.map(player => player.color), COLORS, `${viewport}: color order changed`);
    for (const color of COLORS) {
      assert.equal(metrics.colors[color].placedPieces, 2, `${viewport}: ${color} pieces missing`);
      assert.ok(metrics.colors[color].deltaE76 >= 15,
        `${viewport}: ${color} separation too low (${metrics.colors[color].deltaE76})`);
      assert.ok(metrics.colors[color].samples >= 80,
        `${viewport}: ${color} rendered samples too low`);
    }
  }
  assert.equal(mobileMetrics.board.materialColor, '#706b64');
  assert.notEqual(desktopMetrics.board.materialColor, '#706b64');
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);

  const result = {
    ok: true,
    source: {
      app: 'PR 17 head served locally',
      commit: process.env.V120_COMMIT || null,
      roomServer: ROOMS_URL,
      calibration: CALIBRATION_URL
    },
    roomCode: code,
    roomStatus: state.status,
    moves: state.moveNumber,
    players: state.players,
    screenshots: ['desktop-all-colors.png', 'mobile-all-colors.png'],
    thresholds: { minimumDeltaE76: 15, minimumRenderedSamples: 80 },
    desktop: desktopMetrics,
    mobile: mobileMetrics,
    errors,
    consoleErrors
  };
  await writeFile(new URL('results.json', outputDir), JSON.stringify(result, null, 2));
  console.log('v120 real online four-color desktop/mobile visual playtest passed');
} catch (error) {
  await writeFile(new URL('results.json', outputDir), JSON.stringify({
    ok: false,
    error: error.stack || String(error),
    errors,
    consoleErrors
  }, null, 2));
  throw error;
} finally {
  await desktopContext?.close();
  await mobileContext?.close();
  await browser.close();
}
