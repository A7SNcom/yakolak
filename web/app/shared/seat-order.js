import {
  COLORS,
  RULES,
  hasLegalMove,
} from './rules.js';

export const CANONICAL_CONFIGURED_SEAT_RING = Object.freeze([
  Object.freeze({ seatId: 'right', spatialSlot: 'right', color: 'marble' }),
  Object.freeze({ seatId: 'back', spatialSlot: 'back', color: 'blue' }),
  Object.freeze({ seatId: 'left', spatialSlot: 'left', color: 'gold' }),
  Object.freeze({ seatId: 'front', spatialSlot: 'front', color: 'green' }),
]);

export const NO_LEGAL_MOVE_SKIP_REASON = 'no_legal_move';

const CONFIGURED_SEAT_IDS = new Set(CANONICAL_CONFIGURED_SEAT_RING.map(seat => seat.seatId));
const SLOT_BY_ID = new Map(CANONICAL_CONFIGURED_SEAT_RING.map(seat => [seat.seatId, seat]));
const SLOT_BY_COLOR = new Map(CANONICAL_CONFIGURED_SEAT_RING.map(seat => [seat.color, seat]));

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireExactKeys(value, expected, code) {
  if (!isPlainRecord(value)) fail(code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(code);
}

function requireOpaqueId(value, code) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256) fail(code);
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function canonicalConfiguredSlot(seatId) {
  const slot = SLOT_BY_ID.get(seatId);
  if (!slot) fail('invalid_configured_seat_id');
  return slot;
}

export function canonicalConfiguredSlotForColor(color) {
  const slot = SLOT_BY_COLOR.get(color);
  if (!slot) fail('invalid_preferred_color');
  return slot;
}

export function configuredSeatOrder(preferredColor, targetPlayers) {
  if (!COLORS.includes(preferredColor)) fail('invalid_preferred_color');
  if (!RULES.playerCounts.includes(targetPlayers)) fail('invalid_target_players');

  const start = CANONICAL_CONFIGURED_SEAT_RING.findIndex(seat => seat.color === preferredColor);
  const rotated = Array.from({ length: CANONICAL_CONFIGURED_SEAT_RING.length }, (_, offset) =>
    CANONICAL_CONFIGURED_SEAT_RING[(start + offset) % CANONICAL_CONFIGURED_SEAT_RING.length],
  );
  return Object.freeze(rotated.slice(0, targetPlayers));
}

export function assertConfiguredSeatsMatchOrder(seats, preferredColor, targetPlayers) {
  if (!Array.isArray(seats)) fail('invalid_configured_seats');
  const expected = configuredSeatOrder(preferredColor, targetPlayers);
  if (seats.length > expected.length) fail('too_many_configured_seats');

  const seenIds = new Set();
  for (let index = 0; index < seats.length; index += 1) {
    const seat = seats[index];
    if (!isPlainRecord(seat)) fail('invalid_configured_seat');
    const expectedSlot = expected[index];
    if (seat.seatId !== expectedSlot.seatId || seat.color !== expectedSlot.color) {
      fail('configured_seat_order_mismatch');
    }
    if (seenIds.has(seat.seatId)) fail('duplicate_configured_seat_id');
    seenIds.add(seat.seatId);
  }
  return seats;
}

export function configuredSeatOrderFromState(state) {
  if (!isPlainRecord(state)) fail('invalid_configured_state');
  const expected = configuredSeatOrder(state.preferredColor, state.targetPlayers);
  if (!Array.isArray(state.seats)) fail('invalid_configured_seats');
  const bySeatId = new Map(state.seats.map(seat => [seat?.seatId, seat]));
  return deepFreeze(expected.map(slot => {
    const seat = bySeatId.get(slot.seatId);
    if (!seat || seat.color !== slot.color) fail('configured_seat_missing');
    return { ...seat };
  }));
}

// Bind only a stable opaque credential identity/fingerprint here, never a raw
// bearer secret. Claim arrival order is ignored; output is sorted by configured
// seat order so reconnect and backend execution resolve the same slot mapping.
export function createCredentialSeatBindings(configuredSeats, claims) {
  if (!Array.isArray(configuredSeats) || !Array.isArray(claims)) fail('invalid_credential_bindings');
  const configuredIds = new Set(configuredSeats.map(seat => seat?.seatId));
  for (const seatId of configuredIds) if (!CONFIGURED_SEAT_IDS.has(seatId)) fail('invalid_configured_seat_id');

  const claimBySeat = new Map();
  const credentialIds = new Set();
  for (const claim of claims) {
    requireExactKeys(claim, ['credentialId', 'seatId'], 'invalid_credential_binding');
    const credentialId = requireOpaqueId(claim.credentialId, 'invalid_credential_id');
    if (!configuredIds.has(claim.seatId)) fail('credential_seat_not_configured');
    if (credentialIds.has(credentialId)) fail('duplicate_credential_id');
    if (claimBySeat.has(claim.seatId)) fail('duplicate_credential_seat');
    credentialIds.add(credentialId);
    claimBySeat.set(claim.seatId, { credentialId, seatId: claim.seatId });
  }

  return deepFreeze(configuredSeats
    .filter(seat => claimBySeat.has(seat.seatId))
    .map(seat => claimBySeat.get(seat.seatId)));
}

export function configuredSeatForCredential(configuredSeats, bindings, credentialId) {
  requireOpaqueId(credentialId, 'invalid_credential_id');
  if (!Array.isArray(configuredSeats) || !Array.isArray(bindings)) fail('invalid_credential_bindings');
  const binding = bindings.find(candidate => candidate?.credentialId === credentialId);
  if (!binding) return null;
  return configuredSeats.find(seat => seat?.seatId === binding.seatId) || null;
}

// Select from the resolved configured order, not from join arrival order. The
// scan wraps through every configured seat and includes the current seat last;
// therefore one remaining legal mover may receive consecutive turns after all
// other seats are authoritatively skipped.
export function selectNextLegalConfiguredSeat(state, currentSeatId) {
  const order = configuredSeatOrderFromState(state);
  const currentIndex = order.findIndex(seat => seat.seatId === currentSeatId);
  if (currentIndex < 0) fail('current_seat_not_configured');

  const skips = [];
  for (let offset = 1; offset <= order.length; offset += 1) {
    const seat = order[(currentIndex + offset) % order.length];
    if (hasLegalMove(state.board, seat.color)) {
      return deepFreeze({
        nextSeatId: seat.seatId,
        skips,
        allSeatsBlocked: false,
      });
    }
    skips.push({ seatId: seat.seatId, reason: NO_LEGAL_MOVE_SKIP_REASON });
  }

  return deepFreeze({
    nextSeatId: null,
    skips,
    allSeatsBlocked: true,
  });
}
