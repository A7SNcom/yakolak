import assert from 'node:assert/strict';

import { emptyBoard } from '../web/app/shared/rules.js';
import { configuredSeatOrder } from '../web/app/shared/seat-order.js';
import { derivePersistentScoreMarkerState } from '../web/app/scene/score-marker-presentation.js';
import { createCanonicalSessionState } from '../web/app/session/canonical-session-state.js';
import { commitAuthoritativeDraw } from '../web/app/session/draw-resolution.js';
import {
  advanceCanonicalRound,
  beginCommittedLocalRoundTurn,
  deriveNextRoundStarter,
} from '../web/app/session/round-advance.js';
import { commitAuthoritativeRoundWin } from '../web/app/session/win-resolution.js';

const isOnlineSeatType = type => type === 'online-human';

function configuredSeats(preferredColor, targetPlayers, types = []) {
  return configuredSeatOrder(preferredColor, targetPlayers).map((slot, index) => ({
    seatId: slot.seatId,
    type: types[index] || (index === 0 ? 'host-human' : 'computer'),
    color: slot.color,
    ready: true,
  }));
}

function endedState({ preferredColor = 'marble', targetPlayers = 2, round = 1, revision = 70 } = {}) {
  const seats = configuredSeats(preferredColor, targetPlayers);
  return createCanonicalSessionState({
    preferredColor,
    targetPlayers,
    winsToMatch: 5,
    seats,
    scores: Object.fromEntries(seats.map(seat => [seat.seatId, 0])),
    round,
    completedRounds: round,
    roundEndRevision: revision,
    winner: { seatId: seats[0].seatId, color: seats[0].color },
    revision,
    lifecycle: { phase: 'win', presentationGeneration: 3 },
  });
}

// Starter rotates exactly one configured seat per completed round and wraps over
// the resolved THREEJS-048 ring for 2/3/4-seat sessions.
for (const preferredColor of ['marble', 'blue', 'gold', 'green']) {
  for (const targetPlayers of [2, 3, 4]) {
    const order = configuredSeatOrder(preferredColor, targetPlayers).map(slot => slot.seatId);
    for (let round = 1; round <= targetPlayers * 2; round += 1) {
      assert.equal(
        deriveNextRoundStarter(endedState({ preferredColor, targetPlayers, round })),
        order[round % targetPlayers],
        `${preferredColor}/${targetPlayers}/round${round} must rotate in configured ring order`,
      );
    }
  }
}

const seats = configuredSeats('marble', 4);
const winningBoard = emptyBoard();
winningBoard['0'].small = 'marble';
winningBoard['1'].small = 'marble';
winningBoard['2'].small = 'marble';
const turn = createCanonicalSessionState({
  lobbyGeneration: 11,
  preferredColor: 'marble',
  targetPlayers: 4,
  winsToMatch: 5,
  seats,
  board: winningBoard,
  activeSeatId: 'right',
  deadlineAtMs: 1_787_168_000_000,
  scores: { right: 2, back: 1, left: 0, front: 1 },
  round: 1,
  completedRounds: 0,
  lastMove: { seatId: 'right', color: 'marble', cell: 2, size: 'small' },
  revision: 90,
  lifecycle: { phase: 'turn-loop', presentationGeneration: 4 },
});
const won = commitAuthoritativeRoundWin(turn, { expectedRevision: 90 }).state;
assert.equal(won.lifecycle.phase, 'win');
assert.equal(won.completedRounds, 1);
assert.equal(won.scores.right, 3);
assert.equal(won.roundEndRevision, 90);
const markersBeforeReset = derivePersistentScoreMarkerState(won).countsBySeat;

const advanced = advanceCanonicalRound(won, { expectedRevision: 90 });
const roundTwo = advanced.state;
assert.equal(roundTwo.round, 2);
assert.equal(roundTwo.completedRounds, 1, 'round advance must not double-count the completed round');
assert.equal(roundTwo.activeSeatId, 'back', 'round two starter is next configured seat');
assert.equal(roundTwo.deadlineAtMs, null, 'new deadline must not exist before committed round-ready state');
assert.equal(roundTwo.roundEndRevision, null);
assert.equal(roundTwo.lastMove, null);
assert.deepEqual(roundTwo.skips, []);
assert.equal(roundTwo.winner, null);
assert.equal(roundTwo.draw, false);
assert.equal(roundTwo.matchComplete, false);
assert.equal(roundTwo.matchWinner, null);
assert.deepEqual(roundTwo.matchWinners, []);
assert.deepEqual(roundTwo.restart, { right: false, back: false, left: false, front: false });
assert.deepEqual(roundTwo.rematch, { right: false, back: false, left: false, front: false });
assert.equal(roundTwo.lifecycle.phase, 'round-ready');
assert.equal(roundTwo.lifecycle.presentationGeneration, won.lifecycle.presentationGeneration + 2);
assert.equal(roundTwo.revision, 90);
assert.equal(roundTwo.lobbyGeneration, 11);
assert.equal(roundTwo.preferredColor, 'marble');
assert.equal(roundTwo.targetPlayers, 4);
assert.equal(roundTwo.winsToMatch, 5);
assert.deepEqual(roundTwo.seats, won.seats);
assert.deepEqual(roundTwo.scores, won.scores, 'match scores persist across round reset');
assert.deepEqual(derivePersistentScoreMarkerState(roundTwo).countsBySeat, markersBeforeReset, 'THREEJS-053 markers persist from unchanged authoritative scores');
for (const cell of Object.values(roundTwo.board)) assert.deepEqual(cell, {});
for (const inventory of Object.values(roundTwo.inventory)) {
  assert.deepEqual(inventory, { small: 3, medium: 3, large: 3 });
}

assert.deepEqual(advanced.result, {
  round: 2,
  starterSeatId: 'back',
  revision: 90,
  scores: { right: 3, back: 1, left: 0, front: 1 },
});

// Exact-once: the round-ready result is no longer an ended round and cannot be
// advanced a second time by a duplicate callback.
assert.throws(() => advanceCanonicalRound(roundTwo, { expectedRevision: 90 }), /round_not_ended/);
assert.equal(roundTwo.round, 2);

// Local deadline starts only after the round-ready state exists/commits.
const startNow = 1_787_168_100_000;
const playingRoundTwo = beginCommittedLocalRoundTurn(roundTwo, {
  expectedRevision: 90,
  nowMs: startNow,
  isOnlineSeatType,
});
assert.equal(roundTwo.deadlineAtMs, null, 'starting the committed turn cannot mutate round-ready input');
assert.equal(playingRoundTwo.lifecycle.phase, 'turn-loop');
assert.equal(playingRoundTwo.lifecycle.presentationGeneration, roundTwo.lifecycle.presentationGeneration + 1);
assert.equal(playingRoundTwo.activeSeatId, 'back');
assert.equal(playingRoundTwo.deadlineAtMs, startNow + 18_000);
assert.equal(playingRoundTwo.round, 2);
assert.deepEqual(playingRoundTwo.scores, roundTwo.scores);
assert.throws(() => beginCommittedLocalRoundTurn(playingRoundTwo, {
  expectedRevision: 90,
  nowMs: startNow,
  isOnlineSeatType,
}), /round_start_requires_round_ready/);

// Draw uses the same pure reset and preserves score while rotating starter.
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
const twoSeats = configuredSeats('marble', 2);
const drawTurn = createCanonicalSessionState({
  preferredColor: 'marble',
  targetPlayers: 2,
  winsToMatch: 3,
  seats: twoSeats,
  board: trueDrawBoard(),
  activeSeatId: 'right',
  scores: { right: 2, back: 1 },
  round: 3,
  completedRounds: 2,
  revision: 91,
  lifecycle: { phase: 'turn-loop' },
});
const drawn = commitAuthoritativeDraw(drawTurn, { expectedRevision: 91 }).state;
const afterDraw = advanceCanonicalRound(drawn, { expectedRevision: 91 }).state;
assert.equal(afterDraw.round, 4);
assert.equal(afterDraw.completedRounds, 3);
assert.equal(afterDraw.activeSeatId, 'back', 'round 4 starter rotates from configured ring using prior round number');
assert.deepEqual(afterDraw.scores, { right: 2, back: 1 });
assert.equal(afterDraw.draw, false);
assert.equal(afterDraw.lifecycle.phase, 'round-ready');

// Match-completing wins cannot enter another round; THREEJS-056 owns rematch.
const matchPointTurn = createCanonicalSessionState({
  preferredColor: 'marble',
  targetPlayers: 2,
  winsToMatch: 3,
  seats: twoSeats,
  board: winningBoard,
  activeSeatId: 'right',
  scores: { right: 2, back: 1 },
  round: 5,
  completedRounds: 4,
  lastMove: { seatId: 'right', color: 'marble', cell: 2, size: 'small' },
  revision: 92,
  lifecycle: { phase: 'turn-loop' },
});
const matchComplete = commitAuthoritativeRoundWin(matchPointTurn, { expectedRevision: 92 }).state;
assert.equal(matchComplete.matchComplete, true);
assert.throws(() => advanceCanonicalRound(matchComplete, { expectedRevision: 92 }), /match_complete_cannot_advance_round/);

// Pure round reset is engine/transport-neutral even with Online seats, but local
// clock start fails closed; THREEJS-070 owns the future online deadline.
const onlineEnded = endedState({ preferredColor: 'marble', targetPlayers: 2, round: 1, revision: 93 });
const onlineEndedMutable = JSON.parse(JSON.stringify(onlineEnded));
onlineEndedMutable.seats[1].type = 'online-human';
const onlineReady = advanceCanonicalRound(onlineEndedMutable, { expectedRevision: 93 }).state;
assert.equal(onlineReady.lifecycle.phase, 'round-ready');
assert.throws(() => beginCommittedLocalRoundTurn(onlineReady, {
  expectedRevision: 93,
  nowMs: startNow,
  isOnlineSeatType,
}), /online_session_not_local_deadline_authority/);
assert.equal(onlineReady.deadlineAtMs, null);

assert.throws(() => advanceCanonicalRound(won, { expectedRevision: 89 }), /stale_round_advance_revision/);

console.log('THREEJS-054 round advance contract: PASS');
