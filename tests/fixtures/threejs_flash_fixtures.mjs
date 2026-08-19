import {
  GAMEPLAY_AUTHORITY_ADAPTERS,
  GAMEPLAY_INTENT_KINDS,
  GAMEPLAY_INTENT_ORIGINS,
  GAMEPLAY_PRESENTATION_SOURCES,
  createGameplayIntent,
} from '../../web/app/gameplay/gameplay-intent.js';
import {
  RULES,
  SIZES,
  emptyBoard,
  hasLegalMove,
  placePiece,
  validatePlacementForSeat,
  winningPatterns,
} from '../../web/app/shared/rules.js';
import { configuredSeatOrder } from '../../web/app/shared/seat-order.js';
import { applyMoveTransition } from '../../web/app/shared/transitions.js';
import {
  createCanonicalSessionState,
  parseCanonicalSessionState,
  runCanonicalSessionReducer,
  serializeCanonicalSessionState,
} from '../../web/app/session/canonical-session-state.js';
import { createLocalAuthorityAdapter } from '../../web/app/session/local-authority-adapter.js';
import { createExpiredLocalTimeoutIntent } from '../../web/app/session/local-timeout.js';
import { commitCanonicalMatchEnd } from '../../web/app/session/match-end.js';
import {
  SESSION_LIFECYCLE_EVENT_TYPES,
  SESSION_LIFECYCLE_INTERRUPTS,
  SESSION_LIFECYCLE_PHASES,
  reduceSessionLifecycle,
} from '../../web/app/session/session-lifecycle.js';

export const FLASH_DIAGNOSTIC_SCHEMA = 'yakolak.flash-diagnostic/v1';
export const FLASH_DIAGNOSTIC_LABEL = 'FLASH DIAGNOSTIC — NOT A LIVE ROOM';

export const FLASH_DIAGNOSTIC_CONTRACT = Object.freeze({
  schema: FLASH_DIAGNOSTIC_SCHEMA,
  label: FLASH_DIAGNOSTIC_LABEL,
  diagnosticOnly: true,
  authoritativeOnline: false,
  networkCapability: 'none',
  persistenceCapability: 'none',
  roomMutationCapability: 'none',
  productionUiEntryPoint: false,
  pagesArtifactAllowed: false,
});

const FIXED_NOW_MS = 10_000;
const FIXED_DEADLINE_MS = 20_000;
const isOnlineSeatType = type => type === 'online';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function diagnosticEnvelope(name, payload) {
  return deepFreeze({
    schema: FLASH_DIAGNOSTIC_SCHEMA,
    label: FLASH_DIAGNOSTIC_LABEL,
    diagnosticOnly: true,
    authoritativeOnline: false,
    networkCapability: 'none',
    roomMutationCapability: 'none',
    name,
    payload,
  });
}

function seatsFor(count, preferredColor = 'marble') {
  return configuredSeatOrder(preferredColor, count).map((slot, index) => ({
    seatId: slot.seatId,
    type: index === 0 ? 'human' : 'computer',
    color: slot.color,
    ready: true,
  }));
}

function scoreMap(seats, overrides = {}) {
  return Object.fromEntries(seats.map(seat => [seat.seatId, Number(overrides[seat.seatId] || 0)]));
}

function createTurnState({
  playerCount = 2,
  preferredColor = 'marble',
  winsToMatch = 3,
  board = emptyBoard(),
  activeSeatId = null,
  deadlineAtMs = FIXED_DEADLINE_MS,
  scores = null,
  round = 1,
  completedRounds = 0,
  revision = 0,
  presentationGeneration = 0,
  lastMove = null,
} = {}) {
  const seats = seatsFor(playerCount, preferredColor);
  const active = activeSeatId || seats[0].seatId;
  return createCanonicalSessionState({
    preferredColor,
    targetPlayers: playerCount,
    winsToMatch,
    seats,
    board,
    activeSeatId: active,
    deadlineAtMs,
    scores: scores || scoreMap(seats),
    round,
    completedRounds,
    revision,
    lastMove,
    lifecycle: {
      phase: SESSION_LIFECYCLE_PHASES.TURN_LOOP,
      presentationGeneration,
    },
  });
}

function buildBoard(placements) {
  let board = emptyBoard();
  for (const placement of placements) {
    board = placePiece(board, placement.color, {
      cell: placement.cell,
      size: placement.size,
    });
  }
  return board;
}

// Fixture data only. Legality, stock, win/draw detection and transitions are always
// delegated to the shared THREEJS-044/046 modules above; these rows encode one known
// no-win exhausted arrangement and are not a copied rules engine.
const DRAW_PLACEMENTS = Object.freeze([
  ...[2, 5, 6].map(cell => ({ color: 'marble', size: 'small', cell })),
  ...[1, 3, 7].map(cell => ({ color: 'blue', size: 'small', cell })),
  ...[1, 5, 8].map(cell => ({ color: 'marble', size: 'medium', cell })),
  ...[3, 4, 7].map(cell => ({ color: 'blue', size: 'medium', cell })),
  ...[1, 3, 7].map(cell => ({ color: 'marble', size: 'large', cell })),
  ...[0, 2, 4].map(cell => ({ color: 'blue', size: 'large', cell })),
]);

function createLocalMoveIntent(state, move) {
  return createGameplayIntent({
    kind: GAMEPLAY_INTENT_KINDS.MOVE,
    origin: GAMEPLAY_INTENT_ORIGINS.HUMAN,
    seat: state.activeSeatId,
    revision: state.revision,
    payload: move,
    source: GAMEPLAY_PRESENTATION_SOURCES.CLICK,
    adapter: GAMEPLAY_AUTHORITY_ADAPTERS.LOCAL,
  });
}

function legacyTransitionProjection(state) {
  const players = state.seats.map(seat => ({ seat: seat.seatId, color: seat.color }));
  const turnIndex = players.findIndex(player => player.seat === state.activeSeatId);
  if (turnIndex < 0) throw new Error('diagnostic_transition_projection_active_seat_missing');
  return {
    players,
    status: 'playing',
    turnIndex,
    board: cloneJson(state.board),
    scores: Object.fromEntries(players.map(player => [player.seat, state.scores[player.seat]])),
    winsToMatch: state.winsToMatch,
    targetRounds: state.winsToMatch,
    round: state.round,
    completedRounds: state.completedRounds,
    lastMove: state.lastMove
      ? {
        cell: state.lastMove.cell,
        size: state.lastMove.size,
        color: state.lastMove.color,
        seat: state.lastMove.seatId,
      }
      : null,
    moveNumber: Object.values(state.board).reduce((sum, cell) => sum + Object.keys(cell).length, 0),
    winner: null,
    draw: false,
    matchComplete: state.matchComplete,
    matchWinner: null,
    matchWinners: [],
    rematch: Object.fromEntries(players.map(player => [player.seat, false])),
    skippedSeat: null,
  };
}

async function executeLocalMoveWith044Parity(state, move) {
  const legality = validatePlacementForSeat(state, state.activeSeatId, move);
  if (!legality.ok) throw new Error(`diagnostic_fixture_illegal_move:${legality.code}`);

  const transitionBefore = legacyTransitionProjection(state);
  const transitionAfter = applyMoveTransition(transitionBefore, state.activeSeatId, move);
  const authority = createLocalAuthorityAdapter({
    initialState: state,
    isOnlineSeatType,
    clock: () => FIXED_NOW_MS,
  });
  const result = await authority.submit(createLocalMoveIntent(state, move));

  const canonicalMove = result.snapshot.lastMove;
  const transitionMove = transitionAfter.lastMove;
  if (
    !canonicalMove
    || !transitionMove
    || canonicalMove.seatId !== transitionMove.seat
    || canonicalMove.color !== transitionMove.color
    || canonicalMove.cell !== transitionMove.cell
    || canonicalMove.size !== transitionMove.size
  ) throw new Error('diagnostic_044_045_last_move_parity_failed');
  if (JSON.stringify(result.snapshot.board) !== JSON.stringify(transitionAfter.board)) {
    throw new Error('diagnostic_044_045_board_parity_failed');
  }
  for (const seat of state.seats) {
    if (result.snapshot.scores[seat.seatId] !== transitionAfter.scores[seat.seatId]) {
      throw new Error('diagnostic_044_045_score_parity_failed');
    }
  }

  return deepFreeze({ result, transitionAfter, legality });
}

function applyLifecycleEvent(state, event) {
  return runCanonicalSessionReducer(state, event, canonical => ({
    ...canonical,
    lifecycle: reduceSessionLifecycle(canonical.lifecycle, event),
  }));
}

function lifecycleInterruptAndRecover(state, interrupt) {
  const interruptedEvent = {
    type: SESSION_LIFECYCLE_EVENT_TYPES.INTERRUPT,
    interrupt,
    recoveryTarget: state.lifecycle.phase,
    presentationGeneration: state.lifecycle.presentationGeneration,
  };
  const interrupted = applyLifecycleEvent(state, interruptedEvent);
  const hydrated = parseCanonicalSessionState(serializeCanonicalSessionState(interrupted));
  const recoverEvent = {
    type: SESSION_LIFECYCLE_EVENT_TYPES.RECOVER,
    presentationGeneration: hydrated.lifecycle.presentationGeneration,
  };
  const recovered = applyLifecycleEvent(hydrated, recoverEvent);
  return deepFreeze({ interrupted, hydrated, recovered });
}

export function createSetupDiagnosticFixture() {
  const state = createCanonicalSessionState({
    preferredColor: 'marble',
    targetPlayers: 3,
    winsToMatch: 3,
    seats: [],
    revision: 0,
    lifecycle: { phase: SESSION_LIFECYCLE_PHASES.SETUP, presentationGeneration: 2 },
  });
  return diagnosticEnvelope('setup', { state });
}

export function createSeatCountDiagnosticFixture(playerCount) {
  if (!RULES.playerCounts.includes(playerCount)) throw new Error('diagnostic_invalid_player_count');
  const state = createTurnState({
    playerCount,
    revision: playerCount,
    presentationGeneration: playerCount,
  });
  const legalProbe = validatePlacementForSeat(state, state.activeSeatId, { cell: 4, size: SIZES[1] });
  if (!legalProbe.ok) throw new Error(`diagnostic_seat_fixture_illegal:${legalProbe.code}`);
  return diagnosticEnvelope(`${playerCount}-seat`, { state, legalProbe });
}

export function createNearWinDiagnosticFixture() {
  const board = buildBoard([
    { color: 'marble', size: 'medium', cell: 0 },
    { color: 'marble', size: 'medium', cell: 1 },
  ]);
  const state = createTurnState({ board, revision: 20, presentationGeneration: 8 });
  const move = Object.freeze({ cell: 2, size: 'medium' });
  const legality = validatePlacementForSeat(state, state.activeSeatId, move);
  if (!legality.ok) throw new Error(`diagnostic_near_win_illegal:${legality.code}`);
  return diagnosticEnvelope('near-win', { state, move, legality });
}

export function createDrawDiagnosticFixture() {
  const omitted = { color: 'marble', size: 'small', cell: 2 };
  const board = buildBoard(DRAW_PLACEMENTS.filter(placement => !(
    placement.color === omitted.color
    && placement.size === omitted.size
    && placement.cell === omitted.cell
  )));
  const state = createTurnState({ board, revision: 30, presentationGeneration: 9 });
  const move = Object.freeze({ cell: omitted.cell, size: omitted.size });
  const legality = validatePlacementForSeat(state, state.activeSeatId, move);
  if (!legality.ok) throw new Error(`diagnostic_draw_move_illegal:${legality.code}`);
  return diagnosticEnvelope('draw', { state, move, legality });
}

export function createTimeoutDiagnosticFixture() {
  const state = createTurnState({
    revision: 40,
    presentationGeneration: 10,
    deadlineAtMs: 1_000,
  });
  const attempt = createExpiredLocalTimeoutIntent(state, {
    nowMs: 1_001,
    isOnlineSeatType,
  });
  if (!attempt) throw new Error('diagnostic_timeout_attempt_missing');
  return diagnosticEnvelope('timeout', { state, nowMs: 1_001, attempt });
}

export function createReconnectDiagnosticFixture() {
  const state = createTurnState({ playerCount: 3, revision: 50, presentationGeneration: 11 });
  const recovery = lifecycleInterruptAndRecover(state, SESSION_LIFECYCLE_INTERRUPTS.RECONNECT);
  return diagnosticEnvelope('reconnect', { before: state, ...recovery });
}

export function createWebglRecoveryDiagnosticFixture() {
  const state = createTurnState({ playerCount: 4, revision: 60, presentationGeneration: 20 });
  const recovery = lifecycleInterruptAndRecover(state, SESSION_LIFECYCLE_INTERRUPTS.CONTEXT_LOST);
  return diagnosticEnvelope('webgl-recovery', { before: state, ...recovery });
}

export async function runFlashDiagnostics() {
  const setup = createSetupDiagnosticFixture();
  const seatCounts = RULES.playerCounts.map(createSeatCountDiagnosticFixture);

  const nearWin = createNearWinDiagnosticFixture();
  const nearWinExecution = await executeLocalMoveWith044Parity(nearWin.payload.state, nearWin.payload.move);
  if (nearWinExecution.result.outcome !== 'round-win') throw new Error('diagnostic_near_win_outcome_mismatch');

  const draw = createDrawDiagnosticFixture();
  const fullDrawBoard = placePiece(draw.payload.state.board, 'marble', draw.payload.move);
  if (winningPatterns(fullDrawBoard, 'marble').length !== 0 || winningPatterns(fullDrawBoard, 'blue').length !== 0) {
    throw new Error('diagnostic_draw_fixture_contains_win');
  }
  for (const seat of draw.payload.state.seats) {
    if (hasLegalMove(fullDrawBoard, seat.color)) throw new Error('diagnostic_draw_fixture_has_legal_move');
  }
  const drawExecution = await executeLocalMoveWith044Parity(draw.payload.state, draw.payload.move);
  if (drawExecution.result.outcome !== 'draw' || !drawExecution.result.snapshot.draw) {
    throw new Error('diagnostic_draw_outcome_mismatch');
  }

  const timeout = createTimeoutDiagnosticFixture();
  const timeoutAuthority = createLocalAuthorityAdapter({
    initialState: timeout.payload.state,
    isOnlineSeatType,
    clock: () => timeout.payload.nowMs,
  });
  const timeoutResult = await timeoutAuthority.submit(timeout.payload.attempt.intent);
  if (timeoutResult.outcome !== 'timeout') throw new Error('diagnostic_timeout_outcome_mismatch');

  const reconnect = createReconnectDiagnosticFixture();
  if (reconnect.payload.interrupted.lifecycle.interrupt !== SESSION_LIFECYCLE_INTERRUPTS.RECONNECT) {
    throw new Error('diagnostic_reconnect_interrupt_missing');
  }
  if (reconnect.payload.recovered.lifecycle.interrupt !== null) throw new Error('diagnostic_reconnect_recovery_failed');

  const matchSeats = seatsFor(2);
  const matchBoard = buildBoard([
    { color: 'marble', size: 'medium', cell: 0 },
    { color: 'marble', size: 'medium', cell: 1 },
  ]);
  const matchPre = createTurnState({
    board: matchBoard,
    scores: scoreMap(matchSeats, { right: 2 }),
    round: 3,
    completedRounds: 2,
    revision: 70,
    presentationGeneration: 30,
  });
  const matchMove = Object.freeze({ cell: 2, size: 'medium' });
  const matchExecution = await executeLocalMoveWith044Parity(matchPre, matchMove);
  if (matchExecution.result.outcome !== 'match-win' || !matchExecution.result.snapshot.matchComplete) {
    throw new Error('diagnostic_match_threshold_not_reached');
  }
  const committedMatchEnd = commitCanonicalMatchEnd(matchExecution.result.snapshot, {
    expectedRevision: matchExecution.result.snapshot.revision,
  });
  if (committedMatchEnd.state.lifecycle.phase !== SESSION_LIFECYCLE_PHASES.MATCH_END) {
    throw new Error('diagnostic_match_end_not_committed');
  }
  const matchEnd = diagnosticEnvelope('match-end', {
    beforeWinningMove: matchPre,
    move: matchMove,
    winSnapshot: matchExecution.result.snapshot,
    matchEndSnapshot: committedMatchEnd.state,
  });

  const webglRecovery = createWebglRecoveryDiagnosticFixture();
  if (webglRecovery.payload.interrupted.lifecycle.interrupt !== SESSION_LIFECYCLE_INTERRUPTS.CONTEXT_LOST) {
    throw new Error('diagnostic_webgl_interrupt_missing');
  }
  if (webglRecovery.payload.recovered.lifecycle.interrupt !== null) throw new Error('diagnostic_webgl_recovery_failed');

  return diagnosticEnvelope('flash-suite', {
    setup,
    seatCounts,
    nearWin: diagnosticEnvelope('near-win-result', {
      fixture: nearWin,
      outcome: nearWinExecution.result.outcome,
      snapshot: nearWinExecution.result.snapshot,
    }),
    draw: diagnosticEnvelope('draw-result', {
      fixture: draw,
      outcome: drawExecution.result.outcome,
      snapshot: drawExecution.result.snapshot,
    }),
    timeout: diagnosticEnvelope('timeout-result', {
      fixture: timeout,
      outcome: timeoutResult.outcome,
      snapshot: timeoutResult.snapshot,
    }),
    reconnect,
    matchEnd,
    webglRecovery,
  });
}
