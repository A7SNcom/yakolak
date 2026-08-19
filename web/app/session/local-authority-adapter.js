import {
  GAMEPLAY_AUTHORITY_ADAPTERS,
  GAMEPLAY_INTENT_KINDS,
  GAMEPLAY_INTENT_ORIGINS,
  GAMEPLAY_PRESENTATION_SOURCES,
  assertGameplayIntent,
  parseGameplayIntent,
  serializeGameplayIntent,
} from '../gameplay/gameplay-intent.js';
import {
  placePiece,
  validatePlacementForSeat,
  winningOutcomeAfterAcceptedPlacement,
} from '../shared/rules.js';
import { selectNextLegalConfiguredSeat } from '../shared/seat-order.js';
import {
  deriveCanonicalInventory,
  parseCanonicalSessionState,
  runCanonicalSessionReducer,
  serializeCanonicalSessionState,
} from './canonical-session-state.js';
import { commitAuthoritativeDraw } from './draw-resolution.js';
import {
  applyAuthoritativeLocalRestart,
  createLocalRestartRequest,
} from './local-restart.js';
import {
  applyAuthoritativeLocalTimeout,
  createExpiredLocalTimeoutIntent,
} from './local-timeout.js';
import {
  beginAuthoritativeLocalTurnDeadline,
  deriveTurnDeadlineDisplay,
} from './local-turn-deadline.js';
import {
  applyAuthoritativeLocalRematch,
  createLocalRematchRequest,
} from './match-end.js';
import { beginCommittedLocalRoundTurn } from './round-advance.js';
import { commitAuthoritativeRoundWin } from './win-resolution.js';

const MOVE_ORIGINS = new Set([
  GAMEPLAY_INTENT_ORIGINS.HUMAN,
  GAMEPLAY_INTENT_ORIGINS.BOT,
]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function canonicalClone(state) {
  return parseCanonicalSessionState(serializeCanonicalSessionState(state));
}

function intentClone(intent) {
  assertGameplayIntent(intent);
  return parseGameplayIntent(serializeGameplayIntent(intent));
}

function requireNow(clock) {
  const nowMs = clock();
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) fail('invalid_local_authority_clock');
  return nowMs;
}

function assertNoOnlineSeats(state, isOnlineSeatType) {
  if (typeof isOnlineSeatType !== 'function') fail('online_seat_classifier_required');
  for (const seat of state.seats) {
    const online = isOnlineSeatType(seat.type);
    if (typeof online !== 'boolean') fail('online_seat_classifier_must_return_boolean');
    if (online) fail('online_session_not_local_authority');
  }
  return state;
}

function assertSubmitIntent(intent, state) {
  assertGameplayIntent(intent);
  if (intent.authority.adapter !== GAMEPLAY_AUTHORITY_ADAPTERS.LOCAL) {
    fail('local_authority_requires_local_intent');
  }
  if (intent.authority.revision !== state.revision) fail('stale_local_authority_revision');
  if (!state.seats.some(seat => seat.seatId === intent.authority.seat)) fail('intent_seat_not_configured');
  return intent;
}

function advanceAcceptedRevision(state, event) {
  if (!Number.isSafeInteger(state.revision) || state.revision >= Number.MAX_SAFE_INTEGER) {
    fail('local_authority_revision_exhausted');
  }
  return runCanonicalSessionReducer(
    state,
    event,
    canonical => ({ ...canonical, revision: canonical.revision + 1 }),
  );
}

function acceptedResult(intent, state, outcome, details = null) {
  return deepFreeze({
    accepted: true,
    kind: intent.kind,
    revision: state.revision,
    outcome,
    details,
    snapshot: canonicalClone(state),
  });
}

function rejectPlacement(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function assertMoveTurn(state, intent, nowMs) {
  if (!MOVE_ORIGINS.has(intent.origin)) fail('move_intent_origin_not_allowed');
  if (state.lifecycle.phase !== 'turn-loop') fail('move_requires_turn_loop');
  if (state.lifecycle.interrupt !== null) fail('move_requires_uninterrupted_turn');
  if (state.activeSeatId !== intent.authority.seat) fail('move_not_active_seat');
  if (state.deadlineAtMs === null) fail('move_requires_deadline');
  if (deriveTurnDeadlineDisplay(state, nowMs).expired) fail('move_after_deadline');
}

function applyMoveIntent(state, intent, {
  nowMs,
  isOnlineSeatType,
}) {
  assertMoveTurn(state, intent, nowMs);
  const legality = validatePlacementForSeat(state, intent.authority.seat, intent.payload);
  if (!legality.ok) rejectPlacement(legality.code);

  const seat = state.seats.find(candidate => candidate.seatId === intent.authority.seat);
  const board = placePiece(state.board, seat.color, intent.payload);
  const moved = runCanonicalSessionReducer(
    state,
    intent,
    canonical => ({
      ...canonical,
      board,
      inventory: deriveCanonicalInventory(board, canonical.seats),
      deadlineAtMs: null,
      lastMove: {
        seatId: seat.seatId,
        color: seat.color,
        cell: intent.payload.cell,
        size: intent.payload.size,
      },
      skips: [],
    }),
  );

  const win = winningOutcomeAfterAcceptedPlacement(board, seat.color, intent.payload);
  if (win.won) {
    const revised = advanceAcceptedRevision(moved, intent);
    const committed = commitAuthoritativeRoundWin(revised, { expectedRevision: revised.revision });
    return {
      state: committed.state,
      outcome: committed.state.matchComplete ? 'match-win' : 'round-win',
      details: committed.result,
    };
  }

  const handoff = selectNextLegalConfiguredSeat(moved, seat.seatId);
  if (handoff.allSeatsBlocked) {
    const revised = advanceAcceptedRevision(moved, intent);
    const committed = commitAuthoritativeDraw(revised, { expectedRevision: revised.revision });
    return {
      state: committed.state,
      outcome: 'draw',
      details: committed.result,
    };
  }

  const handedOff = runCanonicalSessionReducer(
    moved,
    intent,
    canonical => ({
      ...canonical,
      activeSeatId: handoff.nextSeatId,
      skips: handoff.skips,
    }),
  );
  const withDeadline = beginAuthoritativeLocalTurnDeadline(handedOff, {
    nowMs,
    isOnlineSeatType,
  });
  const revised = advanceAcceptedRevision(withDeadline, intent);
  return {
    state: revised,
    outcome: 'move',
    details: deepFreeze({
      placement: { ...legality.placement },
      handoff: {
        fromSeatId: seat.seatId,
        toSeatId: handoff.nextSeatId,
        skips: handoff.skips,
      },
    }),
  };
}

function sameIntent(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function applyTimeoutIntent(state, intent, {
  nowMs,
  isOnlineSeatType,
}) {
  if (intent.origin !== GAMEPLAY_INTENT_ORIGINS.CLOCK) fail('timeout_intent_origin_not_allowed');
  if (intent.presentation.source !== GAMEPLAY_PRESENTATION_SOURCES.NONE) fail('timeout_intent_presentation_not_allowed');

  const attempt = createExpiredLocalTimeoutIntent(state, { nowMs, isOnlineSeatType });
  if (!attempt) fail('timeout_not_expired');
  if (!sameIntent(attempt.intent, intent)) fail('timeout_intent_not_current');

  const resolved = applyAuthoritativeLocalTimeout(state, attempt, { nowMs, isOnlineSeatType });
  if (resolved.status === 'requires-draw-resolution') {
    const revised = advanceAcceptedRevision(state, intent);
    const committed = commitAuthoritativeDraw(revised, { expectedRevision: revised.revision });
    return {
      state: committed.state,
      outcome: 'draw',
      details: deepFreeze({ timeout: resolved.handoff, draw: committed.result }),
    };
  }
  if (resolved.status !== 'applied' || !resolved.nextState) fail(`timeout_${resolved.status}`);

  return {
    state: advanceAcceptedRevision(resolved.nextState, intent),
    outcome: 'timeout',
    details: resolved.handoff,
  };
}

function applyRestartIntent(state, intent, {
  nowMs,
  isOnlineSeatType,
}) {
  const request = createLocalRestartRequest(state, {
    isOnlineSeatType,
    source: intent.presentation.source,
  });
  if (!sameIntent(request.intent, intent)) fail('restart_intent_not_current');
  const resolved = applyAuthoritativeLocalRestart(state, request, {
    confirmed: true,
    nowMs,
    isOnlineSeatType,
  });
  if (!resolved.applied || !resolved.nextState) fail(`restart_${resolved.status}`);
  return {
    state: advanceAcceptedRevision(resolved.nextState, intent),
    outcome: 'restart',
    details: resolved.result,
  };
}

function applyRematchIntent(state, intent, {
  nowMs,
  isOnlineSeatType,
}) {
  const request = createLocalRematchRequest(state, {
    isOnlineSeatType,
    source: intent.presentation.source,
  });
  if (!sameIntent(request.intent, intent)) fail('rematch_intent_not_current');
  const resolved = applyAuthoritativeLocalRematch(state, request, { isOnlineSeatType });
  if (!resolved.applied || !resolved.nextState) fail(`rematch_${resolved.status}`);

  const started = beginCommittedLocalRoundTurn(resolved.nextState, {
    expectedRevision: state.revision,
    nowMs,
    isOnlineSeatType,
  });
  return {
    state: advanceAcceptedRevision(started, intent),
    outcome: 'rematch',
    details: resolved.result,
  };
}

function primeOwnedDeadline(state, {
  nowMs,
  isOnlineSeatType,
}) {
  if (state.activeSeatId === null || state.deadlineAtMs !== null || state.lifecycle.interrupt !== null) return state;

  if (state.lifecycle.phase === 'round-ready') {
    const started = beginCommittedLocalRoundTurn(state, {
      expectedRevision: state.revision,
      nowMs,
      isOnlineSeatType,
    });
    return advanceAcceptedRevision(started, { type: 'local-authority-prime-round' });
  }
  if (state.lifecycle.phase === 'turn-loop') {
    const started = beginAuthoritativeLocalTurnDeadline(state, { nowMs, isOnlineSeatType });
    return advanceAcceptedRevision(started, { type: 'local-authority-prime-deadline' });
  }
  return state;
}

export function createLocalAuthorityAdapter({
  initialState,
  isOnlineSeatType,
  clock = () => Date.now(),
} = {}) {
  if (typeof clock !== 'function') fail('local_authority_clock_required');
  let ownedState = canonicalClone(initialState);
  assertNoOnlineSeats(ownedState, isOnlineSeatType);
  if (ownedState.activeSeatId !== null && ownedState.deadlineAtMs === null) {
    ownedState = primeOwnedDeadline(ownedState, {
      nowMs: requireNow(clock),
      isOnlineSeatType,
    });
  }

  let submitTail = Promise.resolve();

  async function executeSubmit(intent) {
    assertNoOnlineSeats(ownedState, isOnlineSeatType);
    assertSubmitIntent(intent, ownedState);
    const nowMs = requireNow(clock);
    let resolved;

    if (intent.kind === GAMEPLAY_INTENT_KINDS.MOVE) {
      resolved = applyMoveIntent(ownedState, intent, { nowMs, isOnlineSeatType });
    } else if (intent.kind === GAMEPLAY_INTENT_KINDS.TIMEOUT) {
      resolved = applyTimeoutIntent(ownedState, intent, { nowMs, isOnlineSeatType });
    } else if (intent.kind === GAMEPLAY_INTENT_KINDS.RESTART) {
      resolved = applyRestartIntent(ownedState, intent, { nowMs, isOnlineSeatType });
    } else if (intent.kind === GAMEPLAY_INTENT_KINDS.REMATCH) {
      resolved = applyRematchIntent(ownedState, intent, { nowMs, isOnlineSeatType });
    } else {
      fail('unsupported_local_authority_intent');
    }

    ownedState = canonicalClone(resolved.state);
    return acceptedResult(intent, ownedState, resolved.outcome, resolved.details);
  }

  function submit(intent) {
    let capturedIntent;
    try {
      // Capture an immutable validated value at the call boundary. A caller cannot
      // mutate a queued object after submit() and change what authority executes.
      capturedIntent = intentClone(intent);
    } catch (error) {
      return Promise.reject(error);
    }
    const task = submitTail.then(() => executeSubmit(capturedIntent));
    submitTail = task.then(() => undefined, () => undefined);
    return task;
  }

  function snapshot() {
    return submitTail.then(() => canonicalClone(ownedState));
  }

  // Intentionally expose no `isLocal`, transport, renderer or seat-type branching
  // hints. Remote authority adapters can implement this exact Promise interface.
  return Object.freeze({ snapshot, submit });
}
