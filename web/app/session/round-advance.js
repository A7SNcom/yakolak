import {
  SIZES,
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
import { beginAuthoritativeLocalTurnDeadline } from './local-turn-deadline.js';

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
  if (!Number.isInteger(value) || value < 0) fail('invalid_round_advance_revision');
  return value;
}

function clearedVotes(seats) {
  return Object.fromEntries(seats.map(seat => [seat.seatId, false]));
}

function boardIsEmpty(board) {
  return Object.values(board || {}).every(cell => cell && Object.keys(cell).length === 0);
}

function inventoryIsHome(inventory, seats) {
  return seats.every(seat => SIZES.every(size => inventory?.[seat.seatId]?.[size] === 3));
}

export function deriveNextRoundStarter(state) {
  assertCanonicalSessionState(state);
  if (!Number.isInteger(state.round) || state.round < 1) fail('invalid_current_round');
  const order = configuredSeatOrderFromState(state);
  if (order.length < 2) fail('insufficient_configured_seats');
  return order[state.round % order.length].seatId;
}

export function advanceCanonicalRound(state, {
  expectedRevision,
} = {}) {
  assertCanonicalSessionState(state);
  const revision = requireRevision(expectedRevision);
  if (revision !== state.revision) fail('stale_round_advance_revision');
  if (state.matchComplete) fail('match_complete_cannot_advance_round');
  if (state.roundEndRevision === null) fail('round_not_ended');
  if (state.activeSeatId !== null || state.deadlineAtMs !== null) fail('ended_round_has_active_turn');

  const endedAsWin = state.winner !== null && state.draw === false;
  const endedAsDraw = state.winner === null && state.draw === true;
  if (!endedAsWin && !endedAsDraw) fail('round_result_missing');
  const expectedPhase = endedAsWin ? SESSION_LIFECYCLE_PHASES.WIN : SESSION_LIFECYCLE_PHASES.DRAW;
  if (state.lifecycle.phase !== expectedPhase) fail('round_result_lifecycle_mismatch');
  if (state.lifecycle.interrupt !== null) fail('round_advance_requires_uninterrupted_state');

  const starterSeatId = deriveNextRoundStarter(state);
  const board = emptyBoard();
  const inventory = deriveRemainingInventory(board, state.seats);
  const votes = clearedVotes(state.seats);

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

  const scoreSnapshot = JSON.stringify(state.scores);
  const nextState = runCanonicalSessionReducer(
    state,
    { type: 'advance-round', expectedRevision: revision },
    canonical => ({
      ...canonical,
      board,
      inventory,
      activeSeatId: starterSeatId,
      deadlineAtMs: null,
      round: canonical.round + 1,
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
      lifecycle: roundReadyLifecycle,
    }),
  );

  if (nextState.round !== state.round + 1) fail('round_advance_increment_mismatch');
  if (nextState.revision !== revision) fail('round_advance_revision_changed');
  if (JSON.stringify(nextState.scores) !== scoreSnapshot) fail('round_advance_score_changed');
  if (!boardIsEmpty(nextState.board) || !inventoryIsHome(nextState.inventory, nextState.seats)) {
    fail('round_advance_piece_reset_failed');
  }

  return deepFreeze({
    state: nextState,
    result: {
      round: nextState.round,
      starterSeatId,
      revision: nextState.revision,
      scores: { ...nextState.scores },
    },
  });
}

// Local authority starts the clock only after it has accepted/committed the pure
// round-ready state above. Online authority must use its later server deadline path.
export function beginCommittedLocalRoundTurn(state, {
  expectedRevision,
  nowMs,
  isOnlineSeatType,
} = {}) {
  assertCanonicalSessionState(state);
  const revision = requireRevision(expectedRevision);
  if (revision !== state.revision) fail('stale_round_start_revision');
  if (state.lifecycle.phase !== SESSION_LIFECYCLE_PHASES.ROUND_READY) fail('round_start_requires_round_ready');
  if (state.lifecycle.interrupt !== null) fail('round_start_requires_uninterrupted_state');
  if (state.roundEndRevision !== null) fail('round_start_has_end_revision');
  if (state.activeSeatId === null) fail('round_start_requires_starter');
  if (state.deadlineAtMs !== null) fail('round_start_deadline_already_present');
  if (!boardIsEmpty(state.board) || !inventoryIsHome(state.inventory, state.seats)) fail('round_start_requires_home_pieces');

  const turnLoopLifecycle = reduceSessionLifecycle(state.lifecycle, {
    type: SESSION_LIFECYCLE_EVENT_TYPES.ADVANCE,
    to: SESSION_LIFECYCLE_PHASES.TURN_LOOP,
    presentationGeneration: state.lifecycle.presentationGeneration,
  });
  const committedTurn = runCanonicalSessionReducer(
    state,
    { type: 'begin-committed-local-round', expectedRevision: revision },
    canonical => ({ ...canonical, lifecycle: turnLoopLifecycle }),
  );

  return beginAuthoritativeLocalTurnDeadline(committedTurn, {
    nowMs,
    isOnlineSeatType,
  });
}
