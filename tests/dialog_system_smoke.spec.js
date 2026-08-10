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

test.describe.configure({ mode: 'serial' });

async function openDialog(page) {
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });

  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(
      () => document.body.dataset.yakolakIntro === 'complete' &&
            document.body.dataset.yakolakSetup === 'visible' &&
            document.body.dataset.yakolakDialogSystem === 'native-control-v1' &&
            document.body.dataset.yakolakDialogStage === 'room_entry',
      null,
      { timeout: 30000 }
    );
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      intro: document.body.dataset.yakolakIntro || '',
      setup: document.body.dataset.yakolakSetup || '',
      dialogSystem: document.body.dataset.yakolakDialogSystem || '',
      dialogStage: document.body.dataset.yakolakDialogStage || '',
      interaction: document.body.dataset.yakolakInteractionFeedback || '',
      onlineState: document.body.dataset.yakolakOnlineUiState || '',
      onlineSurface: document.body.dataset.yakolakOnlineUiSurface || '',
      canvas: Boolean(document.querySelector('canvas')),
      readyState: document.readyState,
    })).catch(e => ({ evaluateError: String(e) }));
    throw new Error(`YAKOLAK_DIALOG_BOOT_DIAGNOSTIC ${JSON.stringify({ browserErrors, diagnostic, originalError: String(error) })}`);
  }
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

async function waitFocusRole(page, role) {
  await page.waitForFunction(
    expected => document.body.dataset.yakolakDialogFocusRole === expected,
    role,
    { timeout: 10000 }
  );
}

async function assertContract(page) {
  const contract = await page.evaluate(() => ({
    system: document.body.dataset.yakolakDialogSystem,
    sizing: document.body.dataset.yakolakDialogSizing,
    backdrop: document.body.dataset.yakolakDialogBackdrop,
    keyboard: document.body.dataset.yakolakDialogKeyboard,
    focus: document.body.dataset.yakolakDialogFocus,
    focusRole: document.body.dataset.yakolakDialogFocusRole,
    focusCount: Number(document.body.dataset.yakolakDialogFocusCount),
  }));
  expect(contract.system).toBe('native-control-v1');
  expect(contract.sizing).toBe('content-fit');
  expect(contract.backdrop).toBe('blocked-not-dismissible');
  expect(contract.keyboard).toBe('tab-loop+escape');
  expect(contract.focus).toBe('button');
  expect(contract.focusRole).toBe('primary');
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

  await page.keyboard.press('Enter');
  await waitStage(page, 'setup:count');

  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await waitStage(page, 'room_entry');
  await waitFocusRole(page, 'primary');

  await page.keyboard.press('Enter');
  await waitStage(page, 'setup:count');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const escapeBridge = await page.evaluate(() => ({
    seen: document.body.dataset.yakolakDialogEscapeSeen || 'none',
    stage: document.body.dataset.yakolakDialogStage || 'none',
    callback: typeof window.yakolakDialogCancel,
  }));
  expect(escapeBridge.seen).toBe('godot');
  await waitStage(page, 'room_entry');
  await waitFocusRole(page, 'primary');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => document.body.dataset.yakolakDialogStage)).toBe('room_entry');
  await context.close();
});