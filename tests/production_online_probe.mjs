import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const base = String(process.env.YAKOLAK_PROBE_BASE || process.argv[2] || 'https://yakolak.vercel.app').replace(/\/$/, '');
const endpoint = `${base}/api/rooms`;

function secret(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

async function post(body, token = '') {
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
  if (!response.ok) throw new Error(`${body.action}:${response.status}:${data.error || 'unknown'}`);
  return data;
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

async function verifyRealMatch() {
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

    const moves = [
      [p1Token, 0, 'small'],
      [p2Token, 8, 'large'],
      [p1Token, 1, 'small'],
      [p2Token, 7, 'medium'],
      [p1Token, 2, 'small'],
    ];
    for (const [token, cell, size] of moves) {
      state = await post({ action: 'move', code, version, cell, size }, token);
      version = Number(state.room.version);
      assertRoomIdentity(state, code);
    }
    assert.equal(state.room.status, 'finished');
    assert.equal(state.room.winner?.seat, 'p1');

    state = await post({ action: 'rematch', code, version }, p1Token);
    version = Number(state.room.version);
    assertRoomIdentity(state, code);
    assert.equal(state.room.status, 'finished');

    state = await post({ action: 'rematch', code, version }, p2Token);
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
await verifyRealMatch();
console.log('YAKOLAK_PRODUCTION_ONLINE_PROBE_OK', base);
