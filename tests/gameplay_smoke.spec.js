const { test, expect } = require('@playwright/test');

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
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

test('a physical stone can be selected and played after the approved intro', async ({ page }) => {
  test.setTimeout(180000);
  const failures = [];
  const gameplayLogs = [];

  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request => failures.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('console', message => {
    const text = message.text();
    console.log(`[browser:${message.type()}] ${text}`);
    if (text.includes('YAKOLAK_')) gameplayLogs.push(text);
    if (message.type() === 'error' && !text.includes('favicon')) failures.push(`console: ${text}`);
  });

  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakTestPieceX &&
          document.body.dataset.yakolakTestCellX,
    null,
    { timeout: 70000 }
  );

  expect(await page.evaluate(() => document.body.dataset.yakolakTable)).toBe('approved-star-svg');
  expect(await page.evaluate(() => document.body.dataset.yakolakCamera)).toBe('level-centered');
  expect(await page.evaluate(() => document.body.dataset.yakolakMoves)).toBe('0');

  const targets = await page.evaluate(() => ({
    pieceX: Number(document.body.dataset.yakolakTestPieceX),
    pieceY: Number(document.body.dataset.yakolakTestPieceY),
    cellX: Number(document.body.dataset.yakolakTestCellX),
    cellY: Number(document.body.dataset.yakolakTestCellY),
    pieceName: document.body.dataset.yakolakTestPiece
  }));

  expect(targets.pieceX).toBeGreaterThan(0);
  expect(targets.pieceX).toBeLessThan(390);
  expect(targets.pieceY).toBeGreaterThan(0);
  expect(targets.pieceY).toBeLessThan(844);
  expect(targets.cellX).toBeGreaterThan(0);
  expect(targets.cellX).toBeLessThan(390);
  expect(targets.cellY).toBeGreaterThan(0);
  expect(targets.cellY).toBeLessThan(844);

  await page.touchscreen.tap(targets.pieceX, targets.pieceY);
  await page.waitForFunction(
    () => document.body.dataset.yakolakGameplay === 'piece-selected',
    null,
    { timeout: 5000 }
  );
  expect(await page.evaluate(() => document.body.dataset.yakolakSelected)).toBe(targets.pieceName);
  expect(await page.evaluate(() => document.body.dataset.yakolakSelectedSize)).toBe('large');
  await page.screenshot({ path: 'web/gameplay-mobile-selected.png', fullPage: false, timeout: 60000 });

  await page.touchscreen.tap(targets.cellX, targets.cellY);
  await page.waitForFunction(
    () => document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakMoves === '1',
    null,
    { timeout: 10000 }
  );

  expect(await page.evaluate(() => document.body.dataset.yakolakLastCell)).toBe('4');
  expect(await page.evaluate(() => document.body.dataset.yakolakLastSize)).toBe('large');
  expect(await page.evaluate(() => document.body.dataset.yakolakLastSide)).toBe('right');
  expect(await page.evaluate(() => document.body.dataset.yakolakSelected)).toBe('');
  await page.screenshot({ path: 'web/gameplay-mobile-placed.png', fullPage: false, timeout: 60000 });

  const joined = gameplayLogs.join('\n');
  expect(joined).toContain('YAKOLAK_GAMEPLAY_READY selectable=36 cells=9');
  expect(joined).toContain('YAKOLAK_PIECE_SELECTED');
  expect(joined).toContain('YAKOLAK_MOVE_STARTED cell=4 size=large');
  expect(joined).toContain('YAKOLAK_MOVE_COMPLETE move=1 cell=4 size=large dir=right');
  expect(failures).toEqual([]);
});
