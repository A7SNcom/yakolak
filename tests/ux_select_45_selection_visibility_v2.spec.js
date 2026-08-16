import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import { mkdirSync } from 'node:fs';

const BASE_URL = (process.env.YAKOLAK_UX_SELECT_45_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const LABEL = process.env.YAKOLAK_UX_SELECT_45_LABEL || 'source';
const ARTIFACT_DIR = `artifacts/ux-select-45-${LABEL}`;
const ARGS = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
  '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage',
];
const PLAYERS = [
  { index: 0, direction: 'right', color: 'marble' },
  { index: 1, direction: 'back', color: 'blue' },
  { index: 2, direction: 'left', color: 'gold' },
  { index: 3, direction: 'front', color: 'green' },
];
const SIDES = [-1, 0, 1];
const SIZES = ['small', 'medium', 'large'];

mkdirSync(ARTIFACT_DIR, { recursive: true });
test.describe.configure({ timeout: 480000 });
test.use({ launchOptions: { args: ARGS } });

function sideName(side) {
  return side < 0 ? 'left' : side > 0 ? 'right' : 'center';
}

function contextOptions(mode, reducedMotion = false) {
  const mobile = mode === 'mobile';
  return {
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
  };
}

function isKnownGodotUidWarning(text) {
  return (text.includes("'res://scenes/intro.tscn'") && text.includes('invalid UID:') && text.includes('using text path instead')) ||
    text.includes('at: open (core/io/resource_format_binary.cpp:1028)');
}

function collectUnexpectedBrowserErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('favicon') || isKnownGodotUidWarning(text)) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

function clipAround(points, viewport, padding) {
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - padding));
  const y0 = Math.max(0, Math.floor(Math.min(...ys) - padding));
  const x1 = Math.min(viewport.width, Math.ceil(Math.max(...xs) + padding));
  const y1 = Math.min(viewport.height, Math.ceil(Math.max(...ys) + padding));
  return { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
}

function visualDelta(beforeBuffer, afterBuffer, clip) {
  const before = PNG.sync.read(beforeBuffer);
  const after = PNG.sync.read(afterBuffer);
  expect(after.width).toBe(before.width);
  expect(after.height).toBe(before.height);

  let changed = 0;
  let highDelta = 0;
  let sampled = 0;
  let sumDelta = 0;
  const deltas = [];
  const xEnd = Math.min(before.width, clip.x + clip.width);
  const yEnd = Math.min(before.height, clip.y + clip.height);
  for (let y = clip.y; y < yEnd; y += 1) {
    for (let x = clip.x; x < xEnd; x += 1) {
      const i = (before.width * y + x) << 2;
      const delta = Math.max(
        Math.abs(before.data[i] - after.data[i]),
        Math.abs(before.data[i + 1] - after.data[i + 1]),
        Math.abs(before.data[i + 2] - after.data[i + 2]),
      );
      sampled += 1;
      sumDelta += delta;
      deltas.push(delta);
      if (delta >= 14) changed += 1;
      if (delta >= 40) highDelta += 1;
    }
  }
  deltas.sort((a, b) => a - b);
  return {
    changedRatio: sampled ? changed / sampled : 0,
    highDeltaRatio: sampled ? highDelta / sampled : 0,
    meanDelta: sampled ? sumDelta / sampled : 0,
    p95: deltas.length ? deltas[Math.floor((deltas.length - 1) * 0.95)] : 0,
  };
}

async function startMatrix(page) {
  await page.goto(`${BASE_URL}/?yakolakTestFast=1&uxSelect45=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
      document.body.dataset.yakolakSetup === 'visible' &&
      typeof window.yakolakTestSelect44StartMatrix === 'function' &&
      typeof window.yakolakTestSelect44SetPlayer === 'function' &&
      typeof window.yakolakTestSelect44Lifecycle === 'function' &&
      typeof window.yakolakTestSelect44RefreshPickTarget === 'function',
    null,
    { timeout: 60000 },
  );
  await page.evaluate(() => window.yakolakTestSelect44StartMatrix());
  await waitPlayer(page, PLAYERS[0]);
  await expectNeutralSelection(page, 'matrix-start');
}

async function waitPlayer(page, player, reducedMotion = false) {
  await page.evaluate(index => window.yakolakTestSelect44SetPlayer(index), player.index);
  await page.waitForFunction(
    ({ direction }) => {
      const d = document.body.dataset;
      return d.yakolakGameplay === 'ready' && d.yakolakCurrentPlayer === direction &&
        d.yakolakCameraStage === 'ready' && d.yakolakCameraCurrent === 'true';
    },
    player,
    { timeout: 20000 },
  );
  await page.waitForFunction(
    ({ direction, reducedMotion }) => {
      const d = document.body.dataset;
      const settled = ['final', 'stable', 'immediate'].includes(d.yakolakTurnLightState || '');
      return d.yakolakTurnLightOwner === 'single-authoritative-controller' &&
        d.yakolakTurnLightDirection === direction && d.yakolakTurnLightFinalCount === '1' && settled &&
        (!reducedMotion || (d.yakolakTurnLightReducedMotion === 'true' && d.yakolakTurnLightState === 'immediate'));
    },
    { direction: player.direction, reducedMotion },
    { timeout: 15000 },
  );
  const cameraDirection = await page.evaluate(() => document.body.dataset.yakolakTurnCamera || '');
  expect(cameraDirection, 'camera follows the active player angle').toBe(player.direction);
}

async function freshPickTarget(page, player, side, size) {
  const before = await page.evaluate(() => Number(document.body.dataset.yakolakSelect44TargetRevision || 0));
  await page.evaluate(({ side, size }) => window.yakolakTestSelect44RefreshPickTarget(side, size), { side, size });
  await page.waitForFunction(
    ({ previous, direction, side, size }) => {
      const d = document.body.dataset;
      return Number(d.yakolakSelect44TargetRevision || 0) > previous &&
        d.yakolakSelect44TargetDirection === direction && Number(d.yakolakSelect44TargetSide) === side &&
        d.yakolakSelect44TargetSize === size;
    },
    { previous: before, direction: player.direction, side, size },
    { timeout: 10000 },
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

async function activatePiece(page, mode, player, side, size) {
  const target = await freshPickTarget(page, player, side, size);
  if (mode === 'mobile') await page.touchscreen.tap(target.x, target.y);
  else await page.mouse.click(target.x, target.y);
  const owner = `Stone_${player.direction}_${side}_${size}`;
  await page.waitForFunction(
    ({ owner, size }) => {
      const d = document.body.dataset;
      return d.yakolakSelected === owner && d.yakolakSelectedSize === size && d.yakolakTray === 'open' &&
        d.yakolakSelectionEmphasisCount === '1' && d.yakolakSelectionEmphasisOwner === owner;
    },
    { owner, size },
    { timeout: 7000 },
  );
  await page.waitForTimeout(360);
  return { owner, selectedTarget: await freshPickTarget(page, player, side, size) };
}

async function assertSelectionCue(page, owner, reducedMotion = false) {
  const state = await page.evaluate(() => {
    const d = document.body.dataset;
    return {
      count: Number(d.yakolakSelectionEmphasisCount || -1),
      owner: d.yakolakSelectionEmphasisOwner || '',
      selected: d.yakolakSelected || '',
      style: d.yakolakSelectionStyle || '',
      outline: d.yakolakSelectionOutline || '',
      grow: Number(d.yakolakSelectionOutlineGrow || 0),
      emission: Number(d.yakolakSelectionEmissionEnergy || 0),
      lightCount: Number(d.yakolakTurnLightFinalCount || -1),
      lightReduced: d.yakolakTurnLightReducedMotion || '',
    };
  });
  expect(state.count, 'only one object may look selected').toBe(1);
  expect(state.owner, 'selected treatment belongs only to chosen piece').toBe(owner);
  expect(state.selected).toBe(owner);
  expect(state.style, 'selection cannot be color-only').toContain('outline');
  expect(['dark', 'light'], 'outline must choose a contrasting polarity').toContain(state.outline);
  expect(state.grow, 'outline must be geometric and visible').toBeGreaterThanOrEqual(0.8);
  expect(state.emission, 'selected treatment must stay restrained').toBeLessThanOrEqual(0.25);
  expect(state.lightCount, 'active-turn lighting keeps one active seat').toBe(1);
  if (reducedMotion) expect(state.lightReduced).toBe('true');
}

async function expectNeutralSelection(page, reason) {
  await page.waitForFunction(
    () => {
      const d = document.body.dataset;
      return d.yakolakSelectionEmphasisCount === '0' && d.yakolakSelectionEmphasisOwner === '' &&
        (d.yakolakSelected || '') === '';
    },
    null,
    { timeout: 7000 },
  );
  const count = await page.evaluate(() => Number(document.body.dataset.yakolakSelectionEmphasisCount || -1));
  expect(count, `${reason}: neighbors and board remain neutral`).toBe(0);
}

async function clearSelection(page) {
  await page.evaluate(() => window.yakolakTestSelect44Lifecycle('cancel'));
  await page.waitForFunction(
    () => document.body.dataset.yakolakTray === 'closed' && document.body.dataset.yakolakGameplay === 'ready',
    null,
    { timeout: 7000 },
  );
  await expectNeutralSelection(page, 'clear');
}

async function captureCase(page, mode, player, side, size, reducedMotion = false) {
  await clearSelection(page);
  const stem = `${reducedMotion ? 'reduced-' : ''}${mode}-${player.color}-${sideName(side)}-${size}`;
  const beforeTarget = await freshPickTarget(page, player, side, size);
  const before = await page.screenshot({ path: `${ARTIFACT_DIR}/${stem}-unselected.png`, fullPage: false });
  const selected = await activatePiece(page, mode, player, side, size);
  await assertSelectionCue(page, selected.owner, reducedMotion);
  const after = await page.screenshot({ path: `${ARTIFACT_DIR}/${stem}-selected.png`, fullPage: false });
  const viewport = page.viewportSize();
  const delta = visualDelta(before, after, clipAround([beforeTarget, selected.selectedTarget], viewport, mode === 'mobile' ? 44 : 60));
  expect(delta.changedRatio, `${stem}: selected state must be visibly distinct`).toBeGreaterThan(0.008);
  expect(delta.highDeltaRatio, `${stem}: outline must retain strong local contrast`).toBeGreaterThan(0.001);
  expect(delta.p95, `${stem}: outline cannot disappear into background`).toBeGreaterThanOrEqual(12);
  expect(delta.changedRatio, `${stem}: treatment cannot obscure most of the piece area`).toBeLessThan(0.72);
  console.log(`UX_SELECT_45_VISUAL case=${stem} owner=${selected.owner} changed=${delta.changedRatio.toFixed(4)} high=${delta.highDeltaRatio.toFixed(4)} p95=${delta.p95.toFixed(1)} mean=${delta.meanDelta.toFixed(1)}`);
  await clearSelection(page);
}

async function runPlayerMatrix(browser, mode, player) {
  const context = await browser.newContext(contextOptions(mode));
  const page = await context.newPage();
  const errors = collectUnexpectedBrowserErrors(page);
  try {
    await startMatrix(page);
    await waitPlayer(page, player);
    for (const side of SIDES) {
      for (const size of SIZES) await captureCase(page, mode, player, side, size);
    }
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
}

for (const mode of ['desktop', 'mobile']) {
  for (const player of PLAYERS) {
    test(`UX-SELECT-45 ${mode} ${player.color} covers all 9 selectable pieces`, async ({ browser }) => {
      await runPlayerMatrix(browser, mode, player);
    });
  }
}

async function freshBoardTarget(page, direction) {
  await page.waitForFunction(() => typeof window.yakolakTestRefreshAuthorityPickTarget === 'function', null, { timeout: 10000 });
  await page.evaluate(() => window.yakolakTestRefreshAuthorityPickTarget());
  await page.waitForFunction(
    expected => document.body.dataset.yakolakTestAuthorityTargetDirection === expected &&
      Number(document.body.dataset.yakolakTestAuthorityCellX || 0) > 0 && Number(document.body.dataset.yakolakTestAuthorityCellY || 0) > 0,
    direction,
    { timeout: 7000 },
  );
  return page.evaluate(() => ({
    x: Number(document.body.dataset.yakolakTestAuthorityCellX || 0),
    y: Number(document.body.dataset.yakolakTestAuthorityCellY || 0),
  }));
}

async function commitLargeMove(page, player, moveNumber) {
  await waitPlayer(page, player);
  await activatePiece(page, 'mobile', player, 0, 'large');
  const target = await freshBoardTarget(page, player.direction);
  await page.touchscreen.tap(target.x, target.y);
  await page.waitForFunction(
    expectedMoves => Number(document.body.dataset.yakolakMoves || 0) >= expectedMoves &&
      document.body.dataset.yakolakSelected === '' && document.body.dataset.yakolakSelectionEmphasisCount === '0',
    moveNumber,
    { timeout: 15000 },
  );
  const cell = await page.evaluate(() => Number(document.body.dataset.yakolakLastCell || -1));
  expect(cell).toBeGreaterThanOrEqual(0);
  expect(cell).toBeLessThan(9);
  await page.screenshot({ path: `${ARTIFACT_DIR}/board-location-${moveNumber}-cell${cell}-neutral.png`, fullPage: false });
  await expectNeutralSelection(page, `board-location-${cell}`);
  return cell;
}

test('UX-SELECT-45 representative board locations remain neutral after committed selections', async ({ browser }) => {
  const context = await browser.newContext(contextOptions('mobile'));
  const page = await context.newPage();
  const errors = collectUnexpectedBrowserErrors(page);
  try {
    await startMatrix(page);
    const cells = [];
    for (let i = 0; i < 3; i += 1) cells.push(await commitLargeMove(page, PLAYERS[i], i + 1));
    expect(new Set(cells).size, 'three large pieces must land in distinct representative board cells').toBe(3);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('UX-SELECT-45 Reduced Motion keeps the same non-color cue for every player color', async ({ browser }) => {
  const context = await browser.newContext(contextOptions('mobile', true));
  const page = await context.newPage();
  const errors = collectUnexpectedBrowserErrors(page);
  try {
    await startMatrix(page);
    for (const player of PLAYERS) {
      await waitPlayer(page, player, true);
      await captureCase(page, 'mobile', player, 0, 'medium', true);
    }
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('UX-SELECT-45 authority change and reconnect hydration clear stale selection immediately', async ({ browser }) => {
  const context = await browser.newContext(contextOptions('mobile'));
  const page = await context.newPage();
  const errors = collectUnexpectedBrowserErrors(page);
  try {
    await startMatrix(page);
    await waitPlayer(page, PLAYERS[0]);
    await activatePiece(page, 'mobile', PLAYERS[0], 0, 'large');
    await page.screenshot({ path: `${ARTIFACT_DIR}/reconnect-before-selected.png`, fullPage: false });
    await page.evaluate(() => window.yakolakTestSelect44Lifecycle('turn-change'));
    await expectNeutralSelection(page, 'authority-turn-change');

    await waitPlayer(page, PLAYERS[0]);
    await activatePiece(page, 'mobile', PLAYERS[0], 0, 'large');
    await page.evaluate(() => window.yakolakTestSelect44Lifecycle('reconnect-hydration'));
    await expectNeutralSelection(page, 'reconnect-hydration');
    await page.screenshot({ path: `${ARTIFACT_DIR}/reconnect-after-hydration.png`, fullPage: false });

    const state = await page.evaluate(() => ({
      selected: document.body.dataset.yakolakSelected || '',
      selectedSize: document.body.dataset.yakolakSelectedSize || '',
      count: document.body.dataset.yakolakSelectionEmphasisCount || '',
      owner: document.body.dataset.yakolakSelectionEmphasisOwner || '',
      reason: document.body.dataset.yakolakSelectionEmphasisReason || '',
    }));
    expect(state.selected).toBe('');
    expect(state.selectedSize).toBe('');
    expect(state.count).toBe('0');
    expect(state.owner).toBe('');
    expect(state.reason).toContain('reconnect-hydration');
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
