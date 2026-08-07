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

test('next-round tap cannot restart the intro or lose the board', async ({ page }) => {
  test.setTimeout(240000);
  const failures = [];
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    const text = message.text();
    console.log(`[browser:${message.type()}] ${text}`);
    if (message.type() === 'error' && !text.includes('favicon')) failures.push(`console: ${text}`);
  });

  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakSetup === 'visible' &&
          typeof window.yakolakTestStartPassPlay === 'function' &&
          typeof window.yakolakTestForceRoundComplete === 'function',
    null,
    { timeout: 170000 }
  );

  await page.setViewportSize({ width: 393, height: 555 });
  await page.evaluate(() => window.yakolakTestStartPassPlay());
  await page.waitForFunction(
    () => document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakMatchState === 'turn' &&
          document.body.dataset.yakolakRound === '1' &&
          document.body.dataset.yakolakIntroReplay === 'locked',
    null,
    { timeout: 15000 }
  );

  await page.evaluate(() => window.yakolakTestForceRoundComplete());
  await page.waitForFunction(
    () => document.body.dataset.yakolakMatchState === 'round-complete' &&
          document.body.dataset.yakolakRoundButtonX &&
          document.body.dataset.yakolakRoundButtonY,
    null,
    { timeout: 5000 }
  );

  const button = await page.evaluate(() => {
    const scale = Math.min(window.innerWidth / 720, window.innerHeight / 1280);
    return {
      x: Number(document.body.dataset.yakolakRoundButtonX) * scale,
      y: Number(document.body.dataset.yakolakRoundButtonY) * scale
    };
  });
  await page.touchscreen.tap(button.x, button.y);

  await page.waitForFunction(
    () => document.body.dataset.yakolakRound === '2' &&
          document.body.dataset.yakolakMatchState === 'turn' &&
          document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakCurrentPlayer === 'back' &&
          document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakIntroReplay === 'locked',
    null,
    { timeout: 15000 }
  );

  expect(failures).toEqual([]);
  console.log('YAKOLAK_ROUND_2_OK intro-stays-complete board-ready');
});
