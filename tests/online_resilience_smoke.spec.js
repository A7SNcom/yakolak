import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },
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

function emptyBoard() {
  return Object.fromEntries(Array.from({ length: 9 }, (_, index) => [String(index), {}]));
}

function baseRoom(code) {
  return {
    code,
    version: 2,
    protocol: 4,
    status: 'playing',
    targetPlayers: 2,
    targetRounds: 3,
    players: [
      { seat: 'p1', color: 'marble' },
      { seat: 'p2', color: 'blue' }
    ],
    turnIndex: 0,
    board: emptyBoard(),
    round: 1,
    completedRounds: 0,
    scores: { p1: 0, p2: 0 },
    winner: null,
    draw: false,
    lastMove: null,
    moveNumber: 0,
    matchComplete: false,
    matchWinner: null,
    matchWinners: [],
    rematch: { p1: false, p2: false }
  };
}

test('online move is queued behind polling, survives a network failure, and restores after reload', async ({ page }) => {
  test.setTimeout(150000);

  const code = 'ABC234';
  const token = 'abcdefghijklmnopqrstuvwxyzABCDEFGH1234567890_-';
  let room = baseRoom(code);
  let pollCount = 0;
  let movePosts = 0;
  let firstPollStartedResolve;
  let releaseFirstPollResolve;
  const firstPollStarted = new Promise(resolve => { firstPollStartedResolve = resolve; });
  const releaseFirstPoll = new Promise(resolve => { releaseFirstPollResolve = resolve; });

  await page.route('**/api/rooms**', async route => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());

    if (method === 'GET') {
      pollCount += 1;
      const since = Number(url.searchParams.get('since') || 0);
      if (pollCount === 1) {
        firstPollStartedResolve();
        await releaseFirstPoll;
        await route.fulfill({ status: 204, body: '' });
        return;
      }
      if (since !== room.version) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, seat: 'p1', room })
        });
        return;
      }
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    const body = JSON.parse(request.postData() || '{}');
    if (body.action === 'create') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, token, seat: 'p1', room })
      });
      return;
    }

    if (body.action === 'move') {
      movePosts += 1;
      if (movePosts === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'online_server_error' })
        });
        return;
      }
      const cell = Number(body.cell);
      const size = String(body.size);
      room = structuredClone(room);
      room.version += 1;
      room.board[String(cell)][size] = 'marble';
      room.lastMove = { cell, size, color: 'marble', seat: 'p1' };
      room.moveNumber += 1;
      room.turnIndex = 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, seat: 'p1', room })
      });
      return;
    }

    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'invalid_action' })
    });
  });

  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          typeof window.yakolakTestStartOnline === 'function' &&
          typeof window.yakolakTestPlayOneMove === 'function',
    null,
    { timeout: 60000 }
  );

  await page.evaluate(() => window.yakolakTestStartOnline());
  await firstPollStarted;
  await page.waitForFunction(
    () => document.body.dataset.yakolakCurrentPlayer === 'right' &&
          document.body.dataset.yakolakGameplay === 'ready',
    null,
    { timeout: 15000 }
  );

  // The poll is intentionally held open. The move must be queued, not dropped.
  await page.evaluate(() => window.yakolakTestPlayOneMove());
  await page.waitForTimeout(250);
  expect(movePosts).toBe(0);
  releaseFirstPollResolve();

  // First mutation gets a synthetic 503. The client must reconcile and retry
  // without returning to setup or losing the match.
  await page.waitForFunction(
    () => Number(document.body.dataset.yakolakMoves || 0) >= 1 &&
          document.body.dataset.yakolakCurrentPlayer === 'back' &&
          document.body.dataset.yakolakGameplay === 'waiting',
    null,
    { timeout: 20000 }
  );
  expect(movePosts).toBe(2);
  expect(pollCount).toBeGreaterThanOrEqual(2);

  const saved = await page.evaluate(codeValue => localStorage.getItem(`yakolak-online:${codeValue}`), code);
  expect(saved).toContain('p1');
  expect(saved).toContain(token);

  // A browser refresh must restore the same identity and the authoritative
  // post-move turn. That turn can only be "back" after the saved move was
  // accepted, so it also proves the refreshed client consumed the new room.
  await page.goto(`http://127.0.0.1:8000/?room=${code}&yakolakTestFast=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakCurrentPlayer === 'back' &&
          Number(document.body.dataset.yakolakPlayers || 0) === 2,
    null,
    { timeout: 60000 }
  );

  const statusVisible = await page.evaluate(() => {
    const element = document.getElementById('yakolak-online-status');
    return Boolean(element && getComputedStyle(element).display !== 'none');
  });
  expect(statusVisible).toBe(false);
  expect(movePosts).toBe(2);
});
