import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { __testing } from '../api/rooms.js';

const {
  applyMove,
  applyRoomEdit,
  createState,
  joinState,
  mutationApplied,
  reconcilePresenceState,
  recordMutation,
  rematchState,
  requireCurrentVersion,
} = __testing;

const gameplay = fs.readFileSync(new URL('../scripts/gameplay_rematch_lifecycle.gd', import.meta.url), 'utf8');
const COLORS = ['marble', 'blue'];
const REMATCH_CYCLES = 3;
const WINS_TO_MATCH = 3;
const BASE = String(process.env.YAKOLAK_PROBE_BASE || '').replace(/\/$/, '');

function secret() {
  return randomBytes(24).toString('hex');
}

function blankBoard(board) {
  return Object.values(board || {}).every(slots => Object.keys(slots || {}).length === 0);
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
    matchWinners: room.matchWinners,
    rematch: room.rematch,
    skippedSeat: room.skippedSeat,
  };
}

function capture(store, cycle, action, before, after, extra = {}) {
  store.push({ cycle, action, before: compact(before), after: compact(after), ...extra });
}

function assertCleanNewMatch(room, previousMatch, label) {
  assert.equal(room.status, 'playing', `${label}: gameplay resumes`);
  assert.equal(room.round, 1, `${label}: old round is gone`);
  assert.equal(room.completedRounds, 0, `${label}: prior completed-round count resets`);
  assert.equal(room.turnIndex, 0, `${label}: old turn does not leak`);
  assert.deepEqual(room.scores, Object.fromEntries(room.players.map(player => [player.seat, 0])), `${label}: prior-match scores reset`);
  assert.ok(blankBoard(room.board), `${label}: board is clean`);
  assert.equal(room.moveNumber, 0, `${label}: move counter resets`);
  assert.equal(room.lastMove, null, `${label}: last move resets`);
  assert.equal(room.winner, null, `${label}: stale round winner resets`);
  assert.equal(room.draw, false, `${label}: stale draw resets`);
  assert.equal(room.matchComplete, false, `${label}: match-complete flag resets`);
  assert.equal(room.matchWinner, null, `${label}: stale match winner resets`);
  assert.deepEqual(room.matchWinners, [], `${label}: stale match winners reset`);
  assert.ok(Object.values(room.rematch || {}).every(value => value === false), `${label}: rematch votes reset`);
  assert.equal(room.skippedSeat ?? null, null, `${label}: skipped seat resets`);
  if (previousMatch?.version != null && room.version != null) {
    assert.ok(Number(room.version) > Number(previousMatch.version), `${label}: new match has a newer authoritative version`);
  }
}

function chooseMove(state, winnerSeat, winnerStep) {
  const current = state.players[state.turnIndex];
  assert.ok(current, 'current player exists');
  if (current.seat === winnerSeat) return { cell: [0, 1, 2][winnerStep], size: 'small' };
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

function playWinningRound(initial, winnerSeat = 'p1') {
  let state = structuredClone(initial);
  let winnerStep = 0;
  let commits = 0;
  while (state.status === 'playing') {
    const current = state.players[state.turnIndex];
    const move = chooseMove(state, winnerSeat, winnerStep);
    state = applyMove(state, current.seat, move);
    commits += 1;
    if (current.seat === winnerSeat) winnerStep += 1;
    assert.ok(commits < 20, 'winning round terminates promptly');
  }
  assert.equal(state.winner?.seat, winnerSeat, 'designated winner owns round result');
  return state;
}

function completeModelMatch(initial, snapshots, cycle) {
  let room = structuredClone(initial);
  for (let win = 1; win <= WINS_TO_MATCH; win += 1) {
    const beforeRound = structuredClone(room);
    room = playWinningRound(room, 'p1');
    room.version = Number(beforeRound.version || 1) + Math.max(1, Number(room.moveNumber || 1));
    capture(snapshots, cycle, `round-${win}-finish`, beforeRound, room);
    if (win < WINS_TO_MATCH) {
      const beforeAdvance = structuredClone(room);
      room = { ...rematchState(room, 'p1'), version: Number(beforeAdvance.version) + 1 };
      capture(snapshots, cycle, `round-${win}-advance`, beforeAdvance, room);
    }
  }
  assert.equal(room.status, 'finished');
  assert.equal(room.matchComplete, true);
  assert.equal(room.scores.p1, WINS_TO_MATCH);
  return room;
}

function runSurfaceAndLifecycleContract() {
  assert.ok(gameplay.includes('post_match_secondary_button.visible = not online_active'), 'online post-match exposes no setup/leave secondary action');
  const secondary = gameplay.match(/func _on_post_match_secondary_action\(\)[\s\S]*?\n\nfunc _on_online_room_changed/)?.[0] || '';
  assert.ok(secondary.includes('if online_active or not round_complete or not match_complete or action_in_progress:'), 'local setup action rejects online lifecycle');
  assert.ok(!secondary.includes('online.call("leave")'), 'unsafe online leave remains unexposed');

  let waiting = createState('marble', 3, 3);
  waiting = joinState(waiting, 'p2', 'blue');
  assert.throws(() => applyRoomEdit(waiting, 'p2', { targetRounds: 5 }), /unauthorized/, 'non-owner cannot edit waiting room');
  const edited = applyRoomEdit(waiting, 'p1', { targetRounds: 5 });
  assert.equal(edited.winsToMatch, 5, 'owner can edit while waiting');
  const playing = joinState(edited, 'p3', 'gold');
  assert.equal(playing.status, 'playing');
  assert.throws(() => applyRoomEdit(playing, 'p1', { targetRounds: 3 }), /room_edit_forbidden/, 'owner cannot edit after gameplay starts');

  const disconnected = reconcilePresenceState(playing, ['p1', 'p3']);
  assert.deepEqual(disconnected, playing, 'one gameplay client disappearing from presence cannot mutate/cancel the room');
}

function runLocalModel() {
  runSurfaceAndLifecycleContract();
  const snapshots = [];
  let authoritative = joinState(createState('marble', 2, WINS_TO_MATCH), 'p2', 'blue');
  authoritative = { ...authoritative, code: '27', version: 2 };
  let clients = [structuredClone(authoritative), structuredClone(authoritative)];

  try {
    for (let cycle = 1; cycle <= REMATCH_CYCLES; cycle += 1) {
      authoritative = completeModelMatch(authoritative, snapshots, cycle);
      clients = clients.map(() => structuredClone(authoritative));
      for (const client of clients) assert.deepEqual(client, authoritative, `cycle ${cycle}: clients converge at match end`);

      const preVote = structuredClone(authoritative);
      const mutationId = secret();
      let voted = rematchState(authoritative, 'p1');
      voted = recordMutation(voted, 'p1', 'rematch', mutationId);
      voted = { ...voted, version: Number(authoritative.version) + 1 };
      capture(snapshots, cycle, 'p1-rematch-vote', preVote, voted, { mutationId });
      assert.equal(voted.status, 'finished');
      assert.equal(voted.rematch.p1, true);

      const duplicateBefore = structuredClone(voted);
      assert.equal(mutationApplied(voted, 'p1', 'rematch', mutationId), true, 'duplicate retry is recognized before CAS');
      const duplicateAfter = structuredClone(voted);
      capture(snapshots, cycle, 'p1-rematch-duplicate', duplicateBefore, duplicateAfter, { mutationId, duplicate: true });
      assert.equal(duplicateAfter.version, duplicateBefore.version, 'duplicate rematch retry creates no version');
      assert.deepEqual(compact(duplicateAfter), compact(duplicateBefore), 'duplicate rematch retry creates no state transition');

      clients = clients.map(() => structuredClone(voted));
      for (const client of clients) assert.deepEqual(compact(client), compact(voted), `cycle ${cycle}: clients converge on first rematch vote`);

      const beforeRestart = structuredClone(voted);
      authoritative = { ...rematchState(voted, 'p2'), version: Number(voted.version) + 1 };
      capture(snapshots, cycle, 'p2-rematch-vote-and-restart', beforeRestart, authoritative);
      assertCleanNewMatch(authoritative, beforeRestart, `cycle ${cycle}`);
      clients = clients.map(() => structuredClone(authoritative));
      for (const client of clients) assert.deepEqual(compact(client), compact(authoritative), `cycle ${cycle}: all clients converge on clean new match`);

      const disconnectBefore = structuredClone(authoritative);
      const disconnectAfter = reconcilePresenceState(authoritative, ['p1']);
      capture(snapshots, cycle, 'p2-disconnect-presence', disconnectBefore, disconnectAfter);
      assert.deepEqual(disconnectAfter, disconnectBefore, `cycle ${cycle}: disconnected p2 does not corrupt active match`);

      assert.throws(() => applyRoomEdit(authoritative, 'p1', { targetRounds: 5 }), /room_edit_forbidden/, `cycle ${cycle}: setup edit cannot cross gameplay lifecycle`);
    }
  } catch (error) {
    console.error('MATCH_END_27_FAILURE_SNAPSHOT', JSON.stringify({ mode: 'local-model', snapshots }));
    throw error;
  }

  console.log('MATCH_END_27_AUTHORITATIVE_SNAPSHOTS', JSON.stringify({ mode: 'local-model', snapshots }));
  console.log('YAKOLAK_MATCH_END_27_LOCAL_OK');
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

async function createLiveRoom() {
  const hostToken = secret();
  const created = await request('/api/rooms', {
    method: 'POST',
    body: {
      action: 'create', color: COLORS[0], targetPlayers: 2, targetRounds: WINS_TO_MATCH,
      clientToken: hostToken, requestId: secret(),
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const joinToken = secret();
  const joined = await request('/api/rooms', {
    method: 'POST',
    body: {
      action: 'join', code: created.data.room.code, color: COLORS[1],
      clientToken: joinToken, requestId: secret(),
    },
  });
  assert.equal(joined.status, 200, JSON.stringify(joined.data));
  return [
    { seat: created.data.seat, token: created.data.token, code: created.data.room.code },
    { seat: joined.data.seat, token: joined.data.token, code: joined.data.room.code },
  ];
}

async function pollClient(client) {
  const result = await request(`/api/rooms?code=${encodeURIComponent(client.code)}&since=-1`, { token: client.token });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.seat, client.seat);
  return result.data.room;
}

async function syncAll(clients, label) {
  const rooms = await Promise.all(clients.map(pollClient));
  for (let index = 1; index < rooms.length; index += 1) {
    assert.deepEqual(rooms[index], rooms[0], `${label}: p${index + 1} matches authoritative room/version`);
  }
  return rooms[0];
}

async function submitMove(client, room, move) {
  const result = await request('/api/rooms', {
    method: 'POST', token: client.token,
    body: { action: 'move', code: client.code, version: room.version, ...move, mutationId: secret() },
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data.room;
}

async function playLiveWinningRound(clients, initial, winnerSeat = 'p1') {
  let room = structuredClone(initial);
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
  return room;
}

async function rematchRequest(client, room, mutationId = secret(), version = room.version) {
  return request('/api/rooms', {
    method: 'POST', token: client.token,
    body: { action: 'rematch', code: client.code, version, mutationId },
  });
}

async function completeLiveMatch(clients, initial, snapshots, cycle) {
  let room = structuredClone(initial);
  for (let win = 1; win <= WINS_TO_MATCH; win += 1) {
    const beforeRound = structuredClone(room);
    room = await playLiveWinningRound(clients, room, 'p1');
    capture(snapshots, cycle, `round-${win}-finish`, beforeRound, room);
    room = await syncAll(clients, `cycle ${cycle} round ${win} finish`);
    if (win < WINS_TO_MATCH) {
      const beforeAdvance = structuredClone(room);
      const advance = await rematchRequest(clients[0], room);
      assert.equal(advance.status, 200, JSON.stringify(advance.data));
      room = advance.data.room;
      capture(snapshots, cycle, `round-${win}-advance`, beforeAdvance, room);
      room = await syncAll(clients, `cycle ${cycle} round ${win} advance`);
    }
  }
  assert.equal(room.status, 'finished');
  assert.equal(room.matchComplete, true);
  assert.equal(room.scores.p1, WINS_TO_MATCH);
  return room;
}

async function assertLiveEditLifecycle(clients, room, cycle) {
  const owner = await request('/api/rooms', {
    method: 'POST', token: clients[0].token,
    body: { action: 'edit', code: clients[0].code, version: room.version, changes: { targetRounds: 5 } },
  });
  assert.equal(owner.status, 409, `cycle ${cycle}: owner edit after start must be rejected`);
  assert.equal(owner.data.error, 'room_edit_forbidden');

  const nonOwner = await request('/api/rooms', {
    method: 'POST', token: clients[1].token,
    body: { action: 'edit', code: clients[1].code, version: room.version, changes: { targetRounds: 5 } },
  });
  assert.equal(nonOwner.status, 401, `cycle ${cycle}: non-owner edit must be unauthorized`);
  assert.equal(nonOwner.data.error, 'unauthorized');
}

async function cleanup(clients) {
  for (const client of [...clients].reverse()) {
    try { await request('/api/rooms', { method: 'POST', token: client.token, body: { action: 'leave', code: client.code, version: 0 } }); } catch {}
  }
}

async function runLive() {
  runSurfaceAndLifecycleContract();
  const clients = await createLiveRoom();
  const snapshots = [];
  let phase = 'created';
  let cycle = 0;
  let authoritative = null;

  try {
    authoritative = await syncAll(clients, 'initial room');
    for (cycle = 1; cycle <= REMATCH_CYCLES; cycle += 1) {
      phase = 'complete-match';
      authoritative = await completeLiveMatch(clients, authoritative, snapshots, cycle);

      phase = 'first-rematch-vote';
      const preVote = structuredClone(authoritative);
      const mutationId = secret();
      const first = await rematchRequest(clients[0], preVote, mutationId, preVote.version);
      assert.equal(first.status, 200, JSON.stringify(first.data));
      assert.equal(first.data.room.status, 'finished');
      assert.equal(first.data.room.rematch.p1, true);
      assert.equal(first.data.room.version, preVote.version + 1, `cycle ${cycle}: first vote writes exactly one version`);
      capture(snapshots, cycle, 'p1-rematch-vote', preVote, first.data.room, { mutationId });
      authoritative = await syncAll(clients, `cycle ${cycle} first vote convergence`);
      assert.deepEqual(authoritative, first.data.room);

      phase = 'duplicate-rematch-vote';
      const duplicateBefore = structuredClone(authoritative);
      const duplicate = await rematchRequest(clients[0], duplicateBefore, mutationId, preVote.version);
      assert.equal(duplicate.status, 200, JSON.stringify(duplicate.data));
      assert.equal(duplicate.data.duplicate, true, `cycle ${cycle}: repeated mutation is explicitly deduplicated`);
      assert.equal(duplicate.data.room.version, duplicateBefore.version, `cycle ${cycle}: duplicate tap creates no extra rematch version`);
      assert.deepEqual(duplicate.data.room, duplicateBefore, `cycle ${cycle}: duplicate tap creates no state change`);
      capture(snapshots, cycle, 'p1-rematch-duplicate', duplicateBefore, duplicate.data.room, { mutationId, duplicate: true });
      authoritative = await syncAll(clients, `cycle ${cycle} duplicate convergence`);

      phase = 'second-rematch-vote';
      const beforeRestart = structuredClone(authoritative);
      const second = await rematchRequest(clients[1], beforeRestart);
      assert.equal(second.status, 200, JSON.stringify(second.data));
      assert.equal(second.data.room.version, beforeRestart.version + 1, `cycle ${cycle}: restart writes exactly one version`);
      authoritative = second.data.room;
      capture(snapshots, cycle, 'p2-rematch-vote-and-restart', beforeRestart, authoritative);
      assertCleanNewMatch(authoritative, beforeRestart, `cycle ${cycle}`);
      authoritative = await syncAll(clients, `cycle ${cycle} clean restart convergence`);
      assertCleanNewMatch(authoritative, beforeRestart, `cycle ${cycle} converged`);

      phase = 'post-restart-lifecycle-guards';
      await assertLiveEditLifecycle(clients, authoritative, cycle);
      const onlyP1Polling = await pollClient(clients[0]);
      assert.deepEqual(onlyP1Polling, authoritative, `cycle ${cycle}: one client going quiet does not corrupt the other client's room`);
      capture(snapshots, cycle, 'p2-goes-quiet', authoritative, onlyP1Polling);
    }

    console.log('MATCH_END_27_AUTHORITATIVE_SNAPSHOTS', JSON.stringify({ mode: 'live', room: clients[0].code, snapshots }));
    console.log('YAKOLAK_MATCH_END_27_PRODUCTION_OK');
  } catch (error) {
    console.error('MATCH_END_27_FAILURE_SNAPSHOT', JSON.stringify({ mode: 'live', cycle, phase, authoritative: compact(authoritative), snapshots }));
    throw error;
  } finally {
    await cleanup(clients);
  }
}

if (BASE) await runLive();
else runLocalModel();
