import {
  RULES,
  winningOutcomeAfterAcceptedPlacement,
} from '../shared/rules.js';
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
  if (!Number.isInteger(value) || value < 0) fail('invalid_win_revision');
  return value;
}

function requireWinsToMatch(state) {
  if (!RULES.winsToMatchOptions.includes(state.winsToMatch)) fail('win_requires_wins_to_match');
  return state.winsToMatch;
}

function assertNoPreexistingMatchWinner(state, winsToMatch) {
  for (const seat of state.seats) {
    if (state.scores[seat.seatId] >= winsToMatch) fail('match_threshold_already_reached');
  }
}

function proveWinningLastMove(state) {
  const move = state.lastMove;
  if (move === null) fail('winning_move_missing');
  if (state.activeSeatId !== move.seatId) fail('winning_move_not_active_seat');
  const seat = state.seats.find(candidate => candidate.seatId === move.seatId);
  if (!seat || seat.color !== move.color) fail('winning_move_identity_mismatch');

  const outcome = winningOutcomeAfterAcceptedPlacement(
    state.board,
    seat.color,
    { cell: move.cell, size: move.size },
  );
  if (!outcome.won) fail('winning_move_not_proven');
  return { seat, move, outcome };
}

export function commitAuthoritativeRoundWin(state, {
  expectedRevision,
} = {}) {
  assertCanonicalSessionState(state);
  const revision = requireRevision(expectedRevision);
  if (revision !== state.revision) fail('stale_win_revision');
  if (state.draw || state.winner !== null || state.roundEndRevision !== null) fail('round_already_ended');
  if (state.matchComplete) fail('match_already_complete');
  if (state.lifecycle.phase !== SESSION_LIFECYCLE_PHASES.TURN_LOOP) fail('win_requires_turn_loop');
  if (state.lifecycle.interrupt !== null) fail('win_requires_uninterrupted_transition');

  const winsToMatch = requireWinsToMatch(state);
  assertNoPreexistingMatchWinner(state, winsToMatch);
  const { seat, outcome } = proveWinningLastMove(state);

  const scores = { ...state.scores };
  const oldScore = scores[seat.seatId];
  scores[seat.seatId] = oldScore + 1;
  const winningScore = scores[seat.seatId];
  const matchComplete = winningScore >= winsToMatch;
  const matchWinner = matchComplete
    ? { seatId: seat.seatId, color: seat.color, wins: winningScore }
    : null;

  const nextLifecycle = reduceSessionLifecycle(state.lifecycle, {
    type: SESSION_LIFECYCLE_EVENT_TYPES.ADVANCE,
    to: SESSION_LIFECYCLE_PHASES.WIN,
    presentationGeneration: state.lifecycle.presentationGeneration,
  });

  const nextState = runCanonicalSessionReducer(
    state,
    { type: 'authoritative-round-win', expectedRevision: revision },
    canonical => ({
      ...canonical,
      activeSeatId: null,
      deadlineAtMs: null,
      scores,
      completedRounds: canonical.completedRounds + 1,
      roundEndRevision: canonical.revision,
      winner: { seatId: seat.seatId, color: seat.color },
      draw: false,
      matchComplete,
      matchWinner,
      matchWinners: matchWinner ? [matchWinner] : [],
      lifecycle: nextLifecycle,
    }),
  );

  for (const configuredSeat of state.seats) {
    const delta = nextState.scores[configuredSeat.seatId] - state.scores[configuredSeat.seatId];
    if (configuredSeat.seatId === seat.seatId) {
      if (delta !== 1) fail('winning_score_delta_invalid');
    } else if (delta !== 0) {
      fail('nonwinning_score_changed');
    }
  }
  if (nextState.revision !== revision) fail('win_revision_changed');
  if (nextState.matchComplete !== (nextState.scores[seat.seatId] >= winsToMatch)) {
    fail('wins_to_match_completion_mismatch');
  }

  return deepFreeze({
    state: nextState,
    result: {
      type: 'win',
      winner: { ...nextState.winner },
      endRevision: nextState.roundEndRevision,
      scores: { ...nextState.scores },
      matchComplete: nextState.matchComplete,
      matchWinner: nextState.matchWinner ? { ...nextState.matchWinner } : null,
      patterns: outcome.patterns,
      winningSlots: outcome.winningSlots,
    },
  });
}

export function canonicalWinResult(state) {
  assertCanonicalSessionState(state);
  if (state.draw || state.winner === null) fail('canonical_state_is_not_win');
  if (state.lifecycle.phase !== SESSION_LIFECYCLE_PHASES.WIN) fail('canonical_win_lifecycle_mismatch');
  if (state.roundEndRevision === null) fail('canonical_win_missing_end_revision');

  const winsToMatch = requireWinsToMatch(state);
  const thresholdSeats = state.seats.filter(seat => state.scores[seat.seatId] >= winsToMatch);
  const winnerScore = state.scores[state.winner.seatId];

  if (state.matchComplete) {
    if (thresholdSeats.length !== 1 || thresholdSeats[0].seatId !== state.winner.seatId) {
      fail('canonical_match_threshold_mismatch');
    }
    if (!state.matchWinner || state.matchWinner.seatId !== state.winner.seatId) {
      fail('canonical_match_winner_mismatch');
    }
    if (state.matchWinner.color !== state.winner.color || state.matchWinner.wins !== winnerScore) {
      fail('canonical_match_winner_score_mismatch');
    }
    if (state.matchWinners.length !== 1) fail('canonical_match_winners_mismatch');
    const [listedWinner] = state.matchWinners;
    if (
      listedWinner.seatId !== state.matchWinner.seatId ||
      listedWinner.color !== state.matchWinner.color ||
      listedWinner.wins !== state.matchWinner.wins
    ) fail('canonical_match_winners_mismatch');
  } else {
    if (thresholdSeats.length !== 0) fail('canonical_unfinished_match_reached_threshold');
    if (state.matchWinner !== null || state.matchWinners.length !== 0) {
      fail('canonical_unfinished_match_has_winner');
    }
  }

  return deepFreeze({
    type: 'win',
    winner: { ...state.winner },
    endRevision: state.roundEndRevision,
    scores: { ...state.scores },
    matchComplete: state.matchComplete,
    matchWinner: state.matchWinner ? { ...state.matchWinner } : null,
  });
}
