import { test, expect } from '@playwright/test';

const BASE_URL = process.env.YAKOLAK_UX_TURN_42_BASE_URL || 'http://127.0.0.1:8000';
const RUN_LABEL = process.env.YAKOLAK_UX_TURN_42_LABEL || 'source';
const CODE = '4242';
const VIEWPORT = { width: 390, height: 844 };
const COLORS = ['marble', 'blue', 'gold', 'green'];
const DIRECTIONS = ['right', 'back', 'left', 'front'];
const BROWSER_ARGS = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
  '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage',
];

test.use({ launchOptions: { args: BROWSER_ARGS } });

function emptyBoard() {
  return Object.fromEntries(Array.from({ length: 9 }, (_, index) => [String(index), {}]));
}

function makeRoom() {
  const players = COLORS.map((color, index) => ({ seat: `p${index + 1}`, color }));
  return {
    code: CODE, version: 42, protocol: 5, status: 'playing', targetPlayers: 4,
    targetRounds: 3, winsToMatch: 3, players, turnIndex: 2, board: emptyBoard(),
    round: 1, completedRounds: 0,
    scores: Object.fromEntries(players.map(player => [player.seat, 0])),
    winner: null, draw: false, lastMove: null, moveNumber: 0,
    matchComplete: false, matchWinner: null, matchWinners: [],
    rematch: Object.fromEntries(players.map(player => [player.seat, false])),
  };
}

function expectedText(owner, seat) {
  return seat === `p${owner}` ? 'دورك' : `دور لاعب ${owner}`;
}

async function installClientApi(page, shared, seat) {
  const client = {
    seat,
    get200: 0,
    lastServedVersion: -1,
    lastServedTurnIndex: -1,
    moveRequests: 0,
  };
  shared.clients[seat] = client;

  await page.addInitScript(({ code, seat }) => {
    sessionStorage.setItem(`yakolak-online:${code}`, JSON.stringify({
      token: `ux42-${seat}`,
      seat,
      code,
    }));
    window.__ux42TurnHistory = [];
    window.addEventListener('DOMContentLoaded', () => {
      const body = document.body;
      if (!body) return;
      let lastKey = '';
      const capture = () => {
        const d = body.dataset;
        const row = {
          t: performance.now(),
          auth: d.yakolakAuthoritativeTurnPlayer || '',
          authRevision: d.yakolakAuthoritativeTurnRevision || '',
          indicator: d.yakolakTurnIndicatorPlayer || '',
          indicatorText: d.yakolakTurnIndicatorText || '',
          gameplay: d.yakolakGameplay || '',
          presentation: d.yakolakTurnPresentationState || '',
          presentationTarget: d.yakolakTurnPresentationTarget || '',
          presentationSettled: d.yakolakTurnPresentationSettled || '',
        };
        const key = JSON.stringify(row, ['auth', 'authRevision', 'indicator', 'indicatorText', 'gameplay', 'presentation', 'presentationTarget', 'presentationSettled']);
        if (key !== lastKey) {
          lastKey = key;
          window.__ux42TurnHistory.push(row);
          if (window.__ux42TurnHistory.length > 120) window.__ux42TurnHistory.shift();
        }
      };
      new MutationObserver(capture).observe(body, { attributes: true });
      capture();
    }, { once: true });
  }, { code: CODE, seat });

  await page.route('**/api/rooms**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      const since = Number(new URL(request.url()).searchParams.get('since') || '-1');
      if (since >= Number(shared.room.version)) {
        return route.fulfill({ status: 204, body: '' });
      }
      client.get200 += 1;
      client.lastServedVersion = Number(shared.room.version);
      client.lastServedTurnIndex = Number(shared.room.turnIndex);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, seat, room: shared.room }),
      });
    }

    const body = JSON.parse(request.postData() || '{}');
    if (body.action === 'move') {
      client.moveRequests += 1;
      const ownerSeat = String(shared.room.players[shared.room.turnIndex]?.seat || '');
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: seat === ownerSeat ? 'occupied_slot' : 'not_your_turn' }),
      });
    }
    if (body.action === 'rematch') {
      return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'round_not_finished' }) });
    }
    return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'invalid_action' }) });
  });
  return client;
}

async function openClient(page, seat) {
  await page.goto(`${BASE_URL}/?yakolakTestFast=1&room=${CODE}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntroHandoffEvent === 'consumed',
    null,
    { timeout: 45000 }
  );
  await page.waitForFunction(
    () => document.body.dataset.yakolakPlayers === '4' &&
      document.body.dataset.yakolakAuthoritativeTurnValid === 'true' &&
      document.body.dataset.yakolakTurnIndicatorVisible === 'true',
    null,
    { timeout: 45000 }
  );
  const savedSeat = await page.evaluate(code => JSON.parse(sessionStorage.getItem(`yakolak-online:${code}`) || '{}').seat || '', CODE);
  expect(savedSeat, `${seat}: restored client seat`).toBe(seat);
}

async function wake(page) {
  await page.evaluate(() => { window.__yakolakOnlineWake = true; });
}

async function pushTurn(shared, pages, turnIndex) {
  shared.room = { ...structuredClone(shared.room), version: Number(shared.room.version) + 1, turnIndex };
  await Promise.all(pages.map(({ page }) => wake(page)));
  await Promise.all(pages.map(({ seat }) => expect.poll(
    () => shared.clients[seat].lastServedVersion,
    { timeout: 10000, message: `${seat}: accepted room version ${shared.room.version}` }
  ).toBe(Number(shared.room.version))));
  const owner = turnIndex + 1;
  await Promise.all(pages.map(({ page, seat }) => page.waitForFunction(({ owner, seat }) => {
    const d = document.body.dataset;
    return d.yakolakAuthoritativeTurnValid === 'true' &&
      Number(d.yakolakAuthoritativeTurnPlayer || 0) === owner &&
      d.yakolakTurnIndicatorVisible === 'true' &&
      Number(d.yakolakTurnIndicatorPlayer || 0) === owner &&
      d.yakolakTurnIndicatorLocal === (seat === `p${owner}` ? 'true' : 'false');
  }, { owner, seat }, { timeout: 10000 })));
}

async function browserSnapshot(page) {
  return page.evaluate(() => {
    const d = document.body.dataset;
    return {
      authValid: d.yakolakAuthoritativeTurnValid || '',
      authPlayer: Number(d.yakolakAuthoritativeTurnPlayer || 0),
      authDirection: d.yakolakAuthoritativeTurnDirection || '',
      authRevision: Number(d.yakolakAuthoritativeTurnRevision || 0),
      authLifecycle: d.yakolakAuthoritativeTurnLifecycle || '',
      authSource: d.yakolakAuthoritativeTurnSource || '',
      hudVisible: d.yakolakTurnIndicatorVisible || '',
      hudPlayer: Number(d.yakolakTurnIndicatorPlayer || 0),
      hudText: d.yakolakTurnIndicatorText || '',
      hudLocal: d.yakolakTurnIndicatorLocal || '',
      hudColor: d.yakolakTurnIndicatorColor || '',
      hudRevision: Number(d.yakolakTurnIndicatorRevision || 0),
      hudEmphasis: d.yakolakTurnIndicatorEmphasis || '',
      currentPlayer: d.yakolakCurrentPlayer || '',
      gameplayState: d.yakolakGameplay || '',
      gameplayReady: d.yakolakGameplay === 'ready',
      turnRemaining: Number(d.yakolakTurnRemaining || 0),
      selectedSize: d.yakolakSelectedSize || '',
      tray: d.yakolakTray || '',
      presentationState: d.yakolakTurnPresentationState || '',
      presentationTarget: d.yakolakTurnPresentationTarget || '',
      presentationSettled: d.yakolakTurnPresentationSettled || '',
      presentationRevision: Number(d.yakolakTurnPresentationRevision || 0),
      lightDirection: d.yakolakTurnLightDirection || '',
      lightRevision: Number(d.yakolakTurnLightRevision || 0),
      onlineUiState: d.yakolakOnlineUiState || '',
      introHandoff: d.yakolakIntroHandoffEvent || '',
      history: Array.isArray(window.__ux42TurnHistory) ? window.__ux42TurnHistory.slice(-30) : [],
    };
  });
}

async function waitSettled(page, owner) {
  const direction = DIRECTIONS[owner - 1];
  await page.waitForFunction(dir =>
    document.body.dataset.yakolakTurnPresentationSettled === dir &&
    document.body.dataset.yakolakTurnPresentationState === 'settled',
    direction,
    { timeout: 12000 }
  );
}

async function checkpoint(shared, pages, timeline, label, owner, settled = true) {
  const expectedDirection = DIRECTIONS[owner - 1];
  const expectedColor = COLORS[owner - 1];
  const ownerSeat = `p${owner}`;
  const rows = [];

  if (settled) await Promise.all(pages.map(({ page }) => waitSettled(page, owner)));

  for (const { page, seat } of pages) {
    const observed = await browserSnapshot(page);
    const client = shared.clients[seat];
    const savedSeat = await page.evaluate(code => JSON.parse(sessionStorage.getItem(`yakolak-online:${code}`) || '{}').seat || '', CODE);
    expect(savedSeat, `${label}/${seat}: current client seat`).toBe(seat);
    expect(client.lastServedVersion, `${label}/${seat}: server room version`).toBe(Number(shared.room.version));
    expect(client.lastServedTurnIndex, `${label}/${seat}: server turnIndex`).toBe(owner - 1);
    expect(observed.introHandoff, `${label}/${seat}: hydration handoff`).toBe('consumed');
    expect(observed.authValid, `${label}/${seat}: hydrated authoritative turn`).toBe('true');
    expect(observed.authLifecycle, `${label}/${seat}: hydration lifecycle`).toBe('online-room');
    expect(observed.authSource, `${label}/${seat}: authority source`).toBe('online-room');
    expect(observed.authPlayer, `${label}/${seat}: authoritative owner`).toBe(owner);
    expect(observed.authDirection, `${label}/${seat}: authoritative direction`).toBe(expectedDirection);
    expect(observed.hudVisible, `${label}/${seat}: visible turn indicator`).toBe('true');
    expect(observed.hudPlayer, `${label}/${seat}: indicator owner`).toBe(owner);
    expect(observed.hudText, `${label}/${seat}: indicator copy`).toBe(expectedText(owner, seat));
    expect(observed.hudLocal, `${label}/${seat}: local/remote cue`).toBe(seat === ownerSeat ? 'true' : 'false');
    expect(observed.hudColor, `${label}/${seat}: active-player visual cue`).toBe(expectedColor);
    expect(observed.hudRevision, `${label}/${seat}: indicator consumes same authority revision`).toBe(observed.authRevision);
    expect(observed.currentPlayer, `${label}/${seat}: gameplay owner direction`).toBe(expectedDirection);
    expect(observed.turnRemaining, `${label}/${seat}: online timer owner must be none`).toBe(0);
    expect(observed.onlineUiState, `${label}/${seat}: no hydration/wait blocker`).toBe('');
    if (settled) {
      expect(observed.gameplayReady, `${label}/${seat}: gameplay_ready after presentation settle`).toBe(seat === ownerSeat);
      expect(observed.presentationSettled, `${label}/${seat}: presentation retarget`).toBe(expectedDirection);
    }

    const row = {
      label, seat, roomVersion: client.lastServedVersion, turnIndex: client.lastServedTurnIndex,
      hydrated: observed.authValid === 'true' && observed.authLifecycle === 'online-room',
      authRevision: observed.authRevision, indicator: observed.hudText,
      activeCue: `${observed.hudColor}/${observed.hudEmphasis}`,
      timerOwner: observed.turnRemaining > 0 ? observed.currentPlayer : 'none',
      gameplayReady: observed.gameplayReady,
      gameplayState: observed.gameplayState,
      legalInputOwner: seat === ownerSeat,
      presentation: `${observed.presentationState}:${observed.presentationTarget}:${observed.presentationSettled}`,
      lightDirection: observed.lightDirection,
    };
    rows.push(row);
  }
  timeline.push(...rows);
  return rows;
}

async function refreshOwnerTarget(page, owner) {
  const refreshed = await page.evaluate(() => {
    if (typeof window.yakolakTestRefreshPickTargets !== 'function') return false;
    window.yakolakTestRefreshPickTargets();
    return true;
  });
  expect(refreshed, `P${owner}: browser pick-target refresh hook`).toBe(true);
  await page.waitForTimeout(30);
  const side = owner - 1;
  const target = await page.evaluate(sideIndex => ({
    x: Number(document.body.dataset[`yakolakTestSide${sideIndex}LargeX`] || NaN),
    y: Number(document.body.dataset[`yakolakTestSide${sideIndex}LargeY`] || NaN),
  }), side);
  expect(Number.isFinite(target.x), `P${owner}: current-owner target x`).toBe(true);
  expect(Number.isFinite(target.y), `P${owner}: current-owner target y`).toBe(true);
  expect(target.x).toBeGreaterThanOrEqual(2);
  expect(target.x).toBeLessThanOrEqual(VIEWPORT.width - 2);
  expect(target.y).toBeGreaterThanOrEqual(2);
  expect(target.y).toBeLessThanOrEqual(VIEWPORT.height - 2);
  return target;
}

async function assertImmediateFirstTap(shared, pages, timeline, label, owner) {
  const ownerSeat = `p${owner}`;
  const before = Object.fromEntries(await Promise.all(pages.map(async ({ page, seat }) => [seat, await browserSnapshot(page)])));

  const ownerBefore = before[ownerSeat];
  const sawTransitioningAuthority = ownerBefore.presentationState === 'transitioning' || ownerBefore.history.some(row =>
    Number(row.auth || 0) === owner && Number(row.indicator || 0) === owner && row.presentation === 'transitioning'
  );
  expect(sawTransitioningAuthority, `${label}: authoritative owner is visible while presentation is still moving`).toBe(true);
  expect(ownerBefore.gameplayReady, `${label}: inherited gameplay_ready is not the authority gate during fresh camera motion`).toBe(false);

  const targets = Object.fromEntries(await Promise.all(pages.map(async ({ page, seat }) => [seat, await refreshOwnerTarget(page, owner)])));
  await Promise.all(pages.map(({ page, seat }) => page.touchscreen.tap(targets[seat].x, targets[seat].y)));

  await expect.poll(async () => {
    const observed = await browserSnapshot(pages.find(entry => entry.seat === ownerSeat).page);
    return Boolean(observed.selectedSize) || observed.tray === 'open';
  }, { timeout: 4000, message: `${label}: owner's first tap is accepted before stale animation settles` }).toBe(true);
  await Promise.all(pages.filter(entry => entry.seat !== ownerSeat).map(({ page }) => page.waitForTimeout(80)));

  for (const { page, seat } of pages) {
    const after = await browserSnapshot(page);
    const accepted = Boolean(after.selectedSize) || after.tray === 'open';
    expect(accepted, `${label}/${seat}: exact first-tap input owner`).toBe(seat === ownerSeat);
    expect(after.authPlayer, `${label}/${seat}: tap cannot advance/steal authority`).toBe(owner);
    expect(after.hudPlayer, `${label}/${seat}: tap cannot stale indicator`).toBe(owner);
    timeline.push({
      label: `${label}:first-tap`, seat,
      roomVersion: shared.clients[seat].lastServedVersion,
      turnIndex: shared.clients[seat].lastServedTurnIndex,
      legalInputOwner: seat === ownerSeat,
      gameplayReadyBeforeTap: before[seat].gameplayReady,
      presentationBeforeTap: `${before[seat].presentationState}:${before[seat].presentationTarget}:${before[seat].presentationSettled}`,
      firstTapAccepted: accepted,
      selectedSize: after.selectedSize,
      tray: after.tray,
      authorityAfterTap: after.authPlayer,
    });
  }
}

async function pageDelay(pages, ms) {
  await Promise.all(pages.map(({ page }) => page.waitForTimeout(ms)));
}

async function failureEvidence(pages, timeline, testInfo, shared, error) {
  for (const { page, seat } of pages) {
    const state = await browserSnapshot(page).catch(() => null);
    if (state) timeline.push({ label: 'failure-snapshot', seat, ...state });
    const image = await page.screenshot({ fullPage: true, timeout: 8000 }).catch(() => null);
    if (image) await testInfo.attach(`ux-turn-42-${RUN_LABEL}-${seat}.png`, { body: image, contentType: 'image/png' });
  }
  await testInfo.attach(`ux-turn-42-${RUN_LABEL}-timeline.json`, {
    body: Buffer.from(JSON.stringify({
      room: shared.room,
      clients: shared.clients,
      timeline,
      failure: String(error?.stack || error),
    }, null, 2)),
    contentType: 'application/json',
  });
}

test('UX-TURN-42 mobile P3→P4→P1 has one visible owner and one immediate legal input owner', async ({ browser }, testInfo) => {
  test.setTimeout(210000);
  const shared = { room: makeRoom(), clients: {} };
  const pages = [];
  const timeline = [];

  try {
    for (let index = 1; index <= 4; index += 1) {
      const seat = `p${index}`;
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      await installClientApi(page, shared, seat);
      pages.push({ seat, page, context });
      // Four simultaneous software-WebGL boots can turn initialization latency
      // into a false readiness failure. Boot sequentially, then exercise all four
      // clients concurrently for the actual turn transition.
      await openClient(page, seat);
    }

    const p3Rows = await checkpoint(shared, pages, timeline, 'P3-baseline', 3, true);
    const p3Revision = Object.fromEntries(p3Rows.map(row => [row.seat, row.authRevision]));

    await pushTurn(shared, pages, 3);
    const p4Immediate = await checkpoint(shared, pages, timeline, 'P3→P4-authority', 4, false);
    for (const row of p4Immediate) {
      expect(row.authRevision, `P3→P4/${row.seat}: exactly one authority revision`).toBe(p3Revision[row.seat] + 1);
    }
    await assertImmediateFirstTap(shared, pages, timeline, 'P4', 4);
    await checkpoint(shared, pages, timeline, 'P4-settled', 4, true);

    // Re-waking the same room version must not manufacture a second P4 edge.
    const p4Revision = Object.fromEntries((await Promise.all(pages.map(async ({ page, seat }) => [seat, (await browserSnapshot(page)).authRevision]))));
    await Promise.all(pages.map(({ page }) => wake(page)));
    await pageDelay(pages, 180);
    for (const { page, seat } of pages) {
      expect((await browserSnapshot(page)).authRevision, `P4/${seat}: duplicate poll cannot activate P4 twice`).toBe(p4Revision[seat]);
    }

    await pushTurn(shared, pages, 0);
    const p1Immediate = await checkpoint(shared, pages, timeline, 'P4→P1-authority', 1, false);
    for (const row of p1Immediate) {
      expect(row.authRevision, `P4→P1/${row.seat}: exactly one authority revision`).toBe(p4Revision[row.seat] + 1);
    }
    await assertImmediateFirstTap(shared, pages, timeline, 'P1', 1);
    await checkpoint(shared, pages, timeline, 'P1-settled', 1, true);
  } catch (error) {
    await failureEvidence(pages, timeline, testInfo, shared, error);
    throw error;
  } finally {
    await Promise.all(pages.map(({ context }) => context.close().catch(() => {})));
  }
});
