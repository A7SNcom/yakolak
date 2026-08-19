// THREEJS-060: engine-neutral lifecycle truth. Presentation/network callbacks may
// request these events, but only this pure state transition model commits them.

export const SESSION_LIFECYCLE_PHASES = Object.freeze({
  BOOT: 'boot',
  LOADING: 'loading',
  HANDOFF: 'handoff',
  ROOM_REVEAL: 'room-reveal',
  ENTRY: 'entry',
  SETUP: 'setup',
  INVITATIONS_READY: 'invitations-ready',
  UNBOXING: 'unboxing',
  TUTORIAL: 'tutorial',
  ROUND_READY: 'round-ready',
  TURN_LOOP: 'turn-loop',
  WIN: 'win',
  DRAW: 'draw',
  RESET: 'reset',
  MATCH_END: 'match-end',
});

export const SESSION_LIFECYCLE_INTERRUPTS = Object.freeze({
  ASSET_ERROR: 'asset-error',
  OFFLINE: 'offline',
  RECONNECT: 'reconnect',
  CANCELLED: 'cancelled',
  CONTEXT_LOST: 'context-lost',
});

export const SESSION_LIFECYCLE_EVENT_TYPES = Object.freeze({
  ADVANCE: 'advance',
  INTERRUPT: 'interrupt',
  RECOVER: 'recover',
});

export const SESSION_LIFECYCLE_TRANSITIONS = Object.freeze({
  [SESSION_LIFECYCLE_PHASES.BOOT]: Object.freeze([SESSION_LIFECYCLE_PHASES.LOADING]),
  [SESSION_LIFECYCLE_PHASES.LOADING]: Object.freeze([SESSION_LIFECYCLE_PHASES.HANDOFF]),
  [SESSION_LIFECYCLE_PHASES.HANDOFF]: Object.freeze([SESSION_LIFECYCLE_PHASES.ROOM_REVEAL]),
  [SESSION_LIFECYCLE_PHASES.ROOM_REVEAL]: Object.freeze([SESSION_LIFECYCLE_PHASES.ENTRY]),
  [SESSION_LIFECYCLE_PHASES.ENTRY]: Object.freeze([
    SESSION_LIFECYCLE_PHASES.SETUP,
    SESSION_LIFECYCLE_PHASES.INVITATIONS_READY,
  ]),
  [SESSION_LIFECYCLE_PHASES.SETUP]: Object.freeze([SESSION_LIFECYCLE_PHASES.INVITATIONS_READY]),
  [SESSION_LIFECYCLE_PHASES.INVITATIONS_READY]: Object.freeze([
    SESSION_LIFECYCLE_PHASES.SETUP,
    SESSION_LIFECYCLE_PHASES.UNBOXING,
  ]),
  [SESSION_LIFECYCLE_PHASES.UNBOXING]: Object.freeze([
    SESSION_LIFECYCLE_PHASES.TUTORIAL,
    SESSION_LIFECYCLE_PHASES.ROUND_READY,
  ]),
  [SESSION_LIFECYCLE_PHASES.TUTORIAL]: Object.freeze([SESSION_LIFECYCLE_PHASES.ROUND_READY]),
  [SESSION_LIFECYCLE_PHASES.ROUND_READY]: Object.freeze([SESSION_LIFECYCLE_PHASES.TURN_LOOP]),
  [SESSION_LIFECYCLE_PHASES.TURN_LOOP]: Object.freeze([
    SESSION_LIFECYCLE_PHASES.WIN,
    SESSION_LIFECYCLE_PHASES.DRAW,
  ]),
  [SESSION_LIFECYCLE_PHASES.WIN]: Object.freeze([SESSION_LIFECYCLE_PHASES.RESET]),
  [SESSION_LIFECYCLE_PHASES.DRAW]: Object.freeze([SESSION_LIFECYCLE_PHASES.RESET]),
  [SESSION_LIFECYCLE_PHASES.RESET]: Object.freeze([
    SESSION_LIFECYCLE_PHASES.ROUND_READY,
    SESSION_LIFECYCLE_PHASES.MATCH_END,
  ]),
  [SESSION_LIFECYCLE_PHASES.MATCH_END]: Object.freeze([
    SESSION_LIFECYCLE_PHASES.ROUND_READY,
    SESSION_LIFECYCLE_PHASES.SETUP,
  ]),
});

const PHASES = new Set(Object.values(SESSION_LIFECYCLE_PHASES));
const INTERRUPTS = new Set(Object.values(SESSION_LIFECYCLE_INTERRUPTS));
const EVENT_TYPES = new Set(Object.values(SESSION_LIFECYCLE_EVENT_TYPES));
const RECOVERABLE_INTERRUPTS = new Set([
  SESSION_LIFECYCLE_INTERRUPTS.ASSET_ERROR,
  SESSION_LIFECYCLE_INTERRUPTS.OFFLINE,
  SESSION_LIFECYCLE_INTERRUPTS.RECONNECT,
  SESSION_LIFECYCLE_INTERRUPTS.CONTEXT_LOST,
]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireRecord(value, code) {
  if (!isPlainRecord(value)) fail(code);
  return value;
}

function requireExactKeys(value, expected, code) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(code);
}

function requireGeneration(value) {
  if (!Number.isInteger(value) || value < 0) fail('invalid_presentation_generation');
  return value;
}

function requirePhase(value, code = 'invalid_lifecycle_phase') {
  if (!PHASES.has(value)) fail(code);
  return value;
}

function requireInterrupt(value) {
  if (!INTERRUPTS.has(value)) fail('invalid_lifecycle_interrupt');
  return value;
}

function frozenLifecycle({ phase, interrupt, recoveryTarget, presentationGeneration }) {
  return Object.freeze({ phase, interrupt, recoveryTarget, presentationGeneration });
}

export function assertSessionLifecycleState(lifecycle) {
  requireRecord(lifecycle, 'invalid_session_lifecycle');
  requireExactKeys(
    lifecycle,
    ['phase', 'interrupt', 'recoveryTarget', 'presentationGeneration'],
    'invalid_session_lifecycle_shape',
  );
  requirePhase(lifecycle.phase);
  requireGeneration(lifecycle.presentationGeneration);

  if (lifecycle.interrupt === null) {
    if (lifecycle.recoveryTarget !== null) fail('recovery_target_without_interrupt');
    return lifecycle;
  }

  requireInterrupt(lifecycle.interrupt);
  if (lifecycle.interrupt === SESSION_LIFECYCLE_INTERRUPTS.CANCELLED) {
    if (lifecycle.recoveryTarget !== null) fail('cancelled_lifecycle_has_recovery_target');
    return lifecycle;
  }

  if (!RECOVERABLE_INTERRUPTS.has(lifecycle.interrupt)) fail('nonrecoverable_lifecycle_interrupt');
  requirePhase(lifecycle.recoveryTarget, 'invalid_lifecycle_recovery_target');
  return lifecycle;
}

export function createSessionLifecycleState({
  phase = SESSION_LIFECYCLE_PHASES.BOOT,
  interrupt = null,
  recoveryTarget = null,
  presentationGeneration = 0,
} = {}) {
  const lifecycle = { phase, interrupt, recoveryTarget, presentationGeneration };
  assertSessionLifecycleState(lifecycle);
  return frozenLifecycle(lifecycle);
}

function assertExpectedGeneration(lifecycle, expected) {
  requireGeneration(expected);
  if (expected !== lifecycle.presentationGeneration) fail('stale_presentation_generation');
}

function validateRecoveryTargetForInterrupt(lifecycle, interrupt, recoveryTarget) {
  if (interrupt === SESSION_LIFECYCLE_INTERRUPTS.CANCELLED) {
    if (recoveryTarget !== null) fail('cancelled_lifecycle_has_recovery_target');
    return;
  }

  requirePhase(recoveryTarget, 'invalid_lifecycle_recovery_target');

  // Once an interruption has captured a recovery target, changing the visible
  // interruption (for example offline -> reconnect) cannot rewrite that target.
  if (lifecycle.interrupt !== null && lifecycle.recoveryTarget !== recoveryTarget) {
    fail('lifecycle_recovery_target_changed');
  }

  if (
    interrupt === SESSION_LIFECYCLE_INTERRUPTS.OFFLINE ||
    interrupt === SESSION_LIFECYCLE_INTERRUPTS.RECONNECT ||
    interrupt === SESSION_LIFECYCLE_INTERRUPTS.CONTEXT_LOST
  ) {
    if (recoveryTarget !== lifecycle.phase) fail('invalid_lifecycle_recovery_target');
    return;
  }

  if (interrupt === SESSION_LIFECYCLE_INTERRUPTS.ASSET_ERROR) {
    if (recoveryTarget !== lifecycle.phase && recoveryTarget !== SESSION_LIFECYCLE_PHASES.LOADING) {
      fail('invalid_lifecycle_recovery_target');
    }
  }
}

export function reduceSessionLifecycle(lifecycle, event) {
  assertSessionLifecycleState(lifecycle);
  requireRecord(event, 'invalid_lifecycle_event');
  if (!EVENT_TYPES.has(event.type)) fail('invalid_lifecycle_event_type');

  if (lifecycle.interrupt === SESSION_LIFECYCLE_INTERRUPTS.CANCELLED) {
    fail('lifecycle_cancelled');
  }

  if (event.type === SESSION_LIFECYCLE_EVENT_TYPES.ADVANCE) {
    requireExactKeys(event, ['type', 'to', 'presentationGeneration'], 'invalid_lifecycle_advance_event_shape');
    assertExpectedGeneration(lifecycle, event.presentationGeneration);
    if (lifecycle.interrupt !== null) fail('lifecycle_interrupted');
    const to = requirePhase(event.to);
    if (!SESSION_LIFECYCLE_TRANSITIONS[lifecycle.phase].includes(to)) fail('illegal_lifecycle_transition');
    return frozenLifecycle({
      phase: to,
      interrupt: null,
      recoveryTarget: null,
      presentationGeneration: lifecycle.presentationGeneration + 1,
    });
  }

  if (event.type === SESSION_LIFECYCLE_EVENT_TYPES.INTERRUPT) {
    requireExactKeys(
      event,
      ['type', 'interrupt', 'recoveryTarget', 'presentationGeneration'],
      'invalid_lifecycle_interrupt_event_shape',
    );
    assertExpectedGeneration(lifecycle, event.presentationGeneration);
    const interrupt = requireInterrupt(event.interrupt);
    validateRecoveryTargetForInterrupt(lifecycle, interrupt, event.recoveryTarget);
    return frozenLifecycle({
      phase: lifecycle.phase,
      interrupt,
      recoveryTarget: interrupt === SESSION_LIFECYCLE_INTERRUPTS.CANCELLED ? null : event.recoveryTarget,
      presentationGeneration: lifecycle.presentationGeneration + 1,
    });
  }

  requireExactKeys(event, ['type', 'presentationGeneration'], 'invalid_lifecycle_recover_event_shape');
  assertExpectedGeneration(lifecycle, event.presentationGeneration);
  if (lifecycle.interrupt === null) fail('lifecycle_not_interrupted');
  if (!RECOVERABLE_INTERRUPTS.has(lifecycle.interrupt)) fail('lifecycle_not_recoverable');
  const phase = requirePhase(lifecycle.recoveryTarget, 'invalid_lifecycle_recovery_target');
  return frozenLifecycle({
    phase,
    interrupt: null,
    recoveryTarget: null,
    presentationGeneration: lifecycle.presentationGeneration + 1,
  });
}
