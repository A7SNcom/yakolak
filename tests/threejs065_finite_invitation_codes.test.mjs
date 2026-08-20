import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import {
  INVITE_CODE_CAPACITY,
  MANUAL_INVITATION_CODE_COUNT,
  MANUAL_INVITATION_TTL_MS,
  manualInvitationLocators,
  shuffledManualInvitationLocators,
  uniformRandomIndex,
} from '../backend/cloudflare/src/authoritative-invitation-allocation.js';
import { AUTHORITY_SCHEMA_STATEMENTS, AUTHORITY_TABLES } from '../backend/cloudflare/src/authoritative-schema.js';
import {
  allocateTursoInvitation,
  expireTursoManualInvitationLocators,
} from '../backend/cloudflare/src/authoritative-turso-invitation-allocation.js';

function tx(db) {
  return {
    run(sql, ...args) {
      const result = db.prepare(sql).run(...args);
      return { changes: Number(result.changes) };
    },
    get(sql, ...args) {
      return db.prepare(sql).get(...args);
    },
    all(sql, ...args) {
      return db.prepare(sql).all(...args);
    },
  };
}

function createDb() {
  const db = new DatabaseSync(':memory:');
  for (const statement of AUTHORITY_SCHEMA_STATEMENTS) db.exec(statement);
  return db;
}

function seedRoom(db, {
  roomId,
  generation = 0,
  hostSeatId = 'host',
  targetSeatId = 'online',
  targetType = 'online',
  now = 1_000_000,
} = {}) {
  const T = AUTHORITY_TABLES;
  const state = { status: 'waiting', lobbyGeneration: generation };
  db.prepare(`INSERT INTO ${T.lobbies}
    (room_id,schema_version,revision,lobby_generation,state_json,created_at_ms,updated_at_ms,expires_at_ms,tombstoned_at_ms)
    VALUES (?,1,0,?,?, ?,?,?,NULL)`).run(roomId, generation, JSON.stringify(state), now, now, now + 3_600_000);
  db.prepare(`INSERT INTO ${T.seats}
    (room_id,seat_id,schema_version,seat_type,lobby_generation,credential_hash,credential_generation,created_at_ms,updated_at_ms)
    VALUES (?, ?, 1, 'host', ?, ?, 1, ?, ?)`).run(roomId, hostSeatId, generation, roomId.padEnd(64, 'a').slice(0, 64), now, now);
  db.prepare(`INSERT INTO ${T.seats}
    (room_id,seat_id,schema_version,seat_type,lobby_generation,credential_hash,credential_generation,created_at_ms,updated_at_ms)
    VALUES (?, ?, 1, ?, ?, NULL, 0, ?, ?)`).run(roomId, targetSeatId, targetType, generation, now, now);
  db.prepare(`INSERT INTO ${T.seatConfigurations}
    (room_id,lobby_generation,seat_id,schema_version,configured_index,spatial_slot,color,seat_type,created_at_ms,updated_at_ms)
    VALUES (?, ?, ?, 1, 0, 'right', 'marble', 'host', ?, ?)`).run(roomId, generation, hostSeatId, now, now);
  db.prepare(`INSERT INTO ${T.seatConfigurations}
    (room_id,lobby_generation,seat_id,schema_version,configured_index,spatial_slot,color,seat_type,created_at_ms,updated_at_ms)
    VALUES (?, ?, ?, 1, 1, 'back', 'blue', ?, ?, ?)`).run(roomId, generation, targetSeatId, targetType, now, now);
}

function allocation(roomId, invitationId, overrides = {}) {
  return {
    roomId,
    seatId: 'online',
    lobbyGeneration: 0,
    invitationId,
    actorSeatId: 'host',
    credentialGeneration: 1,
    ...overrides,
  };
}

const zeroRng = () => 0;

test('manual namespace is exactly the 100 global locators 00–99', () => {
  const locators = manualInvitationLocators();
  assert.equal(MANUAL_INVITATION_CODE_COUNT, 100);
  assert.equal(locators.length, 100);
  assert.equal(locators[0], '00');
  assert.equal(locators[99], '99');
  assert.equal(new Set(locators).size, 100);
  assert.ok(locators.every(locator => /^\d{2}$/.test(locator)));
});

test('random selection uses rejection sampling and the shuffle is a permutation, not modulo-biased choice', () => {
  let calls = 0;
  const values = [0xffffffff, 7];
  assert.equal(uniformRandomIndex(100, () => values[calls++] ?? 0), 7);
  assert.equal(calls, 2, '0xffffffff must be rejected for a 100-wide unbiased range');
  const shuffled = shuffledManualInvitationLocators(() => 0);
  assert.equal(shuffled.length, 100);
  assert.equal(new Set(shuffled).size, 100);
  assert.deepEqual([...shuffled].sort(), [...manualInvitationLocators()]);
});

test('100 active manual invitations fill the namespace and the 101st fails with INVITE_CODE_CAPACITY', async () => {
  const db = createDb();
  const executor = tx(db);
  const allocated = [];
  for (let index = 0; index < 101; index += 1) {
    seedRoom(db, { roomId: `room-${String(index).padStart(3, '0')}` });
  }
  for (let index = 0; index < 100; index += 1) {
    const roomId = `room-${String(index).padStart(3, '0')}`;
    const result = await allocateTursoInvitation({
      tx: executor,
      tables: AUTHORITY_TABLES,
      input: allocation(roomId, `invite-${String(index).padStart(3, '0')}`),
      nowMs: 1_000_000,
      randomUint32: zeroRng,
    });
    assert.equal(result.status, 'allocated');
    allocated.push(result.invitation.locator);
  }
  assert.equal(new Set(allocated).size, 100);
  assert.deepEqual([...new Set(allocated)].sort(), [...manualInvitationLocators()]);

  await assert.rejects(
    allocateTursoInvitation({
      tx: executor,
      tables: AUTHORITY_TABLES,
      input: allocation('room-100', 'invite-100'),
      nowMs: 1_000_000,
      randomUint32: zeroRng,
    }),
    error => error?.code === INVITE_CODE_CAPACITY && error?.safeDetails?.capacity === 100,
  );
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${AUTHORITY_TABLES.manualLocators}`).get().count, 100);
  db.close();
});

test('retrying one Online seat is idempotent at allocation level and never consumes a second code', async () => {
  const db = createDb();
  const executor = tx(db);
  seedRoom(db, { roomId: 'retry-room' });
  const first = await allocateTursoInvitation({
    tx: executor, tables: AUTHORITY_TABLES,
    input: allocation('retry-room', 'invite-first'), nowMs: 1_000_000, randomUint32: zeroRng,
  });
  const retry = await allocateTursoInvitation({
    tx: executor, tables: AUTHORITY_TABLES,
    input: allocation('retry-room', 'invite-different-request-id'), nowMs: 1_000_001, randomUint32: () => 123,
  });
  assert.equal(retry.status, 'existing');
  assert.equal(retry.invitation.invitationId, first.invitation.invitationId);
  assert.equal(retry.invitation.locator, first.invitation.locator);
  assert.equal(retry.invitation.expiresAtMs, first.invitation.expiresAtMs, 'retry must not extend the finite reservation TTL');
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${AUTHORITY_TABLES.manualLocators}`).get().count, 1);
  db.close();
});

test('allocation is host-only, current-generation-only and Online-seat-only', async () => {
  const db = createDb();
  const executor = tx(db);
  seedRoom(db, { roomId: 'guard-room' });
  seedRoom(db, { roomId: 'computer-room', targetType: 'computer' });

  await assert.rejects(allocateTursoInvitation({
    tx: executor, tables: AUTHORITY_TABLES,
    input: allocation('guard-room', 'invite-nonhost', { actorSeatId: 'online', credentialGeneration: 1 }),
    nowMs: 1_000_000, randomUint32: zeroRng,
  }), /seat_credential_generation_stale|seat_credential_rejected|host_only_invitation_allocation/);

  await assert.rejects(allocateTursoInvitation({
    tx: executor, tables: AUTHORITY_TABLES,
    input: allocation('guard-room', 'invite-stale-generation', { lobbyGeneration: 1 }),
    nowMs: 1_000_000, randomUint32: zeroRng,
  }), /invalid_lobby_generation/);

  await assert.rejects(allocateTursoInvitation({
    tx: executor, tables: AUTHORITY_TABLES,
    input: allocation('computer-room', 'invite-computer'),
    nowMs: 1_000_000, randomUint32: zeroRng,
  }), /invitation_seat_not_online/);
  db.close();
});

test('expiry marks history expired, releases the code and permits a fresh invitation for the still-unclaimed seat', async () => {
  const db = createDb();
  const executor = tx(db);
  seedRoom(db, { roomId: 'expiry-room' });
  const first = await allocateTursoInvitation({
    tx: executor, tables: AUTHORITY_TABLES,
    input: allocation('expiry-room', 'invite-expiry-a'), nowMs: 1_000_000, randomUint32: zeroRng,
  });
  const afterExpiry = 1_000_000 + MANUAL_INVITATION_TTL_MS + 1;
  const second = await allocateTursoInvitation({
    tx: executor, tables: AUTHORITY_TABLES,
    input: allocation('expiry-room', 'invite-expiry-b'), nowMs: afterExpiry, randomUint32: zeroRng,
  });
  assert.equal(second.status, 'allocated');
  assert.equal(second.invitation.locator, first.invitation.locator, 'released code may be reused after expiry');
  assert.equal(String(db.prepare(`SELECT state FROM ${AUTHORITY_TABLES.invitations} WHERE invitation_id='invite-expiry-a'`).get().state), 'expired');
  db.close();
});

test('revocation releases the locator for reuse while claim releases it but permanently blocks reallocating the claimed seat', async () => {
  const db = createDb();
  const executor = tx(db);
  seedRoom(db, { roomId: 'revoke-room' });
  seedRoom(db, { roomId: 'claim-room' });
  seedRoom(db, { roomId: 'reuse-room' });

  const revoked = await allocateTursoInvitation({
    tx: executor, tables: AUTHORITY_TABLES,
    input: allocation('revoke-room', 'invite-revoke-a'), nowMs: 1_000_000, randomUint32: zeroRng,
  });
  db.prepare(`UPDATE ${AUTHORITY_TABLES.invitations} SET state='revoked' WHERE invitation_id='invite-revoke-a'`).run();
  await expireTursoManualInvitationLocators({
    tx: executor, invitationsTable: AUTHORITY_TABLES.invitations,
    manualLocatorsTable: AUTHORITY_TABLES.manualLocators, nowMs: 1_000_001,
  });
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${AUTHORITY_TABLES.manualLocators}`).get().count, 0);
  const afterRevoke = await allocateTursoInvitation({
    tx: executor, tables: AUTHORITY_TABLES,
    input: allocation('revoke-room', 'invite-revoke-b'), nowMs: 1_000_002, randomUint32: zeroRng,
  });
  assert.equal(afterRevoke.invitation.locator, revoked.invitation.locator);

  const claimed = await allocateTursoInvitation({
    tx: executor, tables: AUTHORITY_TABLES,
    input: allocation('claim-room', 'invite-claim-a'), nowMs: 1_000_000, randomUint32: zeroRng,
  });
  db.prepare(`UPDATE ${AUTHORITY_TABLES.invitations} SET state='claimed' WHERE invitation_id='invite-claim-a'`).run();
  await expireTursoManualInvitationLocators({
    tx: executor, invitationsTable: AUTHORITY_TABLES.invitations,
    manualLocatorsTable: AUTHORITY_TABLES.manualLocators, nowMs: 1_000_001,
  });
  await assert.rejects(allocateTursoInvitation({
    tx: executor, tables: AUTHORITY_TABLES,
    input: allocation('claim-room', 'invite-claim-b'), nowMs: 1_000_002, randomUint32: zeroRng,
  }), /invitation_seat_already_claimed/);

  const reusedElsewhere = await allocateTursoInvitation({
    tx: executor, tables: AUTHORITY_TABLES,
    input: allocation('reuse-room', 'invite-reuse'), nowMs: 1_000_002, randomUint32: zeroRng,
  });
  assert.ok(/^\d{2}$/.test(reusedElsewhere.invitation.locator));
  assert.notEqual(reusedElsewhere.invitation.invitationId, claimed.invitation.invitationId);
  db.close();
});

console.log('THREEJS-065 finite invitation namespace: PASS');
