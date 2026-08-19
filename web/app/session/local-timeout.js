import {
  GAMEPLAY_AUTHORITY_ADAPTERS,
  GAMEPLAY_INTENT_KINDS,
  GAMEPLAY_INTENT_ORIGINS,
  GAMEPLAY_PRESENTATION_SOURCES,
  assertGameplayIntent,
  createGameplayIntent,
} from '../gameplay/gameplay-intent.js';
import { selectNextLegalConfiguredSeat } from '../shared/seat-order.js';
import { runCanonicalSessionReducer } from './canonical-session-state.js';
import {
  assertLocalDeadlineAuthority,
  beginAuthoritativeLocalTurnDeadline,
  deriveTurnDeadlineDisplay,
} from './local-turn-deadline.js';

export const LOCAL_TIMEOUT_SKIP_REASON = 'timeout';

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

function timeoutKeyFor(seatId, revision, deadlineAtMs) {
  return `local-timeout:${revision}:${deadlineAtMs}:${encodeURIComponent(seatId)}`;
}

function assertLocalTimeoutAttempt(attempt) {
  requireExactKeys(attempt, ['intent', 'deadlineAtMs', 'timeoutKey'], 'invalid_local_timeout_attempt');
  assertGameplayIntent(attempt.intent);
  if (attempt.intent.kind !== GAMEPLAY_INTENT_KINDS.TIMEOUT) fail('invalid_local_timeout_intent_kind');
  if (attempt.intent.origin !== GAMEPLAY_INTENT_ORIGINS.CLOCK) fail('invalid_local_timeout_intent_origin');
  if (attempt.intent.authority.adapter !== GAMEPLAY_AUTHORITY_ADAPTERS.LOCAL) fail('invalid_local_timeout_intent_authority');
  if (attempt.intent.presentation.source !== GAMEPLAY_PRESENTATION_SOURCES.NONE) fail('invalid_local_timeout_intent_presentation');
  if (!Number.isSafeInteger(attempt.deadlineAtMs) || attempt.deadlineAtMs < 0) fail('invalid_local_timeout_deadline');
  const expectedKey = timeoutKeyFor(
    attempt.intent.authority.seat,
    attempt.intent.authority.revision,
    attempt.deadlineAtMs,
  );
  if (attempt.timeoutKey !== expectedKey) fail('invalid_local_timeout_key');
  return attempt;
}

function assertTurnCanTimeout(state) {
  if (state.lifecycle.phase !== 'turn-loop') fail('local_timeout_requires_turn_loop');
  if (state.lifecycle.interrupt !== null) fail('local_timeout_requires_uninterrupted_turn');
  if (state.activeSeatId === null) fail('local_timeout_requires_active_seat');
  if (state.deadlineAtMs === null) fail('local_timeout_requires_deadline');
}

export function createExpiredLocalTimeoutIntent(state, {
  nowMs,
  isOnlineSeatType,
} = {}) {
  assertLocalDeadlineAuthority(state, isOnlineSeatType);
  assertTurnCanTimeout(state);
  const display = deriveTurnDeadlineDisplay(state, nowMs);
  if (!display.expired) return null;

  const intent = createGameplayIntent({
    kind: GAMEPLAY_INTENT_KINDS.TIMEOUT,
    origin: GAMEPLAY_INTENT_ORIGINS.CLOCK,
    seat: state.activeSeatId,
    revision: state.revision,
    payload: {},
    source: GAMEPLAY_PRESENTATION_SOURCES.NONE,
    adapter: GAMEPLAY_AUTHORITY_ADAPTERS.LOCAL,
  });

  return deepFreeze({
    intent,
    deadlineAtMs: state.deadlineAtMs,
    timeoutKey: timeoutKeyFor(state.activeSeatId, state.revision, state.deadlineAtMs),
  });
}

function attemptMatchesCurrentTurn(state, attempt) {
  return (
    attempt.intent.authority.seat === state.activeSeatId &&
    attempt.intent.authority.revision === state.revision &&
    attempt.deadlineAtMs === state.deadlineAtMs
  );
}

export function applyAuthoritativeLocalTimeout(state, attempt, {
  nowMs,
  isOnlineSeatType,
} = {}) {
  assertLocalDeadlineAuthority(state, isOnlineSeatType);
  assertLocalTimeoutAttempt(attempt);
  assertTurnCanTimeout(state);

  if (!attemptMatchesCurrentTurn(state, attempt)) {
    return deepFreeze({
      status: 'stale',
      applied: false,
      timeoutKey: attempt.timeoutKey,
      intent: attempt.intent,
      nextState: null,
      handoff: null,
    });
  }

  const display = deriveTurnDeadlineDisplay(state, nowMs);
  if (!display.expired) {
    return deepFreeze({
      status: 'not-expired',
      applied: false,
      timeoutKey: attempt.timeoutKey,
      intent: attempt.intent,
      nextState: null,
      handoff: null,
    });
  }

  const fromSeatId = state.activeSeatId;
  const handoff = selectNextLegalConfiguredSeat(state, fromSeatId);

  // THREEJS-051 exclusively owns the draw commit. When every configured seat is
  // blocked, expose the exact shared-rules evidence without mutating timeout/draw
  // state so presentation cannot manufacture a draw by replaying this callback.
  if (handoff.allSeatsBlocked) {
    return deepFreeze({
      status: 'requires-draw-resolution',
      applied: false,
      timeoutKey: attempt.timeoutKey,
      intent: attempt.intent,
      nextState: null,
      handoff: {
        fromSeatId,
        toSeatId: null,
        skips: handoff.skips,
        allSeatsBlocked: true,
      },
    });
  }

  const timeoutSkips = [
    { seatId: fromSeatId, reason: LOCAL_TIMEOUT_SKIP_REASON },
    ...handoff.skips,
  ];

  const handedOff = runCanonicalSessionReducer(
    state,
    attempt,
    canonical => ({
      ...canonical,
      activeSeatId: handoff.nextSeatId,
      deadlineAtMs: null,
      skips: timeoutSkips,
    }),
  );

  const nextState = beginAuthoritativeLocalTurnDeadline(handedOff, {
    nowMs,
    isOnlineSeatType,
  });

  return deepFreeze({
    status: 'applied',
    applied: true,
    timeoutKey: attempt.timeoutKey,
    intent: attempt.intent,
    nextState,
    handoff: {
      fromSeatId,
      toSeatId: handoff.nextSeatId,
      skips: timeoutSkips,
      allSeatsBlocked: false,
    },
  });
}
