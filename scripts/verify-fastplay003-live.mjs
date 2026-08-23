// FASTPLAY-003 registered-trigger marker: 2026-08-23
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const expectedCandidateSha = String(process.env.FASTPLAY003_EXPECTED_CANDIDATE_SHA || '').trim().toLowerCase();
const baseUrl = new URL(process.env.FASTPLAY003_BASE_URL || 'https://a7sncom.github.io/yakolak/threejs/');
const manifestUrl = new URL('../deployment-manifest.json', baseUrl);
const artifactPath = process.env.FASTPLAY003_ARTIFACT_PATH || 'fastplay-003-acceptance.json';

if (!/^[0-9a-f]{40}$/.test(expectedCandidateSha)) {
  throw new Error('FASTPLAY003_EXPECTED_CANDIDATE_SHA must be one exact 40-hex SHA');
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const boardIsEmpty = state => Object.values(state.board || {}).every(cell => Object.keys(cell || {}).length === 0);
const scoreSnapshot = state => Object.fromEntries(state.seats.map(seat => [seat.seatId, state.scores[seat.seatId] || 0]));

async function fetchJsonNoCache(url) {
  const target = new URL(url);
  target.searchParams.set('fastplay003', `${Date.now()}-${Math.random()}`);
  const response = await fetch(target, {
    redirect: 'follow',
    headers: { 'Cache-Control': 'no-cache, max-age=0', Pragma: 'no-cache' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${target}`);
  return response.json();
}

async function waitForExactCandidate() {
  let last = null;
  for (let attempt = 1; attempt <= 120; attempt += 1) {
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
  const error = new Error(`FASTPLAY-003 public candidate not live: expected ${expectedCandidateSha}`);
  error.lastObservation = last;
  throw error;
}

function attachPageErrorCapture(page) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error?.stack || error?.message || String(error)));
  return pageErrors;
}

async function getState(page) {
  return page.evaluate(() => window.__YAKOLAK_THREEJS_SHELL__?.getCanonicalState?.() || null);
}

async function waitSetup(page) {
  await page.waitForFunction(() => document.documentElement.dataset.bootState === 'setup-ready', null, { timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.__YAKOLAK_THREEJS_SHELL__), null, { timeout: 60_000 });
  await page.locator('#local-setup').waitFor({ state: 'visible', timeout: 10_000 });
}

async function configureHumanComputer(page) {
  await waitSetup(page);
  await page.locator('#local-seat-count').selectOption('2');
  await page.waitForFunction(() => document.querySelectorAll('#local-seat-options .seat-type').length === 2);
  const types = page.locator('#local-seat-options .seat-type');
  await types.nth(0).selectOption('human');
  await types.nth(1).selectOption('computer');
  await page.locator('#local-start').click();
  await page.waitForFunction(() => document.documentElement.dataset.bootState === 'ready', null, { timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.__YAKOLAK_THREEJS_SHELL__?.getCanonicalState?.()), null, { timeout: 60_000 });
  const state = await getState(page);
  assert.equal(state.targetPlayers, 2);
  assert.equal(state.winsToMatch, 3);
  assert.deepEqual(state.seats.map(seat => seat.type), ['human', 'computer']);
  return state;
}

async function assertHealthy(page, pageErrors, { allowSetup = false } = {}) {
  const health = await page.evaluate(() => ({
    title: document.title,
    bootState: document.documentElement.dataset.bootState,
    fastplayScene: document.documentElement.dataset.fastplayScene,
    assetErrorVisible: Boolean(document.querySelector('#asset-load-error:not([hidden])')),
    unsupportedVisible: Boolean(document.querySelector('#unsupported-webgl:not([hidden])')),
    recoveryVisible: Boolean(document.querySelector('#graphics-recovery:not([hidden])')),
    canvasCount: document.querySelectorAll('canvas.scene').length,
    canvasRect: (() => {
      const canvas = document.querySelector('canvas.scene');
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    })(),
  }));
  assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`);
  assert.equal(health.title, 'YAKOLAK');
  assert.equal(health.assetErrorVisible, false);
  assert.equal(health.unsupportedVisible, false);
  assert.equal(health.recoveryVisible, false);
  if (allowSetup) {
    assert.ok(['setup-ready', 'ready'].includes(health.bootState));
  } else {
    assert.equal(health.bootState, 'ready');
    assert.equal(health.fastplayScene, 'real-local-game');
  }
  assert.equal(health.canvasCount, 1);
  assert.ok(health.canvasRect?.width > 0 && health.canvasRect?.height > 0);
  return health;
}

async function chooseHumanMove(page, { preferWinning = true } = {}) {
  return page.evaluate(async ({ preferWinning }) => {
    const shell = window.__YAKOLAK_THREEJS_SHELL__;
    const state = await shell.getCanonicalState();
    const seat = state.seats.find(candidate => candidate.seatId === state.activeSeatId);
    if (!seat || seat.type !== 'human') return null;
    const rules = await import(new URL('app/shared/rules.js', location.href).href);
    const legal = [];
    for (let cell = 0; cell < rules.RULES.cellCount; cell += 1) {
      for (const size of rules.SIZES) {
        if (!rules.validatePlacementForSeat(state, seat.seatId, { cell, size }).ok) continue;
        let winning = false;
        const board = structuredClone(state.board);
        board[String(cell)][size] = seat.color;
        try {
          winning = rules.winningOutcomeAfterAcceptedPlacement(board, seat.color, { cell, size }).won;
        } catch {}
        legal.push({ seatId: seat.seatId, color: seat.color, cell, size, winning });
      }
    }
    if (!legal.length) return null;
    if (preferWinning) {
      const winner = legal.find(candidate => candidate.winning);
      if (winner) return winner;
    }
    const cellOrder = [4, 0, 2, 6, 8, 1, 3, 5, 7];
    const sizeOrder = ['large', 'medium', 'small'];
    legal.sort((a, b) => {
      const cellDelta = cellOrder.indexOf(a.cell) - cellOrder.indexOf(b.cell);
      if (cellDelta) return cellDelta;
      return sizeOrder.indexOf(a.size) - sizeOrder.indexOf(b.size);
    });
    return legal[0];
  }, { preferWinning });
}

async function projectMove(page, move) {
  return page.evaluate(async move => {
    const shell = window.__YAKOLAK_THREEJS_SHELL__;
    const snapshot = shell.getPresentationSnapshot();
    const worldLayout = shell.getAsset('data.world-layout');
    const piece = snapshot.pieces.placements.find(candidate =>
      candidate.colorId === move.color
      && candidate.size === move.size
      && candidate.destination?.kind === 'home');
    if (!piece) throw new Error(`FASTPLAY-003 visible home piece missing for ${move.color}/${move.size}`);
    const zone = worldLayout.zones.find(candidate => candidate.id === move.cell);
    if (!zone) throw new Error(`FASTPLAY-003 board cell missing: ${move.cell}`);
    const THREE = await import(new URL('vendor/three/r185/three.module.js', location.href).href);
    const rect = shell.canvas.getBoundingClientRect();
    const cameraSpec = worldLayout.cameras[snapshot.cameraId];
    if (!cameraSpec) throw new Error(`FASTPLAY-003 camera spec missing: ${snapshot.cameraId}`);
    const camera = new THREE.PerspectiveCamera(cameraSpec.fov, rect.width / rect.height, 0.1, 8000);
    camera.position.fromArray(cameraSpec.position);
    camera.lookAt(new THREE.Vector3(...cameraSpec.target));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const project = position => {
      const vector = new THREE.Vector3(...position).project(camera);
      return {
        x: rect.left + ((vector.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - vector.y) / 2) * rect.height,
      };
    };
    return {
      piece: project(piece.destination.center),
      board: project(zone.position),
      cameraId: snapshot.cameraId,
      canvas: { width: rect.width, height: rect.height },
    };
  }, move);
}

async function waitHumanMoveCommitted(page, beforeRevision, move) {
  await page.waitForFunction(async ({ beforeRevision, move }) => {
    const state = await window.__YAKOLAK_THREEJS_SHELL__.getCanonicalState();
    return state.revision > beforeRevision
      && state.lastMove?.seatId === move.seatId
      && state.lastMove?.cell === move.cell
      && state.lastMove?.size === move.size;
  }, { beforeRevision, move }, { timeout: 12_000 });
  return getState(page);
}

async function tapMove(page, move) {
  const before = await getState(page);
  const targets = await projectMove(page, move);
  const offsets = [[0,0],[10,0],[-10,0],[0,10],[0,-10],[18,8],[-18,8],[18,-8],[-18,-8]];
  let selectedAt = null;
  for (const [dx, dy] of offsets) {
    await page.mouse.click(targets.piece.x + dx, targets.piece.y + dy);
    const selected = await page.evaluate(size => {
      const tap = window.__YAKOLAK_THREEJS_SHELL__.getPresentationSnapshot()?.tap;
      return tap?.phase === 'selected' && tap?.selection?.selectedSize === size;
    }, move.size);
    if (selected) {
      selectedAt = { x: targets.piece.x + dx, y: targets.piece.y + dy };
      break;
    }
    await page.waitForTimeout(70);
  }
  assert.ok(selectedAt, `could not select ${move.size} piece by tap`);
  await page.mouse.click(targets.board.x, targets.board.y);
  const state = await waitHumanMoveCommitted(page, before.revision, move);
  return { gesture: 'tap', move, selectedAt, target: targets.board, revision: state.revision };
}

async function dragMove(page, move, { pointerType = 'mouse' } = {}) {
  const before = await getState(page);
  const targets = await projectMove(page, move);
  const offsets = [[0,0],[10,0],[-10,0],[0,10],[0,-10],[18,8],[-18,8],[18,-8],[-18,-8]];
  for (const [dx, dy] of offsets) {
    const from = { x: targets.piece.x + dx, y: targets.piece.y + dy };
    const to = targets.board;
    await page.evaluate(({ from, to, pointerType }) => {
      const canvas = window.__YAKOLAK_THREEJS_SHELL__.canvas;
      const pointerId = pointerType === 'touch' ? 63 : 62;
      const emit = (type, x, y, buttons) => canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType,
        isPrimary: true,
        button: 0,
        buttons,
        clientX: x,
        clientY: y,
      }));
      emit('pointerdown', from.x, from.y, 1);
      for (let step = 1; step <= 10; step += 1) {
        const t = step / 10;
        emit('pointermove', from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, 1);
      }
      emit('pointerup', to.x, to.y, 0);
    }, { from, to, pointerType });
    try {
      const state = await page.waitForFunction(async ({ beforeRevision, move }) => {
        const state = await window.__YAKOLAK_THREEJS_SHELL__.getCanonicalState();
        if (state.revision > beforeRevision && state.lastMove?.seatId === move.seatId && state.lastMove?.cell === move.cell && state.lastMove?.size === move.size) return state;
        return false;
      }, { beforeRevision: before.revision, move }, { timeout: 1_500 });
      await state.dispose();
      const committed = await getState(page);
      return { gesture: 'drag', move, from, target: to, revision: committed.revision, pointerType };
    } catch {
      await page.waitForTimeout(100);
    }
  }
  throw new Error(`could not commit ${move.size} move by ${pointerType} drag`);
}

async function waitForHumanOrRoundEnd(page, humanSeatId, { timeout = 15_000 } = {}) {
  await page.waitForFunction(async humanSeatId => {
    const state = await window.__YAKOLAK_THREEJS_SHELL__.getCanonicalState();
    return state.roundEndRevision !== null || state.matchComplete || state.activeSeatId === humanSeatId;
  }, humanSeatId, { timeout });
  return getState(page);
}

async function allowRealTimeout(page) {
  const before = await getState(page);
  const seat = before.seats.find(candidate => candidate.seatId === before.activeSeatId);
  assert.equal(seat?.type, 'human', 'real timeout must begin on the human seat');
  assert.ok(Number.isSafeInteger(before.deadlineAtMs), 'human deadline missing');
  const remainingMs = before.deadlineAtMs - Date.now();
  assert.ok(remainingMs >= 15_000 && remainingMs <= 19_500, `expected fresh 18-second deadline, got ${remainingMs}ms`);
  const startedAt = Date.now();
  await page.waitForFunction(async ({ revision, seatId }) => {
    const state = await window.__YAKOLAK_THREEJS_SHELL__.getCanonicalState();
    return state.revision > revision && state.skips?.some(skip => skip.seatId === seatId && skip.reason === 'timeout');
  }, { revision: before.revision, seatId: seat.seatId }, { timeout: 23_000, polling: 25 });
  const after = await getState(page);
  const elapsedMs = Date.now() - startedAt;
  assert.ok(elapsedMs >= Math.max(14_500, remainingMs - 350), `timeout advanced too early after ${elapsedMs}ms`);
  assert.ok(after.skips.some(skip => skip.seatId === seat.seatId && skip.reason === 'timeout'));
  return {
    seatId: seat.seatId,
    deadlineAtMs: before.deadlineAtMs,
    observedRevision: after.revision,
    elapsedMs,
  };
}

async function verifyWebglRecovery(page) {
  const before = await getState(page);
  const initialGraphics = await page.evaluate(() => window.__YAKOLAK_THREEJS_SHELL__.getGraphicsContextSnapshot());
  assert.equal(initialGraphics.state, 'ready');
  const supported = await page.evaluate(() => {
    const canvas = window.__YAKOLAK_THREEJS_SHELL__.canvas;
    const gl = canvas.getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_lose_context');
    if (!ext) return false;
    window.__FASTPLAY003_WEBGL_LOSE_CONTEXT__ = ext;
    ext.loseContext();
    return true;
  });
  assert.equal(supported, true, 'WEBGL_lose_context is required to verify real WebGL recovery');
  await page.waitForFunction(() => window.__YAKOLAK_THREEJS_SHELL__.getGraphicsContextSnapshot().state === 'lost', null, { timeout: 5_000 });
  await page.evaluate(() => window.__FASTPLAY003_WEBGL_LOSE_CONTEXT__.restoreContext());
  await page.waitForFunction(() => window.__YAKOLAK_THREEJS_SHELL__.getGraphicsContextSnapshot().state === 'ready', null, { timeout: 10_000 });
  const after = await getState(page);
  const graphics = await page.evaluate(() => window.__YAKOLAK_THREEJS_SHELL__.getGraphicsContextSnapshot());
  assert.equal(after.revision, before.revision, 'WebGL recovery mutated canonical revision');
  assert.deepEqual(after.board, before.board, 'WebGL recovery mutated board');
  assert.deepEqual(after.scores, before.scores, 'WebGL recovery mutated scores');
  assert.ok(graphics.restoreCount >= initialGraphics.restoreCount + 1);
  return { before: initialGraphics, after: graphics };
}

async function finishRound(page, humanSeatId, gestureBook) {
  for (let step = 0; step < 80; step += 1) {
    const state = await getState(page);
    if (state.roundEndRevision !== null || state.matchComplete) return state;
    if (state.activeSeatId === humanSeatId) {
      const move = await chooseHumanMove(page);
      if (!move) {
        await page.waitForTimeout(100);
        continue;
      }
      const forceDrag = gestureBook.drag === 0;
      const forceTap = gestureBook.tap === 0;
      if (forceTap) {
        await tapMove(page, move);
        gestureBook.tap += 1;
      } else if (forceDrag) {
        await dragMove(page, move, { pointerType: 'mouse' });
        gestureBook.drag += 1;
      } else if ((gestureBook.tap + gestureBook.drag) % 2 === 0) {
        await tapMove(page, move);
        gestureBook.tap += 1;
      } else {
        await dragMove(page, move, { pointerType: 'mouse' });
        gestureBook.drag += 1;
      }
    }
    await waitForHumanOrRoundEnd(page, humanSeatId, { timeout: 20_000 });
  }
  throw new Error('round did not finish within deterministic safety bound');
}

async function finishMatch(page, humanSeatId, gestureBook) {
  const rounds = [];
  let verifiedNextRoundReset = false;
  for (let guard = 0; guard < 12; guard += 1) {
    let state = await finishRound(page, humanSeatId, gestureBook);
    const visibleResult = await page.locator('#round-result').isVisible();
    assert.equal(visibleResult, true, `round result not visible for round ${state.round}`);
    rounds.push({ round: state.round, scores: scoreSnapshot(state), winner: state.winner, draw: state.draw, matchComplete: state.matchComplete });
    if (state.matchComplete) return { state, rounds, verifiedNextRoundReset };

    const beforeRound = state.round;
    const beforeScores = scoreSnapshot(state);
    await page.locator('#next-round').click();
    await page.waitForFunction(() => {
      const panel = document.querySelector('#round-result');
      return document.documentElement.dataset.bootState === 'ready' && panel?.hidden === true;
    }, null, { timeout: 10_000 });
    state = await getState(page);
    assert.equal(state.round, beforeRound + 1);
    assert.deepEqual(scoreSnapshot(state), beforeScores, 'next-round reset changed match scores');
    assert.equal(state.roundEndRevision, null);
    assert.equal(state.winner, null);
    assert.equal(state.draw, false);
    assert.equal(state.lastMove, null);
    assert.equal(boardIsEmpty(state), true, 'next-round reset did not clear board');
    verifiedNextRoundReset = true;
  }
  throw new Error('match did not finish within 12 rounds');
}

async function runDesktop(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const pageErrors = attachPageErrorCapture(page);
  try {
    const url = new URL(baseUrl);
    url.searchParams.set('fastplay003-desktop', `${Date.now()}`);
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const initial = await configureHumanComputer(page);
    const humanSeatId = initial.seats.find(seat => seat.type === 'human').seatId;
    const timeout = await allowRealTimeout(page);
    await waitForHumanOrRoundEnd(page, humanSeatId, { timeout: 15_000 });

    const gestureBook = { tap: 0, drag: 0 };
    const firstMove = await chooseHumanMove(page);
    assert.ok(firstMove, 'no legal tap move after timeout');
    const tap = await tapMove(page, firstMove);
    gestureBook.tap += 1;
    await waitForHumanOrRoundEnd(page, humanSeatId, { timeout: 15_000 });

    const secondMove = await chooseHumanMove(page);
    assert.ok(secondMove, 'no legal drag move after tap');
    const drag = await dragMove(page, secondMove, { pointerType: 'mouse' });
    gestureBook.drag += 1;
    await waitForHumanOrRoundEnd(page, humanSeatId, { timeout: 15_000 });

    const webgl = await verifyWebglRecovery(page);
    const matched = await finishMatch(page, humanSeatId, gestureBook);
    assert.equal(matched.verifiedNextRoundReset, true, 'next-round reset was not verified');
    const matchState = matched.state;
    assert.equal(matchState.matchComplete, true);
    assert.equal(matchState.scores[matchState.matchWinner.seatId], 3);
    assert.equal(await page.locator('#rematch').isVisible(), true);
    assert.equal(await page.locator('#next-round').isVisible(), false);

    await page.locator('#rematch').click();
    await page.waitForFunction(() => document.documentElement.dataset.bootState === 'ready' && document.querySelector('#round-result')?.hidden === true, null, { timeout: 10_000 });
    const rematchState = await getState(page);
    assert.equal(rematchState.matchComplete, false);
    assert.equal(rematchState.round, 1);
    assert.equal(boardIsEmpty(rematchState), true);
    assert.ok(Object.values(rematchState.scores).every(score => score === 0));

    const rematchHumanSeatId = rematchState.seats.find(seat => seat.type === 'human').seatId;
    const rematchRound = await finishRound(page, rematchHumanSeatId, gestureBook);
    assert.equal(await page.locator('#round-result').isVisible(), true);
    await page.locator('#return-setup').click();
    await waitSetup(page);
    const setupState = await page.evaluate(() => ({
      bootState: document.documentElement.dataset.bootState,
      scene: document.documentElement.dataset.fastplayScene,
      setupVisible: !document.querySelector('#local-setup')?.hidden,
      hudHidden: document.querySelector('#game-hud')?.hidden === true,
    }));
    assert.deepEqual(setupState, { bootState: 'setup-ready', scene: 'setup', setupVisible: true, hudHidden: true });

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => ['setup-ready', 'ready'].includes(document.documentElement.dataset.bootState), null, { timeout: 60_000 });
    const refreshHealth = await assertHealthy(page, pageErrors, { allowSetup: true });

    return {
      mode: 'desktop',
      timeout,
      tap,
      drag,
      webgl,
      firstRound: matched.rounds[0],
      completedRounds: matched.rounds.length,
      finalScores: scoreSnapshot(matchState),
      rematch: { round: rematchState.round, scores: scoreSnapshot(rematchState) },
      returnToSetup: setupState,
      refresh: refreshHealth,
      rematchRoundFinished: rematchRound.roundEndRevision !== null,
      pageErrors,
    };
  } finally {
    await context.close();
  }
}

async function runMobile(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const pageErrors = attachPageErrorCapture(page);
  try {
    const url = new URL(baseUrl);
    url.searchParams.set('fastplay003-mobile', `${Date.now()}`);
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const initial = await configureHumanComputer(page);
    const move = await chooseHumanMove(page);
    assert.ok(move, 'mobile human has no legal move');
    const drag = await dragMove(page, move, { pointerType: 'touch' });
    const health = await assertHealthy(page, pageErrors);
    assert.ok(health.canvasRect.height > health.canvasRect.width, 'mobile portrait canvas is not portrait');
    return {
      mode: 'mobile-portrait',
      viewport: { width: 390, height: 844 },
      seats: initial.seats.map(seat => ({ seatId: seat.seatId, type: seat.type, color: seat.color })),
      drag,
      health,
      pageErrors,
    };
  } finally {
    await context.close();
  }
}

const live = await waitForExactCandidate();
const browser = await chromium.launch({ headless: true });
let output;
try {
  const desktop = await runDesktop(browser);
  const mobile = await runMobile(browser);
  output = {
    FIRST_PLAYABLE_EXPERIMENTAL: 'PASS',
    candidateSha: expectedCandidateSha,
    deploymentGeneration: live.manifest.deploymentGeneration,
    publicUrl: baseUrl.href,
    manifestAttempt: live.attempt,
    desktop,
    mobile,
  };
  fs.writeFileSync(artifactPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(output, null, 2));
} finally {
  await browser.close();
}