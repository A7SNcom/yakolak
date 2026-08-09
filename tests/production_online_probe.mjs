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

    // Advance the authoritative room version while p2 still holds the older
    // version. An explicit authenticated leave must still succeed.
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

    // No gameplay mutation is accepted without its immutable operation id.
    const missingMutationId = await postRaw({ action: 'move', code, version, cell: 0, size: 'small' }, p1Token);
    assert.equal(missingMutationId.status, 400);
    assert.equal(missingMutationId.data.error, 'invalid_mutation_id');

    // Lost/delayed response simulation: the same mutation is sent twice at the
    // same time. Both callers must converge on one authoritative move/version.
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

    // Opponent moves before the delayed first response is retried. A stale
    // replay must still be recognized by mutationId even though lastMove changed.
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

    // Pressure / repeated click / duplicated-tab / simultaneous-player test:
    // two p1 intents and an out-of-turn p2 intent race on the same version.
    // Exactly one authoritative transition may win.
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

    // Continue normally and verify turn order/winner were not corrupted by race.
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
    state = await post({ action: 'rematch', code, version, mutationId: p1RematchMutation }, p1Token);
    version = Number(state.room.version);
    assertRoomIdentity(state, code);
    assert.equal(state.room.status, 'finished');

    // Duplicate rematch is also idempotent and cannot cast an extra future vote.
    const duplicateRematch = await post({ action: 'rematch', code, version: p1RematchVersion, mutationId: p1RematchMutation }, p1Token);
    assert.equal(Number(duplicateRematch.room.version), version);
    assert.equal(duplicateRematch.room.status, 'finished');

    state = await post({ action: 'rematch', code, version, mutationId: secret(24) }, p2Token);
    version = Number(state.room.version);
    assertRoomIdentity(state, code);
    assert.equal(state.room.status, 'playing');
    assert.equal(state.room.round, 2);
    assert.deepEqual(state.room.board['0'], {});
  } finally {
    await leaveQuietly(code, version, p1Token);
  }
}

await verifyWaitingGuestLeave();
await verifyRealMatchAndExactlyOnce();
console.log('YAKOLAK_PRODUCTION_ONLINE_PROBE_OK', base);
