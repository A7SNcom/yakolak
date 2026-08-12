import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { __testing } from '../api/rooms.js';

const {
  advanceRoundState,
  applyMove,
  createState,
  joinState,
  requireCurrentVersion,
} = __testing;

const COLORS = ['marble', 'blue', 'gold', 'green'];
const PLAYER_COUNTS = [2, 3, 4];
const ROUNDS_TO_CROSS = 2;
const BASE = String(process.env.YAKOLAK_PROBE_BASE || '').replace(/\/$/, '');

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
    rematch: room.rematch,
  };
}

function blankBoard(board) {
  return Object.values(board || {}).every(slots => Object.keys(slots || {}).length === 0);
}

function chooseMove(state, winnerSeat, winnerStep) {
  const current = state.players[state.turnIndex];
  assert.ok(current, 'current player exists');
  if (current.seat === winnerSeat) {
    return { cell: [0, 1, 2][winnerStep], size: 'small' };
  }
  for (const size of ['large', 'medium', 'small']) {
    for (const cell of [8, 7, 6, 5, 4, 3, 2, 1, 0]) {
      try {
        const candidate = applyMove(state, current.seat, { cell, size });
        if (candidate.status === 'playing') return { cell, size };
      } catch {}
    }
  }
  throw new Error(`no safe non-winning move for ${current.seat}`);
}

function playWinningRound(initial) {
  let state = structuredClone(initial);
  const winnerSeat = state.players[state.turnIndex].seat;
  const beforeScore = Number(state.scores[winnerSeat] || 0);
  let winnerStep = 0;
  let commits = 0;
  while (state.status === 'playing') {
    const seat = state.players[state.turnIndex].seat;
    const move = chooseMove(state, winnerSeat, winnerStep);
    state = applyMove(state, seat, move);
    commits += 1;
    if (seat === winnerSeat) winnerStep += 1;
    assert.ok(commits < 20, 'winning round terminates promptly');
  }
  assert.equal(state.status, 'finished');
  assert.equal(state.winner?.seat, winnerSeat);
  assert.equal(Number(state.scores[winnerSeat]), beforeScore + 1, 'winner score increments once');
  return { state, winnerSeat, commits };
}

function makeLocalRoom(playerCount) {
  let state = createState(COLORS[0], playerCount, 5);
  for (let index = 1; index < playerCount; index += 1) {
    state = joinState(state, `p${index + 1}`, COLORS[index]);
  }
  assert.equal(state.status, 'playing');
  return state;
}

function assertRoundReset(pre, post, playerCount) {
  assert.equal(post.status, 'playing');
  assert.equal(post.round, Number(pre.round) + 1, 'exactly one next round is created');
  assert.equal(post.completedRounds, pre.completedRounds, 'completed round count persists');
  assert.deepEqual(post.scores, pre.scores, 'match-scoped scores persist');
  assert.deepEqual(post.players, pre.players, 'room player identity persists');
  assert.equal(post.turnIndex, Number(pre.round) % playerCount, 'next starter comes from authoritative round');
  assert.equal(post.moveNumber, 0, 'round move counter resets');
  assert.equal(post.lastMove, null, 'last move is round-scoped');
  assert.equal(post.winner, null, 'winner is round-scoped');
  assert.equal(post.draw, false, 'draw is round-scoped');
  assert.equal(post.matchComplete, false);
  assert.ok(blankBoard(post.board), 'piece placements are clean for next round');
  assert.ok(Object.values(post.rematch || {}).every(value => value === false), 'round acknowledgement state is clean');
}

function runLocalMatrix() {
  for (const playerCount of PLAYER_COUNTS) {
    let state = makeLocalRoom(playerCount);
    let version = 100 + playerCount * 10;
    let preBoundary = null;
    let postBoundary = null;
    let phase = 'start';
    try {
      for (let boundary = 1; boundary <= ROUNDS_TO_CROSS; boundary += 1) {
        phase = `round-${boundary}-winning-move`;
        const scoreBefore = structuredClone(state.scores);
        const completedBefore = state.completedRounds;
        const played = playWinningRound(state);
        version += played.commits;
        preBoundary = { ...played.state, code: '61', version };
        assert.equal(preBoundary.completedRounds, completedBefore + 1, 'one round result is recorded');
        const changedScores = Object.keys(preBoundary.scores).filter(seat => Number(preBoundary.scores[seat]) !== Number(scoreBefore[seat] || 0));
        assert.deepEqual(changedScores, [played.winnerSeat], 'exactly one score entry changes');

        phase = `round-${boundary}-client-race`;
        const clientViews = Array.from({ length: playerCount }, () => structuredClone(preBoundary));
        const winningClient = boundary % playerCount;
        const nextState = advanceRoundState(clientViews[winningClient], clientViews[winningClient].players[winningClient].seat);
        postBoundary = { ...nextState, code: preBoundary.code, version: preBoundary.version + 1 };
        for (let index = 0; index < playerCount; index += 1) {
          if (index === winningClient) continue;
          assert.throws(() => requireCurrentVersion(clientViews[index].version, postBoundary.version), /version_conflict/, 'stale concurrent boundary trigger loses CAS');
        }
        assert.equal(postBoundary.version, preBoundary.version + 1, 'boundary writes exactly one authoritative version');
        assertRoundReset(preBoundary, postBoundary, playerCount);

        phase = `round-${boundary}-reconnect-convergence`;
        const reconnected = structuredClone(postBoundary);
        assert.equal(reconnected.code, preBoundary.code, 'reconnect preserves room code');
        for (let index = 0; index < playerCount; index += 1) {
          clientViews[index] = structuredClone(postBoundary);
          assert.deepEqual(clientViews[index], reconnected, `p${index + 1} converges on score/board/turn/version`);
        }
        state = structuredClone(postBoundary);
        delete state.code;
        delete state.version;
      }
    } catch (error) {
      console.error('ROUND_END_24_FAILURE_SNAPSHOT', JSON.stringify({ mode: 'local', playerCount, phase, preBoundary: compact(preBoundary), postBoundary: compact(postBoundary) }));
      throw error;
    }
  }
  console.log('YAKOLAK_ROUND_BOUNDARY_MULTICLIENT_LOCAL_OK');
}

function secret() {
  return randomBytes(24).toString('hex');
}

async function request(path, { method = 'GET', token = '', body = null } = {}) {
  const response = await fetch(`${BASE}${path}`, {
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
  return { status: response.status, ok: response.ok, data };
}

async function createLiveRoom(playerCount) {
  const hostToken = secret();
  const created = await request('/api/rooms', {
    method: 'POST',
    body: {
      action: 'create',
      color: COLORS[0],
      targetPlayers: playerCount,
      targetRounds: 5,
      clientToken: hostToken,
      requestId: secret(),
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const clients = [{ seat: created.data.seat, token: created.data.token, code: created.data.room.code }];
  for (let index = 1; index < playerCount; index += 1) {
    const clientToken = secret();
    const joined = await request('/api/rooms', {
      method: 'POST',
      body: {
        action: 'join',
        code: created.data.room.code,
        color: COLORS[index],
        clientToken,
        requestId: secret(),
      },
    });
    assert.equal(joined.status, 200, JSON.stringify(joined.data));
    clients.push({ seat: joined.data.seat, token: joined.data.token, code: joined.data.room.code });
  }
  return clients;
}

async function pollClient(client) {
  const result = await request(`/api/rooms?code=${encodeURIComponent(client.code)}&since=-1`, { token: client.token });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.seat, client.seat, 'credential keeps the same seat');
  assert.equal(result.data.room.code, client.code, 'credential keeps the same room');
  return result.data.room;
}

async function syncAll(clients) {
  const rooms = await Promise.all(clients.map(pollClient));
  for (let index = 1; index < rooms.length; index += 1) assert.deepEqual(rooms[index], rooms[0], `p${index + 1} converges on authoritative room`);
  return rooms;
}

async function submitMove(client, room, move) {
  const result = await request('/api/rooms', {
    method: 'POST',
    token: client.token,
    body: { action: 'move', code: client.code, version: room.version, ...move, mutationId: secret() },
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data.room;
}

async function playLiveWinningRound(clients, initial) {
  let room = structuredClone(initial);
  const winnerSeat = room.players[room.turnIndex].seat;
  const beforeScore = Number(room.scores[winnerSeat] || 0);
  let winnerStep = 0;
  let commits = 0;
  while (room.status === 'playing') {
    const current = room.players[room.turnIndex];
    const client = clients.find(item => item.seat === current.seat);
    assert.ok(client, 'turn owner client exists');
    const move = chooseMove(room, winnerSeat, winnerStep);
    room = await submitMove(client, room, move);
    commits += 1;
    if (current.seat === winnerSeat) winnerStep += 1;
    assert.ok(commits < 20, 'live winning round terminates promptly');
  }
  assert.equal(room.winner?.seat, winnerSeat);
  assert.equal(Number(room.scores[winnerSeat]), beforeScore + 1, 'live score increments once');
  return { room, winnerSeat };
}

async function raceNextRound(clients, preBoundary) {
  const attempts = await Promise.all(clients.map(client => request('/api/rooms', {
    method: 'POST',
    token: client.token,
    body: { action: 'rematch', code: client.code, version: preBoundary.version, mutationId: secret() },
  })));
  const successes = attempts.filter(item => item.status === 200);
  const conflicts = attempts.filter(item => item.status === 409);
  assert.equal(successes.length, 1, `exactly one next-round request commits: ${JSON.stringify(attempts.map(item => [item.status, item.data.error]))}`);
  assert.equal(conflicts.length, clients.length - 1, 'every competing boundary request loses to the same CAS');
  assert.ok(conflicts.every(item => item.data.error === 'version_conflict'), 'losing clients receive the authoritative version conflict');
  return { room: successes[0].data.room, attempts };
}

async function cleanup(clients) {
  for (const client of [...clients].reverse()) {
    try {
      await request('/api/rooms', { method: 'POST', token: client.token, body: { action: 'leave', code: client.code, version: 0 } });
    } catch {}
  }
}

async function runLiveMatrix() {
  for (const playerCount of PLAYER_COUNTS) {
    const clients = await createLiveRoom(playerCount);
    let preBoundary = null;
    let postBoundary = null;
    let clientSnapshots = [];
    let phase = 'created';
    let boundary = 0;
    try {
      let room = (await syncAll(clients))[0];
      assert.equal(room.status, 'playing');
      for (boundary = 1; boundary <= ROUNDS_TO_CROSS; boundary += 1) {
        phase = 'winning-move';
        const scoreBefore = structuredClone(room.scores);
        const completedBefore = room.completedRounds;
        const played = await playLiveWinningRound(clients, room);
        preBoundary = structuredClone(played.room);
        assert.equal(preBoundary.completedRounds, completedBefore + 1, 'live round result recorded once');
        const changedScores = Object.keys(preBoundary.scores).filter(seat => Number(preBoundary.scores[seat]) !== Number(scoreBefore[seat] || 0));
        assert.deepEqual(changedScores, [played.winnerSeat], 'live boundary changes one score only');

        phase = 'boundary-reconnect';
        const reconnectIndex = (boundary + playerCount - 1) % playerCount;
        const reconnectRoom = await pollClient(clients[reconnectIndex]);
        assert.deepEqual(reconnectRoom, preBoundary, 'reconnect at finished boundary hydrates exact authoritative result');

        phase = 'next-round-race';
        const raced = await raceNextRound(clients, preBoundary);
        postBoundary = structuredClone(raced.room);
        assert.equal(postBoundary.version, preBoundary.version + 1, 'only one boundary version is created');
        assertRoundReset(preBoundary, postBoundary, playerCount);

        phase = 'post-boundary-convergence';
        clientSnapshots = await syncAll(clients);
        for (const snapshot of clientSnapshots) assert.deepEqual(snapshot, postBoundary, 'all clients converge on score/board/turn/version');
        const rehydrated = await pollClient(clients[reconnectIndex]);
        assert.deepEqual(rehydrated, postBoundary, 'reconnected client stays converged after next-round start');
        room = postBoundary;
      }
    } catch (error) {
      console.error('ROUND_END_24_FAILURE_SNAPSHOT', JSON.stringify({
        mode: 'production',
        playerCount,
        boundary,
        phase,
        preBoundaryAuthoritative: compact(preBoundary),
        postBoundaryAuthoritative: compact(postBoundary),
        clientSnapshots: clientSnapshots.map(compact),
      }));
      throw error;
    } finally {
      await cleanup(clients);
    }
  }
  console.log('YAKOLAK_ROUND_BOUNDARY_MULTICLIENT_PRODUCTION_OK');
}

if (BASE) await runLiveMatrix();
else runLocalMatrix();
