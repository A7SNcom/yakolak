import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },
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

async function expectCanvasToFillViewport(page, expectedWidth, expectedHeight) {
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs(box.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.width - expectedWidth)).toBeLessThanOrEqual(2);
  expect(Math.abs(box.height - expectedHeight)).toBeLessThanOrEqual(2);
}

test('authoritative canvas fills portrait landscape and wide Chromium viewports', async ({ page }) => {
  test.setTimeout(120000);
  const failures = [];

  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request => failures.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('console', message => {
    console.log(`[browser:${message.type()}] ${message.text()}`);
    if (message.type() === 'error' && !message.text().includes('favicon')) {
      failures.push(`console: ${message.text()}`);
    }
  });

  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => ['playing', 'complete'].includes(document.body.dataset.yakolakIntro),
    null,
    { timeout: 60000 }
  );

  await expectCanvasToFillViewport(page, 390, 844);

  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(500);
  await expectCanvasToFillViewport(page, 844, 390);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);
  await expectCanvasToFillViewport(page, 1440, 900);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(500);
  await expectCanvasToFillViewport(page, 1920, 1080);

  expect(failures).toEqual([]);
});