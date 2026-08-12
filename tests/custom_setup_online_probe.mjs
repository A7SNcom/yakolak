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

async function poll(code, token) {
  const response = await fetch(`${endpoint}?code=${encodeURIComponent(code)}&since=0`, {
    cache: 'no-store',
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`poll:${response.status}:${data.error || 'unknown'}`);
  return data;
}

async function leaveQuietly(code, version, token) {
  if (!code || !token || !Number.isInteger(Number(version))) return;
  try { await post({ action: 'leave', code, version: Number(version) }, token); } catch {}
}

function assertCanonicalPlayers(room, expected, label) {
  assert.deepEqual(
    room.players.map(player => ({ seat: String(player.seat), color: String(player.color) })),
    expected,
    `${label}: canonical seats/colors diverged from requested all-online setup`,
  );
  assert.equal(new Set(room.players.map(player => player.seat)).size, room.players.length, `${label}: duplicate canonical seat`);
  assert.equal(new Set(room.players.map(player => player.color)).size, room.players.length, `${label}: duplicate canonical color`);
}

const clients = [
  { seat: 'p1', color: 'marble', token: secret() },
  { seat: 'p2', color: 'blue', token: secret() },
  { seat: 'p3', color: 'gold', token: secret() },
  { seat: 'p4', color: 'green', token: secret() },
];

let code = '';
let version = 0;
try {
  const createRequestId = secret(24);
  const created = await post({
    action: 'create', color: clients[0].color, targetPlayers: 4, targetRounds: 3,
    clientToken: clients[0].token, requestId: createRequestId,
  });
  code = String(created.room.code);
  version = Number(created.room.version);
  assert.equal(created.seat, 'p1');
  assert.equal(created.room.status, 'waiting');
  assert.equal(created.room.targetPlayers, 4);
  assert.equal(created.room.targetRounds, 3);
  assertCanonicalPlayers(created.room, [{ seat: 'p1', color: 'marble' }], 'create');

  // Repeating the exact host bootstrap is hydration/idempotency, never a new owner.
  const recreated = await post({
    action: 'create', color: clients[0].color, targetPlayers: 4, targetRounds: 3,
    clientToken: clients[0].token, requestId: createRequestId,
  });
  assert.equal(recreated.seat, 'p1');
  assert.equal(Number(recreated.room.version), version);
  assertCanonicalPlayers(recreated.room, [{ seat: 'p1', color: 'marble' }], 'recreate');

  const p2RequestId = secret(24);
  const joinedP2 = await post({
    action: 'join', code, color: clients[1].color,
    clientToken: clients[1].token, requestId: p2RequestId,
  });
  version = Number(joinedP2.room.version);
  assert.equal(joinedP2.seat, 'p2');
  assertCanonicalPlayers(joinedP2.room, clients.slice(0, 2).map(({ seat, color }) => ({ seat, color })), 'join-p2');

  // Same credential cannot reserve a duplicate seat, even with a fresh request id
  // and a different requested color. Ownership outranks the bootstrap request.
  const duplicateSeat = await post({
    action: 'join', code, color: 'gold',
    clientToken: clients[1].token, requestId: secret(24),
  });
  assert.equal(duplicateSeat.seat, 'p2');
  assert.equal(Number(duplicateSeat.room.version), version);
  assertCanonicalPlayers(duplicateSeat.room, clients.slice(0, 2).map(({ seat, color }) => ({ seat, color })), 'duplicate-seat-owner');

  // A different credential may not reuse an occupied color.
  const duplicateColor = await postRaw({
    action: 'join', code, color: clients[1].color,
    clientToken: clients[2].token, requestId: secret(24),
  });
  assert.equal(duplicateColor.status, 409);
  assert.equal(duplicateColor.data.error, 'color_taken');
  const afterRejectedColor = await poll(code, clients[0].token);
  assert.equal(Number(afterRejectedColor.room.version), version);
  assertCanonicalPlayers(afterRejectedColor.room, clients.slice(0, 2).map(({ seat, color }) => ({ seat, color })), 'rejected-duplicate-color');

  for (const client of clients.slice(2)) {
    const joined = await post({
      action: 'join', code, color: client.color,
      clientToken: client.token, requestId: secret(24),
    });
    version = Number(joined.room.version);
    assert.equal(joined.seat, client.seat);
    const expected = clients.slice(0, Number(client.seat.slice(1))).map(({ seat, color }) => ({ seat, color }));
    assertCanonicalPlayers(joined.room, expected, `join-${client.seat}`);
  }

  const expectedAll = clients.map(({ seat, color }) => ({ seat, color }));
  const started = await poll(code, clients[0].token);
  assert.equal(started.room.status, 'playing', 'fourth join must start the all-online match exactly once');
  assert.equal(started.room.turnIndex, 0);
  assertCanonicalPlayers(started.room, expectedAll, 'match-start');
  version = Number(started.room.version);

  // Refresh/reconnect each credential. The canonical room is identical while the
  // private returned seat proves ownership survived hydration.
  for (const client of clients) {
    const refreshed = await poll(code, client.token);
    assert.equal(refreshed.seat, client.seat, `reconnect must preserve ${client.seat} ownership`);
    assert.equal(Number(refreshed.room.version), version, `reconnect of ${client.seat} must be read-only`);
    assert.equal(refreshed.room.status, 'playing');
    assertCanonicalPlayers(refreshed.room, expectedAll, `reconnect-${client.seat}`);
  }

  console.log(`YAKOLAK_CUSTOM_SETUP_ONLINE_PROBE_OK code=${code} seats=4 colors=4 status=playing`);
} finally {
  await leaveQuietly(code, version, clients[0].token);
}
