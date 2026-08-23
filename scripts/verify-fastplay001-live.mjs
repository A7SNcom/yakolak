import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const expectedCandidateSha = String(process.env.FASTPLAY001_EXPECTED_CANDIDATE_SHA || '').trim().toLowerCase();
const baseUrl = new URL(process.env.FASTPLAY001_BASE_URL || 'https://a7sncom.github.io/yakolak/threejs/');
const manifestUrl = new URL('../deployment-manifest.json', baseUrl);

if (!/^[0-9a-f]{40}$/.test(expectedCandidateSha)) {
  throw new Error('FASTPLAY001_EXPECTED_CANDIDATE_SHA must be one exact 40-hex SHA');
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJsonNoCache(url) {
  const target = new URL(url);
  target.searchParams.set('fastplay001', `${Date.now()}-${Math.random()}`);
  const response = await fetch(target, {
    redirect: 'follow',
    headers: { 'Cache-Control': 'no-cache, max-age=0', Pragma: 'no-cache' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${target}`);
  return response.json();
}

async function waitForExactCandidate() {
  let last = null;
  for (let attempt = 1; attempt <= 72; attempt += 1) {
    try {
      const manifest = await fetchJsonNoCache(manifestUrl);
      last = manifest;
      if (String(manifest?.threejsCandidateSha || '').toLowerCase() === expectedCandidateSha) {
        return { attempt, manifest };
      }
    } catch (error) {
      last = { error: error?.message || String(error) };
    }
    await delay(5_000);
  }
  const error = new Error(`FASTPLAY-001 public candidate not live: expected ${expectedCandidateSha}`);
  error.lastObservation = last;
  throw error;
}

async function waitReady(page) {
  await page.waitForFunction(() => document.documentElement.dataset.bootState === 'ready', null, { timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.__YAKOLAK_THREEJS_SHELL__?.getCanonicalState), null, { timeout: 60_000 });
}

async function projectedTargets(page) {
  return page.evaluate(async () => {
    const shell = window.__YAKOLAK_THREEJS_SHELL__;
    const snapshot = shell.getPresentationSnapshot();
    const state = await shell.getCanonicalState();
    const worldLayout = shell.getAsset('data.world-layout');
    const activeSeat = state.seats.find(seat => seat.seatId === state.activeSeatId);
    if (!activeSeat) throw new Error('FASTPLAY-001 active seat missing');
    const piece = snapshot.pieces.placements.find(candidate =>
      candidate.colorId === activeSeat.color && candidate.destination?.kind === 'home');
    if (!piece) throw new Error('FASTPLAY-001 active human home piece missing');
    const zone = worldLayout.zones.find(candidate => candidate.id === 0);
    if (!zone) throw new Error('FASTPLAY-001 board cell 0 missing');

    const THREE = await import(new URL('vendor/three/r185/three.module.js', location.href).href);
    const rect = shell.canvas.getBoundingClientRect();
    const cameraSpec = worldLayout.cameras[snapshot.cameraId];
    if (!cameraSpec) throw new Error(`FASTPLAY-001 camera spec missing: ${snapshot.cameraId}`);
    const camera = new THREE.PerspectiveCamera(cameraSpec.fov, rect.width / rect.height, 0.1, 8000);
    camera.position.fromArray(cameraSpec.position);
    camera.lookAt(new THREE.Vector3(...cameraSpec.target));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    function project(position) {
      const vector = new THREE.Vector3(...position).project(camera);
      return {
        x: rect.left + ((vector.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - vector.y) / 2) * rect.height,
      };
    }

    return {
      activeSeatId: activeSeat.seatId,
      activeColor: activeSeat.color,
      initialRevision: state.revision,
      piece: project(piece.destination.center),
      board: project(zone.position),
      cameraId: snapshot.cameraId,
      pieceCount: snapshot.pieces.counts.total,
      canvas: { width: rect.width, height: rect.height },
    };
  });
}

async function assertMoveCommitted(page, initial) {
  await page.waitForFunction(async ({ revision, color }) => {
    const shell = window.__YAKOLAK_THREEJS_SHELL__;
    const state = await shell.getCanonicalState();
    const cell = state.board?.['0'];
    return state.revision > revision && cell && Object.values(cell).includes(color);
  }, { revision: initial.initialRevision, color: initial.activeColor }, { timeout: 15_000 });

  return page.evaluate(async () => {
    const shell = window.__YAKOLAK_THREEJS_SHELL__;
    const state = await shell.getCanonicalState();
    return {
      revision: state.revision,
      cell0: state.board['0'],
      lastMove: state.lastMove,
      bootState: document.documentElement.dataset.bootState,
      fastplayScene: document.documentElement.dataset.fastplayScene,
    };
  });
}

async function verifyPageHealth(page, errors) {
  const health = await page.evaluate(() => ({
    title: document.title,
    bootState: document.documentElement.dataset.bootState,
    fastplayScene: document.documentElement.dataset.fastplayScene,
    assetErrorVisible: Boolean(document.querySelector('#asset-load-error:not([hidden])')),
    unsupportedVisible: Boolean(document.querySelector('#unsupported-webgl:not([hidden])')),
    canvasCount: document.querySelectorAll('canvas.scene').length,
    canvasRect: (() => {
      const rect = window.__YAKOLAK_THREEJS_SHELL__.canvas.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    })(),
  }));
  assert.equal(errors.length, 0, `page errors: ${errors.join(' | ')}`);
  assert.equal(health.title, 'YAKOLAK');
  assert.equal(health.bootState, 'ready');
  assert.equal(health.fastplayScene, 'real-local-game');
  assert.equal(health.assetErrorVisible, false);
  assert.equal(health.unsupportedVisible, false);
  assert.equal(health.canvasCount, 1);
  assert.ok(health.canvasRect.width > 0 && health.canvasRect.height > 0);
  return health;
}

async function runDesktopClick(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    const url = new URL(baseUrl);
    url.searchParams.set('fastplay001-desktop', Date.now());
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await waitReady(page);
    const targets = await projectedTargets(page);
    assert.equal(targets.pieceCount, 36);
    await page.mouse.click(targets.piece.x, targets.piece.y);
    await page.waitForFunction(() => window.__YAKOLAK_THREEJS_SHELL__.getPresentationSnapshot().tap.phase === 'selected', null, { timeout: 5_000 });
    await page.mouse.click(targets.board.x, targets.board.y);
    const move = await assertMoveCommitted(page, targets);
    const health = await verifyPageHealth(page, errors);
    return { mode: 'desktop-click', targets, move, health };
  } finally {
    await context.close();
  }
}

async function runMobileDrag(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    const url = new URL(baseUrl);
    url.searchParams.set('fastplay001-mobile', Date.now());
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await waitReady(page);
    const targets = await projectedTargets(page);
    assert.equal(targets.pieceCount, 36);

    await page.evaluate(({ from, to }) => {
      const canvas = window.__YAKOLAK_THREEJS_SHELL__.canvas;
      const pointerId = 41;
      const emit = (type, x, y, buttons) => canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        buttons,
        clientX: x,
        clientY: y,
      }));
      emit('pointerdown', from.x, from.y, 1);
      for (let step = 1; step <= 8; step += 1) {
        const t = step / 8;
        emit('pointermove', from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, 1);
      }
      emit('pointerup', to.x, to.y, 0);
    }, { from: targets.piece, to: targets.board });

    const move = await assertMoveCommitted(page, targets);
    const health = await verifyPageHealth(page, errors);
    return { mode: 'mobile-drag', targets, move, health };
  } finally {
    await context.close();
  }
}

const live = await waitForExactCandidate();
const browser = await chromium.launch({ headless: true });
try {
  const desktop = await runDesktopClick(browser);
  const mobile = await runMobileDrag(browser);
  console.log(JSON.stringify({
    fastplay001: 'PASS',
    candidateSha: expectedCandidateSha,
    deploymentGeneration: live.manifest.deploymentGeneration,
    manifestAttempt: live.attempt,
    desktop,
    mobile,
  }, null, 2));
} finally {
  await browser.close();
}
