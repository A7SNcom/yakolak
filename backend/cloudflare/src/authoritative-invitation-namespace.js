import {
  AUTHORITATIVE_INVITATION_STATES,
  AUTHORITATIVE_OPERATION_NAMES,
  AUTHORITATIVE_SEAT_TYPES,
  MUTATION_ID_PATTERN,
} from './authoritative-api.js';
import { failAuthority, opaqueAuthority } from './authoritative-store-contract.js';

export const MANUAL_INVITE_CODE_CAPACITY = 100;
export const MANUAL_INVITE_TTL_MS = 10 * 60 * 1000;
export const MANUAL_INVITE_CODE_PATTERN = /^\d{2}$/;
const UINT32_RANGE = 0x1_0000_0000;

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

function mutationEnvelope(value, action, payloadKeys) {
  if (!exactKeys(value, ['mutationId', 'expectedRevision', 'action', 'payload'])) {
    failAuthority('invalid_mutation_envelope');
  }
  if (value.action !== action) failAuthority('unsupported_mutation_action');
  const mutationId = String(value.mutationId || '').trim();
  if (!MUTATION_ID_PATTERN.test(mutationId)) failAuthority('invalid_mutation_id');
  const expectedRevision = value.expectedRevision;
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) failAuthority('invalid_expected_revision');
  if (!exactKeys(value.payload, payloadKeys)) failAuthority('invalid_mutation_payload');
  return { mutationId, expectedRevision, action };
}

export function normalizeManualInviteCode(value) {
  const locator = String(value ?? '').trim();
  if (!MANUAL_INVITE_CODE_PATTERN.test(locator)) failAuthority('invalid_invitation_locator');
  return locator;
}

export function manualInviteCodeAt(index) {
  if (!Number.isInteger(index) || index < 0 || index >= MANUAL_INVITE_CODE_CAPACITY) {
    failAuthority('invalid_invitation_locator_index');
  }
  return String(index).padStart(2, '0');
}

export function allManualInviteCodes() {
  return Object.freeze(Array.from({ length: MANUAL_INVITE_CODE_CAPACITY }, (_, index) => manualInviteCodeAt(index)));
}

export function chooseUnbiasedManualInviteCode(freeLocators, randomUint32) {
  if (!Array.isArray(freeLocators)) failAuthority('invalid_invitation_namespace');
  const normalized = freeLocators.map(normalizeManualInviteCode);
  if (new Set(normalized).size !== normalized.length) failAuthority('invalid_invitation_namespace');
  if (normalized.length === 0) {
    failAuthority('INVITE_CODE_CAPACITY', { capacity: MANUAL_INVITE_CODE_CAPACITY });
  }
  if (typeof randomUint32 !== 'function') failAuthority('invitation_random_source_unavailable');

  const acceptanceCeiling = Math.floor(UINT32_RANGE / normalized.length) * normalized.length;
  for (let attempt = 0; attempt < 128; attempt += 1) {
    const raw = Number(randomUint32());
    if (!Number.isInteger(raw) || raw < 0 || raw >= UINT32_RANGE) {
      failAuthority('invitation_random_source_invalid');
    }
    if (raw < acceptanceCeiling) return normalized[raw % normalized.length];
  }
  failAuthority('invitation_random_source_unavailable');
}

export function normalizeAllocateInvitationEnvelope(value) {
  const common = mutationEnvelope(value, AUTHORITATIVE_OPERATION_NAMES.ALLOCATE_INVITATION, ['seatId']);
  const seatId = opaqueAuthority(value.payload.seatId, 'invalid_mutation_payload');
  return Object.freeze({ ...common, payload: Object.freeze({ seatId }) });
}

export function normalizeRevokeInvitationEnvelope(value) {
  const common = mutationEnvelope(value, AUTHORITATIVE_OPERATION_NAMES.REVOKE_INVITATION, ['invitationId']);
  const invitationId = opaqueAuthority(value.payload.invitationId, 'invalid_mutation_payload');
  return Object.freeze({ ...common, payload: Object.freeze({ invitationId }) });
}

export function resolveInvitationSeatContract(state, actorSeatId, requestedSeatId) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) failAuthority('invalid_lobby_state');
  if (state.status !== 'waiting') failAuthority('room_not_waiting');
  const lobbyGeneration = Number(state.lobbyGeneration ?? 0);
  if (!Number.isSafeInteger(lobbyGeneration) || lobbyGeneration < 0) failAuthority('invalid_lobby_generation');
  if (!Array.isArray(state.players) || state.players.length < 2) failAuthority('invalid_lobby_state');

  const actor = state.players.find(player => player?.seat === actorSeatId);
  if (!actor || actor.type !== AUTHORITATIVE_SEAT_TYPES.HOST) failAuthority('host_only_invitation_allocation');
  const target = state.players.find(player => player?.seat === requestedSeatId);
  if (!target || target.type !== AUTHORITATIVE_SEAT_TYPES.ONLINE) failAuthority('invitation_online_seat_required');
  const color = String(target.color || '');
  if (!color) failAuthority('invalid_lobby_state');

  return Object.freeze({
    seatId: String(target.seat),
    color,
    lobbyGeneration,
  });
}

export function isInvitationOpenAndLive(invitation, nowMs) {
  if (!invitation || invitation.state !== AUTHORITATIVE_INVITATION_STATES.OPEN) return false;
  const expiresAtMs = Number(invitation.expiresAtMs);
  return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
}

export function publicInvitationView(invitation) {
  if (!invitation) return null;
  return Object.freeze({
    invitationId: String(invitation.invitationId),
    locator: normalizeManualInviteCode(invitation.locator),
    roomId: String(invitation.roomId),
    seatId: String(invitation.seatId),
    color: String(invitation.color ?? invitation.data?.color ?? ''),
    lobbyGeneration: Number(invitation.lobbyGeneration),
    state: String(invitation.state),
    expiresAtMs: Number(invitation.expiresAtMs),
  });
}
