import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { SIZES, emptyBoard } from '../web/app/shared/rules.js';
import { createCanonicalSessionState } from '../web/app/session/canonical-session-state.js';
import { beginAuthoritativeLocalTurnDeadline } from '../web/app/session/local-turn-deadline.js';
import {
  LOCAL_TIMEOUT_SKIP_REASON,
  applyAuthoritativeLocalTimeout,
  createExpiredLocalTimeoutIntent,
} from '../web/app/session/local-timeout.js';

const isOnlineSeatType = type => type === 'online-human';
const startNow = 1_787_165_000_000;

function seats(types = ['host-human', 'computer']) {
  return [
    { seatId: 'right', type: types[0], color: 'marble', ready: true },
    { seatId: 'back', type: types[1], color: 'blue', ready: true },
  ];
}

function turnState({ board = emptyBoard(), revision = 7, activeSeatId = 'right', seatTypes } = {}) {
  return createCanonicalSessionState({
    preferredColor: 'marble',
    targetPlayers: 2,
    winsToMatch: 3,
    seats: seats(seatTypes),
    board,
    activeSeatId,
    scores: { right: 1, back: 0 },
    round: 2,
    completedRounds: 1,
    revision,
    lifecycle: { phase: 'turn-loop' },
  });
}

function startDeadline(state, nowMs = startNow) {
  return beginAuthoritativeLocalTurnDeadline(state, { nowMs, isOnlineSeatType });
}

function exhaustColor(board, color, cells) {
  for (const size of SIZES) {
    for (const cell of cells) board[String(cell)][size] = color;
  }
  return board;
}

const started = startDeadline(turnState());
const deadline = started.deadlineAtMs;
assert.equal(createExpiredLocalTimeoutIntent(started, {
  nowMs: deadline - 1,
  isOnlineSeatType,
}), null, 'no timeout intent exists before the absolute deadline');

const attempt = createExpiredLocalTimeoutIntent(started, {
  nowMs: deadline,
  isOnlineSeatType,
});
assert.equal(attempt.intent.kind, 'timeout');
assert.equal(attempt.intent.origin, 'clock');
assert.equal(attempt.intent.authority.adapter, 'local');
assert.equal(attempt.intent.authority.seat, 'right');
assert.equal(attempt.intent.authority.revision, 7);
assert.deepEqual(attempt.intent.payload, {});
assert.equal(attempt.intent.presentation.source, 'none');
assert.equal(attempt.deadlineAtMs, deadline);
assert.equal(attempt.timeoutKey, `local-timeout:7:${deadline}:right`);
assert(Object.isFrozen(attempt));
assert(Object.isFrozen(attempt.intent));

const beforeBoard = structuredClone(started.board);
const beforeInventory = structuredClone(started.inventory);
const beforeScores = structuredClone(started.scores);
const applied = applyAuthoritativeLocalTimeout(started, attempt, {
  nowMs: deadline,
  isOnlineSeatType,
});
assert.equal(applied.status, 'applied');
assert.equal(applied.applied, true);
assert.equal(applied.handoff.fromSeatId, 'right');
assert.equal(applied.handoff.toSeatId, 'back');
assert.deepEqual(applied.handoff.skips, [{ seatId: 'right', reason: LOCAL_TIMEOUT_SKIP_REASON }]);
assert.equal(applied.nextState.activeSeatId, 'back');
assert.equal(applied.nextState.deadlineAtMs, deadline + 18_000, 'next authoritative turn receives one new 18-second deadline');
assert.equal(applied.nextState.revision, 7, 'THREEJS-050 does not invent revision semantics owned by THREEJS-072');
assert.equal(applied.nextState.draw, false);
assert.deepEqual(applied.nextState.board, beforeBoard, 'timeout consumes no piece and changes no board slot');
assert.deepEqual(applied.nextState.inventory, beforeInventory, 'timeout cannot change board-derived inventory');
assert.deepEqual(applied.nextState.scores, beforeScores, 'timeout cannot award score');

// Same attempt cannot apply twice. It is stale against the new active turn/deadline.
const duplicate = applyAuthoritativeLocalTimeout(applied.nextState, attempt, {
  nowMs: deadline,
  isOnlineSeatType,
});
assert.equal(duplicate.status, 'stale');
assert.equal(duplicate.applied, false);
assert.equal(duplicate.nextState, null);
assert.equal(applied.nextState.deadlineAtMs, deadline + 18_000);
assert.equal(createExpiredLocalTimeoutIntent(applied.nextState, {
  nowMs: deadline,
  isOnlineSeatType,
}), null, 'duplicate callback cannot create another timeout for the fresh deadline');

// Strong same-seat case: if every other configured seat has no legal move, 048
// permits the timed-out seat to receive a consecutive turn. The deadline witness,
// not seat/revision alone, still makes the old timeout attempt stale.
let onlyRightBoard = emptyBoard();
onlyRightBoard = exhaustColor(onlyRightBoard, 'blue', [0, 1, 2]);
const sameSeatStarted = startDeadline(turnState({ board: onlyRightBoard }), startNow + 100_000);
const sameSeatDeadline = sameSeatStarted.deadlineAtMs;
const sameSeatAttempt = createExpiredLocalTimeoutIntent(sameSeatStarted, {
  nowMs: sameSeatDeadline,
  isOnlineSeatType,
});
const sameSeatApplied = applyAuthoritativeLocalTimeout(sameSeatStarted, sameSeatAttempt, {
  nowMs: sameSeatDeadline,
  isOnlineSeatType,
});
assert.equal(sameSeatApplied.status, 'applied');
assert.equal(sameSeatApplied.nextState.activeSeatId, 'right');
assert.equal(sameSeatApplied.nextState.revision, sameSeatStarted.revision);
assert.equal(sameSeatApplied.nextState.deadlineAtMs, sameSeatDeadline + 18_000);
assert.deepEqual(sameSeatApplied.nextState.skips, [
  { seatId: 'right', reason: 'timeout' },
  { seatId: 'back', reason: 'no_legal_move' },
]);
assert.equal(sameSeatApplied.nextState.draw, false, 'timeout cycle cannot draw while right still has a legal move');
const sameSeatDuplicate = applyAuthoritativeLocalTimeout(sameSeatApplied.nextState, sameSeatAttempt, {
  nowMs: sameSeatDeadline,
  isOnlineSeatType,
});
assert.equal(sameSeatDuplicate.status, 'stale', 'same seat + same revision still cannot replay an old deadline timeout');

// Background resume may observe the old deadline very late. The timed-out turn does
// not get extended; the *new* turn starts at the authoritative resume transition.
const suspendedStarted = startDeadline(turnState(), startNow + 200_000);
const suspendedAttempt = createExpiredLocalTimeoutIntent(suspendedStarted, {
  nowMs: suspendedStarted.deadlineAtMs + 65_000,
  isOnlineSeatType,
});
const resumeNow = suspendedStarted.deadlineAtMs + 65_000;
const resumed = applyAuthoritativeLocalTimeout(suspendedStarted, suspendedAttempt, {
  nowMs: resumeNow,
  isOnlineSeatType,
});
assert.equal(resumed.status, 'applied');
assert.equal(resumed.nextState.deadlineAtMs, resumeNow + 18_000);
assert.equal(applyAuthoritativeLocalTimeout(resumed.nextState, suspendedAttempt, {
  nowMs: resumeNow,
  isOnlineSeatType,
}).status, 'stale');

// If no configured seat has a legal placement, 050 exposes exact evidence but does
// not commit draw. THREEJS-051 exclusively owns the draw transition.
let blockedBoard = emptyBoard();
blockedBoard = exhaustColor(blockedBoard, 'marble', [0, 1, 2]);
blockedBoard = exhaustColor(blockedBoard, 'blue', [3, 4, 5]);
const blockedStarted = startDeadline(turnState({ board: blockedBoard }), startNow + 300_000);
const blockedAttempt = createExpiredLocalTimeoutIntent(blockedStarted, {
  nowMs: blockedStarted.deadlineAtMs,
  isOnlineSeatType,
});
const blockedResult = applyAuthoritativeLocalTimeout(blockedStarted, blockedAttempt, {
  nowMs: blockedStarted.deadlineAtMs,
  isOnlineSeatType,
});
assert.equal(blockedResult.status, 'requires-draw-resolution');
assert.equal(blockedResult.applied, false);
assert.equal(blockedResult.nextState, null);
assert.equal(blockedStarted.draw, false);
assert.deepEqual(blockedResult.handoff.skips, [
  { seatId: 'back', reason: 'no_legal_move' },
  { seatId: 'right', reason: 'no_legal_move' },
]);
assert.deepEqual(blockedStarted.board, blockedBoard, 'draw evidence collection cannot mutate board');

// Attempt identity is tied to current active seat + revision + exact deadline.
const revisionChanged = JSON.parse(JSON.stringify(started));
revisionChanged.revision += 1;
assert.equal(applyAuthoritativeLocalTimeout(revisionChanged, attempt, {
  nowMs: deadline,
  isOnlineSeatType,
}).status, 'stale');
const seatChanged = JSON.parse(JSON.stringify(started));
seatChanged.activeSeatId = 'back';
assert.equal(applyAuthoritativeLocalTimeout(seatChanged, attempt, {
  nowMs: deadline,
  isOnlineSeatType,
}).status, 'stale');
const deadlineChanged = JSON.parse(JSON.stringify(started));
deadlineChanged.deadlineAtMs += 1;
assert.equal(applyAuthoritativeLocalTimeout(deadlineChanged, attempt, {
  nowMs: deadlineChanged.deadlineAtMs,
  isOnlineSeatType,
}).status, 'stale');

// An attempt created at expiry cannot apply if wall clock is later observed before
// that deadline (for example after a wall-clock correction backwards).
assert.equal(applyAuthoritativeLocalTimeout(started, attempt, {
  nowMs: deadline - 1,
  isOnlineSeatType,
}).status, 'not-expired');

const tampered = JSON.parse(JSON.stringify(attempt));
tampered.timeoutKey = 'local-timeout:tampered';
assert.throws(() => applyAuthoritativeLocalTimeout(started, tampered, {
  nowMs: deadline,
  isOnlineSeatType,
}), /invalid_local_timeout_key/);

const onlineStarted = beginAuthoritativeLocalTurnDeadline(createCanonicalSessionState({
  preferredColor: 'marble',
  targetPlayers: 2,
  winsToMatch: 3,
  seats: seats(['host-human', 'online-human']),
  activeSeatId: 'right',
  lifecycle: { phase: 'turn-loop' },
}), { nowMs: startNow, isOnlineSeatType: () => false });
assert.throws(() => createExpiredLocalTimeoutIntent(onlineStarted, {
  nowMs: onlineStarted.deadlineAtMs,
  isOnlineSeatType,
}), /online_session_not_local_deadline_authority/);
assert.throws(() => applyAuthoritativeLocalTimeout(onlineStarted, attempt, {
  nowMs: onlineStarted.deadlineAtMs,
  isOnlineSeatType,
}), /online_session_not_local_deadline_authority/);

const source = await readFile(new URL('../web/app/session/local-timeout.js', import.meta.url), 'utf8');
assert.doesNotMatch(source, /placePiece\s*\(|validatePlacement\s*\(|winningPatterns\s*\(|\bsetTimeout\s*\(|\bsetInterval\s*\(/, 'timeout authority must neither place pieces nor use timer callbacks as authority');
assert.doesNotMatch(source, /\bdocument\.|\bwindow\.|THREE\./, 'timeout authority must remain presentation/engine neutral');

console.log('THREEJS-050 local timeout contract: PASS exactly-once');
