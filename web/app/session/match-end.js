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
  deriveRemainingInventory,
  emptyBoard,
} from '../shared/rules.js';
import { configuredSeatOrderFromState } from '../shared/seat-order.js';
import {
  assertCanonicalSessionState,
  runCanonicalSessionReducer,
} from './canonical-session-state.js';
import {
  SESSION_LIFECYCLE_EVENT_TYPES,
  SESSION_LIFECYCLE_PHASES,
  reduceSessionLifecycle,
} from './session-lifecycle.js';
import { canonicalWinResult } from './win-resolution.js';

const ACTION_SOURCES = new Set([
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

function requireRevision(value, code) {
  if (!Number.isInteger(value) || value < 0) fail(code);
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function hostSeatId(state) {
  return configuredSeatOrderFromState(state)[0].seatId;
}

function clearedVotes(seats) {
  return Object.fromEntries(seats.map(seat => [seat.seatId, false]));
}

function assertLocalMatchActionAuthority(state, isOnlineSeatType) {
  assertCanonicalSessionState(state);
  if (typeof isOnlineSeatType !== 'function') fail('online_seat_classifier_required');
  for (const seat of state.seats) {
    const online = isOnlineSeatType(seat.type);
    if (typeof online !== 'boolean') fail('online_seat_classifier_must_return_boolean');
    if (online) fail('online_session_not_local_match_action_authority');
  }
  return state;
}

function matchEndWitnessKey(kind, state, authoritySeatId) {
  return `${kind}:${state.revision}:${state.roundEndRevision}:${state.lifecycle.presentationGeneration}:${encodeURIComponent(authoritySeatId)}`;
}

function assertPersistedMatchWinner(state) {
  if (!RULES.winsToMatchOptions.includes(state.winsToMatch)) fail('match_end_wins_to_match_missing');
  if (!state.matchComplete || !state.matchWinner || state.winner === null || state.draw) fail('match_end_result_missing');
  if (state.roundEndRevision === null) fail('match_end_revision_missing');

  const winnerSeat = state.seats.find(seat => seat.seatId === state.winner.seatId);
  if (!winnerSeat || winnerSeat.color !== state.winner.color) fail('match_end_winner_identity_mismatch');
  if (state.matchWinner.seatId !== state.winner.seatId || state.matchWinner.color !== state.winner.color) {
    fail('match_end_match_winner_mismatch');
  }
  const winnerScore = state.scores[state.winner.seatId];
  if (winnerScore < state.winsToMatch || state.matchWinner.wins !== winnerScore) fail('match_end_score_mismatch');
  if (state.matchWinners.length !== 1) fail('match_end_match_winners_mismatch');
  const [listed] = state.matchWinners;
  if (
    listed.seatId !== state.matchWinner.seatId ||
    listed.color !== state.matchWinner.color ||
    listed.wins !== state.matchWinner.wins
  ) fail('match_end_match_winners_mismatch');

  for (const seat of state.seats) {
    if (seat.seatId !== state.winner.seatId && state.scores[seat.seatId] >= state.winsToMatch) {
      fail('match_end_multiple_threshold_seats');
    }
  }
  return state.matchWinner;
}

function assertMatchEndState(state) {
  if (state.lifecycle.phase !== SESSION_LIFECYCLE_PHASES.MATCH_END) fail('action_requires_match_end');
  if (state.lifecycle.interrupt !== null) fail('match_end_action_requires_uninterrupted_state');
  if (state.activeSeatId !== null || state.deadlineAtMs !== null) fail('match_end_has_active_turn');
  return assertPersistedMatchWinner(state);
}

function createFreshMatchState(state, lifecycle) {
  const board = emptyBoard();
  const inventory = deriveRemainingInventory(board, state.seats);
  const scores = Object.fromEntries(state.seats.map(seat => [seat.seatId, 0]));
  const votes = clearedVotes(state.seats);
  const starterSeatId = configuredSeatOrderFromState(state)[0].seatId;
  return {
    ...state,
    board,
    inventory,
    activeSeatId: starterSeatId,
    deadlineAtMs: null,
    scores,
    round: 1,
    completedRounds: 0,
    roundEndRevision: null,
    lastMove: null,
    skips: [],
    winner: null,
    draw: false,
    matchComplete: false,
    matchWinner: null,
    matchWinners: [],
    restart: { ...votes },
    rematch: { ...votes },
    lifecycle,
  };
}

function createSetupState(state, lifecycle) {
  const board = emptyBoard();
  return {
    ...state,
    lobbyGeneration: state.lobbyGeneration + 1,
    preferredColor: null,
    targetPlayers: null,
    winsToMatch: null,
    seats: [],
    board,
    inventory: deriveRemainingInventory(board, []),
    activeSeatId: null,
    deadlineAtMs: null,
    scores: {},
    round: 0,
    completedRounds: 0,
    roundEndRevision: null,
    lastMove: null,
    skips: [],
    winner: null,
    draw: false,
    matchComplete: false,
    matchWinner: null,
    matchWinners: [],
    restart: {},
    rematch: {},
    lifecycle,
  };
}

export function commitCanonicalMatchEnd(state, {
  expectedRevision,
} = {}) {
  assertCanonicalSessionState(state);
  const revision = requireRevision(expectedRevision, 'invalid_match_end_revision');
  if (revision !== state.revision) fail('stale_match_end_revision');
  if (state.lifecycle.phase === SESSION_LIFECYCLE_PHASES.MATCH_END) fail('match_end_already_committed');
  if (state.lifecycle.phase !== SESSION_LIFECYCLE_PHASES.WIN) fail('match_end_requires_win');
  if (state.lifecycle.interrupt !== null) fail('match_end_requires_uninterrupted_state');
  if (!state.matchComplete) fail('match_not_complete');
  const win = canonicalWinResult(state);
  if (!win.matchComplete || !win.matchWinner) fail('match_winner_missing');

  const resetLifecycle = reduceSessionLifecycle(state.lifecycle, {
    type: SESSION_LIFECYCLE_EVENT_TYPES.ADVANCE,
    to: SESSION_LIFECYCLE_PHASES.RESET,
    presentationGeneration: state.lifecycle.presentationGeneration,
  });
  const matchEndLifecycle = reduceSessionLifecycle(resetLifecycle, {
    type: SESSION_LIFECYCLE_EVENT_TYPES.ADVANCE,
    to: SESSION_LIFECYCLE_PHASES.MATCH_END,
    presentationGeneration: resetLifecycle.presentationGeneration,
  });
  const nextState = runCanonicalSessionReducer(
    state,
    { type: 'commit-match-end', expectedRevision: revision },
    canonical => ({ ...canonical, lifecycle: matchEndLifecycle }),
  );
  assertPersistedMatchWinner(nextState);

  return deepFreeze({
    state: nextState,
    result: {
      type: 'match-end',
      winner: { ...nextState.matchWinner },
      scores: { ...nextState.scores },
      roundEndRevision: nextState.roundEndRevision,
      revision: nextState.revision,
    },
  });
}

export function createLocalRematchRequest(state, {
  source = GAMEPLAY_PRESENTATION_SOURCES.CLICK,
  isOnlineSeatType,
} = {}) {
  assertLocalMatchActionAuthority(state, isOnlineSeatType);
  assertMatchEndState(state);
  if (!ACTION_SOURCES.has(source)) fail('rematch_action_source_required');
  const seatId = hostSeatId(state);
  const intent = createGameplayIntent({
    kind: GAMEPLAY_INTENT_KINDS.REMATCH,
    origin: GAMEPLAY_INTENT_ORIGINS.HUMAN,
    seat: seatId,
    revision: state.revision,
    payload: {},
    source,
    adapter: GAMEPLAY_AUTHORITY_ADAPTERS.LOCAL,
  });
  return deepFreeze({
    intent,
    roundEndRevision: state.roundEndRevision,
    presentationGeneration: state.lifecycle.presentationGeneration,
    rematchKey: matchEndWitnessKey('local-rematch', state, seatId),
  });
}

function assertRematchRequest(request) {
  requireExactKeys(
    request,
    ['intent', 'roundEndRevision', 'presentationGeneration', 'rematchKey'],
    'invalid_local_rematch_request',
  );
  assertGameplayIntent(request.intent);
  if (request.intent.kind !== GAMEPLAY_INTENT_KINDS.REMATCH) fail('invalid_local_rematch_intent_kind');
  if (request.intent.origin !== GAMEPLAY_INTENT_ORIGINS.HUMAN) fail('invalid_local_rematch_intent_origin');
  if (request.intent.authority.adapter !== GAMEPLAY_AUTHORITY_ADAPTERS.LOCAL) fail('invalid_local_rematch_intent_authority');
  if (!ACTION_SOURCES.has(request.intent.presentation.source)) fail('invalid_local_rematch_source');
  requireRevision(request.roundEndRevision, 'invalid_local_rematch_end_revision');
  requireRevision(request.presentationGeneration, 'invalid_local_rematch_generation');
  if (typeof request.rematchKey !== 'string' || !request.rematchKey) fail('invalid_local_rematch_key');
}

function rematchMatchesState(state, request) {
  if (state.lifecycle.phase !== SESSION_LIFECYCLE_PHASES.MATCH_END || state.lifecycle.interrupt !== null) return false;
  const seatId = hostSeatId(state);
  return (
    request.intent.authority.seat === seatId &&
    request.intent.authority.revision === state.revision &&
    request.roundEndRevision === state.roundEndRevision &&
    request.presentationGeneration === state.lifecycle.presentationGeneration &&
    request.rematchKey === matchEndWitnessKey('local-rematch', state, seatId)
  );
}

export function applyAuthoritativeLocalRematch(state, request, {
  isOnlineSeatType,
} = {}) {
  assertLocalMatchActionAuthority(state, isOnlineSeatType);
  assertRematchRequest(request);
  if (!rematchMatchesState(state, request)) {
    return deepFreeze({ status: 'stale', applied: false, rematchKey: request.rematchKey, nextState: null });
  }
  assertMatchEndState(state);

  const lifecycle = reduceSessionLifecycle(state.lifecycle, {
    type: SESSION_LIFECYCLE_EVENT_TYPES.ADVANCE,
    to: SESSION_LIFECYCLE_PHASES.ROUND_READY,
    presentationGeneration: state.lifecycle.presentationGeneration,
  });
  const nextState = runCanonicalSessionReducer(
    state,
    request,
    canonical => createFreshMatchState(canonical, lifecycle),
  );

  return deepFreeze({
    status: 'applied',
    applied: true,
    rematchKey: request.rematchKey,
    nextState,
    result: {
      round: 1,
      starterSeatId: nextState.activeSeatId,
      scores: { ...nextState.scores },
      revision: nextState.revision,
    },
  });
}

export function createReturnToSetupRequest(state, {
  source = GAMEPLAY_PRESENTATION_SOURCES.CLICK,
  isOnlineSeatType,
} = {}) {
  assertLocalMatchActionAuthority(state, isOnlineSeatType);
  assertMatchEndState(state);
  if (!ACTION_SOURCES.has(source)) fail('return_setup_action_source_required');
  const seatId = hostSeatId(state);
  return deepFreeze({
    type: 'return-to-setup',
    authoritySeatId: seatId,
    revision: state.revision,
    roundEndRevision: state.roundEndRevision,
    presentationGeneration: state.lifecycle.presentationGeneration,
    source,
    actionKey: matchEndWitnessKey('return-to-setup', state, seatId),
  });
}

function assertReturnToSetupRequest(request) {
  requireExactKeys(
    request,
    ['type', 'authoritySeatId', 'revision', 'roundEndRevision', 'presentationGeneration', 'source', 'actionKey'],
    'invalid_return_setup_request',
  );
  if (request.type !== 'return-to-setup') fail('invalid_return_setup_type');
  if (typeof request.authoritySeatId !== 'string' || !request.authoritySeatId) fail('invalid_return_setup_authority_seat');
  requireRevision(request.revision, 'invalid_return_setup_revision');
  requireRevision(request.roundEndRevision, 'invalid_return_setup_end_revision');
  requireRevision(request.presentationGeneration, 'invalid_return_setup_generation');
  if (!ACTION_SOURCES.has(request.source)) fail('invalid_return_setup_source');
  if (typeof request.actionKey !== 'string' || !request.actionKey) fail('invalid_return_setup_key');
}

function returnSetupMatchesState(state, request) {
  if (state.lifecycle.phase !== SESSION_LIFECYCLE_PHASES.MATCH_END || state.lifecycle.interrupt !== null) return false;
  const seatId = hostSeatId(state);
  return (
    request.authoritySeatId === seatId &&
    request.revision === state.revision &&
    request.roundEndRevision === state.roundEndRevision &&
    request.presentationGeneration === state.lifecycle.presentationGeneration &&
    request.actionKey === matchEndWitnessKey('return-to-setup', state, seatId)
  );
}

export function applyAuthoritativeReturnToSetup(state, request, {
  isOnlineSeatType,
} = {}) {
  assertLocalMatchActionAuthority(state, isOnlineSeatType);
  assertReturnToSetupRequest(request);
  if (!returnSetupMatchesState(state, request)) {
    return deepFreeze({ status: 'stale', applied: false, actionKey: request.actionKey, nextState: null });
  }
  assertMatchEndState(state);

  const lifecycle = reduceSessionLifecycle(state.lifecycle, {
    type: SESSION_LIFECYCLE_EVENT_TYPES.ADVANCE,
    to: SESSION_LIFECYCLE_PHASES.SETUP,
    presentationGeneration: state.lifecycle.presentationGeneration,
  });
  const nextState = runCanonicalSessionReducer(
    state,
    request,
    canonical => createSetupState(canonical, lifecycle),
  );

  return deepFreeze({
    status: 'applied',
    applied: true,
    actionKey: request.actionKey,
    nextState,
    result: {
      lifecycle: nextState.lifecycle.phase,
      lobbyGeneration: nextState.lobbyGeneration,
      revision: nextState.revision,
    },
  });
}
