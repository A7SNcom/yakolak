import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE_URL = process.env.YAKOLAK_UX_TURN_42_BASE_URL || 'http://127.0.0.1:8000';
const LABEL = process.env.YAKOLAK_UX_TURN_42_LABEL || 'source';
const CODE = '42';
const VIEWPORT = { width: 390, height: 844 };
const COLORS = ['marble', 'blue', 'gold', 'green'];
const DIRECTIONS = ['right', 'back', 'left', 'front'];
const BROWSER_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'];

test.use({ launchOptions: { args: BROWSER_ARGS } });

function roomFixture() {
  const players = COLORS.map((color, i) => ({ seat: `p${i + 1}`, color }));
  return {
    code: CODE, version: 42, protocol: 5, status: 'playing', targetPlayers: 4,
    targetRounds: 3, winsToMatch: 3, players, turnIndex: 2,
    board: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i), {}])),
    round: 1, completedRounds: 0,
    scores: Object.fromEntries(players.map(p => [p.seat, 0])),
    winner: null, draw: false, lastMove: null, moveNumber: 0,
    matchComplete: false, matchWinner: null, matchWinners: [],
    rematch: Object.fromEntries(players.map(p => [p.seat, false])),
  };
}

function expectedCopy(owner, seat) {
  return seat === `p${owner}` ? 'دورك' : `دور لاعب ${owner}`;
}

async function install(page, shared, seat) {
  shared.clients[seat] = { version: -1, turnIndex: -1, moves: 0 };
  const client = shared.clients[seat];

  await page.addInitScript(({ code, seat }) => {
    sessionStorage.setItem(`yakolak-online:${code}`, JSON.stringify({ token: `ux42-${seat}`, seat, code }));
    window.__ux42 = [];
    const sample = () => {
      const d = document.body?.dataset || {};
      const row = {
        t: Math.round(performance.now()),
        auth: Number(d.yakolakAuthoritativeTurnPlayer || 0),
        revision: Number(d.yakolakAuthoritativeTurnRevision || 0),
        hud: Number(d.yakolakTurnIndicatorPlayer || 0),
        gameplayReady: d.yakolakGameplayReady === 'true',
        phase: d.yakolakGameplay || '',
        currentPlayer: d.yakolakCurrentPlayer || '',
        presentation: d.yakolakTurnPresentationState || '',
        target: d.yakolakTurnPresentationTarget || '',
        settled: d.yakolakTurnPresentationSettled || '',
      };
      const prev = window.__ux42.at(-1);
      const key = JSON.stringify({ ...row, t: 0 });
      const prevKey = prev ? JSON.stringify({ ...prev, t: 0 }) : '';
      if (key !== prevKey) {
        window.__ux42.push(row);
        if (window.__ux42.length > 160) window.__ux42.shift();
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
      client.version = shared.room.version;
      client.turnIndex = shared.room.turnIndex;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, seat, room: shared.room }) });
    }
    const body = JSON.parse(request.postData() || '{}');
    if (body.action === 'move') {
      client.moves += 1;
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

async function open(page, seat) {
  await page.goto(`${BASE_URL}/?yakolakTestFast=1&room=${CODE}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => document.body.dataset.yakolakIntroHandoffEvent === 'consumed', null, { timeout: 60000 });
  await page.waitForFunction(() => document.body.dataset.yakolakAuthoritativeTurnValid === 'true' && document.body.dataset.yakolakTurnIndicatorVisible === 'true', null, { timeout: 60000 });
  const restored = await page.evaluate(code => JSON.parse(sessionStorage.getItem(`yakolak-online:${code}`) || '{}').seat || '', CODE);
  expect(restored, `${seat}: restored seat`).toBe(seat);
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
      gameplayReady: d.yakolakGameplayReady === 'true',
      phase: d.yakolakGameplay || '',
      turnRemaining: Number(d.yakolakTurnRemaining || 0),
      presentation: d.yakolakTurnPresentationState || '',
      presentationTarget: d.yakolakTurnPresentationTarget || '',
      presentationSettled: d.yakolakTurnPresentationSettled || '',
      selectedSize: d.yakolakSelectedSize || '',
      tray: d.yakolakTray || '',
      pieceX: Number(d.yakolakTestAuthorityPieceX || NaN),
      pieceY: Number(d.yakolakTestAuthorityPieceY || NaN),
      cellX: Number(d.yakolakTestAuthorityCellX || NaN),
      cellY: Number(d.yakolakTestAuthorityCellY || NaN),
      targetDirection: d.yakolakTestAuthorityTargetDirection || '',
      samples: Array.isArray(window.__ux42) ? window.__ux42.slice(-80) : [],
    };
  }, CODE);
}

async function wake(page) {
  await page.evaluate(() => { window.__yakolakOnlineWake = true; });
}

async function refreshTarget(page) {
  await page.waitForFunction(() => typeof window.yakolakTestRefreshAuthorityPickTarget === 'function', null, { timeout: 5000 });
  await page.evaluate(() => window.yakolakTestRefreshAuthorityPickTarget());
  await page.waitForTimeout(20);
  return snap(page);
}

function visible(x, y) {
  return Number.isFinite(x) && Number.isFinite(y) && x >= 2 && x <= VIEWPORT.width - 2 && y >= 2 && y <= VIEWPORT.height - 2;
}

async function waitPiece(page, owner) {
  let target = null;
  await expect.poll(async () => {
    const state = await snap(page);
    if (state.authPlayer !== owner) return false;
    target = await refreshTarget(page);
    return visible(target.pieceX, target.pieceY);
  }, { timeout: 12000, intervals: [20, 40, 80, 120], message: `P${owner}: physical piece becomes tappable` }).toBe(true);
  return target;
}

async function assertOwnerState(shared, pages, timeline, label, owner, requireSettled = true) {
  const ownerSeat = `p${owner}`;
  const direction = DIRECTIONS[owner - 1];
  const color = COLORS[owner - 1];
  if (requireSettled) {
    await Promise.all(pages.map(({ page }) => page.waitForFunction(dir => {
      const d = document.body.dataset;
      return d.yakolakTurnPresentationState === 'settled' && d.yakolakTurnPresentationTarget === dir && d.yakolakTurnPresentationSettled === dir;
    }, direction, { timeout: 12000 })));
  }

  const revisions = {};
  for (const { page, seat } of pages) {
    const s = await snap(page);
    const c = shared.clients[seat];
    expect(c.version, `${label}/${seat}: room version`).toBe(shared.room.version);
    expect(c.turnIndex, `${label}/${seat}: turnIndex`).toBe(owner - 1);
    expect(s.seat, `${label}/${seat}: client seat`).toBe(seat);
    expect(s.hydrated, `${label}/${seat}: hydration`).toBe(true);
    expect(s.authValid, `${label}/${seat}: authority valid`).toBe('true');
    expect(s.authLifecycle, `${label}/${seat}: lifecycle`).toBe('online-room');
    expect(s.authSource, `${label}/${seat}: authority source`).toBe('online-room');
    expect(s.authPlayer, `${label}/${seat}: authority owner`).toBe(owner);
    expect(s.authDirection, `${label}/${seat}: authority direction`).toBe(direction);
    expect(s.hudVisible, `${label}/${seat}: indicator visible`).toBe('true');
    expect(s.hudPlayer, `${label}/${seat}: indicator owner`).toBe(owner);
    expect(s.hudText, `${label}/${seat}: indicator copy`).toBe(expectedCopy(owner, seat));
    expect(s.hudLocal, `${label}/${seat}: local cue`).toBe(seat === ownerSeat ? 'true' : 'false');
    expect(s.hudColor, `${label}/${seat}: active visual cue`).toBe(color);
    expect(s.hudRevision, `${label}/${seat}: HUD revision`).toBe(s.authRevision);
    expect(s.currentPlayer, `${label}/${seat}: gameplay owner`).toBe(direction);
    expect(s.turnRemaining, `${label}/${seat}: online timer`).toBe(0);
    expect(s.gameplayReady, `${label}/${seat}: gameplay_ready exact owner`).toBe(seat === ownerSeat);
    if (seat !== ownerSeat) {
      const ownerSamples = s.samples.filter(sample => sample.auth === owner);
      expect(ownerSamples.some(sample => sample.gameplayReady), `${label}/${seat}: remote never ready`).toBe(false);
    }
    revisions[seat] = s.authRevision;
    timeline.push({
      label, seat, roomVersion: c.version, turnIndex: c.turnIndex, hydrated: s.hydrated,
      authRevision: s.authRevision, indicator: s.hudText, activeCue: s.hudColor,
      timerOwner: 'none', gameplayReady: s.gameplayReady, legalInputOwner: seat === ownerSeat,
      interactionPhase: s.phase,
      presentation: `${s.presentation}:${s.presentationTarget}:${s.presentationSettled}`,
    });
  }
  return revisions;
}

async function transition(shared, pages, timeline, owner) {
  const label = owner === 4 ? 'P3→P4' : 'P4→P1';
  const ownerSeat = `p${owner}`;
  const ownerPage = pages.find(p => p.seat === ownerSeat).page;
  const direction = DIRECTIONS[owner - 1];
  shared.room = { ...structuredClone(shared.room), version: shared.room.version + 1, turnIndex: owner - 1 };

  const motionProof = (async () => {
    await ownerPage.waitForFunction(ownerNumber => {
      const d = document.body.dataset;
      return Number(d.yakolakAuthoritativeTurnPlayer || 0) === ownerNumber &&
        Number(d.yakolakTurnIndicatorPlayer || 0) === ownerNumber &&
        d.yakolakTurnIndicatorLocal === 'true' && d.yakolakTurnPresentationState === 'transitioning';
    }, owner, { timeout: 12000 });
    const s = await snap(ownerPage);
    expect(s.currentPlayer, `${label}: gameplay owner during motion`).toBe(direction);
    expect(s.gameplayReady, `${label}: ready during motion`).toBe(true);
    timeline.push({ label: `${label}:motion`, seat: ownerSeat, gameplayReady: true, authRevision: s.authRevision, presentation: s.presentation });
  })();

  await Promise.all(pages.map(({ page }) => wake(page)));
  await motionProof;
  await Promise.all(pages.map(({ seat }) => expect.poll(() => shared.clients[seat].version, { timeout: 12000 }).toBe(shared.room.version)));

  for (const { page, seat } of pages) {
    await page.waitForFunction(({ ownerNumber, local }) => {
      const d = document.body.dataset;
      return Number(d.yakolakAuthoritativeTurnPlayer || 0) === ownerNumber &&
        Number(d.yakolakTurnIndicatorPlayer || 0) === ownerNumber &&
        d.yakolakTurnIndicatorLocal === (local ? 'true' : 'false');
    }, { ownerNumber: owner, local: seat === ownerSeat }, { timeout: 12000 });
    const s = await snap(page);
    expect(s.gameplayReady, `${label}/${seat}: exact readiness after convergence`).toBe(seat === ownerSeat);
  }

  const target = await waitPiece(ownerPage, owner);
  expect(target.gameplayReady, `${label}: ready at first physical tap`).toBe(true);
  expect(target.currentPlayer, `${label}: tap belongs to owner`).toBe(direction);
  expect(target.targetDirection, `${label}: target direction`).toBe(direction);
  await ownerPage.touchscreen.tap(target.pieceX, target.pieceY);
  await ownerPage.waitForFunction(() => document.body.dataset.yakolakSelectedSize === 'large' || document.body.dataset.yakolakTray === 'open', null, { timeout: 3000 });
  const accepted = await snap(ownerPage);
  expect(accepted.gameplayReady, `${label}: selection phase does not revoke readiness`).toBe(true);
  timeline.push({
    label: `${label}:first-tap`, seat: ownerSeat, firstTapAccepted: true,
    gameplayReady: accepted.gameplayReady, interactionPhase: accepted.phase,
    x: target.pieceX, y: target.pieceY,
    presentation: `${target.presentation}:${target.presentationTarget}:${target.presentationSettled}`,
  });

  for (const { page, seat } of pages.filter(p => p.seat !== ownerSeat)) {
    const remote = await refreshTarget(page);
    if (visible(remote.pieceX, remote.pieceY)) await page.touchscreen.tap(remote.pieceX, remote.pieceY);
    await page.waitForTimeout(80);
    const after = await snap(page);
    expect(after.gameplayReady, `${label}/${seat}: remote stays not ready`).toBe(false);
    expect(after.selectedSize, `${label}/${seat}: remote cannot select`).toBe('');
    expect(after.tray, `${label}/${seat}: remote cannot open tray`).not.toBe('open');
  }

  return assertOwnerState(shared, pages, timeline, `${label}:settled`, owner, true);
}

async function proveMoveOwner(shared, pages, timeline, owner) {
  const ownerSeat = `p${owner}`;
  const ownerPage = pages.find(p => p.seat === ownerSeat).page;
  const before = Object.fromEntries(pages.map(({ seat }) => [seat, shared.clients[seat].moves]));
  const target = await refreshTarget(ownerPage);
  expect(visible(target.cellX, target.cellY), `P${owner}: board target visible`).toBe(true);
  await Promise.all(pages.map(({ page }) => page.touchscreen.tap(target.cellX, target.cellY)));
  await expect.poll(() => shared.clients[ownerSeat].moves, { timeout: 4000 }).toBe(before[ownerSeat] + 1);
  await Promise.all(pages.map(({ page }) => page.waitForTimeout(100)));
  for (const { seat } of pages) {
    const delta = shared.clients[seat].moves - before[seat];
    expect(delta, `P${owner}/${seat}: exact legal move owner`).toBe(seat === ownerSeat ? 1 : 0);
    timeline.push({ label: `P${owner}:move`, seat, legalInputOwner: seat === ownerSeat, transportMoveDelta: delta });
  }
}

async function assertStableOnce(pages, revisions, owner) {
  await Promise.all(pages.map(({ page }) => wake(page)));
  await Promise.all(pages.map(({ page }) => page.waitForTimeout(180)));
  for (const { page, seat } of pages) {
    const s = await snap(page);
    expect(s.authPlayer, `P${owner}/${seat}: owner stable`).toBe(owner);
    expect(s.authRevision, `P${owner}/${seat}: exactly once`).toBe(revisions[seat]);
  }
}

async function saveFailure(pages, shared, timeline, error) {
  const dir = `artifacts/ux-turn-42-${LABEL}`;
  mkdirSync(dir, { recursive: true });
  for (const { page, seat } of pages) {
    const state = await snap(page).catch(() => null);
    if (state) timeline.push({ label: 'failure', seat, ...state });
    await page.screenshot({ path: `${dir}/${seat}.png`, fullPage: true, timeout: 8000 }).catch(() => {});
  }
  writeFileSync(`${dir}/timeline.json`, JSON.stringify({ room: shared.room, clients: shared.clients, timeline, failure: String(error?.stack || error) }, null, 2));
}

test('UX-TURN-42 P3→P4→P1 keeps one visible and interactive owner', async ({ browser }) => {
  test.setTimeout(210000);
  const shared = { room: roomFixture(), clients: {} };
  const pages = [];
  const timeline = [];
  try {
    for (let i = 1; i <= 4; i += 1) {
      const seat = `p${i}`;
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      await install(page, shared, seat);
      pages.push({ seat, page, context });
      await open(page, seat);
    }

    const p3 = await assertOwnerState(shared, pages, timeline, 'P3-baseline', 3, true);
    const p4 = await transition(shared, pages, timeline, 4);
    for (const seat of Object.keys(p4)) expect(p4[seat], `P3→P4/${seat}: one authority edge`).toBe(p3[seat] + 1);
    await assertStableOnce(pages, p4, 4);
    await proveMoveOwner(shared, pages, timeline, 4);

    const p1 = await transition(shared, pages, timeline, 1);
    for (const seat of Object.keys(p1)) expect(p1[seat], `P4→P1/${seat}: one authority edge`).toBe(p4[seat] + 1);
    await assertStableOnce(pages, p1, 1);
    await proveMoveOwner(shared, pages, timeline, 1);
  } catch (error) {
    await saveFailure(pages, shared, timeline, error);
    throw error;
  } finally {
    await Promise.all(pages.map(({ context }) => context.close().catch(() => {})));
  }
});
