export const MANUAL_INVITATION_CODE_COUNT = 100;
export const MANUAL_INVITATION_TTL_MS = 10 * 60 * 1000;
export const MANUAL_INVITATION_CODE_PATTERN = /^\d{2}$/;
export const INVITE_CODE_CAPACITY = 'INVITE_CODE_CAPACITY';

function fail(code) {
  const error = new Error(code);
  error.code = code;
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

function opaque(value, code) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized.length > 256) fail(code);
  return normalized;
}

export function manualInvitationLocators() {
  return Object.freeze(Array.from({ length: MANUAL_INVITATION_CODE_COUNT }, (_, index) => String(index).padStart(2, '0')));
}

export function secureRandomUint32() {
  if (!globalThis.crypto?.getRandomValues) fail('secure_random_unavailable');
  const value = new Uint32Array(1);
  globalThis.crypto.getRandomValues(value);
  return value[0] >>> 0;
}

export function uniformRandomIndex(maxExclusive, randomUint32 = secureRandomUint32) {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 0x1_0000_0000) {
    fail('invalid_random_bound');
  }
  if (typeof randomUint32 !== 'function') fail('invalid_random_source');
  const range = 0x1_0000_0000;
  const limit = Math.floor(range / maxExclusive) * maxExclusive;
  for (;;) {
    const raw = Number(randomUint32());
    if (!Number.isFinite(raw)) fail('invalid_random_source');
    const candidate = raw >>> 0;
    if (candidate < limit) return candidate % maxExclusive;
  }
}

export function shuffledManualInvitationLocators(randomUint32 = secureRandomUint32) {
  const locators = [...manualInvitationLocators()];
  for (let index = locators.length - 1; index > 0; index -= 1) {
    const swapIndex = uniformRandomIndex(index + 1, randomUint32);
    [locators[index], locators[swapIndex]] = [locators[swapIndex], locators[index]];
  }
  return Object.freeze(locators);
}

export function normalizeInvitationAllocation(value) {
  if (!exactKeys(value, ['roomId', 'seatId', 'lobbyGeneration', 'invitationId'])) {
    fail('invalid_invitation_allocation');
  }
  const lobbyGeneration = value.lobbyGeneration;
  if (!Number.isSafeInteger(lobbyGeneration) || lobbyGeneration < 0) fail('invalid_lobby_generation');
  return Object.freeze({
    roomId: opaque(value.roomId, 'invalid_invitation_allocation'),
    seatId: opaque(value.seatId, 'invalid_invitation_allocation'),
    lobbyGeneration,
    invitationId: opaque(value.invitationId, 'invalid_invitation_allocation'),
  });
}

export const __testing = Object.freeze({
  uniformRandomIndex,
});
