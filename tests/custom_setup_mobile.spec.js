import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },
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

function watchFailures(page) {
  const failures = [];
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request => {
    const url = request.url();
    const errorText = request.failure()?.errorText || '';
    if ((url.endsWith('/index.wasm') || url.endsWith('/index.pck')) && errorText === 'net::ERR_ABORTED') return;
    failures.push(`requestfailed: ${url} ${errorText}`);
  });
  page.on('console', message => {
    const text = message.text();
    if (message.type() === 'error' && !text.includes('favicon')) failures.push(`console: ${text}`);
  });
  return failures;
}

async function waitForSetup(page) {
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakSetup === 'visible' &&
          typeof window.yakolakTestSetupFlowAction === 'function',
    null,
    { timeout: 60000 }
  );
}

async function waitForStage(page, stage) {
  await page.waitForFunction(
    expected => document.body.dataset.yakolakSetupFlowStage === expected &&
                document.body.dataset.yakolakSetupWizard === expected &&
                document.body.dataset.yakolakSetupLayoutMode === 'portrait-stack' &&
                Number.isFinite(Number(document.body.dataset.yakolakSetupCardLeftRatio)) &&
                Number.isFinite(Number(document.body.dataset.yakolakSetupCardTopRatio)) &&
                Number.isFinite(Number(document.body.dataset.yakolakSetupCardRightRatio)) &&
                Number.isFinite(Number(document.body.dataset.yakolakSetupCardBottomRatio)),
    stage,
    { timeout: 15000 }
  );
  await page.waitForTimeout(300);
}

async function assertReadablePortrait(page, label) {
  const metrics = await page.evaluate(() => ({
    left: Number(document.body.dataset.yakolakSetupCardLeftRatio),
    top: Number(document.body.dataset.yakolakSetupCardTopRatio),
    right: Number(document.body.dataset.yakolakSetupCardRightRatio),
    bottom: Number(document.body.dataset.yakolakSetupCardBottomRatio),
    touchMin: Number(document.body.dataset.yakolakSetupTouchMin),
    font: document.body.dataset.yakolakArabicFont,
    direction: document.body.dataset.yakolakSetupDirection,
    layoutMode: document.body.dataset.yakolakSetupLayoutMode,
    scrollable: document.body.dataset.yakolakSetupScrollable,
  }));

  expect(metrics.font, label).toBe('thmanyah');
  expect(metrics.direction, label).toBe('rtl');
  expect(metrics.layoutMode, label).toBe('portrait-stack');
  expect(metrics.scrollable, label).toBe('false');
  expect(metrics.touchMin, label).toBeGreaterThanOrEqual(48);
  expect(metrics.left, label).toBeGreaterThanOrEqual(0);
  expect(metrics.top, label).toBeGreaterThanOrEqual(0);
  expect(metrics.right, label).toBeLessThanOrEqual(1);
  expect(metrics.bottom, label).toBeLessThanOrEqual(1);
  expect(metrics.right - metrics.left, label).toBeGreaterThan(0.55);
  expect(metrics.bottom - metrics.top, label).toBeGreaterThan(0.12);
}

for (const viewport of [
  { name: 'iPhone SE portrait', width: 320, height: 568 },
  { name: 'modern iPhone portrait', width: 390, height: 844 },
]) {
  test(`Custom setup stays readable and cannot enter an impossible seat state on ${viewport.name}`, async ({ page }) => {
    test.setTimeout(90000);
    const failures = watchFailures(page);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
    await waitForSetup(page);

    await page.evaluate(() => window.yakolakTestSetupFlowAction('new'));
    await waitForStage(page, 'count');
    await assertReadablePortrait(page, `${viewport.name}:count`);

    await page.evaluate(() => window.yakolakTestSetupFlowAction('count', 4));
    await waitForStage(page, 'mode:1');
    await page.evaluate(() => window.yakolakTestSetupFlowAction('custom'));
    await waitForStage(page, 'mode:1');
    await assertReadablePortrait(page, `${viewport.name}:custom-p2`);

    // Online is deliberately not a Custom seat type. Even a direct test-hook
    // attempt must leave the visible state unchanged instead of creating a
    // selection the canonical room model cannot represent.
    await page.evaluate(() => window.yakolakTestSetupFlowAction('mode', 1, 'online'));
    await page.waitForTimeout(120);
    expect(await page.evaluate(() => document.body.dataset.yakolakSetupFlowStage), `${viewport.name}:blocked-online-p2`).toBe('mode:1');

    await page.evaluate(() => window.yakolakTestSetupFlowAction('mode', 1, 'local'));
    await waitForStage(page, 'mode:2');
    await assertReadablePortrait(page, `${viewport.name}:custom-p3`);
    await page.evaluate(() => window.yakolakTestSetupFlowAction('mode', 2, 'bot'));
    await waitForStage(page, 'mode:3');
    await assertReadablePortrait(page, `${viewport.name}:custom-p4`);

    await page.evaluate(() => window.yakolakTestSetupFlowAction('mode', 3, 'online'));
    await page.waitForTimeout(120);
    expect(await page.evaluate(() => document.body.dataset.yakolakSetupFlowStage), `${viewport.name}:blocked-online-p4`).toBe('mode:3');

    await page.evaluate(() => window.yakolakTestSetupFlowAction('mode', 3, 'local'));
    await waitForStage(page, 'rounds');
    await assertReadablePortrait(page, `${viewport.name}:rounds`);

    expect(failures).toEqual([]);
  });
}
