import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { __testing } from '../api/rooms.js';

const { applyMove } = __testing;
const BASE = String(process.env.YAKOLAK_PROBE_BASE || '').replace(/\/$/, '');
const SEED = String(process.env.YAKOLAK_CHAOS_SEED || 'resilience-30-20260812');
const COLORS = ['marble', 'blue', 'gold', 'green'];
const SEATS = ['p1', 'p2', 'p3', 'p4'];
const timeline = [];

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

function stableId(label) {
  return createHash('sha256').update(`${SEED}:${label}`).digest('hex');
}

function secret() {
  return randomBytes(32).toString('hex');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(kind, detail = {}) {
  timeline.push({ index: timeline.length, kind, ...structuredClone(detail) });
}

function compact(room) {
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

async function request(pathname, { method = 'GET', token = '', body = null, delayMs = 0, label = '' } = {}) {
  if (delayMs > 0) await sleep(delayMs);
  const started = Date.now();
  const response = await fetch(`${BASE}${pathname}`, {
    method,
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = response.status === 204 ? { unchanged: true } : await response.json().catch(() => ({}));
  const result = { status: response.status, ok: response.ok, data };
  log('response', { label, method, pathname, delayMs, status: response.status, elapsedMs: Date.now() - started, error: data.error || '', duplicate: data.duplicate === true, version: data.room?.version });
  return result;
}

async function createClients() {
  const hostClientToken = secret();
  const created = await request('/api/rooms', {
    method: 'POST',
    label: 'create',
    body: {
      action: 'create', color: COLORS[0], targetPlayers: 4, targetRounds: 3,
      clientToken: hostClientToken, requestId: secret(),
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const clients = [{ seat: created.data.seat, token: created.data.token, code: created.data.room.code }];
  for (let index = 1; index < 4; index += 1) {
    const clientToken = secret();
    const joined = await request('/api/rooms', {
      method: 'POST',
      label: `join-p${index + 1}`,
      body: {
        action: 'join', code: created.data.room.code, color: COLORS[index],
        clientToken, requestId: secret(),
      },
    });
    assert.equal(joined.status, 200, JSON.stringify(joined.data));
    clients.push({ seat: joined.data.seat, token: joined.data.token, code: joined.data.room.code });
  }
  assert.deepEqual(clients.map(client => client.seat), SEATS, 'four stable seats are assigned');
  return clients;
}

async function pollClient(client, label) {
  const result = await request(`/api/rooms?code=${encodeURIComponent(client.code)}&since=-1`, { token: client.token, label });
  assert.equal(result.status, 200, `${label}: ${JSON.stringify(result.data)}`);
  assert.equal(result.data.seat, client.seat, `${label}: reconnect keeps seat identity`);
  assert.equal(result.data.room.code, client.code, `${label}: reconnect keeps room`);
  return result.data.room;
}

async function syncAll(clients, label) {
  const rooms = await Promise.all(clients.map(client => pollClient(client, `${label}:${client.seat}`)));
  for (let index = 1; index < rooms.length; index += 1) {
    assert.deepEqual(rooms[index], rooms[0], `${label}: all clients converge board/turn/score/version`);
  }
  log('checkpoint', { label, room: compact(rooms[0]) });
  return rooms[0];
}

function chooseMove(state, winnerStep) {
  const current = state.players[state.turnIndex];
  assert.ok(current, 'current player exists');
  if (current.seat === 'p1') return { cell: [0, 1, 2][winnerStep], size: 'small' };
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

async function postMove(client, room, move, mutationId, delayMs, label) {
  return request('/api/rooms', {
    method: 'POST', token: client.token, delayMs, label,
    body: { action: 'move', code: client.code, version: room.version, ...move, mutationId },
  });
}

async function raceMove(clients, before, move, mutationId, rng, { loseOwnerResponse = false } = {}) {
  const ownerSeat = before.players[before.turnIndex].seat;
  const owner = clients.find(client => client.seat === ownerSeat);
  assert.ok(owner, `owner ${ownerSeat} exists`);
  const outsiders = clients.filter(client => client.seat !== ownerSeat).slice(0, 2);
  const outsiderPromises = outsiders.map((client, index) => postMove(
    client,
    before,
    { cell: (Number(move.cell) + index + 4) % 9, size: index === 0 ? 'medium' : 'large' },
    stableId(`oot:${mutationId}:${client.seat}`),
    5 + Math.floor(rng() * 40) + index * 4,
    `out-of-turn:${ownerSeat}:${client.seat}`
  ));

  if (loseOwnerResponse) {
    const [ownerResult, ...outsiderResults] = await Promise.all([
      postMove(owner, before, move, mutationId, 3 + Math.floor(rng() * 25), `owner-lost-response:${ownerSeat}`),
      ...outsiderPromises,
    ]);
    assert.equal(ownerResult.status, 200, JSON.stringify(ownerResult.data));
    for (const result of outsiderResults) {
      assert.equal(result.status, 409, JSON.stringify(result.data));
      assert.ok(['not_your_turn', 'version_conflict'].includes(result.data.error), JSON.stringify(result.data));
    }
    const rehydrated = await pollClient(owner, 'p4-reconnect-after-lost-response');
    assert.equal(rehydrated.version, before.version + 1, 'reconnect hydrates the one committed version');
    const replay = await postMove(owner, before, move, mutationId, 0, 'p4-replay-same-mutation');
    assert.equal(replay.status, 200, JSON.stringify(replay.data));
    assert.equal(replay.data.duplicate, true, 'reconnect replay is recognized as duplicate identity');
    assert.equal(replay.data.room.version, rehydrated.version, 'reconnect never replays a committed move');
    return rehydrated;
  }

  const results = await Promise.all([
    postMove(owner, before, move, mutationId, 3 + Math.floor(rng() * 22), `owner-tap-a:${ownerSeat}`),
    postMove(owner, before, move, mutationId, 7 + Math.floor(rng() * 28), `owner-tap-b:${ownerSeat}`),
    ...outsiderPromises,
  ]);
  const ownerResults = results.slice(0, 2);
  const outsiderResults = results.slice(2);
  assert.ok(ownerResults.every(result => result.status === 200), JSON.stringify(ownerResults));
  assert.equal(ownerResults.filter(result => result.data.duplicate === true).length, 1, 'duplicate tap commits one mutation identity');
  for (const result of outsiderResults) {
    assert.equal(result.status, 409, JSON.stringify(result.data));
    assert.ok(['not_your_turn', 'version_conflict'].includes(result.data.error), JSON.stringify(result.data));
  }
  return ownerResults.reduce((latest, result) => Number(result.data.room?.version || 0) > Number(latest?.version || 0) ? result.data.room : latest, null);
}

async function raceBoundary(clients, before, rng, label) {
  const owner = clients[Math.floor(rng() * clients.length)];
  const mutationId = stableId(`boundary:${label}:${before.version}`);
  const body = { action: 'rematch', code: owner.code, version: before.version, mutationId };
  const [a, b] = await Promise.all([
    request('/api/rooms', { method: 'POST', token: owner.token, body, delayMs: 3 + Math.floor(rng() * 24), label: `${label}:a` }),
    request('/api/rooms', { method: 'POST', token: owner.token, body, delayMs: 7 + Math.floor(rng() * 29), label: `${label}:b` }),
  ]);
  assert.equal(a.status, 200, JSON.stringify(a.data));
  assert.equal(b.status, 200, JSON.stringify(b.data));
  assert.equal([a, b].filter(result => result.data.duplicate === true).length, 1, `${label}: one duplicate boundary ack`);
  const after = Number(a.data.room.version) >= Number(b.data.room.version) ? a.data.room : b.data.room;
  assert.equal(after.version, before.version + 1, `${label}: exactly one boundary version`);
  assert.equal(after.round, before.round + 1, `${label}: round advances once`);
  assert.equal(after.turnIndex, Number(before.round) % 4, `${label}: starter rotates once`);
  assert.deepEqual(after.scores, before.scores, `${label}: scores persist`);
  assert.equal(after.moveNumber, 0, `${label}: round move counter resets`);
  assert.ok(Object.values(after.board).every(slots => Object.keys(slots || {}).length === 0), `${label}: board resets`);
  return after;
}

async function cleanup(clients) {
  for (const client of [...clients].reverse()) {
    try {
      await request('/api/rooms', {
        method: 'POST', token: client.token, label: `cleanup:${client.seat}`,
        body: { action: 'leave', code: client.code, version: 0 },
      });
    } catch {}
  }
}

function saveFailure(error, room, clients) {
  const dir = path.resolve('artifacts', 'resilience-30');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `production-${SEED.replace(/[^A-Za-z0-9_.-]+/g, '_')}.json`);
  fs.writeFileSync(file, JSON.stringify({
    seed: SEED,
    error: String(error?.stack || error),
    room: compact(room),
    clients: clients.map(client => ({ seat: client.seat, code: client.code })),
    timeline,
  }, null, 2));
  console.error('RESILIENCE_30_FAILURE_BUNDLE', file);
}

async function run() {
  if (!BASE) {
    console.log('YAKOLAK_RESILIENCE_30_PRODUCTION_SKIPPED no YAKOLAK_PROBE_BASE');
    return;
  }
  const rng = mulberry32(hashInt(SEED));
  const clients = await createClients();
  let room = null;
  let p4RecoveryDone = false;
  let refreshDone = false;
  try {
    room = await syncAll(clients, 'initial');
    assert.equal(room.status, 'playing');
    assert.equal(room.players.length, 4);

    for (let roundWin = 1; roundWin <= 3; roundWin += 1) {
      let winnerStep = 0;
      let moves = 0;
      while (room.status === 'playing') {
        const before = structuredClone(room);
        const ownerSeat = before.players[before.turnIndex].seat;
        const move = chooseMove(before, winnerStep);
        const mutationId = stableId(`live:round:${roundWin}:move:${moves}:${ownerSeat}:${before.version}`);
        const raced = await raceMove(clients, before, move, mutationId, rng, { loseOwnerResponse: !p4RecoveryDone && ownerSeat === 'p4' });
        if (!p4RecoveryDone && ownerSeat === 'p4') p4RecoveryDone = true;

        room = await syncAll(clients, `round-${roundWin}-move-${moves + 1}`);
        assert.equal(room.version, before.version + 1, 'one canonical version per legal move');
        assert.equal(room.lastMove?.seat, ownerSeat, 'one committed mover identity');
        assert.deepEqual(compact(room), compact(raced), 'race result converges to canonical room');
        if (ownerSeat === 'p1') winnerStep += 1;
        moves += 1;

        if (room.status === 'playing') {
          assert.equal(room.turnIndex, (before.turnIndex + 1) % 4, 'no skipped/repeated turn');
          assert.ok(room.players[room.turnIndex], 'next legal mover exists (no deadlock)');
          if (!refreshDone && moves >= 2) {
            const p3 = clients.find(client => client.seat === 'p3');
            const refreshed = await pollClient(p3, 'p3-refresh-hydration');
            assert.deepEqual(refreshed, room, 'refresh hydrates exact canonical board/turn/score/version');
            refreshDone = true;
          }
        }
        assert.ok(moves < 20, `round ${roundWin} terminates without deadlock`);
      }

      assert.equal(room.winner?.seat, 'p1', `round ${roundWin}: p1 deterministic winner`);
      assert.equal(Number(room.scores.p1), roundWin, `round ${roundWin}: score increments once`);
      if (roundWin < 3) {
        room = await raceBoundary(clients, room, rng, `round-${roundWin}-boundary`);
        room = await syncAll(clients, `round-${roundWin + 1}-start`);
      }
    }

    assert.equal(room.matchComplete, true, 'production chaos reaches match completion');
    assert.equal(room.matchWinner?.seat, 'p1', 'production canonical match winner');
    assert.equal(Number(room.scores.p1), 3, 'production match target reached exactly');
    assert.equal(p4RecoveryDone, true, 'production Player 4 lost-response/reconnect path executed');
    assert.equal(refreshDone, true, 'production refresh hydration path executed');
    console.log('YAKOLAK_RESILIENCE_30_PRODUCTION_SEED', SEED);
    console.log('YAKOLAK_RESILIENCE_30_PRODUCTION_OK', JSON.stringify({ code: room.code, version: room.version, scores: room.scores, completedRounds: room.completedRounds }));
  } catch (error) {
    saveFailure(error, room, clients);
    throw error;
  } finally {
    await cleanup(clients);
  }
}

await run();
