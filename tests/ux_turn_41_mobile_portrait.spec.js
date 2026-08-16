import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE_URL = process.env.YAKOLAK_UX_TURN_41_BASE_URL || 'http://127.0.0.1:8000';
const RUN_LABEL = process.env.YAKOLAK_UX_TURN_41_LABEL || 'source';
const BROWSER_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-webgl',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--disable-dev-shm-usage',
];
const VIEWPORTS = [
  { name: '320x568', width: 320, height: 568 },
  { name: '375x812', width: 375, height: 812 },
  { name: '390x844', width: 390, height: 844 },
  { name: 'iphone-large-440x956', width: 440, height: 956 },
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
    code: '4141',
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
    reconnectFailures: 0,
    createBody: null,
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
      state.createBody = body;
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, token: body.clientToken, seat: 'p1', room: state.current }),
      });
    }
    if (body.action === 'rematch') {
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'round_not_finished' }),
      });
    }
    return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false }) });
  });
  return state;
}

async function openOnlineRoom(page) {
  await page.goto(`${BASE_URL}/?yakolakTestFast=1`, { waitUntil: 'domcontentloaded' });
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
      document.body.dataset.yakolakGameplay === 'ready' &&
      document.body.dataset.yakolakAuthoritativeTurnValid === 'true' &&
      document.body.dataset.yakolakTurnIndicatorContract === 'pass' &&
      document.body.dataset.yakolakTurn41QuickMenu === 'safe-turn-band',
    null,
    { timeout: 30000 }
  );
}

async function wakePoll(page) {
  await page.evaluate(() => { window.__yakolakOnlineWake = true; });
}

async function pushTurn(page, state, playerNumber) {
  state.current = {
    ...structuredClone(state.current),
    turnIndex: playerNumber - 1,
    version: Number(state.current.version) + 1,
  };
  await wakePoll(page);
}

function expectedFov(width, height) {
  const aspect = width / Math.max(height, 1);
  const portraitWeight = Math.max(0, Math.min(1, (0.92 - aspect) / 0.46));
  return 50 + (72 - 50) * portraitWeight;
}

async function snapshot(page) {
  return page.evaluate(() => {
    const d = document.body.dataset;
    const canvas = document.getElementById('canvas')?.getBoundingClientRect();
    const indicator = {
      top: Number(d.yakolakTurnIndicatorTop || NaN),
      width: Number(d.yakolakTurnIndicatorWidth || NaN),
      height: Number(d.yakolakTurnIndicatorHeight || NaN),
    };
    indicator.left = (innerWidth - indicator.width) / 2;
    indicator.right = indicator.left + indicator.width;
    indicator.bottom = indicator.top + indicator.height;
    const menu = {
      x: Number(d.yakolakTurn41QuickMenuX || NaN),
      y: Number(d.yakolakTurn41QuickMenuY || NaN),
      width: Number(d.yakolakTurn41QuickMenuWidth || NaN),
      height: Number(d.yakolakTurn41QuickMenuHeight || NaN),
    };
    menu.right = menu.x + menu.width;
    menu.bottom = menu.y + menu.height;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      canvas: canvas ? { left: canvas.left, top: canvas.top, width: canvas.width, height: canvas.height } : null,
      authoritativePlayer: Number(d.yakolakAuthoritativeTurnPlayer || 0),
      authoritativeValid: d.yakolakAuthoritativeTurnValid || '',
      indicatorPlayer: Number(d.yakolakTurnIndicatorPlayer || 0),
      indicatorText: d.yakolakTurnIndicatorText || '',
      indicatorColor: d.yakolakTurnIndicatorColor || '',
      indicatorVisible: d.yakolakTurnIndicatorVisible || '',
      indicator,
      menu,
      menuPanel: d.yakolakTurn41QuickMenuPanel || '',
      menuTouch: d.yakolakTurn41TouchTarget || '',
      cameraPolicy: d.yakolakTurn41CameraPolicy || '',
      safeTop: Number(d.yakolakTurn41SafeTop || 0),
      safeRight: Number(d.yakolakTurn41SafeRight || 0),
      currentPlayer: d.yakolakCurrentPlayer || '',
      turnRemaining: Number(d.yakolakTurnRemaining || 0),
      selectedSize: d.yakolakSelectedSize || '',
      tray: d.yakolakTray || '',
      pieceX: Number(d.yakolakTestPieceX || NaN),
      pieceY: Number(d.yakolakTestPieceY || NaN),
      cameraStage: d.yakolakCameraStage || '',
      cameraFacing: Number(d.yakolakCameraFacing || NaN),
      cameraFocusInside: d.yakolakCameraFocusInside || '',
      baseFov: Number(d.yakolakTurnBaseFov || NaN),
      effectiveFov: Number(d.yakolakTurnEffectiveFov || NaN),
      presentationSettled: d.yakolakTurnPresentationSettled || '',
    };
  });
}

function assertNoTurnMenuCollision(observed, label) {
  const i = observed.indicator;
  const m = observed.menu;
  const horizontalOverlap = Math.min(i.right, m.right) - Math.max(i.left, m.x);
  const verticalOverlap = Math.min(i.bottom, m.bottom) - Math.max(i.top, m.y);
  expect(Number.isFinite(horizontalOverlap), `${label}: finite horizontal geometry`).toBe(true);
  expect(Number.isFinite(verticalOverlap), `${label}: finite vertical geometry`).toBe(true);
  if (horizontalOverlap > 0) {
    expect(m.y - i.bottom, `${label}: overlapping x-ranges need 8px vertical breathing room`).toBeGreaterThanOrEqual(7.5);
  } else if (verticalOverlap > 0) {
    expect(m.x - i.right, `${label}: same top row needs 8px horizontal breathing room`).toBeGreaterThanOrEqual(7.5);
  }
}

async function waitForPlayer(page, viewport, playerNumber) {
  const direction = DIRECTIONS[playerNumber - 1];
  await page.waitForFunction(
    ({ player, dir }) => document.body.dataset.yakolakAuthoritativeTurnValid === 'true' &&
      document.body.dataset.yakolakAuthoritativeTurnPlayer === String(player) &&
      document.body.dataset.yakolakTurnIndicatorVisible === 'true' &&
      document.body.dataset.yakolakTurnIndicatorPlayer === String(player) &&
      document.body.dataset.yakolakTurnPresentationSettled === dir &&
      document.body.dataset.yakolakCameraStage === 'ready',
    { player: playerNumber, dir: direction },
    { timeout: 15000 }
  );
  await page.waitForTimeout(80);
  const observed = await snapshot(page);
  const expectedText = playerNumber === 1 ? 'دورك' : `دور لاعب ${playerNumber}`;
  expect(observed.authoritativePlayer, `P${playerNumber}: authoritative owner`).toBe(playerNumber);
  expect(observed.indicatorPlayer, `P${playerNumber}: indicator owner`).toBe(playerNumber);
  expect(observed.indicatorText, `P${playerNumber}: one-glance copy`).toBe(expectedText);
  expect(observed.indicatorColor, `P${playerNumber}: active-player color cue`).toBe(COLORS[playerNumber - 1]);
  expect(observed.currentPlayer, `P${playerNumber}: gameplay owner`).toBe(direction);
  expect(observed.menu.height, `P${playerNumber}: Settings finger target`).toBeGreaterThanOrEqual(47.5);
  expect(observed.menu.width, `P${playerNumber}: Settings finger width`).toBeGreaterThanOrEqual(48);
  expect(observed.menu.x, `P${playerNumber}: Settings left bound`).toBeGreaterThanOrEqual(0);
  expect(observed.menu.right, `P${playerNumber}: Settings right bound`).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(observed.menu.y, `P${playerNumber}: Settings safe top`).toBeGreaterThanOrEqual(observed.safeTop + 7.5);
  expect(viewport.width - observed.menu.right, `P${playerNumber}: Settings safe right`).toBeGreaterThanOrEqual(Math.max(7.5, observed.safeRight + 7.5));
  expect(observed.menuTouch).toBe('48px-min');
  expect(observed.cameraPolicy).toBe('overlay-only-no-projection-change');
  assertNoTurnMenuCollision(observed, `${viewport.name} P${playerNumber}`);

  expect(observed.canvas, `P${playerNumber}: canvas exists`).not.toBeNull();
  expect(Math.abs(observed.canvas.left), `P${playerNumber}: no horizontal camera/canvas shift`).toBeLessThanOrEqual(1);
  expect(Math.abs(observed.canvas.top), `P${playerNumber}: no vertical camera/canvas shift`).toBeLessThanOrEqual(1);
  expect(observed.canvas.width, `P${playerNumber}: canvas width preserved`).toBeCloseTo(viewport.width, 0);
  expect(observed.canvas.height, `P${playerNumber}: canvas height preserved`).toBeCloseTo(viewport.height, 0);
  expect(observed.cameraFocusInside, `P${playerNumber}: board focus remains framed`).toBe('true');
  expect(observed.cameraFacing, `P${playerNumber}: camera still faces board`).toBeGreaterThan(0.995);
  expect(observed.baseFov, `P${playerNumber}: projection FOV unchanged`).toBeCloseTo(expectedFov(viewport.width, viewport.height), 1);
  expect(observed.turnRemaining, `P${playerNumber}: inactive timer cannot obscure turn UI`).toBe(0);
  return observed;
}

async function exerciseMenuTouch(page) {
  const observed = await snapshot(page);
  const x = observed.menu.x + observed.menu.width / 2;
  const y = observed.menu.y + observed.menu.height / 2;
  await page.touchscreen.tap(x, y);
  await page.waitForFunction(() => document.body.dataset.yakolakTurn41QuickMenuPanel === 'open', null, { timeout: 3000 });
  await page.touchscreen.tap(x, y);
  await page.waitForFunction(() => document.body.dataset.yakolakTurn41QuickMenuPanel === 'closed', null, { timeout: 3000 });
}

async function selectCurrentPiece(page, viewport) {
  if (await page.evaluate(() => typeof window.yakolakTestRefreshPickTargets === 'function')) {
    const revision = await page.evaluate(() => Number(document.body.dataset.yakolakPiecePickTargetRevision || 0));
    await page.evaluate(() => window.yakolakTestRefreshPickTargets());
    await page.waitForFunction(
      previous => Number(document.body.dataset.yakolakPiecePickTargetRevision || 0) > previous,
      revision,
      { timeout: 5000 }
    );
  }
  const target = await page.evaluate(() => ({
    x: Number(document.body.dataset.yakolakTestSide0LargeX || document.body.dataset.yakolakTestPieceX || NaN),
    y: Number(document.body.dataset.yakolakTestSide0LargeY || document.body.dataset.yakolakTestPieceY || NaN),
  }));
  expect(Number.isFinite(target.x), 'P1 selected-piece target x').toBe(true);
  expect(Number.isFinite(target.y), 'P1 selected-piece target y').toBe(true);
  expect(target.x).toBeGreaterThanOrEqual(8);
  expect(target.x).toBeLessThanOrEqual(viewport.width - 8);
  expect(target.y).toBeGreaterThanOrEqual(8);
  expect(target.y).toBeLessThanOrEqual(viewport.height - 8);
  await page.touchscreen.tap(target.x, target.y);
  await page.waitForFunction(() => Boolean(document.body.dataset.yakolakSelectedSize), null, { timeout: 5000 });
  const observed = await snapshot(page);
  const inMenu = target.x >= observed.menu.x && target.x <= observed.menu.right && target.y >= observed.menu.y && target.y <= observed.menu.bottom;
  expect(inMenu, 'P1 piece finger target cannot sit under Settings').toBe(false);
  expect(observed.selectedSize, 'P1 selection cue visible').not.toBe('');
}

async function screenshotAssert(page, viewport, stateName) {
  mkdirSync('artifacts/ux-turn-41', { recursive: true });
  const path = `artifacts/ux-turn-41/${RUN_LABEL}-${viewport.name}-${stateName}.png`;
  const image = await page.screenshot({ path, fullPage: true });
  expect(image.byteLength, `${viewport.name} ${stateName}: screenshot evidence`).toBeGreaterThan(5000);
}

for (const viewport of VIEWPORTS) {
  test(`UX-TURN-41 ${viewport.name} 4p authoritative turn indicator mobile portrait interaction`, async ({ browser }) => {
    test.setTimeout(150000);
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => {
      const text = message.text();
      const intentionalMock = message.type() === 'error' && (text.includes('409') || text.includes('503'));
      if (message.type() === 'error' && !text.includes('favicon') && !intentionalMock) errors.push(`console: ${text}`);
    });

    const state = await installRoomApi(page);
    try {
      await openOnlineRoom(page);
      expect(Number(state.createBody?.targetPlayers), 'host requests four seats').toBe(4);

      await waitForPlayer(page, viewport, 1);
      await exerciseMenuTouch(page);
      await selectCurrentPiece(page, viewport);
      await screenshotAssert(page, viewport, 'p1-selected');

      for (const player of [2, 3, 4]) {
        await pushTurn(page, state, player);
        const observed = await waitForPlayer(page, viewport, player);
        expect(observed.selectedSize, `P${player}: stale previous-owner selection cleared`).toBe('');
        expect(observed.tray, `P${player}: stale previous-owner tray cleared`).not.toBe('open');
        await exerciseMenuTouch(page);
        await screenshotAssert(page, viewport, `p${player}`);
      }

      state.reconnectFailures = 1;
      await wakePoll(page);
      await page.waitForFunction(
        () => document.body.dataset.yakolakAuthoritativeTurnValid === 'false' &&
          document.body.dataset.yakolakTurnIndicatorVisible === 'false',
        null,
        { timeout: 10000 }
      );
      const reconnect = await snapshot(page);
      expect(reconnect.indicatorVisible, 'reconnect: stale owner hidden').toBe('false');
      expect(reconnect.indicatorText, 'reconnect: stale copy cleared').toBe('');
      expect(reconnect.selectedSize, 'reconnect: stale selection cleared').toBe('');
      expect(reconnect.canvas.width).toBeCloseTo(viewport.width, 0);
      expect(reconnect.canvas.height).toBeCloseTo(viewport.height, 0);
      await screenshotAssert(page, viewport, 'reconnect-hydrating');

      await waitForPlayer(page, viewport, 4);
      expect(errors, `browser errors: ${JSON.stringify(errors)}`).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
