import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const milestoneSha = String(process.env.FASTPLAY002_EXPECTED_CANDIDATE_SHA || '').trim().toLowerCase();
const baseUrl = new URL(process.env.FASTPLAY002_BASE_URL || 'https://a7sncom.github.io/yakolak/threejs/');
const manifestUrl = new URL('../deployment-manifest.json', baseUrl);

if (!/^[0-9a-f]{40}$/.test(milestoneSha)) throw new Error('FASTPLAY002_EXPECTED_CANDIDATE_SHA must identify the milestone web commit');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJsonNoCache(url) {
  const target = new URL(url);
  target.searchParams.set('fastplay002', `${Date.now()}-${Math.random()}`);
  const response = await fetch(target, { redirect: 'follow', headers: { 'Cache-Control': 'no-cache, max-age=0', Pragma: 'no-cache' } });
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
  const error = new Error(`FASTPLAY-002 public generation does not contain milestone ${milestoneSha}`);
  error.lastObservation = last;
  throw error;
}

async function projectMoveTargets(page, size, cell) {
  return page.evaluate(async ({ size, cell }) => {
    const shell = window.__YAKOLAK_THREEJS_SHELL__;
    const snapshot = shell.getPresentationSnapshot();
    const state = await shell.getCanonicalState();
    const worldLayout = shell.getAsset('data.world-layout');
    const activeSeat = state.seats.find(seat => seat.seatId === state.activeSeatId);
    if (!activeSeat) throw new Error('FASTPLAY-002 active seat missing');
    const piece = snapshot.pieces.placements.find(candidate =>
      candidate.colorId === activeSeat.color && candidate.size === size && candidate.destination?.kind === 'home');
    const zone = worldLayout.zones.find(candidate => candidate.id === cell);
    if (!piece || !zone) throw new Error(`FASTPLAY-002 target missing for ${activeSeat.color}/${size}/${cell}`);

    const THREE = await import(new URL('vendor/three/r185/three.module.js', location.href).href);
    const rect = shell.canvas.getBoundingClientRect();
    const cameraSpec = worldLayout.cameras[snapshot.cameraId];
    const camera = new THREE.PerspectiveCamera(cameraSpec.fov, rect.width / rect.height, 0.1, 8000);
    camera.position.fromArray(cameraSpec.position);
    camera.lookAt(new THREE.Vector3(...cameraSpec.target));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const project = position => {
      const vector = new THREE.Vector3(...position).project(camera);
      return { x: rect.left + ((vector.x + 1) / 2) * rect.width, y: rect.top + ((1 - vector.y) / 2) * rect.height };
    };
    return { revision: state.revision, color: activeSeat.color, seatId: activeSeat.seatId, size, cell, piece: project(piece.destination.center), board: project(zone.position) };
  }, { size, cell });
}

async function clickUntilSelected(page, target) {
  const offsets = [[0,0],[10,0],[-10,0],[0,10],[0,-10],[18,8],[-18,8],[18,-8],[-18,-8]];
  for (const [dx, dy] of offsets) {
    await page.mouse.click(target.piece.x + dx, target.piece.y + dy);
    const selected = await page.evaluate(size => {
      const tap = window.__YAKOLAK_THREEJS_SHELL__.getPresentationSnapshot()?.tap;
      return tap?.phase === 'selected' && tap?.selection?.selectedSize === size;
    }, target.size);
    if (selected) return;
    await page.waitForTimeout(70);
  }
  throw new Error(`FASTPLAY-002 could not select ${target.color}/${target.size}`);
}

async function commitMove(page, size, cell, { assertSelectionHud = false } = {}) {
  const target = await projectMoveTargets(page, size, cell);
  await clickUntilSelected(page, target);
  if (assertSelectionHud) {
    const hud = await page.evaluate(() => ({
      selected: document.querySelector('#hud-selection')?.textContent || '',
      legal: document.querySelector('#hud-legal')?.textContent || '',
    }));
    assert.match(hud.selected, /Selected (Small|Medium|Large)/);
    assert.doesNotMatch(hud.legal, /Legal —/);
  }
  await page.mouse.click(target.board.x, target.board.y);
  await page.waitForFunction(async ({ revision, color, size, cell }) => {
    const shell = window.__YAKOLAK_THREEJS_SHELL__;
    const state = await shell.getCanonicalState();
    return state.revision > revision && state.lastMove?.color === color && state.lastMove?.size === size && state.lastMove?.cell === cell;
  }, target, { timeout: 12_000 });
  await page.waitForFunction(() => !window.__YAKOLAK_THREEJS_SHELL__.canvas.dataset.movePresentationLock, null, { timeout: 12_000 });
  await page.waitForTimeout(120);
  const lastHud = await page.locator('#hud-last-move').textContent();
  assert.ok(lastHud && !lastHud.includes('Last —'));
}

async function playMarbleWinRound(page, firstMoveFlag) {
  let marbleIndex = 0;
  let blueIndex = 0;
  const marbleCells = [0, 1, 2];
  const blueCells = [3, 4, 6];
  while (true) {
    const state = await page.evaluate(() => window.__YAKOLAK_THREEJS_SHELL__.getCanonicalState());
    if (state.roundEndRevision !== null) return state;
    const active = state.seats.find(seat => seat.seatId === state.activeSeatId);
    if (active.color === 'marble') {
      await commitMove(page, 'small', marbleCells[marbleIndex++], { assertSelectionHud: firstMoveFlag.value });
      firstMoveFlag.value = false;
    } else if (active.color === 'blue') {
      await commitMove(page, 'medium', blueCells[blueIndex++]);
    } else {
      throw new Error(`FASTPLAY-002 unexpected active color ${active.color}`);
    }
  }
}

async function verifyScorePresentation(page, expectedMarbleScore) {
  const snapshot = await page.evaluate(() => window.__YAKOLAK_THREEJS_SHELL__.getPresentationSnapshot());
  const marker = snapshot.scoreMarkers.seats.find(seat => seat.colorId === 'marble');
  assert.equal(marker.count, expectedMarbleScore);
  const scores = await page.locator('#hud-scores').textContent();
  assert.match(scores || '', new RegExp(`Marble ${expectedMarbleScore}/3`));
}

const live = await waitForPlayableCandidate();
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  const url = new URL(baseUrl);
  url.searchParams.set('fastplay002-live', Date.now());
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => document.documentElement.dataset.bootState === 'setup-ready', null, { timeout: 60_000 });

  assert.equal(await page.locator('#local-setup').isVisible(), true);
  assert.equal(await page.locator('#app').getAttribute('data-fastplay-local-flow'), 'FASTPLAY-002');
  await page.locator('#local-seat-count').selectOption('4');
  const fourSeats = await page.evaluate(() => [...document.querySelectorAll('#local-seat-options .seat-option')].map(row => ({
    seatId: row.dataset.seatId,
    color: row.querySelector('.seat-swatch')?.dataset.color,
  })));
  assert.deepEqual(fourSeats, [
    { seatId: 'right', color: 'marble' },
    { seatId: 'back', color: 'blue' },
    { seatId: 'left', color: 'gold' },
    { seatId: 'front', color: 'green' },
  ]);
  await page.locator('#local-seat-count').selectOption('2');
  const types = page.locator('#local-seat-options .seat-type');
  await types.nth(0).selectOption('human');
  await types.nth(1).selectOption('human');
  await page.locator('#local-start').click();

  await page.waitForFunction(() => document.documentElement.dataset.bootState === 'ready', null, { timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.__YAKOLAK_THREEJS_SHELL__?.getCanonicalState?.()), null, { timeout: 60_000 });
  const initial = await page.evaluate(async () => {
    const shell = window.__YAKOLAK_THREEJS_SHELL__;
    const state = await shell.getCanonicalState();
    return {
      state,
      timer: document.querySelector('#hud-timer')?.textContent || '',
      turn: document.querySelector('#hud-turn')?.textContent || '',
      scores: document.querySelector('#hud-scores')?.textContent || '',
      scene: document.documentElement.dataset.fastplayScene,
    };
  });
  assert.equal(initial.state.targetPlayers, 2);
  assert.equal(initial.state.winsToMatch, 3);
  assert.deepEqual(initial.state.seats.map(seat => [seat.seatId, seat.color, seat.type]), [
    ['right', 'marble', 'human'], ['back', 'blue', 'human'],
  ]);
  assert.match(initial.timer, /^(1[6-8])s$/);
  assert.match(initial.turn, /Marble/);
  assert.match(initial.scores, /Marble 0\/3/);
  assert.equal(initial.scene, 'real-local-game');

  const firstMoveFlag = { value: true };
  for (let expectedScore = 1; expectedScore <= 3; expectedScore += 1) {
    const ended = await playMarbleWinRound(page, firstMoveFlag);
    assert.equal(ended.winner?.color, 'marble');
    assert.equal(ended.scores.right, expectedScore);
    await page.waitForFunction(() => !document.querySelector('#round-result')?.hidden, null, { timeout: 5_000 });
    await verifyScorePresentation(page, expectedScore);

    if (expectedScore < 3) {
      assert.equal(await page.locator('#next-round').isVisible(), true);
      assert.equal(await page.locator('#rematch').isVisible(), false);
      const priorRound = ended.round;
      await page.locator('#next-round').click();
      await page.waitForFunction(async priorRound => {
        const state = await window.__YAKOLAK_THREEJS_SHELL__?.getCanonicalState?.();
        return state?.round === priorRound + 1 && state.roundEndRevision === null && document.documentElement.dataset.bootState === 'ready';
      }, priorRound, { timeout: 15_000 });
    }
  }

  const match = await page.evaluate(() => window.__YAKOLAK_THREEJS_SHELL__.getCanonicalState());
  assert.equal(match.matchComplete, true);
  assert.equal(match.winner?.color, 'marble');
  assert.equal(match.scores.right, 3);
  assert.equal(await page.locator('#rematch').isVisible(), true);
  assert.equal(await page.locator('#next-round').isVisible(), false);
  assert.equal(await page.locator('#return-setup').isVisible(), true);
  assert.match(await page.locator('#result-title').textContent(), /Marble wins the match/);

  await page.locator('#rematch').click();
  await page.waitForFunction(async () => {
    const state = await window.__YAKOLAK_THREEJS_SHELL__?.getCanonicalState?.();
    return state?.round === 1 && state?.scores?.right === 0 && state?.scores?.back === 0 && !state.matchComplete && state.roundEndRevision === null;
  }, null, { timeout: 15_000 });
  await verifyScorePresentation(page, 0);

  await page.evaluate(() => document.querySelector('#return-setup')?.click());
  await page.waitForFunction(() => document.documentElement.dataset.bootState === 'setup-ready' && !document.querySelector('#local-setup')?.hidden, null, { timeout: 10_000 });

  assert.equal(errors.length, 0, `page errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({
    fastplay002: 'PASS',
    milestoneSha,
    candidateSha: live.liveSha,
    deploymentGeneration: live.manifest.deploymentGeneration,
    manifestAttempt: live.attempt,
    finalScore: 3,
    rematchReset: true,
    returnedToSetup: true,
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
