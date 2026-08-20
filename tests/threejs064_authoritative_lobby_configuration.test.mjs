import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import {
  applyInitialLobbyConfiguration,
  createConfigureLobbyTransaction,
  materializeLobbySeatRecords,
  normalizeLobbyConfiguration,
  validateMaterializedLobbySeatRecords,
} from '../backend/cloudflare/src/authoritative-lobby-config.js';
import { createInMemoryAuthoritativeStore } from '../backend/cloudflare/src/authoritative-memory-store.js';
import { materializeTursoLobbySeatBindings } from '../backend/cloudflare/src/authoritative-turso-seat-materialization.js';
import { AUTHORITATIVE_SEAT_TYPES } from '../backend/cloudflare/src/authoritative-api.js';
import { COLORS, emptyBoard } from '../web/app/shared/rules.js';
import { configuredSeatOrder } from '../web/app/shared/seat-order.js';

function config(preferredColor, targetPlayers, winsToMatch = 3) {
  return {
    preferredColor,
    targetPlayers,
    winsToMatch,
    remainingSeatTypes: Array.from({ length: targetPlayers - 1 }, (_, index) =>
      index % 2 === 0 ? AUTHORITATIVE_SEAT_TYPES.ONLINE : AUTHORITATIVE_SEAT_TYPES.COMPUTER),
  };
}

function bootstrapState(hostSlot, lobbyGeneration = 0) {
  return {
    protocol: 5,
    status: 'waiting',
    lobbyGeneration,
    preferredColor: null,
    targetPlayers: null,
    targetRounds: null,
    winsToMatch: null,
    players: [{ seat: hostSlot.seatId, color: hostSlot.color, type: 'host' }],
    turnIndex: 0,
    board: emptyBoard(),
    round: 1,
    completedRounds: 0,
    scores: { [hostSlot.seatId]: 0 },
    winner: null,
    draw: false,
    lastMove: null,
    moveNumber: 0,
    matchComplete: false,
    matchWinner: null,
    matchWinners: [],
    rematch: { [hostSlot.seatId]: false },
    skippedSeat: null,
  };
}

function transactionInput({
  roomId = '54', actorSeatId, credentialGeneration = 3,
  expectedRevision = 4, mutationId = 'configure_lobby_mutation_000000000001',
  fingerprint = 'a'.repeat(64), configuration,
}) {
  return createConfigureLobbyTransaction({
    roomId,
    actorSeatId,
    credentialGeneration,
    expectedRevision,
    mutationId,
    fingerprint,
    configuration,
  });
}

test('THREEJS-064 materializes every preferred-color × 2/3/4 ring without changing fixed physical/color identity', () => {
  for (const preferredColor of COLORS) {
    for (const targetPlayers of [2, 3, 4]) {
      for (const winsToMatch of [3, 5]) {
        const configuration = config(preferredColor, targetPlayers, winsToMatch);
        const records = materializeLobbySeatRecords(configuration, 7);
        const expected = configuredSeatOrder(preferredColor, targetPlayers);
        assert.deepEqual(records.map(record => record.seatId), expected.map(record => record.seatId));
        assert.deepEqual(records.map(record => record.spatialSlot), expected.map(record => record.spatialSlot));
        assert.deepEqual(records.map(record => record.color), expected.map(record => record.color));
        assert.equal(records[0].type, 'host');
        assert.deepEqual(records.slice(1).map(record => record.type), configuration.remainingSeatTypes);
        assert.deepEqual(records.map(record => record.configuredIndex), Array.from({ length: targetPlayers }, (_, index) => index));
        assert.ok(records.every(record => record.lobbyGeneration === 7));
      }
    }
  }
});

test('configuration validation is closed and only permits Online/Computer after the host', () => {
  assert.deepEqual(normalizeLobbyConfiguration(config('marble', 2, 3)), config('marble', 2, 3));
  assert.throws(() => normalizeLobbyConfiguration({ ...config('marble', 2), preferredColor: 'purple' }), /invalid_preferred_color/);
  assert.throws(() => normalizeLobbyConfiguration({ ...config('marble', 2), targetPlayers: 5 }), /invalid_target_players/);
  assert.throws(() => normalizeLobbyConfiguration({ ...config('marble', 2), winsToMatch: 4 }), /invalid_wins_to_match/);
  assert.throws(() => normalizeLobbyConfiguration({ ...config('marble', 2), remainingSeatTypes: ['host'] }), /invalid_remaining_seat_type/);
  assert.throws(() => normalizeLobbyConfiguration({ ...config('marble', 3), remainingSeatTypes: ['online'] }), /invalid_remaining_seat_types/);
  assert.throws(() => normalizeLobbyConfiguration({ ...config('marble', 2), extra: true }), /invalid_lobby_configuration/);
});

test('host-owned initial configuration commits fixed-order player/type records and remains idempotent', async () => {
  const configuration = config('green', 4, 5);
  const hostSlot = configuredSeatOrder(configuration.preferredColor, configuration.targetPlayers)[0];
  const credentialHash = 'b'.repeat(64);
  const store = createInMemoryAuthoritativeStore({
    authoritativeRooms: [{
      roomId: '54',
      revision: 4,
      state: bootstrapState(hostSlot, 2),
      seats: [{ seatId: hostSlot.seatId, credentialHash, credentialGeneration: 3 }],
    }],
  });
  const tx = transactionInput({ actorSeatId: hostSlot.seatId, configuration });
  const committed = await store.transactAuthority(tx);
  assert.equal(committed.status, 'committed');
  assert.equal(committed.snapshot.revision, 5);
  assert.equal(committed.snapshot.state.preferredColor, 'green');
  assert.equal(committed.snapshot.state.targetPlayers, 4);
  assert.equal(committed.snapshot.state.winsToMatch, 5);
  assert.equal(committed.snapshot.state.targetRounds, 5);
  assert.deepEqual(
    committed.snapshot.state.players,
    materializeLobbySeatRecords(configuration, 2).map(({ seatId, color, type }) => ({ seat: seatId, color, type })),
  );

  const authorized = await store.authorizeSeat({ roomId: '54', credentialHash });
  assert.equal(authorized.seatId, hostSlot.seatId);
  assert.equal(authorized.credentialGeneration, 3);

  const duplicate = await store.transactAuthority(tx);
  assert.equal(duplicate.status, 'duplicate');
  assert.deepEqual(duplicate.snapshot, committed.snapshot);

  await assert.rejects(store.transactAuthority(transactionInput({
    actorSeatId: hostSlot.seatId,
    configuration,
    expectedRevision: 5,
    mutationId: 'configure_lobby_mutation_000000000002',
    fingerprint: 'c'.repeat(64),
  })), /lobby_already_configured/, 'THREEJS-068 owns edits/generation invalidation after initial resolution');
});

test('non-host authority and mismatched preferred-color host seat fail closed', async () => {
  const configuration = config('marble', 2, 3);
  const hostSlot = configuredSeatOrder('marble', 2)[0];
  const store = createInMemoryAuthoritativeStore({
    authoritativeRooms: [{
      roomId: '54',
      revision: 4,
      state: bootstrapState(hostSlot),
      seats: [
        { seatId: hostSlot.seatId, credentialHash: 'd'.repeat(64), credentialGeneration: 1 },
        { seatId: 'back', credentialHash: 'e'.repeat(64), credentialGeneration: 1 },
      ],
    }],
  });

  await assert.rejects(store.transactAuthority(transactionInput({
    actorSeatId: 'back', credentialGeneration: 1, configuration,
  })), /host_only_lobby_configuration/);

  const wrongPreference = config('gold', 2, 3);
  assert.throws(
    () => applyInitialLobbyConfiguration(bootstrapState(hostSlot), hostSlot.seatId, wrongPreference),
    /host_seat_preference_mismatch/,
  );
});

test('join/connection order cannot redefine the canonical configured order', () => {
  const configuration = config('blue', 4, 3);
  const state = applyInitialLobbyConfiguration(
    bootstrapState(configuredSeatOrder('blue', 4)[0]),
    configuredSeatOrder('blue', 4)[0].seatId,
    configuration,
  );
  const canonical = state.seatRecords;
  const reversedArrival = [...canonical].reverse();
  assert.notDeepEqual(reversedArrival.map(seat => seat.seatId), canonical.map(seat => seat.seatId));
  assert.throws(
    () => validateMaterializedLobbySeatRecords(reversedArrival, state.state),
    /materialized_seat_order_mismatch|materialized_host_mismatch/,
  );
  assert.deepEqual(
    canonical.map(seat => seat.seatId),
    configuredSeatOrder('blue', 4).map(seat => seat.seatId),
  );
});

function sqliteSeatTx(db) {
  return {
    all(sql, ...args) { return db.prepare(sql).all(...args); },
    run(sql, ...args) {
      const result = db.prepare(sql).run(...args);
      return { changes: Number(result.changes) };
    },
  };
}

function createSqliteSeatTables(db) {
  db.exec(`CREATE TABLE seats (
    room_id TEXT NOT NULL,
    seat_id TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    seat_type TEXT NOT NULL,
    lobby_generation INTEGER NOT NULL,
    credential_hash TEXT,
    credential_generation INTEGER NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (room_id, seat_id),
    UNIQUE (room_id, credential_hash)
  )`);
  db.exec(`CREATE TABLE seat_configurations (
    room_id TEXT NOT NULL,
    lobby_generation INTEGER NOT NULL,
    seat_id TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    configured_index INTEGER NOT NULL,
    spatial_slot TEXT NOT NULL,
    color TEXT NOT NULL,
    seat_type TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (room_id, lobby_generation, seat_id),
    UNIQUE (room_id, lobby_generation, configured_index),
    UNIQUE (room_id, lobby_generation, spatial_slot),
    UNIQUE (room_id, lobby_generation, color)
  )`);
}

test('Turso seat materialization persists exact configured seat/color/type identity and keeps credentials separate', async () => {
  const db = new DatabaseSync(':memory:');
  createSqliteSeatTables(db);
  const configuration = config('gold', 3, 5);
  const records = materializeLobbySeatRecords(configuration, 9);
  const host = records[0];
  db.prepare(`INSERT INTO seats VALUES (?, ?, 1, 'host', 9, ?, 4, 10, 10)`).run('54', host.seatId, 'f'.repeat(64));

  await materializeTursoLobbySeatBindings({
    tx: sqliteSeatTx(db),
    seatsTable: 'seats',
    seatConfigurationsTable: 'seat_configurations',
    transaction: {
      operation: 'configure-lobby',
      actor: { kind: 'seat', key: host.seatId, generation: 4 },
      roomId: '54',
    },
    state: { preferredColor: 'gold', targetPlayers: 3, lobbyGeneration: 9 },
    records,
    nowMs: 20,
  });

  const configuredRows = db.prepare(`SELECT seat_id, spatial_slot, color, seat_type, configured_index, lobby_generation
    FROM seat_configurations WHERE room_id='54' ORDER BY configured_index`).all();
  assert.deepEqual(configuredRows.map(row => ({
    seatId: String(row.seat_id),
    spatialSlot: String(row.spatial_slot),
    color: String(row.color),
    type: String(row.seat_type),
    configuredIndex: Number(row.configured_index),
    lobbyGeneration: Number(row.lobby_generation),
  })), records.map(record => ({
    seatId: record.seatId,
    spatialSlot: record.spatialSlot,
    color: record.color,
    type: record.type,
    configuredIndex: record.configuredIndex,
    lobbyGeneration: record.lobbyGeneration,
  })));

  const rows = db.prepare(`SELECT seat_id, seat_type, credential_hash, credential_generation, lobby_generation FROM seats WHERE room_id='54' ORDER BY seat_id`).all();
  assert.equal(rows.length, 3);
  const hostRow = rows.find(row => row.seat_id === host.seatId);
  assert.equal(hostRow.seat_type, 'host');
  assert.equal(hostRow.credential_hash, 'f'.repeat(64));
  assert.equal(Number(hostRow.credential_generation), 4);
  for (const record of records.slice(1)) {
    const row = rows.find(candidate => candidate.seat_id === record.seatId);
    assert.equal(row.seat_type, record.type);
    assert.equal(row.credential_hash, null);
    assert.equal(Number(row.credential_generation), 0);
    assert.equal(Number(row.lobby_generation), 9);
  }
  db.close();
});

test('seat materialization refuses to overwrite any already-bound non-host credential', async () => {
  const db = new DatabaseSync(':memory:');
  createSqliteSeatTables(db);
  const configuration = config('marble', 2, 3);
  const records = materializeLobbySeatRecords(configuration, 1);
  db.prepare(`INSERT INTO seats VALUES ('54', ?, 1, 'host', 1, ?, 2, 1, 1)`).run(records[0].seatId, '1'.repeat(64));
  db.prepare(`INSERT INTO seats VALUES ('54', ?, 1, 'online', 1, ?, 1, 1, 1)`).run(records[1].seatId, '2'.repeat(64));

  await assert.rejects(materializeTursoLobbySeatBindings({
    tx: sqliteSeatTx(db), seatsTable: 'seats', seatConfigurationsTable: 'seat_configurations',
    transaction: { operation: 'configure-lobby', actor: { kind: 'seat', key: records[0].seatId, generation: 2 }, roomId: '54' },
    state: { preferredColor: 'marble', targetPlayers: 2, lobbyGeneration: 1 },
    records, nowMs: 20,
  }), /lobby_configuration_has_bound_seat/);
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM seat_configurations`).get().count, 0);
  db.close();
});
