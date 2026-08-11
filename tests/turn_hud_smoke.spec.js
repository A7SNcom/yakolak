import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 1280, height: 720 },
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
      visible: d.yakolakTurnIndicatorVisible,
      text: d.yakolakTurnIndicatorText,
      player: Number(d.yakolakTurnIndicatorPlayer || 0),
      updates: Number(d.yakolakTurnIndicatorUpdates || 0),
      top: Number(d.yakolakTurnIndicatorTop || 0),
      width: Number(d.yakolakTurnIndicatorWidth || 0),
      height: Number(d.yakolakTurnIndicatorHeight || 0),
      pointer: d.yakolakTurnIndicatorPointer,
      designHud: d.yakolakDesignHud,
      designCue: d.yakolakDesignTurnCue,
      designAnimation: d.yakolakDesignTurnCueAnimation,
      designLayout: d.yakolakDesignTurnCueLayout
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

test('single authoritative top turn indicator is event-driven and touch-safe', async ({ page }) => {
  test.setTimeout(150000);
  await startPassPlay(page);

  let state = await indicator(page);
  expect(state.hud).toBe('authoritative-top');
  expect(state.contract).toBe('pass');
  expect(state.source).toBe('authoritative-turn-signal');
  expect(state.polling).toBe('none');
  expect(state.digits).toBe('western-0-9');
  expect(state.visible).toBe('true');
  expect(state.text).toBe('دور أبيض');
  expect(state.top).toBeGreaterThanOrEqual(12);
  expect(state.width).toBeGreaterThanOrEqual(56);
  expect(state.width).toBeLessThanOrEqual(124);
  expect(state.height).toBe(30);
  expect(state.pointer).toBe('ignore');
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
                Number(document.body.dataset.yakolakTurnIndicatorUpdates || 0) > previous,
    beforeSelectionUpdates,
    { timeout: 15000 }
  );
  state = await indicator(page);
  expect(state.text).toBe('دور أزرق');
  const beforeResizeUpdates = state.updates;

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () => Number(document.body.dataset.yakolakTurnIndicatorHeight || 0) === 30 &&
          Number(document.body.dataset.yakolakTurnIndicatorTop || 0) >= 12 &&
          Number(document.body.dataset.yakolakTurnIndicatorWidth || 0) <= 124,
    null,
    { timeout: 5000 }
  );
  state = await indicator(page);
  expect(state.updates).toBe(beforeResizeUpdates);
  expect(state.text).toBe('دور أزرق');
  expect(state.pointer).toBe('ignore');

  await page.evaluate(() => window.yakolakTestForceMatchComplete());
  await page.waitForFunction(
    () => document.body.dataset.yakolakTurnIndicatorVisible === 'false' &&
          document.body.dataset.yakolakTurnIndicatorText === '',
    null,
    { timeout: 5000 }
  );
});
