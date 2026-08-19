import {
  COLORS,
  RULES,
  SIZES,
  countPieces,
  emptyBoard,
} from '../shared/rules.js';

export const CANONICAL_SESSION_STATE_SCHEMA = 'yakolak.session-state/v1';

const TOP_LEVEL_KEYS = [
  'schema',
  'lobbyGeneration',
  'targetPlayers',
  'winsToMatch',
  'seats',
  'board',
  'inventory',
  'turnIndex',
  'activeSeatId',
  'deadlineAtMs',
  'scores',
  'round',
  'completedRounds',
  'lastMove',
  'skippedSeat',
  'skipReason',
  'winner',
  'draw',
  'matchComplete',
  'matchWinner',
  'matchWinners',
  'restart',
  'rematch',
  'revision',
  'lifecycle',
];

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

function requireRecord(value, code) {
  if (!isPlainRecord(value)) fail(code);
  return value;
}

function requireExactKeys(value, expected, code) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(code);
}

function requireOpaqueString(value, code, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || value.length < 1 || value.length > 256) fail(code);
  return value;
}

function requireInteger(value, code, { nullable = false, min = 0 } = {}) {
  if (nullable && value === null) return null;
  if (!Number.isInteger(value) || value < min) fail(code);
  return value;
}

function cloneJson(value) {
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== 'string') fail('canonical_state_not_serializable');
    return JSON.parse(serialized);
  } catch (error) {
    if (error?.code === 'canonical_state_not_serializable') throw error;
    fail('canonical_state_not_serializable');
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function assertPureJson(value, code = 'canonical_state_not_serializable') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(code);
    return;
  }
  if (Array.isArray(value)) {
    for (const child of value) assertPureJson(child, code);
    return;
  }
  if (!isPlainRecord(value)) fail(code);
  for (const child of Object.values(value)) assertPureJson(child, code);
}

function seatMap(seats, valueFactory) {
  return Object.fromEntries(seats.map(seat => [seat.seatId, valueFactory(seat)]));
}

function validateSeats(seats) {
  if (!Array.isArray(seats) || seats.length > 4) fail('invalid_session_seats');
  const seatIds = new Set();
  const colors = new Set();
  for (const seat of seats) {
    requireRecord(seat, 'invalid_session_seat');
    requireExactKeys(seat, ['seatId', 'type', 'color', 'ready'], 'invalid_session_seat_shape');
    requireOpaqueString(seat.seatId, 'invalid_session_seat_id');
    // THREEJS-062 owns the eventual authoritative seat-type vocabulary. THREEJS-045
    // carries the normalized type token without deciding its authority semantics.
    requireOpaqueString(seat.type, 'invalid_session_seat_type');
    if (!COLORS.includes(seat.color)) fail('invalid_session_seat_color');
    if (seat.ready !== null && typeof seat.ready !== 'boolean') fail('invalid_session_seat_readiness');
    if (seatIds.has(seat.seatId)) fail('duplicate_session_seat_id');
    if (colors.has(seat.color)) fail('duplicate_session_seat_color');
    seatIds.add(seat.seatId);
    colors.add(seat.color);
  }
  return { seatIds, colors };
}

function validateBoard(board, configuredColors) {
  requireRecord(board, 'invalid_session_board');
  const cellKeys = Array.from({ length: RULES.cellCount }, (_, index) => String(index));
  requireExactKeys(board, cellKeys, 'invalid_session_board_shape');
  for (const cellKey of cellKeys) {
    const cell = requireRecord(board[cellKey], 'invalid_session_board_cell');
    for (const key of Object.keys(cell)) {
      if (!SIZES.includes(key)) fail('invalid_session_board_slot');
      if (!COLORS.includes(cell[key])) fail('invalid_session_board_color');
      if (!configuredColors.has(cell[key])) fail('orphan_session_board_color');
    }
  }
}

export function deriveCanonicalInventory(board, seats) {
  const { colors } = validateSeats(seats);
  validateBoard(board, colors);
  return Object.fromEntries(seats.map(seat => {
    const remaining = {};
    for (const size of SIZES) {
      const used = countPieces(board, seat.color, size);
      if (used > RULES.copiesPerSizePerColor) fail('invalid_session_piece_count');
      remaining[size] = RULES.copiesPerSizePerColor - used;
    }
    return [seat.seatId, remaining];
  }));
}

function validateInventory(inventory, seats, board) {
  requireRecord(inventory, 'invalid_session_inventory');
  const expectedKeys = seats.map(seat => seat.seatId);
  requireExactKeys(inventory, expectedKeys, 'invalid_session_inventory_shape');
  for (const seat of seats) {
    const remaining = requireRecord(inventory[seat.seatId], 'invalid_session_inventory_seat');
    requireExactKeys(remaining, SIZES, 'invalid_session_inventory_seat_shape');
    for (const size of SIZES) requireInteger(remaining[size], 'invalid_session_inventory_count', { min: 0 });
  }
  const derived = deriveCanonicalInventory(board, seats);
  for (const seat of seats) {
    for (const size of SIZES) {
      if (inventory[seat.seatId][size] !== derived[seat.seatId][size]) fail('stale_session_inventory');
    }
  }
}

function validateSeatNumberMap(value, seats, code) {
  requireRecord(value, code);
  requireExactKeys(value, seats.map(seat => seat.seatId), `${code}_shape`);
  for (const seat of seats) requireInteger(value[seat.seatId], `${code}_value`, { min: 0 });
}

function validateVoteMap(value, seats, code) {
  requireRecord(value, code);
  requireExactKeys(value, seats.map(seat => seat.seatId), `${code}_shape`);
  for (const seat of seats) if (typeof value[seat.seatId] !== 'boolean') fail(`${code}_value`);
}

function validateLastMove(value, seatById) {
  if (value === null) return;
  requireRecord(value, 'invalid_session_last_move');
  requireExactKeys(value, ['seatId', 'color', 'cell', 'size'], 'invalid_session_last_move_shape');
  const seatId = requireOpaqueString(value.seatId, 'invalid_session_last_move_seat');
  const seat = seatById.get(seatId);
  if (!seat || seat.color !== value.color) fail('invalid_session_last_move_identity');
  requireInteger(value.cell, 'invalid_session_last_move_cell', { min: 0 });
  if (value.cell >= RULES.cellCount || !SIZES.includes(value.size)) fail('invalid_session_last_move_slot');
}

function validateWinner(value, seatById, code) {
  if (value === null) return;
  requireRecord(value, code);
  requireExactKeys(value, ['seatId', 'color'], `${code}_shape`);
  const seat = seatById.get(requireOpaqueString(value.seatId, `${code}_seat`));
  if (!seat || seat.color !== value.color) fail(`${code}_identity`);
}

function validateMatchWinner(value, seatById) {
  if (value === null) return;
  requireRecord(value, 'invalid_session_match_winner');
  requireExactKeys(value, ['seatId', 'color', 'wins'], 'invalid_session_match_winner_shape');
  const seat = seatById.get(requireOpaqueString(value.seatId, 'invalid_session_match_winner_seat'));
  if (!seat || seat.color !== value.color) fail('invalid_session_match_winner_identity');
  requireInteger(value.wins, 'invalid_session_match_winner_wins', { min: 0 });
}

function validateLifecycle(value) {
  requireRecord(value, 'invalid_session_lifecycle');
  requireExactKeys(
    value,
    ['phase', 'interrupt', 'recoveryTarget', 'presentationGeneration'],
    'invalid_session_lifecycle_shape',
  );
  // THREEJS-060 owns the allowed phase/interrupt vocabulary and transition graph.
  requireOpaqueString(value.phase, 'invalid_session_lifecycle_phase');
  requireOpaqueString(value.interrupt, 'invalid_session_lifecycle_interrupt', { nullable: true });
  requireOpaqueString(value.recoveryTarget, 'invalid_session_lifecycle_recovery_target', { nullable: true });
  requireInteger(value.presentationGeneration, 'invalid_session_presentation_generation', { min: 0 });
}

export function assertCanonicalSessionState(state) {
  requireRecord(state, 'invalid_canonical_session_state');
  requireExactKeys(state, TOP_LEVEL_KEYS, 'invalid_canonical_session_state_shape');
  if (state.schema !== CANONICAL_SESSION_STATE_SCHEMA) fail('unsupported_canonical_session_state_schema');

  requireInteger(state.lobbyGeneration, 'invalid_session_lobby_generation', { min: 0 });
  if (state.targetPlayers !== null && !RULES.playerCounts.includes(state.targetPlayers)) fail('invalid_session_target_players');
  if (state.winsToMatch !== null && !RULES.winsToMatchOptions.includes(state.winsToMatch)) fail('invalid_session_wins_to_match');

  const { seatIds, colors } = validateSeats(state.seats);
  if (state.targetPlayers !== null && state.seats.length > state.targetPlayers) fail('too_many_configured_session_seats');
  validateBoard(state.board, colors);
  validateInventory(state.inventory, state.seats, state.board);

  validateSeatNumberMap(state.scores, state.seats, 'invalid_session_scores');
  validateVoteMap(state.restart, state.seats, 'invalid_session_restart_votes');
  validateVoteMap(state.rematch, state.seats, 'invalid_session_rematch_votes');

  requireInteger(state.round, 'invalid_session_round', { min: 0 });
  requireInteger(state.completedRounds, 'invalid_session_completed_rounds', { min: 0 });
  requireInteger(state.revision, 'invalid_session_revision', { min: 0 });

  if (state.turnIndex === null || state.activeSeatId === null) {
    if (state.turnIndex !== null || state.activeSeatId !== null) fail('invalid_session_active_turn');
  } else {
    requireInteger(state.turnIndex, 'invalid_session_turn_index', { min: 0 });
    if (state.turnIndex >= state.seats.length) fail('invalid_session_turn_index');
    requireOpaqueString(state.activeSeatId, 'invalid_session_active_seat');
    if (state.seats[state.turnIndex]?.seatId !== state.activeSeatId) fail('invalid_session_active_turn');
  }

  requireInteger(state.deadlineAtMs, 'invalid_session_deadline', { nullable: true, min: 0 });
  if (state.deadlineAtMs !== null && state.activeSeatId === null) fail('deadline_without_active_turn');

  const seatById = new Map(state.seats.map(seat => [seat.seatId, seat]));
  validateLastMove(state.lastMove, seatById);

  if (state.skippedSeat === null || state.skipReason === null) {
    if (state.skippedSeat !== null || state.skipReason !== null) fail('invalid_session_skip');
  } else {
    const skipped = requireOpaqueString(state.skippedSeat, 'invalid_session_skipped_seat');
    if (!seatIds.has(skipped)) fail('invalid_session_skipped_seat');
    requireOpaqueString(state.skipReason, 'invalid_session_skip_reason');
  }

  validateWinner(state.winner, seatById, 'invalid_session_winner');
  if (typeof state.draw !== 'boolean') fail('invalid_session_draw');
  if (state.draw && state.winner !== null) fail('winner_and_draw_conflict');
  if (typeof state.matchComplete !== 'boolean') fail('invalid_session_match_complete');
  validateMatchWinner(state.matchWinner, seatById);
  if (!Array.isArray(state.matchWinners)) fail('invalid_session_match_winners');
  const matchWinnerSeats = new Set();
  for (const winner of state.matchWinners) {
    if (winner === null) fail('invalid_session_match_winner');
    validateMatchWinner(winner, seatById);
    if (matchWinnerSeats.has(winner.seatId)) fail('duplicate_session_match_winner');
    matchWinnerSeats.add(winner.seatId);
  }

  validateLifecycle(state.lifecycle);
  return state;
}

export function createCanonicalSessionState({
  lobbyGeneration = 0,
  targetPlayers = null,
  winsToMatch = null,
  seats = [],
  board = emptyBoard(),
  turnIndex = null,
  activeSeatId = null,
  deadlineAtMs = null,
  scores = null,
  round = 0,
  completedRounds = 0,
  lastMove = null,
  skippedSeat = null,
  skipReason = null,
  winner = null,
  draw = false,
  matchComplete = false,
  matchWinner = null,
  matchWinners = [],
  restart = null,
  rematch = null,
  revision = 0,
  lifecycle = {},
} = {}) {
  // Validate semantic types before JSON cloning so Date/Map/class instances cannot
  // be silently coerced into a different canonical value.
  const seatValidation = validateSeats(seats);
  validateBoard(board, seatValidation.colors);
  const defaultScores = seatMap(seats, () => 0);
  const defaultVotes = seatMap(seats, () => false);
  const state = {
    schema: CANONICAL_SESSION_STATE_SCHEMA,
    lobbyGeneration,
    targetPlayers,
    winsToMatch,
    seats,
    board,
    inventory: deriveCanonicalInventory(board, seats),
    turnIndex,
    activeSeatId,
    deadlineAtMs,
    scores: scores === null ? defaultScores : scores,
    round,
    completedRounds,
    lastMove,
    skippedSeat,
    skipReason,
    winner,
    draw,
    matchComplete,
    matchWinner,
    matchWinners,
    restart: restart === null ? { ...defaultVotes } : restart,
    rematch: rematch === null ? { ...defaultVotes } : rematch,
    revision,
    lifecycle: {
      phase: lifecycle.phase ?? 'boot',
      interrupt: lifecycle.interrupt ?? null,
      recoveryTarget: lifecycle.recoveryTarget ?? null,
      presentationGeneration: lifecycle.presentationGeneration ?? 0,
    },
  };
  assertCanonicalSessionState(state);
  return deepFreeze(cloneJson(state));
}

export function serializeCanonicalSessionState(state) {
  assertCanonicalSessionState(state);
  return JSON.stringify(state);
}

export function parseCanonicalSessionState(serialized) {
  if (typeof serialized !== 'string' || !serialized) fail('invalid_serialized_canonical_session_state');
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    fail('invalid_serialized_canonical_session_state');
  }
  assertCanonicalSessionState(parsed);
  return deepFreeze(parsed);
}

// Reducers are pure application functions. They may consume an event/intent but
// cannot own transport, timers, meshes, DOM or animation objects. The boundary
// freezes canonical state/event inputs and accepts only another canonical state.
export function runCanonicalSessionReducer(state, event, reducer) {
  assertCanonicalSessionState(state);
  if (typeof reducer !== 'function') fail('canonical_session_reducer_required');
  const frozenState = deepFreeze(cloneJson(state));
  assertPureJson(event ?? null, 'canonical_reducer_event_not_json');
  const frozenEvent = deepFreeze(cloneJson(event ?? null));
  const before = JSON.stringify(frozenState);
  const next = reducer(frozenState, frozenEvent);
  if (JSON.stringify(frozenState) !== before) fail('canonical_session_reducer_mutated_input');
  assertCanonicalSessionState(next);
  return deepFreeze(cloneJson(next));
}
