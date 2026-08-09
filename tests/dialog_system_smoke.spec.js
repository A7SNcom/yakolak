import { test, expect } from '@playwright/test';

test.use({
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

async function openDialog(page) {
  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakSetup === 'visible' &&
          document.body.dataset.yakolakDialogSystem === 'native-control-v1' &&
          document.body.dataset.yakolakDialogStage === 'room_entry',
    null,
    { timeout: 60000 }
  );
  await page.waitForTimeout(150);
}

async function point(page, kind = 'Primary') {
  return page.evaluate(kind => ({
    x: Number(document.body.dataset[`yakolakDialog${kind}X`]),
    y: Number(document.body.dataset[`yakolakDialog${kind}Y`]),
  }), kind);
}

async function waitStage(page, stage) {
  await page.waitForFunction(
    expected => document.body.dataset.yakolakDialogStage === expected,
    stage,
    { timeout: 10000 }
  );
  await page.waitForTimeout(80);
}

async function assertContract(page) {
  const contract = await page.evaluate(() => ({
    system: document.body.dataset.yakolakDialogSystem,
    sizing: document.body.dataset.yakolakDialogSizing,
    backdrop: document.body.dataset.yakolakDialogBackdrop,
    keyboard: document.body.dataset.yakolakDialogKeyboard,
    focus: document.body.dataset.yakolakDialogFocus,
    focusCount: Number(document.body.dataset.yakolakDialogFocusCount),
  }));
  expect(contract.system).toBe('native-control-v1');
  expect(contract.sizing).toBe('content-fit');
  expect(contract.backdrop).toBe('blocked-not-dismissible');
  expect(contract.keyboard).toBe('tab-loop+escape');
  expect(contract.focus).toBe('button');
  expect(contract.focusCount).toBeGreaterThan(0);
}

test('dialog mouse path uses real canvas hit targets and explicit close', async ({ browser }) => {
  test.setTimeout(90000);
  const context = await browser.newContext({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await openDialog(page);
  await assertContract(page);

  const primary = await point(page);
  expect(Number.isFinite(primary.x) && Number.isFinite(primary.y)).toBe(true);
  await page.mouse.click(primary.x, primary.y);
  await waitStage(page, 'setup:count');

  // Clicking the shaded world outside the card must not dismiss a blocking game setup dialog.
  await page.mouse.click(12, 700);
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => document.body.dataset.yakolakDialogStage)).toBe('setup:count');

  const close = await point(page, 'Close');
  expect(Number.isFinite(close.x) && Number.isFinite(close.y)).toBe(true);
  await page.mouse.click(close.x, close.y);
  await waitStage(page, 'room_entry');
  await context.close();
});

test('dialog touch path can advance and cancel without mouse-only behavior', async ({ browser }) => {
  test.setTimeout(90000);
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await openDialog(page);

  let primary = await point(page);
  await page.touchscreen.tap(primary.x, primary.y);
  await waitStage(page, 'setup:count');

  primary = await point(page);
  await page.touchscreen.tap(primary.x, primary.y);
  await waitStage(page, 'setup:mode:1');

  const close = await point(page, 'Close');
  await page.touchscreen.tap(close.x, close.y);
  await waitStage(page, 'setup:count');
  await context.close();
});

test('dialog keyboard path starts focused, loops with Tab and honors Escape', async ({ browser }) => {
  test.setTimeout(90000);
  const context = await browser.newContext({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await openDialog(page);
  await assertContract(page);

  // Primary action owns initial focus.
  await page.keyboard.press('Enter');
  await waitStage(page, 'setup:count');

  // The first control's previous focus target is the fixed close button.
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await waitStage(page, 'room_entry');

  // Re-enter and verify Escape follows the same cancel contract.
  await page.keyboard.press('Enter');
  await waitStage(page, 'setup:count');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const escapeBridge = await page.evaluate(() => ({
    seen: document.body.dataset.yakolakDialogEscapeSeen || 'none',
    stage: document.body.dataset.yakolakDialogStage || 'none',
    callback: typeof window.yakolakDialogCancel,
  }));
  console.log(`YAKOLAK_DIALOG_ESCAPE ${JSON.stringify(escapeBridge)}`);
  expect(escapeBridge.seen).toBe('godot');
  await waitStage(page, 'room_entry');

  // The mandatory root cannot be dismissed into an unusable game state.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => document.body.dataset.yakolakDialogStage)).toBe('room_entry');
  await context.close();
});
