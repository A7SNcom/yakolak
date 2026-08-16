import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE_URL = (process.env.YAKOLAK_UX_SELECT_46_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const LABEL = process.env.YAKOLAK_UX_SELECT_46_LABEL || 'source';
const ARTIFACT_DIR = `artifacts/ux-select-46-${LABEL}`;
const ITERATIONS = Number(process.env.YAKOLAK_UX_SELECT_46_ITERATIONS || 24);
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
    () => document.body.dataset.yakolakIntro === 'complete' &&
      document.body.dataset.yakolakSetup === 'visible' &&
      typeof window.yakolakTestStartPassPlay === 'function' &&
      typeof window.yakolakTestClearSelection === 'function' &&
      typeof window.yakolakTestRefreshPickTargets === 'function',
    null,
    { timeout: 60000 },
  );
  await page.evaluate(() => window.yakolakTestStartPassPlay());
  await page.waitForFunction(
    () => document.body.dataset.yakolakGameplay === 'ready' &&
      document.body.dataset.yakolakCurrentPlayer === 'right' &&
      document.body.dataset.yakolakCameraStage === 'ready',
    null,
    { timeout: 20000 },
  );
}

async function freshTarget(page) {
  const before = await page.evaluate(() => Number(document.body.dataset.yakolakPiecePickTargetRevision || 0));
  await page.evaluate(() => window.yakolakTestRefreshPickTargets());
  await page.waitForFunction(
    previous => Number(document.body.dataset.yakolakPiecePickTargetRevision || 0) > previous,
    before,
    { timeout: 6000 },
  );
  const target = await page.evaluate(() => ({
    x: Number(document.body.dataset.yakolakTestSide0LargeX || document.body.dataset.yakolakTestPieceX || 0),
    y: Number(document.body.dataset.yakolakTestSide0LargeY || document.body.dataset.yakolakTestPieceY || 0),
  }));
  expect(target.x).toBeGreaterThan(0);
  expect(target.y).toBeGreaterThan(0);
  return target;
}

async function installProbe(page) {
  await page.evaluate(() => {
    window.__uxSelect46 = { eventAt: 0, selectedAt: 0, rafAt: 0, selected: '' };
    const recordEvent = () => {
      const state = window.__uxSelect46;
      if (state && !state.eventAt) state.eventAt = performance.now();
    };
    addEventListener('pointerdown', recordEvent, true);
    addEventListener('touchstart', recordEvent, true);
    addEventListener('mousedown', recordEvent, true);
    const observer = new MutationObserver(() => {
      const selected = document.body.dataset.yakolakSelected || '';
      const state = window.__uxSelect46;
      if (!state || !selected || state.selectedAt) return;
      state.selected = selected;
      state.selectedAt = performance.now();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (window.__uxSelect46 === state) state.rafAt = performance.now();
        });
      });
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-yakolak-selected'] });
    window.__uxSelect46Observer = observer;
  });
}

async function oneTap(page, mode, target) {
  await page.evaluate(() => { window.__uxSelect46 = { eventAt: 0, selectedAt: 0, rafAt: 0, selected: '' }; });
  const commandAt = await page.evaluate(() => performance.now());
  if (mode === 'mobile') await page.touchscreen.tap(target.x, target.y);
  else await page.mouse.click(target.x, target.y);
  await page.waitForFunction(() => {
    const s = window.__uxSelect46;
    return s && s.eventAt > 0 && s.selectedAt > 0 && s.rafAt > 0;
  }, null, { timeout: 6000 });
  return page.evaluate(commandAtValue => {
    const s = window.__uxSelect46;
    return {
      commandToEvent: s.eventAt - commandAtValue,
      processing: s.selectedAt - s.eventAt,
      frameAfterState: s.rafAt - s.selectedAt,
      tapToVisibleOpportunity: s.rafAt - s.eventAt,
      selected: s.selected,
    };
  }, commandAt);
}

async function clear(page) {
  await page.evaluate(() => window.yakolakTestClearSelection());
  await page.waitForFunction(() => (document.body.dataset.yakolakSelected || '') === '' && document.body.dataset.yakolakGameplay === 'ready', null, { timeout: 5000 });
}

async function measureMode(browser, mode) {
  const context = await browser.newContext(contextOptions(mode));
  const page = await context.newPage();
  try {
    await startPassPlay(page);
    await installProbe(page);
    const target = await freshTarget(page);
    const samples = [];
    for (let i = 0; i < ITERATIONS; i += 1) {
      await clear(page);
      const sample = await oneTap(page, mode, target);
      expect(sample.selected).toContain('Stone_right_0_large');
      samples.push(sample);
    }
    const summary = {};
    for (const key of ['commandToEvent', 'processing', 'frameAfterState', 'tapToVisibleOpportunity']) {
      const values = samples.map(s => s[key]);
      summary[key] = {
        p50: percentile(values, 0.50),
        p95: percentile(values, 0.95),
        max: Math.max(...values),
      };
    }
    writeFileSync(`${ARTIFACT_DIR}/${mode}.json`, JSON.stringify({ label: LABEL, mode, iterations: ITERATIONS, summary, samples }, null, 2));
    console.log(`UX_SELECT_46_METRIC label=${LABEL} mode=${mode} ` +
      `processing_p50=${summary.processing.p50.toFixed(2)} processing_p95=${summary.processing.p95.toFixed(2)} ` +
      `frame_p50=${summary.frameAfterState.p50.toFixed(2)} frame_p95=${summary.frameAfterState.p95.toFixed(2)} ` +
      `visible_p50=${summary.tapToVisibleOpportunity.p50.toFixed(2)} visible_p95=${summary.tapToVisibleOpportunity.p95.toFixed(2)}`);
    expect(summary.tapToVisibleOpportunity.p95).toBeLessThan(500);
  } finally {
    await context.close();
  }
}

for (const mode of ['desktop', 'mobile']) {
  test(`UX-SELECT-46 measures ${mode} valid tap to selected feedback`, async ({ browser }) => {
    await measureMode(browser, mode);
  });
}
