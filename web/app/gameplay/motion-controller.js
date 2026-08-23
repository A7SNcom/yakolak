import { RESOURCE_OWNERSHIP } from '../core/resource-registry.js';
import { assertSessionLifecycleState } from '../session/session-lifecycle.js';

export const MOTION_EASINGS = Object.freeze({
  linear: t => t,
  easeOutCubic: t => 1 - ((1 - t) ** 3),
  easeInOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2),
});

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

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function requireRegistry(resourceRegistry) {
  if (!resourceRegistry?.createScope) fail('motion_resource_registry_required');
  return resourceRegistry;
}

function requireClock(clock) {
  if (typeof clock !== 'function') fail('motion_clock_required');
  return clock;
}

function clockNow(clock) {
  const value = Number(clock());
  if (!Number.isFinite(value) || value < 0) fail('invalid_motion_clock');
  return value;
}

function requireGeneration(value) {
  if (!Number.isInteger(value) || value < 0) fail('invalid_motion_generation');
  return value;
}

function requireRevision(value) {
  if (!Number.isInteger(value) || value < 0) fail('invalid_motion_revision');
  return value;
}

function requireScopeOrKey(value, code) {
  if (typeof value !== 'string' || !value || value.length > 256) fail(code);
  return value;
}

function requireDuration(value, code = 'invalid_motion_duration') {
  const durationMs = Number(value);
  if (!Number.isFinite(durationMs) || durationMs < 0) fail(code);
  return durationMs;
}

function optionalDuration(value) {
  if (value === undefined || value === null) return null;
  return requireDuration(value, 'invalid_reduced_motion_duration');
}

function requireBoolean(value, code) {
  if (typeof value !== 'boolean') fail(code);
  return value;
}

function requireFunction(value, code) {
  if (typeof value !== 'function') fail(code);
  return value;
}

function normalizeNumericTree(value, path = 'value') {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`invalid_motion_numeric_tree:${path}`);
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map((child, index) => normalizeNumericTree(child, `${path}[${index}]`)));
  }
  if (isPlainRecord(value)) {
    const normalized = {};
    for (const key of Object.keys(value).sort()) normalized[key] = normalizeNumericTree(value[key], `${path}.${key}`);
    return deepFreeze(normalized);
  }
  fail(`invalid_motion_numeric_tree:${path}`);
}

function assertMatchingShape(from, to, path = 'value') {
  if (typeof from === 'number' || typeof to === 'number') {
    if (typeof from !== 'number' || typeof to !== 'number') fail(`motion_shape_mismatch:${path}`);
    return;
  }
  if (Array.isArray(from) || Array.isArray(to)) {
    if (!Array.isArray(from) || !Array.isArray(to) || from.length !== to.length) fail(`motion_shape_mismatch:${path}`);
    from.forEach((child, index) => assertMatchingShape(child, to[index], `${path}[${index}]`));
    return;
  }
  if (!isPlainRecord(from) || !isPlainRecord(to)) fail(`motion_shape_mismatch:${path}`);
  const fromKeys = Object.keys(from).sort();
  const toKeys = Object.keys(to).sort();
  if (fromKeys.length !== toKeys.length || fromKeys.some((key, index) => key !== toKeys[index])) fail(`motion_shape_mismatch:${path}`);
  for (const key of fromKeys) assertMatchingShape(from[key], to[key], `${path}.${key}`);
}

function interpolateTree(from, to, t) {
  if (typeof from === 'number') return from + (to - from) * t;
  if (Array.isArray(from)) return Object.freeze(from.map((child, index) => interpolateTree(child, to[index], t)));
  const output = {};
  for (const key of Object.keys(from)) output[key] = interpolateTree(from[key], to[key], t);
  return deepFreeze(output);
}

function resolveEasing(easing) {
  if (typeof easing === 'string') {
    const resolved = MOTION_EASINGS[easing];
    if (!resolved) fail('unknown_motion_easing');
    return { name: easing, fn: resolved };
  }
  if (typeof easing === 'function') return { name: 'custom', fn: easing };
  fail('motion_easing_required');
}

function motionId(scope, key) {
  return `${scope}::${key}`;
}

function resultFor(entry, status, reason = null) {
  return deepFreeze({
    scope: entry.scope,
    key: entry.key,
    generation: entry.generation,
    revision: entry.revision,
    sequence: entry.sequence,
    status,
    reason,
    timingMode: entry.timingMode,
    snapAttempted: entry.snapAttempted,
    snappedCanonical: entry.snappedCanonical,
  });
}

function settledHandle({ scope, key, generation, revision, sequence, status, reason = null }) {
  const result = deepFreeze({
    scope,
    key,
    generation,
    revision,
    sequence,
    status,
    reason,
    timingMode: 'stale',
    snapAttempted: false,
    snappedCanonical: false,
  });
  return Object.freeze({
    scope,
    key,
    generation,
    revision,
    sequence,
    finished: Promise.resolve(result),
    cancel: () => false,
  });
}

export function createMotionController({
  resourceRegistry,
  clock = () => performance.now(),
  reducedMotion = false,
  reducedMotionQuery = null,
  generation = 0,
  revision = 0,
} = {}) {
  const registry = requireRegistry(resourceRegistry);
  const now = requireClock(clock);
  let currentGeneration = requireGeneration(generation);
  let currentRevision = requireRevision(revision);
  let reduced = requireBoolean(reducedMotion, 'invalid_reduced_motion');
  if (reducedMotionQuery !== null) {
    if (!reducedMotionQuery?.addEventListener || !reducedMotionQuery?.removeEventListener) fail('invalid_reduced_motion_query');
    reduced = Boolean(reducedMotionQuery.matches);
  }

  const lifecycle = registry.createScope('motion-controller', {
    ownership: RESOURCE_OWNERSHIP.TRANSIENT,
  });
  const active = new Map();
  let sequence = 0;
  let disposed = false;

  function assertLive() {
    if (disposed) fail('motion_controller_disposed');
  }

  function authorityMatches(entry) {
    return currentGeneration === entry.generation && currentRevision === entry.revision;
  }

  function entryIsCurrent(entry) {
    return !disposed && authorityMatches(entry) && active.get(entry.id) === entry;
  }

  function targetIsLive(entry) {
    const value = entry.isTargetLive();
    if (typeof value !== 'boolean') fail('motion_target_liveness_must_return_boolean');
    return value;
  }

  function cancelFrame(entry, reason) {
    const token = entry.frameToken;
    entry.frameToken = null;
    if (token?.active) token.cancel(`motion-${reason}`);
  }

  function settle(entry, status, reason = null) {
    if (entry.settled) return false;
    cancelFrame(entry, reason || status);
    if (active.get(entry.id) === entry) active.delete(entry.id);
    entry.settled = true;
    entry.resolve(resultFor(entry, status, reason));
    return true;
  }

  function snapCanonical(entry, reason) {
    if (entry.snapAttempted || entry.settled) return false;
    entry.snapAttempted = true;
    if (!targetIsLive(entry)) return false;
    entry.snapToCanonical(deepFreeze({
      scope: entry.scope,
      key: entry.key,
      generation: entry.generation,
      revision: entry.revision,
      controllerGeneration: currentGeneration,
      controllerRevision: currentRevision,
      sequence: entry.sequence,
      reason,
    }));
    entry.snappedCanonical = true;
    return true;
  }

  function cancelEntry(entry, reason = 'cancelled', { snap = true } = {}) {
    if (!entry || entry.settled) return false;
    cancelFrame(entry, reason);
    if (snap) {
      try {
        snapCanonical(entry, reason);
      } catch (error) {
        settle(entry, 'error', error?.code || error?.message || 'motion-canonical-snap-error');
        return true;
      }
    }
    return settle(entry, 'cancelled', reason);
  }

  function applyEntry(entry, value, progress, easedProgress) {
    if (!entryIsCurrent(entry)) return false;
    if (!targetIsLive(entry)) {
      settle(entry, 'stale-target', 'target-released-or-rebuilt');
      return false;
    }
    entry.apply(value, deepFreeze({
      scope: entry.scope,
      key: entry.key,
      generation: entry.generation,
      revision: entry.revision,
      sequence: entry.sequence,
      progress,
      easedProgress,
      timingMode: entry.timingMode,
    }));
    return true;
  }

  function failEntry(entry, error, stage) {
    settle(entry, 'error', error?.code || error?.message || stage);
    throw error;
  }

  function effectiveDurationFor(entry, useReduced = reduced) {
    if (!useReduced) return entry.durationMs;
    return entry.reducedDurationMs === null ? 0 : entry.reducedDurationMs;
  }

  function progressAt(entry, timeMs) {
    if (entry.effectiveDurationMs === 0) return 1;
    return Math.min(1, Math.max(0, timeMs - entry.startedAtMs) / entry.effectiveDurationMs);
  }

  function scheduleFrame(entry) {
    if (!entryIsCurrent(entry) || entry.settled) return;
    entry.frameToken = lifecycle.requestFrame(() => {
      entry.frameToken = null;
      if (!entryIsCurrent(entry) || entry.settled) return;
      try {
        if (!targetIsLive(entry)) {
          settle(entry, 'stale-target', 'target-released-or-rebuilt');
          return;
        }
        const progress = progressAt(entry, clockNow(now));
        const easedProgress = entry.easing.fn(progress);
        if (!Number.isFinite(easedProgress)) fail('invalid_motion_easing_result');
        if (!applyEntry(entry, interpolateTree(entry.from, entry.to, easedProgress), progress, easedProgress)) return;
        if (progress >= 1) settle(entry, 'completed');
        else scheduleFrame(entry);
      } catch (error) {
        failEntry(entry, error, 'motion-frame-error');
      }
    }, { label: `motion-frame:${entry.scope}:${entry.key}` });
  }

  function completeImmediately(entry, status, reason) {
    if (!entryIsCurrent(entry) || entry.settled) return false;
    if (!targetIsLive(entry)) {
      settle(entry, 'stale-target', 'target-released-or-rebuilt');
      return false;
    }
    if (!applyEntry(entry, entry.to, 1, 1)) return false;
    settle(entry, status, reason);
    return true;
  }

  function retimeEntry(entry, useReduced) {
    if (!entryIsCurrent(entry) || entry.settled) return false;
    const nextDurationMs = effectiveDurationFor(entry, useReduced);
    const nextTimingMode = useReduced ? 'reduced' : 'normal';
    if (entry.effectiveDurationMs === nextDurationMs && entry.timingMode === nextTimingMode) return false;

    cancelFrame(entry, useReduced ? 'reduced-motion-retime' : 'normal-motion-retime');
    try {
      const timeMs = clockNow(now);
      const progress = progressAt(entry, timeMs);
      entry.timingMode = nextTimingMode;
      entry.effectiveDurationMs = nextDurationMs;
      if (nextDurationMs === 0) {
        completeImmediately(entry, 'reduced-motion', 'reduced-motion-final-state');
        return true;
      }
      entry.startedAtMs = timeMs - progress * nextDurationMs;
      if (progress >= 1) completeImmediately(entry, 'completed', null);
      else scheduleFrame(entry);
      return true;
    } catch (error) {
      failEntry(entry, error, 'motion-retime-error');
    }
  }

  function animate({
    scope,
    key,
    generation: motionGeneration,
    revision: motionRevision,
    durationMs,
    reducedDurationMs = null,
    from,
    to,
    easing = 'easeOutCubic',
    apply,
    isTargetLive,
    snapToCanonical,
  } = {}) {
    assertLive();
    const normalizedScope = requireScopeOrKey(scope, 'motion_scope_required');
    const normalizedKey = requireScopeOrKey(key, 'motion_key_required');
    const requestedGeneration = requireGeneration(motionGeneration);
    const requestedRevision = requireRevision(motionRevision);
    const duration = requireDuration(durationMs);
    const reducedDuration = optionalDuration(reducedDurationMs);
    if (reducedDuration !== null && reducedDuration > duration) fail('reduced_motion_duration_must_not_exceed_normal');
    const normalizedFrom = normalizeNumericTree(from, 'from');
    const normalizedTo = normalizeNumericTree(to, 'to');
    assertMatchingShape(normalizedFrom, normalizedTo);
    const resolvedEasing = resolveEasing(easing);
    const applyFn = requireFunction(apply, 'motion_apply_required');
    const targetLiveness = requireFunction(isTargetLive, 'motion_target_liveness_required');
    const snapFn = requireFunction(snapToCanonical, 'motion_snap_to_canonical_required');
    const id = motionId(normalizedScope, normalizedKey);
    const motionSequence = ++sequence;

    if (requestedGeneration !== currentGeneration) {
      return settledHandle({
        scope: normalizedScope,
        key: normalizedKey,
        generation: requestedGeneration,
        revision: requestedRevision,
        sequence: motionSequence,
        status: 'stale-generation',
        reason: `controller-generation-${currentGeneration}`,
      });
    }
    if (requestedRevision !== currentRevision) {
      return settledHandle({
        scope: normalizedScope,
        key: normalizedKey,
        generation: requestedGeneration,
        revision: requestedRevision,
        sequence: motionSequence,
        status: 'stale-revision',
        reason: `controller-revision-${currentRevision}`,
      });
    }

    const previous = active.get(id);
    if (previous) cancelEntry(previous, 'superseded-by-newer-motion');

    let resolveFinished;
    const finished = new Promise(resolve => { resolveFinished = resolve; });
    const entry = {
      id,
      scope: normalizedScope,
      key: normalizedKey,
      generation: requestedGeneration,
      revision: requestedRevision,
      sequence: motionSequence,
      durationMs: duration,
      reducedDurationMs: reducedDuration,
      effectiveDurationMs: reduced ? (reducedDuration ?? 0) : duration,
      timingMode: reduced ? 'reduced' : 'normal',
      from: normalizedFrom,
      to: normalizedTo,
      easing: resolvedEasing,
      apply: applyFn,
      isTargetLive: targetLiveness,
      snapToCanonical: snapFn,
      snapAttempted: false,
      snappedCanonical: false,
      startedAtMs: clockNow(now),
      frameToken: null,
      settled: false,
      resolve: resolveFinished,
    };
    active.set(id, entry);

    const handle = Object.freeze({
      scope: entry.scope,
      key: entry.key,
      generation: entry.generation,
      revision: entry.revision,
      sequence: entry.sequence,
      finished,
      cancel: (reason = 'cancelled-by-consumer') => {
        if (active.get(id) !== entry) return false;
        return cancelEntry(entry, reason);
      },
    });

    try {
      if (!targetIsLive(entry)) {
        settle(entry, 'stale-target', 'target-released-or-rebuilt');
        return handle;
      }
      if (entry.effectiveDurationMs === 0) {
        completeImmediately(
          entry,
          reduced && duration > 0 ? 'reduced-motion' : 'completed',
          reduced && duration > 0 ? 'reduced-motion-final-state' : null,
        );
        return handle;
      }
      applyEntry(entry, entry.from, 0, 0);
      if (!entry.settled) scheduleFrame(entry);
      return handle;
    } catch (error) {
      failEntry(entry, error, 'motion-start-error');
    }
  }

  function cancel(scope, key, reason = 'cancelled-by-controller') {
    assertLive();
    const id = motionId(
      requireScopeOrKey(scope, 'motion_scope_required'),
      requireScopeOrKey(key, 'motion_key_required'),
    );
    return cancelEntry(active.get(id), reason);
  }

  function cancelScope(scope, reason = 'motion-scope-cancelled') {
    assertLive();
    const normalizedScope = requireScopeOrKey(scope, 'motion_scope_required');
    let count = 0;
    for (const entry of [...active.values()]) {
      if (entry.scope === normalizedScope && cancelEntry(entry, reason)) count += 1;
    }
    return count;
  }

  function setAuthority(nextGeneration, nextRevision) {
    assertLive();
    const generationValue = requireGeneration(nextGeneration);
    const revisionValue = requireRevision(nextRevision);
    if (generationValue === currentGeneration && revisionValue === currentRevision) {
      return deepFreeze({ generation: currentGeneration, revision: currentRevision });
    }
    const generationChanged = generationValue !== currentGeneration;
    const revisionChanged = revisionValue !== currentRevision;
    currentGeneration = generationValue;
    currentRevision = revisionValue;
    const reason = generationChanged && revisionChanged
      ? 'generation-and-revision-changed'
      : generationChanged
        ? 'generation-changed'
        : 'revision-changed';
    for (const entry of [...active.values()]) cancelEntry(entry, reason);
    return deepFreeze({ generation: currentGeneration, revision: currentRevision });
  }

  function setGeneration(nextGeneration) {
    return setAuthority(nextGeneration, currentRevision).generation;
  }

  function setRevision(nextRevision) {
    return setAuthority(currentGeneration, nextRevision).revision;
  }

  function syncSessionAuthority(sessionLifecycle, authoritativeRevision) {
    assertLive();
    assertSessionLifecycleState(sessionLifecycle);
    return setAuthority(sessionLifecycle.presentationGeneration, requireRevision(authoritativeRevision));
  }

  function setReducedMotion(value) {
    assertLive();
    const next = requireBoolean(value, 'invalid_reduced_motion');
    if (next === reduced) return reduced;
    reduced = next;
    for (const entry of [...active.values()]) retimeEntry(entry, reduced);
    return reduced;
  }

  if (reducedMotionQuery !== null) {
    lifecycle.listen(reducedMotionQuery, 'change', event => {
      if (disposed) return;
      setReducedMotion(Boolean(event.matches));
    }, undefined, { label: 'motion-prefers-reduced-motion' });
  }

  function snapshot() {
    return deepFreeze({
      disposed,
      generation: currentGeneration,
      revision: currentRevision,
      reducedMotion: reduced,
      activeCount: active.size,
      active: [...active.values()]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(entry => ({
          scope: entry.scope,
          key: entry.key,
          generation: entry.generation,
          revision: entry.revision,
          sequence: entry.sequence,
          durationMs: entry.durationMs,
          reducedDurationMs: entry.reducedDurationMs,
          effectiveDurationMs: entry.effectiveDurationMs,
          timingMode: entry.timingMode,
          easing: entry.easing.name,
          frameActive: Boolean(entry.frameToken?.active),
          snapAttempted: entry.snapAttempted,
          snappedCanonical: entry.snappedCanonical,
        })),
    });
  }

  function release() {
    if (disposed) return false;
    for (const entry of [...active.values()]) cancelEntry(entry, 'controller-released');
    disposed = true;
    lifecycle.release('motion-controller-released');
    return true;
  }

  return Object.freeze({
    animate,
    cancel,
    cancelScope,
    setAuthority,
    setGeneration,
    setRevision,
    syncSessionAuthority,
    setReducedMotion,
    snapshot,
    release,
    dispose: release,
  });
}
