import assert from 'node:assert/strict';

import { GAMEPLAY_PRESENTATION_SOURCES } from '../web/app/gameplay/gameplay-intent.js';
import { derivePersistentScoreMarkerState } from '../web/app/scene/score-marker-presentation.js';
import { emptyBoard } from '../web/app/shared/rules.js';
import { configuredSeatOrder } from '../web/app/shared/seat-order.js';
import {
  createCanonicalSessionState,
  parseCanonicalSessionState,
  serializeCanonicalSessionState,
} from '../web/app/session/canonical-session-state.js';
import {
  applyAuthoritativeLocalRematch,
  applyAuthoritativeReturnToSetup,
  commitCanonicalMatchEnd,
  createLocalRematchRequest,
  createReturnToSetupRequest,
} from '../web/app/session/match-end.js';
import { commitAuthoritativeRoundWin } from '../web/app/session/win-resolution.js';

const isOnlineSeatType = type => type === 'online-human';

function seats(preferredColor = 'marble', targetPlayers = 4, types = []) {
  return configuredSeatOrder(preferredColor, targetPlayers).map((slot, index) => ({
    seatId: slot.seatId,
    type: types[index] || (index === 0 ? 'host-human' : 'computer'),
    color: slot.color,
    ready: true,
  }));
}

function matchPointTurn() {
  const configured = seats();
  const board = emptyBoard();
  board['0'].small = 'marble';
  board['1'].small = 'marble';
  board['2'].small = 'marble';
  return createCanonicalSessionState({
    lobbyGeneration: 7,
    preferredColor: 'marble',
    targetPlayers: 4,
    winsToMatch: 3,
    seats: configured,
    board,
    activeSeatId: 'right',
    deadlineAtMs: 1_787_170_000_000,
    scores: { right: 2, back: 1, left: 0, front: 1 },
    round: 5,
    completedRounds: 4,
    lastMove: { seatId: 'right', color: 'marble', cell: 2, size: 'small' },
    revision: 120,
    lifecycle: { phase: 'turn-loop', presentationGeneration: 20 },
  });
}

const turn = matchPointTurn();
const won = commitAuthoritativeRoundWin(turn, { expectedRevision: 120 }).state;
assert.equal(won.lifecycle.phase, 'win');
assert.equal(won.matchComplete, true);
assert.deepEqual(won.matchWinner, { seatId: 'right', color: 'marble', wins: 3 });
assert.equal(won.activeSeatId, null);
assert.equal(won.deadlineAtMs, null);
assert.equal(won.roundEndRevision, 120);

const finalBoard = JSON.stringify(won.board);
const finalScores = { ...won.scores };
const finalSeats = JSON.parse(JSON.stringify(won.seats));
const matchEnd = commitCanonicalMatchEnd(won, { expectedRevision: 120 }).state;
assert.equal(matchEnd.lifecycle.phase, 'match-end');
assert.equal(matchEnd.lifecycle.presentationGeneration, won.lifecycle.presentationGeneration + 2);
assert.equal(matchEnd.matchComplete, true);
assert.deepEqual(matchEnd.matchWinner, { seatId: 'right', color: 'marble', wins: 3 });
assert.deepEqual(matchEnd.matchWinners, [{ seatId: 'right', color: 'marble', wins: 3 }]);
assert.deepEqual(matchEnd.scores, finalScores);
assert.equal(JSON.stringify(matchEnd.board), finalBoard, 'match-end preserves final board for presentation');
assert.equal(matchEnd.roundEndRevision, 120);
assert.equal(matchEnd.revision, 120);
assert.throws(() => commitCanonicalMatchEnd(matchEnd, { expectedRevision: 120 }), /match_end_already_committed/);

// Rematch starts a fresh match from the first configured stable seat while keeping
// seat/type/color/configuration and winsToMatch exactly intact.
const rematchRequest = createLocalRematchRequest(matchEnd, {
  source: GAMEPLAY_PRESENTATION_SOURCES.GAMEPAD_CONFIRM,
  isOnlineSeatType,
});
assert.equal(rematchRequest.intent.kind, 'rematch');
assert.equal(rematchRequest.intent.authority.adapter, 'local');
assert.equal(rematchRequest.intent.authority.seat, 'right');
assert.equal(rematchRequest.intent.authority.revision, 120);
assert.equal(rematchRequest.roundEndRevision, 120);
assert.equal(rematchRequest.presentationGeneration, matchEnd.lifecycle.presentationGeneration);

const rematched = applyAuthoritativeLocalRematch(matchEnd, rematchRequest, { isOnlineSeatType });
assert.equal(rematched.status, 'applied');
assert.equal(rematched.applied, true);
assert.equal(rematched.nextState.lifecycle.phase, 'round-ready');
assert.equal(rematched.nextState.lifecycle.presentationGeneration, matchEnd.lifecycle.presentationGeneration + 1);
assert.equal(rematched.nextState.lobbyGeneration, 7, 'rematch stays in the same configured lobby generation');
assert.equal(rematched.nextState.preferredColor, 'marble');
assert.equal(rematched.nextState.targetPlayers, 4);
assert.equal(rematched.nextState.winsToMatch, 3);
assert.deepEqual(rematched.nextState.seats, finalSeats);
assert.equal(rematched.nextState.round, 1);
assert.equal(rematched.nextState.completedRounds, 0);
assert.equal(rematched.nextState.activeSeatId, 'right');
assert.equal(rematched.nextState.deadlineAtMs, null, 'deadline begins only after committed round-ready state');
assert.equal(rematched.nextState.roundEndRevision, null);
assert.equal(rematched.nextState.lastMove, null);
assert.deepEqual(rematched.nextState.skips, []);
assert.equal(rematched.nextState.winner, null);
assert.equal(rematched.nextState.draw, false);
assert.equal(rematched.nextState.matchComplete, false);
assert.equal(rematched.nextState.matchWinner, null);
assert.deepEqual(rematched.nextState.matchWinners, []);
assert.deepEqual(rematched.nextState.scores, { right: 0, back: 0, left: 0, front: 0 });
assert.deepEqual(rematched.nextState.restart, { right: false, back: false, left: false, front: false });
assert.deepEqual(rematched.nextState.rematch, { right: false, back: false, left: false, front: false });
assert.equal(rematched.nextState.revision, 120);
for (const cell of Object.values(rematched.nextState.board)) assert.deepEqual(cell, {});
for (const inventory of Object.values(rematched.nextState.inventory)) {
  assert.deepEqual(inventory, { small: 3, medium: 3, large: 3 });
}
assert.deepEqual(
  derivePersistentScoreMarkerState(rematched.nextState).countsBySeat,
  { right: 0, back: 0, left: 0, front: 0 },
  'fresh authoritative match score reset clears THREEJS-053 markers',
);

// Replaying the same rematch request is stale because lifecycle generation/phase changed.
const rematchReplay = applyAuthoritativeLocalRematch(rematched.nextState, rematchRequest, { isOnlineSeatType });
assert.equal(rematchReplay.status, 'stale');
assert.equal(rematchReplay.applied, false);
assert.equal(rematchReplay.nextState, null);
assert.throws(() => createLocalRematchRequest(rematched.nextState, { isOnlineSeatType }), /action_requires_match_end/);

const staleMatchEnd = JSON.parse(JSON.stringify(matchEnd));
staleMatchEnd.lifecycle.presentationGeneration += 1;
const staleRematch = applyAuthoritativeLocalRematch(staleMatchEnd, rematchRequest, { isOnlineSeatType });
assert.equal(staleRematch.status, 'stale');
assert.equal(staleRematch.applied, false);

// Persisted match-end cannot claim a score above the configured threshold: the
// authoritative win reducer ends the match at the exact 3/5 boundary.
const impossibleThreshold = JSON.parse(JSON.stringify(matchEnd));
impossibleThreshold.scores.right = 4;
impossibleThreshold.matchWinner.wins = 4;
impossibleThreshold.matchWinners[0].wins = 4;
assert.throws(() => createLocalRematchRequest(impossibleThreshold, { isOnlineSeatType }), /match_end_score_mismatch/);

// Preferred-color rotation defines the first configured seat for a fresh rematch;
// it must not accidentally hard-code the physical `right` seat.
const goldConfigured = seats('gold', 2);
const goldBoard = emptyBoard();
goldBoard['0'].small = 'gold';
goldBoard['1'].small = 'gold';
goldBoard['2'].small = 'gold';
const goldTurn = createCanonicalSessionState({
  lobbyGeneration: 8,
  preferredColor: 'gold',
  targetPlayers: 2,
  winsToMatch: 3,
  seats: goldConfigured,
  board: goldBoard,
  activeSeatId: 'left',
  deadlineAtMs: 1_787_170_100_000,
  scores: { left: 2, front: 1 },
  round: 3,
  completedRounds: 2,
  lastMove: { seatId: 'left', color: 'gold', cell: 2, size: 'small' },
  revision: 121,
  lifecycle: { phase: 'turn-loop', presentationGeneration: 30 },
});
const goldWon = commitAuthoritativeRoundWin(goldTurn, { expectedRevision: 121 }).state;
const goldMatchEnd = commitCanonicalMatchEnd(goldWon, { expectedRevision: 121 }).state;
const goldRequest = createLocalRematchRequest(goldMatchEnd, {
  source: GAMEPLAY_PRESENTATION_SOURCES.TAP,
  isOnlineSeatType,
});
assert.equal(goldRequest.intent.authority.seat, 'left');
const goldRematch = applyAuthoritativeLocalRematch(goldMatchEnd, goldRequest, { isOnlineSeatType });
assert.equal(goldRematch.nextState.activeSeatId, 'left');
assert.equal(goldRematch.nextState.preferredColor, 'gold');
assert.deepEqual(goldRematch.nextState.seats, goldConfigured);
assert.deepEqual(goldRematch.nextState.scores, { left: 0, front: 0 });

// Return to Setup explicitly abandons the completed session. Configuration/seats
// are cleared, lobbyGeneration advances, and presentation generation changes so
// callbacks from the abandoned session cannot commit into the clean setup state.
const setupRequest = createReturnToSetupRequest(matchEnd, {
  source: GAMEPLAY_PRESENTATION_SOURCES.KEYBOARD_CONFIRM,
  isOnlineSeatType,
});
assert.equal(setupRequest.type, 'return-to-setup');
assert.equal(setupRequest.authoritySeatId, 'right');
assert.equal(setupRequest.revision, 120);
assert.equal(setupRequest.roundEndRevision, 120);

const returned = applyAuthoritativeReturnToSetup(matchEnd, setupRequest, { isOnlineSeatType });
assert.equal(returned.status, 'applied');
assert.equal(returned.applied, true);
const setup = returned.nextState;
assert.equal(setup.lifecycle.phase, 'setup');
assert.equal(setup.lifecycle.presentationGeneration, matchEnd.lifecycle.presentationGeneration + 1);
assert.equal(setup.lobbyGeneration, matchEnd.lobbyGeneration + 1);
assert.equal(setup.preferredColor, null);
assert.equal(setup.targetPlayers, null);
assert.equal(setup.winsToMatch, null);
assert.deepEqual(setup.seats, []);
assert.deepEqual(setup.scores, {});
assert.deepEqual(setup.restart, {});
assert.deepEqual(setup.rematch, {});
assert.deepEqual(setup.inventory, {});
assert.equal(setup.activeSeatId, null);
assert.equal(setup.deadlineAtMs, null);
assert.equal(setup.round, 0);
assert.equal(setup.completedRounds, 0);
assert.equal(setup.roundEndRevision, null);
assert.equal(setup.lastMove, null);
assert.deepEqual(setup.skips, []);
assert.equal(setup.winner, null);
assert.equal(setup.draw, false);
assert.equal(setup.matchComplete, false);
assert.equal(setup.matchWinner, null);
assert.deepEqual(setup.matchWinners, []);
assert.equal(setup.revision, 120);
for (const cell of Object.values(setup.board)) assert.deepEqual(cell, {});

const hydratedSetup = parseCanonicalSessionState(serializeCanonicalSessionState(setup));
assert.deepEqual(hydratedSetup, setup, 'clean setup survives canonical hydration without hidden session residue');

const setupReplay = applyAuthoritativeReturnToSetup(setup, setupRequest, { isOnlineSeatType });
assert.equal(setupReplay.status, 'stale');
assert.equal(setupReplay.applied, false);
assert.equal(setupReplay.nextState, null);
assert.throws(() => createReturnToSetupRequest(setup, { isOnlineSeatType }), /action_requires_match_end/);

// Local lifecycle actions fail closed if any configured seat is Online; online
// rematch/abandon authority remains for later online tasks rather than browser truth.
const onlineMatchEnd = JSON.parse(JSON.stringify(matchEnd));
onlineMatchEnd.seats[1].type = 'online-human';
assert.throws(() => createLocalRematchRequest(onlineMatchEnd, { isOnlineSeatType }), /online_session_not_local_match_action_authority/);
assert.throws(() => createReturnToSetupRequest(onlineMatchEnd, { isOnlineSeatType }), /online_session_not_local_match_action_authority/);

assert.throws(() => commitCanonicalMatchEnd(won, { expectedRevision: 119 }), /stale_match_end_revision/);

console.log('THREEJS-056 match-end/rematch/setup lifecycle contract: PASS');
