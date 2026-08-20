import { SIZES } from '../../../web/app/shared/rules.js';
import { applyMoveTransition } from '../../../web/app/shared/transitions.js';
import { ONLINE_PROTOCOL } from './compatibility.js';

export const AUTHORITATIVE_SEAT_TYPES = Object.freeze({
  HOST: 'host',
  ONLINE: 'online',
  COMPUTER: 'computer',
});

export const AUTHORITATIVE_ACTOR_KINDS = Object.freeze({
  SEAT: 'seat',
  CLAIM: 'claim',
  SERVER: 'server',
});

export const AUTHORITATIVE_INVITATION_STATES = Object.freeze({
  OPEN: 'open',
  CLAIMED: 'claimed',
  REVOKED: 'revoked',
  EXPIRED: 'expired',
});

export const SERVER_RECONCILIATION_KINDS = Object.freeze({
  TIMEOUT: 'timeout',
  COMPUTER: 'computer',
});

export const AUTHORITATIVE_TURN_DURATION_MS = 18_000;

// These names lock transport/transaction identity only. Their feature semantics stay
// with the named downstream owners (064/065/066/068/069/070/071/072).
export const AUTHORITATIVE_OPERATION_NAMES = Object.freeze({
  CONFIGURE_LOBBY: 'configure-lobby',
  CLAIM_INVITATION: 'claim-invitation',
  INVALIDATE_LOBBY: 'invalidate-lobby',
  SET_READY: 'set-ready',
  START_MATCH: 'start-match',
  MOVE: 'move',
  RECONCILE_TIMEOUT: 'reconcile-timeout',
  RECONCILE_COMPUTER: 'reconcile-computer',
});

export const AUTHORITATIVE_API = Object.freeze({
  schema: 'yakolak.authoritative-api/v1',
  version: 1,
  routePrefix: '/v1',
  protocol: Object.freeze({ ...ONLINE_PROTOCOL }),
  capabilities: Object.freeze({
    id: 'yakolak-authoritative-api-capabilities-v1',
    names: Object.freeze([
      'request-trace-envelope.v1',
      'seat-bearer-auth-framing.v1',
      'room-snapshot-envelope.v1',
      'room-mutation-envelope.v1',
      'shared-transition.move.v1',
      'authoritative-lobby-configuration.v1',
      'authoritative-store-interface.v1',
    ]),
  }),
  contract: Object.freeze({
    seatTypes: Object.freeze(Object.values(AUTHORITATIVE_SEAT_TYPES)),
    actorKinds: Object.freeze(Object.values(AUTHORITATIVE_ACTOR_KINDS)),
    invitationStates: Object.freeze(Object.values(AUTHORITATIVE_INVITATION_STATES)),
    serverReconciliationKinds: Object.freeze(Object.values(SERVER_RECONCILIATION_KINDS)),
    turnDeadline: Object.freeze({ field: 'deadlineAtMs', durationMs: AUTHORITATIVE_TURN_DURATION_MS, authority: 'server' }),
    reservedOperations: Object.freeze(Object.values(AUTHORITATIVE_OPERATION_NAMES)),
  }),
});

export const AUTHORITATIVE_ROOM_ID_PATTERN = /^\d{2}$/;
export const SEAT_CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{32,96}$/;
export const MUTATION_ID_PATTERN = /^[A-Za-z0-9_-]{32,96}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,96}$/;
const TRACE_ID_PATTERN = /^[a-f0-9]{32}$/i;
const TRACEPARENT_PATTERN = /^[\da-f]{2}-([\da-f]{32})-[\da-f]{16}-[\da-f]{2}$/i;

function fail(code, safeDetails = null) {
  const error = new Error(code);
  error.code = code;
  if (safeDetails !== null) error.safeDetails = safeDetails;
  throw error;
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys) {
  if (!isPlainRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function randomTraceId(randomUUID) {
  return randomUUID().replaceAll('-', '').toLowerCase().slice(0, 32);
}

export function createRequestContext(request, {
  randomUUID = () => crypto.randomUUID(),
} = {}) {
  const suppliedRequestId = String(request?.headers?.get('x-request-id') || '').trim();
  const requestId = REQUEST_ID_PATTERN.test(suppliedRequestId) ? suppliedRequestId : randomUUID();

  const suppliedTraceId = String(request?.headers?.get('x-trace-id') || '').trim();
  const traceparent = String(request?.headers?.get('traceparent') || '').trim();
  const traceparentMatch = TRACEPARENT_PATTERN.exec(traceparent);
  const traceId = TRACE_ID_PATTERN.test(suppliedTraceId)
    ? suppliedTraceId.toLowerCase()
    : traceparentMatch
      ? traceparentMatch[1].toLowerCase()
      : randomTraceId(randomUUID);

  return Object.freeze({
    schema: 'yakolak.request-context/v1',
    requestId,
    traceId,
  });
}

export function authoritativeApiIdentity(storeCapabilities = {}) {
  return Object.freeze({
    schema: AUTHORITATIVE_API.schema,
    version: AUTHORITATIVE_API.version,
    routePrefix: AUTHORITATIVE_API.routePrefix,
    protocol: { ...AUTHORITATIVE_API.protocol },
    capabilities: {
      id: AUTHORITATIVE_API.capabilities.id,
      names: [...AUTHORITATIVE_API.capabilities.names],
    },
    contract: {
      seatTypes: [...AUTHORITATIVE_API.contract.seatTypes],
      actorKinds: [...AUTHORITATIVE_API.contract.actorKinds],
      invitationStates: [...AUTHORITATIVE_API.contract.invitationStates],
      serverReconciliationKinds: [...AUTHORITATIVE_API.contract.serverReconciliationKinds],
      turnDeadline: { ...AUTHORITATIVE_API.contract.turnDeadline },
      reservedOperations: [...AUTHORITATIVE_API.contract.reservedOperations],
    },
    store: {
      interfaceVersion: Number(storeCapabilities.interfaceVersion || 1),
      mode: String(storeCapabilities.mode || 'unknown'),
      authoritativeRead: storeCapabilities.authoritativeRead === true,
      authoritativeMutation: storeCapabilities.authoritativeMutation === true,
      invitationLookup: storeCapabilities.invitationLookup === true,
      transactionalAuthority: storeCapabilities.transactionalAuthority === true,
      durableMutationReceipts: storeCapabilities.durableMutationReceipts === true,
    },
  });
}

export function extractSeatCredential(request) {
  const authorization = String(request?.headers?.get('authorization') || '').trim();
  if (!authorization) fail('seat_credential_required');
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) fail('seat_credential_invalid');
  const credential = match[1].trim();
  if (!SEAT_CREDENTIAL_PATTERN.test(credential)) fail('seat_credential_invalid');
  return credential;
}

export function normalizeAuthoritativeRoomId(value) {
  const roomId = String(value || '').trim();
  if (!AUTHORITATIVE_ROOM_ID_PATTERN.test(roomId)) fail('invalid_room_id');
  return roomId;
}

export function normalizeMutationEnvelope(value) {
  if (!exactKeys(value, ['mutationId', 'expectedRevision', 'action', 'payload'])) {
    fail('invalid_mutation_envelope');
  }

  const mutationId = String(value.mutationId || '').trim();
  if (!MUTATION_ID_PATTERN.test(mutationId)) fail('invalid_mutation_id');

  const expectedRevision = value.expectedRevision;
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) fail('invalid_expected_revision');

  if (value.action !== AUTHORITATIVE_OPERATION_NAMES.MOVE) fail('unsupported_mutation_action');
  if (!exactKeys(value.payload, ['cell', 'size'])) fail('invalid_mutation_payload');
  if (!Number.isInteger(value.payload.cell)) fail('invalid_mutation_payload');
  if (typeof value.payload.size !== 'string' || !SIZES.includes(value.payload.size)) fail('invalid_mutation_payload');

  return Object.freeze({
    mutationId,
    expectedRevision,
    action: AUTHORITATIVE_OPERATION_NAMES.MOVE,
    payload: Object.freeze({
      cell: value.payload.cell,
      size: value.payload.size,
    }),
  });
}

export function mutationFingerprintSource(roomId, actorSeatId, envelope) {
  return JSON.stringify({
    roomId: normalizeAuthoritativeRoomId(roomId),
    actorSeatId: String(actorSeatId || ''),
    mutationId: envelope.mutationId,
    expectedRevision: envelope.expectedRevision,
    action: envelope.action,
    payload: envelope.payload,
  });
}

export function applyAuthoritativeMutation(state, actorSeatId, envelope) {
  if (envelope.action !== AUTHORITATIVE_OPERATION_NAMES.MOVE) fail('unsupported_mutation_action');
  return applyMoveTransition(state, String(actorSeatId || ''), envelope.payload);
}

const ERROR_STATUS = Object.freeze({
  payload_too_large: 413,
  invalid_payload: 400,
  invalid_room_id: 400,
  invalid_mutation_envelope: 400,
  invalid_mutation_id: 400,
  invalid_expected_revision: 400,
  invalid_mutation_payload: 400,
  unsupported_mutation_action: 400,
  invalid_lobby_configuration: 400,
  invalid_preferred_color: 400,
  invalid_target_players: 400,
  invalid_wins_to_match: 400,
  invalid_remaining_seat_types: 400,
  invalid_remaining_seat_type: 400,
  invalid_lobby_generation: 409,
  invalid_lobby_state: 409,
  lobby_host_required: 409,
  host_seat_preference_mismatch: 409,
  lobby_already_configured: 409,
  lobby_configuration_has_bound_seat: 409,
  host_only_lobby_configuration: 403,
  origin_not_allowed: 403,
  room_not_found: 404,
  seat_credential_required: 401,
  seat_credential_invalid: 401,
  seat_credential_rejected: 401,
  seat_credential_generation_stale: 401,
  invitation_not_found: 404,
  revision_conflict: 409,
  mutation_id_reused: 409,
  idempotency_key_reused: 409,
  room_not_playing: 409,
  room_not_waiting: 409,
  not_your_turn: 409,
  occupied_slot: 409,
  no_piece_remaining: 409,
  invalid_move: 400,
  datastore_unavailable: 503,
  authoritative_store_unavailable: 503,
});

export function normalizeApiError(error) {
  const rawCode = String(error?.code || error?.message || 'online_server_error');
  const status = ERROR_STATUS[rawCode] || 500;
  const externallyStableCode = rawCode === 'idempotency_key_reused' ? 'mutation_id_reused' : rawCode;
  const code = status >= 500 && !Object.hasOwn(ERROR_STATUS, rawCode) ? 'online_server_error' : externallyStableCode;
  return Object.freeze({
    status,
    code,
    retryable: code === 'datastore_unavailable'
      || code === 'authoritative_store_unavailable'
      || code === 'revision_conflict',
    details: error?.safeDetails && typeof error.safeDetails === 'object'
      ? structuredClone(error.safeDetails)
      : null,
  });
}
