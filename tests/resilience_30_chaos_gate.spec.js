import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { test } from '@playwright/test';
import { __testing } from '../api/rooms.js';

const {
  applyMove,
  createState,
  joinState,
  mutationApplied,
  publicState,
  recordMutation,
  rematchState,
} = __testing;

const BASE = 'http://127.0.0.1:8000';
const CODE = '30';
const COLORS = ['marble', 'blue', 'gold', 'green'];
const SEATS = ['p1', 'p2', 'p3', 'p4'];
const SEED = String(process.env.YAKOLAK_CHAOS_SEED || 'resilience-30-20260812');
const SETTLED_LIGHT_STATES = new Set(['final', 'stable', 'immediate']);
const USELESS_BLOCKING_PHRASES = [
  'جارٍ تثبيت الحركة',
  'جاري تثبيت الحركة',
  'ننتظر تأكيد الغرفة قبل الحركة التالية',
  'بانتظار تأكيد الحركة',
  'انتظر تأكيد الحركة',
];
const BROWSER_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-webgl',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--disable-dev-shm-usage',
];

test.use({ launchOptions: { args: BROWSER_ARGS } });

function hashInt(value) {
  return Number.parseInt(createHash('sha256').update(String(value)).digest('hex').slice(0, 8), 16) >>> 0;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function token(label) {
  return createHash('sha256').update(`${SEED}:${label}`).digest('hex');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

function compactRoom(room) {
  if (!room) return null;
  return {
    code: room.code,
    version: room.version,
    status: room.status,
    round: room.round,
    completedRounds: room.completedRounds,
    turnIndex: room.turnIndex,
    scores: room.scores,
    board: room.board,
    moveNumber: room.moveNumber,
    lastMove: room.lastMove,
    winner: room.winner,
    draw: room.draw,
    matchComplete: room.matchComplete,
    matchWinner: room.matchWinner,
    rematch: room.rematch,
  };
}

function makeHarness() {
  let state = createState(COLORS[0], 4, 3);
  state = joinState(state, 'p2', COLORS[1]);
  state = joinState(state, 'p3', COLORS[2]);
  state = joinState(state, 'p4', COLORS[3]);
  assert.equal(state.status, 'playing');

  const seatTokens = Object.fromEntries(SEATS.map(seat => [seat, token(`seat:${seat}`)]));
  const tokenSeats = new Map(Object.entries(seatTokens).map(([seat, value]) => [value, seat]));
  const harness = {
    state,
    version: 4,
    seatTokens,
    tokenSeats,
    requestCounters: new Map(),
    appDeliveries: new Map(),
    timeline: [],
    offlineSeats: new Set(),
    dropMutationId: '',
    reorderGate: null,
    commitCount: 0,
  };

  harness.room = () => ({ code: CODE, version: harness.version, ...publicState(harness.state) });
  harness.log = (kind, detail = {}) => {
    harness.timeline.push({ index: harness.timeline.length, kind, ...structuredClone(detail) });
  };
  harness.latency = (seat, method, action) => {
    const key = `${seat}:${method}:${action}`;
    const count = Number(harness.requestCounters.get(key) || 0) + 1;
    harness.requestCounters.set(key, count);
    return 18 + (hashInt(`${SEED}:${key}:${count}`) % 83);
  };
  harness.countMutation = mutationId => (harness.state._mutations || []).filter(entry => entry.id === mutationId).length;
  return harness;
}

function jsonReply(route, status, payload) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: payload == null ? '' : JSON.stringify(payload),
  });
}

async function installApiRoute(context, harness) {
  await context.route('**/api/rooms**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const auth = String(request.headers().authorization || '').replace(/^Bearer\s+/i, '');
    const seat = harness.tokenSeats.get(auth) || '';
    let body = {};
    if (request.method() === 'POST') {
      try { body = JSON.parse(request.postData() || '{}'); } catch {}
    }
    const action = request.method() === 'GET' ? 'poll' : String(body.action || '');
    const latencyMs = harness.latency(seat || 'unknown', request.method(), action);
    harness.log('request', { seat, method: request.method(), action, latencyMs, version: body.version, mutationId: body.mutationId || '' });
    await sleep(latencyMs);

    if (!seat) return jsonReply(route, 401, { ok: false, error: 'unauthorized' });
    if (harness.offlineSeats.has(seat)) {
      harness.log('network-offline', { seat, action });
      return jsonReply(route, 503, { ok: false, error: 'online_server_error' });
    }

    if (request.method() === 'GET') {
      const order = url.searchParams.get('chaosOrder') || '';
      if (order === 'stale') {
        const snapshot = structuredClone(harness.room());
        harness.log('reorder-stale-held', { seat, version: snapshot.version });
        await harness.reorderGate.promise;
        harness.log('reorder-stale-released', { seat, version: snapshot.version });
        return jsonReply(route, 200, { ok: true, seat, room: snapshot });
      }
      if (order === 'fresh') {
        const snapshot = structuredClone(harness.room());
        harness.log('reorder-fresh-delivered', { seat, version: snapshot.version });
        return jsonReply(route, 200, { ok: true, seat, room: snapshot });
      }
      const since = Number(url.searchParams.get('since') || '-1');
      if (since >= harness.version) return route.fulfill({ status: 204, body: '' });
      const snapshot = structuredClone(harness.room());
      harness.appDeliveries.set(seat, snapshot);
      harness.log('app-snapshot', { seat, version: snapshot.version, turnIndex: snapshot.turnIndex, round: snapshot.round });
      return jsonReply(route, 200, { ok: true, seat, room: snapshot });
    }

    if (request.method() !== 'POST') return jsonReply(route, 405, { ok: false, error: 'method_not_allowed' });
    if (action !== 'move' && action !== 'rematch') return jsonReply(route, 400, { ok: false, error: 'invalid_action' });

    const mutationId = String(body.mutationId || '');
    if (mutationApplied(harness.state, seat, action, mutationId)) {
      harness.log('duplicate-ack', { seat, action, mutationId, version: harness.version });
      return jsonReply(route, 200, { ok: true, seat, room: harness.room(), duplicate: true });
    }
    if (Number(body.version) !== harness.version) {
      harness.log('version-conflict', { seat, action, mutationId, expected: body.version, canonical: harness.version });
      return jsonReply(route, 409, { ok: false, error: 'version_conflict', room: harness.room() });
    }

    let next;
    try {
      next = action === 'move'
        ? applyMove(harness.state, seat, body)
        : rematchState(harness.state, seat);
    } catch (error) {
      harness.log('mutation-rejected', { seat, action, mutationId, error: String(error?.message || error), version: harness.version });
      return jsonReply(route, 409, { ok: false, error: String(error?.message || 'mutation_rejected') });
    }

    harness.state = recordMutation(next, seat, action, mutationId);
    harness.version += 1;
    harness.commitCount += 1;
    harness.log('commit', {
      seat,
      action,
      mutationId,
      version: harness.version,
      turnIndex: harness.state.turnIndex,
      round: harness.state.round,
      moveNumber: harness.state.moveNumber,
      status: harness.state.status,
      matchComplete: harness.state.matchComplete,
    });

    if (harness.dropMutationId === mutationId) {
      harness.dropMutationId = '';
      harness.log('response-lost-after-commit', { seat, action, mutationId, version: harness.version });
      return jsonReply(route, 503, { ok: false, error: 'online_server_error' });
    }
    return jsonReply(route, 200, { ok: true, seat, room: harness.room() });
  });
}

async function createClient(browser, harness, seat) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await installApiRoute(context, harness);
  const saved = { token: harness.seatTokens[seat], seat, code: CODE };
  await context.addInitScript(({ key, value }) => {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
  }, { key: `yakolak-online:${CODE}`, value: saved });
  const page = await context.newPage();
  page.on('pageerror', error => harness.log('page-error', { seat, message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') harness.log('console-error', { seat, message: message.text() });
  });
  await page.goto(`${BASE}/?yakolakTestFast=1&room=${CODE}`, { waitUntil: 'domcontentloaded' });
  return { seat, context, page, token: harness.seatTokens[seat] };
}

async function waitClientReady(client) {
  await client.page.waitForFunction(() => {
    const d = document.body.dataset;
    return d.yakolakGameplay === 'ready' &&
      d.yakolakAuthoritativeTurnValid === 'true' &&
      d.yakolakTurnIndicatorContract === 'pass' &&
      d.yakolakTurnLightOwner === 'single-authoritative-controller';
  }, null, { timeout: 90000 });
}

async function wake(client) {
  await client.page.evaluate(() => { window.__yakolakOnlineWake = true; });
}

async function wakeAll(clients) {
  await Promise.all(clients.map(wake));
}

async function rawPost(client, body) {
  return client.page.evaluate(async ({ tokenValue, payload }) => {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      cache: 'no-store',
      headers: { authorization: `Bearer ${tokenValue}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    return { status: response.status, data: await response.json().catch(() => ({})), at: performance.now() };
  }, { tokenValue: client.token, payload: body });
}

async function rawGet(client, order) {
  return client.page.evaluate(async ({ tokenValue, code, orderValue }) => {
    const response = await fetch(`/api/rooms?code=${encodeURIComponent(code)}&since=-1&chaosOrder=${encodeURIComponent(orderValue)}`, {
      cache: 'no-store', headers: { authorization: `Bearer ${tokenValue}`, accept: 'application/json' },
    });
    return { status: response.status, data: await response.json().catch(() => ({})), at: performance.now() };
  }, { tokenValue: client.token, code: CODE, orderValue: order });
}

async function browserSnapshot(client) {
  return client.page.evaluate(phrases => {
    const d = document.body.dataset;
    const state = d.yakolakOnlineUiState || '';
    const action = d.yakolakOnlineUiAction || '';
    const message = d.yakolakOnlineUiMessage || '';
    const blockerRemoved = d.yakolakMoveBlocker === 'removed';
    const surfaces = [];
    const stateCardRendered = Boolean(state && message && !(state === 'submitting-move' && blockerRemoved));
    if (stateCardRendered) surfaces.push({ kind: 'state-card', state, action, text: message, blocking: true });
    for (const selector of ['#yakolak-move-pending', '#yakolak-online-status']) {
      const element = document.querySelector(selector);
      if (!element) continue;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const visible = style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0 && rect.width > 0 && rect.height > 0;
      const text = (element.textContent || '').trim();
      if (visible && text) surfaces.push({ kind: selector, state, action: 'none', text, blocking: style.pointerEvents !== 'none' });
    }
    let visibleStrings = [];
    try { visibleStrings = JSON.parse(d.yakolakVisibleStrings || '[]'); } catch {}
    const rendered = [...surfaces.map(item => item.text), ...visibleStrings.map(item => String(item.text || ''))].join('\n');
    return {
      gameplay: d.yakolakGameplay || '',
      onlineState: state,
      onlineAction: action,
      onlineMessage: message,
      moveBlocker: d.yakolakMoveBlocker || '',
      authoritative: {
        valid: d.yakolakAuthoritativeTurnValid || '',
        player: d.yakolakAuthoritativeTurnPlayer || '',
        direction: d.yakolakAuthoritativeTurnDirection || '',
        revision: d.yakolakAuthoritativeTurnRevision || '',
        lifecycle: d.yakolakAuthoritativeTurnLifecycle || '',
      },
      indicator: {
        visible: d.yakolakTurnIndicatorVisible || '',
        player: d.yakolakTurnIndicatorPlayer || '',
        revision: d.yakolakTurnIndicatorRevision || '',
        lifecycle: d.yakolakTurnIndicatorLifecycle || '',
        contract: d.yakolakTurnIndicatorContract || '',
      },
      light: {
        owner: d.yakolakTurnLightOwner || '',
        state: d.yakolakTurnLightState || '',
        direction: d.yakolakTurnLightDirection || '',
        revision: d.yakolakTurnLightRevision || '',
        finalCount: d.yakolakTurnLightFinalCount || '',
      },
      surfaces,
      uselessHits: phrases.filter(phrase => rendered.includes(phrase)),
    };
  }, USELESS_BLOCKING_PHRASES);
}

function assertNoUselessBlocking(snapshot, label) {
  assert.deepEqual(snapshot.uselessHits, [], `${label}: useless blocking copy visible`);
  assert.ok(snapshot.surfaces.length <= 1, `${label}: duplicate visible status surfaces ${JSON.stringify(snapshot.surfaces)}`);
  const uselessBlockers = snapshot.surfaces.filter(surface => surface.blocking && surface.action === 'none');
  assert.deepEqual(uselessBlockers, [], `${label}: non-actionable blocking surface visible`);
}

async function waitActiveUi(client, expectedPlayer, label) {
  await client.page.waitForFunction(({ player, states }) => {
    const d = document.body.dataset;
    return d.yakolakGameplay === 'ready' &&
      d.yakolakAuthoritativeTurnValid === 'true' &&
      Number(d.yakolakAuthoritativeTurnPlayer) === player &&
      d.yakolakTurnIndicatorVisible === 'true' &&
      Number(d.yakolakTurnIndicatorPlayer) === player &&
      d.yakolakTurnIndicatorRevision === d.yakolakAuthoritativeTurnRevision &&
      d.yakolakTurnLightRevision === d.yakolakAuthoritativeTurnRevision &&
      d.yakolakTurnLightDirection === d.yakolakAuthoritativeTurnDirection &&
      d.yakolakTurnLightFinalCount === '1' &&
      states.includes(d.yakolakTurnLightState || '');
  }, { player: expectedPlayer, states: [...SETTLED_LIGHT_STATES] }, { timeout: 20000 });
  const snapshot = await browserSnapshot(client);
  assert.equal(snapshot.indicator.contract, 'pass', `${label}: compact turn indicator contract`);
  assert.equal(snapshot.indicator.player, snapshot.authoritative.player, `${label}: indicator equals authoritative turn`);
  assert.equal(snapshot.indicator.revision, snapshot.authoritative.revision, `${label}: indicator revision equals authoritative revision`);
  assert.equal(snapshot.light.owner, 'single-authoritative-controller', `${label}: exactly one lighting controller`);
  assert.equal(snapshot.light.finalCount, '1', `${label}: exactly one player has settled final focus`);
  assertNoUselessBlocking(snapshot, label);
  return snapshot;
}

async function waitTerminalUi(client, label) {
  await client.page.waitForFunction(states => {
    const d = document.body.dataset;
    return d.yakolakAuthoritativeTurnValid === 'false' &&
      d.yakolakTurnLightFinalCount === '0' &&
      states.includes(d.yakolakTurnLightState || '');
  }, [...SETTLED_LIGHT_STATES], { timeout: 20000 });
  const snapshot = await browserSnapshot(client);
  assert.equal(snapshot.light.finalCount, '0', `${label}: terminal state has no stale player focus`);
  assertNoUselessBlocking(snapshot, label);
  return snapshot;
}

async function waitUntil(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(40);
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function checkpointActive(harness, clients, label) {
  await wakeAll(clients);
  const canonical = harness.room();
  const expectedPlayer = Number(canonical.turnIndex) + 1;
  await waitUntil(
    () => SEATS.every(seat => Number(harness.appDeliveries.get(seat)?.version || -1) === Number(canonical.version)),
    20000,
    `${label}: all app deliveries version ${canonical.version}`
  );
  const snapshots = await Promise.all(clients.map(client => waitActiveUi(client, expectedPlayer, `${label}:${client.seat}`)));
  for (const seat of SEATS) {
    assert.deepEqual(harness.appDeliveries.get(seat), canonical, `${label}:${seat}: board/turn/score/version converge`);
  }
  assert.ok(canonical.players[canonical.turnIndex], `${label}: legal turn owner exists (no deadlock)`);
  harness.log('checkpoint-active', { label, canonical: compactRoom(canonical), clients: snapshots.map((snapshot, index) => ({ seat: clients[index].seat, ...snapshot })) });
}

async function checkpointTerminal(harness, clients, label) {
  await wakeAll(clients);
  const canonical = harness.room();
  await waitUntil(
    () => SEATS.every(seat => Number(harness.appDeliveries.get(seat)?.version || -1) === Number(canonical.version)),
    20000,
    `${label}: all terminal app deliveries version ${canonical.version}`
  );
  const snapshots = await Promise.all(clients.map(client => waitTerminalUi(client, `${label}:${client.seat}`)));
  for (const seat of SEATS) assert.deepEqual(harness.appDeliveries.get(seat), canonical, `${label}:${seat}: terminal board/turn/score/version converge`);
  harness.log('checkpoint-terminal', { label, canonical: compactRoom(canonical), clients: snapshots.map((snapshot, index) => ({ seat: clients[index].seat, ...snapshot })) });
}

function chooseMove(state, winnerStep) {
  const current = state.players[state.turnIndex];
  assert.ok(current, 'current player exists');
  if (current.seat === 'p1') {
    assert.ok(winnerStep >= 0 && winnerStep < 3, `p1 winner step ${winnerStep}`);
    return { cell: [0, 1, 2][winnerStep], size: 'small' };
  }
  for (const size of ['large', 'medium', 'small']) {
    for (const cell of [8, 7, 6, 5, 4, 3, 2, 1, 0]) {
      if (size === 'small' && cell <= 2) continue;
      try {
        const candidate = applyMove(state, current.seat, { cell, size });
        if (candidate.status === 'playing') return { cell, size };
      } catch {}
    }
  }
  throw new Error(`no safe non-winning move for ${current.seat}`);
}

async function delayedCall(ms, fn) {
  await sleep(ms);
  return fn();
}

async function raceLegalMove(harness, clients, move, mutationId, rng, { dropResponse = false } = {}) {
  const before = harness.room();
  const ownerSeat = before.players[before.turnIndex].seat;
  const owner = clients.find(client => client.seat === ownerSeat);
  assert.ok(owner, `owner client ${ownerSeat} exists`);
  const outsiders = clients.filter(client => client.seat !== ownerSeat).slice(0, 2);
  const body = { action: 'move', code: CODE, version: before.version, ...move, mutationId };
  if (dropResponse) harness.dropMutationId = mutationId;

  const outsiderPromises = outsiders.map((client, index) => delayedCall(5 + Math.floor(rng() * 35) + index * 3, () => rawPost(client, {
    action: 'move', code: CODE, version: before.version,
    cell: (Number(move.cell) + index + 4) % 9,
    size: index === 0 ? 'medium' : 'large',
    mutationId: token(`oot:${mutationId}:${client.seat}`),
  })));

  if (dropResponse) {
    const [lost, ...outsiderResults] = await Promise.all([
      delayedCall(4 + Math.floor(rng() * 20), () => rawPost(owner, body)),
      ...outsiderPromises,
    ]);
    assert.equal(lost.status, 503, 'lost-response injection occurs after commit');
    for (const result of outsiderResults) {
      assert.equal(result.status, 409, `out-of-turn race rejected: ${JSON.stringify(result)}`);
      assert.ok(['not_your_turn', 'version_conflict'].includes(result.data.error), `expected out-of-turn/version conflict, got ${JSON.stringify(result.data)}`);
    }
    assert.equal(harness.version, before.version + 1, 'lost response still commits exactly one canonical version');
    assert.equal(harness.countMutation(mutationId), 1, 'lost response mutation identity committed once');
    return { before, after: harness.room(), owner, body, lost };
  }

  const ownerA = delayedCall(3 + Math.floor(rng() * 18), () => rawPost(owner, body));
  const ownerB = delayedCall(7 + Math.floor(rng() * 24), () => rawPost(owner, body));
  const results = await Promise.all([ownerA, ownerB, ...outsiderPromises]);
  const ownerResults = results.slice(0, 2);
  const outsiderResults = results.slice(2);
  assert.ok(ownerResults.every(result => result.status === 200), `duplicate tap pair returns success/idempotent ack: ${JSON.stringify(ownerResults)}`);
  assert.equal(ownerResults.filter(result => result.data.duplicate === true).length, 1, 'exactly one duplicate tap is acknowledged as duplicate');
  for (const result of outsiderResults) {
    assert.equal(result.status, 409, `out-of-turn race rejected: ${JSON.stringify(result)}`);
    assert.ok(['not_your_turn', 'version_conflict'].includes(result.data.error), `expected out-of-turn/version conflict, got ${JSON.stringify(result.data)}`);
  }
  assert.equal(harness.version, before.version + 1, 'duplicate taps create one canonical version');
  assert.equal(harness.countMutation(mutationId), 1, 'one committed mutation identity per legal move');
  return { before, after: harness.room(), owner, body, results };
}

async function raceBoundary(harness, clients, rng, label) {
  const before = harness.room();
  assert.equal(before.status, 'finished', `${label}: boundary begins finished`);
  assert.equal(before.matchComplete, false, `${label}: boundary is not final match`);
  const owner = clients[Math.floor(rng() * clients.length)];
  const mutationId = token(`boundary:${label}:${before.version}`);
  const body = { action: 'rematch', code: CODE, version: before.version, mutationId };
  const [a, b] = await Promise.all([
    delayedCall(3 + Math.floor(rng() * 20), () => rawPost(owner, body)),
    delayedCall(6 + Math.floor(rng() * 24), () => rawPost(owner, body)),
  ]);
  assert.equal(a.status, 200, `${label}: first boundary request succeeds`);
  assert.equal(b.status, 200, `${label}: duplicate boundary request is idempotent`);
  assert.equal([a, b].filter(result => result.data.duplicate === true).length, 1, `${label}: one duplicate boundary ack`);
  assert.equal(harness.version, before.version + 1, `${label}: one boundary version`);
  assert.equal(harness.countMutation(mutationId), 1, `${label}: boundary mutation identity committed once`);
  const after = harness.room();
  assert.equal(after.status, 'playing', `${label}: next round starts`);
  assert.equal(after.round, before.round + 1, `${label}: round increments once`);
  assert.equal(after.turnIndex, Number(before.round) % 4, `${label}: authoritative starter rotates exactly once`);
  assert.deepEqual(after.scores, before.scores, `${label}: scores persist across round boundary`);
  assert.ok(Object.values(after.board).every(slots => Object.keys(slots || {}).length === 0), `${label}: board reset is canonical`);
  assert.equal(after.moveNumber, 0, `${label}: move counter resets`);
  return after;
}

async function injectResponseReordering(harness, clients, rng) {
  const probeClient = clients[1];
  harness.reorderGate = deferred();
  const stalePromise = rawGet(probeClient, 'stale');
  await waitUntil(() => harness.timeline.some(row => row.kind === 'reorder-stale-held'), 5000, 'stale response held');

  const before = harness.room();
  const move = chooseMove(harness.state, 0);
  const mutationId = token(`reorder-move:${before.version}`);
  await raceLegalMove(harness, clients, move, mutationId, rng);
  const fresh = await rawGet(probeClient, 'fresh');
  assert.equal(fresh.status, 200);
  assert.equal(fresh.data.room.version, before.version + 1, 'fresh response sees newer canonical version');
  harness.reorderGate.resolve();
  const stale = await stalePromise;
  assert.equal(stale.status, 200);
  assert.equal(stale.data.room.version, before.version, 'held response is genuinely stale');
  assert.ok(fresh.data.room.version > stale.data.room.version, 'harness delivered newer response before held stale response');
  harness.log('response-reordering-proved', { staleVersion: stale.data.room.version, freshVersion: fresh.data.room.version });
  harness.reorderGate = null;
  return { mutationId, move };
}

async function saveFailure(harness, clients, testInfo, error) {
  const safeSeed = SEED.replace(/[^A-Za-z0-9_.-]+/g, '_').slice(0, 80);
  const dir = path.resolve('artifacts', 'resilience-30', safeSeed);
  await mkdir(dir, { recursive: true });
  const snapshots = [];
  for (const client of clients) {
    let snapshot = null;
    try { snapshot = await browserSnapshot(client); } catch (snapshotError) { snapshot = { error: String(snapshotError) }; }
    snapshots.push({ seat: client.seat, delivered: compactRoom(harness.appDeliveries.get(client.seat)), browser: snapshot });
    try { await client.page.screenshot({ path: path.join(dir, `${client.seat}.png`), fullPage: true }); } catch {}
  }
  const failure = {
    seed: SEED,
    error: String(error?.stack || error),
    canonical: compactRoom(harness.room()),
    hiddenMutationLedger: harness.state._mutations || [],
    clientSnapshots: snapshots,
    timeline: harness.timeline,
  };
  await writeFile(path.join(dir, 'seed.txt'), `${SEED}\n`, 'utf8');
  await writeFile(path.join(dir, 'failure.json'), JSON.stringify(failure, null, 2), 'utf8');
  await writeFile(path.join(dir, 'event-timeline.json'), JSON.stringify(harness.timeline, null, 2), 'utf8');
  await writeFile(path.join(dir, 'server-room.json'), JSON.stringify(compactRoom(harness.room()), null, 2), 'utf8');
  await writeFile(path.join(dir, 'client-snapshots.json'), JSON.stringify(snapshots, null, 2), 'utf8');
  await testInfo.attach('resilience-30-failure', { body: Buffer.from(JSON.stringify(failure, null, 2)), contentType: 'application/json' });
}

test('RESILIENCE-30 deterministic seeded 4-client online chaos gate', async ({ browser }, testInfo) => {
  test.setTimeout(240000);
  const rng = mulberry32(hashInt(SEED));
  const harness = makeHarness();
  const clients = [];
  let p4RecoveryDone = false;
  let p3RefreshDone = false;
  let reorderDone = false;

  try {
    for (const seat of SEATS) clients.push(await createClient(browser, harness, seat));
    await Promise.all(clients.map(waitClientReady));
    await checkpointActive(harness, clients, 'initial');

    for (let roundWin = 1; roundWin <= 3; roundWin += 1) {
      let winnerStep = 0;
      let movesThisRound = 0;
      while (harness.state.status === 'playing') {
        const before = harness.room();
        const ownerSeat = before.players[before.turnIndex].seat;
        const move = chooseMove(harness.state, winnerStep);
        const mutationId = token(`round:${roundWin}:move:${movesThisRound}:${ownerSeat}:${before.version}`);

        if (!reorderDone && roundWin === 1 && movesThisRound === 1) {
          await injectResponseReordering(harness, clients, rng);
          reorderDone = true;
          if (ownerSeat === 'p1') winnerStep += 1;
          movesThisRound += 1;
          const afterReorder = harness.room();
          if (afterReorder.status === 'playing') {
            assert.equal(afterReorder.turnIndex, (before.turnIndex + 1) % 4, 'reordered-response move advances exactly one turn');
            await checkpointActive(harness, clients, `round-${roundWin}-move-${movesThisRound}-reordered`);
          }
          continue;
        }

        if (!p4RecoveryDone && ownerSeat === 'p4') {
          const raced = await raceLegalMove(harness, clients, move, mutationId, rng, { dropResponse: true });
          assert.equal(raced.after.lastMove.seat, 'p4', 'Player 4 legal move commits at owner boundary');
          assert.equal(raced.after.version, raced.before.version + 1, 'Player 4 commit advances one version');
          harness.offlineSeats.add('p4');
          await wake(raced.owner);
          await sleep(900);
          harness.offlineSeats.delete('p4');
          await raced.owner.page.reload({ waitUntil: 'domcontentloaded' });
          await waitClientReady(raced.owner);
          const versionAfterCommit = harness.version;
          const replay = await rawPost(raced.owner, { ...raced.body, version: raced.before.version });
          assert.equal(replay.status, 200, `Player 4 replay after reconnect: ${JSON.stringify(replay)}`);
          assert.equal(replay.data.duplicate, true, 'Player 4 reconnect retry is recognized as already committed');
          assert.equal(harness.version, versionAfterCommit, 'Player 4 reconnect never replays committed move');
          assert.equal(harness.countMutation(mutationId), 1, 'Player 4 mutation identity remains single after reconnect');
          p4RecoveryDone = true;
        } else {
          await raceLegalMove(harness, clients, move, mutationId, rng);
        }

        if (ownerSeat === 'p1') winnerStep += 1;
        movesThisRound += 1;
        const after = harness.room();
        assert.equal(after.lastMove?.seat, ownerSeat, `round ${roundWin} move ${movesThisRound}: committed mover identity`);
        if (after.status === 'playing') {
          assert.equal(after.turnIndex, (before.turnIndex + 1) % 4, `round ${roundWin} move ${movesThisRound}: no skipped/repeated turn`);
          if (!p3RefreshDone && movesThisRound >= 2) {
            const p3 = clients.find(client => client.seat === 'p3');
            await p3.page.reload({ waitUntil: 'domcontentloaded' });
            await waitClientReady(p3);
            p3RefreshDone = true;
            harness.log('client-refresh', { seat: 'p3', version: harness.version });
          }
          await checkpointActive(harness, clients, `round-${roundWin}-move-${movesThisRound}`);
        }
        assert.ok(movesThisRound < 20, `round ${roundWin}: no deadlock`);
      }

      const finished = harness.room();
      assert.equal(finished.winner?.seat, 'p1', `round ${roundWin}: deterministic p1 winner`);
      assert.equal(Number(finished.scores.p1), roundWin, `round ${roundWin}: score increments exactly once`);
      await checkpointTerminal(harness, clients, `round-${roundWin}-finished`);

      if (roundWin < 3) {
        await raceBoundary(harness, clients, rng, `round-${roundWin}-boundary`);
        await checkpointActive(harness, clients, `round-${roundWin + 1}-start`);
      }
    }

    const finalRoom = harness.room();
    assert.equal(finalRoom.matchComplete, true, 'match completes after target wins');
    assert.equal(finalRoom.matchWinner?.seat, 'p1', 'canonical match winner is p1');
    assert.equal(Number(finalRoom.scores.p1), 3, 'match target score reached exactly once per round');
    assert.equal(p4RecoveryDone, true, 'Player 4 reconnect/lost-response path executed');
    assert.equal(p3RefreshDone, true, 'refresh path executed');
    assert.equal(reorderDone, true, 'response reordering path executed');
    await checkpointTerminal(harness, clients, 'match-complete');
    harness.log('gate-pass', { seed: SEED, canonical: compactRoom(finalRoom), commits: harness.commitCount });
    console.log('YAKOLAK_RESILIENCE_30_SEED', SEED);
    console.log('YAKOLAK_RESILIENCE_30_OK', JSON.stringify({ version: finalRoom.version, scores: finalRoom.scores, commits: harness.commitCount }));
  } catch (error) {
    await saveFailure(harness, clients, testInfo, error);
    throw error;
  } finally {
    await Promise.all(clients.map(async client => { try { await client.context.close(); } catch {} }));
  }
});
