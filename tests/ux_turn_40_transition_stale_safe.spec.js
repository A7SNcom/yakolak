import { test, expect } from '@playwright/test';

const BROWSER_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-webgl',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--disable-dev-shm-usage',
];
const COLORS = ['marble', 'blue', 'gold', 'green'];
const DIRECTIONS = ['right', 'back', 'left', 'front'];

test.use({ launchOptions: { args: BROWSER_ARGS } });

function emptyBoard() {
  return Object.fromEntries(Array.from({ length: 9 }, (_, index) => [String(index), {}]));
}

function makeRoom() {
  const players = COLORS.map((color, index) => ({ seat: `p${index + 1}`, color }));
  return {
    code: '4040',
    version: 1,
    protocol: 5,
    status: 'playing',
    targetPlayers: 4,
    targetRounds: 3,
    winsToMatch: 3,
    players,
    turnIndex: 0,
    board: emptyBoard(),
    round: 1,
    completedRounds: 0,
    scores: Object.fromEntries(players.map(player => [player.seat, 0])),
    winner: null,
    draw: false,
    lastMove: null,
    moveNumber: 0,
    matchComplete: false,
    matchWinner: null,
    matchWinners: [],
    rematch: Object.fromEntries(players.map(player => [player.seat, false])),
  };
}

async function installRoomApi(page) {
  const state = {
    current: makeRoom(),
    moveRequests: 0,
    reconnectFailures: 0,
  };
  await page.route('**/api/rooms**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      if (state.reconnectFailures > 0) {
        state.reconnectFailures -= 1;
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'online_server_error' }),
        });
      }
      const since = Number(new URL(request.url()).searchParams.get('since') || '-1');
      if (since >= Number(state.current.version)) {
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, seat: 'p1', room: state.current }),
      });
    }

    const body = JSON.parse(request.postData() || '{}');
    if (body.action === 'create') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, token: body.clientToken, seat: 'p1', room: state.current }),
      });
    }
    if (body.action === 'move') {
      state.moveRequests += 1;
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'occupied_slot' }),
      });
    }
    if (body.action === 'rematch') {
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'round_not_finished' }),
      });
    }
    return route.fulfill({ status: 400, contentType: 'application/json', body: '{}' });
  });
  return state;
}

async function wakePoll(page) {
  await page.evaluate(() => { window.__yakolakOnlineWake = true; });
}

async function pushRoom(page, state, overrides) {
  state.current = {
    ...structuredClone(state.current),
    ...structuredClone(overrides),
    version: Number(state.current.version) + 1,
  };
  await wakePoll(page);
}

async function openOnlineRoom(page) {
  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
      document.body.dataset.yakolakSetup === 'visible' &&
      document.body.dataset.yakolakSetupFlowStage === 'entry' &&
      typeof window.yakolakTestSetupFlowAction === 'function',
    null,
    { timeout: 60000 }
  );
  await page.evaluate(() => window.yakolakTestSetupFlowAction('new'));
  await page.waitForFunction(() => document.body.dataset.yakolakSetupFlowStage === 'count');
  await page.evaluate(() => window.yakolakTestSetupFlowAction('count', 4));
  await page.waitForFunction(() => document.body.dataset.yakolakSetupFlowStage === 'mode:1');
  await page.evaluate(() => window.yakolakTestSetupFlowAction('mode', 1, 'online'));
  await page.waitForFunction(() => document.body.dataset.yakolakSetupFlowStage === 'rounds');
  await page.evaluate(() => window.yakolakTestSetupFlowAction('rounds', 3));
  await page.waitForFunction(() => document.body.dataset.yakolakSetupFlowStage === 'color');
  await page.evaluate(() => window.yakolakTestSetupFlowAction('continue'));
  await page.waitForFunction(
    () => document.body.dataset.yakolakPlayers === '4' &&
      document.body.dataset.yakolakAuthoritativeTurnValid === 'true' &&
      document.body.dataset.yakolakAuthoritativeTurnPlayer === '1' &&
      document.body.dataset.yakolakTurnPresentationOwner === 'authoritative-revision-controller',
    null,
    { timeout: 30000 }
  );
}

async function waitAuthoritativePlayer(page, player) {
  await page.waitForFunction(
    expected => document.body.dataset.yakolakAuthoritativeTurnValid === 'true' &&
      document.body.dataset.yakolakAuthoritativeTurnPlayer === String(expected),
    player,
    { timeout: 10000 }
  );
}

async function waitSettled(page, player) {
  const direction = DIRECTIONS[player - 1];
  await page.waitForFunction(
    ({ player, direction }) => {
      const d = document.body.dataset;
      return d.yakolakAuthoritativeTurnValid === 'true' &&
        d.yakolakAuthoritativeTurnPlayer === String(player) &&
        d.yakolakTurnPresentationState === 'settled' &&
        d.yakolakTurnPresentationSettled === direction &&
        d.yakolakTurnPresentationTarget === direction &&
        d.yakolakTurnPresentationTween === 'none' &&
        d.yakolakTurnLightState === 'final' &&
        d.yakolakTurnLightDirection === direction &&
        d.yakolakTurnIndicatorVisible === 'true' &&
        d.yakolakTurnIndicatorPlayer === String(player) &&
        Number(d.yakolakTurnPresentationRevision) === Number(d.yakolakAuthoritativeTurnRevision) &&
        Number(d.yakolakTurnLightRevision) === Number(d.yakolakAuthoritativeTurnRevision) &&
        Number(d.yakolakTurnIndicatorRevision) === Number(d.yakolakAuthoritativeTurnRevision);
    },
    { player, direction },
    { timeout: 10000 }
  );
}

async function presentationSnapshot(page) {
  return page.evaluate(() => {
    const d = document.body.dataset;
    return {
      authValid: d.yakolakAuthoritativeTurnValid || '',
      authPlayer: d.yakolakAuthoritativeTurnPlayer || '',
      authRevision: Number(d.yakolakAuthoritativeTurnRevision || -1),
      authLifecycle: d.yakolakAuthoritativeTurnLifecycle || '',
      authDirection: d.yakolakAuthoritativeTurnDirection || '',
      presentationState: d.yakolakTurnPresentationState || '',
      presentationRevision: Number(d.yakolakTurnPresentationRevision || -1),
      target: d.yakolakTurnPresentationTarget || '',
      settled: d.yakolakTurnPresentationSettled || '',
      tween: d.yakolakTurnPresentationTween || '',
      serial: Number(d.yakolakTurnPresentationSerial || -1),
      retargets: Number(d.yakolakTurnPresentationRetargets || 0),
      cancels: Number(d.yakolakTurnPresentationCancels || 0),
      staleFinishes: Number(d.yakolakTurnPresentationStaleFinishes || 0),
      selection: Number(d.yakolakTurnPresentationSelection || -1),
      tray: d.yakolakTurnPresentationTray || '',
      lightState: d.yakolakTurnLightState || '',
      lightDirection: d.yakolakTurnLightDirection || '',
      lightRevision: Number(d.yakolakTurnLightRevision || -1),
      indicatorVisible: d.yakolakTurnIndicatorVisible || '',
      indicatorPlayer: d.yakolakTurnIndicatorPlayer || '',
      indicatorRevision: Number(d.yakolakTurnIndicatorRevision || -1),
      gameplay: d.yakolakGameplay || '',
    };
  });
}

test('4p authoritative turn indicator UX-TURN-40 retargets rapid presentation without stale owner or input lock', async ({ browser }) => {
  test.setTimeout(120000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const state = await installRoomApi(page);

  try {
    await openOnlineRoom(page);
    await waitSettled(page, 1);

    // Leave a real local selection/tray animation in flight, then revoke P1.
    await page.waitForFunction(() => Number.isFinite(Number(document.body.dataset.yakolakTestPieceX)));
    const piece = await page.evaluate(() => ({
      x: Number(document.body.dataset.yakolakTestPieceX),
      y: Number(document.body.dataset.yakolakTestPieceY),
    }));
    await page.mouse.click(piece.x, piece.y);
    await page.waitForFunction(() => document.body.dataset.yakolakTray === 'open', null, { timeout: 5000 });

    await pushRoom(page, state, { turnIndex: 1 });
    await waitAuthoritativePlayer(page, 2);
    await page.waitForFunction(() => document.body.dataset.yakolakTurnPresentationState === 'transitioning');
    let snap = await presentationSnapshot(page);
    expect(snap.selection, 'new owner must clear previous selection immediately').toBe(-1);
    expect(snap.tray, 'new owner must close previous tray immediately').toBe('closed');

    // Retarget twice before the 480ms camera motion can settle.
    await pushRoom(page, state, { turnIndex: 2 });
    await waitAuthoritativePlayer(page, 3);
    await pushRoom(page, state, { turnIndex: 3 });
    await waitAuthoritativePlayer(page, 4);
    await waitSettled(page, 4);
    snap = await presentationSnapshot(page);
    expect(snap.retargets, 'rapid accepted turns must cancel/retarget an in-flight camera tween').toBeGreaterThanOrEqual(1);
    expect(snap.target).toBe('front');
    expect(snap.settled).toBe('front');
    expect(snap.tween).toBe('none');

    // A local authoritative owner is actionable while its camera is still moving.
    await pushRoom(page, state, { turnIndex: 0 });
    await waitAuthoritativePlayer(page, 1);
    await page.waitForFunction(
      () => document.body.dataset.yakolakTurnPresentationState === 'transitioning' &&
        document.body.dataset.yakolakTurnPresentationTarget === 'right'
    );
    await page.evaluate(() => window.yakolakTestPlayOneMove());
    await expect.poll(() => state.moveRequests, { timeout: 3000 }).toBe(1);
    await waitSettled(page, 1);

    // Reconnect invalidates authority: presentation work must stop immediately.
    await pushRoom(page, state, { turnIndex: 1 });
    await waitAuthoritativePlayer(page, 2);
    await page.waitForFunction(() => document.body.dataset.yakolakTurnPresentationState === 'transitioning');
    state.reconnectFailures = 1;
    await wakePoll(page);
    await page.waitForFunction(
      () => document.body.dataset.yakolakAuthoritativeTurnValid === 'false' &&
        document.body.dataset.yakolakTurnPresentationState === 'cancelled' &&
        document.body.dataset.yakolakTurnPresentationTween === 'none' &&
        document.body.dataset.yakolakTurnPresentationTarget === '' &&
        document.body.dataset.yakolakTurnIndicatorVisible === 'false',
      null,
      { timeout: 10000 }
    );
    snap = await presentationSnapshot(page);
    expect(snap.cancels, 'reconnect must cancel active presentation').toBeGreaterThanOrEqual(1);
    expect(snap.selection).toBe(-1);
    expect(snap.tray).toBe('closed');

    await waitAuthoritativePlayer(page, 2);
    await waitSettled(page, 2);

    // Round lifecycle reset clears focus, then the accepted next-round starter owns all visuals.
    await pushRoom(page, state, {
      status: 'finished',
      completedRounds: 1,
      winner: { seat: 'p1', color: COLORS[0] },
      scores: { ...state.current.scores, p1: 1 },
      matchComplete: false,
    });
    await page.waitForFunction(
      () => document.body.dataset.yakolakAuthoritativeTurnValid === 'false' &&
        document.body.dataset.yakolakTurnPresentationState === 'cancelled' &&
        document.body.dataset.yakolakTurnPresentationTween === 'none' &&
        document.body.dataset.yakolakTurnLightDirection === '' &&
        document.body.dataset.yakolakTurnIndicatorVisible === 'false',
      null,
      { timeout: 10000 }
    );

    await pushRoom(page, state, {
      status: 'playing',
      round: 2,
      turnIndex: 2,
      board: emptyBoard(),
      winner: null,
      matchComplete: false,
      lastMove: null,
    });
    await waitAuthoritativePlayer(page, 3);
    await waitSettled(page, 3);

    // Give any killed/stale callbacks longer than a full camera+light transition.
    const stableBefore = await presentationSnapshot(page);
    await page.waitForTimeout(800);
    const stableAfter = await presentationSnapshot(page);
    expect(stableAfter.authRevision).toBe(stableBefore.authRevision);
    expect(stableAfter.presentationRevision).toBe(stableBefore.presentationRevision);
    expect(stableAfter.serial).toBe(stableBefore.serial);
    expect(stableAfter.target).toBe('left');
    expect(stableAfter.settled).toBe('left');
    expect(stableAfter.tween).toBe('none');
    expect(stableAfter.lightDirection).toBe('left');
    expect(stableAfter.indicatorPlayer).toBe('3');
    expect(stableAfter.staleFinishes).toBe(stableBefore.staleFinishes);
  } finally {
    await context.close();
  }
});
