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

async function hud(page) {
  return page.evaluate(() => {
    const d = document.body.dataset;
    return {
      visible: d.yakolakTurnHud,
      state: d.yakolakTurnHudState,
      player: d.yakolakTurnHudPlayer,
      playerText: d.yakolakTurnHudPlayerText,
      color: d.yakolakTurnHudColor,
      colorName: d.yakolakTurnHudColorName,
      selected: d.yakolakTurnHudSelectedSize,
      large: Number(d.yakolakTurnHudLarge || 0),
      medium: Number(d.yakolakTurnHudMedium || 0),
      small: Number(d.yakolakTurnHudSmall || 0),
      noGuess: d.yakolakTurnHudNoGuess,
      area: Number(d.yakolakTurnHudAreaRatio || 0),
      width: Number(d.yakolakTurnHudWidthPx || 0),
      height: Number(d.yakolakTurnHudHeightPx || 0),
      matrix: d.yakolakTurnHudMatrix,
      matrixCount: Number(d.yakolakTurnHudMatrixCount || 0)
    };
  });
}

async function startPassPlay(page) {
  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakSetup === 'visible' &&
          document.body.dataset.yakolakTurnHudMatrix === 'pass' &&
          Number(document.body.dataset.yakolakTurnHudMatrixCount || 0) >= 13 &&
          typeof window.yakolakTestStartPassPlay === 'function' &&
          typeof window.yakolakTestPlayOneMove === 'function' &&
          typeof window.yakolakTestClearSelection === 'function' &&
          typeof window.yakolakTestRefreshPickTargets === 'function' &&
          typeof window.yakolakTestForceMatchComplete === 'function',
    null,
    { timeout: 60000 }
  );
  await page.evaluate(() => window.yakolakTestStartPassPlay());
  await page.waitForFunction(
    () => document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakCurrentPlayer === 'right' &&
          document.body.dataset.yakolakTurnHud === 'visible' &&
          document.body.dataset.yakolakTurnHudState === 'choose' &&
          document.body.dataset.yakolakTurnHudNoGuess === 'true',
    null,
    { timeout: 15000 }
  );
}

test('turn HUD stays guess-free from choice through selection, placement, next player and match end', async ({ page }) => {
  test.setTimeout(150000);
  await startPassPlay(page);

  let state = await hud(page);
  expect(state.matrix).toBe('pass');
  expect(state.matrixCount).toBeGreaterThanOrEqual(13);
  expect(state.player).not.toBe('');
  expect(state.colorName).not.toBe('');
  expect(state.large).toBe(3);
  expect(state.medium).toBe(3);
  expect(state.small).toBe(3);
  expect(state.area).toBeGreaterThan(0);
  expect(state.area).toBeLessThan(0.09);
  expect(state.width).toBeLessThanOrEqual(322);
  expect(state.height).toBeLessThanOrEqual(90);

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
    () => document.body.dataset.yakolakTurnHudState === 'place' &&
          document.body.dataset.yakolakTurnHudSelectedSize === 'large' &&
          document.body.dataset.yakolakTurnHudNoGuess === 'true',
    null,
    { timeout: 5000 }
  );
  state = await hud(page);
  expect(state.state).toBe('place');
  expect(state.selected).toBe('large');

  await page.evaluate(() => window.yakolakTestClearSelection());
  await page.waitForFunction(() => document.body.dataset.yakolakTurnHudState === 'choose', null, { timeout: 5000 });

  await page.evaluate(() => window.yakolakTestPlayOneMove());
  await page.waitForFunction(
    () => Number(document.body.dataset.yakolakMoves || 0) >= 1 &&
          document.body.dataset.yakolakCurrentPlayer === 'back' &&
          document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakTurnHudState === 'choose' &&
          document.body.dataset.yakolakTurnHudNoGuess === 'true' &&
          (window.__yakolakTurnHudHistory || []).includes('placing') &&
          (window.__yakolakTurnHudHistory || []).includes('turn-transition'),
    null,
    { timeout: 15000 }
  );
  state = await hud(page);
  expect(state.color).toBe('blue');
  expect(state.colorName).not.toBe('');
  expect(state.player).not.toBe('');
  expect(state.large + state.medium + state.small).toBeGreaterThan(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () => Number(document.body.dataset.yakolakTurnHudAreaRatio || 1) > 0 &&
          Number(document.body.dataset.yakolakTurnHudAreaRatio || 1) < 0.09 &&
          Number(document.body.dataset.yakolakTurnHudWidthPx || 999) <= 322 &&
          Number(document.body.dataset.yakolakTurnHudHeightPx || 999) <= 90,
    null,
    { timeout: 5000 }
  );

  await page.evaluate(() => window.yakolakTestForceMatchComplete());
  await page.waitForFunction(
    () => document.body.dataset.yakolakTurnHudState === 'match-complete' &&
          document.body.dataset.yakolakTurnHudPlayerText === 'لا يوجد دور' &&
          document.body.dataset.yakolakTurnHudNoGuess === 'true',
    null,
    { timeout: 5000 }
  );
});
