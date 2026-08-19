import assert from 'node:assert/strict';

import {
  GAMEPLAY_AUTHORITY_ADAPTERS,
  GAMEPLAY_INTENT_KINDS,
  GAMEPLAY_INTENT_ORIGINS,
  GAMEPLAY_PRESENTATION_SOURCES,
  createGameplayIntent,
} from '../web/app/gameplay/gameplay-intent.js';
import { emptyBoard } from '../web/app/shared/rules.js';
import { configuredSeatOrder } from '../web/app/shared/seat-order.js';
import { createCanonicalSessionState } from '../web/app/session/canonical-session-state.js';
import { createLocalAuthorityAdapter } from '../web/app/session/local-authority-adapter.js';
import { commitCanonicalMatchEnd } from '../web/app/session/match-end.js';
import { commitAuthoritativeRoundWin } from '../web/app/session/win-resolution.js';

const isOnlineSeatType = type => type === 'online-human';
let nowMs = 1_000;
const clock = () => nowMs;

function seats(preferredColor = 'marble', targetPlayers = 2, types = []) {
  return configuredSeatOrder(preferredColor, targetPlayers).map((slot, index) => ({
    seatId: slot.seatId,
    type: types[index] || (index === 0 ? 'human' : 'computer'),
    color: slot.color,
    ready: true,
  }));
}

function activeState({
  board = emptyBoard(),
  activeSeatId = 'right',
  deadlineAtMs = 10_000,
  revision = 10,
  scores = { right: 0, back: 0 },
  round = 1,
  completedRounds = 0,
  preferredColor = 'marble',
  targetPlayers = 2,
  configuredSeats = seats(preferredColor, targetPlayers),
} = {}) {
  return createCanonicalSessionState({
    preferredColor,
    targetPlayers,
    winsToMatch: 3,
    seats: configuredSeats,
    board,
    activeSeatId,
    deadlineAtMs,
    scores,
    round,
    completedRounds,
    revision,
    lifecycle: { phase: 'turn-loop' },
  });
}

function intent({
  kind,
  origin = GAMEPLAY_INTENT_ORIGINS.HUMAN,
  seat,
  revision,
  payload = {},
  source = GAMEPLAY_PRESENTATION_SOURCES.CLICK,
  adapter = GAMEPLAY_AUTHORITY_ADAPTERS.LOCAL,
}) {
  return createGameplayIntent({ kind, origin, seat, revision, payload, source, adapter });
}

// The UI-facing authority surface is exactly snapshot/submit; it exposes no
// local/remote flag that renderer or controls could branch on.
const initial = activeState();
const authority = createLocalAuthorityAdapter({ initialState: initial, isOnlineSeatType, clock });
assert.deepEqual(Object.keys(authority).sort(), ['snapshot', 'submit']);
const initialSnapshot = await authority.snapshot();
assert.deepEqual(initialSnapshot, initial);
assert(Object.isFrozen(initialSnapshot));

// Human and Computer/Bot producers submit the same move semantics through the
// same adapter. Presentation origin/source cannot alter canonical result.
const humanAuthority = createLocalAuthorityAdapter({ initialState: initial, isOnlineSeatType, clock });
const botAuthority = createLocalAuthorityAdapter({ initialState: initial, isOnlineSeatType, clock });
const humanMove = intent({
  kind: GAMEPLAY_INTENT_KINDS.MOVE,
  origin: GAMEPLAY_INTENT_ORIGINS.HUMAN,
  seat: 'right',
  revision: 10,
  payload: { cell: 4, size: 'small' },
  source: GAMEPLAY_PRESENTATION_SOURCES.CLICK,
});
const botMove = intent({
  kind: GAMEPLAY_INTENT_KINDS.MOVE,
  origin: GAMEPLAY_INTENT_ORIGINS.BOT,
  seat: 'right',
  revision: 10,
  payload: { cell: 4, size: 'small' },
  source: GAMEPLAY_PRESENTATION_SOURCES.NONE,
});
const humanAccepted = await humanAuthority.submit(humanMove);
const botAccepted = await botAuthority.submit(botMove);
assert.equal(humanAccepted.accepted, true);
assert.equal(humanAccepted.outcome, 'move');
assert.equal(humanAccepted.revision, 11);
assert.deepEqual(humanAccepted.snapshot, botAccepted.snapshot, 'human/bot origin must not fork gameplay semantics');
assert.equal(humanAccepted.snapshot.board['4'].small, 'marble');
assert.equal(humanAccepted.snapshot.inventory.right.small, 2);
assert.deepEqual(humanAccepted.snapshot.lastMove, { seatId: 'right', color: 'marble', cell: 4, size: 'small' });
assert.equal(humanAccepted.snapshot.activeSeatId, 'back');
assert.equal(humanAccepted.snapshot.deadlineAtMs, nowMs + 18_000);

// Rejected/stale submissions are atomic and do not consume revision.
const occupied = intent({
  kind: GAMEPLAY_INTENT_KINDS.MOVE,
  seat: 'back',
  revision: 11,
  payload: { cell: 4, size: 'small' },
});
await assert.rejects(humanAuthority.submit(occupied), error => error.code === 'occupied_slot');
assert.equal((await humanAuthority.snapshot()).revision, 11);
await assert.rejects(humanAuthority.submit(humanMove), error => error.code === 'stale_local_authority_revision');
assert.equal((await humanAuthority.snapshot()).revision, 11);
const networkIntent = createGameplayIntent({
  kind: GAMEPLAY_INTENT_KINDS.MOVE,
  origin: GAMEPLAY_INTENT_ORIGINS.HUMAN,
  seat: 'back',
  revision: 11,
  payload: { cell: 5, size: 'small' },
  source: GAMEPLAY_PRESENTATION_SOURCES.CLICK,
  adapter: GAMEPLAY_AUTHORITY_ADAPTERS.NETWORK,
  mutationId: 'threejs057_network_mutation_00000001',
});
await assert.rejects(humanAuthority.submit(networkIntent), error => error.code === 'local_authority_requires_local_intent');
assert.equal((await humanAuthority.snapshot()).revision, 11);

// Timeout producer uses the same submit interface. Adapter owns the absolute
// deadline, handoff and one accepted revision increment.
nowMs = humanAccepted.snapshot.deadlineAtMs;
const timeoutIntent = intent({
  kind: GAMEPLAY_INTENT_KINDS.TIMEOUT,
  origin: GAMEPLAY_INTENT_ORIGINS.CLOCK,
  seat: 'back',
  revision: 11,
  source: GAMEPLAY_PRESENTATION_SOURCES.NONE,
});
const timedOut = await humanAuthority.submit(timeoutIntent);
assert.equal(timedOut.outcome, 'timeout');
assert.equal(timedOut.revision, 12);
assert.equal(timedOut.snapshot.activeSeatId, 'right');
assert.equal(timedOut.snapshot.deadlineAtMs, nowMs + 18_000);
assert.deepEqual(timedOut.snapshot.skips, [{ seatId: 'back', reason: 'timeout' }]);

// Winning move consumes exactly one revision and roundEndRevision records the
// resulting authoritative revision, not the stale pre-submit revision.
nowMs = 2_000;
const nearWinBoard = emptyBoard();
nearWinBoard['0'].small = 'marble';
nearWinBoard['1'].small = 'marble';
const winningState = activeState({
  board: nearWinBoard,
  deadlineAtMs: 20_000,
  revision: 40,
  scores: { right: 2, back: 1 },
  round: 5,
  completedRounds: 4,
});
const winningAuthority = createLocalAuthorityAdapter({ initialState: winningState, isOnlineSeatType, clock });
const winningMove = intent({
  kind: GAMEPLAY_INTENT_KINDS.MOVE,
  seat: 'right',
  revision: 40,
  payload: { cell: 2, size: 'small' },
});
const won = await winningAuthority.submit(winningMove);
assert.equal(won.outcome, 'match-win');
assert.equal(won.snapshot.revision, 41);
assert.equal(won.snapshot.roundEndRevision, 41);
assert.equal(won.snapshot.scores.right, 3);
assert.equal(won.snapshot.matchComplete, true);
assert.equal(won.snapshot.lifecycle.phase, 'win');

// All-blocked expired timeout resolves draw inside the same authority submit and
// stamps the draw with the accepted revision exactly once.
function trueDrawBoard() {
  const board = emptyBoard();
  const assign = (color, size, cells) => {
    for (const cell of cells) board[String(cell)][size] = color;
  };
  assign('marble', 'small', [1, 6, 7]);
  assign('blue', 'small', [2, 3, 4]);
  assign('marble', 'medium', [2, 6, 8]);
  assign('blue', 'medium', [0, 4, 7]);
  assign('marble', 'large', [0, 1, 4]);
  assign('blue', 'large', [2, 7, 8]);
  return board;
}
nowMs = 50_000;
const drawState = activeState({
  board: trueDrawBoard(),
  deadlineAtMs: 49_000,
  revision: 50,
  scores: { right: 1, back: 1 },
  round: 4,
  completedRounds: 3,
});
const drawAuthority = createLocalAuthorityAdapter({ initialState: drawState, isOnlineSeatType, clock });
const drawTimeout = intent({
  kind: GAMEPLAY_INTENT_KINDS.TIMEOUT,
  origin: GAMEPLAY_INTENT_ORIGINS.CLOCK,
  seat: 'right',
  revision: 50,
  source: GAMEPLAY_PRESENTATION_SOURCES.NONE,
});
const drawn = await drawAuthority.submit(drawTimeout);
assert.equal(drawn.outcome, 'draw');
assert.equal(drawn.snapshot.revision, 51);
assert.equal(drawn.snapshot.roundEndRevision, 51);
assert.equal(drawn.snapshot.draw, true);
assert.equal(drawn.snapshot.lifecycle.phase, 'draw');

// Confirmed restart is represented to the adapter by the existing restart intent;
// the producer performs confirmation before submit. Adapter owns reset/deadline/revision.
nowMs = 60_000;
const restartState = createCanonicalSessionState({
  preferredColor: 'marble',
  targetPlayers: 4,
  winsToMatch: 5,
  seats: seats('marble', 4),
  activeSeatId: 'front',
  deadlineAtMs: 65_000,
  scores: { right: 2, back: 1, left: 0, front: 1 },
  round: 2,
  completedRounds: 1,
  revision: 60,
  lifecycle: { phase: 'turn-loop', presentationGeneration: 8 },
});
const restartAuthority = createLocalAuthorityAdapter({ initialState: restartState, isOnlineSeatType, clock });
const restartIntent = intent({
  kind: GAMEPLAY_INTENT_KINDS.RESTART,
  seat: 'right',
  revision: 60,
  source: GAMEPLAY_PRESENTATION_SOURCES.KEYBOARD_CONFIRM,
});
const restarted = await restartAuthority.submit(restartIntent);
assert.equal(restarted.outcome, 'restart');
assert.equal(restarted.snapshot.revision, 61);
assert.equal(restarted.snapshot.round, 2);
assert.equal(restarted.snapshot.activeSeatId, 'back');
assert.equal(restarted.snapshot.deadlineAtMs, nowMs + 18_000);
assert.deepEqual(restarted.snapshot.scores, restartState.scores);

// Match-end Rematch also uses submit(intent), preserves configuration, resets score,
// starts the first configured seat, creates the new local deadline, then advances
// local authority revision once.
const matchBoard = emptyBoard();
matchBoard['0'].small = 'marble';
matchBoard['1'].small = 'marble';
matchBoard['2'].small = 'marble';
const matchPoint = createCanonicalSessionState({
  lobbyGeneration: 4,
  preferredColor: 'marble',
  targetPlayers: 2,
  winsToMatch: 3,
  seats: seats(),
  board: matchBoard,
  activeSeatId: 'right',
  deadlineAtMs: 70_000,
  scores: { right: 2, back: 1 },
  round: 3,
  completedRounds: 2,
  lastMove: { seatId: 'right', color: 'marble', cell: 2, size: 'small' },
  revision: 70,
  lifecycle: { phase: 'turn-loop', presentationGeneration: 12 },
});
const matchWin = commitAuthoritativeRoundWin(matchPoint, { expectedRevision: 70 }).state;
const matchEnd = commitCanonicalMatchEnd(matchWin, { expectedRevision: 70 }).state;
nowMs = 75_000;
const rematchAuthority = createLocalAuthorityAdapter({ initialState: matchEnd, isOnlineSeatType, clock });
const rematchIntent = intent({
  kind: GAMEPLAY_INTENT_KINDS.REMATCH,
  seat: 'right',
  revision: 70,
  source: GAMEPLAY_PRESENTATION_SOURCES.CLICK,
});
const rematched = await rematchAuthority.submit(rematchIntent);
assert.equal(rematched.outcome, 'rematch');
assert.equal(rematched.snapshot.revision, 71);
assert.equal(rematched.snapshot.lifecycle.phase, 'turn-loop');
assert.equal(rematched.snapshot.round, 1);
assert.equal(rematched.snapshot.activeSeatId, 'right');
assert.equal(rematched.snapshot.deadlineAtMs, nowMs + 18_000);
assert.deepEqual(rematched.snapshot.scores, { right: 0, back: 0 });
assert.equal(rematched.snapshot.lobbyGeneration, 4);
assert.equal(rematched.snapshot.winsToMatch, 3);

// Round-ready/deadline ownership can be primed at adapter creation; snapshot then
// exposes the current authority revision/deadline to every producer.
nowMs = 80_000;
const roundReady = createCanonicalSessionState({
  preferredColor: 'marble',
  targetPlayers: 2,
  winsToMatch: 3,
  seats: seats(),
  activeSeatId: 'right',
  revision: 80,
  lifecycle: { phase: 'round-ready' },
});
const primedAuthority = createLocalAuthorityAdapter({ initialState: roundReady, isOnlineSeatType, clock });
const primed = await primedAuthority.snapshot();
assert.equal(primed.lifecycle.phase, 'turn-loop');
assert.equal(primed.deadlineAtMs, nowMs + 18_000);
assert.equal(primed.revision, 81);

// Online seats are never silently downgraded to browser-local authority.
const onlineState = activeState({
  configuredSeats: seats('marble', 2, ['human', 'online-human']),
});
assert.throws(
  () => createLocalAuthorityAdapter({ initialState: onlineState, isOnlineSeatType, clock }),
  /online_session_not_local_authority/,
);

console.log('THREEJS-057 unified local authority adapter contract: PASS');
