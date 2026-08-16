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
test.use({
  launchOptions: {
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--disable-dev-shm-usage',
    ],
  },
});

function shouldRun(name) {
  return SHARD === 'all' || SHARD === name;
}

function contextOptions(kind, reducedMotion = false) {
  if (kind === 'mobile') {
    return {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      hasTouch: true,
      isMobile: true,
      reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
    };
  }
  return {
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
  };
}

async function startMatrix(page, reducedMotion = false) {
  await page.goto(`${BASE_URL}/?yakolakTestFast=1&uxSelect45=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakSetup === 'visible' &&
          typeof window.yakolakTestSelect44StartMatrix === 'function' &&
          typeof window.yakolakTestSelect44SetPlayer === 'function' &&
          typeof window.yakolakTestSelect44Lifecycle === 'function' &&
          typeof window.yakolakTestSelect44RefreshPickTarget === 'function' &&
          typeof window.yakolakTestRefreshAuthorityPickTarget === 'function',
    null,
    { timeout: 60000 },
  );
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(reducedMotion);
  await page.evaluate(() => window.yakolakTestSelect44StartMatrix());
  await waitForPlayer(page, PLAYERS[0], reducedMotion, false);
  await expectSelectionCount(page, 0);
}

async function waitForPlayer(page, player, reducedMotion, force = true) {
  if (force) {
    await page.evaluate(index => window.yakolakTestSelect44SetPlayer(index), player.index);
  }
  await page.waitForFunction(
    ({ direction, reduced, states }) => {
      const d = document.body.dataset;
      return d.yakolakGameplay === 'ready' &&
             d.yakolakCurrentPlayer === direction &&
             d.yakolakCameraStage === 'ready' &&
             d.yakolakCameraCurrent === 'true' &&
             d.yakolakBoardVisible === 'true' &&
             d.yakolakCameraFocusInside === 'true' &&
             Number(d.yakolakCameraFacing || 0) > 0.995 &&
             d.yakolakTurnCamera === direction &&
             d.yakolakTurnLightDirection === direction &&
             d.yakolakTurnLightFinalCount === '1' &&
             d.yakolakTurnLightReducedMotion === (reduced ? 'true' : 'false') &&
             states.includes(d.yakolakTurnLightState || '');
    },
    { direction: player.direction, reduced: reducedMotion, states: FINAL_LIGHT_STATES },
    { timeout: 20000 },
  );

  const lighting = await page.evaluate(() => ({
    owner: document.body.dataset.yakolakTurnLightOwner || '',
    source: document.body.dataset.yakolakTurnLightSource || '',
    scope: document.body.dataset.yakolakTurnLightScope || '',
    direction: document.body.dataset.yakolakTurnLightDirection || '',
    finalCount: document.body.dataset.yakolakTurnLightFinalCount || '',
    state: document.body.dataset.yakolakTurnLightState || '',
  }));
  expect(lighting.owner).toBe('single-authoritative-controller');
  expect(lighting.source).toBe('authoritative-turn-signal');
  expect(lighting.scope).toBe('localized-seat-spots');
  expect(lighting.direction).toBe(player.direction);
  expect(lighting.finalCount).toBe('1');
  if (reducedMotion) expect(lighting.state).toBe('immediate');
}

async function freshPickTarget(page, direction, side, size) {
  const before = await page.evaluate(() => Number(document.body.dataset.yakolakSelect44TargetRevision || 0));
  await page.evaluate(({ side, size }) => window.yakolakTestSelect44RefreshPickTarget(side, size), { side, size });
  await page.waitForFunction(
    ({ previous, direction, side, size }) => {
      const d = document.body.dataset;
      return Number(d.yakolakSelect44TargetRevision || 0) > previous &&
             d.yakolakSelect44TargetDirection === direction &&
             Number(d.yakolakSelect44TargetSide) === side &&
             d.yakolakSelect44TargetSize === size &&
             Number(d.yakolakSelect44TargetX || 0) > 0 &&
             Number(d.yakolakSelect44TargetY || 0) > 0;
    },
    { previous: before, direction, side, size },
    { timeout: 15000 },
  );
  const target = await page.evaluate(() => ({
    x: Number(document.body.dataset.yakolakSelect44TargetX || 0),
    y: Number(document.body.dataset.yakolakSelect44TargetY || 0),
  }));
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(target.x).toBeGreaterThan(0);
  expect(target.y).toBeGreaterThan(0);
  expect(target.x).toBeLessThan(viewport.width);
  expect(target.y).toBeLessThan(viewport.height);
  return target;
}

async function activatePiece(page, inputMode, direction, side, size) {
  const target = await freshPickTarget(page, direction, side, size);
  if (inputMode === 'touch') await page.touchscreen.tap(target.x, target.y);
  else await page.mouse.click(target.x, target.y);

  const owner = `Stone_${direction}_${side}_${size}`;
  await page.waitForFunction(
    ({ owner, size }) => {
      const d = document.body.dataset;
      return d.yakolakSelected === owner &&
             d.yakolakSelectedSize === size &&
             d.yakolakTray === 'open' &&
             d.yakolakSelectionEmphasisCount === '1' &&
             d.yakolakSelectionEmphasisOwner === owner;
    },
    { owner, size },
    { timeout: 7000 },
  );
  await page.waitForTimeout(360);
  return { owner, target };
}

async function expectSelectionCount(page, count, owner = '') {
  await page.waitForFunction(
    ({ count, owner }) => document.body.dataset.yakolakSelectionEmphasisCount === String(count) &&
                          document.body.dataset.yakolakSelectionEmphasisOwner === owner,
    { count, owner },
    { timeout: 7000 },
  );
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

  expect(state.count).toBe(1);
  expect(state.owner).toBe(owner);
  expect(state.style).toContain('outline');
  expect(['dark', 'light']).toContain(state.outline);
  expect(state.grow).toBeGreaterThan(0.20);
  expect(state.grow).toBeLessThanOrEqual(1.08);
  expect(state.emission).toBeGreaterThan(0);
  expect(state.emission).toBeLessThanOrEqual(0.20);
}

async function clearSelection(page) {
  await page.evaluate(() => window.yakolakTestSelect44Lifecycle('cancel'));
  await page.waitForFunction(
    () => {
      const d = document.body.dataset;
      return d.yakolakTray === 'closed' &&
             d.yakolakSelected === '' &&
             d.yakolakSelectionEmphasisCount === '0' &&
             d.yakolakSelectionEmphasisOwner === '';
    },
    null,
    { timeout: 7000 },
  );
}

function localLumaDelta(beforeBuffer, afterBuffer, target, radius = 92) {
  const before = PNG.sync.read(beforeBuffer);
  const after = PNG.sync.read(afterBuffer);
  expect(after.width).toBe(before.width);
  expect(after.height).toBe(before.height);

  const x0 = Math.max(0, Math.floor(target.x - radius));
  const y0 = Math.max(0, Math.floor(target.y - radius));
  const x1 = Math.min(before.width, Math.ceil(target.x + radius));
  const y1 = Math.min(before.height, Math.ceil(target.y + radius));

  let pixels = 0;
  let lumaChanged = 0;
  let totalLumaDelta = 0;
  let rgbChanged = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (before.width * y + x) << 2;
      const br = before.data[i], bg = before.data[i + 1], bb = before.data[i + 2];
      const ar = after.data[i], ag = after.data[i + 1], ab = after.data[i + 2];
      const beforeLuma = 0.2126 * br + 0.7152 * bg + 0.0722 * bb;
      const afterLuma = 0.2126 * ar + 0.7152 * ag + 0.0722 * ab;
      const lumaDelta = Math.abs(afterLuma - beforeLuma);
      const rgbDelta = (Math.abs(ar - br) + Math.abs(ag - bg) + Math.abs(ab - bb)) / 3;
      pixels += 1;
      totalLumaDelta += lumaDelta;
      if (lumaDelta >= 12) lumaChanged += 1;
      if (rgbDelta >= 12) rgbChanged += 1;
    }
  }

  return {
    lumaChangedRatio: pixels ? lumaChanged / pixels : 0,
    rgbChangedRatio: pixels ? rgbChanged / pixels : 0,
    meanLumaDelta: pixels ? totalLumaDelta / pixels : 0,
  };
}

async function capturePair(page, kind, inputMode, player, side, size, reducedMotion = false) {
  await clearSelection(page);
  const target = await freshPickTarget(page, player.direction, side, size);
  const stem = `${kind}-${reducedMotion ? 'reduced-' : ''}${player.color}-${player.direction}-side${side}-${size}`;
  const unselectedPath = `${ARTIFACT_DIR}/${stem}-unselected.png`;
  const selectedPath = `${ARTIFACT_DIR}/${stem}-selected.png`;

  const unselected = await page.screenshot({ path: unselectedPath, fullPage: false });
  const activated = await activatePiece(page, inputMode, player.direction, side, size);
  expect(Math.abs(activated.target.x - target.x)).toBeLessThan(8);
  expect(Math.abs(activated.target.y - target.y)).toBeLessThan(8);
  await assertCueContract(page, activated.owner);
  const selected = await page.screenshot({ path: selectedPath, fullPage: false });

  const delta = localLumaDelta(unselected, selected, target);
  expect(delta.lumaChangedRatio, `${stem}: non-color rendered distinction`).toBeGreaterThan(0.002);
  expect(delta.meanLumaDelta, `${stem}: visible luminance distinction`).toBeGreaterThan(0.12);
  expect(delta.lumaChangedRatio, `${stem}: treatment remains local`).toBeLessThan(0.55);
  expect(delta.rgbChangedRatio, `${stem}: selected pixels actually change`).toBeGreaterThan(0.002);

  await expectSelectionCount(page, 1, activated.owner);
  return { owner: activated.owner, delta };
}

async function runFullMatrix(browser, kind) {
  const context = await browser.newContext(contextOptions(kind, false));
  const page = await context.newPage();
  const inputMode = kind === 'mobile' ? 'touch' : 'mouse';
  try {
    await startMatrix(page, false);
    const cameraDirections = new Set();
    let cases = 0;
    for (const player of PLAYERS) {
      await waitForPlayer(page, player, false, player.index !== 0);
      cameraDirections.add(await page.evaluate(() => document.body.dataset.yakolakTurnCamera || ''));
      for (const side of SIDES) {
        for (const size of SIZES) {
          const result = await capturePair(page, kind, inputMode, player, side, size, false);
          console.log(`UX45_CASE kind=${kind} owner=${result.owner} luma=${result.delta.lumaChangedRatio.toFixed(4)} mean=${result.delta.meanLumaDelta.toFixed(2)}`);
          cases += 1;
        }
      }
    }
    expect(cases).toBe(36);
    expect([...cameraDirections].sort()).toEqual(['back', 'front', 'left', 'right']);
    await clearSelection(page);
  } finally {
    await context.close();
  }
}

async function freshBoardTarget(page, direction) {
  await page.evaluate(() => window.yakolakTestRefreshAuthorityPickTarget());
  await page.waitForFunction(
    expected => document.body.dataset.yakolakTestAuthorityTargetDirection === expected &&
                Number(document.body.dataset.yakolakTestAuthorityCellX || 0) > 0 &&
                Number(document.body.dataset.yakolakTestAuthorityCellY || 0) > 0,
    direction,
    { timeout: 7000 },
  );
  return page.evaluate(() => ({
    x: Number(document.body.dataset.yakolakTestAuthorityCellX || 0),
    y: Number(document.body.dataset.yakolakTestAuthorityCellY || 0),
  }));
}

async function commitLargeMove(page, player, moveNumber) {
  await waitForPlayer(page, player, false, false);
  await activatePiece(page, 'touch', player.direction, 0, 'large');
  const target = await freshBoardTarget(page, player.direction);
  await page.touchscreen.tap(target.x, target.y);
  await page.waitForFunction(
    expectedMoves => Number(document.body.dataset.yakolakMoves || 0) >= expectedMoves &&
                     document.body.dataset.yakolakSelected === '' &&
                     document.body.dataset.yakolakSelectionEmphasisCount === '0',
    moveNumber,
    { timeout: 15000 },
  );
  const cell = await page.evaluate(() => Number(document.body.dataset.yakolakLastCell || -1));
  expect(cell).toBeGreaterThanOrEqual(0);
  expect(cell).toBeLessThan(9);
  await page.screenshot({ path: `${ARTIFACT_DIR}/board-location-${moveNumber}-cell${cell}-neutral.png`, fullPage: false });
  return cell;
}

test('UX-SELECT-45 mobile portrait selects every one of 36 pieces with paired visual proof', async ({ browser }) => {
  test.skip(!shouldRun('mobile'), `shard ${SHARD}`);
  await runFullMatrix(browser, 'mobile');
});

test('UX-SELECT-45 desktop selects every one of 36 pieces with paired visual proof', async ({ browser }) => {
  test.skip(!shouldRun('desktop'), `shard ${SHARD}`);
  await runFullMatrix(browser, 'desktop');
});

test('UX-SELECT-45 Reduced Motion preserves the same non-color selection cue across all player colors', async ({ browser }) => {
  test.skip(!shouldRun('reduced-lifecycle'), `shard ${SHARD}`);
  for (const kind of ['mobile', 'desktop']) {
    const context = await browser.newContext(contextOptions(kind, true));
    const page = await context.newPage();
    const inputMode = kind === 'mobile' ? 'touch' : 'mouse';
    try {
      await startMatrix(page, true);
      for (const player of PLAYERS) {
        await waitForPlayer(page, player, true, player.index !== 0);
        const side = SIDES[player.index % SIDES.length];
        const size = SIZES[player.index % SIZES.length];
        await capturePair(page, kind, inputMode, player, side, size, true);
      }
      await clearSelection(page);
    } finally {
      await context.close();
    }
  }
});

test('UX-SELECT-45 representative board occupancy and reconnect hydration cannot leave stale selection', async ({ browser }) => {
  test.skip(!shouldRun('reduced-lifecycle'), `shard ${SHARD}`);
  const context = await browser.newContext(contextOptions('mobile', false));
  const page = await context.newPage();
  try {
    await startMatrix(page, false);

    const cells = [];
    for (let i = 0; i < 3; i += 1) {
      cells.push(await commitLargeMove(page, PLAYERS[i], i + 1));
    }
    expect(new Set(cells).size).toBe(3);

    await waitForPlayer(page, PLAYERS[3], false, false);
    await clearSelection(page);
    const target = await freshPickTarget(page, PLAYERS[3].direction, 1, 'medium');
    const before = await page.screenshot({ path: `${ARTIFACT_DIR}/board-occupied-green-medium-unselected.png`, fullPage: false });
    const activated = await activatePiece(page, 'touch', PLAYERS[3].direction, 1, 'medium');
    await assertCueContract(page, activated.owner);
    const selected = await page.screenshot({ path: `${ARTIFACT_DIR}/board-occupied-green-medium-selected.png`, fullPage: false });
    const delta = localLumaDelta(before, selected, target);
    expect(delta.lumaChangedRatio).toBeGreaterThan(0.002);

    await page.screenshot({ path: `${ARTIFACT_DIR}/reconnect-before-selected.png`, fullPage: false });
    await page.evaluate(() => window.yakolakTestSelect44Lifecycle('reconnect-hydration'));
    await expectSelectionCount(page, 0);
    await expect(page.locator('body')).toHaveAttribute('data-yakolak-selected', '');
    await expect(page.locator('body')).toHaveAttribute('data-yakolak-selected-size', '');
    await page.screenshot({ path: `${ARTIFACT_DIR}/reconnect-after-rehydrated.png`, fullPage: false });
  } finally {
    await context.close();
  }
});
