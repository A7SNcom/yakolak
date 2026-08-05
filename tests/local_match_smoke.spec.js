const { test, expect } = require('@playwright/test');

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  launchOptions: {
    args: [
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
      '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'
    ]
  }
});

const cap = value => value[0].toUpperCase() + value.slice(1);

async function playMove(page, size, cell, expectedMoves, expectedNextPlayer) {
  await page.waitForFunction(
    ({ sizeName }) => document.body.dataset.yakolakGameplay === 'ready' &&
      document.body.dataset.yakolakMatchState === 'turn' &&
      document.body.dataset[`yakolakTest${sizeName}X`] &&
      document.body.dataset[`yakolakTestCell${cell}X`],
    { sizeName: cap(size), cell },
    { timeout: 10000 }
  );

  const points = await page.evaluate(({ sizeName, cell }) => {
    const scale = Math.min(window.innerWidth / 720, window.innerHeight / 1280);
    return {
      pieceX: Number(document.body.dataset[`yakolakTest${sizeName}X`]) * scale,
      pieceY: Number(document.body.dataset[`yakolakTest${sizeName}Y`]) * scale,
      cellX: Number(document.body.dataset[`yakolakTestCell${cell}X`]) * scale,
      cellY: Number(document.body.dataset[`yakolakTestCell${cell}Y`]) * scale
    };
  }, { sizeName: cap(size), cell });

  await page.touchscreen.tap(points.pieceX, points.pieceY);
  await page.waitForFunction(() => document.body.dataset.yakolakGameplay === 'piece-selected', null, { timeout: 5000 });
  await page.touchscreen.tap(points.cellX, points.cellY);

  if (expectedNextPlayer) {
    await page.waitForFunction(
      ({ moves, player }) => document.body.dataset.yakolakMoves === String(moves) &&
        document.body.dataset.yakolakCurrentPlayer === player &&
        document.body.dataset.yakolakMatchState === 'turn',
      { moves: expectedMoves, player: expectedNextPlayer },
      { timeout: 10000 }
    );
  } else {
    await page.waitForFunction(
      moves => document.body.dataset.yakolakMoves === String(moves) &&
        document.body.dataset.yakolakMatchState === 'round-complete',
      expectedMoves,
      { timeout: 10000 }
    );
  }
}

test('four local turns, official win detection, scoring, and next-round reset work', async ({ page }) => {
  test.setTimeout(180000);
  const failures = [];
  const logs = [];
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request => failures.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('console', message => {
    const text = message.text();
    if (text.includes('YAKOLAK_')) logs.push(text);
    if (message.type() === 'error' && !text.includes('favicon')) failures.push(`console: ${text}`);
  });

  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
      document.body.dataset.yakolakGameplay === 'ready' &&
      document.body.dataset.yakolakCurrentPlayer === 'right' &&
      document.body.dataset.yakolakRound === '1',
    null,
    { timeout: 70000 }
  );

  await playMove(page, 'large', 0, 1, 'back');
  await playMove(page, 'medium', 3, 2, 'left');
  await playMove(page, 'small', 4, 3, 'front');
  await playMove(page, 'medium', 5, 4, 'right');
  await playMove(page, 'large', 1, 5, 'back');
  await playMove(page, 'small', 6, 6, 'left');
  await playMove(page, 'medium', 7, 7, 'front');
  await playMove(page, 'small', 8, 8, 'right');
  await playMove(page, 'large', 2, 9, null);

  expect(await page.evaluate(() => document.body.dataset.yakolakWinner)).toBe('right');
  expect(await page.evaluate(() => document.body.dataset.yakolakScoreRight)).toBe('1');
  expect(await page.evaluate(() => document.body.dataset.yakolakMatchComplete)).toBe('false');
  await page.screenshot({ path: 'web/local-match-round-win.png', fullPage: false, timeout: 60000 });

  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => document.body.dataset.yakolakRound === '2' &&
      document.body.dataset.yakolakMoves === '0' &&
      document.body.dataset.yakolakCurrentPlayer === 'back' &&
      document.body.dataset.yakolakScoreRight === '1' &&
      document.body.dataset.yakolakMatchState === 'turn',
    null,
    { timeout: 10000 }
  );

  const joined = logs.join('\n');
  expect(joined).toContain('YAKOLAK_MATCH_READY players=4 rounds=3 timer=18000');
  expect(joined).toContain('YAKOLAK_ROUND_COMPLETE round=1 winner=right');
  expect(joined).toContain('YAKOLAK_ROUND_RESET round=2 starter=back');
  expect(failures).toEqual([]);
});
