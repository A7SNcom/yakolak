import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 393, height: 852 },
  hasTouch: true,
  isMobile: true,
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

test('intro naturally reaches setup and a real match', async ({ page }) => {
  test.setTimeout(420000);
  const fatal = [];
  page.on('pageerror', error => fatal.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    const text = message.text();
    console.log(`[browser:${message.type()}] ${text}`);
    if (message.type() === 'error' && !text.includes('favicon')) fatal.push(`console: ${text}`);
  });

  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'domcontentloaded' });

  await page.waitForFunction(
    () => typeof window.yakolakTestStartPassPlay === 'function' &&
          typeof window.yakolakTestShowSetup === 'function',
    null,
    { timeout: 30000 }
  );

  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakSetup === 'visible',
    null,
    { timeout: 330000 }
  );

  await page.evaluate(() => window.yakolakTestStartPassPlay());

  await page.waitForFunction(
    () => document.body.dataset.yakolakMatchState === 'turn' &&
          document.body.dataset.yakolakCurrentPlayer === 'right' &&
          document.body.dataset.yakolakPlayers === '2',
    null,
    { timeout: 30000 }
  );

  expect(fatal).toEqual([]);
  console.log('YAKOLAK_NATURAL_FLOW_OK intro>setup>match');
});

test('completed match rematches three times in one runtime with zero stale state', async ({ page }) => {
  test.setTimeout(180000);
  const fatal = [];
  page.on('pageerror', error => fatal.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    const text = message.text();
    console.log(`[browser:${message.type()}] ${text}`);
    if (message.type() === 'error' && !text.includes('favicon')) fatal.push(`console: ${text}`);
  });

  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakSetup === 'visible' &&
          typeof window.yakolakTestStartPassPlay === 'function' &&
          typeof window.yakolakTestPlayOneMove === 'function' &&
          typeof window.yakolakTestForceMatchComplete === 'function' &&
          typeof window.yakolakTestRematch === 'function',
    null,
    { timeout: 60000 }
  );

  await page.evaluate(() => {
    window.__yakolakRematchRuntimeToken = `runtime-${Date.now()}-${Math.random()}`;
    window.yakolakTestStartPassPlay();
  });

  const waitForCleanStart = async () => {
    await page.waitForFunction(
      () => document.body.dataset.yakolakGameplay === 'ready' &&
            document.body.dataset.yakolakMatchState === 'turn' &&
            document.body.dataset.yakolakCurrentPlayer === 'right' &&
            document.body.dataset.yakolakRound === '1' &&
            document.body.dataset.yakolakWinner === '' &&
            document.body.dataset.yakolakSelected === '' &&
            Number(document.body.dataset.yakolakMoves || -1) === 0 &&
            Number(document.body.dataset.yakolakScoreMarkers || -1) === 0 &&
            Number(document.body.dataset.yakolakResiduePlayed || -1) === 0 &&
            Number(document.body.dataset.yakolakResidueOccupied || -1) === 0 &&
            Number(document.body.dataset.yakolakResidueStray || -1) === 0,
      null,
      { timeout: 20000 }
    );
  };

  await waitForCleanStart();
  const runtimeToken = await page.evaluate(() => window.__yakolakRematchRuntimeToken);

  for (let cycle = 1; cycle <= 3; cycle += 1) {
    await page.evaluate(() => window.yakolakTestPlayOneMove());
    await page.waitForFunction(
      () => Number(document.body.dataset.yakolakMoves || 0) === 1 &&
            document.body.dataset.yakolakCurrentPlayer === 'back',
      null,
      { timeout: 20000 }
    );

    await page.evaluate(() => window.yakolakTestForceMatchComplete());
    await page.waitForFunction(
      () => document.body.dataset.yakolakMatchState === 'match-complete' &&
            document.body.dataset.yakolakWinner === 'back',
      null,
      { timeout: 10000 }
    );

    await page.evaluate(() => window.yakolakTestRematch());
    await waitForCleanStart();

    expect(await page.evaluate(() => window.__yakolakRematchRuntimeToken)).toBe(runtimeToken);
    expect(await page.evaluate(() => ({
      currentPlayer: document.body.dataset.yakolakCurrentPlayer,
      round: document.body.dataset.yakolakRound,
      winner: document.body.dataset.yakolakWinner,
      selected: document.body.dataset.yakolakSelected,
      moves: Number(document.body.dataset.yakolakMoves),
      scoreMarkers: Number(document.body.dataset.yakolakScoreMarkers),
      played: Number(document.body.dataset.yakolakResiduePlayed),
      occupied: Number(document.body.dataset.yakolakResidueOccupied),
      stray: Number(document.body.dataset.yakolakResidueStray)
    }))).toEqual({
      currentPlayer: 'right',
      round: '1',
      winner: '',
      selected: '',
      moves: 0,
      scoreMarkers: 0,
      played: 0,
      occupied: 0,
      stray: 0
    });
  }

  expect(fatal).toEqual([]);
  console.log('YAKOLAK_REMATCH_CLEAN_OK cycles=3 same-runtime winner=empty turn=right moves=0 scores=0 residue=0');
});
