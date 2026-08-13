import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const base = String(process.env.YAKOLAK_PROBE_BASE || process.argv[2] || 'https://yakolak.vercel.app').replace(/\/$/, '');
const endpoint = `${base}/api/rooms`;

function secret(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

async function postRaw(body, token = '') {
  const response = await fetch(endpoint, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, data };
}

async function post(body, token = '') {
  const result = await postRaw(body, token);
  if (!result.ok) throw new Error(`${body.action}:${result.status}:${result.data.error || 'unknown'}`);
  return result.data;
}

async function poll(code, token, since = 0) {
  const response = await fetch(`${endpoint}?code=${encodeURIComponent(code)}&since=${since}`, {
    cache: 'no-store',
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`poll:${response.status}:${data.error || 'unknown'}`);
  return data;
}

function assertRoomIdentity(payload, expectedCode) {
  assert.match(String(payload?.room?.code || ''), /^\d{2}$/);
  assert.equal(String(payload.room.code), expectedCode);
  assert.ok(Number.isInteger(Number(payload.room.version)) && Number(payload.room.version) > 0);
  assert.equal(Object.hasOwn(payload.room, '_mutations'), false, 'internal mutation receipts must never leak to clients');
}

function compactRoom(room) {
  const occupied = [];
  for (const [cell, slots] of Object.entries(room?.board || {})) {
    for (const [size, color] of Object.entries(slots || {})) occupied.push(`${cell}.${size}=${color}`);
  }
  const turnIndex = Number(room?.turnIndex ?? -1);
  return {
    version: Number(room?.version || 0),
    status: String(room?.status || ''),
    round: Number(room?.round || 0),
    completedRounds: Number(room?.completedRounds || 0),
    moveNumber: Number(room?.moveNumber || 0),
    turnIndex,
    turnSeat: String(room?.players?.[turnIndex]?.seat || ''),
    lastMove: room?.lastMove || null,
    occupied,
  };
}

async function leaveQuietly(code, version, token) {
  if (!code || !token || !Number.isInteger(Number(version))) return;
  try { await post({ action: 'leave', code, version: Number(version) }, token); } catch {}
}

async function verifyWaitingGuestLeave() {
  const hostToken = secret();
  let code = '';
  let version = 0;
  try {
    const created = await post({
      action: 'create', color: 'marble', targetPlayers: 4, targetRounds: 3,
      clientToken: hostToken, requestId: secret(24),
    });
    code = created.room.code;
    version = Number(created.room.version);
    assertRoomIdentity(created, code);

    const guestToken = secret();
    const joined = await post({
      action: 'join', code, color: 'blue', clientToken: guestToken, requestId: secret(24),
    });
    const staleGuestVersion = Number(joined.room.version);
    version = staleGuestVersion;
    assertRoomIdentity(joined, code);
    assert.equal(joined.room.status, 'waiting');

    const thirdToken = secret();
    const third = await post({
      action: 'join', code, color: 'gold', clientToken: thirdToken, requestId: secret(24),
    });
    version = Number(third.room.version);
    assertRoomIdentity(third, code);
    assert.equal(third.room.status, 'waiting');
    assert.ok(version > staleGuestVersion);

    const left = await post({ action: 'leave', code, version: staleGuestVersion }, guestToken);
    version = Number(left.room.version);
    assertRoomIdentity(left, code);
    assert.equal(left.room.status, 'waiting');
    assert.deepEqual(left.room.players.map(player => player.seat), ['p1', 'p3']);

    const hostView = await poll(code, hostToken, 0);
    assertRoomIdentity(hostView, code);
    version = Number(hostView.room.version);
    assert.equal(hostView.room.status, 'waiting');
  } finally {
    await leaveQuietly(code, version, hostToken);
  }
}

async function verifyRealMatchAndExactlyOnce() {
  const p1Token = secret();
  const p2Token = secret();
  let code = '';
  let version = 0;
  try {
    const created = await post({
      action: 'create', color: 'marble', targetPlayers: 2, targetRounds: 3,
      clientToken: p1Token, requestId: secret(24),
    });
    code = created.room.code;
    version = Number(created.room.version);
    assertRoomIdentity(created, code);

    let state = await post({
      action: 'join', code, color: 'blue', clientToken: p2Token, requestId: secret(24),
    });
    version = Number(state.room.version);
    assertRoomIdentity(state, code);
    assert.equal(state.room.status, 'playing');

    const missingMutationId = await postRaw({ action: 'move', code, version, cell: 0, size: 'small' }, p1Token);
    assert.equal(missingMutationId.status, 400);
    assert.equal(missingMutationId.data.error, 'invalid_mutation_id');

    const firstVersion = version;
    const firstMutation = secret(24);
    const firstMove = { action: 'move', code, version: firstVersion, cell: 0, size: 'small', mutationId: firstMutation };
    const sameMutationResults = await Promise.all([
      postRaw(firstMove, p1Token),
      postRaw(firstMove, p1Token),
    ]);
    assert.deepEqual(sameMutationResults.map(result => result.status).sort(), [200, 200]);
    for (const result of sameMutationResults) assertRoomIdentity(result.data, code);
    const firstAuthoritative = sameMutationResults[0].data.room.version >= sameMutationResults[1].data.room.version
      ? sameMutationResults[0].data : sameMutationResults[1].data;
    version = Number(firstAuthoritative.room.version);
    assert.equal(version, firstVersion + 1, 'duplicate same mutation must increment room only once');
    assert.equal(firstAuthoritative.room.moveNumber, 1);
    assert.equal(firstAuthoritative.room.turnIndex, 1);

    const secondMutation = secret(24);
    state = await post({ action: 'move', code, version, cell: 8, size: 'large', mutationId: secondMutation }, p2Token);
    version = Number(state.room.version);
    assert.equal(state.room.moveNumber, 2);
    assert.equal(state.room.turnIndex, 0);

    const replayAfterInterveningMove = await post(firstMove, p1Token);
    assertRoomIdentity(replayAfterInterveningMove, code);
    assert.equal(Number(replayAfterInterveningMove.room.version), version);
    assert.equal(replayAfterInterveningMove.room.moveNumber, 2);
    assert.equal(replayAfterInterveningMove.room.turnIndex, 0);

    const raceVersion = version;
    const raceResults = await Promise.all([
      postRaw({ action: 'move', code, version: raceVersion, cell: 1, size: 'small', mutationId: secret(24) }, p1Token),
      postRaw({ action: 'move', code, version: raceVersion, cell: 1, size: 'small', mutationId: secret(24) }, p1Token),
      postRaw({ action: 'move', code, version: raceVersion, cell: 7, size: 'medium', mutationId: secret(24) }, p2Token),
    ]);
    assert.equal(raceResults.filter(result => result.status === 200).length, 1, 'only one concurrent transition may commit');
    assert.ok(raceResults.filter(result => result.status === 409).length >= 2);

    const afterRace = await poll(code, p1Token, 0);
    assertRoomIdentity(afterRace, code);
    version = Number(afterRace.room.version);
    assert.equal(version, raceVersion + 1);
    assert.equal(afterRace.room.moveNumber, 3);
    assert.equal(afterRace.room.board['1'].small, 'marble');
    assert.equal(afterRace.room.turnIndex, 1);

    state = await post({ action: 'move', code, version, cell: 7, size: 'medium', mutationId: secret(24) }, p2Token);
    version = Number(state.room.version);
    state = await post({ action: 'move', code, version, cell: 2, size: 'small', mutationId: secret(24) }, p1Token);
    version = Number(state.room.version);
    assertRoomIdentity(state, code);
    assert.equal(state.room.status, 'finished');
    assert.equal(state.room.winner?.seat, 'p1');
    assert.equal(state.room.moveNumber, 5);

    const p1RematchMutation = secret(24);
    const p1RematchVersion = version;
    state = await post({ action: 'rematch', code, version: p1RematchVersion, mutationId: p1RematchMutation }, p1Token);
    version = Number(state.room.version);
    assertRoomIdentity(state, code);
    assert.equal(version, p1RematchVersion + 1, 'first accepted rematch must advance the boundary exactly once');
    assert.equal(state.room.status, 'playing');
    assert.equal(state.room.round, 2);
    assert.deepEqual(state.room.board['0'], {});

    const duplicateRematch = await post({ action: 'rematch', code, version: p1RematchVersion, mutationId: p1RematchMutation }, p1Token);
    assert.equal(duplicateRematch.duplicate, true);
    assert.equal(Number(duplicateRematch.room.version), version);
    assert.equal(duplicateRematch.room.status, 'playing');
    assert.equal(duplicateRematch.room.round, 2);

    const staleP2Rematch = await postRaw({ action: 'rematch', code, version: p1RematchVersion, mutationId: secret(24) }, p2Token);
    assert.equal(staleP2Rematch.status, 409);
    assert.equal(staleP2Rematch.data.error, 'version_conflict');
  } finally {
    await leaveQuietly(code, version, p1Token);
  }
}

async function verifyFourPlayerTurnCycle() {
  const clients = {
    p1: { seat: 'p1', color: 'marble', token: secret(), movePosts: 0, reconnects: 0 },
    p2: { seat: 'p2', color: 'blue', token: secret(), movePosts: 0, reconnects: 0 },
    p3: { seat: 'p3', color: 'gold', token: secret(), movePosts: 0, reconnects: 0 },
    p4: { seat: 'p4', color: 'green', token: secret(), movePosts: 0, reconnects: 0 },
  };
  let code = '';
  let version = 0;
  let diagnostic = { label: 'before-create' };
  let lastRoom = null;

  function note(label, room = lastRoom, extra = {}) {
    diagnostic = {
      label,
      code,
      expected: extra.expected || null,
      move: extra.move || null,
      room: room ? compactRoom(room) : null,
      clients: Object.fromEntries(Object.values(clients).map(client => [client.seat, {
        movePosts: client.movePosts,
        reconnects: client.reconnects,
      }])),
      views: extra.views || null,
    };
  }

  async function syncAll(label, expectedRoom = null) {
    const entries = await Promise.all(Object.values(clients).map(async client => {
      const payload = await poll(code, client.token, 0);
      assertRoomIdentity(payload, code);
      assert.equal(payload.seat, client.seat, `${label}: credential must keep ownership of ${client.seat}`);
      return [client.seat, payload.room];
    }));
    const views = Object.fromEntries(entries);
    const canonical = views.p1;
    lastRoom = canonical;
    note(label, canonical, { views: Object.fromEntries(entries.map(([seat, room]) => [seat, compactRoom(room)])) });
    for (const seat of ['p2', 'p3', 'p4']) {
      assert.deepEqual(views[seat], canonical, `${label}: ${seat} diverged from authoritative room`);
    }
    if (expectedRoom) assert.deepEqual(canonical, expectedRoom, `${label}: committed response differs from polled authority`);
    version = Number(canonical.version);
    return canonical;
  }

  function assertTurn(room, expectedSeat, label) {
    note(label, room, { expected: expectedSeat });
    assert.equal(room.status, 'playing', `${label}: room must be playing`);
    const turnSeat = String(room.players?.[Number(room.turnIndex)]?.seat || '');
    assert.equal(turnSeat, expectedSeat, `${label}: skipped or repeated player`);
    assert.equal(room.players.filter((_, index) => index === Number(room.turnIndex)).length, 1, `${label}: exactly one authoritative turn owner`);
  }

  function firstEmptySlot(room) {
    for (let cell = 0; cell < 9; cell += 1) {
      for (const size of ['small', 'medium', 'large']) {
        if (!room.board?.[String(cell)]?.[size]) return { cell, size };
      }
    }
    throw new Error('no_empty_probe_slot');
  }

  async function assertOthersBlocked(room, expectedSeat, label) {
    assertTurn(room, expectedSeat, `${label}:turn`);
    const beforeVersion = Number(room.version);
    const beforeMoves = Number(room.moveNumber);
    const probe = firstEmptySlot(room);
    const blocked = await Promise.all(Object.values(clients)
      .filter(client => client.seat !== expectedSeat)
      .map(client => postRaw({
        action: 'move', code, version: beforeVersion, cell: probe.cell, size: probe.size, mutationId: secret(24),
      }, client.token).then(result => [client.seat, result])));
    for (const [seat, result] of blocked) {
      assert.equal(result.status, 409, `${label}: ${seat} must stay blocked out of turn`);
      assert.equal(result.data.error, 'not_your_turn', `${label}: ${seat} must be rejected specifically as out of turn`);
    }
    const authority = await poll(code, clients.p1.token, 0);
    assertRoomIdentity(authority, code);
    assert.equal(Number(authority.room.version), beforeVersion, `${label}: rejected clients must not advance version`);
    assert.equal(Number(authority.room.moveNumber), beforeMoves, `${label}: rejected clients must not create moves`);
    lastRoom = authority.room;
    return authority.room;
  }

  async function commitMove(expectedSeat, cell, size, expectedNextSeat, label) {
    const client = clients[expectedSeat];
    assertTurn(lastRoom, expectedSeat, `${label}:before`);
    const beforeVersion = Number(lastRoom.version);
    const beforeMoves = Number(lastRoom.moveNumber);
    const mutationId = secret(24);
    const payload = { action: 'move', code, version: beforeVersion, cell, size, mutationId };
    note(`${label}:posting`, lastRoom, { expected: expectedSeat, move: { cell, size, mutationId } });
    client.movePosts += 1;
    const committed = await post(payload, client.token);
    assertRoomIdentity(committed, code);
    lastRoom = committed.room;
    note(`${label}:committed`, lastRoom, { expected: expectedSeat, move: { cell, size } });
    assert.equal(committed.seat, expectedSeat, `${label}: response seat mismatch`);
    assert.equal(Number(lastRoom.version), beforeVersion + 1, `${label}: authoritative version must advance exactly once`);
    assert.equal(Number(lastRoom.moveNumber), beforeMoves + 1, `${label}: move number must advance exactly once`);
    assert.equal(lastRoom.lastMove?.seat, expectedSeat, `${label}: wrong committed mover`);
    assert.equal(lastRoom.lastMove?.cell, cell, `${label}: wrong committed cell`);
    assert.equal(lastRoom.lastMove?.size, size, `${label}: wrong committed size`);
    assert.equal(lastRoom.board?.[String(cell)]?.[size], client.color, `${label}: board did not receive mover color`);
    await syncAll(`${label}:converged`, lastRoom);
    if (expectedNextSeat) await assertOthersBlocked(lastRoom, expectedNextSeat, `${label}:single-legal-mover`);
    return { mutationId, payload, room: lastRoom };
  }

  async function reconnectP4(label) {
    const before = compactRoom(lastRoom);
    const beforePosts = clients.p4.movePosts;
    clients.p4.reconnects += 1;
    const refreshed = await poll(code, clients.p4.token, 0);
    assertRoomIdentity(refreshed, code);
    assert.equal(refreshed.seat, 'p4');
    lastRoom = refreshed.room;
    note(`${label}:refreshed`, lastRoom, { expected: 'p4' });
    assert.deepEqual(compactRoom(lastRoom), before, `${label}: refresh/reconnect must not mutate authority`);
    assert.equal(clients.p4.movePosts, beforePosts, `${label}: reconnect must not resubmit an already committed move`);
    assertTurn(lastRoom, 'p4', `${label}:p4-still-owns-turn`);
  }

  async function assertDuplicateP4IsIdempotent(committed, label) {
    const before = compactRoom(lastRoom);
    const duplicate = await post(committed.payload, clients.p4.token);
    assertRoomIdentity(duplicate, code);
    assert.equal(duplicate.duplicate, true, `${label}: replayed committed mutation must be recognized as duplicate`);
    assert.deepEqual(compactRoom(duplicate.room), before, `${label}: duplicate replay must not advance turn/version/board`);
    lastRoom = duplicate.room;
    await syncAll(`${label}:duplicate-converged`, lastRoom);
  }

  async function assertFinishedLocked(label, expectedWinner) {
    note(label, lastRoom, { expected: expectedWinner });
    assert.equal(lastRoom.status, 'finished');
    assert.equal(lastRoom.winner?.seat, expectedWinner);
    const beforeVersion = Number(lastRoom.version);
    const beforeMoves = Number(lastRoom.moveNumber);
    const probe = firstEmptySlot(lastRoom);
    const results = await Promise.all(Object.values(clients).map(client => postRaw({
      action: 'move', code, version: beforeVersion, cell: probe.cell, size: probe.size, mutationId: secret(24),
    }, client.token)));
    for (const result of results) {
      assert.equal(result.status, 409, `${label}: no player may move while round is finished`);
      assert.equal(result.data.error, 'room_not_playing');
    }
    const authority = await poll(code, clients.p1.token, 0);
    assert.equal(Number(authority.room.version), beforeVersion);
    assert.equal(Number(authority.room.moveNumber), beforeMoves);
    lastRoom = authority.room;
  }

  async function advanceRound(label, expectedRound, expectedStarter) {
    const boundaryVersion = Number(lastRoom.version);
    const mutationId = secret(24);
    const advanced = await post({ action: 'rematch', code, version: boundaryVersion, mutationId }, clients.p1.token);
    assertRoomIdentity(advanced, code);
    assert.equal(Number(advanced.room.version), boundaryVersion + 1, `${label}: first accepted rematch must advance version once`);
    lastRoom = advanced.room;
    await syncAll(`${label}:advanced`, lastRoom);

    const staleResults = await Promise.all(['p2', 'p3', 'p4'].map(seat => postRaw({
      action: 'rematch', code, version: boundaryVersion, mutationId: secret(24),
    }, clients[seat].token).then(result => [seat, result])));
    for (const [seat, result] of staleResults) {
      assert.equal(result.status, 409, `${label}:${seat}: stale boundary rematch must be rejected`);
      assert.equal(result.data.error, 'version_conflict', `${label}:${seat}: stale rematch must fail by version`);
    }

    assert.equal(lastRoom.status, 'playing', `${label}: accepted rematch must reopen gameplay atomically`);
    assert.equal(Number(lastRoom.round), expectedRound, `${label}: wrong round after boundary`);
    assert.deepEqual(lastRoom.board, Object.fromEntries(Array.from({ length: 9 }, (_, index) => [String(index), {}])), `${label}: board must reset at round boundary`);
    assertTurn(lastRoom, expectedStarter, `${label}:starter`);
    await assertOthersBlocked(lastRoom, expectedStarter, `${label}:single-legal-starter`);
  }

  try {
    const created = await post({
      action: 'create', color: clients.p1.color, targetPlayers: 4, targetRounds: 3,
      clientToken: clients.p1.token, requestId: secret(24),
    });
    code = created.room.code;
    version = Number(created.room.version);
    assertRoomIdentity(created, code);
    lastRoom = created.room;
    note('created', lastRoom);

    for (const seat of ['p2', 'p3', 'p4']) {
      const joined = await post({
        action: 'join', code, color: clients[seat].color, clientToken: clients[seat].token, requestId: secret(24),
      });
      assert.equal(joined.seat, seat);
      lastRoom = joined.room;
      version = Number(lastRoom.version);
      note(`joined-${seat}`, lastRoom);
    }
    assert.equal(lastRoom.status, 'playing');
    assert.deepEqual(lastRoom.players.map(player => player.seat), ['p1', 'p2', 'p3', 'p4']);
    await syncAll('four-clients-ready', lastRoom);
    await assertOthersBlocked(lastRoom, 'p1', 'initial-single-legal-mover');

    await commitMove('p1', 0, 'small', 'p2', 'r1-m1-p1');
    await commitMove('p2', 8, 'large', 'p3', 'r1-m2-p2');
    await commitMove('p3', 7, 'medium', 'p4', 'r1-m3-p3');

    // ONLINE-03: refresh Player 4 while the authoritative turn belongs to p4.
    // Refresh is read-only and must preserve seat ownership without replaying a
    // previously committed p4 move from an earlier client lifetime.
    await reconnectP4('r1-p4-turn-refresh');
    const firstP4 = await commitMove('p4', 6, 'large', 'p1', 'r1-m4-p4-after-refresh');

    // Even if an obsolete transport later replays the committed payload, the
    // exactly-once receipt must return the same authority without a second move.
    await assertDuplicateP4IsIdempotent(firstP4, 'r1-p4-stale-transport-replay');

    await commitMove('p1', 1, 'small', 'p2', 'r1-m5-p1');
    await commitMove('p2', 8, 'medium', 'p3', 'r1-m6-p2');
    await commitMove('p3', 7, 'large', 'p4', 'r1-m7-p3');
    await commitMove('p4', 6, 'medium', 'p1', 'r1-m8-p4');
    await commitMove('p1', 2, 'small', null, 'r1-m9-p1-win');
    await assertFinishedLocked('round-1-finished', 'p1');

    // Cross the round boundary. Four-player starter rotation makes round 2 p2.
    await advanceRound('round-1-to-2', 2, 'p2');

    await commitMove('p2', 0, 'small', 'p3', 'r2-m1-p2');
    await commitMove('p3', 8, 'large', 'p4', 'r2-m2-p3');
    await reconnectP4('r2-p4-turn-refresh');
    await commitMove('p4', 7, 'medium', 'p1', 'r2-m3-p4');
    await commitMove('p1', 6, 'large', 'p2', 'r2-m4-p1');
    await commitMove('p2', 1, 'small', 'p3', 'r2-m5-p2');
    await commitMove('p3', 8, 'medium', 'p4', 'r2-m6-p3');
    await commitMove('p4', 7, 'large', 'p1', 'r2-m7-p4');
    await commitMove('p1', 6, 'medium', 'p2', 'r2-m8-p1');
    await commitMove('p2', 2, 'small', null, 'r2-m9-p2-win');
    await assertFinishedLocked('round-2-finished', 'p2');

    assert.equal(Number(lastRoom.completedRounds), 2, 'ONLINE-03 must cross at least one full round boundary');
    assert.equal(Number(lastRoom.moveNumber), 18, 'ONLINE-03 deterministic path must commit exactly 18 moves');
    assert.equal(clients.p4.movePosts, 4, 'Player 4 must remain able to commit every scheduled turn after reconnects');
    await syncAll('online-03-final-convergence', lastRoom);
    console.log('YAKOLAK_ONLINE_4P_TURN_CYCLE_OK', JSON.stringify(compactRoom(lastRoom)));
  } catch (error) {
    console.error('YAKOLAK_ONLINE_4P_FAILURE_SNAPSHOT', JSON.stringify(diagnostic));
    throw error;
  } finally {
    await leaveQuietly(code, version || Number(lastRoom?.version || 0), clients.p1.token);
  }
}

await verifyWaitingGuestLeave();
await verifyRealMatchAndExactlyOnce();
await verifyFourPlayerTurnCycle();
console.log('YAKOLAK_PRODUCTION_ONLINE_PROBE_OK', base);
