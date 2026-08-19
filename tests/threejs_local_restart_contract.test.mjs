import assert from 'node:assert/strict';

import { GAMEPLAY_PRESENTATION_SOURCES } from '../web/app/gameplay/gameplay-intent.js';
import { derivePersistentScoreMarkerState } from '../web/app/scene/score-marker-presentation.js';
import { emptyBoard } from '../web/app/shared/rules.js';
import { configuredSeatOrder } from '../web/app/shared/seat-order.js';
import { createCanonicalSessionState } from '../web/app/session/canonical-session-state.js';
import {
  applyAuthoritativeLocalRestart,
  createLocalRestartRequest,
} from '../web/app/session/local-restart.js';
import {
  SESSION_LIFECYCLE_PHASES,
  SESSION_LIFECYCLE_TRANSITIONS,
} from '../web/app/session/session-lifecycle.js';

const isOnlineSeatType = type => type === 'online-human';
const now = 1_787_169_000_000;

function seats(preferredColor = 'marble', targetPlayers = 4, types = []) {
  return configuredSeatOrder(preferredColor, targetPlayers).map((slot, index) => ({
    seatId: slot.seatId,
    type: types[index] || (index === 0 ? 'host-human' : 'computer'),
    color: slot.color,
    ready: true,
  }));
}

function activeRound({
  preferredColor = 'marble',
  targetPlayers = 4,
  round = 2,
  activeSeatId = 'front',
  revision = 100,
  deadlineAtMs = now + 10_000,
  scores = { right: 2, back: 1, left: 0, front: 1 },
  skips = [
    { seatId: 'back', reason: 'timeout' },
    { seatId: 'left', reason: 'no_legal_move' },
  ],
  board = emptyBoard(),
  lastMove = null,
  types = [],
  presentationGeneration = 12,
} = {}) {
  const configured = seats(preferredColor, targetPlayers, types);
  return createCanonicalSessionState({
    lobbyGeneration: 5,
    preferredColor,
    targetPlayers,
    winsToMatch: 5,
    seats: configured,
    board,
    activeSeatId,
    deadlineAtMs,
    scores,
    round,
    completedRounds: 1,
    lastMove,
    skips,
    revision,
    lifecycle: {
      phase: 'turn-loop',
      presentationGeneration,
    },
  });
}

assert(SESSION_LIFECYCLE_TRANSITIONS[SESSION_LIFECYCLE_PHASES.TURN_LOOP].includes(SESSION_LIFECYCLE_PHASES.RESET));

const state = activeRound();
const markersBefore = derivePersistentScoreMarkerState(state).countsBySeat;
const request = createLocalRestartRequest(state, {
  isOnlineSeatType,
  source: GAMEPLAY_PRESENTATION_SOURCES.KEYBOARD_CONFIRM,
});
assert.equal(request.intent.kind, 'restart');
assert.equal(request.intent.origin, 'human');
assert.equal(request.intent.authority.adapter, 'local');
assert.equal(request.intent.authority.seat, 'right', 'first configured seat is the local host authority');
assert.equal(request.intent.authority.revision, 100);
assert.equal(request.intent.presentation.source, 'keyboard-confirm');
assert.equal(request.round, 2);
assert.equal(request.presentationGeneration, 12);
assert.equal(request.deadlineAtMs, state.deadlineAtMs);
assert.match(request.restartKey, /^local-restart:100:2:12:/);
assert(Object.isFrozen(request));

// Explicit negative confirmation is a pure cancellation, not a restart mutation.
const cancelled = applyAuthoritativeLocalRestart(state, request, {
  confirmed: false,
  nowMs: now,
  isOnlineSeatType,
});
assert.deepEqual(cancelled, {
  status: 'not-confirmed',
  applied: false,
  restartKey: request.restartKey,
  nextState: null,
});
assert.equal(state.round, 2);
assert.equal(state.activeSeatId, 'front');
assert.equal(state.deadlineAtMs, now + 10_000);

const applied = applyAuthoritativeLocalRestart(state, request, {
  confirmed: true,
  nowMs: now,
  isOnlineSeatType,
});
assert.equal(applied.status, 'applied');
assert.equal(applied.applied, true);
assert.equal(applied.nextState.round, 2, 'restart must never duplicate/increment the round number');
assert.equal(applied.nextState.completedRounds, 1);
assert.equal(applied.nextState.activeSeatId, 'back', 'round 2 restarts from its original rotated starter');
assert.equal(applied.result.starterSeatId, 'back');
assert.equal(applied.nextState.deadlineAtMs, now + 18_000);
assert.equal(applied.nextState.lifecycle.phase, 'turn-loop');
assert.equal(applied.nextState.lifecycle.presentationGeneration, state.lifecycle.presentationGeneration + 3);
assert.equal(applied.nextState.revision, 100);
assert.deepEqual(applied.nextState.scores, state.scores);
assert.deepEqual(derivePersistentScoreMarkerState(applied.nextState).countsBySeat, markersBefore, 'restart preserves match score markers');
assert.deepEqual(applied.nextState.skips, []);
assert.equal(applied.nextState.lastMove, null);
assert.equal(applied.nextState.roundEndRevision, null);
assert.equal(applied.nextState.winner, null);
assert.equal(applied.nextState.draw, false);
assert.deepEqual(applied.nextState.restart, { right: false, back: false, left: false, front: false });
assert.deepEqual(applied.nextState.rematch, { right: false, back: false, left: false, front: false });
for (const cell of Object.values(applied.nextState.board)) assert.deepEqual(cell, {});
for (const inventory of Object.values(applied.nextState.inventory)) {
  assert.deepEqual(inventory, { small: 3, medium: 3, large: 3 });
}

// Idempotence: same confirmed request cannot restart again because generation and
// deadline changed even though round/revision/host seat remain the same.
const duplicate = applyAuthoritativeLocalRestart(applied.nextState, request, {
  confirmed: true,
  nowMs: now,
  isOnlineSeatType,
});
assert.equal(duplicate.status, 'stale');
assert.equal(duplicate.reason, 'authority-witness-changed');
assert.equal(duplicate.applied, false);
assert.equal(duplicate.nextState, null);
assert.equal(applied.nextState.round, 2);

// Pending confirmation becomes invalid once any placement commits, even if a
// malformed/stale adapter kept the old revision/generation/deadline witnesses.
const moveBoard = emptyBoard();
moveBoard['0'].small = 'marble';
const afterPlacement = activeRound({
  activeSeatId: 'back',
  board: moveBoard,
  lastMove: { seatId: 'right', color: 'marble', cell: 0, size: 'small' },
});
const staleAfterMove = applyAuthoritativeLocalRestart(afterPlacement, request, {
  confirmed: true,
  nowMs: now,
  isOnlineSeatType,
});
assert.equal(staleAfterMove.status, 'stale');
assert.equal(staleAfterMove.reason, 'committed-placement');
assert.equal(staleAfterMove.applied, false);
assert.equal(staleAfterMove.nextState, null);
assert.throws(() => createLocalRestartRequest(afterPlacement, {
  isOnlineSeatType,
  source: GAMEPLAY_PRESENTATION_SOURCES.CLICK,
}), /restart_after_committed_placement/);

// Other authority witness changes invalidate a pending confirmation.
const generationChanged = JSON.parse(JSON.stringify(state));
generationChanged.lifecycle.presentationGeneration += 1;
assert.equal(applyAuthoritativeLocalRestart(generationChanged, request, {
  confirmed: true,
  nowMs: now,
  isOnlineSeatType,
}).status, 'stale');
const deadlineChanged = JSON.parse(JSON.stringify(state));
deadlineChanged.deadlineAtMs += 1;
assert.equal(applyAuthoritativeLocalRestart(deadlineChanged, request, {
  confirmed: true,
  nowMs: now,
  isOnlineSeatType,
}).status, 'stale');
const revisionChanged = JSON.parse(JSON.stringify(state));
revisionChanged.revision += 1;
assert.equal(applyAuthoritativeLocalRestart(revisionChanged, request, {
  confirmed: true,
  nowMs: now,
  isOnlineSeatType,
}).status, 'stale');

assert.throws(() => applyAuthoritativeLocalRestart(state, request, {
  nowMs: now,
  isOnlineSeatType,
}), /restart_confirmation_required/);
assert.throws(() => createLocalRestartRequest(state, {
  isOnlineSeatType,
  source: GAMEPLAY_PRESENTATION_SOURCES.NONE,
}), /restart_confirmation_source_required/);
assert.throws(() => createLocalRestartRequest(state, {
  isOnlineSeatType,
  source: GAMEPLAY_PRESENTATION_SOURCES.DRAG_RELEASE,
}), /restart_confirmation_source_required/);

// Preferred-color rotation also defines who the local host seat is.
const goldState = activeRound({
  preferredColor: 'gold',
  targetPlayers: 2,
  activeSeatId: 'front',
  scores: { left: 1, front: 0 },
  skips: [],
});
const goldRequest = createLocalRestartRequest(goldState, {
  isOnlineSeatType,
  source: GAMEPLAY_PRESENTATION_SOURCES.TAP,
});
assert.equal(goldRequest.intent.authority.seat, 'left');
const goldRestart = applyAuthoritativeLocalRestart(goldState, goldRequest, {
  confirmed: true,
  nowMs: now,
  isOnlineSeatType,
});
assert.equal(goldRestart.nextState.activeSeatId, 'front', 'round 2 starter follows left→front configured order');
assert.equal(goldRestart.nextState.round, 2);

// Local restart is forbidden when any configured seat is Online; later online
// restart/consensus authority belongs to THREEJS-076.
const onlineState = activeRound({
  targetPlayers: 2,
  activeSeatId: 'right',
  scores: { right: 0, back: 0 },
  skips: [],
  types: ['host-human', 'online-human'],
});
assert.throws(() => createLocalRestartRequest(onlineState, {
  isOnlineSeatType,
}), /online_session_not_local_deadline_authority/);

console.log('THREEJS-055 local restart contract: PASS');
