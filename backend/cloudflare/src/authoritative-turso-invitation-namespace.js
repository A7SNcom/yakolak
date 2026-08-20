import {
  AUTHORITATIVE_ACTOR_KINDS,
  AUTHORITATIVE_INVITATION_STATES,
  AUTHORITATIVE_OPERATION_NAMES,
} from './authoritative-api.js';
import {
  MANUAL_INVITE_TTL_MS,
  allManualInviteCodes,
  chooseUnbiasedManualInviteCode,
  normalizeManualInviteCode,
  resolveInvitationSeatContract,
} from './authoritative-invitation-namespace.js';
import {
  cloneAuthority,
  failAuthority,
  normalizeAuthorityTransaction,
  opaqueAuthority,
  publicAuthoritySnapshot,
} from './authoritative-store-contract.js';

function parseJson(value, code) {
  try {
    return JSON.parse(String(value));
  } catch {
    failAuthority(code);
  }
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
  const data = row.data_json == null ? null : parseJson(row.data_json, 'authoritative_invitation_corrupt');
  return {
    invitationId: String(row.invitation_id),
    locator: String(row.locator),
    roomId: String(row.room_id),
    seatId: String(row.seat_id),
    color: String(data?.color || ''),
    lobbyGeneration: Number(row.lobby_generation),
    state: String(row.state),
    expiresAtMs: Number(row.expires_at_ms),
    data,
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
    invitation: row.invitation_json == null ? null : parseJson(row.invitation_json, 'authoritative_receipt_corrupt'),
  };
}

function normalizedNamespaceTransaction(input, operation, invitationId = null) {
  return normalizeAuthorityTransaction({
    roomId: input?.roomId,
    actor: {
      kind: AUTHORITATIVE_ACTOR_KINDS.SEAT,
      key: input?.actorSeatId,
      generation: input?.credentialGeneration,
    },
    expectedRevision: input?.expectedRevision,
    idempotencyKey: input?.mutationId,
    fingerprint: input?.fingerprint,
    operation,
    invitationId,
    transition: () => ({ state: {} }),
  });
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

async function readPriorReceipt(tx, tables, transaction) {
  const row = await tx.get(`SELECT
    idempotency_key, operation, actor_kind, actor_key, actor_generation,
    fingerprint, committed_revision, snapshot_json, invitation_json
    FROM ${tables.receipts}
    WHERE room_id = ? AND idempotency_key = ? LIMIT 1`,
  transaction.roomId, transaction.idempotencyKey);
  if (!row) return null;
  const prior = rowToReceipt(row);
  assertDuplicateIdentity(prior, transaction);
  return {
    status: 'duplicate',
    receipt: cloneAuthority(prior.publicReceipt),
    snapshot: cloneAuthority(prior.snapshot),
    invitation: cloneAuthority(prior.invitation),
  };
}

async function readAuthorizedRoom(tx, tables, transaction, atMs) {
  const lobbyRow = await tx.get(`SELECT room_id, revision, state_json
    FROM ${tables.lobbies}
    WHERE room_id = ? AND tombstoned_at_ms IS NULL
      AND (expires_at_ms IS NULL OR expires_at_ms > ?)
    LIMIT 1`, transaction.roomId, atMs);
  const room = rowToLobby(lobbyRow);
  if (!room) failAuthority('room_not_found');
  const seat = await tx.get(`SELECT seat_id, credential_generation
    FROM ${tables.seats} WHERE room_id = ? AND seat_id = ? LIMIT 1`,
  transaction.roomId, transaction.actor.key);
  if (!seat) failAuthority('seat_credential_rejected');
  if (Number(seat.credential_generation) !== transaction.actor.generation) {
    failAuthority('seat_credential_generation_stale');
  }
  if (room.revision !== transaction.expectedRevision) {
    failAuthority('revision_conflict', { currentRevision: room.revision });
  }
  return room;
}

async function expireOpenInvitations(tx, tables, atMs) {
  await tx.run(`UPDATE ${tables.invitations}
    SET state = 'expired', updated_at_ms = ?
    WHERE state = 'open' AND expires_at_ms IS NOT NULL AND expires_at_ms <= ?`, atMs, atMs);
}

async function commitNamespaceMutation({
  tx,
  tables,
  transaction,
  room,
  invitation,
  now,
  receiptRetentionMs,
}) {
  const nextRevision = room.revision + 1;
  const lobbyUpdate = await tx.run(`UPDATE ${tables.lobbies}
    SET revision = ?, updated_at_ms = ?
    WHERE room_id = ? AND revision = ? AND tombstoned_at_ms IS NULL`,
  nextRevision, now, transaction.roomId, room.revision);
  const changed = Number(lobbyUpdate?.changes ?? lobbyUpdate?.rowsAffected ?? 0);
  if (changed !== 1) failAuthority('revision_conflict', { currentRevision: room.revision });

  const snapshot = publicAuthoritySnapshot({ roomId: room.roomId, revision: nextRevision, state: room.state });
  const receipt = {
    idempotencyKey: transaction.idempotencyKey,
    operation: transaction.operation,
    revision: nextRevision,
  };
  try {
    await tx.run(`INSERT INTO ${tables.receipts} (
      room_id, idempotency_key, schema_version, operation,
      actor_kind, actor_key, actor_generation, fingerprint,
      committed_revision, invitation_id, snapshot_json, invitation_json,
      committed_at_ms, expires_at_ms
    ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    transaction.roomId,
    transaction.idempotencyKey,
    transaction.operation,
    transaction.actor.kind,
    transaction.actor.key,
    transaction.actor.generation,
    transaction.fingerprint,
    nextRevision,
    invitation?.invitationId ?? transaction.invitationId,
    JSON.stringify(snapshot),
    invitation == null ? null : JSON.stringify(invitation),
    now,
    now + receiptRetentionMs);
  } catch (error) {
    if (/UNIQUE|PRIMARY KEY|constraint/i.test(String(error?.message || ''))) failAuthority('idempotency_key_reused');
    throw error;
  }
  return { status: 'committed', receipt, snapshot, invitation: cloneAuthority(invitation) };
}

export function createTursoInvitationNamespace({
  db,
  tables,
  withImmediate,
  nowMs,
  randomUint32,
  receiptRetentionMs,
}) {
  if (!db || !tables || typeof withImmediate !== 'function') failAuthority('datastore_unavailable');

  async function lookupInvitation({ locator }) {
    const normalized = normalizeManualInviteCode(locator);
    const rows = await db.all(`SELECT invitation_id, locator, room_id, seat_id,
      lobby_generation, state, data_json, expires_at_ms
      FROM ${tables.invitations}
      WHERE locator = ? AND state = 'open' AND expires_at_ms > ?
      ORDER BY created_at_ms DESC, invitation_id DESC LIMIT 2`, normalized, nowMs());
    if (rows.length > 1) failAuthority('invitation_locator_ambiguous');
    return rowToInvitation(rows[0]);
  }

  async function allocateInvitation(input) {
    const transaction = normalizedNamespaceTransaction(input, AUTHORITATIVE_OPERATION_NAMES.ALLOCATE_INVITATION);
    const invitationId = opaqueAuthority(input?.invitationId, 'invalid_invitation_id');
    const seatId = opaqueAuthority(input?.seatId, 'invalid_mutation_payload');

    return withImmediate(async (tx) => {
      const prior = await readPriorReceipt(tx, tables, transaction);
      if (prior) return prior;
      const now = nowMs();
      const room = await readAuthorizedRoom(tx, tables, transaction, now);
      const seatContract = resolveInvitationSeatContract(room.state, transaction.actor.key, seatId);
      await expireOpenInvitations(tx, tables, now);

      const existing = await tx.get(`SELECT invitation_id, state
        FROM ${tables.invitations}
        WHERE room_id = ? AND lobby_generation = ? AND seat_id = ?
          AND state IN ('open','claimed')
        ORDER BY created_at_ms DESC LIMIT 1`,
      transaction.roomId, seatContract.lobbyGeneration, seatContract.seatId);
      if (existing?.state === AUTHORITATIVE_INVITATION_STATES.OPEN) failAuthority('invitation_already_open');
      if (existing?.state === AUTHORITATIVE_INVITATION_STATES.CLAIMED) failAuthority('invitation_already_claimed');

      const usedRows = await tx.all(`SELECT locator FROM ${tables.invitations} WHERE state = 'open' ORDER BY locator`);
      const used = new Set(usedRows.map(row => normalizeManualInviteCode(row.locator)));
      const free = allManualInviteCodes().filter(locator => !used.has(locator));
      const locator = chooseUnbiasedManualInviteCode(free, randomUint32);
      const expiresAtMs = now + MANUAL_INVITE_TTL_MS;
      const invitation = {
        invitationId,
        locator,
        roomId: transaction.roomId,
        seatId: seatContract.seatId,
        color: seatContract.color,
        lobbyGeneration: seatContract.lobbyGeneration,
        state: AUTHORITATIVE_INVITATION_STATES.OPEN,
        expiresAtMs,
        data: { color: seatContract.color, allocatedRevision: room.revision + 1 },
      };

      await tx.run(`INSERT INTO ${tables.invitations} (
        invitation_id, schema_version, locator, room_id, seat_id, lobby_generation, state,
        claim_verifier_hash, claim_generation, data_json, created_at_ms, updated_at_ms, expires_at_ms
      ) VALUES (?, 1, ?, ?, ?, ?, 'open', NULL, 0, ?, ?, ?, ?)`,
      invitationId, locator, transaction.roomId, seatContract.seatId, seatContract.lobbyGeneration,
      JSON.stringify(invitation.data), now, now, expiresAtMs);

      return commitNamespaceMutation({
        tx, tables, transaction, room, invitation, now, receiptRetentionMs,
      });
    });
  }

  async function revokeInvitation(input) {
    const invitationId = opaqueAuthority(input?.invitationId, 'invalid_invitation_id');
    const transaction = normalizedNamespaceTransaction(input, AUTHORITATIVE_OPERATION_NAMES.REVOKE_INVITATION, invitationId);
    return withImmediate(async (tx) => {
      const prior = await readPriorReceipt(tx, tables, transaction);
      if (prior) return prior;
      const now = nowMs();
      const room = await readAuthorizedRoom(tx, tables, transaction, now);
      await expireOpenInvitations(tx, tables, now);
      const row = await tx.get(`SELECT invitation_id, locator, room_id, seat_id,
        lobby_generation, state, data_json, expires_at_ms
        FROM ${tables.invitations} WHERE invitation_id = ? LIMIT 1`, invitationId);
      const invitation = rowToInvitation(row);
      if (!invitation || invitation.roomId !== transaction.roomId) failAuthority('invitation_not_found');
      resolveInvitationSeatContract(room.state, transaction.actor.key, invitation.seatId);
      if (invitation.state !== AUTHORITATIVE_INVITATION_STATES.OPEN) failAuthority('invitation_not_open');
      const update = await tx.run(`UPDATE ${tables.invitations}
        SET state = 'revoked', updated_at_ms = ?
        WHERE invitation_id = ? AND room_id = ? AND state = 'open'`, now, invitationId, transaction.roomId);
      const changed = Number(update?.changes ?? update?.rowsAffected ?? 0);
      if (changed !== 1) failAuthority('invitation_not_open');
      invitation.state = AUTHORITATIVE_INVITATION_STATES.REVOKED;
      return commitNamespaceMutation({
        tx, tables, transaction, room, invitation, now, receiptRetentionMs,
      });
    });
  }

  return Object.freeze({ lookupInvitation, allocateInvitation, revokeInvitation });
}
