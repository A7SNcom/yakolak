const { test, expect } = require('@playwright/test');

test.use({
  viewport: { width: 1440, height: 900 },
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

test('authoritative four-base layout renders in Chromium', async ({ page }) => {
  test.setTimeout(90000);
  const failures = [];

  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request => failures.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('console', message => {
    console.log(`[browser:${message.type()}] ${message.text()}`);
    if (message.type() === 'error' && !message.text().includes('favicon')) {
      failures.push(`console: ${message.text()}`);
    }
  });

  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakLayout === 'ready',
    null,
    { timeout: 60000 }
  );

  expect(await page.evaluate(() => document.body.dataset.yakolakBases)).toBe('4');
  expect(await page.evaluate(() => document.body.dataset.yakolakPieces)).toBe('36');
  await expect(page.locator('canvas')).toBeVisible();
  await page.screenshot({ path: 'web/layout-audit.png', fullPage: true });
  expect(failures).toEqual([]);
});
