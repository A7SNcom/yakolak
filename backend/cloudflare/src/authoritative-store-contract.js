import { AUTHORITATIVE_ACTOR_KINDS } from './authoritative-api.js';

export const AUTHORITATIVE_STORE_INTERFACE_VERSION = 1;

export const REQUIRED_STORE_METHODS = Object.freeze([
  'getCapabilities',
  'ensureTable',
  'writeRoom',
  'readRoom',
  'cleanup',
  'authorizeSeat',
  'lookupInvitation',
  'allocateInvitation',
  'revokeInvitation',
  'transactAuthority',
  'commitMutation',
]);

export function failAuthority(code, safeDetails = null) {
  const error = new Error(code);
  error.code = code;
  if (safeDetails !== null) error.safeDetails = safeDetails;
  throw error;
}

export function cloneAuthority(value) {
  return value == null ? value : structuredClone(value);
}

export function assertAuthoritativeStore(store) {
  if (!store || typeof store !== 'object') failAuthority('authoritative_store_invalid');
  for (const method of REQUIRED_STORE_METHODS) {
    if (typeof store[method] !== 'function') {
      failAuthority('authoritative_store_invalid', { missingMethod: method });
    }
  }
  return store;
}

export function storeCapabilities(mode, {
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

export function opaqueAuthority(value, code) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized.length > 256) failAuthority(code);
  return normalized;
}

export function normalizeAuthorityActor(actor) {
  if (!actor || typeof actor !== 'object' || Array.isArray(actor)) failAuthority('invalid_authority_actor');
  const kind = String(actor.kind || '');
  if (!Object.values(AUTHORITATIVE_ACTOR_KINDS).includes(kind)) failAuthority('invalid_authority_actor');
  const key = opaqueAuthority(actor.key, 'invalid_authority_actor');
  const generation = actor.generation ?? null;
  if (generation !== null && (!Number.isSafeInteger(generation) || generation < 1)) failAuthority('invalid_authority_actor');
  return { kind, key, generation };
}

export function normalizeAuthorityTransaction(input) {
  const roomId = opaqueAuthority(input?.roomId, 'invalid_authority_transaction');
  const actor = normalizeAuthorityActor(input?.actor);
  const expectedRevision = input?.expectedRevision;
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) failAuthority('invalid_authority_transaction');
  const idempotencyKey = opaqueAuthority(input?.idempotencyKey, 'invalid_authority_transaction');
  const fingerprint = String(input?.fingerprint || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) failAuthority('invalid_authority_transaction');
  const operation = opaqueAuthority(input?.operation, 'invalid_authority_transaction');
  const invitationId = input?.invitationId == null
    ? null
    : opaqueAuthority(input.invitationId, 'invalid_authority_transaction');
  if (typeof input?.transition !== 'function') failAuthority('invalid_store_transition');
  return {
    roomId,
    actor,
    expectedRevision,
    idempotencyKey,
    fingerprint,
    operation,
    invitationId,
    transition: input.transition,
  };
}

export function publicAuthoritySnapshot(room) {
  return {
    roomId: room.roomId,
    revision: room.revision,
    state: cloneAuthority(room.state),
  };
}

export function validateNextInvitation(currentInvitation, nextInvitation, invitationId) {
  if (!nextInvitation || typeof nextInvitation !== 'object' || Array.isArray(nextInvitation)) {
    failAuthority('invalid_next_invitation');
  }
  for (const field of ['invitationId', 'locator', 'roomId', 'seatId', 'lobbyGeneration', 'expiresAtMs']) {
    if (nextInvitation[field] !== currentInvitation[field]) failAuthority('invalid_next_invitation');
  }
  if (nextInvitation.invitationId !== invitationId) failAuthority('invalid_next_invitation');
  return cloneAuthority(nextInvitation);
}
