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

function roomState() {
  return {
    code: '42', version: 2, protocol: 5, status: 'playing',
    targetPlayers: 2, targetRounds: 3,
    players: [{ seat: 'p1', color: 'marble' }, { seat: 'p2', color: 'blue' }],
    turnIndex: 0, board: emptyBoard(), round: 1, completedRounds: 0,
    scores: { p1: 0, p2: 0 }, winner: null, draw: false, lastMove: null,
    moveNumber: 0, matchComplete: false, matchWinner: null, matchWinners: [],
    rematch: { p1: false, p2: false }
  };
}

test('black-box telemetry records online traffic and sends trace ids without leaking secrets', async ({ page }) => {
  test.setTimeout(120000);
  const telemetryEvents = [];
  const roomRequests = [];
  const token = 'abcdefghijklmnopqrstuvwxyzABCDEFGH1234567890_-';
  let room = roomState();

  await page.route('**/api/telemetry', async route => {
    const body = JSON.parse(route.request().postData() || '{}');
    telemetryEvents.push(...(Array.isArray(body.events) ? body.events : []));
    await route.fulfill({ status: 204, body: '' });
  });

  await page.route('**/api/rooms-observed**', async route => {
    const request = route.request();
    const headers = request.headers();
    roomRequests.push({
      url: request.url(),
      trace: headers['x-yakolak-trace'] || '',
      requestId: headers['x-yakolak-request'] || '',
      body: request.postData() || ''
    });

    if (request.method() === 'GET') {
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
      room = structuredClone(room);
      room.version += 1;
      room.board[String(body.cell)][String(body.size)] = 'marble';
      room.lastMove = { seat: 'p1', color: 'marble', cell: Number(body.cell), size: String(body.size) };
      room.moveNumber = 1;
      room.turnIndex = 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, seat: 'p1', room })
      });
      return;
    }
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'invalid_action' }) });
  });

  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          typeof window.yakolakTestStartOnline === 'function' &&
          typeof window.yakolakTestPlayOneMove === 'function' &&
          typeof window.yakolakTelemetry === 'function' &&
          typeof window.__yakolakTelemetryFlush === 'function',
    null,
    { timeout: 60000 }
  );

  await page.evaluate(() => window.yakolakTestStartOnline());
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

  await page.evaluate(() => window.__yakolakTelemetryFlush());
  await page.waitForTimeout(800);

  expect(roomRequests.length).toBeGreaterThanOrEqual(2);
  expect(roomRequests.every(entry => entry.url.includes('/api/rooms-observed'))).toBe(true);
  expect(roomRequests.every(entry => entry.trace.length >= 6)).toBe(true);
  expect(roomRequests.every(entry => entry.requestId.length >= 6)).toBe(true);

  const names = telemetryEvents.map(event => event.eventName);
  expect(names).toContain('telemetry.started');
  expect(names).toContain('online.http.request');
  expect(names).toContain('online.http.response');
  expect(names).toContain('game.state.snapshot');

  const serialized = JSON.stringify(telemetryEvents);
  expect(serialized).not.toContain(token);
  expect(serialized).toContain('[redacted]');

  const traceIds = new Set(telemetryEvents.map(event => event.traceId).filter(Boolean));
  expect(traceIds.size).toBe(1);
  expect(traceIds.has(roomRequests[0].trace)).toBe(true);
});