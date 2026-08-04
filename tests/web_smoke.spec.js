const { test, expect } = require('@playwright/test');

test.use({
  viewport: { width: 1280, height: 720 },
  launchOptions: {
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
  }
});

test('Godot starts and confirms YAKOLAK 2.2 UI', async ({ page }) => {
  test.setTimeout(120000);
  const failures = [];
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request => failures.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('console', message => {
    console.log(`[browser:${message.type()}] ${message.text()}`);
    if (message.type() === 'error' && !message.text().includes('favicon')) failures.push(`console: ${message.text()}`);
  });

  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.state === 'ready', null, { timeout: 90000 });
  await expect(page.locator('body')).toHaveAttribute('data-version', '2.2.0');
  await expect(page.locator('#game')).toBeVisible();
  await page.screenshot({ path: 'web-smoke-2.2.png', fullPage: true });
  expect(failures).toEqual([]);
});
