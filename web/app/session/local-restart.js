import {
  GAMEPLAY_AUTHORITY_ADAPTERS,
  GAMEPLAY_INTENT_KINDS,
  GAMEPLAY_INTENT_ORIGINS,
  GAMEPLAY_PRESENTATION_SOURCES,
  assertGameplayIntent,
  createGameplayIntent,
} from '../gameplay/gameplay-intent.js';
import {
  RULES,
  SIZES,
  deriveRemainingInventory,
  emptyBoard,
} from '../shared/rules.js';
import { configuredSeatOrderFromState } from '../shared/seat-order.js';
import {
  runCanonicalSessionReducer,
} from './canonical-session-state.js';
import { assertLocalDeadlineAuthority } from './local-turn-deadline.js';
import {
  SESSION_LIFECYCLE_EVENT_TYPES,
  SESSION_LIFECYCLE_PHASES,
  reduceSessionLifecycle,
} from './session-lifecycle.js';
import { beginCommittedLocalRoundTurn } from './round-advance.js';

const CONFIRMATION_SOURCES = new Set([
  GAMEPLAY_PRESENTATION_SOURCES.TAP,
  GAMEPLAY_PRESENTATION_SOURCES.CLICK,
  GAMEPLAY_PRESENTATION_SOURCES.KEYBOARD_CONFIRM,
  GAMEPLAY_PRESENTATION_SOURCES.GAMEPAD_CONFIRM,
]);

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

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function boardIsEmpty(board) {
  return Object.values(board || {}).every(cell => cell && Object.keys(cell).length === 0);
}

function inventoryIsHome(inventory, seats) {
  return seats.every(seat => SIZES.every(
    size => inventory?.[seat.seatId]?.[size] === RULES.copiesPerSizePerColor,
  ));
}

function roundHasCommittedPlacement(state) {
  return state.lastMove !== null || !boardIsEmpty(state.board) || !inventoryIsHome(state.inventory, state.seats);
}

function currentRoundStarterSeatId(state) {
  const order = configuredSeatOrderFromState(state);
  if (!Number.isInteger(state.round) || state.round < 1) fail('invalid_restart_round');
  return order[(state.round - 1) % order.length].seatId;
}

function hostSeatId(state) {
  return configuredSeatOrderFromState(state)[0].seatId;
}

function restartKeyFor(state, intent) {
  return `local-restart:${intent.authority.revision}:${state.round}:${state.lifecycle.presentationGeneration}:${state.deadlineAtMs}:${encodeURIComponent(intent.authority.seat)}`;
}

function assertRestartOpen(state) {
  if (state.matchComplete) fail('match_complete_cannot_restart_round');
  if (state.roundEndRevision !== null || state.winner !== null || state.draw) fail('ended_round_cannot_restart');
  if (state.lifecycle.phase !== SESSION_LIFECYCLE_PHASES.TURN_LOOP) fail('restart_requires_turn_loop');
  if (state.lifecycle.interrupt !== null) fail('restart_requires_uninterrupted_turn');
  if (state.activeSeatId === null) fail('restart_requires_active_seat');
  if (state.deadlineAtMs === null) fail('restart_requires_deadline');
}

function assertRestartRequest(request) {
  requireExactKeys(
    request,
    ['intent', 'round', 'presentationGeneration', 'deadlineAtMs', 'restartKey'],
    'invalid_local_restart_request',
  );
  assertGameplayIntent(request.intent);
  if (request.intent.kind !== GAMEPLAY_INTENT_KINDS.RESTART) fail('invalid_local_restart_intent_kind');
  if (request.intent.origin !== GAMEPLAY_INTENT_ORIGINS.HUMAN) fail('invalid_local_restart_intent_origin');
  if (request.intent.authority.adapter !== GAMEPLAY_AUTHORITY_ADAPTERS.LOCAL) fail('invalid_local_restart_intent_authority');
  if (!CONFIRMATION_SOURCES.has(request.intent.presentation.source)) fail('invalid_local_restart_confirmation_source');
  if (!Number.isInteger(request.round) || request.round < 1) fail('invalid_local_restart_round');
  if (!Number.isInteger(request.presentationGeneration) || request.presentationGeneration < 0) fail('invalid_local_restart_generation');
  if (!Number.isSafeInteger(request.deadlineAtMs) || request.deadlineAtMs < 0) fail('invalid_local_restart_deadline');
  const expectedKey = `local-restart:${request.intent.authority.revision}:${request.round}:${request.presentationGeneration}:${request.deadlineAtMs}:${encodeURIComponent(request.intent.authority.seat)}`;
  if (request.restartKey !== expectedKey) fail('invalid_local_restart_key');
  return request;
}

function requestMatchesState(state, request) {
  return (
    state.lifecycle.phase === SESSION_LIFECYCLE_PHASES.TURN_LOOP &&
    state.lifecycle.interrupt === null &&
    request.intent.authority.revision === state.revision &&
    request.intent.authority.seat === hostSeatId(state) &&
    request.round === state.round &&
    request.presentationGeneration === state.lifecycle.presentationGeneration &&
    request.deadlineAtMs === state.deadlineAtMs
  );
}

export function createLocalRestartRequest(state, {
  isOnlineSeatType,
  source = GAMEPLAY_PRESENTATION_SOURCES.CLICK,
} = {}) {
  assertLocalDeadlineAuthority(state, isOnlineSeatType);
  assertRestartOpen(state);
  if (roundHasCommittedPlacement(state)) fail('restart_after_committed_placement');
  if (!CONFIRMATION_SOURCES.has(source)) fail('restart_confirmation_source_required');

  const intent = createGameplayIntent({
    kind: GAMEPLAY_INTENT_KINDS.RESTART,
    origin: GAMEPLAY_INTENT_ORIGINS.HUMAN,
    seat: hostSeatId(state),
    revision: state.revision,
    payload: {},
    source,
    adapter: GAMEPLAY_AUTHORITY_ADAPTERS.LOCAL,
  });
  return deepFreeze({
    intent,
    round: state.round,
    presentationGeneration: state.lifecycle.presentationGeneration,
    deadlineAtMs: state.deadlineAtMs,
    restartKey: restartKeyFor(state, intent),
  });
}

export function applyAuthoritativeLocalRestart(state, request, {
  confirmed,
  nowMs,
  isOnlineSeatType,
} = {}) {
  assertLocalDeadlineAuthority(state, isOnlineSeatType);
  assertRestartRequest(request);
  if (typeof confirmed !== 'boolean') fail('restart_confirmation_required');
  if (!confirmed) {
    return deepFreeze({
      status: 'not-confirmed',
      applied: false,
      restartKey: request.restartKey,
      nextState: null,
    });
  }

  if (!requestMatchesState(state, request)) {
    return deepFreeze({
      status: 'stale',
      reason: 'authority-witness-changed',
      applied: false,
      restartKey: request.restartKey,
      nextState: null,
    });
  }

  assertRestartOpen(state);
  if (roundHasCommittedPlacement(state)) {
    return deepFreeze({
      status: 'stale',
      reason: 'committed-placement',
      applied: false,
      restartKey: request.restartKey,
      nextState: null,
    });
  }

  const starterSeatId = currentRoundStarterSeatId(state);
  const board = emptyBoard();
  const inventory = deriveRemainingInventory(board, state.seats);
  const clearedVotes = Object.fromEntries(state.seats.map(seat => [seat.seatId, false]));
  const resetLifecycle = reduceSessionLifecycle(state.lifecycle, {
    type: SESSION_LIFECYCLE_EVENT_TYPES.ADVANCE,
    to: SESSION_LIFECYCLE_PHASES.RESET,
    presentationGeneration: state.lifecycle.presentationGeneration,
  });
  const roundReadyLifecycle = reduceSessionLifecycle(resetLifecycle, {
    type: SESSION_LIFECYCLE_EVENT_TYPES.ADVANCE,
    to: SESSION_LIFECYCLE_PHASES.ROUND_READY,
    presentationGeneration: resetLifecycle.presentationGeneration,
  });

  const scoresBefore = JSON.stringify(state.scores);
  const completedRoundsBefore = state.completedRounds;
  const roundReady = runCanonicalSessionReducer(
    state,
    request,
    canonical => ({
      ...canonical,
      board,
      inventory,
      activeSeatId: starterSeatId,
      deadlineAtMs: null,
      roundEndRevision: null,
      lastMove: null,
      skips: [],
      winner: null,
      draw: false,
      matchComplete: false,
      matchWinner: null,
      matchWinners: [],
      restart: { ...clearedVotes },
      rematch: { ...clearedVotes },
      lifecycle: roundReadyLifecycle,
    }),
  );

  if (roundReady.round !== state.round) fail('restart_changed_round_number');
  if (roundReady.completedRounds !== completedRoundsBefore) fail('restart_changed_completed_rounds');
  if (JSON.stringify(roundReady.scores) !== scoresBefore) fail('restart_changed_match_score');
  if (roundReady.revision !== state.revision) fail('restart_changed_revision');

  const nextState = beginCommittedLocalRoundTurn(roundReady, {
    expectedRevision: state.revision,
    nowMs,
    isOnlineSeatType,
  });

  return deepFreeze({
    status: 'applied',
    applied: true,
    restartKey: request.restartKey,
    nextState,
    result: {
      round: nextState.round,
      starterSeatId,
      deadlineAtMs: nextState.deadlineAtMs,
      scores: { ...nextState.scores },
    },
  });
}
