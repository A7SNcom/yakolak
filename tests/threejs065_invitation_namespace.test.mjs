import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import {
  AUTHORITATIVE_ACTOR_KINDS,
  AUTHORITATIVE_INVITATION_STATES,
  AUTHORITATIVE_OPERATION_NAMES,
} from '../backend/cloudflare/src/authoritative-api.js';
import {
  MANUAL_INVITE_CODE_CAPACITY,
  MANUAL_INVITE_TTL_MS,
  allManualInviteCodes,
  chooseUnbiasedManualInviteCode,
} from '../backend/cloudflare/src/authoritative-invitation-namespace.js';
import { AUTHORITY_TABLES } from '../backend/cloudflare/src/authoritative-schema.js';
import { createInMemoryAuthoritativeStore } from '../backend/cloudflare/src/authoritative-memory-store.js';
import { createTursoAuthoritativeStoreFromConnection } from '../backend/cloudflare/src/authoritative-turso-store.js';

function configuredState(lobbyGeneration = 1) {
  return {
    protocol: 5,
    status: 'waiting',
    lobbyGeneration,
    preferredColor: 'green',
    targetPlayers: 4,
    targetRounds: 3,
    winsToMatch: 3,
    players: [
      { seat: 'front', color: 'green', type: 'host' },
      { seat: 'right', color: 'marble', type: 'online' },
      { seat: 'back', color: 'blue', type: 'online' },
      { seat: 'left', color: 'gold', type: 'online' },
    ],
    turnIndex: 0,
    board: Array.from({ length: 9 }, () => ({ small: null, medium: null, large: null })),
    round: 1,
    completedRounds: 0,
    scores: { front: 0, right: 0, back: 0, left: 0 },
    winner: null,
    draw: false,
    lastMove: null,
    moveNumber: 0,
    matchComplete: false,
    matchWinner: null,
    matchWinners: [],
    rematch: { front: false, right: false, back: false, left: false },
    skippedSeat: null,
  };
}

function credentialHash(index) {
  return index.toString(16).padStart(64, '0');
}

function memoryRooms(count) {
  return Array.from({ length: count }, (_, index) => ({
    roomId: String(index).padStart(2, '0'),
    revision: 1,
    state: configuredState(1),
    seats: [{
      seatId: 'front',
      credentialHash: credentialHash(index + 1),
      credentialGeneration: 1,
    }],
  }));
}

function allocateInput(roomId, revision, seatId, serial, fingerprint = 'a'.repeat(64)) {
  return {
    roomId,
    actorSeatId: 'front',
    credentialGeneration: 1,
    expectedRevision: revision,
    mutationId: `threejs065_allocate_${String(serial).padStart(14, '0')}`,
    fingerprint,
    invitationId: `invite-${roomId}-${seatId}-${serial}`,
    seatId,
  };
}

test('manual invitation namespace is exactly 00-99 and rejection sampling discards modulo-bias tail', () => {
  const codes = allManualInviteCodes();
  assert.equal(MANUAL_INVITE_CODE_CAPACITY, 100);
  assert.equal(MANUAL_INVITE_TTL_MS, 600_000);
  assert.equal(codes.length, 100);
  assert.equal(new Set(codes).size, 100);
  assert.equal(codes[0], '00');
  assert.equal(codes.at(-1), '99');

  const samples = [0xffff_ffff, 4];
  const selected = chooseUnbiasedManualInviteCode(['00', '01', '02'], () => samples.shift());
  assert.equal(selected, '01', '2^32-1 must be rejected for a 3-way choice before modulo is applied');
});

test('memory store accepts exactly 100 simultaneous active manual invitations and rejects the 101st', async () => {
  let now = 1_000_000;
  const store = createInMemoryAuthoritativeStore({
    authoritativeRooms: memoryRooms(34),
    nowMs: () => now,
    randomUint32: () => 0,
  });
  const revisions = new Map(Array.from({ length: 34 }, (_, index) => [String(index).padStart(2, '0'), 1]));
  const seats = ['right', 'back', 'left'];
  const issued = [];
  let serial = 1;

  for (let roomIndex = 0; roomIndex < 34 && issued.length < 100; roomIndex += 1) {
    const roomId = String(roomIndex).padStart(2, '0');
    for (const seatId of seats) {
      if (issued.length >= 100) break;
      const result = await store.allocateInvitation(allocateInput(roomId, revisions.get(roomId), seatId, serial));
      issued.push(result.invitation);
      revisions.set(roomId, result.snapshot.revision);
      serial += 1;
    }
  }

  assert.equal(issued.length, 100);
  assert.deepEqual(issued.map(invitation => invitation.locator), allManualInviteCodes());
  await assert.rejects(
    store.allocateInvitation(allocateInput('33', revisions.get('33'), 'back', serial)),
    error => error?.code === 'INVITE_CODE_CAPACITY' && error?.safeDetails?.capacity === 100,
  );

  now += 1;
});

test('revoke, expiry and claimed state each release a manual locator without making the short code a recovery credential', async () => {
  let now = 2_000_000;
  const store = createInMemoryAuthoritativeStore({
    authoritativeRooms: memoryRooms(2),
    nowMs: () => now,
    randomUint32: () => 0,
  });

  const first = await store.allocateInvitation(allocateInput('00', 1, 'right', 201));
  assert.equal(first.invitation.locator, '00');
  assert.equal((await store.lookupInvitation({ locator: '00' })).invitationId, first.invitation.invitationId);

  const revoked = await store.revokeInvitation({
    roomId: '00',
    actorSeatId: 'front',
    credentialGeneration: 1,
    expectedRevision: first.snapshot.revision,
    mutationId: 'threejs065_revoke_00000000000001',
    fingerprint: 'b'.repeat(64),
    invitationId: first.invitation.invitationId,
  });
  assert.equal(revoked.invitation.state, AUTHORITATIVE_INVITATION_STATES.REVOKED);
  assert.equal(await store.lookupInvitation({ locator: '00' }), null);

  const reusedAfterRevoke = await store.allocateInvitation(allocateInput('00', revoked.snapshot.revision, 'right', 202));
  assert.equal(reusedAfterRevoke.invitation.locator, '00');

  now = reusedAfterRevoke.invitation.expiresAtMs + 1;
  assert.equal(await store.lookupInvitation({ locator: '00' }), null);
  const reusedAfterExpiry = await store.allocateInvitation(allocateInput('01', 1, 'right', 203));
  assert.equal(reusedAfterExpiry.invitation.locator, '00');

  const claimed = await store.transactAuthority({
    roomId: '01',
    actor: { kind: AUTHORITATIVE_ACTOR_KINDS.SEAT, key: 'front', generation: 1 },
    expectedRevision: reusedAfterExpiry.snapshot.revision,
    idempotencyKey: 'threejs065_claim_release_000000001',
    fingerprint: 'c'.repeat(64),
    operation: AUTHORITATIVE_OPERATION_NAMES.CLAIM_INVITATION,
    invitationId: reusedAfterExpiry.invitation.invitationId,
    transition: ({ state, invitation }) => ({
      state,
      invitation: { ...invitation, state: AUTHORITATIVE_INVITATION_STATES.CLAIMED },
    }),
  });
  assert.equal(claimed.invitation.state, AUTHORITATIVE_INVITATION_STATES.CLAIMED);
  assert.equal(await store.lookupInvitation({ locator: '00' }), null, 'claimed code must never recover seat authority');

  const secondRoomReuse = await store.allocateInvitation(allocateInput('00', reusedAfterRevoke.snapshot.revision, 'back', 204));
  assert.equal(secondRoomReuse.invitation.locator, '00');
});

class NodeSqliteConnection {
  constructor() {
    this.db = new DatabaseSync(':memory:');
  }

  close() { this.db.close(); }
  async run(sql, ...args) {
    const result = this.db.prepare(sql).run(...args);
    return { changes: Number(result.changes), lastInsertRowid: result.lastInsertRowid };
  }
  async get(sql, ...args) { return this.db.prepare(sql).get(...args); }
  async all(sql, ...args) { return this.db.prepare(sql).all(...args); }
  async batch(statements, mode) {
    this.db.exec(mode ? `BEGIN ${String(mode).toUpperCase()}` : 'BEGIN');
    try {
      const results = [];
      for (const statement of statements) {
        if (typeof statement === 'string') {
          this.db.exec(statement);
          results.push({ rowsAffected: 0, rows: [] });
        } else {
          const result = this.db.prepare(statement.sql).run(...(statement.args || []));
          results.push({ rowsAffected: Number(result.changes), rows: [] });
        }
      }
      this.db.exec('COMMIT');
      return results;
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }
  transactionAsync(fn) {
    const execute = mode => async (...args) => {
      this.db.exec(`BEGIN ${mode}`);
      const tx = {
        run: this.run.bind(this),
        get: this.get.bind(this),
        all: this.all.bind(this),
        batch: async statements => {
          const results = [];
          for (const statement of statements) {
            if (typeof statement === 'string') this.db.exec(statement);
            else this.db.prepare(statement.sql).run(...(statement.args || []));
            results.push({ rowsAffected: 0, rows: [] });
          }
          return results;
        },
      };
      try {
        const value = await fn(tx, ...args);
        this.db.exec('COMMIT');
        return value;
      } catch (error) {
        try { this.db.exec('ROLLBACK'); } catch {}
        throw error;
      }
    };
    const wrapper = execute('DEFERRED');
    wrapper.immediate = execute('IMMEDIATE');
    wrapper.deferred = execute('DEFERRED');
    wrapper.exclusive = execute('EXCLUSIVE');
    wrapper.concurrent = execute('IMMEDIATE');
    return wrapper;
  }
}

async function seedTursoRoom(connection, now) {
  const T = AUTHORITY_TABLES;
  const roomState = configuredState(1);
  await connection.run(`INSERT INTO ${T.lobbies}
    (room_id, schema_version, revision, lobby_generation, state_json, created_at_ms, updated_at_ms, expires_at_ms, tombstoned_at_ms)
    VALUES ('54', 1, 4, 1, ?, ?, ?, ?, NULL)`, JSON.stringify(roomState), now, now, now + 3_600_000);
  await connection.run(`INSERT INTO ${T.seats}
    (room_id, seat_id, schema_version, seat_type, lobby_generation, credential_hash, credential_generation, created_at_ms, updated_at_ms)
    VALUES ('54', 'front', 1, 'host', 1, ?, 1, ?, ?)`, 'f'.repeat(64), now, now);
}

test('Turso partial uniqueness enforces real 100/101 saturation and expiry/revocation make codes reusable', async (t) => {
  let now = 3_000_000;
  const connection = new NodeSqliteConnection();
  t.after(() => connection.close());
  const store = createTursoAuthoritativeStoreFromConnection(connection, {
    nowMs: () => now,
    randomUint32: () => 0,
    busyRetries: 0,
  });
  await store.ensureTable();
  await seedTursoRoom(connection, now);

  const T = AUTHORITY_TABLES;
  for (let index = 0; index < 100; index += 1) {
    const locator = String(index).padStart(2, '0');
    await connection.run(`INSERT INTO ${T.invitations}
      (invitation_id, schema_version, locator, room_id, seat_id, lobby_generation, state,
       claim_generation, data_json, created_at_ms, updated_at_ms, expires_at_ms)
      VALUES (?, 1, ?, ?, ?, 1, 'open', 0, ?, ?, ?, ?)`,
    `saturation-${locator}`, locator, `other-${locator}`, `seat-${locator}`,
    JSON.stringify({ color: 'marble' }), now, now, now + 600_000);
  }

  await assert.rejects(store.allocateInvitation({
    roomId: '54', actorSeatId: 'front', credentialGeneration: 1, expectedRevision: 4,
    mutationId: 'threejs065_turso_capacity_0000001', fingerprint: 'd'.repeat(64),
    invitationId: 'real-invite-101', seatId: 'right',
  }), error => error?.code === 'INVITE_CODE_CAPACITY');

  await connection.run(`UPDATE ${T.invitations} SET state='revoked' WHERE locator='00' AND state='open'`);
  const reused = await store.allocateInvitation({
    roomId: '54', actorSeatId: 'front', credentialGeneration: 1, expectedRevision: 4,
    mutationId: 'threejs065_turso_reuse_000000001', fingerprint: 'e'.repeat(64),
    invitationId: 'real-invite-reuse', seatId: 'right',
  });
  assert.equal(reused.invitation.locator, '00');
  assert.equal(reused.snapshot.revision, 5);

  const openLocatorRows = await connection.all(`SELECT locator, COUNT(*) AS count
    FROM ${T.invitations} WHERE state='open' GROUP BY locator HAVING COUNT(*) > 1`);
  assert.deepEqual(openLocatorRows, []);

  await connection.run(`UPDATE ${T.invitations} SET expires_at_ms=? WHERE invitation_id='real-invite-reuse'`, now);
  now += 1;
  assert.equal(await store.lookupInvitation({ locator: '00' }), null);
});
