import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const VIEWPORTS = [
  { name: '320x568', width: 320, height: 568 },
  { name: '375x812', width: 375, height: 812 },
  { name: '390x844', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
];

test.use({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  launchOptions: {
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--disable-dev-shm-usage'
    ]
  }
});

async function indicator(page) {
  return page.evaluate(() => {
    const d = document.body.dataset;
    return {
      hud: d.yakolakTurnHud,
      contract: d.yakolakTurnIndicatorContract,
      source: d.yakolakTurnIndicatorSource,
      polling: d.yakolakTurnIndicatorPolling,
      digits: d.yakolakTurnIndicatorDigits,
      oneGlance: d.yakolakTurnIndicatorOneGlance,
      stalePolicy: d.yakolakTurnIndicatorStalePolicy,
      visible: d.yakolakTurnIndicatorVisible,
      text: d.yakolakTurnIndicatorText,
      player: Number(d.yakolakTurnIndicatorPlayer || 0),
      color: d.yakolakTurnIndicatorColor,
      local: d.yakolakTurnIndicatorLocal,
      updates: Number(d.yakolakTurnIndicatorUpdates || 0),
      top: Number(d.yakolakTurnIndicatorTop || 0),
      width: Number(d.yakolakTurnIndicatorWidth || 0),
      height: Number(d.yakolakTurnIndicatorHeight || 0),
      pointer: d.yakolakTurnIndicatorPointer,
      overlay: d.yakolakTurnIndicatorOverlay,
      designHud: d.yakolakDesignHud,
      designCue: d.yakolakDesignTurnCue,
      designAnimation: d.yakolakDesignTurnCueAnimation,
      designLayout: d.yakolakDesignTurnCueLayout
    };
  });
}

async function canvasLayout(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const rect = canvas?.getBoundingClientRect();
    const d = document.body.dataset;
    return {
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      canvas: rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null,
      cellY: Number(d.yakolakTestCellY || NaN),
      indicatorTop: Number(d.yakolakTurnIndicatorTop || 0),
      indicatorHeight: Number(d.yakolakTurnIndicatorHeight || 0),
      indicatorWidth: Number(d.yakolakTurnIndicatorWidth || 0),
    };
  });
}

async function startPassPlay(page) {
  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakSetup === 'visible' &&
          document.body.dataset.yakolakTurnIndicatorContract === 'pass' &&
          typeof window.yakolakTestStartPassPlay === 'function' &&
          typeof window.yakolakTestPlayOneMove === 'function' &&
          typeof window.yakolakTestRefreshPickTargets === 'function' &&
          typeof window.yakolakTestForceMatchComplete === 'function',
    null,
    { timeout: 60000 }
  );
  await page.evaluate(() => window.yakolakTestStartPassPlay());
  await page.waitForFunction(
    () => document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakCurrentPlayer === 'right' &&
          document.body.dataset.yakolakTurnIndicatorVisible === 'true' &&
          document.body.dataset.yakolakTurnIndicatorText === 'دور أبيض',
    null,
    { timeout: 15000 }
  );
}

test('UX-TURN-35 single authoritative indicator stays one-glance, compact, and overlay-only', async ({ page }) => {
  test.setTimeout(180000);
  mkdirSync('artifacts', { recursive: true });
  await startPassPlay(page);

  let state = await indicator(page);
  expect(state.hud).toBe('authoritative-top');
  expect(state.contract).toBe('pass');
  expect(state.source).toBe('authoritative-turn-signal');
  expect(state.polling).toBe('none');
  expect(state.digits).toBe('western-0-9');
  expect(state.oneGlance).toBe('copy+player-color');
  expect(state.stalePolicy).toBe('monotonic-revision');
  expect(state.visible).toBe('true');
  expect(state.text).toBe('دور أبيض');
  expect(state.color).toBe('marble');
  expect(state.local).toBe('false');
  expect(state.top).toBeGreaterThanOrEqual(12);
  expect(state.width).toBeGreaterThanOrEqual(56);
  expect(state.width).toBeLessThanOrEqual(124);
  expect(state.height).toBe(30);
  expect(state.pointer).toBe('ignore');
  expect(state.overlay).toBe('true');
  expect(state.designHud).toBe('single-authoritative-turn-indicator');
  expect(state.designCue).toBe('top-center-30px-capsule');
  expect(state.designAnimation).toBe('none');
  expect(state.designLayout).toBe('overlay-no-shift');

  const beforeSelectionUpdates = state.updates;
  const before = await page.evaluate(() => Number(document.body.dataset.yakolakPiecePickTargetRevision || 0));
  await page.evaluate(() => window.yakolakTestRefreshPickTargets());
  await page.waitForFunction(
    previous => Number(document.body.dataset.yakolakPiecePickTargetRevision || 0) > previous,
    before,
    { timeout: 5000 }
  );
  const target = await page.evaluate(() => ({
    x: Number(document.body.dataset.yakolakTestSide0LargeX || 0),
    y: Number(document.body.dataset.yakolakTestSide0LargeY || 0)
  }));
  expect(target.x).toBeGreaterThan(0);
  expect(target.y).toBeGreaterThan(0);
  await page.mouse.click(target.x, target.y);
  await page.waitForFunction(
    () => document.body.dataset.yakolakSelectedSize === 'large',
    null,
    { timeout: 5000 }
  );
  state = await indicator(page);
  expect(state.updates).toBe(beforeSelectionUpdates);
  expect(state.text).toBe('دور أبيض');

  await page.evaluate(() => window.yakolakTestPlayOneMove());
  await page.waitForFunction(
    previous => Number(document.body.dataset.yakolakMoves || 0) >= 1 &&
                document.body.dataset.yakolakCurrentPlayer === 'back' &&
                document.body.dataset.yakolakGameplay === 'ready' &&
                document.body.dataset.yakolakTurnIndicatorVisible === 'true' &&
                document.body.dataset.yakolakTurnIndicatorText === 'دور أزرق' &&
                document.body.dataset.yakolakTurnIndicatorColor === 'blue' &&
                Number(document.body.dataset.yakolakTurnIndicatorUpdates || 0) > previous,
    beforeSelectionUpdates,
    { timeout: 15000 }
  );
  state = await indicator(page);
  expect(state.text).toBe('دور أزرق');
  expect(state.color).toBe('blue');
  const beforeResizeUpdates = state.updates;

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForFunction(
      expected => innerWidth === expected.width && innerHeight === expected.height &&
        Number(document.body.dataset.yakolakTurnIndicatorHeight || 0) === 30 &&
        Number(document.body.dataset.yakolakTurnIndicatorTop || 0) >= 12 &&
        Number(document.body.dataset.yakolakTurnIndicatorWidth || 0) <= 124,
      viewport,
      { timeout: 5000 }
    );
    await page.waitForTimeout(80);

    state = await indicator(page);
    const layout = await canvasLayout(page);
    expect(state.updates, `${viewport.name}: resize cannot synthesize turn state`).toBe(beforeResizeUpdates);
    expect(state.text, `${viewport.name}: active owner remains legible`).toBe('دور أزرق');
    expect(state.color, `${viewport.name}: player color cue remains active`).toBe('blue');
    expect(state.pointer, `${viewport.name}: indicator stays non-blocking`).toBe('ignore');
    expect(state.top, `${viewport.name}: safe top`).toBeGreaterThanOrEqual(12);
    expect(state.width, `${viewport.name}: compact width`).toBeLessThanOrEqual(124);
    expect(state.height, `${viewport.name}: compact height`).toBe(30);
    expect((viewport.width - state.width) / 2, `${viewport.name}: horizontal breathing room`).toBeGreaterThanOrEqual(8);
    expect(layout.canvas, `${viewport.name}: canvas exists`).not.toBeNull();
    expect(Math.abs(layout.canvas.left), `${viewport.name}: overlay cannot push canvas horizontally`).toBeLessThanOrEqual(1);
    expect(Math.abs(layout.canvas.top), `${viewport.name}: overlay cannot push canvas vertically`).toBeLessThanOrEqual(1);
    expect(Math.abs(layout.canvas.width - viewport.width), `${viewport.name}: canvas width cannot shift`).toBeLessThanOrEqual(1);
    expect(Math.abs(layout.canvas.height - viewport.height), `${viewport.name}: canvas height cannot shift`).toBeLessThanOrEqual(1);
    if (Number.isFinite(layout.cellY)) {
      const indicatorBottom = layout.indicatorTop + layout.indicatorHeight;
      const requiredSeparation = Math.min(viewport.width, viewport.height) * 0.22;
      expect(layout.cellY - indicatorBottom, `${viewport.name}: indicator cannot overlap playable board center`).toBeGreaterThan(requiredSeparation);
    }
    await page.screenshot({ path: `artifacts/ux-turn-35-${viewport.name}.png`, fullPage: true });
  }

  const beforeHideLayout = await canvasLayout(page);
  await page.evaluate(() => window.yakolakTestForceMatchComplete());
  await page.waitForFunction(
    () => document.body.dataset.yakolakTurnIndicatorVisible === 'false' &&
          document.body.dataset.yakolakTurnIndicatorText === '' &&
          document.body.dataset.yakolakTurnIndicatorColor === '',
    null,
    { timeout: 5000 }
  );
  const hiddenState = await indicator(page);
  const afterHideLayout = await canvasLayout(page);
  expect(hiddenState.player).toBe(0);
  expect(hiddenState.local).toBe('false');
  expect(afterHideLayout.canvas).toEqual(beforeHideLayout.canvas);
});
