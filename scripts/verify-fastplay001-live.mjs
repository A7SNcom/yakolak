import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const milestoneSha = String(process.env.FASTPLAY001_EXPECTED_CANDIDATE_SHA || '').trim().toLowerCase();
const baseUrl = new URL(process.env.FASTPLAY001_BASE_URL || 'https://a7sncom.github.io/yakolak/threejs/');
const manifestUrl = new URL('../deployment-manifest.json', baseUrl);

if (!/^[0-9a-f]{40}$/.test(milestoneSha)) {
  throw new Error('FASTPLAY001_EXPECTED_CANDIDATE_SHA must identify the milestone web commit');
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

function candidateContainsMilestone(candidateSha) {
  if (!/^[0-9a-f]{40}$/.test(candidateSha)) return false;
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', milestoneSha, candidateSha], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function waitForPlayableCandidate() {
  let last = null;
  for (let attempt = 1; attempt <= 96; attempt += 1) {
    try {
      const manifest = await fetchJsonNoCache(manifestUrl);
      last = manifest;
      const liveSha = String(manifest?.threejsCandidateSha || '').trim().toLowerCase();
      if (candidateContainsMilestone(liveSha)) return { attempt, manifest, liveSha };
    } catch (error) {
      last = { error: error?.message || String(error) };
    }
    await delay(5_000);
  }
  const error = new Error(`FASTPLAY-001 public generation does not contain milestone ${milestoneSha}`);
  error.lastObservation = last;
  throw error;
}

async function startDefaultLocalMatch(page) {
  await page.waitForFunction(() => ['setup-ready', 'ready'].includes(document.documentElement.dataset.bootState), null, { timeout: 60_000 });
  const state = await page.evaluate(() => document.documentElement.dataset.bootState);
  if (state === 'setup-ready') await page.locator('#local-start').click();
  await page.waitForFunction(() => document.documentElement.dataset.bootState === 'ready', null, { timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.__YAKOLAK_THREEJS_SHELL__?.getCanonicalState?.()), null, { timeout: 60_000 });
  await page.waitForFunction(() => {
    const frame = window.__YAKOLAK_THREEJS_SHELL__?.getPresentationSnapshot?.()?.frame;
    return Boolean(frame?.frameCount > 0 && frame?.viewport?.width > 0 && frame?.viewport?.height > 0);
  }, null, { timeout: 60_000 });
}

async function projectedTargets(page) {
  return page.evaluate(async () => {
    const shell = window.__YAKOLAK_THREEJS_SHELL__;
    const snapshot = shell.getPresentationSnapshot();
    const state = await shell.getCanonicalState();
    const worldLayout = shell.getAsset('data.world-layout');
    const activeSeat = state.seats.find(seat => seat.seatId === state.activeSeatId);
    if (!activeSeat) throw new Error('FASTPLAY-001 active seat missing');

    const homePieces = snapshot.pieces.placements.filter(candidate =>
      candidate.colorId === activeSeat.color && candidate.destination?.kind === 'home');
    if (!homePieces.length) throw new Error('FASTPLAY-001 active human home pieces missing');
    const zone = worldLayout.zones.find(candidate => candidate.id === 0);
    if (!zone) throw new Error('FASTPLAY-001 board cell 0 missing');

    const [THREE, cameraModule] = await Promise.all([
      import(new URL('vendor/three/r185/three.module.js', location.href).href),
      import(new URL('app/camera/frame-governor.js', location.href).href),
    ]);
    const rect = shell.canvas.getBoundingClientRect();
    const cameraSpec = worldLayout.cameras[snapshot.cameraId];
    if (!cameraSpec) throw new Error(`FASTPLAY-001 camera spec missing: ${snapshot.cameraId}`);
    const aspect = rect.width / rect.height;
    const fittedFov = cameraModule.refitPerspectiveFov({ baseFov: cameraSpec.fov, aspect });
    const camera = new THREE.PerspectiveCamera(fittedFov, aspect, 0.1, 8000);
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

    const seenCenters = new Set();
    const pieceTargets = [];
    for (const piece of homePieces) {
      const center = piece.destination.center;
      const key = center.join(',');
      if (seenCenters.has(key)) continue;
      seenCenters.add(key);
      pieceTargets.push(project(center));
    }

    return {
      activeSeatId: activeSeat.seatId,
      activeColor: activeSeat.color,
      initialRevision: state.revision,
      pieces: pieceTargets,
      board: project(zone.position),
      cameraId: snapshot.cameraId,
      fittedFov,
      pieceCount: snapshot.pieces.counts.total,
      frameCount: snapshot.frame.frameCount,
      canvas: { width: rect.width, height: rect.height },
    };
  });
}

async function moveIsCommitted(page, initial) {
  return page.evaluate(async ({ revision, color }) => {
    const state = await window.__YAKOLAK_THREEJS_SHELL__.getCanonicalState();
    const cell = state?.board?.['0'];
    return Boolean(state && state.revision > revision && cell && Object.values(cell).includes(color));
  }, { revision: initial.initialRevision, color: initial.activeColor });
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

async function clickPieceUntilSelected(page, points) {
  const offsets = [
    [0, 0], [10, 0], [-10, 0], [0, 10], [0, -10],
    [18, 8], [-18, 8], [18, -8], [-18, -8],
  ];
  for (const point of points) {
    for (const [dx, dy] of offsets) {
      await page.mouse.click(point.x + dx, point.y + dy);
      const selected = await page.evaluate(() => window.__YAKOLAK_THREEJS_SHELL__.getPresentationSnapshot()?.tap?.phase === 'selected');
      if (selected) return { x: point.x + dx, y: point.y + dy };
      await page.waitForTimeout(80);
    }
  }
  const diagnostic = await page.evaluate(() => {
    const shell = window.__YAKOLAK_THREEJS_SHELL__;
    return { pointer: shell.getPresentationSnapshot()?.pointer, tap: shell.getPresentationSnapshot()?.tap };
  });
  throw new Error(`FASTPLAY-001 desktop could not select a visible home piece: ${JSON.stringify(diagnostic)}`);
}

async function dragPieceUntilCommitted(page, targets) {
  const offsets = [
    [0, 0], [10, 0], [-10, 0], [0, 10], [0, -10],
    [18, 8], [-18, 8], [18, -8], [-18, -8],
  ];
  for (const point of targets.pieces) {
    for (const [dx, dy] of offsets) {
      if (await moveIsCommitted(page, targets)) return { x: point.x + dx, y: point.y + dy };
      const from = { x: point.x + dx, y: point.y + dy };
      const to = targets.board;
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
      }, { from, to });
      await page.waitForTimeout(250);
      if (await moveIsCommitted(page, targets)) return from;
    }
  }
  const diagnostic = await page.evaluate(() => {
    const snapshot = window.__YAKOLAK_THREEJS_SHELL__.getPresentationSnapshot();
    return { pointer: snapshot?.pointer, tap: snapshot?.tap, drag: snapshot?.drag };
  });
  throw new Error(`FASTPLAY-001 mobile drag did not commit a legal move: ${JSON.stringify(diagnostic)}`);
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
    await startDefaultLocalMatch(page);
    const targets = await projectedTargets(page);
    assert.equal(targets.pieceCount, 36);
    const selectedAt = await clickPieceUntilSelected(page, targets.pieces);
    await page.mouse.click(targets.board.x, targets.board.y);
    const move = await assertMoveCommitted(page, targets);
    const health = await verifyPageHealth(page, errors);
    return { mode: 'desktop-click', targets, selectedAt, move, health };
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
    await startDefaultLocalMatch(page);
    const targets = await projectedTargets(page);
    assert.equal(targets.pieceCount, 36);
    const draggedFrom = await dragPieceUntilCommitted(page, targets);
    const move = await assertMoveCommitted(page, targets);
    const health = await verifyPageHealth(page, errors);
    return { mode: 'mobile-drag', targets, draggedFrom, move, health };
  } finally {
    await context.close();
  }
}

const live = await waitForPlayableCandidate();
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const desktop = await runDesktopClick(browser);
  const mobile = await runMobileDrag(browser);
  console.log(JSON.stringify({
    fastplay001: 'PASS',
    milestoneSha,
    candidateSha: live.liveSha,
    deploymentGeneration: live.manifest.deploymentGeneration,
    manifestAttempt: live.attempt,
    desktop,
    mobile,
  }, null, 2));
} finally {
  await browser.close();
}
