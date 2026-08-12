import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = String(process.env.YAKOLAK_TURN32_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '');
const LABEL = String(process.env.YAKOLAK_TURN32_LABEL || 'main-controlled');
const SAMPLE_COUNT = Number(process.env.YAKOLAK_TURN32_SAMPLES || 12);
const COLORS = ['marble', 'blue', 'gold', 'green'];
const VIEWPORTS = [
  { name: 'mobile-portrait', width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: 'desktop', width: 1280, height: 800, isMobile: false, hasTouch: false },
];
const BROWSER_ARGS = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
  '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage',
];

test.use({ launchOptions: { args: BROWSER_ARGS } });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function emptyBoard() {
  return Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i), {}]));
}

function makeRoom(playerCount, code) {
  const players = Array.from({ length: playerCount }, (_, i) => ({ seat: `p${i + 1}`, color: COLORS[i] }));
  return {
    code, version: 1, protocol: 5, status: 'playing', targetPlayers: playerCount,
    targetRounds: 3, winsToMatch: 3, players, turnIndex: 0, board: emptyBoard(), round: 1,
    completedRounds: 0, scores: Object.fromEntries(players.map(p => [p.seat, 0])), winner: null,
    draw: false, lastMove: null, moveNumber: 0, matchComplete: false, matchWinner: null,
    matchWinners: [], rematch: Object.fromEntries(players.map(p => [p.seat, false])),
  };
}

function pct(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1));
  return sorted[index];
}

function stats(rows, key) {
  const values = rows.map(row => Number(row[key])).filter(Number.isFinite);
  return { n: values.length, p50: pct(values, 0.50), p95: pct(values, 0.95), max: values.length ? Math.max(...values) : null };
}

function makeHarness(playerCount, code) {
  const tokens = Object.fromEntries(Array.from({ length: playerCount }, (_, i) => [`p${i + 1}`, `turn32_${code}_p${i + 1}_${'x'.repeat(32)}`]));
  const tokenSeats = new Map(Object.entries(tokens).map(([seat, token]) => [token, seat]));
  return {
    room: makeRoom(playerCount, code), tokens, tokenSeats, requestLog: [], commits: [],
    getDelayMs: 55, offlineSeats: new Set(), seatMoveCounts: Object.fromEntries(Object.keys(tokens).map(seat => [seat, 0])),
  };
}

function reply(route, status, payload = null) {
  return route.fulfill({ status, contentType: 'application/json', body: payload == null ? '' : JSON.stringify(payload) });
}

async function installMockApi(context, harness) {
  await context.route('**/api/rooms**', async route => {
    const req = route.request();
    const auth = String(req.headers().authorization || '').replace(/^Bearer\s+/i, '');
    const seat = harness.tokenSeats.get(auth) || '';
    const requestAt = Date.now();
    if (!seat) return reply(route, 401, { ok: false, error: 'unauthorized' });
    if (req.method() === 'GET') {
      const snapshotAtRequest = structuredClone(harness.room);
      const since = Number(new URL(req.url()).searchParams.get('since') || '-1');
      const delayMs = harness.getDelayMs;
      await sleep(delayMs);
      const responseAt = Date.now();
      harness.requestLog.push({ seat, method: 'GET', requestAt, responseAt, delayMs, since, version: snapshotAtRequest.version });
      if (harness.offlineSeats.has(seat)) return reply(route, 503, { ok: false, error: 'online_server_error' });
      if (since >= Number(snapshotAtRequest.version)) return route.fulfill({ status: 204, body: '' });
      return reply(route, 200, { ok: true, seat, room: snapshotAtRequest });
    }
    let body = {};
    try { body = JSON.parse(req.postData() || '{}'); } catch {}
    harness.requestLog.push({ seat, method: req.method(), action: String(body.action || ''), requestAt, responseAt: Date.now() });
    return reply(route, 409, { ok: false, error: 'diagnostic_read_only_api' });
  });
}

function chooseSyntheticMove(harness) {
  const room = harness.room;
  const seat = room.players[room.turnIndex].seat;
  const count = Number(harness.seatMoveCounts[seat] || 0);
  const size = count % 2 === 0 ? 'small' : 'medium';
  let cell = -1;
  for (let i = 0; i < 9; i += 1) {
    if (!room.board[String(i)]?.[size]) { cell = i; break; }
  }
  if (cell < 0) throw new Error(`no synthetic ${size} slot for ${seat}`);
  return { seat, size, cell };
}

function authoritativeCommit(harness) {
  const before = harness.room;
  const move = chooseSyntheticMove(harness);
  const current = before.players[before.turnIndex];
  const next = structuredClone(before);
  next.version = Number(before.version) + 1;
  next.board[String(move.cell)][move.size] = current.color;
  next.lastMove = { seat: move.seat, color: current.color, cell: move.cell, size: move.size };
  next.moveNumber = Number(before.moveNumber) + 1;
  next.turnIndex = (Number(before.turnIndex) + 1) % before.players.length;
  harness.seatMoveCounts[move.seat] += 1;
  harness.room = next;
  const commit = {
    commitAt: Date.now(), fromSeat: move.seat, toSeat: next.players[next.turnIndex].seat,
    fromPlayer: Number(before.turnIndex) + 1, toPlayer: Number(next.turnIndex) + 1,
    version: next.version, cell: move.cell, size: move.size,
  };
  harness.commits.push(commit);
  return commit;
}

async function addInstrumentation(context, code, saved) {
  await context.addInitScript(({ key, value }) => {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
    window.__turn32Net = [];
    window.__turn32Timeline = [];
    window.__turn32Last = '';
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const input = args[0];
      const init = args[1] || {};
      const url = typeof input === 'string' ? input : String(input?.url || '');
      const method = String(init.method || input?.method || 'GET').toUpperCase();
      const requestAt = Date.now();
      const response = await originalFetch(...args);
      if (url.includes('/api/rooms')) window.__turn32Net.push({ requestAt, responseAt: Date.now(), method, status: response.status, url });
      return response;
    };
    const sample = () => {
      const d = document.body?.dataset || {};
      const row = {
        t: Date.now(), authValid: d.yakolakAuthoritativeTurnValid || '', authPlayer: d.yakolakAuthoritativeTurnPlayer || '',
        authRevision: d.yakolakAuthoritativeTurnRevision || '', authLifecycle: d.yakolakAuthoritativeTurnLifecycle || '',
        indicatorVisible: d.yakolakTurnIndicatorVisible || '', indicatorPlayer: d.yakolakTurnIndicatorPlayer || '',
        indicatorRevision: d.yakolakTurnIndicatorRevision || '', matchState: d.yakolakMatchState || '',
        gameplay: d.yakolakGameplay || '', currentPlayer: d.yakolakCurrentPlayer || '',
        target: d.yakolakTestPiece || '', largeX: d.yakolakTestLargeX || '', largeY: d.yakolakTestLargeY || '',
        selected: d.yakolakSelected || '', selectedSize: d.yakolakSelectedSize || '', tray: d.yakolakTray || '',
        onlineState: d.yakolakOnlineUiState || '', movePending: d.yakolakMovePending || '',
      };
      const key = JSON.stringify({ ...row, t: 0 });
      if (key !== window.__turn32Last) {
        window.__turn32Last = key;
        window.__turn32Timeline.push(row);
        if (window.__turn32Timeline.length > 1200) window.__turn32Timeline.shift();
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, { key: `yakolak-online:${code}`, value: saved });
}

async function createClient(browser, harness, seat, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1,
    isMobile: viewport.isMobile, hasTouch: viewport.hasTouch,
  });
  await installMockApi(context, harness);
  const saved = { token: harness.tokens[seat], seat, code: harness.room.code };
  await addInstrumentation(context, harness.room.code, saved);
  const page = await context.newPage();
  await page.goto(`${BASE}/?yakolakTestFast=1&room=${encodeURIComponent(harness.room.code)}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => {
    const d = document.body.dataset;
    return ['ready', 'waiting'].includes(d.yakolakGameplay || '') && d.yakolakAuthoritativeTurnValid === 'true';
  }, null, { timeout: 90000 });
  return { seat, context, page, viewport };
}

async function resetTrace(client) {
  await client.page.evaluate(() => { window.__turn32Timeline = []; window.__turn32Net = []; window.__turn32Last = ''; });
}

function firstTime(timeline, predicate) {
  const row = timeline.find(predicate);
  return row ? Number(row.t) : null;
}

async function tap(client, x, y) {
  if (client.viewport.hasTouch) await client.page.touchscreen.tap(x, y);
  else await client.page.mouse.click(x, y);
}

async function waitLargeTarget(client) {
  await client.page.waitForFunction(() => {
    const d = document.body.dataset;
    return d.yakolakGameplay === 'ready' && Number.isFinite(Number(d.yakolakTestLargeX)) && Number.isFinite(Number(d.yakolakTestLargeY));
  }, null, { timeout: 5000 });
  return client.page.evaluate(() => ({ x: Number(document.body.dataset.yakolakTestLargeX), y: Number(document.body.dataset.yakolakTestLargeY), at: Date.now() }));
}

async function selectFirstLegalPiece(client, expectedPlayer) {
  await client.page.waitForFunction(player => {
    const d = document.body.dataset;
    return d.yakolakAuthoritativeTurnValid === 'true' && Number(d.yakolakAuthoritativeTurnPlayer) === player && d.yakolakGameplay === 'ready';
  }, expectedPlayer, { timeout: 20000 });
  const target = await waitLargeTarget(client);
  const inputDispatchAt = Date.now();
  await tap(client, target.x, target.y);
  await client.page.waitForFunction(() => document.body.dataset.yakolakGameplay === 'piece-selected' && document.body.dataset.yakolakSelectedSize === 'large', null, { timeout: 3000 });
  const acceptedAt = await client.page.evaluate(() => Date.now());
  return { targetReadyAt: target.at, inputDispatchAt, acceptedAt };
}

async function measureOne(harness, clients, options = {}) {
  const before = harness.room;
  const toIndex = (Number(before.turnIndex) + 1) % before.players.length;
  const expectedPlayer = toIndex + 1;
  const targetSeat = before.players[toIndex].seat;
  const targetClient = clients.find(c => c.seat === targetSeat);
  if (!targetClient) throw new Error(`missing target client ${targetSeat}`);
  await resetTrace(targetClient);
  const requestLogStart = harness.requestLog.length;
  const commit = authoritativeCommit(harness);

  if (options.reconnect) {
    await sleep(25);
    await targetClient.page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  }

  const input = await selectFirstLegalPiece(targetClient, expectedPlayer);
  const timeline = await targetClient.page.evaluate(() => window.__turn32Timeline || []);
  const net = await targetClient.page.evaluate(() => window.__turn32Net || []);
  const requests = harness.requestLog.slice(requestLogStart).filter(row => row.seat === targetSeat && row.method === 'GET');
  const delivered = requests.find(row => Number(row.version) === Number(commit.version) && row.requestAt >= commit.commitAt) || null;
  const responseSeen = net.find(row => row.method === 'GET' && row.status === 200 && row.responseAt >= commit.commitAt) || null;

  const authAt = firstTime(timeline, row => row.authValid === 'true' && Number(row.authPlayer) === expectedPlayer && row.authLifecycle === 'online-room');
  const indicatorAt = firstTime(timeline, row => row.indicatorVisible === 'true' && Number(row.indicatorPlayer) === expectedPlayer && row.indicatorRevision === row.authRevision);
  const cameraStartAt = firstTime(timeline, row => row.matchState === 'camera-transition' && Number(row.authPlayer || expectedPlayer) === expectedPlayer) || authAt;
  const gameplayReadyAt = firstTime(timeline, row => row.gameplay === 'ready' && Number(row.authPlayer) === expectedPlayer);
  const selectedAt = firstTime(timeline, row => row.gameplay === 'piece-selected' && row.selectedSize === 'large') || input.acceptedAt;
  expect(authAt, 'authoritative turn publication must be observed').not.toBeNull();
  expect(indicatorAt, 'turn UI update must be observed').not.toBeNull();
  expect(gameplayReadyAt, 'gameplay_ready must be observed').not.toBeNull();
  expect(delivered, 'authoritative snapshot GET must be measured').not.toBeNull();

  const responseAt = responseSeen?.responseAt || delivered.responseAt;
  return {
    label: LABEL, viewport: targetClient.viewport.name, players: before.players.length,
    from: `P${commit.fromPlayer}`, to: `P${commit.toPlayer}`, version: commit.version,
    reconnect: Boolean(options.reconnect), slowNetwork: Boolean(options.slowNetwork),
    commitAt: commit.commitAt, pollRequestAt: delivered.requestAt, transportResponseAt: responseAt,
    snapshotAcceptedAt: authAt, hydrationAt: authAt, turnPublishedAt: authAt, uiUpdatedAt: indicatorAt,
    cameraStartAt, gameplayReadyAt, targetReadyAt: input.targetReadyAt,
    inputDispatchAt: input.inputDispatchAt, inputAcceptedAt: selectedAt,
    pollWaitMs: Math.max(0, delivered.requestAt - commit.commitAt),
    networkMs: Math.max(0, responseAt - delivered.requestAt),
    snapshotHydrationMs: Math.max(0, authAt - responseAt),
    uiUpdateMs: Math.max(0, indicatorAt - authAt),
    cameraGateMs: Math.max(0, gameplayReadyAt - (cameraStartAt || authAt)),
    readyAfterCommitMs: Math.max(0, gameplayReadyAt - commit.commitAt),
    targetObserverMs: Math.max(0, input.targetReadyAt - gameplayReadyAt),
    hitTestAcceptMs: Math.max(0, selectedAt - input.inputDispatchAt),
    totalMs: Math.max(0, selectedAt - commit.commitAt),
  };
}

async function closeClients(clients) {
  await Promise.all(clients.map(async c => { try { await c.context.close(); } catch {} }));
}

async function runNormalMatrix(browser, viewport, playerCount, code) {
  const harness = makeHarness(playerCount, code);
  const clients = [];
  try {
    for (let i = 0; i < playerCount; i += 1) clients.push(await createClient(browser, harness, `p${i + 1}`, viewport));
    const rows = [];
    for (let i = 0; i < SAMPLE_COUNT; i += 1) rows.push(await measureOne(harness, clients));
    return rows;
  } finally { await closeClients(clients); }
}

async function runP3P4Special(browser, viewport, code, mode) {
  const harness = makeHarness(4, code);
  const clients = [];
  try {
    for (let i = 0; i < 4; i += 1) clients.push(await createClient(browser, harness, `p${i + 1}`, viewport));
    await measureOne(harness, clients); // P1 -> P2
    await measureOne(harness, clients); // P2 -> P3
    if (mode === 'slow') harness.getDelayMs = 650;
    const row = await measureOne(harness, clients, { slowNetwork: mode === 'slow', reconnect: mode === 'reconnect' });
    expect(row.from).toBe('P3');
    expect(row.to).toBe('P4');
    return row;
  } finally { await closeClients(clients); }
}

async function liveProductionRtt() {
  if (!LABEL.startsWith('production')) return null;
  const endpoint = `${BASE}/api/rooms`;
  const token = suffix => `turn32_${suffix}_${Date.now()}_${'q'.repeat(32)}`.slice(0, 70);
  const request = async (method, url, body, bearer = '') => {
    const start = performance.now();
    const response = await fetch(url, {
      method, cache: 'no-store', headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}), ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
    return { status: response.status, data, rttMs: Math.round((performance.now() - start) * 10) / 10 };
  };
  const p1 = token('p1');
  const p2 = token('p2');
  const created = await request('POST', endpoint, { action: 'create', color: 'marble', targetPlayers: 2, targetRounds: 3, clientToken: p1, requestId: token('create') });
  if (created.status !== 201) return { error: `create:${created.status}:${created.data?.error || ''}` };
  const code = created.data.room.code;
  const joined = await request('POST', endpoint, { action: 'join', code, color: 'blue', clientToken: p2, requestId: token('join') });
  if (joined.status !== 200) return { error: `join:${joined.status}:${joined.data?.error || ''}` };
  let room = joined.data.room;
  const postRtt = [];
  const pollRtt = [];
  const sequence = [
    ['p1', p1, 0, 'small'], ['p2', p2, 3, 'small'], ['p1', p1, 1, 'medium'],
    ['p2', p2, 4, 'medium'], ['p1', p1, 8, 'large'], ['p2', p2, 6, 'large'],
  ];
  for (let i = 0; i < sequence.length; i += 1) {
    const [seat, bearer, cell, size] = sequence[i];
    const mutationId = token(`m${i}`);
    const moved = await request('POST', endpoint, { action: 'move', code, version: room.version, cell, size, mutationId }, bearer);
    if (moved.status !== 200) break;
    postRtt.push(moved.rttMs);
    room = moved.data.room;
    const pollBearer = seat === 'p1' ? p2 : p1;
    const polled = await request('GET', `${endpoint}?code=${encodeURIComponent(code)}&since=0`, null, pollBearer);
    if (polled.status === 200) { pollRtt.push(polled.rttMs); room = polled.data.room; }
    if (room.status !== 'playing') break;
  }
  return { post: stats(postRtt.map(v => ({ v })), 'v'), poll: stats(pollRtt.map(v => ({ v })), 'v'), rawPostMs: postRtt, rawPollMs: pollRtt };
}

test('UX-TURN-32 turn-to-interact diagnostic matrix', async ({ browser }) => {
  test.setTimeout(900000);
  const all = [];
  let codeCounter = LABEL.startsWith('production') ? 60 : 20;
  for (const viewport of VIEWPORTS) {
    for (const playerCount of [2, 3, 4]) {
      const code = String(codeCounter++).padStart(2, '0').slice(-2);
      all.push(...await runNormalMatrix(browser, viewport, playerCount, code));
    }
  }
  const slow = await runP3P4Special(browser, VIEWPORTS[0], String(codeCounter++).padStart(2, '0').slice(-2), 'slow');
  const reconnect = await runP3P4Special(browser, VIEWPORTS[1], String(codeCounter++).padStart(2, '0').slice(-2), 'reconnect');
  all.push(slow, reconnect);

  const groups = [];
  for (const viewport of VIEWPORTS) {
    for (const playerCount of [2, 3, 4]) {
      const rows = all.filter(row => !row.slowNetwork && !row.reconnect && row.viewport === viewport.name && row.players === playerCount);
      groups.push({ viewport: viewport.name, players: playerCount, total: stats(rows, 'totalMs'), ready: stats(rows, 'readyAfterCommitMs'), pollWait: stats(rows, 'pollWaitMs'), network: stats(rows, 'networkMs'), camera: stats(rows, 'cameraGateMs'), hitTest: stats(rows, 'hitTestAcceptMs') });
    }
  }
  const slowest = [...all].sort((a, b) => b.totalMs - a.totalMs).slice(0, 8);
  const liveApi = await liveProductionRtt();
  const result = {
    job: 'JSRNA_JOB_a099c1ae-f512-4c0c-aee8-d1cfbfc34790', label: LABEL, base: BASE,
    sampleCountPerMatrixCell: SAMPLE_COUNT, groups, special: { slowP3P4: slow, reconnectP3P4: reconnect }, slowest, liveProductionRtt: liveApi,
    definitions: {
      totalMs: 'authoritative commit -> first actual large-piece pointer accepted as piece-selected',
      pollWaitMs: 'commit -> next polling request begins (client transport scheduling)',
      networkMs: 'poll request -> browser response observed',
      snapshotHydrationMs: 'response observed -> accepted online-room authoritative publication',
      cameraGateMs: 'camera-transition publication -> gameplay_ready',
      hitTestAcceptMs: 'pointer dispatch -> piece-selected acceptance',
      targetObserverMs: 'diagnostic coordinate availability after gameplay_ready; measurement observer overhead, not product readiness',
    },
  };
  const outDir = path.resolve('artifacts', 'ux-turn-32');
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, `${LABEL}.json`), JSON.stringify(result, null, 2));
  console.log('YAKOLAK_UX_TURN_32_RESULT', JSON.stringify(result));
  expect(groups).toHaveLength(6);
  expect(all.some(row => row.from === 'P3' && row.to === 'P4')).toBe(true);
});
