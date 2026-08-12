import { test, expect } from '@playwright/test';

const BROWSER_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-webgl',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--disable-dev-shm-usage',
];

const VIEWPORTS = [
  { name: 'mobile-portrait', width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: 'desktop', width: 1280, height: 800, isMobile: false, hasTouch: false },
];
const COLORS = ['marble', 'blue', 'gold', 'green'];
const ARABIC_INDIC_DIGITS = /[٠-٩۰-۹]/;
const TURN_COPY = /^دور(?:ك| لاعب [1-4])$/;

test.use({ launchOptions: { args: BROWSER_ARGS } });

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

function emptyBoard() {
  return Object.fromEntries(Array.from({ length: 9 }, (_, index) => [String(index), {}]));
}

function makeRoom(playerCount, code) {
  const players = Array.from({ length: playerCount }, (_, index) => ({
    seat: `p${index + 1}`,
    color: COLORS[index],
  }));
  return {
    code,
    version: 1,
    protocol: 5,
    status: 'playing',
    targetPlayers: playerCount,
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

function commitMove(room, body) {
  const next = structuredClone(room);
  const turnIndex = Number(next.turnIndex);
  const mover = next.players[turnIndex];
  next.version += 1;
  next.board[String(body.cell)][String(body.size)] = mover.color;
  next.lastMove = {
    cell: Number(body.cell),
    size: String(body.size),
    color: mover.color,
    seat: mover.seat,
  };
  next.moveNumber += 1;
  next.turnIndex = (turnIndex + 1) % next.players.length;
  return next;
}

async function installRoomApi(page, playerCount) {
  const state = {
    current: makeRoom(playerCount, String(40 + playerCount)),
    moveMode: 'reject',
    delayedGate: null,
    moveRequests: 0,
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
    if (body.action === 'move') {
      state.moveRequests += 1;
      if (state.moveMode === 'reject') {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'occupied_slot' }),
        });
      }
      if (state.moveMode === 'delay') {
        await state.delayedGate.promise;
      }
      state.current = commitMove(state.current, body);
      state.moveMode = 'observe';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, seat: 'p1', room: state.current }),
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

async function openOnlineRoom(page, playerCount) {
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
  await page.evaluate(count => window.yakolakTestSetupFlowAction('count', count), playerCount);
  await page.waitForFunction(() => document.body.dataset.yakolakSetupFlowStage === 'mode:1');
  await page.evaluate(() => window.yakolakTestSetupFlowAction('mode', 1, 'online'));
  await page.waitForFunction(() => document.body.dataset.yakolakSetupFlowStage === 'rounds');
  await page.evaluate(() => window.yakolakTestSetupFlowAction('rounds', 3));
  await page.waitForFunction(() => document.body.dataset.yakolakSetupFlowStage === 'color');
  await page.evaluate(() => window.yakolakTestSetupFlowAction('continue'));
  await page.waitForFunction(
    count => document.body.dataset.yakolakPlayers === String(count) &&
      document.body.dataset.yakolakGameplay === 'ready' &&
      document.body.dataset.yakolakAuthoritativeTurnValid === 'true' &&
      document.body.dataset.yakolakTurnIndicatorContract === 'pass',
    playerCount,
    { timeout: 30000 }
  );
}

async function installFrameSampler(page) {
  await page.evaluate(() => {
    window.__yakolakTurnVisualSamples = [];
    window.__yakolakTurnVisualSamplerActive = true;
    let last = '';
    const sample = () => {
      if (!window.__yakolakTurnVisualSamplerActive) return;
      const d = document.body.dataset;
      const row = {
        t: Math.round(performance.now()),
        authValid: d.yakolakAuthoritativeTurnValid || '',
        authPlayer: d.yakolakAuthoritativeTurnPlayer || '',
        authRevision: d.yakolakAuthoritativeTurnRevision || '',
        hudVisible: d.yakolakTurnIndicatorVisible || '',
        hudPlayer: d.yakolakTurnIndicatorPlayer || '',
        hudText: d.yakolakTurnIndicatorText || '',
        hudRevision: d.yakolakTurnIndicatorRevision || '',
        legacyHud: d.yakolakHudVisibility || '',
      };
      const key = JSON.stringify(row);
      if (key !== last) {
        window.__yakolakTurnVisualSamples.push(row);
        if (window.__yakolakTurnVisualSamples.length > 400) window.__yakolakTurnVisualSamples.shift();
        last = key;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
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

async function browserSnapshot(page) {
  return page.evaluate(() => {
    const d = document.body.dataset;
    const visibleDomTurnText = [];
    for (const element of document.querySelectorAll('body *')) {
      if (element.id === 'canvas' || element.tagName === 'SCRIPT' || element.tagName === 'STYLE') continue;
      if (element.children.length > 0) continue;
      const text = (element.textContent || '').trim();
      if (!/^دور(?:ك| لاعب| )/.test(text)) continue;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0 && rect.width > 0 && rect.height > 0) {
        visibleDomTurnText.push(text);
      }
    }
    const top = Number(d.yakolakTurnIndicatorTop || NaN);
    const width = Number(d.yakolakTurnIndicatorWidth || NaN);
    const height = Number(d.yakolakTurnIndicatorHeight || NaN);
    const cellY = Number(d.yakolakTestCellY || NaN);
    return {
      authoritative: {
        valid: d.yakolakAuthoritativeTurnValid || '',
        player: d.yakolakAuthoritativeTurnPlayer || '',
        lifecycle: d.yakolakAuthoritativeTurnLifecycle || '',
        revision: d.yakolakAuthoritativeTurnRevision || '',
        source: d.yakolakAuthoritativeTurnSource || '',
      },
      indicator: {
        visible: d.yakolakTurnIndicatorVisible || '',
        player: d.yakolakTurnIndicatorPlayer || '',
        text: d.yakolakTurnIndicatorText || '',
        lifecycle: d.yakolakTurnIndicatorLifecycle || '',
        revision: d.yakolakTurnIndicatorRevision || '',
        source: d.yakolakTurnIndicatorSource || '',
        polling: d.yakolakTurnIndicatorPolling || '',
        digits: d.yakolakTurnIndicatorDigits || '',
        pointer: d.yakolakTurnIndicatorPointer || '',
        top,
        width,
        height,
      },
      legacyHud: d.yakolakHudVisibility || '',
      visibleDomTurnText,
      layout: {
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        cellY,
        indicatorBottom: top + height,
        horizontalMargin: (innerWidth - width) / 2,
      },
      gameplay: {
        state: d.yakolakGameplay || '',
        currentPlayer: d.yakolakCurrentPlayer || '',
        players: d.yakolakPlayers || '',
        onlineUiState: d.yakolakOnlineUiState || '',
        movePending: d.yakolakMovePending || '',
      },
    };
  });
}

async function attachFailureEvidence(page, testInfo, label, serverRoom, error) {
  const safe = label.replace(/[^a-z0-9._-]+/gi, '-');
  const screenshot = await page.screenshot({ fullPage: true }).catch(() => null);
  if (screenshot) {
    await testInfo.attach(`${safe}.png`, { body: screenshot, contentType: 'image/png' });
  }
  const snapshot = await browserSnapshot(page).catch(snapshotError => ({ snapshotError: String(snapshotError) }));
  const samples = await page.evaluate(() => window.__yakolakTurnVisualSamples || []).catch(() => []);
  await testInfo.attach(`${safe}.authoritative-state.json`, {
    body: Buffer.from(JSON.stringify({
      checkpoint: label,
      serverAuthoritativeRoom: serverRoom,
      browser: snapshot,
      frameSamples: samples,
      failure: String(error?.stack || error),
    }, null, 2)),
    contentType: 'application/json',
  });
}

async function checkpoint(page, testInfo, label, state, playerCount, expectedPlayer) {
  try {
    if (expectedPlayer == null) {
      await page.waitForFunction(
        () => document.body.dataset.yakolakAuthoritativeTurnValid === 'false' &&
          document.body.dataset.yakolakTurnIndicatorVisible === 'false',
        null,
        { timeout: 10000 }
      );
    } else {
      await page.waitForFunction(
        player => document.body.dataset.yakolakAuthoritativeTurnValid === 'true' &&
          document.body.dataset.yakolakAuthoritativeTurnPlayer === String(player) &&
          document.body.dataset.yakolakTurnIndicatorVisible === 'true' &&
          document.body.dataset.yakolakTurnIndicatorPlayer === String(player),
        expectedPlayer,
        { timeout: 10000 }
      );
    }
    await page.waitForTimeout(80);
    const observed = await browserSnapshot(page);

    expect(observed.authoritative.source, `${label}: authoritative source`).toBe('online-room');
    expect(observed.indicator.source, `${label}: indicator source`).toBe('authoritative-turn-signal');
    expect(observed.indicator.polling, `${label}: indicator must remain event-driven`).toBe('none');
    expect(observed.indicator.digits, `${label}: digit policy`).toBe('western-0-9');
    expect(observed.indicator.pointer, `${label}: board input cannot be intercepted`).toBe('ignore');

    if (expectedPlayer == null) {
      expect(observed.authoritative.valid, `${label}: no authoritative turn`).toBe('false');
      expect(observed.indicator.visible, `${label}: undefined turn must be hidden`).toBe('false');
      expect(observed.indicator.text, `${label}: hidden state cannot retain stale copy`).toBe('');
      expect(observed.indicator.player, `${label}: hidden state cannot retain stale player`).toBe('0');
    } else {
      const expectedText = expectedPlayer === 1 ? 'دورك' : `دور لاعب ${expectedPlayer}`;
      expect(observed.authoritative.valid, `${label}: authoritative turn must be valid`).toBe('true');
      expect(Number(observed.authoritative.player), `${label}: authoritative identity`).toBe(expectedPlayer);
      expect(observed.indicator.visible, `${label}: indicator visible`).toBe('true');
      expect(Number(observed.indicator.player), `${label}: rendered identity`).toBe(expectedPlayer);
      expect(observed.indicator.text, `${label}: rendered copy`).toBe(expectedText);
      expect(observed.indicator.text, `${label}: rendered copy shape`).toMatch(TURN_COPY);
      expect(observed.indicator.text, `${label}: Western digits only`).not.toMatch(ARABIC_INDIC_DIGITS);
      expect(Number(observed.indicator.revision), `${label}: same authoritative revision`).toBe(Number(observed.authoritative.revision));
    }

    const visibleSurfaceCount = (observed.indicator.visible === 'true' ? 1 : 0) +
      (observed.legacyHud === 'visible' ? 1 : 0) + observed.visibleDomTurnText.length;
    expect(visibleSurfaceCount, `${label}: duplicate turn text/surfaces ${JSON.stringify(observed)}`).toBeLessThanOrEqual(1);

    expect(observed.indicator.top, `${label}: top finite`).toBeGreaterThanOrEqual(12);
    expect(observed.indicator.height, `${label}: compact height`).toBeLessThanOrEqual(30.5);
    expect(observed.indicator.width, `${label}: compact width`).toBeLessThanOrEqual(124.5);
    expect(observed.layout.horizontalMargin, `${label}: horizontal safe margin`).toBeGreaterThanOrEqual(8);
    if (Number.isFinite(observed.layout.cellY)) {
      const requiredCenterSeparation = Math.min(observed.layout.viewportWidth, observed.layout.viewportHeight) * 0.28;
      expect(
        observed.layout.cellY - observed.layout.indicatorBottom,
        `${label}: indicator must remain structurally above the playable board center`
      ).toBeGreaterThan(requiredCenterSeparation);
    }
  } catch (error) {
    await attachFailureEvidence(page, testInfo, label, state.current, error);
    throw error;
  }
}

async function assertNoImpossibleFrame(page, testInfo, state, playerCount) {
  try {
    const samples = await page.evaluate(() => {
      window.__yakolakTurnVisualSamplerActive = false;
      return window.__yakolakTurnVisualSamples || [];
    });
    const impossible = samples.filter(sample => {
      if (sample.hudVisible !== 'true') return false;
      const hudPlayer = Number(sample.hudPlayer);
      const authPlayer = Number(sample.authPlayer);
      if (!Number.isInteger(hudPlayer) || hudPlayer < 1 || hudPlayer > playerCount) return true;
      if (sample.authValid !== 'true' || authPlayer !== hudPlayer) return true;
      if (!TURN_COPY.test(sample.hudText) || ARABIC_INDIC_DIGITS.test(sample.hudText)) return true;
      return false;
    });
    expect(impossible, `rendered impossible/intermediate frames: ${JSON.stringify(impossible.slice(0, 10))}`).toEqual([]);
  } catch (error) {
    await attachFailureEvidence(page, testInfo, 'frame-history', state.current, error);
    throw error;
  }
}

for (const viewport of VIEWPORTS) {
  for (const playerCount of [2, 3, 4]) {
    test(`${viewport.name} ${playerCount}p authoritative turn indicator visual/state regression`, async ({ browser }, testInfo) => {
      test.setTimeout(120000);
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        isMobile: viewport.isMobile,
        hasTouch: viewport.hasTouch,
      });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('pageerror', error => consoleErrors.push(`pageerror: ${error.message}`));
      page.on('console', message => {
        const text = message.text();
        if (message.type() === 'error' && !text.includes('favicon')) consoleErrors.push(`console: ${text}`);
      });

      const state = await installRoomApi(page, playerCount);
      try {
        await openOnlineRoom(page, playerCount);
        expect(Number(state.createBody?.targetPlayers), 'host must request the intended room size').toBe(playerCount);
        await installFrameSampler(page);

        await checkpoint(page, testInfo, 'initial-start-p1', state, playerCount, 1);

        await page.evaluate(() => window.yakolakTestPlayOneMove());
        await expect.poll(() => state.moveRequests, { timeout: 5000 }).toBe(1);
        await checkpoint(page, testInfo, 'rejected-move-stays-p1', state, playerCount, 1);

        state.moveMode = 'delay';
        state.delayedGate = deferred();
        await page.evaluate(() => window.yakolakTestPlayOneMove());
        await expect.poll(() => state.moveRequests, { timeout: 5000 }).toBe(2);
        await page.waitForFunction(() => document.body.dataset.yakolakMovePending === 'subtle', null, { timeout: 5000 });
        await checkpoint(page, testInfo, 'delayed-commit-still-p1', state, playerCount, 1);
        state.delayedGate.resolve();
        await checkpoint(page, testInfo, 'delayed-commit-resolves-p2', state, playerCount, 2);

        for (let player = 3; player <= playerCount; player += 1) {
          await pushRoom(page, state, { turnIndex: player - 1 });
          await checkpoint(page, testInfo, `transition-p${player - 1}-to-p${player}`, state, playerCount, player);
        }
        await pushRoom(page, state, { turnIndex: 0 });
        await checkpoint(page, testInfo, `transition-p${playerCount}-to-p1`, state, playerCount, 1);

        await pushRoom(page, state, { turnIndex: 1 });
        await checkpoint(page, testInfo, 'pre-reconnect-p2', state, playerCount, 2);
        state.reconnectFailures = 1;
        await wakePoll(page);
        await checkpoint(page, testInfo, 'reconnect-hides-undefined-turn', state, playerCount, null);
        await checkpoint(page, testInfo, 'reconnect-rehydrates-p2', state, playerCount, 2);

        await pushRoom(page, state, {
          status: 'finished',
          completedRounds: 1,
          winner: { seat: 'p1', color: COLORS[0] },
          scores: { ...state.current.scores, p1: 1 },
          matchComplete: false,
        });
        await checkpoint(page, testInfo, 'round-end-hidden', state, playerCount, null);

        await pushRoom(page, state, {
          status: 'playing',
          round: 2,
          turnIndex: 0,
          board: emptyBoard(),
          winner: null,
          matchComplete: false,
          lastMove: null,
        });
        await checkpoint(page, testInfo, 'next-round-p1', state, playerCount, 1);

        await pushRoom(page, state, {
          status: 'finished',
          round: 3,
          completedRounds: 3,
          winner: { seat: 'p1', color: COLORS[0] },
          matchComplete: true,
          matchWinner: { seat: 'p1', color: COLORS[0] },
          scores: { ...state.current.scores, p1: 3 },
        });
        await checkpoint(page, testInfo, 'match-end-hidden', state, playerCount, null);

        await pushRoom(page, state, {
          status: 'playing',
          round: 1,
          completedRounds: 0,
          turnIndex: 1,
          board: emptyBoard(),
          winner: null,
          matchComplete: false,
          matchWinner: null,
          scores: Object.fromEntries(state.current.players.map(player => [player.seat, 0])),
          rematch: Object.fromEntries(state.current.players.map(player => [player.seat, false])),
          lastMove: null,
          moveNumber: 0,
        });
        await checkpoint(page, testInfo, 'rematch-fresh-p2', state, playerCount, 2);

        await assertNoImpossibleFrame(page, testInfo, state, playerCount);
        expect(consoleErrors, `browser errors: ${JSON.stringify(consoleErrors)}`).toEqual([]);
      } catch (error) {
        await attachFailureEvidence(page, testInfo, `${viewport.name}-${playerCount}p-unhandled`, state.current, error);
        throw error;
      } finally {
        await context.close();
      }
    });
  }
}
