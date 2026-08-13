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

test('winner sees the result reason before requesting the next local round', async ({ page }) => {
  test.setTimeout(120000);
  const failures = [];
  const songRequests = [];
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('request', request => {
    if (request.url().includes('song.mp3')) songRequests.push(request.url());
  });
  page.on('console', message => {
    const text = message.text();
    console.log(`[browser:${message.type()}] ${text}`);
    if (message.type() === 'error' && !text.includes('favicon')) failures.push(`console: ${text}`);
  });

  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakSetup === 'visible' &&
          document.body.dataset.yakolakHudVisibility === 'hidden' &&
          document.body.dataset.yakolakClosedBoxSpawn === 'offscreen-top' &&
          typeof window.yakolakTestStartPassPlay === 'function' &&
          typeof window.yakolakTestForceRoundComplete === 'function',
    null,
    { timeout: 60000 }
  );

  expect(songRequests).toEqual([]);

  await page.setViewportSize({ width: 393, height: 555 });
  await page.evaluate(() => window.yakolakTestStartPassPlay());
  await page.waitForFunction(
    () => document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakMatchState === 'turn' &&
          document.body.dataset.yakolakRound === '1' &&
          document.body.dataset.yakolakIntroReplay === 'locked' &&
          document.body.dataset.yakolakMusic === 'playing' &&
          document.body.dataset.yakolakScoreHud === 'hidden' &&
          document.body.dataset.yakolakResultOverlay === 'hidden' &&
          document.body.dataset.yakolakScoreMarkerModel === 'legacy-p-stl' &&
          document.body.dataset.yakolakScoreMarkerPlacement === 'v092',
    null,
    { timeout: 15000 }
  );

  await page.evaluate(() => window.yakolakTestForceRoundComplete());
  await page.waitForFunction(
    () => document.body.dataset.yakolakMatchState === 'round-complete' &&
          document.body.dataset.yakolakResultOverlay === 'visible' &&

          document.body.dataset.yakolakScoreHud === 'hidden' &&
          document.body.dataset.yakolakScoreStars === '0' &&
          document.body.dataset.yakolakScoreMarkerSpawn === 'offscreen-top' &&
          document.body.dataset.yakolakScoreMarkerDropTiming === 'unchanged' &&
          Number(document.body.dataset.yakolakScoreMarkers || 0) === 1,
    null,
    { timeout: 5000 }
  );

  await page.locator('canvas').click({ position: { x: 196, y: 277 } });
  await page.waitForFunction(
    () => document.body.dataset.yakolakRound === '2' &&

          document.body.dataset.yakolakMatchState === 'turn' &&
          document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakCurrentPlayer === 'back' &&
          document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakIntroReplay === 'locked' &&
          document.body.dataset.yakolakMusic === 'playing' &&
          document.body.dataset.yakolakScoreStars === '0' &&
          document.body.dataset.yakolakScoreMarkerSpawn === 'offscreen-top' &&
          Number(document.body.dataset.yakolakScoreMarkers || 0) === 1,
    null,
    { timeout: 15000 }
  );

  expect(songRequests).toEqual([]);
  expect(failures).toEqual([]);
  console.log('YAKOLAK_ROUND_RESULT_OK winner-reason-visible explicit-next-round staggered-reset board-ready');
});
