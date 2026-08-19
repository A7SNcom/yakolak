import {
  assertCanonicalSessionState,
  runCanonicalSessionReducer,
} from './canonical-session-state.js';

export const LOCAL_TURN_DURATION_MS = 18_000;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function requireWallClockMs(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail('invalid_wall_clock_ms');
  return value;
}

function assertZeroOnlineSeats(state, isOnlineSeatType) {
  if (typeof isOnlineSeatType !== 'function') fail('online_seat_classifier_required');
  for (const seat of state.seats) {
    const result = isOnlineSeatType(seat.type, seat);
    if (typeof result !== 'boolean') fail('online_seat_classifier_must_return_boolean');
    if (result) fail('online_session_not_local_deadline_authority');
  }
}

export function beginAuthoritativeLocalTurnDeadline(state, {
  nowMs,
  isOnlineSeatType,
} = {}) {
  assertCanonicalSessionState(state);
  const now = requireWallClockMs(nowMs);
  assertZeroOnlineSeats(state, isOnlineSeatType);

  if (state.lifecycle.phase !== 'turn-loop') fail('local_deadline_requires_turn_loop');
  if (state.lifecycle.interrupt !== null) fail('local_deadline_requires_uninterrupted_turn');
  if (state.activeSeatId === null) fail('local_deadline_requires_active_seat');
  if (state.deadlineAtMs !== null) fail('local_deadline_already_started');

  const deadlineAtMs = now + LOCAL_TURN_DURATION_MS;
  if (!Number.isSafeInteger(deadlineAtMs)) fail('invalid_local_deadline');

  return runCanonicalSessionReducer(
    state,
    { type: 'local-turn-deadline-begin', nowMs: now },
    canonical => ({ ...canonical, deadlineAtMs }),
  );
}

export function deriveTurnDeadlineDisplay(state, nowMs) {
  assertCanonicalSessionState(state);
  const now = requireWallClockMs(nowMs);
  const deadlineAtMs = state.deadlineAtMs;

  if (deadlineAtMs === null) {
    return Object.freeze({
      deadlineAtMs: null,
      remainingMs: null,
      remainingSeconds: null,
      expired: false,
    });
  }

  const remainingMs = Math.max(0, deadlineAtMs - now);
  return Object.freeze({
    deadlineAtMs,
    remainingMs,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    expired: remainingMs === 0,
  });
}
