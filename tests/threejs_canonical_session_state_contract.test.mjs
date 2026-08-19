import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { emptyBoard } from '../web/app/shared/rules.js';
import {
  CANONICAL_SESSION_STATE_SCHEMA,
  assertCanonicalSessionState,
  createCanonicalSessionState,
  deriveCanonicalInventory,
  parseCanonicalSessionState,
  runCanonicalSessionReducer,
  serializeCanonicalSessionState,
} from '../web/app/session/canonical-session-state.js';

const seats = [
  { seatId: 'right', type: 'host-human', color: 'marble', ready: true },
  { seatId: 'back', type: 'online-human', color: 'blue', ready: null },
  { seatId: 'left', type: 'computer', color: 'gold', ready: null },
];

const initial = createCanonicalSessionState({
  lobbyGeneration: 4,
  preferredColor: 'marble',
  targetPlayers: 3,
  winsToMatch: 3,
  seats,
  lifecycle: { phase: 'setup' },
});
assert.equal(initial.schema, CANONICAL_SESSION_STATE_SCHEMA);
assert.equal(initial.preferredColor, 'marble');
assert.equal(initial.lifecycle.phase, 'setup');
assert.equal(initial.revision, 0);
assert.deepEqual(initial.scores, { right: 0, back: 0, left: 0 });
assert.deepEqual(initial.restart, { right: false, back: false, left: false });
assert.deepEqual(initial.rematch, { right: false, back: false, left: false });
assert.deepEqual(initial.inventory.right, { small: 3, medium: 3, large: 3 });
assert.equal(Object.hasOwn(initial, 'turnIndex'), false, 'canonical active turn is stable seat identity, never array index');
assert(Object.isFrozen(initial));
assert(Object.isFrozen(initial.seats));

const serialized = serializeCanonicalSessionState(initial);
assert.deepEqual(parseCanonicalSessionState(serialized), initial, 'canonical state must survive an exact JSON round-trip');

const board = emptyBoard();
board['0'].small = 'marble';
board['1'].small = 'marble';
board['4'].large = 'blue';
assert.deepEqual(deriveCanonicalInventory(board, seats), {
  right: { small: 1, medium: 3, large: 3 },
  back: { small: 3, medium: 3, large: 2 },
  left: { small: 3, medium: 3, large: 3 },
});

const playing = createCanonicalSessionState({
  lobbyGeneration: 4,
  preferredColor: 'marble',
  targetPlayers: 3,
  winsToMatch: 3,
  seats,
  board,
  activeSeatId: 'back',
  deadlineAtMs: 1_787_161_000_000,
  scores: { right: 1, back: 0, left: 0 },
  round: 2,
  completedRounds: 1,
  lastMove: { seatId: 'right', color: 'marble', cell: 1, size: 'small' },
  skippedSeat: 'left',
  skipReason: 'authority-provided-reason',
  revision: 17,
  lifecycle: {
    phase: 'turn-loop',
    interrupt: null,
    recoveryTarget: null,
    presentationGeneration: 9,
  },
});
assert.equal(playing.inventory.right.small, 1);
assert.equal(playing.activeSeatId, 'back');
assert.equal(playing.deadlineAtMs, 1_787_161_000_000);
assert.equal(playing.skipReason, 'authority-provided-reason');

// THREEJS-048 resolves canonical stored seat order; shuffled array order is no longer legal.
assert.throws(() => createCanonicalSessionState({
  preferredColor: 'marble',
  targetPlayers: 3,
  seats: [seats[2], seats[0], seats[1]],
  activeSeatId: 'back',
}), /configured_seat_order_mismatch/);

// Seat type remains opaque until THREEJS-062; stable seat ID/color does not.
const opaqueSeatType = createCanonicalSessionState({
  preferredColor: 'marble',
  targetPlayers: 2,
  seats: [{ seatId: 'right', type: 'future-authority-seat-type', color: 'marble', ready: null }],
  lifecycle: { phase: 'setup' },
});
assert.equal(opaqueSeatType.seats[0].type, 'future-authority-seat-type');
assert.throws(() => createCanonicalSessionState({ lifecycle: { phase: 'future-phase-token' } }), /invalid_lifecycle_phase/);
assert.throws(() => createCanonicalSessionState({ lifecycle: new Date('2026-08-19T00:00:00Z') }), /invalid_session_lifecycle/);

assert.throws(() => createCanonicalSessionState({
  preferredColor: 'marble',
  targetPlayers: 2,
  seats: [
    { seatId: 'right', type: 'human', color: 'marble', ready: false },
    { seatId: 'right', type: 'computer', color: 'marble', ready: null },
  ],
}), /configured_seat_order_mismatch|duplicate_session_seat_id/);
assert.throws(() => createCanonicalSessionState({
  preferredColor: 'marble',
  targetPlayers: 2,
  seats: [
    { seatId: 'right', type: 'human', color: 'marble', ready: false },
    { seatId: 'back', type: 'computer', color: 'marble', ready: null },
  ],
}), /invalid_session_seat_color_binding/);
assert.throws(() => createCanonicalSessionState({
  preferredColor: 'marble',
  targetPlayers: 2,
  seats: [{ seatId: 'right', type: 'human', color: 'white', ready: false }],
}), /invalid_session_seat_color/);
assert.throws(() => createCanonicalSessionState({
  preferredColor: 'marble',
  targetPlayers: 2,
  seats: [{ seatId: 'future-seat', type: 'human', color: 'marble', ready: false }],
}), /invalid_configured_seat_id/);

const staleInventory = JSON.parse(serializeCanonicalSessionState(playing));
staleInventory.inventory.right.small = 3;
assert.throws(() => assertCanonicalSessionState(staleInventory), /stale_session_inventory/);

const orphanBoard = emptyBoard();
orphanBoard['0'].small = 'green';
assert.throws(() => createCanonicalSessionState({
  preferredColor: 'marble',
  targetPlayers: 3,
  seats,
  board: orphanBoard,
}), /orphan_session_board_color/);

const tooManyPieces = emptyBoard();
for (const cell of [0, 1, 2, 3]) tooManyPieces[String(cell)].small = 'marble';
assert.throws(() => createCanonicalSessionState({
  preferredColor: 'marble',
  targetPlayers: 3,
  seats,
  board: tooManyPieces,
}), /invalid_session_piece_count/);

assert.throws(() => createCanonicalSessionState({
  preferredColor: 'marble', targetPlayers: 3, seats, activeSeatId: 'front',
}), /invalid_session_active_seat/);
assert.throws(() => createCanonicalSessionState({
  preferredColor: 'marble', targetPlayers: 3, seats, deadlineAtMs: 123,
}), /deadline_without_active_turn/);
assert.throws(() => createCanonicalSessionState({
  preferredColor: 'marble',
  targetPlayers: 3,
  seats,
  winner: { seatId: 'right', color: 'marble' },
  draw: true,
}), /winner_and_draw_conflict/);
assert.throws(() => createCanonicalSessionState({
  preferredColor: 'marble',
  targetPlayers: 3,
  seats,
  skippedSeat: 'right',
  skipReason: null,
}), /invalid_session_skip/);
assert.throws(() => createCanonicalSessionState({ targetPlayers: 2 }), /target_players_without_preferred_color/);

const oldIndexLeak = JSON.parse(serializeCanonicalSessionState(playing));
oldIndexLeak.turnIndex = 1;
assert.throws(() => assertCanonicalSessionState(oldIndexLeak), /invalid_canonical_session_state_shape/, 'turnIndex stays adapter-only; configured order is stable seat identity');

for (const runtimeLeak of [
  ['mesh', { name: 'piece-mesh' }],
  ['domNode', { nodeType: 1 }],
  ['animationHandle', 42],
  ['serviceWorkerState', { active: true }],
  ['localTimer', 1234],
]) {
  const polluted = JSON.parse(serializeCanonicalSessionState(initial));
  polluted[runtimeLeak[0]] = runtimeLeak[1];
  assert.throws(() => assertCanonicalSessionState(polluted), /invalid_canonical_session_state_shape/);
}

const lifecycleLeak = JSON.parse(serializeCanonicalSessionState(initial));
lifecycleLeak.lifecycle.timerHandle = 99;
assert.throws(() => assertCanonicalSessionState(lifecycleLeak), /invalid_session_lifecycle_shape/);

const seatLeak = JSON.parse(serializeCanonicalSessionState(initial));
seatLeak.seats[0].mesh = { id: 1 };
assert.throws(() => assertCanonicalSessionState(seatLeak), /invalid_session_seat_shape/);

const reduced = runCanonicalSessionReducer(initial, { type: 'CONFIGURED' }, (state, event) => ({
  ...state,
  revision: state.revision + 1,
  lifecycle: {
    ...state.lifecycle,
    phase: event.type.toLowerCase() === 'configured' ? 'setup' : state.lifecycle.phase,
    presentationGeneration: state.lifecycle.presentationGeneration + 1,
  },
}));
assert.equal(reduced.revision, 1);
assert.equal(reduced.lifecycle.phase, 'setup');
assert.equal(reduced.lifecycle.presentationGeneration, 1);
assert.equal(initial.revision, 0, 'reducer boundary must not mutate canonical input');

assert.throws(() => runCanonicalSessionReducer(initial, null, state => {
  state.revision += 1;
  return state;
}), /read only|Cannot assign|canonical_session_reducer_mutated_input/);
assert.throws(() => runCanonicalSessionReducer(initial, null, state => ({ ...state, renderer: { mesh: true } })), /invalid_canonical_session_state_shape/);
assert.throws(() => runCanonicalSessionReducer(initial, { bad: 1n }, state => state), /canonical_reducer_event_not_json/);
assert.throws(() => runCanonicalSessionReducer(initial, { when: new Date('2026-08-19T00:00:00Z') }, state => state), /canonical_reducer_event_not_json/);
assert.throws(() => createCanonicalSessionState({
  preferredColor: 'marble',
  targetPlayers: 2,
  seats: [{ seatId: 'right', type: new Date('2026-08-19T00:00:00Z'), color: 'marble', ready: null }],
}), /invalid_session_seat_type/);

const source = await readFile(new URL('../web/app/session/canonical-session-state.js', import.meta.url), 'utf8');
assert.doesNotMatch(source, /\bdocument\.|\bwindow\.|\bsetTimeout\s*\(|\bsetInterval\s*\(|\bnavigator\.serviceWorker|THREE\./, 'canonical state module must not depend on presentation/runtime objects');

console.log('THREEJS-045/048 canonical session state contract: PASS');
