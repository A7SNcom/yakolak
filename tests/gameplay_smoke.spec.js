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

async function currentTargets(page) {
  return page.evaluate(() => {
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
}

function expectTargetVisible(targets) {
  expect(targets.pieceX).toBeGreaterThan(0);
  expect(targets.pieceX).toBeLessThan(targets.viewportWidth);
  expect(targets.pieceY).toBeGreaterThan(0);
  expect(targets.pieceY).toBeLessThan(targets.viewportHeight);
  expect(targets.cellX).toBeGreaterThan(0);
  expect(targets.cellX).toBeLessThan(targets.viewportWidth);
  expect(targets.cellY).toBeGreaterThan(0);
  expect(targets.cellY).toBeLessThan(targets.viewportHeight);
}

test('two local players keep the board and their stones visible across turns on mobile', async ({ page }) => {
  test.setTimeout(240000);
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
          typeof window.yakolakTestStartPassPlay === 'function',
    null,
    { timeout: 150000 }
  );

  // Reproduce a short mobile browser viewport where the old fixed 50° turn
  // camera pushed the next player's side outside the visible canvas.
  await page.setViewportSize({ width: 393, height: 555 });
  await page.evaluate(() => window.yakolakTestStartPassPlay());
  await page.waitForFunction(
    () => document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakMatchState === 'turn' &&
          document.body.dataset.yakolakCurrentPlayer === 'right' &&
          document.body.dataset.yakolakTurnCamera === 'right' &&
          document.body.dataset.yakolakTestPieceX &&
          document.body.dataset.yakolakTestCellX,
    null,
    { timeout: 15000 }
  );

  expect(await page.evaluate(() => document.body.dataset.yakolakPlayers)).toBe('2');
  expect(Number(await page.evaluate(() => document.body.dataset.yakolakTurnFov))).toBeGreaterThan(60);

  const first = await currentTargets(page);
  expectTargetVisible(first);
  expect(first.pieceName).toContain('Stone_right_');

  await page.touchscreen.tap(first.pieceX, first.pieceY);
  await page.waitForFunction(() => document.body.dataset.yakolakGameplay === 'piece-selected', null, { timeout: 5000 });
  await page.touchscreen.tap(first.cellX, first.cellY);
  await page.waitForFunction(
    () => Number(document.body.dataset.yakolakMoves || 0) >= 1 &&
          document.body.dataset.yakolakCurrentPlayer === 'back' &&
          document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakTurnCamera === 'back',
    null,
    { timeout: 15000 }
  );

  const second = await currentTargets(page);
  expectTargetVisible(second);
  expect(second.pieceName).toContain('Stone_back_');
  await page.screenshot({ path: 'web/gameplay-mobile-selected.png', fullPage: false, timeout: 60000 });

  await page.touchscreen.tap(second.pieceX, second.pieceY);
  await page.waitForFunction(
    () => document.body.dataset.yakolakGameplay === 'piece-selected' &&
          String(document.body.dataset.yakolakSelected || '').includes('Stone_back_'),
    null,
    { timeout: 5000 }
  );
  await page.touchscreen.tap(second.cellX, second.cellY);
  await page.waitForFunction(
    () => Number(document.body.dataset.yakolakMoves || 0) >= 2 &&
          document.body.dataset.yakolakCurrentPlayer === 'right' &&
          document.body.dataset.yakolakGameplay === 'ready',
    null,
    { timeout: 15000 }
  );
  await page.screenshot({ path: 'web/gameplay-mobile-placed.png', fullPage: false, timeout: 60000 });

  const joined = gameplayLogs.join('\n');
  expect(joined).toContain('YAKOLAK_MATCH_READY players=2 rounds=3');
  expect(joined).toContain('YAKOLAK_MOVE_COMPLETE move=1');
  expect(joined).toContain('YAKOLAK_MOVE_COMPLETE move=2');
  expect(failures).toEqual([]);
});
