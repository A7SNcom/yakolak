const { test, expect } = require('@playwright/test');

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

async function expectCanvasToFillViewport(page, width, height) {
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs(box.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.width - width)).toBeLessThanOrEqual(2);
  expect(Math.abs(box.height - height)).toBeLessThanOrEqual(2);
}

test('accepted Three.js intro timeline runs completely in Godot', async ({ page }) => {
  // SwiftShader can take tens of seconds to encode screenshots of the original
  // high-polygon STL models. This timeout does not alter the 5730ms intro.
  test.setTimeout(300000);
  const failures = [];
  const introLogs = [];

  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request => failures.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('console', message => {
    const text = message.text();
    console.log(`[browser:${message.type()}] ${text}`);
    if (text.includes('YAKOLAK_INTRO_')) introLogs.push(text);
    if (message.type() === 'error' && !text.includes('favicon')) failures.push(`console: ${text}`);
  });

  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'playing',
    null,
    { timeout: 60000 }
  );
  await expectCanvasToFillViewport(page, 390, 844);

  // Capture the animation while the lid and bases are moving, not only the final frame.
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'web/intro-mobile-motion.png', fullPage: false, timeout: 120000 });

  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete',
    null,
    { timeout: 15000 }
  );
  await page.screenshot({ path: 'web/intro-mobile-final.png', fullPage: false, timeout: 120000 });

  expect(await page.evaluate(() => document.body.dataset.yakolakBases)).toBe('4');
  expect(await page.evaluate(() => document.body.dataset.yakolakPieces)).toBe('36');
  expect(await page.evaluate(() => document.body.dataset.yakolakBaseColor)).toBe('161616');
  expect(await page.evaluate(() => document.body.dataset.yakolakDuration)).toBe('5730');

  const joined = introLogs.join('\n');
  expect(joined).toContain('YAKOLAK_INTRO_PHASE lid-shaking');
  expect(joined).toContain('YAKOLAK_INTRO_PHASE lid-rising');
  expect(joined).toContain('YAKOLAK_INTRO_PHASE bases-deploying');
  expect(joined).toContain('YAKOLAK_INTRO_PHASE stones-moving');
  expect(joined).toContain('YAKOLAK_INTRO_COMPLETE');

  // The same scene must also fill a desktop viewport and replay on click.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);
  await expectCanvasToFillViewport(page, 1440, 900);
  await page.locator('canvas').click({ position: { x: 720, y: 450 } });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'playing',
    null,
    { timeout: 5000 }
  );
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'web/intro-desktop-motion.png', fullPage: false, timeout: 120000 });

  expect(failures).toEqual([]);
});
