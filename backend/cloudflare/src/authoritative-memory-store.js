import { AUTHORITATIVE_ACTOR_KINDS, AUTHORITATIVE_OPERATION_NAMES } from './authoritative-api.js';
import { validateMaterializedLobbySeatRecords } from './authoritative-lobby-config.js';
import {
  INVITE_CODE_CAPACITY,
  MANUAL_INVITATION_CODE_PATTERN,
  MANUAL_INVITATION_TTL_MS,
  normalizeInvitationAllocation,
  secureRandomUint32,
  shuffledManualInvitationLocators,
} from './authoritative-invitation-allocation.js';
import {
  assertAuthoritativeStore,
  cloneAuthority,
  failAuthority,
  normalizeAuthorityTransaction,
  opaqueAuthority,
  publicAuthoritySnapshot,
  storeCapabilities,
  validateNextInvitation,
} from './authoritative-store-contract.js';

function normalizeAuthoritativeSeed(seed) {
  if (!seed || typeof seed !== 'object' || Array.isArray(seed)) failAuthority('invalid_authoritative_seed');
  const roomId = opaqueAuthority(seed.roomId, 'invalid_authoritative_seed');
  const revision = seed.revision;
  if (!Number.isSafeInteger(revision) || revision < 0) failAuthority('invalid_authoritative_seed');
  if (!seed.state || typeof seed.state !== 'object' || Array.isArray(seed.state)) failAuthority('invalid_authoritative_seed');
  if (!Array.isArray(seed.seats) || seed.seats.length === 0) failAuthority('invalid_authoritative_seed');

  const seats = seed.seats.map((seat) => {
    const seatId = opaqueAuthority(seat?.seatId, 'invalid_authoritative_seed');
    const credentialHash = String(seat?.credentialHash || '').trim().toLowerCase();
    const credentialGeneration = seat?.credentialGeneration;
    if (!/^[a-f0-9]{64}$/.test(credentialHash)) failAuthority('invalid_authoritative_seed');
    if (!Number.isSafeInteger(credentialGeneration) || credentialGeneration < 1) failAuthority('invalid_authoritative_seed');
    return { ...cloneAuthority(seat), seatId, credentialHash, credentialGeneration };
  });
  if (new Set(seats.map(seat => seat.seatId)).size !== seats.length) failAuthority('invalid_authoritative_seed');
  if (new Set(seats.map(seat => seat.credentialHash)).size !== seats.length) failAuthority('invalid_authoritative_seed');

  return {
    roomId,
    revision,
    state: cloneAuthority(seed.state),
    seats,
    receipts: new Map(),
  };
}

function normalizeInvitationSeed(seed) {
  if (!seed || typeof seed !== 'object' || Array.isArray(seed)) failAuthority('invalid_invitation_seed');
  const invitationId = opaqueAuthority(seed.invitationId, 'invalid_invitation_seed');
  const locator = opaqueAuthority(seed.locator, 'invalid_invitation_seed');
  const roomId = opaqueAuthority(seed.roomId, 'invalid_invitation_seed');
  const seatId = opaqueAuthority(seed.seatId, 'invalid_invitation_seed');
  const lobbyGeneration = seed.lobbyGeneration;
  if (!Number.isSafeInteger(lobbyGeneration) || lobbyGeneration < 0) failAuthority('invalid_invitation_seed');
  const expiresAtMs = seed.expiresAtMs ?? null;
  if (expiresAtMs !== null && (!Number.isSafeInteger(expiresAtMs) || expiresAtMs < 0)) failAuthority('invalid_invitation_seed');
  return {
    invitationId,
    locator,
    roomId,
    seatId,
    lobbyGeneration,
    state: opaqueAuthority(seed.state, 'invalid_invitation_seed'),
    data: cloneAuthority(seed.data ?? null),
    expiresAtMs,
  };
}

function materializeSeatBindings(room, transaction, state, records) {
  if (transaction.operation !== AUTHORITATIVE_OPERATION_NAMES.CONFIGURE_LOBBY) {
    failAuthority('unexpected_seat_materialization');
  }
  if (transaction.actor.kind !== AUTHORITATIVE_ACTOR_KINDS.SEAT) failAuthority('host_only_lobby_configuration');
  validateMaterializedLobbySeatRecords(records, state);
  if (records[0].seatId !== transaction.actor.key) failAuthority('host_only_lobby_configuration');

  const currentHost = room.seats.find(seat => seat.seatId === transaction.actor.key);
  if (!currentHost?.credentialHash) failAuthority('seat_credential_rejected');
  for (const seat of room.seats) {
    if (seat.seatId !== transaction.actor.key && seat.credentialHash) {
      failAuthority('lobby_configuration_has_bound_seat');
    }
  }

  room.seats = records.map(record => record.type === 'host'
    ? {
        ...cloneAuthority(record),
        credentialHash: currentHost.credentialHash,
        credentialGeneration: currentHost.credentialGeneration,
      }
    : {
        ...cloneAuthority(record),
        credentialHash: null,
        credentialGeneration: 0,
      });
}

function activeSeatKey(invitation) {
  return `${invitation.roomId}:${invitation.lobbyGeneration}:${invitation.seatId}`;
}

export function createInMemoryAuthoritativeStore({
  authoritativeRooms = [],
  authoritativeInvitations = [],
  nowMs = () => Date.now(),
  randomUint32 = secureRandomUint32,
} = {}) {
  const probeRooms = new Map();
  const rooms = new Map();
  const invitationsById = new Map();
  const activeInvitationIdByLocator = new Map();
  const activeInvitationIdBySeat = new Map();

  function releaseManualLocator(invitation) {
    if (!invitation) return;
    if (activeInvitationIdByLocator.get(invitation.locator) === invitation.invitationId) {
      activeInvitationIdByLocator.delete(invitation.locator);
    }
    const seatKey = activeSeatKey(invitation);
    if (activeInvitationIdBySeat.get(seatKey) === invitation.invitationId) {
      activeInvitationIdBySeat.delete(seatKey);
    }
  }

  function expireInvitationIfNeeded(invitation, now) {
    if (!invitation || invitation.state !== 'open') return invitation;
    if (invitation.expiresAtMs !== null && invitation.expiresAtMs <= now) {
      invitation.state = 'expired';
      releaseManualLocator(invitation);
    }
    return invitation;
  }

  for (const seed of authoritativeRooms) {
    const room = normalizeAuthoritativeSeed(seed);
    if (rooms.has(room.roomId)) failAuthority('duplicate_authoritative_seed');
    rooms.set(room.roomId, room);
  }
  for (const seed of authoritativeInvitations) {
    const invitation = normalizeInvitationSeed(seed);
    if (invitationsById.has(invitation.invitationId)) failAuthority('duplicate_invitation_seed');
    invitationsById.set(invitation.invitationId, invitation);
    if (invitation.state === 'open' && MANUAL_INVITATION_CODE_PATTERN.test(invitation.locator)) {
      if (activeInvitationIdByLocator.has(invitation.locator) || activeInvitationIdBySeat.has(activeSeatKey(invitation))) {
        failAuthority('duplicate_invitation_seed');
      }
      activeInvitationIdByLocator.set(invitation.locator, invitation.invitationId);
      activeInvitationIdBySeat.set(activeSeatKey(invitation), invitation.invitationId);
    }
  }

  const capabilities = storeCapabilities('memory-contract', {
    authoritativeRead: true,
    authoritativeMutation: true,
    invitationLookup: true,
    transactionalAuthority: true,
    durableMutationReceipts: false,
  });

  async function transactAuthority(input) {
    const transaction = normalizeAuthorityTransaction(input);
    const room = rooms.get(transaction.roomId);
    if (!room) failAuthority('room_not_found');

    if (transaction.actor.kind === AUTHORITATIVE_ACTOR_KINDS.SEAT) {
      const seat = room.seats.find(candidate => candidate.seatId === transaction.actor.key);
      if (!seat) failAuthority('seat_credential_rejected');
      if (seat.credentialGeneration !== transaction.actor.generation) failAuthority('seat_credential_generation_stale');
    }

    const prior = room.receipts.get(transaction.idempotencyKey);
    if (prior) {
      if (
        prior.fingerprint !== transaction.fingerprint
        || prior.publicReceipt.operation !== transaction.operation
        || prior.actor.kind !== transaction.actor.kind
        || prior.actor.key !== transaction.actor.key
        || prior.actor.generation !== transaction.actor.generation
      ) failAuthority('idempotency_key_reused');
      return {
        status: 'duplicate',
        receipt: cloneAuthority(prior.publicReceipt),
        snapshot: cloneAuthority(prior.snapshot),
        invitation: cloneAuthority(prior.invitation),
      };
    }

    if (room.revision !== transaction.expectedRevision) {
      failAuthority('revision_conflict', { currentRevision: room.revision });
    }

    const currentInvitation = transaction.invitationId
      ? invitationsById.get(transaction.invitationId) || null
      : null;
    if (transaction.invitationId && !currentInvitation) failAuthority('invitation_not_found');
    if (currentInvitation && currentInvitation.roomId !== transaction.roomId) failAuthority('invitation_scope_mismatch');

    const result = await transaction.transition(Object.freeze({
      state: cloneAuthority(room.state),
      invitation: cloneAuthority(currentInvitation),
      revision: room.revision,
    }));
    if (!result || typeof result !== 'object' || Array.isArray(result)) failAuthority('invalid_next_state');
    if (!result.state || typeof result.state !== 'object' || Array.isArray(result.state)) failAuthority('invalid_next_state');

    if (Object.hasOwn(result, 'seatRecords')) {
      materializeSeatBindings(room, transaction, result.state, result.seatRecords);
    }

    if (transaction.invitationId && Object.hasOwn(result, 'invitation')) {
      const nextInvitation = validateNextInvitation(currentInvitation, result.invitation, transaction.invitationId);
      nextInvitation.expiresAtMs = currentInvitation.expiresAtMs ?? null;
      invitationsById.set(transaction.invitationId, nextInvitation);
      if (currentInvitation.state === 'open' && nextInvitation.state !== 'open') releaseManualLocator(currentInvitation);
    }

    room.state = cloneAuthority(result.state);
    room.revision += 1;
    const publicReceipt = {
      idempotencyKey: transaction.idempotencyKey,
      operation: transaction.operation,
      revision: room.revision,
    };
    const committedSnapshot = publicAuthoritySnapshot(room);
    const committedInvitation = transaction.invitationId
      ? cloneAuthority(invitationsById.get(transaction.invitationId))
      : null;
    room.receipts.set(transaction.idempotencyKey, {
      fingerprint: transaction.fingerprint,
      actor: cloneAuthority(transaction.actor),
      publicReceipt: cloneAuthority(publicReceipt),
      snapshot: cloneAuthority(committedSnapshot),
      invitation: cloneAuthority(committedInvitation),
    });
    return {
      status: 'committed',
      receipt: publicReceipt,
      snapshot: committedSnapshot,
      invitation: committedInvitation,
    };
  }

  return assertAuthoritativeStore({
    getCapabilities() {
      return capabilities;
    },
    async ensureTable() {},
    async writeRoom({ roomId, payload, integrity, now }) {
      const previous = probeRooms.get(roomId);
      probeRooms.set(roomId, {
        roomId,
        payload: cloneAuthority(payload),
        integrity,
        createdAt: previous?.createdAt || now,
        updatedAt: now,
      });
    },
    async readRoom(roomId) {
      return cloneAuthority(probeRooms.get(roomId) || null);
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
      if (!room) failAuthority('room_not_found');
      const seat = room.seats.find(candidate => candidate.credentialHash === credentialHash);
      if (!seat) failAuthority('seat_credential_rejected');
      return {
        roomId,
        seatId: seat.seatId,
        credentialGeneration: seat.credentialGeneration,
        snapshot: publicAuthoritySnapshot(room),
      };
    },
    async lookupInvitation({ locator }) {
      const normalized = String(locator || '').trim();
      if (!MANUAL_INVITATION_CODE_PATTERN.test(normalized)) return null;
      const invitationId = activeInvitationIdByLocator.get(normalized);
      const invitation = invitationId ? invitationsById.get(invitationId) : null;
      expireInvitationIfNeeded(invitation, nowMs());
      return invitation?.state === 'open' ? cloneAuthority(invitation) : null;
    },
    async allocateInvitation(input) {
      const allocation = normalizeInvitationAllocation(input);
      const room = rooms.get(allocation.roomId);
      if (!room) failAuthority('room_not_found');
      if (room.state?.status !== 'waiting') failAuthority('room_not_waiting');
      if (Number(room.state?.lobbyGeneration ?? -1) !== allocation.lobbyGeneration) failAuthority('invalid_lobby_generation');
      const seat = room.seats.find(candidate => candidate.seatId === allocation.seatId);
      if (!seat || seat.type !== 'online' || seat.lobbyGeneration !== allocation.lobbyGeneration) {
        failAuthority('invitation_seat_not_online');
      }

      const now = nowMs();
      for (const invitation of invitationsById.values()) expireInvitationIfNeeded(invitation, now);

      const seatKey = `${allocation.roomId}:${allocation.lobbyGeneration}:${allocation.seatId}`;
      const existingId = activeInvitationIdBySeat.get(seatKey);
      const existing = existingId ? invitationsById.get(existingId) : null;
      if (existing?.state === 'open') return { status: 'existing', invitation: cloneAuthority(existing) };

      const priorId = invitationsById.get(allocation.invitationId);
      if (priorId) failAuthority('invitation_id_reused');

      const locator = shuffledManualInvitationLocators(randomUint32)
        .find(candidate => !activeInvitationIdByLocator.has(candidate));
      if (!locator) failAuthority(INVITE_CODE_CAPACITY, { capacity: 100 });

      const invitation = {
        invitationId: allocation.invitationId,
        locator,
        roomId: allocation.roomId,
        seatId: allocation.seatId,
        lobbyGeneration: allocation.lobbyGeneration,
        state: 'open',
        data: {
          color: seat.color,
          spatialSlot: seat.spatialSlot,
          configuredIndex: seat.configuredIndex,
        },
        expiresAtMs: now + MANUAL_INVITATION_TTL_MS,
      };
      invitationsById.set(invitation.invitationId, invitation);
      activeInvitationIdByLocator.set(locator, invitation.invitationId);
      activeInvitationIdBySeat.set(seatKey, invitation.invitationId);
      return { status: 'allocated', invitation: cloneAuthority(invitation) };
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
