import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE_URL = (process.env.YAKOLAK_UX_SELECT_46_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const LABEL = process.env.YAKOLAK_UX_SELECT_46_LABEL || 'source';
const ARTIFACT_DIR = `artifacts/ux-select-46-${LABEL}`;
const ITERATIONS = Number(process.env.YAKOLAK_UX_SELECT_46_ITERATIONS || 12);
const PROCESSING_P95_BUDGET_MS = Number(process.env.YAKOLAK_UX_SELECT_46_PROCESSING_P95_MS || 80);
const VISIBLE_P95_BUDGET_MS = Number(process.env.YAKOLAK_UX_SELECT_46_VISIBLE_P95_MS || 250);
const ARGS = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
  '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage',
];

mkdirSync(ARTIFACT_DIR, { recursive: true });
test.describe.configure({ timeout: 420000 });
test.use({ launchOptions: { args: ARGS } });

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

function contextOptions(mode) {
  const mobile = mode === 'mobile';
  return {
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
  };
}

async function startPassPlay(page) {
  await page.goto(`${BASE_URL}/?yakolakTestFast=1&uxSelect46=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakUxSelect46Bridge === 'ready' &&
      typeof window.yakolakUx46StartPassPlay === 'function' &&
      typeof window.yakolakUx46ClearSelection === 'function' &&
      typeof window.yakolakUx46RefreshPickTargets === 'function',
    null,
    { timeout: 15000 },
  );
  await page.evaluate(() => window.yakolakUx46StartPassPlay());
  await page.waitForFunction(
    () => document.body.dataset.yakolakGameplay === 'ready' &&
      document.body.dataset.yakolakCurrentPlayer === 'right' &&
      document.body.dataset.yakolakCameraStage === 'ready',
    null,
    { timeout: 60000 },
  );
}

async function refreshTargets(page) {
  const before = await page.evaluate(() => Number(document.body.dataset.yakolakPiecePickTargetRevision || 0));
  await page.evaluate(() => window.yakolakUx46RefreshPickTargets());
  await page.waitForFunction(
    previous => Number(document.body.dataset.yakolakPiecePickTargetRevision || 0) > previous,
    before,
    { timeout: 6000 },
  );
  const targets = await page.evaluate(() => ({
    side0: {
      x: Number(document.body.dataset.yakolakTestSide0LargeX || 0),
      y: Number(document.body.dataset.yakolakTestSide0LargeY || 0),
    },
    side1: {
      x: Number(document.body.dataset.yakolakTestSidePlus1LargeX || 0),
      y: Number(document.body.dataset.yakolakTestSidePlus1LargeY || 0),
    },
  }));
  for (const target of [targets.side0, targets.side1]) {
    expect(target.x).toBeGreaterThan(0);
    expect(target.y).toBeGreaterThan(0);
  }
  return targets;
}

async function tap(page, mode, target) {
  if (mode === 'mobile') await page.touchscreen.tap(target.x, target.y);
  else await page.mouse.click(target.x, target.y);
}

async function clear(page) {
  await page.evaluate(() => window.yakolakUx46ClearSelection());
  await page.waitForFunction(
    () => (document.body.dataset.yakolakSelected || '') === '' && document.body.dataset.yakolakGameplay === 'ready',
    null,
    { timeout: 5000 },
  );
  await page.waitForTimeout(340);
}

async function oneTap(page, mode) {
  await clear(page);
  const targets = await refreshTargets(page);
  const beforeSerial = await page.evaluate(() => Number(document.body.dataset.yakolakUxSelect46Serial || 0));
  await tap(page, mode, targets.side0);
  await page.waitForFunction(
    previous => Number(document.body.dataset.yakolakUxSelect46Serial || 0) > previous,
    beforeSerial,
    { timeout: 6000 },
  );
  return page.evaluate(() => ({
    processing: Number(document.body.dataset.yakolakUxSelect46ProcessingMs || 0),
    frameAfterProcessing: Number(document.body.dataset.yakolakUxSelect46FrameMs || 0),
    visible: Number(document.body.dataset.yakolakUxSelect46VisibleMs || 0),
    selected: document.body.dataset.yakolakSelected || '',
    emphasisCount: Number(document.body.dataset.yakolakSelectionEmphasisCount || 0),
    emphasisOwner: document.body.dataset.yakolakSelectionEmphasisOwner || '',
    markerOwner: document.body.dataset.yakolakUxSelect46MarkerOwner || '',
    markerSerial: Number(document.body.dataset.yakolakUxSelect46MarkerSerial || 0),
    serial: Number(document.body.dataset.yakolakUxSelect46Serial || 0),
  }));
}

async function measureMode(browser, mode) {
  const context = await browser.newContext(contextOptions(mode));
  const page = await context.newPage();
  try {
    await startPassPlay(page);
    const samples = [];
    for (let i = 0; i < ITERATIONS; i += 1) {
      const sample = await oneTap(page, mode);
      expect(sample.selected).toContain('Stone_right_0_large');
      expect(sample.emphasisCount).toBe(1);
      expect(sample.emphasisOwner).toBe(sample.selected);
      expect(sample.markerSerial).toBe(sample.serial);
      expect(sample.markerOwner).toBe(sample.selected);
      samples.push(sample);
    }

    const summary = {};
    for (const key of ['processing', 'frameAfterProcessing', 'visible']) {
      const values = samples.map(s => s[key]);
      summary[key] = {
        p50: percentile(values, 0.50),
        p95: percentile(values, 0.95),
        max: Math.max(...values),
      };
    }
    writeFileSync(`${ARTIFACT_DIR}/${mode}.json`, JSON.stringify({
      label: LABEL,
      mode,
      iterations: ITERATIONS,
      budgets: { processingP95Ms: PROCESSING_P95_BUDGET_MS, visibleP95Ms: VISIBLE_P95_BUDGET_MS },
      summary,
      samples,
    }, null, 2));

    console.log(`UX_SELECT_46_METRIC label=${LABEL} mode=${mode} ` +
      `processing_p50=${summary.processing.p50.toFixed(2)} processing_p95=${summary.processing.p95.toFixed(2)} ` +
      `frame_p50=${summary.frameAfterProcessing.p50.toFixed(2)} frame_p95=${summary.frameAfterProcessing.p95.toFixed(2)} ` +
      `visible_p50=${summary.visible.p50.toFixed(2)} visible_p95=${summary.visible.p95.toFixed(2)}`);

    expect(summary.processing.p95).toBeLessThan(PROCESSING_P95_BUDGET_MS);
    expect(summary.visible.p95).toBeLessThan(VISIBLE_P95_BUDGET_MS);
  } finally {
    await context.close();
  }
}

async function rapidTapInvariant(browser, mode) {
  const context = await browser.newContext(contextOptions(mode));
  const page = await context.newPage();
  try {
    await startPassPlay(page);
    await clear(page);
    const targets = await refreshTargets(page);
    const beforeSerial = await page.evaluate(() => Number(document.body.dataset.yakolakUxSelect46Serial || 0));

    await tap(page, mode, targets.side0);
    await tap(page, mode, targets.side1);

    await page.waitForFunction(
      previous => Number(document.body.dataset.yakolakUxSelect46Serial || 0) > previous,
      beforeSerial,
      { timeout: 6000 },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.yakolakUxSelect46MarkerSerial || 0) === Number(document.body.dataset.yakolakUxSelect46Serial || -1),
      null,
      { timeout: 6000 },
    );

    const state = await page.evaluate(() => ({
      selected: document.body.dataset.yakolakSelected || '',
      emphasisCount: Number(document.body.dataset.yakolakSelectionEmphasisCount || 0),
      emphasisOwner: document.body.dataset.yakolakSelectionEmphasisOwner || '',
      markerOwner: document.body.dataset.yakolakUxSelect46MarkerOwner || '',
      markerSerial: Number(document.body.dataset.yakolakUxSelect46MarkerSerial || 0),
      serial: Number(document.body.dataset.yakolakUxSelect46Serial || 0),
      moves: Number(document.body.dataset.yakolakMoves || 0),
    }));

    expect(state.selected).toContain('Stone_right_1_large');
    expect(state.emphasisCount).toBe(1);
    expect(state.emphasisOwner).toBe(state.selected);
    expect(state.markerOwner).toBe(state.selected);
    expect(state.markerSerial).toBe(state.serial);
    expect(state.moves).toBe(0);
    console.log(`UX_SELECT_46_RAPID_TAP_OK mode=${mode} selected=${state.selected} serial=${state.serial}`);
  } finally {
    await context.close();
  }
}

for (const mode of ['desktop', 'mobile']) {
  test(`UX-SELECT-46 ${mode} tap feedback budget`, async ({ browser }) => {
    await measureMode(browser, mode);
  });
  test(`UX-SELECT-46 ${mode} rapid taps keep one selection`, async ({ browser }) => {
    await rapidTapInvariant(browser, mode);
  });
}
