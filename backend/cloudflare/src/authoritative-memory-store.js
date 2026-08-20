import {
  AUTHORITATIVE_ACTOR_KINDS,
  AUTHORITATIVE_INVITATION_STATES,
  AUTHORITATIVE_OPERATION_NAMES,
} from './authoritative-api.js';
import {
  MANUAL_INVITE_TTL_MS,
  allManualInviteCodes,
  chooseUnbiasedManualInviteCode,
  isInvitationOpenAndLive,
  normalizeManualInviteCode,
  resolveInvitationSeatContract,
} from './authoritative-invitation-namespace.js';
import { validateMaterializedLobbySeatRecords } from './authoritative-lobby-config.js';
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
    return { seatId, credentialHash, credentialGeneration };
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
  const locator = normalizeManualInviteCode(seed.locator);
  const roomId = opaqueAuthority(seed.roomId, 'invalid_invitation_seed');
  const seatId = opaqueAuthority(seed.seatId, 'invalid_invitation_seed');
  const lobbyGeneration = seed.lobbyGeneration;
  if (!Number.isSafeInteger(lobbyGeneration) || lobbyGeneration < 0) failAuthority('invalid_invitation_seed');
  const expiresAtMs = seed.expiresAtMs ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs < 0) failAuthority('invalid_invitation_seed');
  return {
    invitationId,
    locator,
    roomId,
    seatId,
    color: String(seed.color ?? seed.data?.color ?? ''),
    lobbyGeneration,
    state: opaqueAuthority(seed.state, 'invalid_invitation_seed'),
    expiresAtMs,
    data: cloneAuthority(seed.data ?? null),
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

export function createInMemoryAuthoritativeStore({
  authoritativeRooms = [],
  authoritativeInvitations = [],
  nowMs = () => Date.now(),
  randomUint32 = () => crypto.getRandomValues(new Uint32Array(1))[0],
} = {}) {
  const probeRooms = new Map();
  const rooms = new Map();
  const invitationsById = new Map();

  for (const seed of authoritativeRooms) {
    const room = normalizeAuthoritativeSeed(seed);
    if (rooms.has(room.roomId)) failAuthority('duplicate_authoritative_seed');
    rooms.set(room.roomId, room);
  }
  for (const seed of authoritativeInvitations) {
    const invitation = normalizeInvitationSeed(seed);
    if (invitationsById.has(invitation.invitationId)) failAuthority('duplicate_invitation_seed');
    if ([...invitationsById.values()].some(candidate => (
      candidate.state === AUTHORITATIVE_INVITATION_STATES.OPEN
      && invitation.state === AUTHORITATIVE_INVITATION_STATES.OPEN
      && candidate.locator === invitation.locator
    ))) failAuthority('duplicate_invitation_seed');
    invitationsById.set(invitation.invitationId, invitation);
  }

  const capabilities = storeCapabilities('memory-contract', {
    authoritativeRead: true,
    authoritativeMutation: true,
    invitationLookup: true,
    transactionalAuthority: true,
    durableMutationReceipts: false,
  });

  function sweepExpiredInvitations(atMs = nowMs()) {
    for (const invitation of invitationsById.values()) {
      if (invitation.state === AUTHORITATIVE_INVITATION_STATES.OPEN && invitation.expiresAtMs <= atMs) {
        invitation.state = AUTHORITATIVE_INVITATION_STATES.EXPIRED;
      }
    }
  }

  function authorizeActor(room, transaction) {
    if (transaction.actor.kind !== AUTHORITATIVE_ACTOR_KINDS.SEAT) return;
    const seat = room.seats.find(candidate => candidate.seatId === transaction.actor.key);
    if (!seat) failAuthority('seat_credential_rejected');
    if (seat.credentialGeneration !== transaction.actor.generation) failAuthority('seat_credential_generation_stale');
  }

  function duplicateReceipt(room, transaction) {
    const prior = room.receipts.get(transaction.idempotencyKey);
    if (!prior) return null;
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

  function commitReceipt(room, transaction, invitation = null) {
    room.revision += 1;
    const publicReceipt = {
      idempotencyKey: transaction.idempotencyKey,
      operation: transaction.operation,
      revision: room.revision,
    };
    const snapshot = publicAuthoritySnapshot(room);
    room.receipts.set(transaction.idempotencyKey, {
      fingerprint: transaction.fingerprint,
      actor: cloneAuthority(transaction.actor),
      publicReceipt: cloneAuthority(publicReceipt),
      snapshot: cloneAuthority(snapshot),
      invitation: cloneAuthority(invitation),
    });
    return { status: 'committed', receipt: publicReceipt, snapshot, invitation: cloneAuthority(invitation) };
  }

  async function allocateInvitation(input) {
    const transaction = normalizedNamespaceTransaction(input, AUTHORITATIVE_OPERATION_NAMES.ALLOCATE_INVITATION);
    const invitationId = opaqueAuthority(input?.invitationId, 'invalid_invitation_id');
    const seatId = opaqueAuthority(input?.seatId, 'invalid_mutation_payload');
    const room = rooms.get(transaction.roomId);
    if (!room) failAuthority('room_not_found');
    authorizeActor(room, transaction);
    const duplicate = duplicateReceipt(room, transaction);
    if (duplicate) return duplicate;
    if (room.revision !== transaction.expectedRevision) failAuthority('revision_conflict', { currentRevision: room.revision });

    const seatContract = resolveInvitationSeatContract(room.state, transaction.actor.key, seatId);
    sweepExpiredInvitations(nowMs());
    const sameSeat = [...invitationsById.values()].find(invitation => (
      invitation.roomId === transaction.roomId
      && invitation.lobbyGeneration === seatContract.lobbyGeneration
      && invitation.seatId === seatContract.seatId
      && (invitation.state === AUTHORITATIVE_INVITATION_STATES.OPEN
        || invitation.state === AUTHORITATIVE_INVITATION_STATES.CLAIMED)
    ));
    if (sameSeat?.state === AUTHORITATIVE_INVITATION_STATES.OPEN) failAuthority('invitation_already_open');
    if (sameSeat?.state === AUTHORITATIVE_INVITATION_STATES.CLAIMED) failAuthority('invitation_already_claimed');
    if (invitationsById.has(invitationId)) failAuthority('idempotency_key_reused');

    const used = new Set([...invitationsById.values()]
      .filter(invitation => isInvitationOpenAndLive(invitation, nowMs()))
      .map(invitation => invitation.locator));
    const free = allManualInviteCodes().filter(locator => !used.has(locator));
    const locator = chooseUnbiasedManualInviteCode(free, randomUint32);
    const invitation = {
      invitationId,
      locator,
      roomId: transaction.roomId,
      seatId: seatContract.seatId,
      color: seatContract.color,
      lobbyGeneration: seatContract.lobbyGeneration,
      state: AUTHORITATIVE_INVITATION_STATES.OPEN,
      expiresAtMs: nowMs() + MANUAL_INVITE_TTL_MS,
      data: {
        color: seatContract.color,
        allocatedRevision: room.revision + 1,
      },
    };
    invitationsById.set(invitationId, invitation);
    return commitReceipt(room, transaction, invitation);
  }

  async function revokeInvitation(input) {
    const invitationId = opaqueAuthority(input?.invitationId, 'invalid_invitation_id');
    const transaction = normalizedNamespaceTransaction(input, AUTHORITATIVE_OPERATION_NAMES.REVOKE_INVITATION, invitationId);
    const room = rooms.get(transaction.roomId);
    if (!room) failAuthority('room_not_found');
    authorizeActor(room, transaction);
    const duplicate = duplicateReceipt(room, transaction);
    if (duplicate) return duplicate;
    if (room.revision !== transaction.expectedRevision) failAuthority('revision_conflict', { currentRevision: room.revision });
    sweepExpiredInvitations(nowMs());
    const invitation = invitationsById.get(invitationId);
    if (!invitation || invitation.roomId !== transaction.roomId) failAuthority('invitation_not_found');
    resolveInvitationSeatContract(room.state, transaction.actor.key, invitation.seatId);
    if (invitation.state !== AUTHORITATIVE_INVITATION_STATES.OPEN) failAuthority('invitation_not_open');
    invitation.state = AUTHORITATIVE_INVITATION_STATES.REVOKED;
    return commitReceipt(room, transaction, invitation);
  }

  async function transactAuthority(input) {
    const transaction = normalizeAuthorityTransaction(input);
    const room = rooms.get(transaction.roomId);
    if (!room) failAuthority('room_not_found');
    authorizeActor(room, transaction);

    const duplicate = duplicateReceipt(room, transaction);
    if (duplicate) return duplicate;
    if (room.revision !== transaction.expectedRevision) {
      failAuthority('revision_conflict', { currentRevision: room.revision });
    }

    if (transaction.invitationId) sweepExpiredInvitations(nowMs());
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
      invitationsById.set(transaction.invitationId, nextInvitation);
    }

    room.state = cloneAuthority(result.state);
    const committedInvitation = transaction.invitationId
      ? cloneAuthority(invitationsById.get(transaction.invitationId))
      : null;
    return commitReceipt(room, transaction, committedInvitation);
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
      sweepExpiredInvitations(nowMs());
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
      const normalizedLocator = normalizeManualInviteCode(locator);
      const now = nowMs();
      const matches = [...invitationsById.values()].filter(invitation => (
        invitation.locator === normalizedLocator && isInvitationOpenAndLive(invitation, now)
      ));
      if (matches.length > 1) failAuthority('invitation_locator_ambiguous');
      return cloneAuthority(matches[0] || null);
    },
    allocateInvitation,
    revokeInvitation,
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
