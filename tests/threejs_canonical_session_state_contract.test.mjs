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
  { seatId: 'seat-host', type: 'host-human', color: 'marble', ready: true },
  { seatId: 'seat-guest', type: 'online-human', color: 'blue', ready: null },
  { seatId: 'seat-bot', type: 'computer', color: 'gold', ready: null },
];

const initial = createCanonicalSessionState({
  lobbyGeneration: 4,
  targetPlayers: 3,
  winsToMatch: 3,
  seats,
  lifecycle: { phase: 'setup' },
});
assert.equal(initial.schema, CANONICAL_SESSION_STATE_SCHEMA);
assert.equal(initial.lifecycle.phase, 'setup');
assert.equal(initial.revision, 0);
assert.deepEqual(initial.scores, { 'seat-host': 0, 'seat-guest': 0, 'seat-bot': 0 });
assert.deepEqual(initial.restart, { 'seat-host': false, 'seat-guest': false, 'seat-bot': false });
assert.deepEqual(initial.rematch, { 'seat-host': false, 'seat-guest': false, 'seat-bot': false });
assert.deepEqual(initial.inventory['seat-host'], { small: 3, medium: 3, large: 3 });
assert(Object.isFrozen(initial));
assert(Object.isFrozen(initial.seats));

const serialized = serializeCanonicalSessionState(initial);
assert.deepEqual(parseCanonicalSessionState(serialized), initial, 'canonical state must survive an exact JSON round-trip');

const board = emptyBoard();
board['0'].small = 'marble';
board['1'].small = 'marble';
board['4'].large = 'blue';
assert.deepEqual(deriveCanonicalInventory(board, seats), {
  'seat-host': { small: 1, medium: 3, large: 3 },
  'seat-guest': { small: 3, medium: 3, large: 2 },
  'seat-bot': { small: 3, medium: 3, large: 3 },
});

const playing = createCanonicalSessionState({
  lobbyGeneration: 4,
  targetPlayers: 3,
  winsToMatch: 3,
  seats,
  board,
  turnIndex: 1,
  activeSeatId: 'seat-guest',
  deadlineAtMs: 1_787_161_000_000,
  scores: { 'seat-host': 1, 'seat-guest': 0, 'seat-bot': 0 },
  round: 2,
  completedRounds: 1,
  lastMove: { seatId: 'seat-host', color: 'marble', cell: 1, size: 'small' },
  skippedSeat: 'seat-bot',
  skipReason: 'authority-provided-reason',
  revision: 17,
  lifecycle: {
    phase: 'turn-loop',
    interrupt: null,
    recoveryTarget: null,
    presentationGeneration: 9,
  },
});
assert.equal(playing.inventory['seat-host'].small, 1);
assert.equal(playing.activeSeatId, 'seat-guest');
assert.equal(playing.deadlineAtMs, 1_787_161_000_000);
assert.equal(playing.skipReason, 'authority-provided-reason');

// Seat type and lifecycle tokens are carried as normalized opaque strings here.
// Their authoritative vocabulary/transition semantics belong to later owner tasks.
const opaqueTokens = createCanonicalSessionState({
  seats: [{ seatId: 'future-seat', type: 'future-authority-seat-type', color: 'green', ready: null }],
  lifecycle: { phase: 'future-phase-token' },
});
assert.equal(opaqueTokens.seats[0].type, 'future-authority-seat-type');
assert.equal(opaqueTokens.lifecycle.phase, 'future-phase-token');

assert.throws(() => createCanonicalSessionState({
  seats: [
    { seatId: 'a', type: 'human', color: 'marble', ready: false },
    { seatId: 'a', type: 'computer', color: 'blue', ready: null },
  ],
}), /duplicate_session_seat_id/);
assert.throws(() => createCanonicalSessionState({
  seats: [
    { seatId: 'a', type: 'human', color: 'marble', ready: false },
    { seatId: 'b', type: 'computer', color: 'marble', ready: null },
  ],
}), /duplicate_session_seat_color/);
assert.throws(() => createCanonicalSessionState({
  seats: [{ seatId: 'a', type: 'human', color: 'white', ready: false }],
}), /invalid_session_seat_color/);

const staleInventory = JSON.parse(serializeCanonicalSessionState(playing));
staleInventory.inventory['seat-host'].small = 3;
assert.throws(() => assertCanonicalSessionState(staleInventory), /stale_session_inventory/);

const orphanBoard = emptyBoard();
orphanBoard['0'].small = 'green';
assert.throws(() => createCanonicalSessionState({ seats, board: orphanBoard }), /orphan_session_board_color/);

const tooManyPieces = emptyBoard();
for (const cell of [0, 1, 2, 3]) tooManyPieces[String(cell)].small = 'marble';
assert.throws(() => createCanonicalSessionState({ seats, board: tooManyPieces }), /invalid_session_piece_count/);

assert.throws(() => createCanonicalSessionState({
  seats,
  turnIndex: 1,
  activeSeatId: 'seat-host',
}), /invalid_session_active_turn/);
assert.throws(() => createCanonicalSessionState({
  seats,
  deadlineAtMs: 123,
}), /deadline_without_active_turn/);
assert.throws(() => createCanonicalSessionState({
  seats,
  winner: { seatId: 'seat-host', color: 'marble' },
  draw: true,
}), /winner_and_draw_conflict/);
assert.throws(() => createCanonicalSessionState({
  seats,
  skippedSeat: 'seat-host',
  skipReason: null,
}), /invalid_session_skip/);

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
    phase: event.type.toLowerCase(),
    presentationGeneration: state.lifecycle.presentationGeneration + 1,
  },
}));
assert.equal(reduced.revision, 1);
assert.equal(reduced.lifecycle.phase, 'configured');
assert.equal(reduced.lifecycle.presentationGeneration, 1);
assert.equal(initial.revision, 0, 'reducer boundary must not mutate canonical input');

assert.throws(() => runCanonicalSessionReducer(initial, null, state => {
  state.revision += 1;
  return state;
}), /read only|Cannot assign|canonical_session_reducer_mutated_input/);

assert.throws(() => runCanonicalSessionReducer(initial, null, state => ({
  ...state,
  renderer: { mesh: true },
})), /invalid_canonical_session_state_shape/);

assert.throws(() => runCanonicalSessionReducer(initial, { bad: 1n }, state => state), /canonical_reducer_event_not_json/);
assert.throws(() => runCanonicalSessionReducer(initial, { when: new Date('2026-08-19T00:00:00Z') }, state => state), /canonical_reducer_event_not_json/);
assert.throws(() => createCanonicalSessionState({
  seats: [{ seatId: 'date-seat', type: new Date('2026-08-19T00:00:00Z'), color: 'green', ready: null }],
}), /invalid_session_seat_type/);

const source = await readFile(new URL('../web/app/session/canonical-session-state.js', import.meta.url), 'utf8');
assert.doesNotMatch(source, /\bdocument\.|\bwindow\.|\bsetTimeout\s*\(|\bsetInterval\s*\(|\bnavigator\.serviceWorker|THREE\./, 'canonical state module must not depend on presentation/runtime objects');

console.log('THREEJS-045 canonical session state contract: PASS');
