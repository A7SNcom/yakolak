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

const USELESS_BLOCKING_PHRASES = [
  'جارٍ تثبيت الحركة',
  'جاري تثبيت الحركة',
  'ننتظر تأكيد الغرفة قبل الحركة التالية',
  'بانتظار تأكيد الحركة',
  'انتظر تأكيد الحركة',
];

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

function emptyBoard() {
  return Object.fromEntries(Array.from({ length: 9 }, (_, index) => [String(index), {}]));
}

function room(code, overrides = {}) {
  const players = overrides.players || [
    { seat: 'p1', color: 'marble' },
    { seat: 'p2', color: 'blue' },
  ];
  return {
    code,
    version: overrides.version ?? 1,
    protocol: 5,
    status: overrides.status || 'playing',
    targetPlayers: overrides.targetPlayers ?? 2,
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

function committedRoom(current, body) {
  const next = structuredClone(current);
  next.version += 1;
  next.board[String(body.cell)][String(body.size)] = 'marble';
  next.lastMove = {
    cell: Number(body.cell),
    size: String(body.size),
    color: 'marble',
    seat: 'p1',
  };
  next.moveNumber += 1;
  next.turnIndex = 1;
  return next;
}

async function waitForIntro(page) {
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete',
    null,
    { timeout: 60000 }
  );
}

async function startOnline(page) {
  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  await waitForIntro(page);
  await page.waitForFunction(
    () => typeof window.yakolakTestStartOnline === 'function' && typeof window.yakolakTestPlayOneMove === 'function'
  );
  await page.evaluate(() => window.yakolakTestStartOnline());
  await page.waitForFunction(
    () => document.body.dataset.yakolakCurrentPlayer === 'right' && document.body.dataset.yakolakGameplay === 'ready',
    null,
    { timeout: 20000 }
  );
}

async function messageInventory(page) {
  return page.evaluate(phrases => {
    const d = document.body.dataset;
    const state = d.yakolakOnlineUiState || '';
    const action = d.yakolakOnlineUiAction || '';
    const message = d.yakolakOnlineUiMessage || '';
    const blockerRemoved = d.yakolakMoveBlocker === 'removed';
    const surfaces = [];

    // The Godot state card is canvas-rendered, so its browser contract is the
    // deterministic text inventory. UX-ONLINE-05 deliberately leaves the
    // submitting state available for diagnostics while suppressing that card.
    const stateCardRendered = Boolean(
      state && message && !(state === 'submitting-move' && blockerRemoved)
    );
    if (stateCardRendered) {
      surfaces.push({ kind: 'state-card', state, action, text: message, blocking: true });
    }

    for (const selector of ['#yakolak-move-pending', '#yakolak-online-status']) {
      const element = document.querySelector(selector);
      if (!element) continue;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const visible = style.display !== 'none' && style.visibility !== 'hidden' &&
        Number(style.opacity || '1') > 0 && rect.width > 0 && rect.height > 0;
      const text = (element.textContent || '').trim();
      if (!visible || !text) continue;
      surfaces.push({
        kind: selector === '#yakolak-move-pending' ? 'move-pending' : 'legacy-status',
        state,
        action: 'none',
        text,
        blocking: style.pointerEvents !== 'none',
      });
    }

    const renderedText = surfaces.map(surface => surface.text).join('\n');
    return {
      state,
      action,
      gameplay: d.yakolakGameplay || '',
      currentPlayer: d.yakolakCurrentPlayer || '',
      movePending: d.yakolakMovePending || '',
      movePendingTrace: d.yakolakMovePendingTrace || '',
      moveBlocker: d.yakolakMoveBlocker || '',
      inputPolicy: d.yakolakMoveInputPolicy || '',
      surfaces,
      renderedText,
      uselessHits: phrases.filter(phrase => renderedText.includes(phrase)),
    };
  }, USELESS_BLOCKING_PHRASES);
}

function assertMessageSafety(inventory) {
  expect(inventory.uselessHits, `useless blocking copy rendered: ${JSON.stringify(inventory)}`).toEqual([]);
  expect(inventory.surfaces.length, `duplicate message surfaces: ${JSON.stringify(inventory)}`).toBeLessThanOrEqual(1);
  const nonActionableBlockers = inventory.surfaces.filter(surface => surface.blocking && surface.action === 'none');
  expect(nonActionableBlockers, `non-actionable surface interrupts input: ${JSON.stringify(inventory)}`).toEqual([]);
}

async function waitForMoveSettled(page) {
  await page.waitForFunction(
    () => document.body.dataset.yakolakOnlineUiState !== 'submitting-move' &&
      !document.body.dataset.yakolakMovePending &&
      !document.getElementById('yakolak-move-pending'),
    null,
    { timeout: 10000 }
  );
}

test('[1/6] normal move renders no non-actionable blocker', async ({ page }) => {
  test.setTimeout(90000);
  let moveRequests = 0;
  let current = room('71');

  await page.route('**/api/rooms**', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ status: 204, body: '' });
    const body = JSON.parse(request.postData() || '{}');
    if (body.action === 'create') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, token: body.clientToken, seat: 'p1', room: current }) });
    }
    if (body.action === 'move') {
      moveRequests += 1;
      current = committedRoom(current, body);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, seat: 'p1', room: current }) });
    }
    return route.fulfill({ status: 400, body: '{}' });
  });

  await startOnline(page);
  await page.evaluate(() => window.yakolakTestPlayOneMove());
  await expect.poll(() => moveRequests, { timeout: 2500 }).toBe(1);
  await page.waitForFunction(() => document.body.dataset.yakolakCurrentPlayer === 'back', null, { timeout: 20000 });
  await waitForMoveSettled(page);

  const normal = await messageInventory(page);
  expect(normal.moveBlocker).toBe('removed');
  expect(normal.movePending).toBe('');
  expect(normal.movePendingTrace).not.toContain('hint-shown');
  expect(normal.surfaces).toEqual([]);
  assertMessageSafety(normal);
});

test('[2/6] intentionally delayed confirmation has one subtle self-clearing status', async ({ page }) => {
  test.setTimeout(90000);
  const gate = deferred();
  let current = room('72');

  await page.route('**/api/rooms**', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ status: 204, body: '' });
    const body = JSON.parse(request.postData() || '{}');
    if (body.action === 'create') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, token: body.clientToken, seat: 'p1', room: current }) });
    }
    if (body.action === 'move') {
      await gate.promise;
      current = committedRoom(current, body);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, seat: 'p1', room: current }) });
    }
    return route.fulfill({ status: 400, body: '{}' });
  });

  await startOnline(page);
  await page.evaluate(() => window.yakolakTestPlayOneMove());
  await page.waitForFunction(() => document.body.dataset.yakolakMovePending === 'subtle', null, { timeout: 5000 });

  const delayed = await messageInventory(page);
  expect(delayed.state).toBe('submitting-move');
  expect(delayed.inputPolicy).toBe('commit-only');
  expect(delayed.surfaces).toHaveLength(1);
  expect(delayed.surfaces[0]).toMatchObject({ kind: 'move-pending', text: 'تثبيت…', blocking: false });
  assertMessageSafety(delayed);

  gate.resolve();
  await page.waitForFunction(() => document.body.dataset.yakolakCurrentPlayer === 'back', null, { timeout: 20000 });
  await waitForMoveSettled(page);
  const settled = await messageInventory(page);
  expect(settled.surfaces).toEqual([]);
  assertMessageSafety(settled);
});

test('[3/6] rejected move clears confirming copy without interrupting input', async ({ page }) => {
  test.setTimeout(90000);
  const gate = deferred();
  let current = room('73');

  await page.route('**/api/rooms**', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ status: 204, body: '' });
    const body = JSON.parse(request.postData() || '{}');
    if (body.action === 'create') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, token: body.clientToken, seat: 'p1', room: current }) });
    }
    if (body.action === 'move') {
      await gate.promise;
      return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'occupied_slot' }) });
    }
    return route.fulfill({ status: 400, body: '{}' });
  });

  await startOnline(page);
  await page.evaluate(() => window.yakolakTestPlayOneMove());
  await page.waitForFunction(() => document.body.dataset.yakolakMovePending === 'subtle', null, { timeout: 5000 });
  gate.resolve();
  await waitForMoveSettled(page);

  const rejected = await messageInventory(page);
  expect(rejected.currentPlayer).toBe('right');
  expect(rejected.surfaces).toEqual([]);
  expect(rejected.renderedText).not.toMatch(/تأكيد|انتظار|تثبيت الحركة/);
  expect(rejected.movePendingTrace).toContain('hint-hidden:room-resolution');
  expect(rejected.movePendingTrace).toContain('resolved:room-resolution');
  assertMessageSafety(rejected);
});

test('[4/6] disconnect uses exactly one actionable interrupting surface', async ({ page }) => {
  test.setTimeout(90000);
  let current = room('74');

  await page.route('**/api/rooms**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'online_server_error' }) });
    }
    const body = JSON.parse(request.postData() || '{}');
    if (body.action === 'create') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, token: body.clientToken, seat: 'p1', room: current }) });
    }
    return route.fulfill({ status: 400, body: '{}' });
  });

  await startOnline(page);
  await page.waitForFunction(() => document.body.dataset.yakolakOnlineUiState === 'reconnecting', null, { timeout: 10000 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())));

  const disconnected = await messageInventory(page);
  expect(disconnected.surfaces).toHaveLength(1);
  expect(disconnected.surfaces[0].kind).toBe('state-card');
  expect(disconnected.surfaces[0].action).toBe('exit');
  expect(disconnected.renderedText).toContain('انقطع الاتصال');
  assertMessageSafety(disconnected);
});

test('[5/6] reconnect removes disconnect copy as soon as authoritative state returns', async ({ page }) => {
  test.setTimeout(90000);
  const recoveryGate = deferred();
  let pollCount = 0;
  let current = room('75');

  await page.route('**/api/rooms**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      pollCount += 1;
      if (pollCount === 1) {
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'online_server_error' }) });
      }
      await recoveryGate.promise;
      current = { ...current, version: current.version + 1 };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, seat: 'p1', room: current }) });
    }
    const body = JSON.parse(request.postData() || '{}');
    if (body.action === 'create') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, token: body.clientToken, seat: 'p1', room: current }) });
    }
    return route.fulfill({ status: 400, body: '{}' });
  });

  await startOnline(page);
  await page.waitForFunction(() => document.body.dataset.yakolakOnlineUiState === 'reconnecting', null, { timeout: 10000 });
  recoveryGate.resolve();
  await expect.poll(() => pollCount, { timeout: 10000 }).toBeGreaterThanOrEqual(2);
  await page.waitForFunction(() => !document.body.dataset.yakolakOnlineUiState, null, { timeout: 10000 });

  const recovered = await messageInventory(page);
  expect(recovered.surfaces).toEqual([]);
  expect(recovered.renderedText).not.toMatch(/انقطع الاتصال|إعادة الاتصال|عاد الاتصال/);
  assertMessageSafety(recovered);

  await page.waitForTimeout(1400);
  const stable = await messageInventory(page);
  expect(stable.surfaces).toEqual([]);
  assertMessageSafety(stable);
});

test('[6/6] next-turn transition cannot retain waiting or confirming copy', async ({ page }) => {
  test.setTimeout(90000);
  let current = room('76');

  await page.route('**/api/rooms**', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ status: 204, body: '' });
    const body = JSON.parse(request.postData() || '{}');
    if (body.action === 'create') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, token: body.clientToken, seat: 'p1', room: current }) });
    }
    if (body.action === 'move') {
      current = committedRoom(current, body);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, seat: 'p1', room: current }) });
    }
    return route.fulfill({ status: 400, body: '{}' });
  });

  await startOnline(page);
  await page.evaluate(() => window.yakolakTestPlayOneMove());
  await page.waitForFunction(() => document.body.dataset.yakolakCurrentPlayer === 'back', null, { timeout: 20000 });
  await waitForMoveSettled(page);

  const nextTurn = await messageInventory(page);
  expect(nextTurn.state).toBe('');
  expect(nextTurn.surfaces).toEqual([]);
  expect(nextTurn.renderedText).not.toMatch(/انتظار|تأكيد|تثبيت|إعادة الاتصال/);
  assertMessageSafety(nextTurn);
});