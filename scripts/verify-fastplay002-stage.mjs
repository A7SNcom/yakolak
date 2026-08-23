import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const stage = String(process.env.FASTPLAY002_DIAG_STAGE || 'setup-start').trim();
const milestoneSha = String(process.env.FASTPLAY002_EXPECTED_CANDIDATE_SHA || '').trim().toLowerCase();
const baseUrl = new URL(process.env.FASTPLAY002_BASE_URL || 'https://a7sncom.github.io/yakolak/threejs/');
const manifestUrl = new URL('../deployment-manifest.json', baseUrl);

if (!/^[0-9a-f]{40}$/.test(milestoneSha)) throw new Error('FASTPLAY002_EXPECTED_CANDIDATE_SHA must identify the milestone web commit');
if (!['setup-start', 'selection', 'commit'].includes(stage)) throw new Error(`Unknown FASTPLAY002_DIAG_STAGE ${stage}`);

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJsonNoCache(url) {
  const target = new URL(url);
  target.searchParams.set('fastplay002-diag', `${Date.now()}-${Math.random()}`);
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
  for (let attempt = 1; attempt <= 96; attempt += 1) {
    try {
      const manifest = await fetchJsonNoCache(manifestUrl);
      const liveSha = String(manifest?.threejsCandidateSha || '').trim().toLowerCase();
      if (candidateContainsMilestone(liveSha)) return manifest;
    } catch {}
    await delay(5_000);
  }
  throw new Error(`FASTPLAY-002 public generation does not contain milestone ${milestoneSha}`);
}

async function setupTwoHumans(page) {
  await page.waitForFunction(() => document.documentElement.dataset.bootState === 'setup-ready', null, { timeout: 60_000 });
  assert.equal(await page.locator('#local-setup').isVisible(), true);
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
      scene: document.documentElement.dataset.fastplayScene,
      milestone: document.querySelector('#app')?.dataset.fastplayMilestone || null,
      setupHidden: document.querySelector('#local-setup')?.hidden,
      hudHidden: document.querySelector('#game-hud')?.hidden,
    };
  });
  assert.equal(initial.milestone, 'FASTPLAY-002');
  assert.equal(initial.scene, 'real-local-game');
  assert.equal(initial.setupHidden, true);
  assert.equal(initial.hudHidden, false);
  assert.equal(initial.state.targetPlayers, 2);
  assert.equal(initial.state.winsToMatch, 3);
  assert.deepEqual(initial.state.seats.map(seat => [seat.seatId, seat.color, seat.type]), [
    ['right', 'marble', 'human'], ['back', 'blue', 'human'],
  ]);
  return initial.state;
}

async function projectFirstMove(page) {
  return page.evaluate(async () => {
    const shell = window.__YAKOLAK_THREEJS_SHELL__;
    const snapshot = shell.getPresentationSnapshot();
    const state = await shell.getCanonicalState();
    const worldLayout = shell.getAsset('data.world-layout');
    const activeSeat = state.seats.find(seat => seat.seatId === state.activeSeatId);
    if (!activeSeat) throw new Error('active seat missing');
    const piece = snapshot.pieces.placements.find(candidate =>
      candidate.colorId === activeSeat.color && candidate.size === 'small' && candidate.destination?.kind === 'home');
    const zone = worldLayout.zones.find(candidate => candidate.id === 0);
    if (!piece || !zone) throw new Error('first move target missing');

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
      return {
        x: rect.left + ((vector.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - vector.y) / 2) * rect.height,
      };
    };
    return {
      revision: state.revision,
      color: activeSeat.color,
      piece: project(piece.destination.center),
      board: project(zone.position),
    };
  });
}

async function selectFirstPiece(page, target) {
  const offsets = [[0,0],[10,0],[-10,0],[0,10],[0,-10],[18,8],[-18,8],[18,-8],[-18,-8]];
  for (const [dx, dy] of offsets) {
    await page.mouse.click(target.piece.x + dx, target.piece.y + dy);
    const selected = await page.evaluate(() => {
      const tap = window.__YAKOLAK_THREEJS_SHELL__.getPresentationSnapshot()?.tap;
      return tap?.phase === 'selected' && tap?.selection?.selectedSize === 'small';
    });
    if (selected) return;
    await page.waitForTimeout(70);
  }
  throw new Error('first visible home piece could not be selected');
}

const live = await waitForPlayableCandidate();
const liveSha = String(live.threejsCandidateSha || '').toLowerCase();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
try {
  const url = new URL(baseUrl);
  url.searchParams.set(`fastplay002-${stage}`, Date.now());
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await setupTwoHumans(page);
  assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`);
  if (stage === 'setup-start') {
    console.log(`FASTPLAY-002 staged diagnostic PASS setup-start on ${liveSha}`);
  } else {
    const target = await projectFirstMove(page);
    await selectFirstPiece(page, target);
    const selection = await page.evaluate(() => window.__YAKOLAK_THREEJS_SHELL__.getPresentationSnapshot()?.tap?.selection);
    assert.equal(selection?.selectedSize, 'small');
    assert.ok(Array.isArray(selection?.legalCells) && selection.legalCells.includes(0));
    if (stage === 'selection') {
      console.log(`FASTPLAY-002 staged diagnostic PASS selection on ${liveSha}`);
    } else {
      await page.mouse.click(target.board.x, target.board.y);
      await page.waitForFunction(async ({ revision, color }) => {
        const state = await window.__YAKOLAK_THREEJS_SHELL__.getCanonicalState();
        return state.revision > revision && state.lastMove?.color === color && state.lastMove?.size === 'small' && state.lastMove?.cell === 0;
      }, target, { timeout: 12_000 });
      await page.waitForFunction(() => !window.__YAKOLAK_THREEJS_SHELL__.canvas.dataset.movePresentationLock, null, { timeout: 12_000 });
      assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`);
      console.log(`FASTPLAY-002 staged diagnostic PASS commit on ${liveSha}`);
    }
  }
} finally {
  await context.close();
  await browser.close();
}
