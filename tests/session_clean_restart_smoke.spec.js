import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 393, height: 852 },
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

test('a new game starts from a physically clean board after abandoning a played game', async ({ page }) => {
  test.setTimeout(130000);
  const failures = [];
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    const text = message.text();
    if (message.type() === 'error' && !text.includes('favicon')) failures.push(`console: ${text}`);
  });

  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakSetup === 'visible' &&
          typeof window.yakolakTestStartPassPlay === 'function' &&
          typeof window.yakolakTestPlayOneMove === 'function' &&
          typeof window.yakolakTestReturnToSetup === 'function',
    null,
    { timeout: 60000 }
  );

  await page.evaluate(() => window.yakolakTestStartPassPlay());
  await page.waitForFunction(
    () => document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakCurrentPlayer === 'right',
    null,
    { timeout: 15000 }
  );

  await page.evaluate(() => window.yakolakTestPlayOneMove());
  await page.waitForFunction(
    () => Number(document.body.dataset.yakolakMoves || 0) >= 1 &&
          document.body.dataset.yakolakCurrentPlayer === 'back',
    null,
    { timeout: 20000 }
  );

  await page.evaluate(() => window.yakolakTestReturnToSetup());
  await page.waitForFunction(
    () => document.body.dataset.yakolakSetup === 'visible' &&
          Number(document.body.dataset.yakolakResiduePlayed || -1) === 0 &&
          Number(document.body.dataset.yakolakResidueOccupied || -1) === 0 &&
          Number(document.body.dataset.yakolakResidueStray || -1) === 0,
    null,
    { timeout: 10000 }
  );

  // Start a second match in the same runtime. No reload is allowed here: this
  // is exactly where stale stones/tweens used to leak from the previous game.
  await page.evaluate(() => window.yakolakTestStartPassPlay());
  await page.waitForFunction(
    () => document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakCurrentPlayer === 'right' &&
          Number(document.body.dataset.yakolakMoves || -1) === 0 &&
          Number(document.body.dataset.yakolakResiduePlayed || -1) === 0 &&
          Number(document.body.dataset.yakolakResidueOccupied || -1) === 0 &&
          Number(document.body.dataset.yakolakResidueStray || -1) === 0,
    null,
    { timeout: 15000 }
  );

  await page.evaluate(() => window.yakolakTestPlayOneMove());
  await page.waitForFunction(
    () => Number(document.body.dataset.yakolakMoves || 0) === 1 &&
          document.body.dataset.yakolakCurrentPlayer === 'back',
    null,
    { timeout: 20000 }
  );

  expect(failures).toEqual([]);
  console.log('YAKOLAK_CLEAN_RESTART_OK played=0 occupied=0 stray=0 before-second-game');
});
