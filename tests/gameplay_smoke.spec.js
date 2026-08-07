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
          document.body.dataset.yakolakSetup === 'visible' &&
          typeof window.yakolakTestStartLocal === 'function' &&
          typeof window.yakolakTestShowSetup === 'function',
    null,
    { timeout: 150000 }
  );
  await page.evaluate(() => window.yakolakTestShowSetup());
  await page.waitForFunction(
    () => document.body.dataset.yakolakArabicFont === 'ready' &&
          Number(document.body.dataset.yakolakSetupCardWidth) > 0,
    null,
    { timeout: 10000 }
  );
  // Safari's browser chrome can reduce the live canvas substantially.  This
  // is the exact failure mode the setup must survive, not just a tall desktop
  // emulation viewport.
  await page.setViewportSize({ width: 393, height: 555 });
  await page.waitForFunction(
    () => Number(document.body.dataset.yakolakSetupCardWidth) >= window.innerWidth - 36 &&
          Number(document.body.dataset.yakolakSetupCardHeight) >= window.innerHeight - 40 &&
          Number(document.body.dataset.yakolakSetupTextPx) >= 16 &&
          document.body.dataset.yakolakArabicFont === 'ready',
    null,
    { timeout: 10000 }
  );
  await page.screenshot({ path: 'web/setup-ios-short-viewport.png', fullPage: false, timeout: 60000 });
  await page.evaluate(() => window.yakolakTestStartLocal());
  await page.waitForFunction(
    () => document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakMatchState === 'turn' &&
          document.body.dataset.yakolakCurrentPlayer === 'right' &&
          document.body.dataset.yakolakTestPieceX &&
          document.body.dataset.yakolakTestCellX,
    null,
    { timeout: 10000 }
  );

  expect(await page.evaluate(() => document.body.dataset.yakolakTable)).toBe('approved-star-svg');
  expect(await page.evaluate(() => document.body.dataset.yakolakCamera)).toBe('level-centered');
  expect(await page.evaluate(() => document.body.dataset.yakolakMoves)).toBe('0');

  const targets = await page.evaluate(() => {
    // Godot renders through the 720x1280 virtual viewport with stretch/aspect=expand.
    // Convert its projected coordinates back into CSS canvas pixels.
    const scale = Math.min(window.innerWidth / 720, window.innerHeight / 1280);
    return {
      pieceX: Number(document.body.dataset.yakolakTestPieceX) * scale,
      pieceY: Number(document.body.dataset.yakolakTestPieceY) * scale,
      cellX: Number(document.body.dataset.yakolakTestCellX) * scale,
      cellY: Number(document.body.dataset.yakolakTestCellY) * scale,
      pieceName: document.body.dataset.yakolakTestPiece,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    };
  });

  expect(targets.pieceX).toBeGreaterThan(0);
  expect(targets.pieceX).toBeLessThan(targets.viewportWidth);
  expect(targets.pieceY).toBeGreaterThan(0);
  expect(targets.pieceY).toBeLessThan(targets.viewportHeight);
  expect(targets.cellX).toBeGreaterThan(0);
  expect(targets.cellX).toBeLessThan(targets.viewportWidth);
  expect(targets.cellY).toBeGreaterThan(0);
  expect(targets.cellY).toBeLessThan(targets.viewportHeight);

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
    () => document.body.dataset.yakolakMoves === '1',
    null,
    { timeout: 10000 }
  );

  expect(await page.evaluate(() => document.body.dataset.yakolakLastCell)).toBe('4');
  expect(await page.evaluate(() => document.body.dataset.yakolakLastSize)).toBe('large');
  expect(await page.evaluate(() => document.body.dataset.yakolakLastSide)).toBe('right');
  expect(await page.evaluate(() => document.body.dataset.yakolakSelected)).toBe('');
  await page.screenshot({ path: 'web/gameplay-mobile-placed.png', fullPage: false, timeout: 60000 });

  const joined = gameplayLogs.join('\n');
  expect(joined).toContain('YAKOLAK_MATCH_READY players=2 rounds=3');
  expect(joined).toContain('YAKOLAK_PIECE_SELECTED');
  expect(joined).toContain('YAKOLAK_MOVE_STARTED cell=4 size=large');
  expect(joined).toContain('YAKOLAK_MOVE_COMPLETE move=1 cell=4 size=large dir=right');
  expect(failures).toEqual([]);
});
