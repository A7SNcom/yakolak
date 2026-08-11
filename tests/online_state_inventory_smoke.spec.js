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

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

function emptyBoard() {
  return Object.fromEntries(Array.from({ length: 9 }, (_, index) => [String(index), {}]));
}

function room(code, overrides = {}) {
  const players = overrides.players || [{ seat: 'p1', color: 'marble' }];
  const targetPlayers = overrides.targetPlayers ?? 2;
  return {
    code,
    version: overrides.version ?? 1,
    protocol: 5,
    status: overrides.status || 'waiting',
    targetPlayers,
    targetRounds: 3,
    winsToMatch: 3,
    players,
    turnIndex: overrides.turnIndex ?? 0,
    board: overrides.board || emptyBoard(),
    round: 1,
    completedRounds: 0,
    scores: Object.fromEntries(players.map(player => [player.seat, 0])),
    winner: null,
    draw: false,
    lastMove: overrides.lastMove || null,
    moveNumber: overrides.moveNumber || 0,
    matchComplete: false,
    matchWinner: null,
    matchWinners: [],
    rematch: Object.fromEntries(players.map(player => [player.seat, false])),
    ...overrides,
  };
}

async function waitForIntro(page) {
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete',
    null,
    { timeout: 60000 }
  );
}

async function waitForState(page, state) {
  await page.waitForFunction(
    expected => document.body.dataset.yakolakOnlineUiState === expected,
    state,
    { timeout: 20000 }
  );
  return page.evaluate(() => ({
    state: document.body.dataset.yakolakOnlineUiState,
    action: document.body.dataset.yakolakOnlineUiAction,
    message: document.body.dataset.yakolakOnlineUiMessage,
    surface: document.body.dataset.yakolakOnlineUiSurface,
  }));
}

test('room preview never leaves checking, missing, failure, or started states ambiguous', async ({ page }) => {
  test.setTimeout(150000);
  let mode = 'delayed-ready';
  const previewGate = deferred();

  await page.route('**/api/rooms**', async route => {
    const request = route.request();
    if (request.method() !== 'POST') return route.fulfill({ status: 405, body: '{}' });
    const body = JSON.parse(request.postData() || '{}');
    if (body.action !== 'preview') return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'invalid_action' }) });
    const code = String(body.code || '54');

    if (mode === 'delayed-ready') {
      await previewGate.promise;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, room: { code, status: 'waiting', targetPlayers: 2, targetRounds: 3, availableColors: ['marble', 'blue', 'gold', 'green'] } })
      });
    }
    if (mode === 'missing') {
      return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'room_not_found' }) });
    }
    if (mode === 'failed') {
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'online_server_error' }) });
    }
    if (mode === 'started') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, room: { code, status: 'playing', targetPlayers: 2, targetRounds: 3, availableColors: ['gold', 'green'] } })
      });
    }
  });

  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1&room=54', { waitUntil: 'domcontentloaded' });
  await waitForIntro(page);
  let state = await waitForState(page, 'room-checking');
  expect(state.action).toBe('none');
  expect(state.message).toContain('نتحقق من الغرفة');
  previewGate.resolve();
  state = await waitForState(page, 'room-ready');
  expect(state.action).toBe('join');
  expect(state.message).toContain('الغرفة جاهزة');

  mode = 'missing';
  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1&room=55', { waitUntil: 'domcontentloaded' });
  await waitForIntro(page);
  state = await waitForState(page, 'room-not-found');
  expect(state.action).toBe('back');
  expect(state.message).toContain('الغرفة غير موجودة');

  mode = 'failed';
  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1&room=56', { waitUntil: 'domcontentloaded' });
  await waitForIntro(page);
  state = await waitForState(page, 'request-failed');
  expect(state.action).toBe('retry');
  expect(state.message).toContain('تعذر إكمال الطلب');

  mode = 'started';
  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1&room=57', { waitUntil: 'domcontentloaded' });
  await waitForIntro(page);
  state = await waitForState(page, 'room-started');
  expect(state.action).toBe('back');
  expect(state.message).toContain('اللعبة بدأت');
});

test('join request shows progress then explains a real room_full race', async ({ page }) => {
  test.setTimeout(120000);
  const joinGate = deferred();

  await page.route('**/api/rooms**', async route => {
    const request = route.request();
    const body = request.method() === 'POST' ? JSON.parse(request.postData() || '{}') : {};
    if (body.action === 'preview') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, room: { code: '58', status: 'waiting', targetPlayers: 2, targetRounds: 3, availableColors: ['marble', 'blue', 'gold', 'green'] } })
      });
    }
    if (body.action === 'join') {
      await joinGate.promise;
      return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'room_full' }) });
    }
    return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'invalid_action' }) });
  });

  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1&room=58', { waitUntil: 'domcontentloaded' });
  await waitForIntro(page);
  await waitForState(page, 'room-ready');
  await page.waitForFunction(() => typeof window.yakolakTestSetupFlowAction === 'function');
  await page.evaluate(() => window.yakolakTestSetupFlowAction('continue'));

  let state = await waitForState(page, 'joining-room');
  expect(state.surface).toBe('gameplay');
  expect(state.message).toContain('جاري الانضمام');
  joinGate.resolve();

  state = await waitForState(page, 'room-full');
  expect(state.surface).toBe('setup');
  expect(state.action).toBe('back');
  expect(state.message).toContain('الغرفة ممتلئة');
});

test('host path explains create, waiting, disconnect, recovery, and cancellation', async ({ page }) => {
  test.setTimeout(150000);
  const createGate = deferred();
  const firstPollGate = deferred();
  let pollCount = 0;

  await page.route('**/api/rooms**', async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      const body = JSON.parse(request.postData() || '{}');
      if (body.action === 'create') {
        await createGate.promise;
        const created = room('59');
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, token: body.clientToken, seat: 'p1', room: created })
        });
      }
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'invalid_action' }) });
    }

    pollCount += 1;
    if (pollCount === 1) {
      await firstPollGate.promise;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'online_server_error' }) });
    }
    if (pollCount === 2) return route.fulfill({ status: 204, body: '' });
    const cancelled = room('59', { version: 2, status: 'cancelled', cancelledBy: 'p1' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, seat: 'p1', room: cancelled }) });
  });

  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  await waitForIntro(page);
  await page.waitForFunction(() => typeof window.yakolakTestStartOnline === 'function');
  await page.evaluate(() => window.yakolakTestStartOnline());

  let state = await waitForState(page, 'creating-room');
  expect(state.action).toBe('exit');
  createGate.resolve();
  state = await waitForState(page, 'waiting-players');
  expect(state.message).toContain('انضم');

  firstPollGate.resolve();
  state = await waitForState(page, 'reconnecting');
  expect(state.message).toContain('انقطع الاتصال');
  state = await waitForState(page, 'connected');
  expect(state.message).toContain('عاد الاتصال');
  state = await waitForState(page, 'room-cancelled');
  expect(state.action).toBe('exit');
  expect(state.message).toContain('انتهت الغرفة');
});

test('restore and move acknowledgement have explicit non-silent states', async ({ page }) => {
  test.setTimeout(150000);
  const restoreGate = deferred();
  await page.addInitScript(() => {
    if (new URL(location.href).searchParams.get('room') === '61') {
      sessionStorage.setItem('yakolak-online:61', JSON.stringify({ token: 'a'.repeat(64), seat: 'p1', code: '61' }));
    }
  });
  await page.route('**/api/rooms**', async route => {
    if (route.request().method() === 'GET') {
      await restoreGate.promise;
      const restored = room('61', {
        version: 3,
        status: 'playing',
        players: [{ seat: 'p1', color: 'marble' }, { seat: 'p2', color: 'blue' }],
        targetPlayers: 2,
        turnIndex: 0,
      });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, seat: 'p1', room: restored }) });
    }
    return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'invalid_action' }) });
  });

  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1&room=61', { waitUntil: 'domcontentloaded' });
  await waitForIntro(page);
  let state = await waitForState(page, 'restoring-room');
  expect(state.message).toContain('نستعيد الغرفة');
  restoreGate.resolve();
  await page.waitForFunction(() => document.body.dataset.yakolakCurrentPlayer === 'right', null, { timeout: 20000 });

  await page.unroute('**/api/rooms**');
  const moveGate = deferred();
  let current = room('62', {
    status: 'playing',
    players: [{ seat: 'p1', color: 'marble' }, { seat: 'p2', color: 'blue' }],
    targetPlayers: 2,
    turnIndex: 0,
  });
  await page.route('**/api/rooms**', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ status: 204, body: '' });
    const body = JSON.parse(request.postData() || '{}');
    if (body.action === 'create') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, token: body.clientToken, seat: 'p1', room: current }) });
    }
    if (body.action === 'move') {
      await moveGate.promise;
      current = structuredClone(current);
      current.version += 1;
      current.board[String(body.cell)][String(body.size)] = 'marble';
      current.lastMove = { cell: Number(body.cell), size: String(body.size), color: 'marble', seat: 'p1' };
      current.moveNumber += 1;
      current.turnIndex = 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, seat: 'p1', room: current }) });
    }
    return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'invalid_action' }) });
  });

  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  await waitForIntro(page);
  await page.waitForFunction(() => typeof window.yakolakTestStartOnline === 'function' && typeof window.yakolakTestPlayOneMove === 'function');
  await page.evaluate(() => window.yakolakTestStartOnline());
  await page.waitForFunction(
    () => document.body.dataset.yakolakCurrentPlayer === 'right' && document.body.dataset.yakolakGameplay === 'ready',
    null,
    { timeout: 20000 }
  );
  await page.evaluate(() => window.yakolakTestPlayOneMove());
  state = await waitForState(page, 'submitting-move');
  expect(state.message).toContain('تثبيت الحركة');
  expect(state.action).toBe('none');
  moveGate.resolve();
  await page.waitForFunction(() => document.body.dataset.yakolakCurrentPlayer === 'back', null, { timeout: 20000 });
});

test('restore and move UX removes the commit blocker and clears slow pending copy', async ({ page }) => {
  test.setTimeout(150000);
  const players = [{ seat: 'p1', color: 'marble' }, { seat: 'p2', color: 'blue' }];
  const slowGate = deferred();
  let mode = 'normal';
  let moveRequests = 0;
  let current = room('63', { status: 'playing', players, targetPlayers: 2, turnIndex: 0 });

  await page.route('**/api/rooms**', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ status: 204, body: '' });
    const body = JSON.parse(request.postData() || '{}');
    if (body.action === 'create') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, token: body.clientToken, seat: 'p1', room: current })
      });
    }
    if (body.action === 'move') {
      moveRequests += 1;
      if (mode === 'slow-reject') {
        await slowGate.promise;
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'occupied_slot' })
        });
      }
      current = structuredClone(current);
      current.version += 1;
      current.board[String(body.cell)][String(body.size)] = 'marble';
      current.lastMove = { cell: Number(body.cell), size: String(body.size), color: 'marble', seat: 'p1' };
      current.moveNumber += 1;
      current.turnIndex = 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, seat: 'p1', room: current })
      });
    }
    return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'invalid_action' }) });
  });

  const startOnline = async () => {
    await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
    await waitForIntro(page);
    await page.waitForFunction(() => typeof window.yakolakTestStartOnline === 'function' && typeof window.yakolakTestPlayOneMove === 'function');
    await page.evaluate(() => window.yakolakTestStartOnline());
    await page.waitForFunction(
      () => document.body.dataset.yakolakCurrentPlayer === 'right' && document.body.dataset.yakolakGameplay === 'ready',
      null,
      { timeout: 20000 }
    );
  };

  // Normal latency: the server response lands before the delayed affordance.
  await startOnline();
  await page.evaluate(() => window.yakolakTestPlayOneMove());
  await page.waitForFunction(() => document.body.dataset.yakolakCurrentPlayer === 'back', null, { timeout: 20000 });
  const normal = await page.evaluate(() => ({
    waiting: document.body.dataset.yakolakOnlineWaiting || '',
    pending: document.body.dataset.yakolakMovePending || '',
    hint: Boolean(document.getElementById('yakolak-move-pending')),
  }));
  expect(normal.waiting).toBe('hidden');
  expect(normal.pending).toBe('');
  expect(normal.hint).toBe(false);

  // Slow rejection: keep the board unobscured, show one tiny passive hint, and
  // leave the exact move commit guarded without disabling the rest of input.
  mode = 'slow-reject';
  moveRequests = 0;
  current = room('64', { status: 'playing', players, targetPlayers: 2, turnIndex: 0 });
  await startOnline();
  await page.evaluate(() => window.yakolakTestPlayOneMove());
  await expect.poll(() => moveRequests, { timeout: 3000 }).toBe(1);
  await page.waitForFunction(
    () => document.body.dataset.yakolakMovePending === 'subtle',
    null,
    { timeout: 5000 }
  );

  const slow = await page.evaluate(() => {
    const hint = document.getElementById('yakolak-move-pending');
    const style = hint ? getComputedStyle(hint) : null;
    const rect = hint ? hint.getBoundingClientRect() : null;
    return {
      uiState: document.body.dataset.yakolakOnlineUiState || '',
      waiting: document.body.dataset.yakolakOnlineWaiting || '',
      blocker: document.body.dataset.yakolakMoveBlocker || '',
      inputPolicy: document.body.dataset.yakolakMoveInputPolicy || '',
      hintCount: document.querySelectorAll('#yakolak-move-pending').length,
      pointerEvents: style?.pointerEvents || '',
      width: rect?.width || 999,
      height: rect?.height || 999,
    };
  });
  expect(slow.uiState).toBe('submitting-move'); // diagnostic state only, not a visible card
  expect(slow.waiting).toBe('hidden');
  expect(slow.blocker).toBe('removed');
  expect(slow.inputPolicy).toBe('commit-only');
  expect(slow.hintCount).toBe(1);
  expect(slow.pointerEvents).toBe('none');
  expect(slow.width).toBeLessThan(180);
  expect(slow.height).toBeLessThan(60);

  // A second commit attempt while the first intent is unresolved is the only
  // input suppressed; it must not create a second authoritative request.
  await page.evaluate(() => window.yakolakTestPlayOneMove());
  await page.waitForTimeout(120);
  expect(moveRequests).toBe(1);

  slowGate.resolve();
  await page.waitForFunction(
    () => document.body.dataset.yakolakOnlineUiState !== 'submitting-move' &&
      !document.body.dataset.yakolakMovePending &&
      !document.getElementById('yakolak-move-pending'),
    null,
    { timeout: 10000 }
  );
  const settled = await page.evaluate(() => ({
    pending: document.body.dataset.yakolakMovePending || '',
    hintCount: document.querySelectorAll('#yakolak-move-pending').length,
    trace: document.body.dataset.yakolakMovePendingTrace || '',
  }));
  expect(settled.pending).toBe('');
  expect(settled.hintCount).toBe(0);
  expect(settled.trace).toContain('resolved:room-resolution');
});