import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import { mkdirSync } from 'node:fs';

const BASE_URL = (process.env.YAKOLAK_UX_SELECT_45_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const LABEL = process.env.YAKOLAK_UX_SELECT_45_LABEL || 'source';
const SHARD = process.env.YAKOLAK_UX_SELECT_45_SHARD || 'all';
const ARTIFACT_DIR = `artifacts/ux-select-45-${LABEL}`;
const PLAYERS = [
  { index: 0, direction: 'right', color: 'marble' },
  { index: 1, direction: 'back', color: 'blue' },
  { index: 2, direction: 'left', color: 'gold' },
  { index: 3, direction: 'front', color: 'green' },
];
const SIDES = [-1, 0, 1];
const SIZES = ['large', 'medium', 'small'];
const FINAL_LIGHT_STATES = ['final', 'stable', 'immediate'];

mkdirSync(ARTIFACT_DIR, { recursive: true });
test.describe.configure({ timeout: 1200000 });
test.use({ launchOptions: { args: [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
  '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage',
] } });

function shouldRun(name) { return SHARD === 'all' || SHARD === name; }

function contextOptions(kind, reducedMotion = false) {
  return kind === 'mobile'
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' }
    : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' };
}

async function startMatrix(page, reducedMotion = false) {
  await page.goto(`${BASE_URL}/?yakolakTestFast=1&uxSelect45=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.yakolakIntro === 'complete' &&
    document.body.dataset.yakolakSetup === 'visible' &&
    typeof window.yakolakTestSelect44StartMatrix === 'function' &&
    typeof window.yakolakTestSelect44SetPlayer === 'function' &&
    typeof window.yakolakTestSelect44Lifecycle === 'function' &&
    typeof window.yakolakTestSelect44RefreshPickTarget === 'function' &&
    typeof window.yakolakTestPlayOneMove === 'function', null, { timeout: 60000 });
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(reducedMotion);
  await page.evaluate(() => window.yakolakTestSelect44StartMatrix());
  await waitForPlayer(page, PLAYERS[0], reducedMotion, false);
  await expectSelectionCount(page, 0);
}

async function waitForPlayer(page, player, reducedMotion, force = true) {
  if (force) await page.evaluate(index => window.yakolakTestSelect44SetPlayer(index), player.index);
  await page.waitForFunction(({ direction, reduced, states }) => {
    const d = document.body.dataset;
    return d.yakolakGameplay === 'ready' && d.yakolakCurrentPlayer === direction &&
      d.yakolakCameraStage === 'ready' && d.yakolakCameraCurrent === 'true' &&
      d.yakolakBoardVisible === 'true' && d.yakolakCameraFocusInside === 'true' &&
      Number(d.yakolakCameraFacing || 0) > 0.995 && d.yakolakTurnCamera === direction &&
      d.yakolakTurnLightDirection === direction && d.yakolakTurnLightFinalCount === '1' &&
      d.yakolakTurnLightReducedMotion === (reduced ? 'true' : 'false') &&
      states.includes(d.yakolakTurnLightState || '');
  }, { direction: player.direction, reduced: reducedMotion, states: FINAL_LIGHT_STATES }, { timeout: 20000 });
  const light = await page.evaluate(() => ({
    owner: document.body.dataset.yakolakTurnLightOwner || '',
    source: document.body.dataset.yakolakTurnLightSource || '',
    scope: document.body.dataset.yakolakTurnLightScope || '',
    state: document.body.dataset.yakolakTurnLightState || '',
  }));
  expect(light.owner).toBe('single-authoritative-controller');
  expect(light.source).toBe('authoritative-turn-signal');
  expect(light.scope).toBe('localized-seat-spots');
  if (reducedMotion) expect(light.state).toBe('immediate');
}

async function freshPickTarget(page, direction, side, size) {
  const before = await page.evaluate(() => Number(document.body.dataset.yakolakSelect44TargetRevision || 0));
  await page.evaluate(({ side, size }) => window.yakolakTestSelect44RefreshPickTarget(side, size), { side, size });
  await page.waitForFunction(({ before, direction, side, size }) => {
    const d = document.body.dataset;
    return Number(d.yakolakSelect44TargetRevision || 0) > before &&
      d.yakolakSelect44TargetDirection === direction && Number(d.yakolakSelect44TargetSide) === side &&
      d.yakolakSelect44TargetSize === size && Number(d.yakolakSelect44TargetX || 0) > 0 && Number(d.yakolakSelect44TargetY || 0) > 0;
  }, { before, direction, side, size }, { timeout: 15000 });
  const target = await page.evaluate(() => ({ x: Number(document.body.dataset.yakolakSelect44TargetX), y: Number(document.body.dataset.yakolakSelect44TargetY) }));
  const viewport = page.viewportSize();
  expect(target.x).toBeGreaterThan(0); expect(target.y).toBeGreaterThan(0);
  expect(target.x).toBeLessThan(viewport.width); expect(target.y).toBeLessThan(viewport.height);
  return target;
}

async function activatePiece(page, inputMode, direction, side, size, target = null) {
  const point = target || await freshPickTarget(page, direction, side, size);
  if (inputMode === 'touch') await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
  const owner = `Stone_${direction}_${side}_${size}`;
  await page.waitForFunction(({ owner, size }) => {
    const d = document.body.dataset;
    return d.yakolakSelected === owner && d.yakolakSelectedSize === size && d.yakolakTray === 'open' &&
      d.yakolakSelectionEmphasisCount === '1' && d.yakolakSelectionEmphasisOwner === owner;
  }, { owner, size }, { timeout: 7000 });
  await page.waitForTimeout(360);
  return owner;
}

async function expectSelectionCount(page, count, owner = '') {
  await page.waitForFunction(({ count, owner }) => document.body.dataset.yakolakSelectionEmphasisCount === String(count) &&
    document.body.dataset.yakolakSelectionEmphasisOwner === owner, { count, owner }, { timeout: 7000 });
}

async function clearSelection(page) {
  await page.evaluate(() => window.yakolakTestSelect44Lifecycle('cancel'));
  await page.waitForFunction(() => {
    const d = document.body.dataset;
    return d.yakolakTray === 'closed' && d.yakolakSelected === '' && d.yakolakSelectionEmphasisCount === '0' && d.yakolakSelectionEmphasisOwner === '';
  }, null, { timeout: 7000 });
}

async function assertCueContract(page, owner) {
  const state = await page.evaluate(() => ({
    count: Number(document.body.dataset.yakolakSelectionEmphasisCount || -1),
    owner: document.body.dataset.yakolakSelectionEmphasisOwner || '',
    style: document.body.dataset.yakolakSelectionStyle || '',
    outline: document.body.dataset.yakolakSelectionOutline || '',
    grow: Number(document.body.dataset.yakolakSelectionOutlineGrow || 0),
    emission: Number(document.body.dataset.yakolakSelectionEmissionEnergy || 0),
  }));
  expect(state.count).toBe(1); expect(state.owner).toBe(owner);
  expect(state.style).toContain('outline'); expect(['dark', 'light']).toContain(state.outline);
  expect(state.grow).toBeGreaterThan(0.20); expect(state.grow).toBeLessThanOrEqual(1.08);
  expect(state.emission).toBeGreaterThan(0); expect(state.emission).toBeLessThanOrEqual(0.20);
}

function lumaDelta(beforeBuffer, afterBuffer, target, radius = 92) {
  const before = PNG.sync.read(beforeBuffer), after = PNG.sync.read(afterBuffer);
  expect(after.width).toBe(before.width); expect(after.height).toBe(before.height);
  const x0 = Math.max(0, Math.floor(target.x - radius)), y0 = Math.max(0, Math.floor(target.y - radius));
  const x1 = Math.min(before.width, Math.ceil(target.x + radius)), y1 = Math.min(before.height, Math.ceil(target.y + radius));
  let pixels = 0, lumaChanged = 0, rgbChanged = 0, totalLuma = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (before.width * y + x) << 2;
    const br = before.data[i], bg = before.data[i+1], bb = before.data[i+2];
    const ar = after.data[i], ag = after.data[i+1], ab = after.data[i+2];
    const dl = Math.abs((0.2126*ar + 0.7152*ag + 0.0722*ab) - (0.2126*br + 0.7152*bg + 0.0722*bb));
    const drgb = (Math.abs(ar-br)+Math.abs(ag-bg)+Math.abs(ab-bb))/3;
    pixels++; totalLuma += dl; if (dl >= 12) lumaChanged++; if (drgb >= 12) rgbChanged++;
  }
  return { lumaChangedRatio: lumaChanged/pixels, rgbChangedRatio: rgbChanged/pixels, meanLumaDelta: totalLuma/pixels };
}

async function capturePair(page, kind, inputMode, player, side, size, reducedMotion = false) {
  await clearSelection(page);
  const target = await freshPickTarget(page, player.direction, side, size);
  const stem = `${kind}-${reducedMotion ? 'reduced-' : ''}${player.color}-${player.direction}-side${side}-${size}`;
  const before = await page.screenshot({ path: `${ARTIFACT_DIR}/${stem}-unselected.png`, fullPage: false });
  const owner = await activatePiece(page, inputMode, player.direction, side, size, target);
  await assertCueContract(page, owner);
  const after = await page.screenshot({ path: `${ARTIFACT_DIR}/${stem}-selected.png`, fullPage: false });
  const delta = lumaDelta(before, after, target);
  expect(delta.lumaChangedRatio, `${stem}: must remain visible in grayscale`).toBeGreaterThan(0.002);
  expect(delta.meanLumaDelta, `${stem}: outline/lift must have visible luminance separation`).toBeGreaterThan(0.12);
  expect(delta.rgbChangedRatio, `${stem}: selected pixels must render differently`).toBeGreaterThan(0.002);
  expect(delta.lumaChangedRatio, `${stem}: treatment must not obscure a large local region`).toBeLessThan(0.55);
  await expectSelectionCount(page, 1, owner);
  return { owner, delta };
}

async function runFullMatrix(browser, kind) {
  const context = await browser.newContext(contextOptions(kind, false));
  const page = await context.newPage();
  const inputMode = kind === 'mobile' ? 'touch' : 'mouse';
  try {
    await startMatrix(page, false);
    const cameraDirections = new Set(); let cases = 0;
    for (const player of PLAYERS) {
      await waitForPlayer(page, player, false, player.index !== 0);
      cameraDirections.add(await page.evaluate(() => document.body.dataset.yakolakTurnCamera || ''));
      for (const side of SIDES) for (const size of SIZES) {
        const result = await capturePair(page, kind, inputMode, player, side, size);
        console.log(`UX45_CASE kind=${kind} owner=${result.owner} luma=${result.delta.lumaChangedRatio.toFixed(4)} mean=${result.delta.meanLumaDelta.toFixed(2)}`);
        cases++;
      }
    }
    expect(cases).toBe(36); expect([...cameraDirections].sort()).toEqual(['back','front','left','right']);
    await clearSelection(page);
  } finally { await context.close(); }
}

async function commitDeterministicMove(page, expectedMove) {
  const before = Number(await page.evaluate(() => document.body.dataset.yakolakMoves || 0));
  await page.evaluate(() => window.yakolakTestPlayOneMove());
  await page.waitForFunction(({ before, expectedMove }) => Number(document.body.dataset.yakolakMoves || 0) > before &&
    Number(document.body.dataset.yakolakMoves || 0) >= expectedMove && document.body.dataset.yakolakSelected === '' &&
    document.body.dataset.yakolakSelectionEmphasisCount === '0', { before, expectedMove }, { timeout: 20000 });
  await page.waitForFunction(() => document.body.dataset.yakolakGameplay === 'ready' && document.body.dataset.yakolakCameraStage === 'ready' &&
    document.body.dataset.yakolakCameraCurrent === 'true', null, { timeout: 20000 });
  return Number(await page.evaluate(() => document.body.dataset.yakolakLastCell || -1));
}

test('UX-SELECT-45 mobile portrait: every one of 36 selectable pieces has paired visual proof', async ({ browser }) => {
  test.skip(!shouldRun('mobile'), `shard ${SHARD}`); await runFullMatrix(browser, 'mobile');
});

test('UX-SELECT-45 desktop: every one of 36 selectable pieces has paired visual proof', async ({ browser }) => {
  test.skip(!shouldRun('desktop'), `shard ${SHARD}`); await runFullMatrix(browser, 'desktop');
});

test('UX-SELECT-45 Reduced Motion keeps the non-color cue across every player color', async ({ browser }) => {
  test.skip(!shouldRun('reduced-lifecycle'), `shard ${SHARD}`);
  for (const kind of ['mobile','desktop']) {
    const context = await browser.newContext(contextOptions(kind, true)); const page = await context.newPage();
    try {
      await startMatrix(page, true);
      for (const player of PLAYERS) {
        await waitForPlayer(page, player, true, player.index !== 0);
        await capturePair(page, kind, kind === 'mobile' ? 'touch' : 'mouse', player, SIDES[player.index % 3], SIZES[player.index % 3], true);
      }
      await clearSelection(page);
    } finally { await context.close(); }
  }
});

test('UX-SELECT-45 occupied-board context and reconnect hydration cannot leave stale selection', async ({ browser }) => {
  test.skip(!shouldRun('reduced-lifecycle'), `shard ${SHARD}`);
  const context = await browser.newContext(contextOptions('mobile', false)); const page = await context.newPage();
  try {
    await startMatrix(page, false);
    const cells = [];
    for (let move = 1; move <= 3; move++) {
      const cell = await commitDeterministicMove(page, move); cells.push(cell);
      expect(cell).toBeGreaterThanOrEqual(0); expect(cell).toBeLessThan(9);
      await page.screenshot({ path: `${ARTIFACT_DIR}/board-location-${move}-cell${cell}-neutral.png`, fullPage: false });
    }
    expect(new Set(cells).size, `deterministic moves should exercise representative board locations: ${cells.join(',')}`).toBeGreaterThanOrEqual(2);
    const direction = await page.evaluate(() => document.body.dataset.yakolakCurrentPlayer || '');
    const player = PLAYERS.find(p => p.direction === direction); expect(player).toBeTruthy();
    const target = await freshPickTarget(page, player.direction, 1, 'medium');
    const before = await page.screenshot({ path: `${ARTIFACT_DIR}/board-occupied-${player.color}-medium-unselected.png`, fullPage: false });
    const owner = await activatePiece(page, 'touch', player.direction, 1, 'medium', target); await assertCueContract(page, owner);
    const after = await page.screenshot({ path: `${ARTIFACT_DIR}/board-occupied-${player.color}-medium-selected.png`, fullPage: false });
    expect(lumaDelta(before, after, target).lumaChangedRatio).toBeGreaterThan(0.002);
    await page.screenshot({ path: `${ARTIFACT_DIR}/reconnect-before-selected.png`, fullPage: false });
    await page.evaluate(() => window.yakolakTestSelect44Lifecycle('reconnect-hydration'));
    await expectSelectionCount(page, 0); await expect(page.locator('body')).toHaveAttribute('data-yakolak-selected', '');
    await page.screenshot({ path: `${ARTIFACT_DIR}/reconnect-after-rehydrated.png`, fullPage: false });
  } finally { await context.close(); }
});
