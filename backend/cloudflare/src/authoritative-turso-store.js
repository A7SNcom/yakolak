import { AUTHORITATIVE_ACTOR_KINDS } from './authoritative-api.js';
import {
  AUTHORITY_SCHEMA_STATEMENTS,
  AUTHORITY_TABLES,
  PROBE_TABLE,
  authorityMigrationStatement,
} from './authoritative-schema.js';
import {
  assertAuthoritativeStore,
  cloneAuthority,
  failAuthority,
  normalizeAuthorityTransaction,
  publicAuthoritySnapshot,
  storeCapabilities,
  validateNextInvitation,
} from './authoritative-store-contract.js';
import { materializeTursoLobbySeatBindings } from './authoritative-turso-seat-materialization.js';

const T = AUTHORITY_TABLES;
const DEFAULT_BUSY_RETRIES = 4;
const RECEIPT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function parseJson(value, code) {
  try {
    return JSON.parse(String(value));
  } catch {
    failAuthority(code);
  }
}

function changes(result) {
  return Number(result?.changes ?? result?.rowsAffected ?? 0);
}

function isBusyError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code.startsWith('SQLITE_BUSY') || /SQLITE_BUSY|database is locked/i.test(message);
}

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function transactionWithMode(db, callback, mode, {
  busyRetries = DEFAULT_BUSY_RETRIES,
  sleepFn = sleep,
} = {}) {
  if (typeof db?.transactionAsync !== 'function') failAuthority('authoritative_transaction_api_unavailable');
  for (let attempt = 0; ; attempt += 1) {
    try {
      const transaction = db.transactionAsync(callback);
      if (typeof transaction?.[mode] !== 'function') failAuthority('authoritative_transaction_api_unavailable');
      return await transaction[mode]();
    } catch (error) {
      if (!isBusyError(error) || attempt >= busyRetries) throw error;
      await sleepFn(Math.min(4 * (2 ** attempt), 32));
    }
  }
}

async function immediateTransaction(db, callback, options = {}) {
  return transactionWithMode(db, callback, 'immediate', options);
}

async function deferredTransaction(db, callback, options = {}) {
  return transactionWithMode(db, callback, 'deferred', options);
}

async function run(executor, sql, args = []) {
  return executor.run(sql, ...args);
}

async function get(executor, sql, args = []) {
  return executor.get(sql, ...args);
}

function rowToLobby(row) {
  if (!row) return null;
  const revision = Number(row.revision);
  if (!Number.isSafeInteger(revision) || revision < 0) failAuthority('authoritative_state_corrupt');
  const state = parseJson(row.state_json, 'authoritative_state_corrupt');
  if (!state || typeof state !== 'object' || Array.isArray(state)) failAuthority('authoritative_state_corrupt');
  return { roomId: String(row.room_id), revision, state };
}

function rowToInvitation(row) {
  if (!row) return null;
  return {
    invitationId: String(row.invitation_id),
    locator: String(row.locator),
    roomId: String(row.room_id),
    seatId: String(row.seat_id),
    lobbyGeneration: Number(row.lobby_generation),
    state: String(row.state),
    data: row.data_json == null ? null : parseJson(row.data_json, 'authoritative_invitation_corrupt'),
  };
}

function rowToReceipt(row) {
  if (!row) return null;
  return {
    fingerprint: String(row.fingerprint),
    operation: String(row.operation),
    actor: {
      kind: String(row.actor_kind),
      key: String(row.actor_key),
      generation: row.actor_generation == null ? null : Number(row.actor_generation),
    },
    publicReceipt: {
      idempotencyKey: String(row.idempotency_key),
      operation: String(row.operation),
      revision: Number(row.committed_revision),
    },
    snapshot: parseJson(row.snapshot_json, 'authoritative_receipt_corrupt'),
    invitation: row.invitation_json == null
      ? null
      : parseJson(row.invitation_json, 'authoritative_receipt_corrupt'),
  };
}

function assertDuplicateIdentity(prior, transaction) {
  if (
    prior.fingerprint !== transaction.fingerprint
    || prior.operation !== transaction.operation
    || prior.actor.kind !== transaction.actor.kind
    || prior.actor.key !== transaction.actor.key
    || prior.actor.generation !== transaction.actor.generation
  ) failAuthority('idempotency_key_reused');
}

function validateNextState(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) failAuthority('invalid_next_state');
  if (!result.state || typeof result.state !== 'object' || Array.isArray(result.state)) failAuthority('invalid_next_state');
  return result;
}

export function createTursoAuthoritativeStoreFromConnection(db, {
  nowMs = () => Date.now(),
  busyRetries = DEFAULT_BUSY_RETRIES,
  sleepFn = sleep,
} = {}) {
  if (!db || typeof db !== 'object') failAuthority('datastore_unavailable');

  const capabilities = storeCapabilities('turso-authoritative-v1', {
    authoritativeRead: true,
    authoritativeMutation: true,
    invitationLookup: true,
    transactionalAuthority: true,
    durableMutationReceipts: true,
  });

  const withImmediate = (callback) => immediateTransaction(db, callback, { busyRetries, sleepFn });
  const withDeferred = (callback) => deferredTransaction(db, callback, { busyRetries, sleepFn });

  async function transactAuthority(input) {
    const transaction = normalizeAuthorityTransaction(input);

    return withImmediate(async (tx) => {
      const priorRow = await get(tx, `SELECT
        room_id, idempotency_key, operation, actor_kind, actor_key, actor_generation,
        fingerprint, committed_revision, snapshot_json, invitation_json
        FROM ${T.receipts}
        WHERE room_id = ? AND idempotency_key = ? LIMIT 1`,
      [transaction.roomId, transaction.idempotencyKey]);
      if (priorRow) {
        const prior = rowToReceipt(priorRow);
        assertDuplicateIdentity(prior, transaction);
        return {
          status: 'duplicate',
          receipt: cloneAuthority(prior.publicReceipt),
          snapshot: cloneAuthority(prior.snapshot),
          invitation: cloneAuthority(prior.invitation),
        };
      }

      const lobbyRow = await get(tx, `SELECT room_id, revision, state_json
        FROM ${T.lobbies}
        WHERE room_id = ? AND tombstoned_at_ms IS NULL
          AND (expires_at_ms IS NULL OR expires_at_ms > ?)
        LIMIT 1`, [transaction.roomId, nowMs()]);
      const room = rowToLobby(lobbyRow);
      if (!room) failAuthority('room_not_found');

      if (transaction.actor.kind === AUTHORITATIVE_ACTOR_KINDS.SEAT) {
        const seat = await get(tx, `SELECT seat_id, credential_generation
          FROM ${T.seats} WHERE room_id = ? AND seat_id = ? LIMIT 1`,
        [transaction.roomId, transaction.actor.key]);
        if (!seat) failAuthority('seat_credential_rejected');
        if (Number(seat.credential_generation) !== transaction.actor.generation) {
          failAuthority('seat_credential_generation_stale');
        }
      }

      if (room.revision !== transaction.expectedRevision) {
        failAuthority('revision_conflict', { currentRevision: room.revision });
      }

      let currentInvitation = null;
      if (transaction.invitationId) {
        const invitationRow = await get(tx, `SELECT invitation_id, locator, room_id, seat_id,
          lobby_generation, state, data_json
          FROM ${T.invitations} WHERE invitation_id = ? LIMIT 1`, [transaction.invitationId]);
        currentInvitation = rowToInvitation(invitationRow);
        if (!currentInvitation) failAuthority('invitation_not_found');
        if (currentInvitation.roomId !== transaction.roomId) failAuthority('invitation_scope_mismatch');
      }

      const result = validateNextState(await transaction.transition(Object.freeze({
        state: cloneAuthority(room.state),
        invitation: cloneAuthority(currentInvitation),
        revision: room.revision,
      })));

      if (Object.hasOwn(result, 'seatRecords')) {
        await materializeTursoLobbySeatBindings({
          tx,
          seatsTable: T.seats,
          seatConfigurationsTable: T.seatConfigurations,
          transaction,
          state: result.state,
          records: result.seatRecords,
          nowMs: nowMs(),
        });
      }

      let nextInvitation = currentInvitation;
      if (transaction.invitationId && Object.hasOwn(result, 'invitation')) {
        nextInvitation = validateNextInvitation(currentInvitation, result.invitation, transaction.invitationId);
        const invitationUpdate = await run(tx, `UPDATE ${T.invitations}
          SET state = ?, data_json = ?, updated_at_ms = ?
          WHERE invitation_id = ? AND room_id = ?`, [
          nextInvitation.state,
          nextInvitation.data == null ? null : JSON.stringify(nextInvitation.data),
          nowMs(),
          transaction.invitationId,
          transaction.roomId,
        ]);
        if (changes(invitationUpdate) !== 1) failAuthority('invitation_not_found');
      }

      const nextRevision = room.revision + 1;
      const lobbyUpdate = await run(tx, `UPDATE ${T.lobbies}
        SET state_json = ?, revision = ?, updated_at_ms = ?
        WHERE room_id = ? AND revision = ? AND tombstoned_at_ms IS NULL`, [
        JSON.stringify(result.state),
        nextRevision,
        nowMs(),
        transaction.roomId,
        room.revision,
      ]);
      if (changes(lobbyUpdate) !== 1) failAuthority('revision_conflict', { currentRevision: room.revision });

      const snapshot = publicAuthoritySnapshot({
        roomId: transaction.roomId,
        revision: nextRevision,
        state: result.state,
      });
      const publicReceipt = {
        idempotencyKey: transaction.idempotencyKey,
        operation: transaction.operation,
        revision: nextRevision,
      };
      const committedAt = nowMs();
      try {
        await run(tx, `INSERT INTO ${T.receipts} (
          room_id, idempotency_key, schema_version, operation,
          actor_kind, actor_key, actor_generation, fingerprint,
          committed_revision, invitation_id, snapshot_json, invitation_json,
          committed_at_ms, expires_at_ms
        ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
          transaction.roomId,
          transaction.idempotencyKey,
          transaction.operation,
          transaction.actor.kind,
          transaction.actor.key,
          transaction.actor.generation,
          transaction.fingerprint,
          nextRevision,
          transaction.invitationId,
          JSON.stringify(snapshot),
          nextInvitation == null ? null : JSON.stringify(nextInvitation),
          committedAt,
          committedAt + RECEIPT_RETENTION_MS,
        ]);
      } catch (error) {
        if (/UNIQUE|PRIMARY KEY|constraint/i.test(String(error?.message || ''))) {
          failAuthority('idempotency_key_reused');
        }
        throw error;
      }

      return {
        status: 'committed',
        receipt: publicReceipt,
        snapshot,
        invitation: cloneAuthority(nextInvitation),
      };
    });
  }

  return assertAuthoritativeStore({
    getCapabilities() {
      return capabilities;
    },

    async ensureTable() {
      const statements = [...AUTHORITY_SCHEMA_STATEMENTS, authorityMigrationStatement(nowMs())];
      await db.batch(statements, 'immediate');
    },

    async writeRoom({ roomId, payload, integrity, now }) {
      await run(db, `INSERT INTO ${PROBE_TABLE} (room_id, payload_json, integrity, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(room_id) DO UPDATE SET
          payload_json = excluded.payload_json,
          integrity = excluded.integrity,
          updated_at = excluded.updated_at`,
      [roomId, JSON.stringify(payload), integrity, now, now]);
    },

    async readRoom(roomId) {
      const row = await get(db, `SELECT room_id, payload_json, integrity, created_at, updated_at
        FROM ${PROBE_TABLE} WHERE room_id = ? LIMIT 1`, [roomId]);
      if (!row) return null;
      return {
        roomId: String(row.room_id),
        payload: parseJson(row.payload_json, 'probe_payload_corrupt'),
        integrity: String(row.integrity),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      };
    },

    async cleanup(beforeIso) {
      const cutoffMs = Date.parse(String(beforeIso));
      if (!Number.isFinite(cutoffMs)) failAuthority('invalid_cleanup_cutoff');
      return withImmediate(async (tx) => {
        let deleted = 0;
        deleted += changes(await run(tx, `DELETE FROM ${PROBE_TABLE} WHERE updated_at < ?`, [beforeIso]));
        const tombstoned = `room_id IN (
          SELECT room_id FROM ${T.lobbies}
          WHERE tombstoned_at_ms IS NOT NULL AND expires_at_ms IS NOT NULL AND expires_at_ms < ?
        )`;
        for (const table of [
          T.receipts,
          T.votes,
          T.readiness,
          T.deadlines,
          T.invitations,
          T.seatConfigurations,
          T.seats,
        ]) {
          deleted += changes(await run(tx, `DELETE FROM ${table} WHERE ${tombstoned}`, [cutoffMs]));
        }
        deleted += changes(await run(tx, `DELETE FROM ${T.lobbies}
          WHERE tombstoned_at_ms IS NOT NULL AND expires_at_ms IS NOT NULL AND expires_at_ms < ?`, [cutoffMs]));
        return deleted;
      });
    },

    async authorizeSeat({ roomId, credentialHash }) {
      return withDeferred(async (tx) => {
        const roomRow = await get(tx, `SELECT room_id, revision, state_json FROM ${T.lobbies}
          WHERE room_id = ? AND tombstoned_at_ms IS NULL
            AND (expires_at_ms IS NULL OR expires_at_ms > ?) LIMIT 1`, [roomId, nowMs()]);
        const room = rowToLobby(roomRow);
        if (!room) failAuthority('room_not_found');
        const seat = await get(tx, `SELECT seat_id, credential_generation FROM ${T.seats}
          WHERE room_id = ? AND credential_hash = ? LIMIT 1`, [roomId, credentialHash]);
        if (!seat) failAuthority('seat_credential_rejected');
        return {
          roomId,
          seatId: String(seat.seat_id),
          credentialGeneration: Number(seat.credential_generation),
          snapshot: publicAuthoritySnapshot(room),
        };
      });
    },

    async lookupInvitation({ locator }) {
      const rows = await db.all(`SELECT invitation_id, locator, room_id, seat_id,
        lobby_generation, state, data_json
        FROM ${T.invitations} WHERE locator = ? ORDER BY created_at_ms DESC, invitation_id DESC LIMIT 2`,
      String(locator || '').trim());
      if (rows.length > 1) failAuthority('invitation_locator_ambiguous');
      return rowToInvitation(rows[0]);
    },

    transactAuthority,

    async commitMutation({
      roomId,
      actorSeatId,
      credentialGeneration,
      expectedRevision,
      mutationId,
      fingerprint,
      action,
      transition,
    }) {
      const result = await transactAuthority({
        roomId,
        actor: { kind: AUTHORITATIVE_ACTOR_KINDS.SEAT, key: actorSeatId, generation: credentialGeneration },
        expectedRevision,
        idempotencyKey: mutationId,
        fingerprint,
        operation: action,
        transition: ({ state }) => ({ state: transition(state) }),
      });
      return {
        status: result.status,
        receipt: {
          mutationId: result.receipt.idempotencyKey,
          action: result.receipt.operation,
          actorSeatId,
          revision: result.receipt.revision,
        },
        snapshot: result.snapshot,
      };
    },
  });
}

export const __testing = Object.freeze({
  isBusyError,
  immediateTransaction,
  deferredTransaction,
  RECEIPT_RETENTION_MS,
});
