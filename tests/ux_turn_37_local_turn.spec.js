import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BROWSER_ARGS = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
  '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage',
];
const COLORS = ['marble', 'blue', 'gold', 'green'];

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, launchOptions: { args: BROWSER_ARGS } });

function emptyBoard() {
  return Object.fromEntries(Array.from({ length: 9 }, (_, index) => [String(index), {}]));
}

function makeRoom(code, turnIndex, version = 3) {
  const players = COLORS.map((color, index) => ({ seat: `p${index + 1}`, color }));
  return {
    code, version, protocol: 5, status: 'playing', targetPlayers: 4, targetRounds: 3, winsToMatch: 3,
    players, turnIndex, board: emptyBoard(), round: 1, completedRounds: 0,
    scores: Object.fromEntries(players.map(player => [player.seat, 0])), winner: null, draw: false,
    lastMove: null, moveNumber: 0, matchComplete: false, matchWinner: null, matchWinners: [],
    rematch: Object.fromEntries(players.map(player => [player.seat, false])),
  };
}

async function installRestoredRoom(page, { code, localSeat, turnIndex }) {
  const state = { current: makeRoom(code, turnIndex), localSeat, getRequests: 0, moveRequests: 0, failNextGet: false, staleOnce: null };
  await page.addInitScript(({ savedCode, savedSeat }) => {
    sessionStorage.setItem(`yakolak-online:${savedCode}`, JSON.stringify({ token: 'test', seat: savedSeat, code: savedCode }));
  }, { savedCode: code, savedSeat: localSeat });

  await page.route('**/api/rooms**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      state.getRequests += 1;
      if (state.failNextGet) {
        state.failNextGet = false;
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'online_server_error' }) });
      }
      if (state.staleOnce) {
        const stale = state.staleOnce;
        state.staleOnce = null;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, seat: state.localSeat, room: stale }) });
      }
      const since = Number(new URL(request.url()).searchParams.get('since') || '-1');
      if (since >= Number(state.current.version)) return route.fulfill({ status: 204, body: '' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, seat: state.localSeat, room: state.current }) });
    }
    const body = JSON.parse(request.postData() || '{}');
    if (body.action === 'move') {
      state.moveRequests += 1;
      return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'occupied_slot' }) });
    }
    return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'invalid_action' }) });
  });
  return state;
}

async function openRestoredRoom(page, code) {
  await page.goto(`http://127.0.0.1:8000/?yakolakTestFast=1&room=${code}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.yakolakIntroHandoffEvent === 'consumed', null, { timeout: 45000 });
  // Hydration is proven by accepted authoritative turn + indicator contract. Do not
  // require local gameplay input readiness here: a remote owner's turn intentionally
  // leaves the local client non-actionable while the turn indicator must stay valid.
  await page.waitForFunction(() => document.body.dataset.yakolakAuthoritativeTurnValid === 'true' && document.body.dataset.yakolakTurnIndicatorVisible === 'true' && document.body.dataset.yakolakTurnIndicatorContract === 'pass', null, { timeout: 45000 });
}

async function wakePoll(page) { await page.evaluate(() => { window.__yakolakOnlineWake = true; }); }

async function snapshot(page) {
  return page.evaluate(() => {
    const d = document.body.dataset;
    return {
      auth: { valid: d.yakolakAuthoritativeTurnValid || '', player: Number(d.yakolakAuthoritativeTurnPlayer || 0), revision: Number(d.yakolakAuthoritativeTurnRevision || 0), source: d.yakolakAuthoritativeTurnSource || '' },
      hud: {
        visible: d.yakolakTurnIndicatorVisible || '', text: d.yakolakTurnIndicatorText || '', player: Number(d.yakolakTurnIndicatorPlayer || 0), local: d.yakolakTurnIndicatorLocal || '',
        revision: Number(d.yakolakTurnIndicatorRevision || 0), source: d.yakolakTurnIndicatorSource || '', emphasis: d.yakolakTurnIndicatorEmphasis || '', localCue: d.yakolakTurnIndicatorLocalCue || '',
        motion: d.yakolakTurnIndicatorMotion || '', pointer: d.yakolakTurnIndicatorPointer || '', overlay: d.yakolakTurnIndicatorOverlay || '', height: Number(d.yakolakTurnIndicatorHeight || 0),
      },
      designAnimation: d.yakolakDesignTurnCueAnimation || '',
    };
  });
}

async function waitForOwner(page, player, local) {
  await page.waitForFunction(({ expectedPlayer, expectedLocal }) => {
    const d = document.body.dataset;
    return d.yakolakAuthoritativeTurnValid === 'true' && Number(d.yakolakAuthoritativeTurnPlayer || 0) === expectedPlayer && d.yakolakTurnIndicatorVisible === 'true' && Number(d.yakolakTurnIndicatorPlayer || 0) === expectedPlayer && d.yakolakTurnIndicatorLocal === (expectedLocal ? 'true' : 'false');
  }, { expectedPlayer: player, expectedLocal: local }, { timeout: 10000 });
}

function expectLocalCue(state, player) {
  expect(state.auth.valid).toBe('true'); expect(state.auth.player).toBe(player); expect(state.auth.source).toBe('online-room');
  expect(state.hud.visible).toBe('true'); expect(state.hud.player).toBe(player); expect(state.hud.text).toBe('دورك'); expect(state.hud.local).toBe('true');
  expect(state.hud.source).toBe('authoritative-turn-signal'); expect(state.hud.revision).toBe(state.auth.revision); expect(state.hud.emphasis).toBe('local-semantic-contrast');
  expect(state.hud.localCue).toBe('semantic-copy+inverted-design-tokens'); expect(state.hud.motion).toBe('none'); expect(state.hud.pointer).toBe('ignore'); expect(state.hud.overlay).toBe('true');
  expect(state.hud.height).toBe(30); expect(state.designAnimation).toBe('none');
}

async function installSampler(page) {
  await page.evaluate(() => {
    window.__yakolakTurn37Samples = []; window.__yakolakTurn37SamplerActive = true; let last = '';
    const sample = () => {
      if (!window.__yakolakTurn37SamplerActive) return;
      const d = document.body.dataset;
      const row = { authValid: d.yakolakAuthoritativeTurnValid || '', authPlayer: d.yakolakAuthoritativeTurnPlayer || '', hudVisible: d.yakolakTurnIndicatorVisible || '', hudPlayer: d.yakolakTurnIndicatorPlayer || '', hudText: d.yakolakTurnIndicatorText || '', hudLocal: d.yakolakTurnIndicatorLocal || '', hudEmphasis: d.yakolakTurnIndicatorEmphasis || '', hudRevision: d.yakolakTurnIndicatorRevision || '' };
      const key = JSON.stringify(row); if (key !== last) { window.__yakolakTurn37Samples.push(row); last = key; } requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

// CI WebGL startup can be slow after the full online gate suite; these ceilings
// protect the same assertions without relaxing any authoritative-turn invariant.
test('UX-TURN-37 initial authoritative local turn is unmistakably local', async ({ page }) => {
  test.setTimeout(150000); mkdirSync('artifacts', { recursive: true });
  await installRestoredRoom(page, { code: '71', localSeat: 'p1', turnIndex: 0 }); await openRestoredRoom(page, '71'); await waitForOwner(page, 1, true);
  expectLocalCue(await snapshot(page), 1); await page.screenshot({ path: 'artifacts/ux-turn-37-initial-local.png', fullPage: true });
});

test('UX-TURN-37 P3 to P4 local, rejected and stale input, and reconnect retarget atomically', async ({ page }) => {
  test.setTimeout(180000); mkdirSync('artifacts', { recursive: true });
  const state = await installRestoredRoom(page, { code: '74', localSeat: 'p4', turnIndex: 2 }); await openRestoredRoom(page, '74'); await waitForOwner(page, 3, false); await installSampler(page);
  let observed = await snapshot(page); expect(observed.hud.text).toBe('دور لاعب 3'); expect(observed.hud.local).toBe('false'); expect(observed.hud.emphasis).toBe('remote-owner');

  state.current = { ...structuredClone(state.current), version: state.current.version + 1, turnIndex: 3 }; await wakePoll(page); await waitForOwner(page, 4, true);
  observed = await snapshot(page); expectLocalCue(observed, 4); const p4Revision = observed.hud.revision; await page.screenshot({ path: 'artifacts/ux-turn-37-p4-local.png', fullPage: true });

  const beforeRejected = state.moveRequests; await page.evaluate(() => window.yakolakTestPlayOneMove()); await expect.poll(() => state.moveRequests, { timeout: 5000 }).toBe(beforeRejected + 1);
  await page.waitForTimeout(120); observed = await snapshot(page); expectLocalCue(observed, 4); expect(observed.hud.revision).toBe(p4Revision);

  const getsBeforeStale = state.getRequests; state.staleOnce = { ...structuredClone(state.current), version: state.current.version - 1, turnIndex: 2 }; await wakePoll(page);
  await expect.poll(() => state.getRequests, { timeout: 5000 }).toBeGreaterThan(getsBeforeStale); await page.waitForTimeout(160); observed = await snapshot(page); expectLocalCue(observed, 4); expect(observed.hud.revision).toBe(p4Revision);

  state.current = { ...structuredClone(state.current), version: state.current.version + 1, turnIndex: 3 }; state.failNextGet = true;
  const reconnectSampleStart = await page.evaluate(() => window.__yakolakTurn37Samples.length); await wakePoll(page);
  await page.waitForFunction(() => document.body.dataset.yakolakAuthoritativeTurnValid === 'false' && document.body.dataset.yakolakTurnIndicatorVisible === 'false', null, { timeout: 10000 });
  await waitForOwner(page, 4, true); observed = await snapshot(page); expectLocalCue(observed, 4); expect(observed.hud.revision).toBeGreaterThan(p4Revision);

  const reconnectSamples = await page.evaluate(start => { window.__yakolakTurn37SamplerActive = false; return window.__yakolakTurn37Samples.slice(start); }, reconnectSampleStart);
  expect(reconnectSamples.some(sample => sample.hudVisible === 'false')).toBe(true);
  const impossible = reconnectSamples.filter(sample => sample.authValid === 'true' && sample.authPlayer === '4' && (sample.hudVisible !== 'true' || sample.hudPlayer !== '4' || sample.hudText !== 'دورك' || sample.hudLocal !== 'true' || sample.hudEmphasis !== 'local-semantic-contrast'));
  expect(impossible).toEqual([]);
});