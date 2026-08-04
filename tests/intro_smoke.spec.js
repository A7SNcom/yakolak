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

test('approved-asset intro loads and completes naturally in Chromium', async ({ page }) => {
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
    () => document.body.dataset.yakolakIntro === 'complete',
    null,
    { timeout: 60000 }
  );

  expect(await page.evaluate(() => document.body.dataset.yakolakFallback || '')).toBe('');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeGreaterThan(900);
  expect(box.height).toBeGreaterThan(500);
  await page.screenshot({ path: 'yakolak-intro-2.3.png', fullPage: true });
  expect(failures).toEqual([]);
});
