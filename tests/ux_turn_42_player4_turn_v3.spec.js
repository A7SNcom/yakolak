import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE_URL = process.env.YAKOLAK_UX_TURN_42_BASE_URL || 'http://127.0.0.1:8000';
const RUN_LABEL = process.env.YAKOLAK_UX_TURN_42_LABEL || 'source';
const CODE = '42';
const VIEWPORT = { width: 390, height: 844 };
const COLORS = ['marble', 'blue', 'gold', 'green'];
const DIRECTIONS = ['right', 'back', 'left', 'front'];
const BROWSER_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'];

test.use({ launchOptions: { args: BROWSER_ARGS } });

function makeRoom() {
  const players = COLORS.map((color, i) => ({ seat: `p${i + 1}`, color }));
  return {
    code: CODE, version: 42, protocol: 5, status: 'playing', targetPlayers: 4,
    targetRounds: 3, winsToMatch: 3, players, turnIndex: 2,
    board: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i), {}])),
    round: 1, completedRounds: 0,
    scores: Object.fromEntries(players.map(player => [player.seat, 0])),
    winner: null, draw: false, lastMove: null, moveNumber: 0,
    matchComplete: false, matchWinner: null, matchWinners: [],
    rematch: Object.fromEntries(players.map(player => [player.seat, false])),
  };
}

function indicatorText(owner, seat) {
  return seat === `p${owner}` ? 'دورك' : `دور لاعب ${owner}`;
}

async function installClient(page, shared, seat) {
  shared.clients[seat] = { lastVersion: -1, lastTurnIndex: -1, moves: 0 };
  const client = shared.clients[seat];

  await page.addInitScript(({ code, seat }) => {
    sessionStorage.setItem(`yakolak-online:${code}`, JSON.stringify({ token: `ux42-${seat}`, seat, code }));
    window.__ux42Timeline = [];
    const sample = () => {
      const d = document.body?.dataset || {};
      const row = {
        t: Math.round(performance.now()),
        auth: Number(d.yakolakAuthoritativeTurnPlayer || 0),
        revision: Number(d.yakolakAuthoritativeTurnRevision || 0),
        hud: Number(d.yakolakTurnIndicatorPlayer || 0),
        gameplay: d.yakolakGameplay || '',
        currentPlayer: d.yakolakCurrentPlayer || '',
        presentation: d.yakolakTurnPresentationState || '',
        target: d.yakolakTurnPresentationTarget || '',
        settled: d.yakolakTurnPresentationSettled || '',
      };
      const prev = window.__ux42Timeline.at(-1);
      if (!prev || JSON.stringify({ ...prev, t: 0 }) !== JSON.stringify({ ...row, t: 0 })) {
        window.__ux42Timeline.push(row);
        if (window.__ux42Timeline.length > 160) window.__ux42Timeline.shift();
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, { code: CODE, seat });

  await page.route('**/api/rooms**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      const since = Number(new URL(request.url()).searchParams.get('since') || '-1');
      if (since >= shared.room.version) return route.fulfill({ status: 204, body: '' });
      client.lastVersion = shared.room.version;
      client.lastTurnIndex = shared.room.turnIndex;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, seat, room: shared.room }) });
    }

    const body = JSON.parse(request.postData() || '{}');
    if (body.action === 'move') {
      client.moves += 1;
      const ownerSeat = shared.room.players[shared.room.turnIndex]?.seat || '';
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: seat === ownerSeat ? 'occupied_slot' : 'not_your_turn' }),
      });
    }
    return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'invalid_action' }) });
  });
}

async function openClient(page, seat) {
  await page.goto(`${BASE_URL}/?yakolakTestFast=1&room=${CODE}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => document.body.dataset.yakolakIntroHandoffEvent === 'consumed', null, { timeout: 60000 });
  await page.waitForFunction(() => document.body.dataset.yakolakAuthoritativeTurnValid === 'true' && document.body.dataset.yakolakTurnIndicatorVisible === 'true', null, { timeout: 60000 });
  const restored = await page.evaluate(code => JSON.parse(sessionStorage.getItem(`yakolak-online:${code}`) || '{}').seat || '', CODE);
  expect(restored, `${seat}: current client seat`).toBe(seat);
}

async function snap(page) {
  return page.evaluate(code => {
    const d = document.body.dataset;
    return {
      seat: JSON.parse(sessionStorage.getItem(`yakolak-online:${code}`) || '{}').seat || '',
      hydrated: d.yakolakIntroHandoffEvent === 'consumed',
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
      currentPlayer: d.yakolakCurrentPlayer || '',
      gameplay: d.yakolakGameplay || '',
      gameplayReady: d.yakolakGameplay === 'ready',
      turnRemaining: Number(d.yakolakTurnRemaining || 0),
      presentation: d.yakolakTurnPresentationState || '',
      presentationTarget: d.yakolakTurnPresentationTarget || '',
      presentationSettled: d.yakolakTurnPresentationSettled || '',
      selectedSize: d.yakolakSelectedSize || '',
      tray: d.yakolakTray || '',
      authorityPieceX: Number(d.yakolakTestAuthorityPieceX || NaN),
      authorityPieceY: Number(d.yakolakTestAuthorityPieceY || NaN),
      authorityCellX: Number(d.yakolakTestAuthorityCellX || NaN),
      authorityCellY: Number(d.yakolakTestAuthorityCellY || NaN),
      authorityTargetDirection: d.yakolakTestAuthorityTargetDirection || '',
      samples: Array.isArray(window.__ux42Timeline) ? window.__ux42Timeline.slice(-80) : [],
    };
  }, CODE);
}

async function wake(page) {
  await page.evaluate(() => { window.__yakolakOnlineWake = true; });
}

async function refreshLiveTarget(page) {
  const exists = await page.evaluate(() => typeof window.yakolakTestRefreshAuthorityPickTarget === 'function');
  expect(exists, 'automation live-target callback exists').toBe(true);
  await page.evaluate(() => window.yakolakTestRefreshAuthorityPickTarget());
  await page.waitForTimeout(16);
  return snap(page);
}

function pointVisible(x, y) {
  return Number.isFinite(x) && Number.isFinite(y) && x >= 2 && x <= VIEWPORT.width - 2 && y >= 2 && y <= VIEWPORT.height - 2;
}

async function waitFirstVisibleOwnerPiece(page, owner) {
  let latest = null;
  await expect.poll(async () => {
    const before = await snap(page);
    if (before.authPlayer !== owner) return false;
    latest = await refreshLiveTarget(page);
    return pointVisible(latest.authorityPieceX, latest.authorityPieceY);
  }, { timeout: 12000, intervals: [16, 32, 50, 80, 120], message: `P${owner}: first visible owner piece becomes tappable` }).toBe(true);
  return latest;
}

async function assertSettled(shared, pages, timeline, label, owner) {
  const ownerSeat = `p${owner}`;
  const direction = DIRECTIONS[owner - 1];
  const color = COLORS[owner - 1];

  await Promise.all(pages.map(({ page }) => page.waitForFunction(dir => {
    const d = document.body.dataset;
    return d.yakolakTurnPresentationState === 'settled' && d.yakolakTurnPresentationTarget === dir && d.yakolakTurnPresentationSettled === dir;
  }, direction, { timeout: 12000 })));

  const rows = [];
  for (const { page, seat } of pages) {
    const s = await snap(page);
    const client = shared.clients[seat];
    expect(client.lastVersion, `${label}/${seat}: room version`).toBe(shared.room.version);
    expect(client.lastTurnIndex, `${label}/${seat}: turnIndex`).toBe(owner - 1);
    expect(s.seat, `${label}/${seat}: current client seat`).toBe(seat);
    expect(s.hydrated, `${label}/${seat}: hydration`).toBe(true);
    expect(s.authValid, `${label}/${seat}: authoritative turn valid`).toBe('true');
    expect(s.authLifecycle, `${label}/${seat}: lifecycle`).toBe('online-room');
    expect(s.authSource, `${label}/${seat}: source`).toBe('online-room');
    expect(s.authPlayer, `${label}/${seat}: authoritative owner`).toBe(owner);
    expect(s.authDirection, `${label}/${seat}: authoritative direction`).toBe(direction);
    expect(s.hudVisible, `${label}/${seat}: turn indicator visible`).toBe('true');
    expect(s.hudPlayer, `${label}/${seat}: turn indicator owner`).toBe(owner);
    expect(s.hudText, `${label}/${seat}: turn indicator copy`).toBe(indicatorText(owner, seat));
    expect(s.hudLocal, `${label}/${seat}: local/remote cue`).toBe(seat === ownerSeat ? 'true' : 'false');
    expect(s.hudColor, `${label}/${seat}: active-player visual cue`).toBe(color);
    expect(s.hudRevision, `${label}/${seat}: HUD follows authority revision`).toBe(s.authRevision);
    expect(s.currentPlayer, `${label}/${seat}: gameplay owner`).toBe(direction);
    expect(s.turnRemaining, `${label}/${seat}: online timer owner is none`).toBe(0);
    expect(s.gameplayReady, `${label}/${seat}: gameplay_ready exact owner`).toBe(seat === ownerSeat);
    const ownerSamples = s.samples.filter(sample => sample.auth === owner);
    if (seat !== ownerSeat) expect(ownerSamples.some(sample => sample.gameplay === 'ready'), `${label}/${seat}: remote never becomes gameplay_ready`).toBe(false);

    const row = {
      label, seat, roomVersion: client.lastVersion, turnIndex: client.lastTurnIndex,
      hydrated: s.hydrated, authRevision: s.authRevision, indicator: s.hudText,
      activeCue: s.hudColor, timerOwner: 'none', gameplayReady: s.gameplayReady,
      legalInputOwner: seat === ownerSeat,
      presentation: `${s.presentation}:${s.presentationTarget}:${s.presentationSettled}`,
    };
    timeline.push(row);
    rows.push(row);
  }
  return rows;
}

async function transitionWithFirstRealTap(shared, pages, timeline, label, owner) {
  const ownerSeat = `p${owner}`;
  const ownerPage = pages.find(entry => entry.seat === ownerSeat).page;
  const direction = DIRECTIONS[owner - 1];
  shared.room = { ...structuredClone(shared.room), version: shared.room.version + 1, turnIndex: owner - 1 };

  const ownerReadinessDuringMotion = (async () => {
    await ownerPage.waitForFunction(ownerNumber => {
      const d = document.body.dataset;
      return Number(d.yakolakAuthoritativeTurnPlayer || 0) === ownerNumber &&
        Number(d.yakolakTurnIndicatorPlayer || 0) === ownerNumber &&
        d.yakolakTurnIndicatorLocal === 'true' &&
        d.yakolakTurnPresentationState === 'transitioning';
    }, owner, { timeout: 12000 });
    const s = await snap(ownerPage);
    expect(s.currentPlayer, `${label}: gameplay owner switches while presentation is moving`).toBe(direction);
    expect(s.gameplayReady, `${label}: gameplay_ready does not wait for presentation settle`).toBe(true);
    expect(s.presentation, `${label}: readiness proven during visual motion`).toBe('transitioning');
    timeline.push({
      label: `${label}:authority-readiness-during-motion`, seat: ownerSeat,
      roomVersion: shared.room.version, turnIndex: shared.room.turnIndex,
      authRevision: s.authRevision, gameplayReady: s.gameplayReady,
      presentation: `${s.presentation}:${s.presentationTarget}:${s.presentationSettled}`,
    });
  })();

  await Promise.all(pages.map(({ page }) => wake(page)));
  await ownerReadinessDuringMotion;

  await Promise.all(pages.map(({ seat }) => expect.poll(
    () => shared.clients[seat].lastVersion,
    { timeout: 12000, message: `${label}/${seat}: accepted room version ${shared.room.version}` },
  ).toBe(shared.room.version)));

  await Promise.all(pages.map(({ page, seat }) => page.waitForFunction(({ ownerNumber, local }) => {
    const d = document.body.dataset;
    return Number(d.yakolakAuthoritativeTurnPlayer || 0) === ownerNumber &&
      Number(d.yakolakTurnIndicatorPlayer || 0) === ownerNumber &&
      d.yakolakTurnIndicatorLocal === (local ? 'true' : 'false');
  }, { ownerNumber: owner, local: seat === ownerSeat }, { timeout: 12000 })));

  for (const { page, seat } of pages) {
    const s = await snap(page);
    expect(s.gameplayReady, `${label}/${seat}: exact legal input owner immediately after convergence`).toBe(seat === ownerSeat);
    expect(s.currentPlayer, `${label}/${seat}: no stale gameplay owner`).toBe(direction);
  }

  // Camera motion may be needed to bring the owner's physical stone on-screen.
  // Readiness above must already be true during that motion. The first real tap
  // is sent at the first screen position where the owner stone is actually visible,
  // without using presentation "settled" as an input prerequisite.
  const target = await waitFirstVisibleOwnerPiece(ownerPage, owner);
  expect(target.gameplayReady, `${label}: owner is still input-ready at first visible target`).toBe(true);
  expect(target.currentPlayer, `${label}: first visible target belongs to authoritative owner`).toBe(direction);
  expect(target.authorityTargetDirection, `${label}: test target direction`).toBe(direction);
  await ownerPage.touchscreen.tap(target.authorityPieceX, target.authorityPieceY);
  await ownerPage.waitForFunction(() => document.body.dataset.yakolakSelectedSize === 'large' || document.body.dataset.yakolakTray === 'open', null, { timeout: 3000 });
  const accepted = await snap(ownerPage);
  timeline.push({
    label: `${label}:first-real-tap`, seat: ownerSeat, firstTapAccepted: true,
    gameplayReadyAtTap: target.gameplayReady,
    presentationAtTap: `${target.presentation}:${target.presentationTarget}:${target.presentationSettled}`,
    x: target.authorityPieceX, y: target.authorityPieceY,
    selectedSize: accepted.selectedSize, tray: accepted.tray,
  });

  // Every other client taps the same authoritative player's live stone and stays inert.
  for (const { page, seat } of pages.filter(entry => entry.seat !== ownerSeat)) {
    const remoteTarget = await refreshLiveTarget(page);
    if (pointVisible(remoteTarget.authorityPieceX, remoteTarget.authorityPieceY)) {
      await page.touchscreen.tap(remoteTarget.authorityPieceX, remoteTarget.authorityPieceY);
      await page.waitForTimeout(80);
    }
    const after = await snap(page);
    expect(after.gameplayReady, `${label}/${seat}: remote remains not-ready`).toBe(false);
    expect(after.selectedSize, `${label}/${seat}: remote cannot select`).toBe('');
    expect(after.tray, `${label}/${seat}: remote cannot open tray`).not.toBe('open');
    timeline.push({ label: `${label}:remote-real-tap`, seat, firstTapAccepted: false, legalInputOwner: false });
  }
}

async function assertOwnerMoveTransport(shared, pages, timeline, label, owner) {
  const ownerSeat = `p${owner}`;
  const before = Object.fromEntries(pages.map(({ seat }) => [seat, shared.clients[seat].moves]));

  for (const { page } of pages) {
    const target = await refreshLiveTarget(page);
    if (pointVisible(target.authorityCellX, target.authorityCellY)) {
      await page.touchscreen.tap(target.authorityCellX, target.authorityCellY);
    }
  }

  await expect.poll(
    () => shared.clients[ownerSeat].moves,
    { timeout: 4000, message: `${label}: owner move reaches transport` },
  ).toBe(before[ownerSeat] + 1);
  await Promise.all(pages.map(({ page }) => page.waitForTimeout(100)));

  for (const { seat } of pages) {
    const delta = shared.clients[seat].moves - before[seat];
    expect(delta, `${label}/${seat}: exact legal move owner`).toBe(seat === ownerSeat ? 1 : 0);
    timeline.push({ label: `${label}:move-transport`, seat, transportMoveDelta: delta, legalInputOwner: seat === ownerSeat });
  }
}

async function assertOnceOnly(pages, revisions, owner) {
  await Promise.all(pages.map(({ page }) => wake(page)));
  await Promise.all(pages.map(({ page }) => page.waitForTimeout(180)));
  for (const { page, seat } of pages) {
    const s = await snap(page);
    expect(s.authPlayer, `P${owner}/${seat}: owner remains stable`).toBe(owner);
    expect(s.authRevision, `P${owner}/${seat}: owner activates once only`).toBe(revisions[seat]);
  }
}

async function saveFailure(pages, shared, timeline, error) {
  const dir = `artifacts/ux-turn-42-${RUN_LABEL}`;
  mkdirSync(dir, { recursive: true });
  for (const { page, seat } of pages) {
    const s = await snap(page).catch(() => null);
    if (s) timeline.push({ label: 'failure-snapshot', seat, ...s });
    await page.screenshot({ path: `${dir}/${seat}.png`, fullPage: true, timeout: 8000 }).catch(() => {});
  }
  writeFileSync(`${dir}/timeline.json`, JSON.stringify({ room: shared.room, clients: shared.clients, timeline, failure: String(error?.stack || error) }, null, 2));
}

test('UX-TURN-42 mobile P3→P4→P1 has one immediate authoritative owner and first real tap', async ({ browser }) => {
  test.setTimeout(210000);
  const shared = { room: makeRoom(), clients: {} };
  const pages = [];
  const timeline = [];

  try {
    for (let i = 1; i <= 4; i += 1) {
      const seat = `p${i}`;
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      await installClient(page, shared, seat);
      pages.push({ seat, page, context });
      await openClient(page, seat);
    }

    const p3 = await assertSettled(shared, pages, timeline, 'P3-baseline', 3);
    const p3Revision = Object.fromEntries(p3.map(row => [row.seat, row.authRevision]));

    await transitionWithFirstRealTap(shared, pages, timeline, 'P3→P4', 4);
    const p4 = await assertSettled(shared, pages, timeline, 'P4-settled', 4);
    for (const row of p4) expect(row.authRevision, `P3→P4/${row.seat}: one authority edge`).toBe(p3Revision[row.seat] + 1);
    await assertOwnerMoveTransport(shared, pages, timeline, 'P4', 4);
    const p4Revision = Object.fromEntries(p4.map(row => [row.seat, row.authRevision]));
    await assertOnceOnly(pages, p4Revision, 4);

    await transitionWithFirstRealTap(shared, pages, timeline, 'P4→P1', 1);
    const p1 = await assertSettled(shared, pages, timeline, 'P1-settled', 1);
    for (const row of p1) expect(row.authRevision, `P4→P1/${row.seat}: one authority edge`).toBe(p4Revision[row.seat] + 1);
    await assertOwnerMoveTransport(shared, pages, timeline, 'P1', 1);
  } catch (error) {
    await saveFailure(pages, shared, timeline, error);
    throw error;
  } finally {
    await Promise.all(pages.map(({ context }) => context.close().catch(() => {})));
  }
});
