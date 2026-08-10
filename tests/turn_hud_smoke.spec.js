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

async function focus(page) {
  return page.evaluate(() => {
    const d = document.body.dataset;
    return {
      hud: d.yakolakTurnHud,
      contract: d.yakolakTurnFocusContract,
      cue: d.yakolakTurnFocus,
      direction: d.yakolakTurnFocusDirection,
      color: d.yakolakTurnFocusColor,
      energy: Number(d.yakolakTurnFocusEnergy || 0),
      noPanel: d.yakolakTurnFocusNoPanel,
      designHud: d.yakolakDesignHud,
      designCue: d.yakolakDesignTurnCue
    };
  });
}

async function startPassPlay(page) {
  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakSetup === 'visible' &&
          document.body.dataset.yakolakTurnFocusContract === 'pass' &&
          document.body.dataset.yakolakTurnFocusNoPanel === 'true' &&
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
          document.body.dataset.yakolakTurnHud === 'removed' &&
          document.body.dataset.yakolakTurnFocus === 'active' &&
          document.body.dataset.yakolakTurnFocusDirection === 'right' &&
          Number(document.body.dataset.yakolakTurnFocusEnergy || 0) > 0.5,
    null,
    { timeout: 15000 }
  );
}

test('active player is communicated by localized 3D light with no redundant turn panel', async ({ page }) => {
  test.setTimeout(150000);
  await startPassPlay(page);

  let state = await focus(page);
  expect(state.hud).toBe('removed');
  expect(state.contract).toBe('pass');
  expect(state.noPanel).toBe('true');
  expect(state.cue).toBe('active');
  expect(state.direction).toBe('right');
  expect(state.energy).toBeGreaterThan(0.5);
  expect(state.designHud).toBe('removed-redundant-panel');
  expect(state.designCue).toBe('localized-3d-light');

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
    () => document.body.dataset.yakolakSelectedType === 'large' &&
          document.body.dataset.yakolakTurnHud === 'removed' &&
          document.body.dataset.yakolakTurnFocusDirection === 'right',
    null,
    { timeout: 5000 }
  );

  await page.evaluate(() => window.yakolakTestPlayOneMove());
  await page.waitForFunction(
    () => Number(document.body.dataset.yakolakMoves || 0) >= 1 &&
          document.body.dataset.yakolakCurrentPlayer === 'back' &&
          document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakTurnHud === 'removed' &&
          document.body.dataset.yakolakTurnFocus === 'active' &&
          document.body.dataset.yakolakTurnFocusDirection === 'back',
    null,
    { timeout: 15000 }
  );
  state = await focus(page);
  expect(state.direction).toBe('back');
  expect(state.color).toBe('blue');
  expect(state.energy).toBeGreaterThan(0.5);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () => document.body.dataset.yakolakTurnHud === 'removed' &&
          document.body.dataset.yakolakTurnFocusNoPanel === 'true' &&
          document.body.dataset.yakolakTurnFocusDirection === 'back',
    null,
    { timeout: 5000 }
  );

  await page.evaluate(() => window.yakolakTestForceMatchComplete());
  await page.waitForFunction(
    () => document.body.dataset.yakolakTurnHud === 'removed' &&
          document.body.dataset.yakolakTurnFocus === 'hidden' &&
          Number(document.body.dataset.yakolakTurnFocusEnergy || 0) === 0,
    null,
    { timeout: 5000 }
  );
});
