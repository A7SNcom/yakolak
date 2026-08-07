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

test('setup stays hidden through closed-box handoff and opens only after unboxing', async ({ page }) => {
  test.setTimeout(180000);
  const failures = [];
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request => failures.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`));
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
          document.body.dataset.yakolakSetupGate === 'open',
    null,
    { timeout: 90000 }
  );

  const metrics = await page.evaluate(() => ({
    width: Number(document.body.dataset.yakolakSetupPolishedWidth || 0),
    height: Number(document.body.dataset.yakolakSetupPolishedHeight || 0),
    ui: document.body.dataset.yakolakSetupUi || ''
  }));
  expect(metrics.width).toBeGreaterThanOrEqual(350);
  expect(metrics.width).toBeLessThanOrEqual(500);
  expect(metrics.height).toBeGreaterThanOrEqual(280);
  expect(metrics.ui).toBe('setup-guard-polish-v1');
  expect(failures).toEqual([]);
});
