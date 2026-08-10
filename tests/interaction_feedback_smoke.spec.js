import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 960, height: 720 },
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

test.describe.configure({ mode: 'serial' });

async function bootSetup(page) {
  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakSetup === 'visible' &&
          document.body.dataset.yakolakDialogStage === 'room_entry' &&
          document.body.dataset.yakolakInteractionFeedback === 'hover+pressed+selected+disabled+focus+loading' &&
          document.body.dataset.yakolakInteractionInputs === 'mouse+touch+keyboard',
    null,
    { timeout: 30000 }
  );
  await page.waitForTimeout(260);
}

async function primaryPoint(page) {
  return page.evaluate(() => ({
    x: Number(document.body.dataset.yakolakDialogPrimaryX || 0),
    y: Number(document.body.dataset.yakolakDialogPrimaryY || 0),
  }));
}

test('setup gives immediate state feedback and rapid clicks cannot skip a decision', async ({ page }) => {
  test.setTimeout(90000);
  await bootSetup(page);

  const contract = await page.evaluate(() => ({
    feedback: document.body.dataset.yakolakInteractionFeedback,
    inputs: document.body.dataset.yakolakInteractionInputs,
    motion: document.body.dataset.yakolakInteractionMotion,
    guard: Number(document.body.dataset.yakolakInteractionRapidGuardMs || 0),
  }));
  expect(contract.feedback).toBe('hover+pressed+selected+disabled+focus+loading');
  expect(contract.inputs).toBe('mouse+touch+keyboard');
  expect(contract.motion).toBe('instant-subtle');
  expect(contract.guard).toBeGreaterThanOrEqual(150);
  expect(contract.guard).toBeLessThanOrEqual(220);

  const primary = await primaryPoint(page);
  expect(primary.x).toBeGreaterThan(0);
  expect(primary.y).toBeGreaterThan(0);

  // A real double click at one physical location must count as one decision even
  // if the next wizard screen appears under the pointer between click #1 and #2.
  await page.mouse.dblclick(primary.x, primary.y, { delay: 20 });
  await page.waitForTimeout(320);
  const rapidState = await page.evaluate(() => ({
    stage: document.body.dataset.yakolakDialogStage,
    acknowledged: document.body.dataset.yakolakInteractionRapidRepeat || '',
  }));
  expect(rapidState.stage).toBe('setup:count');
  expect(rapidState.acknowledged).toBe('acknowledged');
});

test('game stone hover reacts before selection and a rapid repeat stays stable', async ({ page }) => {
  test.setTimeout(120000);
  await bootSetup(page);
  await page.waitForFunction(() => typeof window.yakolakTestStartPassPlay === 'function', null, { timeout: 10000 });
  await page.evaluate(() => window.yakolakTestStartPassPlay());
  await page.waitForFunction(
    () => document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakCurrentPlayer === 'right' &&
          document.body.dataset.yakolakGameplayFeedback === 'hover+pressed+selected+invalid+toggle+focus' &&
          Number(document.body.dataset.yakolakTestSide0LargeX || 0) > 0 &&
          Number(document.body.dataset.yakolakTestSide0LargeY || 0) > 0,
    null,
    { timeout: 15000 }
  );

  const target = await page.evaluate(() => ({
    x: Number(document.body.dataset.yakolakTestSide0LargeX),
    y: Number(document.body.dataset.yakolakTestSide0LargeY),
  }));
  await page.mouse.move(target.x, target.y);
  await page.waitForFunction(
    () => document.body.dataset.yakolakPieceHover === 'Stone_right_0_large',
    null,
    { timeout: 3000 }
  );

  await page.mouse.dblclick(target.x, target.y, { delay: 20 });
  await page.waitForFunction(
    () => document.body.dataset.yakolakSelected === 'Stone_right_0_large' &&
          document.body.dataset.yakolakTray === 'open',
    null,
    { timeout: 5000 }
  );
  await page.waitForTimeout(160);
  expect(await page.evaluate(() => document.body.dataset.yakolakSelected)).toBe('Stone_right_0_large');
});
