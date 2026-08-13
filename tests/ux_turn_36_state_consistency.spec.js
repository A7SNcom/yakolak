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
const COLOR_TO_DIRECTION = {
  marble: 'right',
  blue: 'back',
  gold: 'left',
  green: 'front',
};
const ARABIC_INDIC_DIGITS = /[٠-٩۰-۹]/;
const TURN_COPY = /^دور(?:ك| لاعب [1-4])$/;
const TURN_LIKE_COPY = /^دور(?:ك| لاعب(?:\s|$))/;

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

function acceptedOutcome(room) {
  if (!room || room.status !== 'playing' || room.matchComplete === true) {
    return { kind: 'hidden' };
  }
  const index = Number(room.turnIndex);
  if (!Number.isInteger(index) || index < 0 || index >= room.players.length) {
    return { kind: 'hidden' };
  }
  const player = room.players[index];
  const playerNumber = index + 1;
  return {
    kind: 'owner',
    player: playerNumber,
    seat: String(player.seat || ''),
    color: String(player.color || ''),
    direction: COLOR_TO_DIRECTION[String(player.color || '')] || '',
    local: String(player.seat || '') === 'p1',
    text: playerNumber === 1 ? 'دورك' : `دور لاعب ${playerNumber}`,
    version: Number(room.version),
  };
}

function markAccepted(state, room, reason) {
  state.accepted = structuredClone(room);
  state.acceptedReason = reason;
  state.acceptedHistory.push({
    reason,
    version: Number(room.version),
    status: String(room.status || ''),
    turnIndex: Number(room.turnIndex),
    matchComplete: room.matchComplete === true,
  });
}

async function installRoomApi(page, playerCount) {
  const state = {
    server: makeRoom(playerCount, String(40 + playerCount)),
    accepted: null,
    acceptedReason: 'none',
    acceptedHistory: [],
    moveMode: 'reject',
    delayedGate: null,
    moveRequests: 0,
    reconnectMode: 'normal',
    createBody: null,
  };

  await page.route('**/api/rooms**', async route => {
    const request = route.request();

    if (request.method() === 'GET') {
      if (state.reconnectMode === 'hold') {
        state.accepted = null;
        state.acceptedReason = 'reconnecting-unhydrated';
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'online_server_error' }),
        });
      }

      const since = Number(new URL(request.url()).searchParams.get('since') || '-1');
      if (since >= Number(state.server.version)) {
        return route.fulfill({ status: 204, body: '' });
      }

      markAccepted(state, state.server, 'poll');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, seat: 'p1', room: state.server }),
      });
    }

    const body = JSON.parse(request.postData() || '{}');
    if (body.action === 'create') {
      state.createBody = body;
      markAccepted(state, state.server, 'create');
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, token: body.clientToken, seat: 'p1', room: state.server }),
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

      state.server = commitMove(state.server, body);
      markAccepted(state, state.server, 'move');
      state.moveMode = 'observe';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, seat: 'p1', room: state.server }),
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

async function wakePoll(page) {
  await page.evaluate(() => { window.__yakolakOnlineWake = true; });
}

async function pushRoom(page, state, overrides) {
  state.server = {
    ...structuredClone(state.server),
    ...structuredClone(overrides),
    version: Number(state.server.version) + 1,
  };
  const targetVersion = Number(state.server.version);
  await wakePoll(page);
  await expect.poll(
    () => Number(state.accepted?.version ?? -1),
    { timeout: 10000, message: `room version ${targetVersion} must be accepted before UI assertion` }
  ).toBe(targetVersion);
}

async function installFrameSampler(page) {
  await page.evaluate(() => {
    window.__yakolakTurn36Samples = [];
    window.__yakolakTurn36SamplerActive = true;
    let last = '';

    const sample = () => {
      if (!window.__yakolakTurn36SamplerActive) return;
      const d = document.body.dataset;
      const row = {
        t: Math.round(performance.now()),
        authValid: d.yakolakAuthoritativeTurnValid || '',
        authPlayer: d.yakolakAuthoritativeTurnPlayer || '',
        authDirection: d.yakolakAuthoritativeTurnDirection || '',
        authRevision: d.yakolakAuthoritativeTurnRevision || '',
        hudVisible: d.yakolakTurnIndicatorVisible || '',
        hudPlayer: d.yakolakTurnIndicatorPlayer || '',
        hudText: d.yakolakTurnIndicatorText || '',
        hudLocal: d.yakolakTurnIndicatorLocal || '',
        hudRevision: d.yakolakTurnIndicatorRevision || '',
        inputOwnerDirection: d.yakolakCurrentPlayer || '',
        matchState: d.yakolakMatchState || '',
      };
      const key = JSON.stringify(row);
      if (key !== last) {
        window.__yakolakTurn36Samples.push(row);
        if (window.__yakolakTurn36Samples.length > 800) window.__yakolakTurn36Samples.shift();
        last = key;
      }
      requestAnimationFrame(sample);
    };

    requestAnimationFrame(sample);
  });
}

async function browserSnapshot(page) {
  return page.evaluate(() => {
    const d = document.body.dataset;
    const domTurnText = [];
    for (const element of document.querySelectorAll('body *')) {
      if (element.id === 'canvas' || element.tagName === 'SCRIPT' || element.tagName === 'STYLE') continue;
      if (element.children.length > 0) continue;
      const text = (element.textContent || '').trim();
      if (!/^دور(?:ك| لاعب(?:\s|$))/.test(text)) continue;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || '1') > 0 &&
        rect.width > 0 &&
        rect.height > 0
      ) {
        domTurnText.push({ id: element.id || '', text });
      }
    }

    let visibleStrings = [];
    try {
      visibleStrings = JSON.parse(d.yakolakVisibleStrings || '[]');
      if (!Array.isArray(visibleStrings)) visibleStrings = [];
    } catch {
      visibleStrings = [];
    }
    const godotTurnText = visibleStrings
      .filter(row => row && /^دور(?:ك| لاعب(?:\s|$))/.test(String(row.text || '').trim()))
      .map(row => ({ name: String(row.name || ''), text: String(row.text || '').trim() }));

    return {
      authoritative: {
        valid: d.yakolakAuthoritativeTurnValid || '',
        player: d.yakolakAuthoritativeTurnPlayer || '',
        direction: d.yakolakAuthoritativeTurnDirection || '',
        revision: d.yakolakAuthoritativeTurnRevision || '',
        source: d.yakolakAuthoritativeTurnSource || '',
        lifecycle: d.yakolakAuthoritativeTurnLifecycle || '',
      },
      indicator: {
        visible: d.yakolakTurnIndicatorVisible || '',
        player: d.yakolakTurnIndicatorPlayer || '',
        text: d.yakolakTurnIndicatorText || '',
        local: d.yakolakTurnIndicatorLocal || '',
        revision: d.yakolakTurnIndicatorRevision || '',
        source: d.yakolakTurnIndicatorSource || '',
        polling: d.yakolakTurnIndicatorPolling || '',
        digits: d.yakolakTurnIndicatorDigits || '',
      },
      input: {
        ownerDirection: d.yakolakCurrentPlayer || '',
        matchState: d.yakolakMatchState || '',
        gameplay: d.yakolakGameplay || '',
        movePending: d.yakolakMovePending || '',
      },
      legacyHud: d.yakolakHudVisibility || '',
      domTurnText,
      godotTurnText,
    };
  });
}

async function attachFailureEvidence(page, testInfo, label, state, error) {
  const safe = label.replace(/[^a-z0-9._-]+/gi, '-');
  const screenshot = await page.screenshot({ fullPage: true }).catch(() => null);
  if (screenshot) {
    await testInfo.attach(`${safe}.png`, { body: screenshot, contentType: 'image/png' });
  }

  const browser = await browserSnapshot(page).catch(snapshotError => ({ snapshotError: String(snapshotError) }));
  const frames = await page.evaluate(() => window.__yakolakTurn36Samples || []).catch(() => []);
  await testInfo.attach(`${safe}.authoritative-state.json`, {
    body: Buffer.from(JSON.stringify({
      checkpoint: label,
      acceptedAuthoritativeRoom: state.accepted,
      acceptedReason: state.acceptedReason,
      acceptedHistory: state.acceptedHistory,
      serverRoom: state.server,
      browser,
      frames,
      failure: String(error?.stack || error),
    }, null, 2)),
    contentType: 'application/json',
  });
}

async function checkpoint(page, testInfo, label, state, playerCount) {
  const expected = acceptedOutcome(state.accepted);

  try {
    if (expected.kind === 'hidden') {
      await page.waitForFunction(
        () => document.body.dataset.yakolakAuthoritativeTurnValid === 'false' &&
          document.body.dataset.yakolakTurnIndicatorVisible === 'false',
        null,
        { timeout: 10000 }
      );
    } else {
      await page.waitForFunction(
        owner => document.body.dataset.yakolakAuthoritativeTurnValid === 'true' &&
          document.body.dataset.yakolakAuthoritativeTurnPlayer === String(owner.player) &&
          document.body.dataset.yakolakTurnIndicatorVisible === 'true' &&
          document.body.dataset.yakolakTurnIndicatorPlayer === String(owner.player) &&
          document.body.dataset.yakolakTurnIndicatorText === owner.text,
        expected,
        { timeout: 10000 }
      );
    }

    // BrowserVerificationBridge refreshes rendered Control strings every 180 ms.
    await page.waitForTimeout(240);
    const observed = await browserSnapshot(page);

    expect(observed.authoritative.source, `${label}: accepted online room must own turn authority`).toBe('online-room');
    expect(observed.indicator.source, `${label}: indicator source`).toBe('authoritative-turn-signal');
    expect(observed.indicator.polling, `${label}: animation/polling must never own indicator state`).toBe('none');
    expect(observed.indicator.digits, `${label}: digit policy`).toBe('western-0-9');
    expect(observed.legacyHud, `${label}: legacy turn HUD must stay suppressed`).not.toBe('visible');

    if (expected.kind === 'hidden') {
      expect(observed.authoritative.valid, `${label}: no accepted authoritative turn`).toBe('false');
      expect(observed.indicator.visible, `${label}: no-turn state must hide indicator`).toBe('false');
      expect(observed.indicator.player, `${label}: hidden indicator cannot retain stale owner`).toBe('0');
      expect(observed.indicator.text, `${label}: hidden indicator cannot retain stale copy`).toBe('');
      expect(observed.domTurnText, `${label}: no duplicate DOM turn copy while hidden`).toEqual([]);
      expect(observed.godotTurnText, `${label}: no rendered Godot turn copy while hidden`).toEqual([]);
      return;
    }

    expect(expected.player, `${label}: accepted room owner must fit ${playerCount} seats`).toBeGreaterThanOrEqual(1);
    expect(expected.player, `${label}: accepted room owner must fit ${playerCount} seats`).toBeLessThanOrEqual(playerCount);
    expect(observed.authoritative.valid, `${label}: authoritative turn must be valid`).toBe('true');
    expect(Number(observed.authoritative.player), `${label}: authority must equal accepted room.turnIndex`).toBe(expected.player);
    expect(observed.authoritative.direction, `${label}: input-owner direction must equal accepted room color`).toBe(expected.direction);

    expect(observed.indicator.visible, `${label}: valid accepted turn must be shown`).toBe('true');
    expect(Number(observed.indicator.player), `${label}: rendered owner must equal accepted room owner`).toBe(expected.player);
    expect(observed.indicator.text, `${label}: rendered copy`).toBe(expected.text);
    expect(observed.indicator.text, `${label}: no impossible intermediate copy`).toMatch(TURN_COPY);
    expect(observed.indicator.text, `${label}: Western digits only`).not.toMatch(ARABIC_INDIC_DIGITS);
    expect(observed.indicator.local, `${label}: local-owner cue must match accepted seat p1`).toBe(expected.local ? 'true' : 'false');
    expect(Number(observed.indicator.revision), `${label}: presentation must consume the same authority revision`)
      .toBe(Number(observed.authoritative.revision));

    // gameplay_session._current_direction() is the owner used by piece/input
    // validation. It must never disagree with the owner rendered above.
    expect(observed.input.ownerDirection, `${label}: input authority must match displayed owner`).toBe(expected.direction);
    expect(observed.input.ownerDirection, `${label}: input authority must match authoritative direction`)
      .toBe(observed.authoritative.direction);

    const visibleTurnSurfaces = [...observed.domTurnText, ...observed.godotTurnText];
    expect(visibleTurnSurfaces.length, `${label}: duplicate turn text ${JSON.stringify(visibleTurnSurfaces)}`)
      .toBeLessThanOrEqual(1);
    if (visibleTurnSurfaces.length === 1) {
      expect(visibleTurnSurfaces[0].text, `${label}: the only rendered turn copy must be current`).toBe(expected.text);
      expect(visibleTurnSurfaces[0].text, `${label}: rendered surface must use Western digits`).not.toMatch(ARABIC_INDIC_DIGITS);
    }
  } catch (error) {
    await attachFailureEvidence(page, testInfo, label, state, error);
    throw error;
  }
}

async function assertFrameConsistency(page, testInfo, state, playerCount) {
  try {
    const samples = await page.evaluate(() => {
      window.__yakolakTurn36SamplerActive = false;
      return window.__yakolakTurn36Samples || [];
    });

    const impossible = samples.filter(sample => {
      const authValid = sample.authValid === 'true';
      const hudVisible = sample.hudVisible === 'true';
      const authPlayer = Number(sample.authPlayer);
      const hudPlayer = Number(sample.hudPlayer);

      if (!authValid) {
        return hudVisible || sample.hudText !== '' || (sample.hudPlayer !== '' && hudPlayer !== 0);
      }

      if (!Number.isInteger(authPlayer) || authPlayer < 1 || authPlayer > playerCount) return true;
      if (!hudVisible || hudPlayer !== authPlayer) return true;
      if (String(sample.hudRevision) !== String(sample.authRevision)) return true;

      const expectedText = authPlayer === 1 ? 'دورك' : `دور لاعب ${authPlayer}`;
      if (sample.hudText !== expectedText || !TURN_COPY.test(sample.hudText)) return true;
      if (ARABIC_INDIC_DIGITS.test(sample.hudText)) return true;

      // This is the frame-level input/display invariant: the gameplay owner used
      // by hit validation, the authoritative observer, and the visible owner are
      // the same even while camera/light animation states are changing.
      if (sample.inputOwnerDirection && sample.authDirection &&
          sample.inputOwnerDirection !== sample.authDirection) return true;

      const expectedLocal = authPlayer === 1 ? 'true' : 'false';
      if (sample.hudLocal !== expectedLocal) return true;
      return false;
    });

    expect(
      impossible,
      `no stale/flicker/input-authority mismatch frames: ${JSON.stringify(impossible.slice(0, 20))}`
    ).toEqual([]);
  } catch (error) {
    await attachFailureEvidence(page, testInfo, 'frame-consistency', state, error);
    throw error;
  }
}

for (const viewport of VIEWPORTS) {
  for (const playerCount of [2, 3, 4]) {
    test(`${viewport.name} ${playerCount}p accepted-room turn consistency`, async ({ browser }, testInfo) => {
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
        const intentionalMockHttpError = message.type() === 'error' &&
          text.includes('Failed to load resource: the server responded with a status of') &&
          (text.includes('409') || text.includes('503'));
        if (message.type() === 'error' && !text.includes('favicon') && !intentionalMockHttpError) {
          consoleErrors.push(`console: ${text}`);
        }
      });

      const state = await installRoomApi(page, playerCount);
      try {
        await openOnlineRoom(page, playerCount);
        expect(Number(state.createBody?.targetPlayers), 'host must create the requested seat count').toBe(playerCount);
        expect(Number(state.accepted?.version), 'initial room snapshot must be accepted').toBe(1);

        await installFrameSampler(page);
        await checkpoint(page, testInfo, 'initial-turn', state, playerCount);

        // Rejection must not invent a new owner or intermediate copy.
        await page.evaluate(() => window.yakolakTestPlayOneMove());
        await expect.poll(() => state.moveRequests, { timeout: 5000 }).toBe(1);
        await checkpoint(page, testInfo, 'rejected-move', state, playerCount);
        await page.waitForFunction(
          () => document.body.dataset.yakolakMovePending !== 'subtle',
          null,
          { timeout: 5000 }
        );

        // Pending confirmation retains the last accepted room owner. Only the
        // accepted success snapshot is allowed to advance the visible owner.
        state.moveMode = 'delay';
        state.delayedGate = deferred();
        await page.evaluate(() => window.yakolakTestPlayOneMove());
        await expect.poll(() => state.moveRequests, { timeout: 5000 }).toBe(2);
        await page.waitForFunction(
          () => document.body.dataset.yakolakMovePending === 'subtle',
          null,
          { timeout: 5000 }
        );
        await checkpoint(page, testInfo, 'delayed-confirmation-before-accept', state, playerCount);
        state.delayedGate.resolve();
        await expect.poll(() => Number(state.accepted?.version ?? -1), { timeout: 10000 }).toBe(2);
        await checkpoint(page, testInfo, 'delayed-confirmation-after-accept', state, playerCount);

        // Cover every seat edge for the configured room size.
        for (let player = 3; player <= playerCount; player += 1) {
          await pushRoom(page, state, { turnIndex: player - 1 });
          await checkpoint(page, testInfo, `seat-transition-p${player - 1}-to-p${player}`, state, playerCount);
        }
        await pushRoom(page, state, { turnIndex: 0 });
        await checkpoint(page, testInfo, `seat-transition-p${playerCount}-to-p1`, state, playerCount);

        // Reconnect explicitly invalidates client authority until a fresh room
        // snapshot is accepted; stale pre-disconnect ownership must disappear.
        await pushRoom(page, state, { turnIndex: 1 });
        await checkpoint(page, testInfo, 'pre-reconnect', state, playerCount);
        state.reconnectMode = 'hold';
        await wakePoll(page);
        await expect.poll(() => state.accepted === null, { timeout: 10000 }).toBe(true);
        await checkpoint(page, testInfo, 'reconnect-unhydrated', state, playerCount);
        state.reconnectMode = 'normal';
        await wakePoll(page);
        await expect.poll(() => Number(state.accepted?.version ?? -1), { timeout: 10000 })
          .toBe(Number(state.server.version));
        await checkpoint(page, testInfo, 'reconnect-hydrated', state, playerCount);

        await pushRoom(page, state, {
          status: 'finished',
          completedRounds: 1,
          winner: { seat: 'p1', color: COLORS[0] },
          scores: { ...state.server.scores, p1: 1 },
          matchComplete: false,
        });
        await checkpoint(page, testInfo, 'round-finish', state, playerCount);

        await pushRoom(page, state, {
          status: 'playing',
          round: 2,
          turnIndex: 0,
          board: emptyBoard(),
          winner: null,
          matchComplete: false,
          lastMove: null,
        });
        await checkpoint(page, testInfo, 'next-round', state, playerCount);

        await pushRoom(page, state, {
          status: 'finished',
          round: 3,
          completedRounds: 3,
          winner: { seat: 'p1', color: COLORS[0] },
          matchComplete: true,
          matchWinner: { seat: 'p1', color: COLORS[0] },
          scores: { ...state.server.scores, p1: 3 },
        });
        await checkpoint(page, testInfo, 'match-end', state, playerCount);

        await pushRoom(page, state, {
          status: 'playing',
          round: 1,
          completedRounds: 0,
          turnIndex: 1,
          board: emptyBoard(),
          winner: null,
          matchComplete: false,
          matchWinner: null,
          scores: Object.fromEntries(state.server.players.map(player => [player.seat, 0])),
          rematch: Object.fromEntries(state.server.players.map(player => [player.seat, false])),
          lastMove: null,
          moveNumber: 0,
        });
        await checkpoint(page, testInfo, 'rematch', state, playerCount);

        await assertFrameConsistency(page, testInfo, state, playerCount);
        expect(consoleErrors, `browser errors: ${JSON.stringify(consoleErrors)}`).toEqual([]);
      } catch (error) {
        await attachFailureEvidence(page, testInfo, `${viewport.name}-${playerCount}p-unhandled`, state, error);
        throw error;
      } finally {
        await context.close();
      }
    });
  }
}
