import {
  hasLegalMove,
  winningPatterns,
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

function requireRevision(value) {
  if (!Number.isInteger(value) || value < 0) fail('invalid_draw_revision');
  return value;
}

export function proveCanonicalDraw(state) {
  assertCanonicalSessionState(state);
  const configuredSeats = configuredSeatOrderFromState(state);
  const seats = configuredSeats.map(seat => {
    const patterns = winningPatterns(state.board, seat.color);
    return {
      seatId: seat.seatId,
      color: seat.color,
      hasLegalMove: hasLegalMove(state.board, seat.color),
      winningPatternCount: patterns.length,
    };
  });

  const allSeatsBlocked = seats.every(seat => !seat.hasLegalMove);
  const hasWinningPattern = seats.some(seat => seat.winningPatternCount > 0);
  return deepFreeze({
    allSeatsBlocked,
    hasWinningPattern,
    isDraw: allSeatsBlocked && !hasWinningPattern,
    seats,
  });
}

export function commitAuthoritativeDraw(state, {
  expectedRevision,
} = {}) {
  assertCanonicalSessionState(state);
  const revision = requireRevision(expectedRevision);
  if (revision !== state.revision) fail('stale_draw_revision');
  if (state.lifecycle.phase !== SESSION_LIFECYCLE_PHASES.TURN_LOOP) fail('draw_requires_turn_loop');
  if (state.lifecycle.interrupt !== null) fail('draw_requires_uninterrupted_transition');
  if (state.draw || state.winner !== null || state.roundEndRevision !== null) fail('round_already_ended');
  if (state.matchComplete) fail('match_already_complete');

  const proof = proveCanonicalDraw(state);
  if (proof.hasWinningPattern) fail('draw_superseded_by_win');
  if (!proof.allSeatsBlocked) fail('draw_not_proven');

  const scoreSnapshot = JSON.stringify(state.scores);
  const noMoveSkips = proof.seats.map(seat => ({ seatId: seat.seatId, reason: 'no_legal_move' }));
  const nextLifecycle = reduceSessionLifecycle(state.lifecycle, {
    type: SESSION_LIFECYCLE_EVENT_TYPES.ADVANCE,
    to: SESSION_LIFECYCLE_PHASES.DRAW,
    presentationGeneration: state.lifecycle.presentationGeneration,
  });

  const nextState = runCanonicalSessionReducer(
    state,
    { type: 'authoritative-draw', expectedRevision: revision },
    canonical => ({
      ...canonical,
      activeSeatId: null,
      deadlineAtMs: null,
      completedRounds: canonical.completedRounds + 1,
      roundEndRevision: canonical.revision,
      skips: noMoveSkips,
      winner: null,
      draw: true,
      matchComplete: false,
      matchWinner: null,
      matchWinners: [],
      lifecycle: nextLifecycle,
    }),
  );

  if (JSON.stringify(nextState.scores) !== scoreSnapshot) fail('draw_score_changed');
  if (nextState.revision !== revision) fail('draw_revision_changed');

  return deepFreeze({
    state: nextState,
    result: {
      type: 'draw',
      endRevision: nextState.roundEndRevision,
      scores: { ...nextState.scores },
    },
    proof,
  });
}

export function canonicalDrawResult(state) {
  assertCanonicalSessionState(state);
  if (!state.draw || state.winner !== null) fail('canonical_state_is_not_draw');
  if (state.lifecycle.phase !== SESSION_LIFECYCLE_PHASES.DRAW) fail('canonical_draw_lifecycle_mismatch');
  if (state.roundEndRevision === null) fail('canonical_draw_missing_end_revision');
  return deepFreeze({
    type: 'draw',
    endRevision: state.roundEndRevision,
    scores: { ...state.scores },
  });
}
