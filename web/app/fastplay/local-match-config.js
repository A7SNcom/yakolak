import { configuredSeatOrder } from '../shared/seat-order.js';
import { assertCanonicalSessionState, createCanonicalSessionState } from '../session/canonical-session-state.js';

export const FASTPLAY_DEFAULT_WINS_TO_MATCH = 3;
export const FASTPLAY_SEAT_TYPES = Object.freeze(['human', 'computer']);
export const FASTPLAY_PLAYER_COUNTS = Object.freeze([2, 3, 4]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function requirePlayerCount(value) {
  const count = Number(value);
  if (!FASTPLAY_PLAYER_COUNTS.includes(count)) fail('fastplay_invalid_player_count');
  return count;
}

function requireSeatType(value) {
  if (!FASTPLAY_SEAT_TYPES.includes(value)) fail('fastplay_invalid_seat_type');
  return value;
}

export function createFastplaySeats({ targetPlayers = 2, seatTypes = [] } = {}) {
  const count = requirePlayerCount(targetPlayers);
  if (!Array.isArray(seatTypes)) fail('fastplay_invalid_seat_types');
  return Object.freeze(configuredSeatOrder('marble', count).map((slot, index) => Object.freeze({
    seatId: slot.seatId,
    type: requireSeatType(seatTypes[index] || (index === 0 ? 'human' : 'computer')),
    color: slot.color,
    ready: true,
  })));
}

export function createFastplayInitialState(config = {}) {
  const targetPlayers = requirePlayerCount(config.targetPlayers ?? 2);
  const seats = createFastplaySeats({ targetPlayers, seatTypes: config.seatTypes || [] });
  return createCanonicalSessionState({
    preferredColor: 'marble',
    targetPlayers,
    winsToMatch: FASTPLAY_DEFAULT_WINS_TO_MATCH,
    seats,
    activeSeatId: seats[0].seatId,
    round: 1,
    revision: 0,
    lifecycle: { phase: 'turn-loop', presentationGeneration: 0 },
  });
}

export function assertFastplayState(state) {
  assertCanonicalSessionState(state);
  if (state.preferredColor !== 'marble') fail('fastplay_noncanonical_preferred_color');
  if (!FASTPLAY_PLAYER_COUNTS.includes(state.targetPlayers)) fail('fastplay_invalid_player_count');
  if (state.winsToMatch !== FASTPLAY_DEFAULT_WINS_TO_MATCH) fail('fastplay_invalid_wins_to_match');
  if (state.seats.some(seat => !FASTPLAY_SEAT_TYPES.includes(seat.type))) fail('fastplay_nonlocal_seat_type');
  return state;
}
