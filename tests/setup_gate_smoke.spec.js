import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 393, height: 852 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 3,
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

function recordRequestFailure(failures, request) {
  const url = request.url();
  const errorText = request.failure()?.errorText || '';
  if (errorText === 'net::ERR_ABORTED' && (url.endsWith('/api/telemetry') || url.endsWith('/index.wasm') || url.endsWith('/index.pck'))) return;
  failures.push(`requestfailed: ${url} ${errorText}`);
}

test('setup stays hidden through closed-box handoff and opens only after unboxing', async ({ page }) => {
  test.setTimeout(180000);
  const failures = [];
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request => recordRequestFailure(failures, request));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('favicon')) failures.push(`console: ${message.text()}`);
  });

  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'domcontentloaded' });

  await page.waitForFunction(
    () => document.body.dataset.yakolakPreIntro === 'box-closed-descending',
    null,
    { timeout: 90000 }
  );
  expect(await page.evaluate(() => document.body.dataset.yakolakSetup)).not.toBe('visible');

  await page.waitForFunction(
    () => document.body.dataset.yakolakPreIntro === 'complete' && document.body.dataset.yakolakIntro === 'playing',
    null,
    { timeout: 30000 }
  );
  expect(await page.evaluate(() => document.body.dataset.yakolakSetup)).not.toBe('visible');

  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakSetup === 'visible' &&
          document.body.dataset.yakolakSetupGate === 'open' &&
          document.body.dataset.yakolakSetupDirection === 'rtl' &&
          document.body.dataset.yakolakSetupMotion === 'soft-panel-and-table-v3',
    null,
    { timeout: 90000 }
  );
  await page.waitForTimeout(850);

  const metrics = await page.evaluate(() => ({
    left: Number(document.body.dataset.yakolakSetupCardLeftRatio),
    top: Number(document.body.dataset.yakolakSetupCardTopRatio),
    right: Number(document.body.dataset.yakolakSetupCardRightRatio),
    bottom: Number(document.body.dataset.yakolakSetupCardBottomRatio),
    touch: Number(document.body.dataset.yakolakSetupTouchMin),
    layout: document.body.dataset.yakolakSetupLayoutMode || '',
    direction: document.body.dataset.yakolakSetupDirection || '',
    motion: document.body.dataset.yakolakSetupMotion || ''
  }));

  expect(metrics.left).toBeGreaterThanOrEqual(0);
  expect(metrics.top).toBeGreaterThanOrEqual(0);
  expect(metrics.right).toBeLessThanOrEqual(1);
  expect(metrics.bottom).toBeLessThanOrEqual(1);
  expect(metrics.right - metrics.left).toBeGreaterThan(0.2);
  expect(metrics.bottom - metrics.top).toBeGreaterThan(0.1);
  expect(metrics.touch).toBeGreaterThanOrEqual(48);
  expect(metrics.layout).toBe('portrait-stack');
  expect(metrics.direction).toBe('rtl');
  expect(metrics.motion).toBe('soft-panel-and-table-v3');
  expect(failures).toEqual([]);
});