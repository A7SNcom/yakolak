import {
  COLORS,
  emptyBoard,
  isValidPlayerCount,
  isValidWinsToMatch,
} from '../../../web/app/shared/rules.js';
import {
  canonicalConfiguredSlot,
  configuredSeatOrder,
} from '../../../web/app/shared/seat-order.js';
import {
  AUTHORITATIVE_ACTOR_KINDS,
  AUTHORITATIVE_OPERATION_NAMES,
  AUTHORITATIVE_SEAT_TYPES,
  MUTATION_ID_PATTERN,
} from './authoritative-api.js';

const CONFIG_KEYS = Object.freeze([
  'preferredColor',
  'targetPlayers',
  'winsToMatch',
  'remainingSeatTypes',
]);

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

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function clone(value) {
  return structuredClone(value);
}

export function normalizeLobbyConfiguration(value) {
  if (!exactKeys(value, CONFIG_KEYS)) fail('invalid_lobby_configuration');

  const preferredColor = String(value.preferredColor || '');
  if (!COLORS.includes(preferredColor)) fail('invalid_preferred_color');

  const targetPlayers = value.targetPlayers;
  if (!Number.isInteger(targetPlayers) || !isValidPlayerCount(targetPlayers)) fail('invalid_target_players');

  const winsToMatch = value.winsToMatch;
  if (!Number.isInteger(winsToMatch) || !isValidWinsToMatch(winsToMatch)) fail('invalid_wins_to_match');

  if (!Array.isArray(value.remainingSeatTypes) || value.remainingSeatTypes.length !== targetPlayers - 1) {
    fail('invalid_remaining_seat_types');
  }
  const remainingSeatTypes = value.remainingSeatTypes.map((type) => {
    if (type !== AUTHORITATIVE_SEAT_TYPES.ONLINE && type !== AUTHORITATIVE_SEAT_TYPES.COMPUTER) {
      fail('invalid_remaining_seat_type');
    }
    return type;
  });

  return deepFreeze({ preferredColor, targetPlayers, winsToMatch, remainingSeatTypes });
}

export function normalizeConfigureLobbyEnvelope(value) {
  if (!exactKeys(value, ['mutationId', 'expectedRevision', 'action', 'payload'])) {
    fail('invalid_mutation_envelope');
  }
  if (value.action !== AUTHORITATIVE_OPERATION_NAMES.CONFIGURE_LOBBY) fail('unsupported_mutation_action');
  const mutationId = String(value.mutationId || '').trim();
  if (!MUTATION_ID_PATTERN.test(mutationId)) fail('invalid_mutation_id');
  const expectedRevision = value.expectedRevision;
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) fail('invalid_expected_revision');
  return deepFreeze({
    mutationId,
    expectedRevision,
    action: AUTHORITATIVE_OPERATION_NAMES.CONFIGURE_LOBBY,
    payload: normalizeLobbyConfiguration(value.payload),
  });
}

export function materializeLobbySeatRecords(configuration, lobbyGeneration = 0) {
  const config = normalizeLobbyConfiguration(configuration);
  if (!Number.isSafeInteger(lobbyGeneration) || lobbyGeneration < 0) fail('invalid_lobby_generation');
  const order = configuredSeatOrder(config.preferredColor, config.targetPlayers);

  return deepFreeze(order.map((slot, configuredIndex) => ({
    seatId: slot.seatId,
    spatialSlot: slot.spatialSlot,
    color: slot.color,
    type: configuredIndex === 0
      ? AUTHORITATIVE_SEAT_TYPES.HOST
      : config.remainingSeatTypes[configuredIndex - 1],
    configuredIndex,
    lobbyGeneration,
  })));
}

export function validateMaterializedLobbySeatRecords(records, state) {
  if (!Array.isArray(records)) fail('invalid_materialized_seats');
  if (!state || typeof state !== 'object') fail('invalid_materialized_seats');
  const order = configuredSeatOrder(state.preferredColor, state.targetPlayers);
  if (records.length !== order.length) fail('invalid_materialized_seats');
  const lobbyGeneration = Number(state.lobbyGeneration ?? 0);

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!exactKeys(record, ['seatId', 'spatialSlot', 'color', 'type', 'configuredIndex', 'lobbyGeneration'])) {
      fail('invalid_materialized_seat');
    }
    const expected = order[index];
    const fixed = canonicalConfiguredSlot(record.seatId);
    if (
      record.seatId !== expected.seatId
      || record.spatialSlot !== expected.spatialSlot
      || record.color !== expected.color
      || record.color !== fixed.color
      || record.spatialSlot !== fixed.spatialSlot
      || record.configuredIndex !== index
      || record.lobbyGeneration !== lobbyGeneration
    ) fail('materialized_seat_order_mismatch');
    if (index === 0) {
      if (record.type !== AUTHORITATIVE_SEAT_TYPES.HOST) fail('materialized_host_mismatch');
    } else if (record.type !== AUTHORITATIVE_SEAT_TYPES.ONLINE && record.type !== AUTHORITATIVE_SEAT_TYPES.COMPUTER) {
      fail('invalid_materialized_seat_type');
    }
  }
  return records;
}

function currentBootstrapHostSeat(state) {
  if (!Array.isArray(state?.players) || state.players.length !== 1) fail('lobby_host_required');
  const seat = state.players[0];
  if (!seat || typeof seat.seat !== 'string') fail('lobby_host_required');
  return seat.seat;
}

export function applyInitialLobbyConfiguration(state, actorSeatId, configuration) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) fail('invalid_lobby_state');
  if (state.status !== 'waiting') fail('room_not_waiting');
  if (state.preferredColor != null || state.targetPlayers != null || state.winsToMatch != null) {
    // THREEJS-068 owns edits/new lobby generations once a lobby has a resolved contract.
    fail('lobby_already_configured');
  }

  const config = normalizeLobbyConfiguration(configuration);
  const bootstrapHostSeat = currentBootstrapHostSeat(state);
  if (bootstrapHostSeat !== actorSeatId) fail('host_only_lobby_configuration');

  const lobbyGeneration = Number(state.lobbyGeneration ?? 0);
  if (!Number.isSafeInteger(lobbyGeneration) || lobbyGeneration < 0) fail('invalid_lobby_generation');
  const seatRecords = materializeLobbySeatRecords(config, lobbyGeneration);
  if (seatRecords[0].seatId !== actorSeatId) {
    // Initial room bootstrap must bind the host credential to the preferred-color seat
    // before this mutation. Rebinding after configuration belongs to later edit/takeover work.
    fail('host_seat_preference_mismatch');
  }

  const players = seatRecords.map(({ seatId, color, type }) => ({ seat: seatId, color, type }));
  const scores = Object.fromEntries(seatRecords.map(({ seatId }) => [seatId, 0]));
  const rematch = Object.fromEntries(seatRecords.map(({ seatId }) => [seatId, false]));
  const nextState = {
    ...clone(state),
    preferredColor: config.preferredColor,
    targetPlayers: config.targetPlayers,
    targetRounds: config.winsToMatch,
    winsToMatch: config.winsToMatch,
    players,
    turnIndex: 0,
    board: emptyBoard(),
    round: 1,
    completedRounds: 0,
    scores,
    winner: null,
    draw: false,
    lastMove: null,
    moveNumber: 0,
    matchComplete: false,
    matchWinner: null,
    matchWinners: [],
    rematch,
    skippedSeat: null,
  };

  return deepFreeze({ state: nextState, seatRecords });
}

export function createConfigureLobbyTransaction({
  roomId,
  actorSeatId,
  credentialGeneration,
  expectedRevision,
  mutationId,
  fingerprint,
  configuration,
}) {
  return {
    roomId,
    actor: {
      kind: AUTHORITATIVE_ACTOR_KINDS.SEAT,
      key: actorSeatId,
      generation: credentialGeneration,
    },
    expectedRevision,
    idempotencyKey: mutationId,
    fingerprint,
    operation: AUTHORITATIVE_OPERATION_NAMES.CONFIGURE_LOBBY,
    invitationId: null,
    transition: ({ state }) => applyInitialLobbyConfiguration(state, actorSeatId, configuration),
  };
}
