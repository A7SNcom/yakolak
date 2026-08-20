import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { AUTHORITATIVE_ACTOR_KINDS } from '../backend/cloudflare/src/authoritative-api.js';
import {
  AUTHORITY_SCHEMA_VERSION,
  AUTHORITY_TABLES,
  PROBE_TABLE,
} from '../backend/cloudflare/src/authoritative-schema.js';
import { createTursoAuthoritativeStoreFromConnection } from '../backend/cloudflare/src/authoritative-turso-store.js';

class NodeSqliteConnection {
  constructor(filename) {
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA busy_timeout = 0');
  }

  close() {
    this.db.close();
  }

  async run(sql, ...args) {
    const result = this.db.prepare(sql).run(...args);
    return { changes: Number(result.changes), lastInsertRowid: result.lastInsertRowid };
  }

  async get(sql, ...args) {
    return this.db.prepare(sql).get(...args);
  }

  async all(sql, ...args) {
    return this.db.prepare(sql).all(...args);
  }

  async batch(statements, mode) {
    const begin = mode ? `BEGIN ${String(mode).toUpperCase()}` : 'BEGIN';
    this.db.exec(begin);
    const results = [];
    try {
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
    const execute = (mode) => async (...args) => {
      this.db.exec(`BEGIN ${mode}`);
      const tx = {
        run: this.run.bind(this),
        get: this.get.bind(this),
        all: this.all.bind(this),
        batch: async (statements) => {
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

async function fixture(t, { now = 2_000_000 } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'threejs063-'));
  const filename = path.join(dir, 'authority.sqlite');
  const connections = [];
  const open = () => {
    const connection = new NodeSqliteConnection(filename);
    connections.push(connection);
    return connection;
  };
  const primary = open();
  const store = createTursoAuthoritativeStoreFromConnection(primary, {
    nowMs: () => now,
    busyRetries: 20,
    sleepFn: ms => new Promise(resolve => setTimeout(resolve, ms)),
  });
  await store.ensureTable();
  t.after(async () => {
    for (const connection of connections) {
      try { connection.close(); } catch {}
    }
    await rm(dir, { recursive: true, force: true });
  });
  return { filename, open, primary, store, now };
}

function state(marker = null) {
  return { protocol: 5, status: 'playing', marker, turnIndex: 0, moveNumber: 0 };
}

async function seedLobby(connection, {
  roomId = '54',
  revision = 7,
  lobbyGeneration = 3,
  roomState = state(),
  now = 2_000_000,
  expiresAt = now + 60_000,
  tombstonedAt = null,
} = {}) {
  const T = AUTHORITY_TABLES;
  await connection.run(`INSERT INTO ${T.lobbies}
    (room_id, schema_version, revision, lobby_generation, state_json, created_at_ms, updated_at_ms, expires_at_ms, tombstoned_at_ms)
    VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)`,
  roomId, revision, lobbyGeneration, JSON.stringify(roomState), now, now, expiresAt, tombstonedAt);
}

async function seedSeat(connection, {
  roomId = '54', seatId = 'p1', seatType = 'host', lobbyGeneration = 3,
  credentialHash = 'a'.repeat(64), credentialGeneration = 2, now = 2_000_000,
} = {}) {
  const T = AUTHORITY_TABLES;
  await connection.run(`INSERT INTO ${T.seats}
    (room_id, seat_id, schema_version, seat_type, lobby_generation, credential_hash, credential_generation, created_at_ms, updated_at_ms)
    VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)`,
  roomId, seatId, seatType, lobbyGeneration, credentialHash, credentialGeneration, now, now);
}

async function seedInvitation(connection, {
  invitationId = 'invite-54-p2', locator = '42', roomId = '54', seatId = 'p2',
  lobbyGeneration = 3, invitationState = 'open', now = 2_000_000, reserveLocator = true,
} = {}) {
  const T = AUTHORITY_TABLES;
  const expiresAt = now + 60_000;
  await connection.run(`INSERT INTO ${T.invitations}
    (invitation_id, schema_version, locator, room_id, seat_id, lobby_generation, state,
     claim_generation, data_json, created_at_ms, updated_at_ms, expires_at_ms)
    VALUES (?, 1, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
  invitationId, locator, roomId, seatId, lobbyGeneration, invitationState,
  JSON.stringify({ seeded: true }), now, now, expiresAt);
  if (reserveLocator && invitationState === 'open') {
    await connection.run(`INSERT INTO ${T.manualLocators}
      (locator, invitation_id, room_id, seat_id, lobby_generation, expires_at_ms, created_at_ms, updated_at_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    locator, invitationId, roomId, seatId, lobbyGeneration, expiresAt, now, now);
  }
}

function transaction({
  roomId = '54', actor = { kind: 'seat', key: 'p1', generation: 2 },
  expectedRevision = 7, idempotencyKey = 'mutation-000000000000000000000001',
  fingerprint = 'b'.repeat(64), operation = 'move', invitationId = null,
  transition = ({ state: current }) => ({ state: { ...current, moveNumber: current.moveNumber + 1 } }),
} = {}) {
  return { roomId, actor, expectedRevision, idempotencyKey, fingerprint, operation, invitationId, transition };
}

test('THREEJS-063 additive schema creates every versioned authority record + migration ledger without replacing PAGES-005 probe table', async (t) => {
  const { primary, store } = await fixture(t);
  await store.ensureTable();
  const rows = await primary.all("SELECT name, type FROM sqlite_master WHERE type IN ('table','index')");
  const names = new Set(rows.map(row => String(row.name)));
  assert.equal(names.has(PROBE_TABLE), true);
  for (const table of Object.values(AUTHORITY_TABLES)) assert.equal(names.has(table), true, table);
  for (const index of [
    'yakolak_authority_lobbies_expiry_v1',
    'yakolak_authority_seats_credential_v1',
    'yakolak_authority_seat_configurations_room_v1',
    'yakolak_authority_invitations_locator_v1',
    'yakolak_authority_invitations_room_state_v1',
    'yakolak_authority_manual_locators_expiry_v1',
    'yakolak_authority_readiness_room_v1',
    'yakolak_authority_deadlines_due_v1',
    'yakolak_authority_votes_scope_v1',
    'yakolak_authority_receipts_revision_v1',
  ]) assert.equal(names.has(index), true, index);

  const migration = await primary.get(`SELECT schema_version, migration_name FROM ${AUTHORITY_TABLES.migrations}`);
  assert.equal(Number(migration.schema_version), AUTHORITY_SCHEMA_VERSION);
  assert.equal(migration.migration_name, 'threejs-063-authority-v1');
});

test('historical invitation rows may repeat a locator while active manual resolution follows the single reservation', async (t) => {
  const { primary, store, now } = await fixture(t);
  await seedLobby(primary, { roomId: '54', now });
  await seedLobby(primary, { roomId: '55', now });
  await seedInvitation(primary, { invitationId: 'invite-a', locator: '42', roomId: '54', now, reserveLocator: false });
  await seedInvitation(primary, { invitationId: 'invite-b', locator: '42', roomId: '55', invitationState: 'expired', now, reserveLocator: false });
  await primary.run(`INSERT INTO ${AUTHORITY_TABLES.manualLocators}
    (locator, invitation_id, room_id, seat_id, lobby_generation, expires_at_ms, created_at_ms, updated_at_ms)
    VALUES ('42','invite-a','54','p2',3,?,?,?)`, now + 60_000, now, now);
  const resolved = await store.lookupInvitation({ locator: '42' });
  assert.equal(resolved.invitationId, 'invite-a');
  assert.equal(resolved.state, 'open');
});

test('Turso store capabilities are authoritative and seat auth derives server seat/generation from credential hash', async (t) => {
  const { primary, store, now } = await fixture(t);
  await seedLobby(primary, { now });
  await seedSeat(primary, { now });
  assert.deepEqual(store.getCapabilities(), {
    interfaceVersion: 1,
    mode: 'turso-authoritative-v1',
    authoritativeRead: true,
    authoritativeMutation: true,
    invitationLookup: true,
    transactionalAuthority: true,
    durableMutationReceipts: true,
  });
  const auth = await store.authorizeSeat({ roomId: '54', credentialHash: 'a'.repeat(64) });
  assert.equal(auth.seatId, 'p1');
  assert.equal(auth.credentialGeneration, 2);
  assert.equal(auth.snapshot.revision, 7);
  await assert.rejects(store.authorizeSeat({ roomId: '54', credentialHash: 'c'.repeat(64) }), /seat_credential_rejected/);
});

test('durable receipt replays the exact committed snapshot across store/connection instances and blocks cross-operation reuse', async (t) => {
  const { primary, open, store, now } = await fixture(t);
  await seedLobby(primary, { now });
  await seedSeat(primary, { now });
  const request = transaction();
  const first = await store.transactAuthority(request);
  assert.equal(first.status, 'committed');
  assert.equal(first.snapshot.revision, 8);
  assert.equal(first.snapshot.state.moveNumber, 1);

  const secondConnection = open();
  const secondStore = createTursoAuthoritativeStoreFromConnection(secondConnection, {
    nowMs: () => now + 1,
    busyRetries: 20,
    sleepFn: ms => new Promise(resolve => setTimeout(resolve, ms)),
  });
  const replay = await secondStore.transactAuthority(request);
  assert.equal(replay.status, 'duplicate');
  assert.deepEqual(replay.receipt, first.receipt);
  assert.deepEqual(replay.snapshot, first.snapshot);

  await assert.rejects(secondStore.transactAuthority({
    ...request,
    expectedRevision: 8,
    operation: 'start-match',
  }), /idempotency_key_reused/);
});

test('competing move transactions from separate connections converge to one revision winner', async (t) => {
  const { primary, open, now } = await fixture(t);
  await seedLobby(primary, { now });
  await seedSeat(primary, { now });
  const c1 = open();
  const c2 = open();
  const options = { nowMs: () => now + 10, busyRetries: 40, sleepFn: ms => new Promise(resolve => setTimeout(resolve, ms)) };
  const s1 = createTursoAuthoritativeStoreFromConnection(c1, options);
  const s2 = createTursoAuthoritativeStoreFromConnection(c2, options);

  let transitionRuns = 0;
  const make = (key, marker) => transaction({
    idempotencyKey: key,
    fingerprint: marker.repeat(64),
    transition: async ({ state: current }) => {
      transitionRuns += 1;
      await new Promise(resolve => setTimeout(resolve, 8));
      return { state: { ...current, marker, moveNumber: current.moveNumber + 1 } };
    },
  });
  const results = await Promise.allSettled([
    s1.transactAuthority(make('mutation-race-00000000000000000001', 'c')),
    s2.transactAuthority(make('mutation-race-00000000000000000002', 'd')),
  ]);
  const fulfilled = results.filter(result => result.status === 'fulfilled');
  const rejected = results.filter(result => result.status === 'rejected');
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.match(String(rejected[0].reason?.message), /revision_conflict/);
  assert.equal(fulfilled[0].value.snapshot.revision, 8);
  assert.equal(transitionRuns, 1);
});

test('duplicate mutation race converges to committed+duplicate while executing pure transition once', async (t) => {
  const { primary, open, now } = await fixture(t);
  await seedLobby(primary, { now });
  await seedSeat(primary, { now });
  const options = { nowMs: () => now + 20, busyRetries: 40, sleepFn: ms => new Promise(resolve => setTimeout(resolve, ms)) };
  const s1 = createTursoAuthoritativeStoreFromConnection(open(), options);
  const s2 = createTursoAuthoritativeStoreFromConnection(open(), options);
  let runs = 0;
  const request = transaction({
    idempotencyKey: 'same-mutation-race-000000000000001',
    fingerprint: 'e'.repeat(64),
    transition: async ({ state: current }) => {
      runs += 1;
      await new Promise(resolve => setTimeout(resolve, 8));
      return { state: { ...current, marker: 'dedupe', moveNumber: current.moveNumber + 1 } };
    },
  });
  const values = await Promise.all([s1.transactAuthority(request), s2.transactAuthority(request)]);
  assert.deepEqual(values.map(value => value.status).sort(), ['committed', 'duplicate']);
  assert.deepEqual(values[0].receipt, values[1].receipt);
  assert.deepEqual(values[0].snapshot, values[1].snapshot);
  assert.equal(runs, 1);
});

test('invitation-claim race and timeout-vs-computer race use the same room revision transaction boundary', async (t) => {
  const { primary, open, now } = await fixture(t);
  await seedLobby(primary, { now });
  await seedSeat(primary, { now });
  await seedInvitation(primary, { now });
  const options = { nowMs: () => now + 30, busyRetries: 40, sleepFn: ms => new Promise(resolve => setTimeout(resolve, ms)) };
  const s1 = createTursoAuthoritativeStoreFromConnection(open(), options);
  const s2 = createTursoAuthoritativeStoreFromConnection(open(), options);

  const claim = (key, claimant) => transaction({
    actor: { kind: AUTHORITATIVE_ACTOR_KINDS.CLAIM, key: claimant, generation: null },
    idempotencyKey: key,
    fingerprint: claimant[0].repeat(64),
    operation: 'claim-invitation',
    invitationId: 'invite-54-p2',
    transition: async ({ state: current, invitation }) => {
      assert.equal(invitation.state, 'open');
      await new Promise(resolve => setTimeout(resolve, 6));
      return { state: { ...current, marker: claimant }, invitation: { ...invitation, state: 'claimed' } };
    },
  });
  const claims = await Promise.allSettled([
    s1.transactAuthority(claim('claim-race-00000000000000000000001', 'claim-a')),
    s2.transactAuthority(claim('claim-race-00000000000000000000002', 'claim-b')),
  ]);
  assert.equal(claims.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(claims.filter(value => value.status === 'rejected').length, 1);
  assert.match(String(claims.find(value => value.status === 'rejected').reason?.message), /revision_conflict/);
  assert.equal(await s1.lookupInvitation({ locator: '42' }), null, 'claimed invitation releases the short manual locator');
  const claimedRow = await primary.get(`SELECT state FROM ${AUTHORITY_TABLES.invitations} WHERE invitation_id='invite-54-p2'`);
  assert.equal(String(claimedRow.state), 'claimed');

  const current = await primary.get(`SELECT revision FROM ${AUTHORITY_TABLES.lobbies} WHERE room_id = '54'`);
  const revision = Number(current.revision);
  const serverAction = (operation, key, marker) => transaction({
    actor: { kind: AUTHORITATIVE_ACTOR_KINDS.SERVER, key, generation: null },
    expectedRevision: revision,
    idempotencyKey: `${operation}-race-00000000000000000001`,
    fingerprint: marker.repeat(64),
    operation,
    transition: async ({ state: currentState }) => {
      await new Promise(resolve => setTimeout(resolve, 6));
      return { state: { ...currentState, marker } };
    },
  });
  const reconciliation = await Promise.allSettled([
    s1.transactAuthority(serverAction('reconcile-timeout', 'timeout', 'f')),
    s2.transactAuthority(serverAction('reconcile-computer', 'computer', 'a')),
  ]);
  assert.equal(reconciliation.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(reconciliation.filter(value => value.status === 'rejected').length, 1);
  assert.match(String(reconciliation.find(value => value.status === 'rejected').reason?.message), /revision_conflict/);
});

test('cleanup never removes expired receipts from an active lobby, but removes all authority rows only after lobby tombstone+expiry', async (t) => {
  const { primary, store, now } = await fixture(t);
  await seedLobby(primary, { roomId: '54', now, expiresAt: now - 10, tombstonedAt: null });
  await seedSeat(primary, { roomId: '54', now });
  await primary.run(`INSERT INTO ${AUTHORITY_TABLES.receipts}
    (room_id,idempotency_key,schema_version,operation,actor_kind,actor_key,actor_generation,fingerprint,
     committed_revision,snapshot_json,committed_at_ms,expires_at_ms)
    VALUES ('54','old-active-receipt',1,'move','seat','p1',2,?,7,?,1,2)`,
  'a'.repeat(64), JSON.stringify({ roomId: '54', revision: 7, state: state() }));

  await seedLobby(primary, { roomId: '55', now, expiresAt: now - 10, tombstonedAt: now - 20 });
  await seedSeat(primary, { roomId: '55', credentialHash: 'b'.repeat(64), now });
  await primary.run(`INSERT INTO ${AUTHORITY_TABLES.receipts}
    (room_id,idempotency_key,schema_version,operation,actor_kind,actor_key,actor_generation,fingerprint,
     committed_revision,snapshot_json,committed_at_ms,expires_at_ms)
    VALUES ('55','old-dead-receipt',1,'move','seat','p1',2,?,7,?,1,2)`,
  'b'.repeat(64), JSON.stringify({ roomId: '55', revision: 7, state: state() }));

  await store.cleanup(new Date(now).toISOString());
  assert.ok(await primary.get(`SELECT idempotency_key FROM ${AUTHORITY_TABLES.receipts} WHERE room_id='54'`));
  assert.ok(await primary.get(`SELECT room_id FROM ${AUTHORITY_TABLES.lobbies} WHERE room_id='54'`));
  assert.equal(await primary.get(`SELECT room_id FROM ${AUTHORITY_TABLES.lobbies} WHERE room_id='55'`), undefined);
  assert.equal(await primary.get(`SELECT idempotency_key FROM ${AUTHORITY_TABLES.receipts} WHERE room_id='55'`), undefined);
  assert.equal(await primary.get(`SELECT seat_id FROM ${AUTHORITY_TABLES.seats} WHERE room_id='55'`), undefined);
});
