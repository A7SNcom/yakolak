import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  launchOptions: {
    args: [
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
      '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'
    ]
  }
});

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

async function snapshot(page) {
  return page.evaluate(() => ({
    intro: document.body.dataset.yakolakIntro || '',
    setup: document.body.dataset.yakolakSetup || '',
    flow: document.body.dataset.yakolakSetupFlowStage || '',
    state: document.body.dataset.yakolakOnlineUiState || '',
    action: document.body.dataset.yakolakOnlineUiAction || '',
    message: document.body.dataset.yakolakOnlineUiMessage || '',
    surface: document.body.dataset.yakolakOnlineUiSurface || '',
    trace: document.body.dataset.yakolakOnlineUiTrace || '',
    gameplay: document.body.dataset.yakolakGameplay || '',
    currentPlayer: document.body.dataset.yakolakCurrentPlayer || '',
    saved: sessionStorage.getItem('yakolak-online:61') || '',
  }));
}

test('saved room restore is visibly explained while GET is pending', async ({ page }) => {
  test.setTimeout(90000);
  const restoreGate = deferred();
  let getRequests = 0;

  await page.addInitScript(() => {
    sessionStorage.setItem('yakolak-online:61', JSON.stringify({
      token: 'a'.repeat(64), seat: 'p1', code: '61'
    }));
  });

  await page.route('**/api/rooms**', async route => {
    if (route.request().method() === 'GET') {
      getRequests += 1;
      await restoreGate.promise;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          seat: 'p1',
          room: {
            code: '61', version: 3, protocol: 5, status: 'playing',
            targetPlayers: 2, targetRounds: 3, winsToMatch: 3,
            players: [{ seat: 'p1', color: 'marble' }, { seat: 'p2', color: 'blue' }],
            turnIndex: 0,
            board: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i), {}])),
            round: 1, completedRounds: 0, scores: { p1: 0, p2: 0 },
            winner: null, draw: false, lastMove: null, moveNumber: 0,
            matchComplete: false, matchWinner: null, matchWinners: [],
            rematch: { p1: false, p2: false }
          }
        })
      });
    }
    return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'invalid_action' }) });
  });

  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1&room=61', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.yakolakIntro === 'complete', null, { timeout: 60000 });
  await page.waitForTimeout(1200);

  const pending = await snapshot(page);
  expect(pending.saved, `saved identity missing: ${JSON.stringify(pending)}`).not.toBe('');
  expect(getRequests, `restore GET was never issued: ${JSON.stringify(pending)}`).toBeGreaterThan(0);
  expect(pending, `restore is active but UI is ambiguous: ${JSON.stringify(pending)}`).toMatchObject({
    state: 'restoring-room',
    surface: 'gameplay',
    action: 'exit',
  });
  expect(pending.message).toContain('نستعيد الغرفة');

  restoreGate.resolve();
  await page.waitForFunction(() => document.body.dataset.yakolakCurrentPlayer === 'right', null, { timeout: 20000 });
});
