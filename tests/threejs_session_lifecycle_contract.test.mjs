import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  createCanonicalSessionState,
  runCanonicalSessionReducer,
} from '../web/app/session/canonical-session-state.js';
import {
  SESSION_LIFECYCLE_EVENT_TYPES,
  SESSION_LIFECYCLE_INTERRUPTS,
  SESSION_LIFECYCLE_PHASES,
  SESSION_LIFECYCLE_TRANSITIONS,
  assertSessionLifecycleState,
  createSessionLifecycleState,
  reduceSessionLifecycle,
} from '../web/app/session/session-lifecycle.js';

const P = SESSION_LIFECYCLE_PHASES;
const I = SESSION_LIFECYCLE_INTERRUPTS;
const E = SESSION_LIFECYCLE_EVENT_TYPES;

assert.deepEqual(Object.values(P), [
  'boot',
  'loading',
  'handoff',
  'room-reveal',
  'entry',
  'setup',
  'invitations-ready',
  'unboxing',
  'tutorial',
  'round-ready',
  'turn-loop',
  'win',
  'draw',
  'reset',
  'match-end',
]);
assert.deepEqual(Object.values(I), ['asset-error', 'offline', 'reconnect', 'cancelled', 'context-lost']);
assert.deepEqual(Object.keys(SESSION_LIFECYCLE_TRANSITIONS).sort(), [...Object.values(P)].sort(), 'every normal phase needs an explicit transition set');

function advance(lifecycle, to, generation = lifecycle.presentationGeneration) {
  return reduceSessionLifecycle(lifecycle, {
    type: E.ADVANCE,
    to,
    presentationGeneration: generation,
  });
}

function interrupt(lifecycle, interruptType, recoveryTarget, generation = lifecycle.presentationGeneration) {
  return reduceSessionLifecycle(lifecycle, {
    type: E.INTERRUPT,
    interrupt: interruptType,
    recoveryTarget,
    presentationGeneration: generation,
  });
}

function recover(lifecycle, generation = lifecycle.presentationGeneration) {
  return reduceSessionLifecycle(lifecycle, {
    type: E.RECOVER,
    presentationGeneration: generation,
  });
}

let lifecycle = createSessionLifecycleState();
assert.deepEqual(lifecycle, {
  phase: P.BOOT,
  interrupt: null,
  recoveryTarget: null,
  presentationGeneration: 0,
});

// Full host path, including tutorial and match end.
for (const phase of [
  P.LOADING,
  P.HANDOFF,
  P.ROOM_REVEAL,
  P.ENTRY,
  P.SETUP,
  P.INVITATIONS_READY,
  P.UNBOXING,
  P.TUTORIAL,
  P.ROUND_READY,
  P.TURN_LOOP,
  P.WIN,
  P.RESET,
  P.MATCH_END,
]) {
  const before = lifecycle.presentationGeneration;
  lifecycle = advance(lifecycle, phase);
  assert.equal(lifecycle.phase, phase);
  assert.equal(lifecycle.presentationGeneration, before + 1);
  assert.equal(lifecycle.interrupt, null);
}

// Match-end actions are explicit legal exits: rematch -> round-ready, return -> setup.
const rematch = advance(lifecycle, P.ROUND_READY);
assert.equal(rematch.phase, P.ROUND_READY);
const returnToSetup = advance(createSessionLifecycleState({ phase: P.MATCH_END }), P.SETUP);
assert.equal(returnToSetup.phase, P.SETUP);

// Invitees may skip host setup after entry; tutorial is optional; invitations can reconfigure.
let invitee = createSessionLifecycleState({ phase: P.ENTRY });
invitee = advance(invitee, P.INVITATIONS_READY);
assert.equal(invitee.phase, P.INVITATIONS_READY);
const reconfigure = advance(invitee, P.SETUP);
assert.equal(reconfigure.phase, P.SETUP);
let tutorialSkip = createSessionLifecycleState({ phase: P.UNBOXING });
tutorialSkip = advance(tutorialSkip, P.ROUND_READY);
assert.equal(tutorialSkip.phase, P.ROUND_READY);

// Draw follows the same reset boundary, and reset can continue another round.
let drawPath = createSessionLifecycleState({ phase: P.TURN_LOOP });
drawPath = advance(drawPath, P.DRAW);
drawPath = advance(drawPath, P.RESET);
drawPath = advance(drawPath, P.ROUND_READY);
assert.equal(drawPath.phase, P.ROUND_READY);

assert.throws(() => advance(createSessionLifecycleState(), P.TURN_LOOP), /illegal_lifecycle_transition/);
assert.throws(() => reduceSessionLifecycle(createSessionLifecycleState(), {
  type: E.ADVANCE,
  to: P.LOADING,
  presentationGeneration: 0,
  hiddenPhase: true,
}), /invalid_lifecycle_advance_event_shape/);

// Offline -> reconnect -> recovery preserves one captured recovery target.
let network = createSessionLifecycleState({ phase: P.TURN_LOOP, presentationGeneration: 7 });
network = interrupt(network, I.OFFLINE, P.TURN_LOOP);
assert.deepEqual(network, {
  phase: P.TURN_LOOP,
  interrupt: I.OFFLINE,
  recoveryTarget: P.TURN_LOOP,
  presentationGeneration: 8,
});
assert.throws(() => advance(network, P.WIN), /lifecycle_interrupted/);
network = interrupt(network, I.RECONNECT, P.TURN_LOOP);
assert.equal(network.interrupt, I.RECONNECT);
assert.equal(network.recoveryTarget, P.TURN_LOOP);
assert.equal(network.presentationGeneration, 9);
network = recover(network);
assert.deepEqual(network, {
  phase: P.TURN_LOOP,
  interrupt: null,
  recoveryTarget: null,
  presentationGeneration: 10,
});
assert.throws(() => advance(network, P.WIN, 9), /stale_presentation_generation/, 'stale callbacks cannot advance lifecycle');

// Asset retry may deliberately return to loading; context loss resumes the exact phase.
let asset = createSessionLifecycleState({ phase: P.UNBOXING });
asset = interrupt(asset, I.ASSET_ERROR, P.LOADING);
asset = recover(asset);
assert.equal(asset.phase, P.LOADING);
let context = createSessionLifecycleState({ phase: P.UNBOXING });
context = interrupt(context, I.CONTEXT_LOST, P.UNBOXING);
context = recover(context);
assert.equal(context.phase, P.UNBOXING);

// Cancellation is terminal and has no recovery target.
let cancelled = createSessionLifecycleState({ phase: P.SETUP });
cancelled = interrupt(cancelled, I.CANCELLED, null);
assert.deepEqual(cancelled, {
  phase: P.SETUP,
  interrupt: I.CANCELLED,
  recoveryTarget: null,
  presentationGeneration: 1,
});
assert.throws(() => recover(cancelled), /lifecycle_cancelled/);
assert.throws(() => advance(cancelled, P.INVITATIONS_READY), /lifecycle_cancelled/);

// Hydrated lifecycle snapshots and constructors must reject unreachable or parallel state.
assert.throws(() => assertSessionLifecycleState({
  phase: P.TURN_LOOP,
  interrupt: I.OFFLINE,
  recoveryTarget: P.SETUP,
  presentationGeneration: 4,
}), /invalid_lifecycle_recovery_target/);
assert.throws(() => assertSessionLifecycleState({
  phase: P.SETUP,
  interrupt: null,
  recoveryTarget: P.SETUP,
  presentationGeneration: 0,
}), /recovery_target_without_interrupt/);
assert.throws(() => createSessionLifecycleState(new Date('2026-08-19T00:00:00Z')), /invalid_session_lifecycle/);
assert.throws(() => assertSessionLifecycleState({
  phase: P.SETUP,
  interrupt: null,
  recoveryTarget: null,
  presentationGeneration: 0,
  isLoading: false,
}), /invalid_session_lifecycle_shape/, 'parallel lifecycle booleans are forbidden');
assert.throws(() => createSessionLifecycleState({
  phase: P.SETUP,
  isLoading: false,
}), /invalid_session_lifecycle_shape/, 'constructors cannot silently discard parallel lifecycle booleans');
assert.throws(() => createCanonicalSessionState({
  lifecycle: { phase: P.SETUP, hiddenPhase: 'legacy-loading' },
}), /invalid_session_lifecycle_shape/, 'canonical construction rejects hidden lifecycle phases/flags');

// Canonical state owns lifecycle truth; callbacks submit a generation-bound event.
const canonical = createCanonicalSessionState();
const loading = runCanonicalSessionReducer(canonical, {
  type: E.ADVANCE,
  to: P.LOADING,
  presentationGeneration: canonical.lifecycle.presentationGeneration,
}, (state, event) => ({
  ...state,
  lifecycle: reduceSessionLifecycle(state.lifecycle, event),
}));
assert.equal(canonical.lifecycle.phase, P.BOOT, 'authoritative input stays unchanged');
assert.equal(loading.lifecycle.phase, P.LOADING, 'reducer commits lifecycle before presentation consumes it');
assert.equal(loading.lifecycle.presentationGeneration, 1);
assert.equal(loading.revision, canonical.revision, 'presentation generation does not invent gameplay revision semantics');
assert.throws(() => runCanonicalSessionReducer(loading, {
  type: E.ADVANCE,
  to: P.HANDOFF,
  presentationGeneration: 0,
}, (state, event) => ({ ...state, lifecycle: reduceSessionLifecycle(state.lifecycle, event) })), /stale_presentation_generation/);

const lifecycleSource = await readFile(new URL('../web/app/session/session-lifecycle.js', import.meta.url), 'utf8');
assert.doesNotMatch(lifecycleSource, /\bdocument\.|\bwindow\.|\bsetTimeout\s*\(|\bsetInterval\s*\(|\bfetch\s*\(|THREE\./, 'lifecycle model must stay engine/runtime neutral');

console.log('THREEJS-060 lifecycle state machine contract: PASS');
