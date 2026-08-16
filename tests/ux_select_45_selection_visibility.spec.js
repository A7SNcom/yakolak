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
test.describe.configure({ timeout: 720000 });
test.use({ launchOptions: { args: ARGS } });

function sideName(side) {
  return side < 0 ? 'left' : side > 0 ? 'right' : 'center';
}

function clipAround(points, viewport, padding = 56) {
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
      const dr = Math.abs(before.data[i] - after.data[i]);
      const dg = Math.abs(before.data[i + 1] - after.data[i + 1]);
      const db = Math.abs(before.data[i + 2] - after.data[i + 2]);
      const delta = Math.max(dr, dg, db);
      sampled += 1;
      sumDelta += delta;
      deltas.push(delta);
      if (delta >= 14) changed += 1;
      if (delta >= 40) highDelta += 1;
    }
  }
  deltas.sort((a, b) => a - b);
  const p95 = deltas.length ? deltas[Math.floor((deltas.length - 1) * 0.95)] : 0;
  return {
    changedRatio: sampled ? changed / sampled : 0,
    highDeltaRatio: sampled ? highDelta / sampled : 0,
    meanDelta: sampled ? sumDelta / sampled : 0,
    p95,
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
    { timeout: 60000 }
  );
  await page.evaluate(() => window.yakolakTestSelect44StartMatrix());
  await waitPlayer(page, PLAYERS[0]);
  await expectNeutralSelection(page, 'matrix-start');
}

async function waitPlayer(page, player) {
  await page.evaluate(index => window.yakolakTestSelect44SetPlayer(index), player.index);
  await page.waitForFunction(
    ({ direction }) => {
      const d = document.body.dataset;
      return d.yakolakGameplay === 'ready' &&
             d.yakolakCurrentPlayer === direction &&
             d.yakolakCameraStage === 'ready' &&
             d.yakolakCameraCurrent === 'true';
    },
    player,
    { timeout: 20000 }
  );

  // LIGHTING-11/12 is part of the real selection background. Require the live,
  // authoritative seat emphasis to settle before taking deterministic frames.
  await page.waitForFunction(
    ({ direction }) => {
      const d = document.body.dataset;
      return d.yakolakTurnLightOwner === 'single-authoritative-controller' &&
             d.yakolakTurnLightDirection === direction &&
             d.yakolakTurnLightFinalCount === '1' &&
             ['final', 'stable', 'immediate'].includes(d.yakolakTurnLightState || '');
    },
    player,
    { timeout: 15000 }
  );
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
             d.yakolakSelect44TargetSize === size;
    },
    { previous: before, direction, side, size },
    { timeout: 10000 }
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

async function activatePiece(page, inputMode, player, side, size) {
  const target = await freshPickTarget(page, player.direction, side, size);
  if (inputMode === 'touch') await page.touchscreen.tap(target.x, target.y);
  else await page.mouse.click(target.x, target.y);

  const owner = `Stone_${player.direction}_${side}_${size}`;
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
    { timeout: 7000 }
  );
  // Let the existing tray motion settle; selected treatment itself is static.
  await page.waitForTimeout(360);
  const selectedTarget = await freshPickTarget(page, player.direction, side, size);
  return { owner, beforeTarget: target, selectedTarget };
}

async function assertSelectionCue(page, owner, reducedMotion) {
  const state = await page.evaluate(() => {
    const d = document.body.dataset;
    return {
      count: Number(d.yakolakSelectionEmphasisCount || -1),
      owner: d.yakolakSelectionEmphasisOwner || '',
      style: d.yakolakSelectionStyle || '',
      outline: d.yakolakSelectionOutline || '',
      grow: Number(d.yakolakSelectionOutlineGrow || 0),
      emission: Number(d.yakolakSelectionEmissionEnergy || 0),
      lightDirection: d.yakolakTurnLightDirection || '',
      lightCount: Number(d.yakolakTurnLightFinalCount || -1),
      lightReduced: d.yakolakTurnLightReducedMotion || '',
      selected: d.yakolakSelected || '',
    };
  });

  expect(state.count, 'exactly one rendered selected material').toBe(1);
  expect(state.owner, 'selected treatment belongs only to chosen stone').toBe(owner);
  expect(state.selected).toBe(owner);
  expect(state.style, 'selection must not be color-only').toContain('outline');
  expect(['dark', 'light'], 'outline must have explicit contrast polarity').toContain(state.outline);
  expect(state.grow, 'outline must be geometric, not only color').toBeGreaterThanOrEqual(0.8);
  expect(state.emission, 'surface treatment must stay restrained').toBeLessThanOrEqual(0.25);
  expect(state.lightCount, 'neighbors/background keep one active-turn light').toBe(1);
  if (reducedMotion) expect(state.lightReduced).toBe('true');
}

async function expectNeutralSelection(page, reason) {
  await page.waitForFunction(
    () => {
      const d = document.body.dataset;
      return d.yakolakSelectionEmphasisCount === '0' &&
             d.yakolakSelectionEmphasisOwner === '' &&
             (d.yakolakSelected || '') === '';
    },
    null,
    { timeout: 7000 }
  );
  const count = await page.evaluate(() => Number(document.body.dataset.yakolakSelectionEmphasisCount || -1));
  expect(count, `${reason}: no stale selected treatment`).toBe(0);
}

async function clearSelection(page) {
  await page.evaluate(() => window.yakolakTestSelect44Lifecycle('cancel'));
  await page.waitForFunction(
    () => document.body.dataset.yakolakTray === 'closed' && document.body.dataset.yakolakGameplay === 'ready',
    null,
    { timeout: 7000 }
  );
  await expectNeutralSelection(page, 'clear');
}

async function runCase(page, mode, inputMode, player, side, size, reducedMotion = false) {
  await clearSelection(page);
  const basename = `${mode}-${player.color}-${sideName(side)}-${size}`;
  const beforeTarget = await freshPickTarget(page, player.direction, side, size);
  const before = await page.screenshot({ path: `${ARTIFACT_DIR}/${basename}-unselected.png`, fullPage: false });

  const selected = await activatePiece(page, inputMode, player, side, size);
  await assertSelectionCue(page, selected.owner, reducedMotion);
  const after = await page.screenshot({ path: `${ARTIFACT_DIR}/${basename}-selected.png`, fullPage: false });

  const viewport = page.viewportSize();
  const clip = clipAround([beforeTarget, selected.selectedTarget], viewport, mode === 'mobile' ? 44 : 60);
  const delta = visualDelta(before, after, clip);
  // This is deliberately loose enough for software WebGL but strict enough to
  // reject a metadata-only selection state or an outline that never reaches the frame.
  expect(delta.changedRatio, `${basename}: visible selected/unselected difference`).toBeGreaterThan(0.008);
  expect(delta.highDeltaRatio, `${basename}: cue must contain locally strong contrast`).toBeGreaterThan(0.001);
  expect(delta.p95, `${basename}: outline must survive the rendered background`).toBeGreaterThanOrEqual(12);
  // The selection should remain a contour/emphasis, not repaint most of the local scene.
  expect(delta.changedRatio, `${basename}: treatment must not obscure the piece`).toBeLessThan(0.72);

  console.log(`UX_SELECT_45_VISUAL case=${basename} owner=${selected.owner} changed=${delta.changedRatio.toFixed(4)} high=${delta.highDeltaRatio.toFixed(4)} p95=${delta.p95.toFixed(1)} mean=${delta.meanDelta.toFixed(1)}`);
  await clearSelection(page);
}

async function runFullMatrix(browser, mode) {
  const mobile = mode === 'mobile';
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('favicon')) errors.push(`console: ${message.text()}`);
  });

  try {
    await startMatrix(page);
    for (const player of PLAYERS) {
      await waitPlayer(page, player);
      for (const side of SIDES) {
        for (const size of SIZES) {
          await runCase(page, mode, mobile ? 'touch' : 'mouse', player, side, size, false);
        }
      }
    }
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
}

test('UX-SELECT-45 desktop selection visibility matrix covers all 36 selectable stones', async ({ browser }) => {
  await runFullMatrix(browser, 'desktop');
});

test('UX-SELECT-45 mobile portrait selection visibility matrix covers all 36 selectable stones', async ({ browser }) => {
  await runFullMatrix(browser, 'mobile');
});

test('UX-SELECT-45 Reduced Motion and authority cleanup cannot leave stale selection', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  try {
    await startMatrix(page);
    for (const player of PLAYERS) {
      await waitPlayer(page, player);
      const light = await page.evaluate(() => ({
        reduced: document.body.dataset.yakolakTurnLightReducedMotion || '',
        state: document.body.dataset.yakolakTurnLightState || '',
      }));
      expect(light.reduced).toBe('true');
      expect(light.state).toBe('immediate');
      await runCase(page, 'reduced-mobile', 'touch', player, 0, 'medium', true);
    }

    await waitPlayer(page, PLAYERS[0]);
    await activatePiece(page, 'touch', PLAYERS[0], 0, 'large');
    await page.screenshot({ path: `${ARTIFACT_DIR}/reconnect-before-selected.png`, fullPage: false });

    // Authority revision/turn change must synchronously drop stale presentation.
    await page.evaluate(() => window.yakolakTestSelect44Lifecycle('turn-change'));
    await expectNeutralSelection(page, 'authority-turn-change');

    await waitPlayer(page, PLAYERS[0]);
    await activatePiece(page, 'touch', PLAYERS[0], 0, 'large');
    await page.evaluate(() => window.yakolakTestSelect44Lifecycle('reconnect-hydration'));
    await expectNeutralSelection(page, 'reconnect-hydration');
    const hydrated = await page.screenshot({ path: `${ARTIFACT_DIR}/reconnect-after-hydration.png`, fullPage: false });
    expect(hydrated.length).toBeGreaterThan(1000);

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
  } finally {
    await context.close();
  }
});
