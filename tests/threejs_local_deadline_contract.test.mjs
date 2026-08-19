import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createCanonicalSessionState } from '../web/app/session/canonical-session-state.js';
import {
  LOCAL_TURN_DURATION_MS,
  beginAuthoritativeLocalTurnDeadline,
  deriveTurnDeadlineDisplay,
} from '../web/app/session/local-turn-deadline.js';

assert.equal(LOCAL_TURN_DURATION_MS, 18_000);

const isOnlineSeatType = type => type === 'online-human';
const localSeats = [
  { seatId: 'right', type: 'host-human', color: 'marble', ready: true },
  { seatId: 'back', type: 'computer', color: 'blue', ready: true },
];

function localTurn(overrides = {}) {
  return createCanonicalSessionState({
    preferredColor: 'marble',
    targetPlayers: 2,
    winsToMatch: 3,
    seats: localSeats,
    activeSeatId: 'right',
    lifecycle: { phase: 'turn-loop' },
    ...overrides,
  });
}

const now = 1_787_164_000_000;
const before = localTurn();
const started = beginAuthoritativeLocalTurnDeadline(before, { nowMs: now, isOnlineSeatType });
assert.equal(before.deadlineAtMs, null, 'deadline start must not mutate prior canonical state');
assert.equal(started.deadlineAtMs, now + 18_000);
assert.equal(started.activeSeatId, 'right');
assert.equal(started.revision, before.revision, 'deadline start does not invent gameplay revision semantics');
assert(Object.isFrozen(started));

assert.deepEqual(deriveTurnDeadlineDisplay(started, now), {
  deadlineAtMs: now + 18_000,
  remainingMs: 18_000,
  remainingSeconds: 18,
  expired: false,
});
assert.deepEqual(deriveTurnDeadlineDisplay(started, now + 1_000), {
  deadlineAtMs: now + 18_000,
  remainingMs: 17_000,
  remainingSeconds: 17,
  expired: false,
});
assert.deepEqual(deriveTurnDeadlineDisplay(started, now + 17_001), {
  deadlineAtMs: now + 18_000,
  remainingMs: 999,
  remainingSeconds: 1,
  expired: false,
});
assert.deepEqual(deriveTurnDeadlineDisplay(started, now + 18_000), {
  deadlineAtMs: now + 18_000,
  remainingMs: 0,
  remainingSeconds: 0,
  expired: true,
});

// Visibility suspension / slow frames are represented by a large wall-clock jump.
// The deadline remains the original absolute value and display simply clamps to 0.
const afterSuspension = deriveTurnDeadlineDisplay(started, now + 65_000);
assert.deepEqual(afterSuspension, {
  deadlineAtMs: now + 18_000,
  remainingMs: 0,
  remainingSeconds: 0,
  expired: true,
});
assert.equal(started.deadlineAtMs, now + 18_000, 'wall-clock reads cannot extend/restart the deadline');

// Duplicate renders/readbacks never create a new deadline.
for (const frameNow of [now + 50, now + 5_500, now + 17_999, now + 30_000]) {
  deriveTurnDeadlineDisplay(started, frameNow);
  assert.equal(started.deadlineAtMs, now + 18_000);
}

// The authority-only begin operation is one-shot for the current turn. A new
// authoritative turn transition must first produce canonical state with no deadline.
assert.throws(
  () => beginAuthoritativeLocalTurnDeadline(started, { nowMs: now + 500, isOnlineSeatType }),
  /local_deadline_already_started/,
);

// Online authority is explicitly excluded without THREEJS-049 defining the future
// seat-type vocabulary: the owning adapter supplies the classifier.
const onlineState = createCanonicalSessionState({
  preferredColor: 'marble',
  targetPlayers: 2,
  winsToMatch: 3,
  seats: [
    { seatId: 'right', type: 'host-human', color: 'marble', ready: true },
    { seatId: 'back', type: 'online-human', color: 'blue', ready: true },
  ],
  activeSeatId: 'right',
  lifecycle: { phase: 'turn-loop' },
});
assert.throws(
  () => beginAuthoritativeLocalTurnDeadline(onlineState, { nowMs: now, isOnlineSeatType }),
  /online_session_not_local_deadline_authority/,
);
assert.throws(
  () => beginAuthoritativeLocalTurnDeadline(before, { nowMs: now }),
  /online_seat_classifier_required/,
);
assert.throws(
  () => beginAuthoritativeLocalTurnDeadline(before, { nowMs: now, isOnlineSeatType: () => 'no' }),
  /online_seat_classifier_must_return_boolean/,
);

assert.throws(
  () => beginAuthoritativeLocalTurnDeadline(localTurn({ activeSeatId: null }), { nowMs: now, isOnlineSeatType }),
  /local_deadline_requires_active_seat/,
);
assert.throws(
  () => beginAuthoritativeLocalTurnDeadline(localTurn({ lifecycle: { phase: 'round-ready' } }), { nowMs: now, isOnlineSeatType }),
  /local_deadline_requires_turn_loop/,
);
assert.throws(
  () => beginAuthoritativeLocalTurnDeadline(localTurn({ lifecycle: {
    phase: 'turn-loop',
    interrupt: 'context-lost',
    recoveryTarget: 'turn-loop',
    presentationGeneration: 1,
  } }), { nowMs: now, isOnlineSeatType }),
  /local_deadline_requires_uninterrupted_turn/,
);
assert.throws(() => beginAuthoritativeLocalTurnDeadline(before, { nowMs: -1, isOnlineSeatType }), /invalid_wall_clock_ms/);
assert.throws(() => beginAuthoritativeLocalTurnDeadline(before, { nowMs: 1.5, isOnlineSeatType }), /invalid_wall_clock_ms/);
assert.throws(() => deriveTurnDeadlineDisplay(started, Number.MAX_SAFE_INTEGER + 1), /invalid_wall_clock_ms/);
assert.throws(
  () => beginAuthoritativeLocalTurnDeadline(before, { nowMs: Number.MAX_SAFE_INTEGER - 10_000, isOnlineSeatType }),
  /invalid_local_deadline/,
);

const noDeadline = deriveTurnDeadlineDisplay(before, now);
assert.deepEqual(noDeadline, {
  deadlineAtMs: null,
  remainingMs: null,
  remainingSeconds: null,
  expired: false,
});

const source = await readFile(new URL('../web/app/session/local-turn-deadline.js', import.meta.url), 'utf8');
assert.doesNotMatch(source, /setTimeout\s*\(|setInterval\s*\(|requestAnimationFrame\s*\(|performance\.now\s*\(|visibilityState|visibilitychange/, 'deadline authority must not depend on decrementing/frame/visibility timers');
assert.doesNotMatch(source, /\bdocument\.|\bwindow\.|THREE\./, 'deadline authority must stay engine/presentation neutral');

console.log('THREEJS-049 local deadline contract: PASS durationMs=18000');
