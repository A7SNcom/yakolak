import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE_URL = process.env.YAKOLAK_UX_TURN_42_BASE_URL || 'http://127.0.0.1:8000';
const RUN_LABEL = process.env.YAKOLAK_UX_TURN_42_LABEL || 'source';
const CODE = '42';
const VIEWPORT = { width: 390, height: 844 };
const COLORS = ['marble', 'blue', 'gold', 'green'];
const DIRECTIONS = ['right', 'back', 'left', 'front'];
const BROWSER_ARGS = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
  '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage',
];

test.use({ launchOptions: { args: BROWSER_ARGS } });

function emptyBoard() {
  return Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i), {}]));
}

function makeRoom() {
  const players = COLORS.map((color, i) => ({ seat: `p${i + 1}`, color }));
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

async function installClient(page, shared, seat) {
  const transport = { seat, lastVersion: -1, lastTurnIndex: -1, moves: 0 };
  shared.clients[seat] = transport;

  await page.addInitScript(({ code, seat }) => {
    sessionStorage.setItem(`yakolak-online:${code}`, JSON.stringify({ token: `ux42-${seat}`, seat, code }));
    window.__ux42Samples = [];
    const sample = () => {
      const d = document.body?.dataset || {};
      const row = {
        t: Math.round(performance.now()),
        auth: Number(d.yakolakAuthoritativeTurnPlayer || 0),
        revision: Number(d.yakolakAuthoritativeTurnRevision || 0),
        hud: Number(d.yakolakTurnIndicatorPlayer || 0),
        hudText: d.yakolakTurnIndicatorText || '',
        gameplay: d.yakolakGameplay || '',
        presentation: d.yakolakTurnPresentationState || '',
        target: d.yakolakTurnPresentationTarget || '',
        settled: d.yakolakTurnPresentationSettled || '',
      };
      const previous = window.__ux42Samples[window.__ux42Samples.length - 1];
      const key = JSON.stringify({ ...row, t: 0 });
      const previousKey = previous ? JSON.stringify({ ...previous, t: 0 }) : '';
      if (key !== previousKey) {
        window.__ux42Samples.push(row);
        if (window.__ux42Samples.length > 160) window.__ux42Samples.shift();
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, { code: CODE, seat });

  await page.route('**/api/rooms**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      const since = Number(new URL(request.url()).searchParams.get('since') || '-1');
      if (since >= Number(shared.room.version)) return route.fulfill({ status: 204, body: '' });
      transport.lastVersion = Number(shared.room.version);
      transport.lastTurnIndex = Number(shared.room.turnIndex);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, seat, room: shared.room }),
      });
    }

    const body = JSON.parse(request.postData() || '{}');
    if (body.action === 'move') {
      transport.moves += 1;
      const ownerSeat = String(shared.room.players[shared.room.turnIndex]?.seat || '');
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
  await page.waitForFunction(() => {
    const d = document.body.dataset;
    return d.yakolakAuthoritativeTurnValid === 'true' && d.yakolakTurnIndicatorVisible === 'true';
  }, null, { timeout: 60000 });
  const restored = await page.evaluate(code => JSON.parse(sessionStorage.getItem(`yakolak-online:${code}`) || '{}').seat || '', CODE);
  expect(restored, `${seat}: restored current client seat`).toBe(seat);
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
      largeX: Number(d.yakolakTestLargeX || NaN),
      largeY: Number(d.yakolakTestLargeY || NaN),
      samples: Array.isArray(window.__ux42Samples) ? window.__ux42Samples.slice(-60) : [],
    };
  }, CODE);
}

async function wake(page) {
  await page.evaluate(() => { window.__yakolakOnlineWake = true; });
}

async function waitOwner(page, owner, seat) {
  await page.waitForFunction(({ owner, local }) => {
    const d = document.body.dataset;
    return d.yakolakAuthoritativeTurnValid === 'true' &&
      Number(d.yakolakAuthoritativeTurnPlayer || 0) === owner &&
      d.yakolakTurnIndicatorVisible === 'true' &&
      Number(d.yakolakTurnIndicatorPlayer || 0) === owner &&
      d.yakolakTurnIndicatorLocal === (local ? 'true' : 'false');
  }, { owner, local: seat === `p${owner}` }, { timeout: 12000 });
}

async function waitSettled(page, owner) {
  const direction = DIRECTIONS[owner - 1];
  await page.waitForFunction(dir => {
    const d = document.body.dataset;
    return d.yakolakTurnPresentationState === 'settled' &&
      d.yakolakTurnPresentationTarget === dir &&
      d.yakolakTurnPresentationSettled === dir;
  }, direction, { timeout: 12000 });
}

async function assertSettledState(shared, pages, timeline, label, owner) {
  const ownerSeat = `p${owner}`;
  const direction = DIRECTIONS[owner - 1];
  const color = COLORS[owner - 1];
  const rows = [];
  await Promise.all(pages.map(({ page }) => waitSettled(page, owner)));

  for (const { page, seat } of pages) {
    const s = await snap(page);
    const t = shared.clients[seat];
    expect(t.lastVersion, `${label}/${seat}: server room version`).toBe(shared.room.version);
    expect(t.lastTurnIndex, `${label}/${seat}: server turnIndex`).toBe(owner - 1);
    expect(s.seat, `${label}/${seat}: current client seat`).toBe(seat);
    expect(s.hydrated, `${label}/${seat}: hydration`).toBe(true);
    expect(s.authValid, `${label}/${seat}: authoritative turn`).toBe('true');
    expect(s.authLifecycle, `${label}/${seat}: lifecycle`).toBe('online-room');
    expect(s.authSource, `${label}/${seat}: authority source`).toBe('online-room');
    expect(s.authPlayer, `${label}/${seat}: authoritative owner`).toBe(owner);
    expect(s.authDirection, `${label}/${seat}: authoritative direction`).toBe(direction);
    expect(s.hudVisible, `${label}/${seat}: visible indicator`).toBe('true');
    expect(s.hudPlayer, `${label}/${seat}: indicator owner`).toBe(owner);
    expect(s.hudText, `${label}/${seat}: indicator copy`).toBe(expectedText(owner, seat));
    expect(s.hudLocal, `${label}/${seat}: local/remote wording`).toBe(seat === ownerSeat ? 'true' : 'false');
    expect(s.hudColor, `${label}/${seat}: active-player cue`).toBe(color);
    expect(s.hudRevision, `${label}/${seat}: indicator revision`).toBe(s.authRevision);
    expect(s.currentPlayer, `${label}/${seat}: gameplay owner`).toBe(direction);
    expect(s.turnRemaining, `${label}/${seat}: online timer owner`).toBe(0);
    expect(s.gameplayReady, `${label}/${seat}: gameplay_ready exact owner`).toBe(seat === ownerSeat);

    const afterOwnerSamples = s.samples.filter(sample => sample.auth === owner);
    expect(afterOwnerSamples.length, `${label}/${seat}: owner observed in state timeline`).toBeGreaterThan(0);
    if (seat !== ownerSeat) {
      expect(afterOwnerSamples.some(sample => sample.gameplay === 'ready'), `${label}/${seat}: remote never becomes gameplay_ready`).toBe(false);
    }

    const row = {
      label, seat, roomVersion: t.lastVersion, turnIndex: t.lastTurnIndex,
      hydrated: s.hydrated, authRevision: s.authRevision, indicator: s.hudText,
      activeCue: s.hudColor, timerOwner: 'none', gameplayReady: s.gameplayReady,
      legalInputOwner: seat === ownerSeat,
      presentation: `${s.presentation}:${s.presentationTarget}:${s.presentationSettled}`,
      transitionSamples: afterOwnerSamples,
    };
    rows.push(row);
  }
  timeline.push(...rows);
  return rows;
}

async function transitionAndProveMotionAction(shared, pages, timeline, label, owner) {
  const ownerSeat = `p${owner}`;
  const ownerPage = pages.find(entry => entry.seat === ownerSeat).page;
  const beforeMoves = Object.fromEntries(pages.map(({ seat }) => [seat, shared.clients[seat].moves]));

  shared.room = {
    ...structuredClone(shared.room),
    version: Number(shared.room.version) + 1,
    turnIndex: owner - 1,
  };

  const ownerMotionAction = (async () => {
    await ownerPage.waitForFunction(ownerNumber => {
      const d = document.body.dataset;
      return Number(d.yakolakAuthoritativeTurnPlayer || 0) === ownerNumber &&
        Number(d.yakolakTurnIndicatorPlayer || 0) === ownerNumber &&
        d.yakolakTurnIndicatorLocal === 'true' &&
        d.yakolakTurnPresentationState === 'transitioning';
    }, owner, { timeout: 12000 });
    const before = await snap(ownerPage);
    expect(before.currentPlayer, `${label}: gameplay owner updates before presentation settles`).toBe(DIRECTIONS[owner - 1]);
    await ownerPage.evaluate(() => window.yakolakTestPlayOneMove());
    await expect.poll(
      () => shared.clients[ownerSeat].moves,
      { timeout: 4000, message: `${label}: owner action reaches transport during visual motion` }
    ).toBe(beforeMoves[ownerSeat] + 1);
    timeline.push({
      label: `${label}:owner-motion-action`,
      seat: ownerSeat,
      roomVersion: shared.room.version,
      turnIndex: shared.room.turnIndex,
      gameplayReadyAtMotion: before.gameplayReady,
      presentationAtAction: `${before.presentation}:${before.presentationTarget}:${before.presentationSettled}`,
      actionAcceptedBeforeSettle: true,
    });
  })();

  await Promise.all(pages.map(({ page }) => wake(page)));
  await ownerMotionAction;

  await Promise.all(pages.map(({ seat }) => expect.poll(
    () => shared.clients[seat].lastVersion,
    { timeout: 12000, message: `${label}/${seat}: accepted room version ${shared.room.version}` }
  ).toBe(shared.room.version)));
  await Promise.all(pages.map(({ page, seat }) => waitOwner(page, owner, seat)));

  // Once all clients have accepted the same room version, exercising the same
  // helper everywhere must still produce exactly one legal input owner.
  const beforeAllMoves = Object.fromEntries(pages.map(({ seat }) => [seat, shared.clients[seat].moves]));
  await Promise.all(pages.map(({ page }) => page.evaluate(() => window.yakolakTestPlayOneMove())));
  await expect.poll(
    () => shared.clients[ownerSeat].moves,
    { timeout: 4000, message: `${label}: exact owner remains actionable after convergence` }
  ).toBe(beforeAllMoves[ownerSeat] + 1);
  await Promise.all(pages.map(({ page }) => page.waitForTimeout(120)));
  for (const { seat } of pages) {
    const delta = shared.clients[seat].moves - beforeAllMoves[seat];
    expect(delta, `${label}/${seat}: exact legal input owner`).toBe(seat === ownerSeat ? 1 : 0);
    timeline.push({ label: `${label}:converged-action`, seat, legalInputOwner: seat === ownerSeat, transportMoveDelta: delta });
  }
}

async function assertFirstRealTap(pages, timeline, label, owner) {
  const ownerSeat = `p${owner}`;
  const ownerPage = pages.find(entry => entry.seat === ownerSeat).page;
  await ownerPage.waitForFunction(() => {
    const d = document.body.dataset;
    return d.yakolakGameplay === 'ready' &&
      Number.isFinite(Number(d.yakolakTestLargeX)) && Number.isFinite(Number(d.yakolakTestLargeY));
  }, null, { timeout: 6000 });
  const target = await snap(ownerPage);
  expect(Number.isFinite(target.largeX) && Number.isFinite(target.largeY), `${label}: visible tap target`).toBe(true);

  await Promise.all(pages.map(({ page }) => page.touchscreen.tap(target.largeX, target.largeY)));
  await ownerPage.waitForFunction(() => {
    const d = document.body.dataset;
    return d.yakolakTray === 'open' || d.yakolakSelectedSize === 'large';
  }, null, { timeout: 4000 });
  await Promise.all(pages.map(({ page }) => page.waitForTimeout(100)));

  for (const { page, seat } of pages) {
    const s = await snap(page);
    const accepted = s.tray === 'open' || s.selectedSize === 'large';
    expect(accepted, `${label}/${seat}: first accepted real tap owner`).toBe(seat === ownerSeat);
    timeline.push({ label: `${label}:first-real-tap`, seat, firstTapAccepted: accepted, tray: s.tray, selectedSize: s.selectedSize });
  }
}

async function assertOnceOnly(pages, revisions, owner) {
  await Promise.all(pages.map(({ page }) => wake(page)));
  await Promise.all(pages.map(({ page }) => page.waitForTimeout(180)));
  for (const { page, seat } of pages) {
    const s = await snap(page);
    expect(s.authPlayer, `P${owner}/${seat}: duplicate poll keeps owner`).toBe(owner);
    expect(s.authRevision, `P${owner}/${seat}: owner activates once only`).toBe(revisions[seat]);
  }
}

async function saveFailure(pages, shared, timeline, error) {
  const dir = `artifacts/ux-turn-42-${RUN_LABEL}`;
  mkdirSync(dir, { recursive: true });
  for (const { page, seat } of pages) {
    const state = await snap(page).catch(() => null);
    if (state) timeline.push({ label: 'failure-snapshot', seat, ...state });
    await page.screenshot({ path: `${dir}/${seat}.png`, fullPage: true, timeout: 8000 }).catch(() => {});
  }
  writeFileSync(`${dir}/timeline.json`, JSON.stringify({
    room: shared.room,
    clients: shared.clients,
    timeline,
    failure: String(error?.stack || error),
  }, null, 2));
}

test('UX-TURN-42 mobile P3→P4→P1 converges on exactly one immediate interactive owner', async ({ browser }) => {
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

    const p3 = await assertSettledState(shared, pages, timeline, 'P3-baseline', 3);
    const p3Revision = Object.fromEntries(p3.map(row => [row.seat, row.authRevision]));

    await transitionAndProveMotionAction(shared, pages, timeline, 'P3→P4', 4);
    const p4 = await assertSettledState(shared, pages, timeline, 'P4-settled', 4);
    for (const row of p4) expect(row.authRevision, `P3→P4/${row.seat}: exactly one authoritative edge`).toBe(p3Revision[row.seat] + 1);
    await assertFirstRealTap(pages, timeline, 'P4', 4);
    const p4Revision = Object.fromEntries(p4.map(row => [row.seat, row.authRevision]));
    await assertOnceOnly(pages, p4Revision, 4);

    await transitionAndProveMotionAction(shared, pages, timeline, 'P4→P1', 1);
    const p1 = await assertSettledState(shared, pages, timeline, 'P1-settled', 1);
    for (const row of p1) expect(row.authRevision, `P4→P1/${row.seat}: exactly one authoritative edge`).toBe(p4Revision[row.seat] + 1);
    await assertFirstRealTap(pages, timeline, 'P1', 1);
  } catch (error) {
    await saveFailure(pages, shared, timeline, error);
    throw error;
  } finally {
    await Promise.all(pages.map(({ context }) => context.close().catch(() => {})));
  }
});
