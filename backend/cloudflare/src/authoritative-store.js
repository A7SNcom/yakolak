import { createClient } from '@tursodatabase/serverless/compat';
import { AUTHORITATIVE_ACTOR_KINDS } from './authoritative-api.js';

export const AUTHORITATIVE_STORE_INTERFACE_VERSION = 1;
export const PROBE_TABLE = 'yakolak_pages005_room_probe_v1';

const REQUIRED_METHODS = Object.freeze([
  'getCapabilities',
  'ensureTable',
  'writeRoom',
  'readRoom',
  'cleanup',
  'authorizeSeat',
  'lookupInvitation',
  'transactAuthority',
  'commitMutation',
]);

function fail(code, safeDetails = null) {
  const error = new Error(code);
  error.code = code;
  if (safeDetails !== null) error.safeDetails = safeDetails;
  throw error;
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function requireStoreShape(store) {
  if (!store || typeof store !== 'object') fail('authoritative_store_invalid');
  for (const method of REQUIRED_METHODS) {
    if (typeof store[method] !== 'function') fail('authoritative_store_invalid', { missingMethod: method });
  }
  return store;
}

export function assertAuthoritativeStore(store) {
  return requireStoreShape(store);
}

function storeCapabilities(mode, {
  authoritativeRead,
  authoritativeMutation,
  invitationLookup,
  transactionalAuthority,
  durableMutationReceipts,
} = {}) {
  return Object.freeze({
    interfaceVersion: AUTHORITATIVE_STORE_INTERFACE_VERSION,
    mode,
    authoritativeRead: authoritativeRead === true,
    authoritativeMutation: authoritativeMutation === true,
    invitationLookup: invitationLookup === true,
    transactionalAuthority: transactionalAuthority === true,
    durableMutationReceipts: durableMutationReceipts === true,
  });
}

export function createTursoAuthoritativeStore(env) {
  if (!env?.TURSO_DATABASE_URL || !env?.TURSO_AUTH_TOKEN) fail('datastore_unavailable');

  const db = createClient({
    url: env.TURSO_DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });
  const capabilities = storeCapabilities('turso-pages005-probe-only', {
    authoritativeRead: false,
    authoritativeMutation: false,
    invitationLookup: false,
    transactionalAuthority: false,
    durableMutationReceipts: false,
  });

  return assertAuthoritativeStore({
    getCapabilities() {
      return capabilities;
    },

    async ensureTable() {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS ${PROBE_TABLE} (
          room_id TEXT PRIMARY KEY,
          payload_json TEXT NOT NULL,
          integrity TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
    },

    async writeRoom({ roomId, payload, integrity, now }) {
      await db.execute({
        sql: `INSERT INTO ${PROBE_TABLE} (room_id, payload_json, integrity, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(room_id) DO UPDATE SET
                payload_json = excluded.payload_json,
                integrity = excluded.integrity,
                updated_at = excluded.updated_at`,
        args: [roomId, JSON.stringify(payload), integrity, now, now],
      });
    },

    async readRoom(roomId) {
      const result = await db.execute({
        sql: `SELECT room_id, payload_json, integrity, created_at, updated_at
              FROM ${PROBE_TABLE} WHERE room_id = ? LIMIT 1`,
        args: [roomId],
      });
      const row = result.rows?.[0];
      if (!row) return null;
      return {
        roomId: String(row.room_id),
        payload: JSON.parse(String(row.payload_json)),
        integrity: String(row.integrity),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      };
    },

    async cleanup(beforeIso) {
      const result = await db.execute({
        sql: `DELETE FROM ${PROBE_TABLE} WHERE updated_at < ?`,
        args: [beforeIso],
      });
      return Number(result.rowsAffected || 0);
    },

    async authorizeSeat() {
      // THREEJS-063 owns the real Turso authoritative schema, credential generations,
      // indexes, CAS and durable receipts. Fail closed rather than creating shadow state.
      fail('authoritative_store_unavailable');
    },

    async lookupInvitation() {
      fail('authoritative_store_unavailable');
    },

    async transactAuthority() {
      fail('authoritative_store_unavailable');
    },

    async commitMutation() {
      fail('authoritative_store_unavailable');
    },
  });
}

function opaque(value, code) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized.length > 256) fail(code);
  return normalized;
}

function normalizeAuthoritativeSeed(seed) {
  if (!seed || typeof seed !== 'object' || Array.isArray(seed)) fail('invalid_authoritative_seed');
  const roomId = opaque(seed.roomId, 'invalid_authoritative_seed');
  const revision = seed.revision;
  if (!Number.isSafeInteger(revision) || revision < 0) fail('invalid_authoritative_seed');
  if (!seed.state || typeof seed.state !== 'object' || Array.isArray(seed.state)) fail('invalid_authoritative_seed');
  if (!Array.isArray(seed.seats) || seed.seats.length === 0) fail('invalid_authoritative_seed');

  const seats = seed.seats.map((seat) => {
    const seatId = opaque(seat?.seatId, 'invalid_authoritative_seed');
    const credentialHash = String(seat?.credentialHash || '').trim().toLowerCase();
    const credentialGeneration = seat?.credentialGeneration;
    if (!/^[a-f0-9]{64}$/.test(credentialHash)) fail('invalid_authoritative_seed');
    if (!Number.isSafeInteger(credentialGeneration) || credentialGeneration < 1) fail('invalid_authoritative_seed');
    return { seatId, credentialHash, credentialGeneration };
  });
  if (new Set(seats.map(seat => seat.seatId)).size !== seats.length) fail('invalid_authoritative_seed');
  if (new Set(seats.map(seat => seat.credentialHash)).size !== seats.length) fail('invalid_authoritative_seed');

  return {
    roomId,
    revision,
    state: clone(seed.state),
    seats,
    receipts: new Map(),
  };
}

function normalizeInvitationSeed(seed) {
  if (!seed || typeof seed !== 'object' || Array.isArray(seed)) fail('invalid_invitation_seed');
  const invitationId = opaque(seed.invitationId, 'invalid_invitation_seed');
  const locator = opaque(seed.locator, 'invalid_invitation_seed');
  const roomId = opaque(seed.roomId, 'invalid_invitation_seed');
  const seatId = opaque(seed.seatId, 'invalid_invitation_seed');
  const lobbyGeneration = seed.lobbyGeneration;
  if (!Number.isSafeInteger(lobbyGeneration) || lobbyGeneration < 0) fail('invalid_invitation_seed');
  return {
    invitationId,
    locator,
    roomId,
    seatId,
    lobbyGeneration,
    state: opaque(seed.state, 'invalid_invitation_seed'),
    data: clone(seed.data ?? null),
  };
}

function publicSnapshot(room) {
  return {
    roomId: room.roomId,
    revision: room.revision,
    state: clone(room.state),
  };
}

function normalizeActor(actor) {
  if (!actor || typeof actor !== 'object' || Array.isArray(actor)) fail('invalid_authority_actor');
  const kind = String(actor.kind || '');
  if (!Object.values(AUTHORITATIVE_ACTOR_KINDS).includes(kind)) fail('invalid_authority_actor');
  const key = opaque(actor.key, 'invalid_authority_actor');
  const generation = actor.generation ?? null;
  if (generation !== null && (!Number.isSafeInteger(generation) || generation < 1)) fail('invalid_authority_actor');
  return { kind, key, generation };
}

function normalizeTransactionInput(input) {
  const roomId = opaque(input?.roomId, 'invalid_authority_transaction');
  const actor = normalizeActor(input?.actor);
  const expectedRevision = input?.expectedRevision;
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) fail('invalid_authority_transaction');
  const idempotencyKey = opaque(input?.idempotencyKey, 'invalid_authority_transaction');
  const fingerprint = String(input?.fingerprint || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) fail('invalid_authority_transaction');
  const operation = opaque(input?.operation, 'invalid_authority_transaction');
  const invitationId = input?.invitationId == null ? null : opaque(input.invitationId, 'invalid_authority_transaction');
  if (typeof input?.transition !== 'function') fail('invalid_store_transition');
  return { roomId, actor, expectedRevision, idempotencyKey, fingerprint, operation, invitationId, transition: input.transition };
}

export function createInMemoryAuthoritativeStore({
  authoritativeRooms = [],
  authoritativeInvitations = [],
} = {}) {
  const probeRooms = new Map();
  const rooms = new Map();
  const invitationsById = new Map();
  const invitationIdByLocator = new Map();

  for (const seed of authoritativeRooms) {
    const room = normalizeAuthoritativeSeed(seed);
    if (rooms.has(room.roomId)) fail('duplicate_authoritative_seed');
    rooms.set(room.roomId, room);
  }
  for (const seed of authoritativeInvitations) {
    const invitation = normalizeInvitationSeed(seed);
    if (invitationsById.has(invitation.invitationId) || invitationIdByLocator.has(invitation.locator)) {
      fail('duplicate_invitation_seed');
    }
    invitationsById.set(invitation.invitationId, invitation);
    invitationIdByLocator.set(invitation.locator, invitation.invitationId);
  }

  const capabilities = storeCapabilities('memory-contract', {
    authoritativeRead: true,
    authoritativeMutation: true,
    invitationLookup: true,
    transactionalAuthority: true,
    durableMutationReceipts: false,
  });

  async function transactAuthority(input) {
    const transaction = normalizeTransactionInput(input);
    const room = rooms.get(transaction.roomId);
    if (!room) fail('room_not_found');

    if (transaction.actor.kind === AUTHORITATIVE_ACTOR_KINDS.SEAT) {
      const seat = room.seats.find(candidate => candidate.seatId === transaction.actor.key);
      if (!seat) fail('seat_credential_rejected');
      if (seat.credentialGeneration !== transaction.actor.generation) fail('seat_credential_generation_stale');
    }

    const receiptKey = transaction.idempotencyKey;
    const prior = room.receipts.get(receiptKey);
    if (prior) {
      if (
        prior.fingerprint !== transaction.fingerprint
        || prior.publicReceipt.operation !== transaction.operation
        || prior.actor.kind !== transaction.actor.kind
        || prior.actor.key !== transaction.actor.key
        || prior.actor.generation !== transaction.actor.generation
      ) fail('idempotency_key_reused');
      return {
        status: 'duplicate',
        receipt: clone(prior.publicReceipt),
        snapshot: publicSnapshot(room),
        invitation: prior.invitationId ? clone(invitationsById.get(prior.invitationId) || null) : null,
      };
    }

    if (room.revision !== transaction.expectedRevision) {
      fail('revision_conflict', { currentRevision: room.revision });
    }

    const currentInvitation = transaction.invitationId
      ? invitationsById.get(transaction.invitationId) || null
      : null;
    if (transaction.invitationId && !currentInvitation) fail('invitation_not_found');

    const result = transaction.transition(Object.freeze({
      state: clone(room.state),
      invitation: clone(currentInvitation),
      revision: room.revision,
    }));
    if (!result || typeof result !== 'object' || Array.isArray(result)) fail('invalid_next_state');
    if (!result.state || typeof result.state !== 'object' || Array.isArray(result.state)) fail('invalid_next_state');

    if (transaction.invitationId && Object.hasOwn(result, 'invitation')) {
      const nextInvitation = clone(result.invitation);
      if (!nextInvitation || nextInvitation.invitationId !== transaction.invitationId) fail('invalid_next_invitation');
      invitationsById.set(transaction.invitationId, nextInvitation);
    }

    room.state = clone(result.state);
    room.revision += 1;
    const publicReceipt = {
      idempotencyKey: transaction.idempotencyKey,
      operation: transaction.operation,
      revision: room.revision,
    };
    room.receipts.set(receiptKey, {
      fingerprint: transaction.fingerprint,
      actor: clone(transaction.actor),
      invitationId: transaction.invitationId,
      publicReceipt: clone(publicReceipt),
    });
    return {
      status: 'committed',
      receipt: publicReceipt,
      snapshot: publicSnapshot(room),
      invitation: transaction.invitationId ? clone(invitationsById.get(transaction.invitationId)) : null,
    };
  }

  const store = {
    getCapabilities() {
      return capabilities;
    },

    async ensureTable() {},

    async writeRoom({ roomId, payload, integrity, now }) {
      const previous = probeRooms.get(roomId);
      probeRooms.set(roomId, {
        roomId,
        payload: clone(payload),
        integrity,
        createdAt: previous?.createdAt || now,
        updatedAt: now,
      });
    },

    async readRoom(roomId) {
      return clone(probeRooms.get(roomId) || null);
    },

    async cleanup(beforeIso) {
      let deleted = 0;
      for (const [roomId, room] of probeRooms) {
        if (room.updatedAt < beforeIso) {
          probeRooms.delete(roomId);
          deleted += 1;
        }
      }
      return deleted;
    },

    async authorizeSeat({ roomId, credentialHash }) {
      const room = rooms.get(roomId);
      if (!room) fail('room_not_found');
      const seat = room.seats.find(candidate => candidate.credentialHash === credentialHash);
      if (!seat) fail('seat_credential_rejected');
      return {
        roomId,
        seatId: seat.seatId,
        credentialGeneration: seat.credentialGeneration,
        snapshot: publicSnapshot(room),
      };
    },

    async lookupInvitation({ locator }) {
      const invitationId = invitationIdByLocator.get(String(locator || '').trim());
      return invitationId ? clone(invitationsById.get(invitationId)) : null;
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
  };

  return assertAuthoritativeStore(store);
}
