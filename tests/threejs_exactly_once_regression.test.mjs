import assert from 'node:assert/strict';

import {
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

function seats(targetPlayers = 2) {
  return configuredSeatOrder('marble', targetPlayers).map((slot, index) => ({
    seatId: slot.seatId,
    type: index === 0 ? 'human' : 'computer',
    color: slot.color,
    ready: true,
  }));
}

function localIntent({
  kind,
  seat,
  revision,
  payload = {},
  origin = GAMEPLAY_INTENT_ORIGINS.HUMAN,
  source = GAMEPLAY_PRESENTATION_SOURCES.CLICK,
}) {
  return createGameplayIntent({
    kind,
    origin,
    seat,
    revision,
    payload,
    source,
  });
}

// Accepted placement applies once. Replaying the same observed revision cannot
// consume a second piece or place a second board slot.
const moveState = createCanonicalSessionState({
  preferredColor: 'marble',
  targetPlayers: 2,
  winsToMatch: 3,
  seats: seats(),
  activeSeatId: 'right',
  deadlineAtMs: 10_000,
  revision: 10,
  lifecycle: { phase: 'turn-loop' },
});
const moveAuthority = createLocalAuthorityAdapter({ initialState: moveState, isOnlineSeatType, clock });
const move = localIntent({
  kind: GAMEPLAY_INTENT_KINDS.MOVE,
  seat: 'right',
  revision: 10,
  payload: { cell: 4, size: 'small' },
});
const moveAccepted = await moveAuthority.submit(move);
assert.equal(moveAccepted.revision, 11);
await assert.rejects(moveAuthority.submit(move), error => error.code === 'stale_local_authority_revision');
const afterMoveReplay = await moveAuthority.snapshot();
assert.equal(afterMoveReplay.revision, 11);
assert.equal(afterMoveReplay.board['4'].small, 'marble');
assert.equal(afterMoveReplay.inventory.right.small, 2);
assert.equal(Object.values(afterMoveReplay.board).filter(cell => cell.small === 'marble').length, 1);

// Timeout applies once without consuming a piece. Duplicate timeout cannot skip a
// second seat because the first acceptance advances revision and deadline.
nowMs = 20_000;
const timeoutState = createCanonicalSessionState({
  preferredColor: 'marble',
  targetPlayers: 2,
  winsToMatch: 3,
  seats: seats(),
  activeSeatId: 'right',
  deadlineAtMs: 20_000,
  revision: 20,
  lifecycle: { phase: 'turn-loop' },
});
const timeoutAuthority = createLocalAuthorityAdapter({ initialState: timeoutState, isOnlineSeatType, clock });
const timeout = localIntent({
  kind: GAMEPLAY_INTENT_KINDS.TIMEOUT,
  origin: GAMEPLAY_INTENT_ORIGINS.CLOCK,
  seat: 'right',
  revision: 20,
  source: GAMEPLAY_PRESENTATION_SOURCES.NONE,
});
const timeoutAccepted = await timeoutAuthority.submit(timeout);
assert.equal(timeoutAccepted.revision, 21);
assert.equal(timeoutAccepted.snapshot.activeSeatId, 'back');
assert.deepEqual(timeoutAccepted.snapshot.skips, [{ seatId: 'right', reason: 'timeout' }]);
await assert.rejects(timeoutAuthority.submit(timeout), error => error.code === 'stale_local_authority_revision');
const afterTimeoutReplay = await timeoutAuthority.snapshot();
assert.equal(afterTimeoutReplay.revision, 21);
assert.equal(afterTimeoutReplay.activeSeatId, 'back');
assert.deepEqual(afterTimeoutReplay.skips, [{ seatId: 'right', reason: 'timeout' }]);
assert.deepEqual(afterTimeoutReplay.inventory, timeoutState.inventory);

// Confirmed pre-placement restart applies once. Replay cannot create another fresh
// deadline, presentation generation, revision, or round reset.
nowMs = 30_000;
const restartState = createCanonicalSessionState({
  preferredColor: 'marble',
  targetPlayers: 2,
  winsToMatch: 3,
  seats: seats(),
  activeSeatId: 'right',
  deadlineAtMs: 35_000,
  scores: { right: 1, back: 0 },
  round: 1,
  completedRounds: 0,
  revision: 30,
  lifecycle: { phase: 'turn-loop', presentationGeneration: 5 },
});
const restartAuthority = createLocalAuthorityAdapter({ initialState: restartState, isOnlineSeatType, clock });
const restart = localIntent({
  kind: GAMEPLAY_INTENT_KINDS.RESTART,
  seat: 'right',
  revision: 30,
  source: GAMEPLAY_PRESENTATION_SOURCES.KEYBOARD_CONFIRM,
});
const restartAccepted = await restartAuthority.submit(restart);
assert.equal(restartAccepted.revision, 31);
assert.equal(restartAccepted.snapshot.round, 1);
assert.equal(restartAccepted.snapshot.activeSeatId, 'right');
assert.equal(restartAccepted.snapshot.deadlineAtMs, nowMs + 18_000);
assert.deepEqual(restartAccepted.snapshot.scores, { right: 1, back: 0 });
const restartGeneration = restartAccepted.snapshot.lifecycle.presentationGeneration;
await assert.rejects(restartAuthority.submit(restart), error => error.code === 'stale_local_authority_revision');
const afterRestartReplay = await restartAuthority.snapshot();
assert.equal(afterRestartReplay.revision, 31);
assert.equal(afterRestartReplay.deadlineAtMs, nowMs + 18_000);
assert.equal(afterRestartReplay.lifecycle.presentationGeneration, restartGeneration);
assert.equal(afterRestartReplay.round, 1);

// A winning placement scores exactly once. Replaying the same move cannot award a
// second point even after the first acceptance ends the match.
nowMs = 40_000;
const winBoard = emptyBoard();
winBoard['0'].small = 'marble';
winBoard['1'].small = 'marble';
const winState = createCanonicalSessionState({
  preferredColor: 'marble',
  targetPlayers: 2,
  winsToMatch: 3,
  seats: seats(),
  board: winBoard,
  activeSeatId: 'right',
  deadlineAtMs: 50_000,
  scores: { right: 2, back: 1 },
  round: 5,
  completedRounds: 4,
  revision: 40,
  lifecycle: { phase: 'turn-loop' },
});
const winAuthority = createLocalAuthorityAdapter({ initialState: winState, isOnlineSeatType, clock });
const winningMove = localIntent({
  kind: GAMEPLAY_INTENT_KINDS.MOVE,
  seat: 'right',
  revision: 40,
  payload: { cell: 2, size: 'small' },
});
const winAccepted = await winAuthority.submit(winningMove);
assert.equal(winAccepted.revision, 41);
assert.equal(winAccepted.snapshot.scores.right, 3);
assert.equal(winAccepted.snapshot.roundEndRevision, 41);
assert.equal(winAccepted.snapshot.matchComplete, true);
await assert.rejects(winAuthority.submit(winningMove), error => error.code === 'stale_local_authority_revision');
const afterWinReplay = await winAuthority.snapshot();
assert.equal(afterWinReplay.scores.right, 3);
assert.equal(afterWinReplay.completedRounds, 5);
assert.equal(afterWinReplay.roundEndRevision, 41);

// Rematch applies once. Duplicate replay cannot reset a newly-started match again,
// advance revision twice, or create a second first-turn deadline.
const completedBoard = emptyBoard();
completedBoard['0'].small = 'marble';
completedBoard['1'].small = 'marble';
completedBoard['2'].small = 'marble';
const matchPoint = createCanonicalSessionState({
  preferredColor: 'marble',
  targetPlayers: 2,
  winsToMatch: 3,
  seats: seats(),
  board: completedBoard,
  activeSeatId: 'right',
  deadlineAtMs: 60_000,
  scores: { right: 2, back: 1 },
  round: 3,
  completedRounds: 2,
  lastMove: { seatId: 'right', color: 'marble', cell: 2, size: 'small' },
  revision: 50,
  lifecycle: { phase: 'turn-loop', presentationGeneration: 8 },
});
const completedWin = commitAuthoritativeRoundWin(matchPoint, { expectedRevision: 50 }).state;
const matchEnd = commitCanonicalMatchEnd(completedWin, { expectedRevision: 50 }).state;
nowMs = 55_000;
const rematchAuthority = createLocalAuthorityAdapter({ initialState: matchEnd, isOnlineSeatType, clock });
const rematch = localIntent({
  kind: GAMEPLAY_INTENT_KINDS.REMATCH,
  seat: 'right',
  revision: 50,
  source: GAMEPLAY_PRESENTATION_SOURCES.GAMEPAD_CONFIRM,
});
const rematchAccepted = await rematchAuthority.submit(rematch);
assert.equal(rematchAccepted.revision, 51);
assert.equal(rematchAccepted.snapshot.round, 1);
assert.equal(rematchAccepted.snapshot.completedRounds, 0);
assert.deepEqual(rematchAccepted.snapshot.scores, { right: 0, back: 0 });
assert.equal(rematchAccepted.snapshot.activeSeatId, 'right');
assert.equal(rematchAccepted.snapshot.deadlineAtMs, nowMs + 18_000);
const rematchGeneration = rematchAccepted.snapshot.lifecycle.presentationGeneration;
await assert.rejects(rematchAuthority.submit(rematch), error => error.code === 'stale_local_authority_revision');
const afterRematchReplay = await rematchAuthority.snapshot();
assert.equal(afterRematchReplay.revision, 51);
assert.equal(afterRematchReplay.round, 1);
assert.equal(afterRematchReplay.completedRounds, 0);
assert.deepEqual(afterRematchReplay.scores, { right: 0, back: 0 });
assert.equal(afterRematchReplay.deadlineAtMs, nowMs + 18_000);
assert.equal(afterRematchReplay.lifecycle.presentationGeneration, rematchGeneration);

console.log('THREEJS-059 exactly-once gameplay regression: PASS');
