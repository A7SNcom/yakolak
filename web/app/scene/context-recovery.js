import { createResourceRegistry, RESOURCE_OWNERSHIP } from '../core/resource-registry.js';

export const CONTEXT_STATES = Object.freeze({
  READY: 'ready',
  LOST: 'lost',
  RESTORING: 'restoring',
  FAILED: 'failed',
});

function immutableFailure(error) {
  if (!error) return null;
  return Object.freeze({
    name: error?.name || 'Error',
    message: error?.message || String(error),
  });
}

export function createContextRecoveryController({
  canvas,
  restoreResources = async () => {},
  onStateChange = null,
  resourceRegistry = null,
} = {}) {
  if (!canvas?.addEventListener || !canvas?.removeEventListener) {
    throw new TypeError('Context recovery requires an EventTarget canvas');
  }
  if (typeof restoreResources !== 'function') {
    throw new TypeError('Context recovery requires a restoreResources callback');
  }
  if (onStateChange != null && typeof onStateChange !== 'function') {
    throw new TypeError('onStateChange must be a function');
  }

  const ownsRegistry = !resourceRegistry;
  const registry = resourceRegistry || createResourceRegistry();
  const lifecycle = registry.createScope('webgl-context-recovery', {
    ownership: RESOURCE_OWNERSHIP.GENERATION_SCOPED,
  });

  let disposed = false;
  let state = CONTEXT_STATES.READY;
  let generation = 0;
  let restoreCount = 0;
  let failure = null;
  let restorePromise = Promise.resolve();
  const subscribers = new Set();
  const subscriptionTokens = new Map();

  function snapshot() {
    return Object.freeze({
      state,
      generation,
      restoreCount,
      canUseGpu: !disposed && state === CONTEXT_STATES.READY,
      failure,
    });
  }

  function emit() {
    const value = snapshot();
    onStateChange?.(value);
    for (const subscriber of [...subscribers]) subscriber(value);
  }

  function onContextLost(event) {
    event.preventDefault?.();
    if (disposed || state === CONTEXT_STATES.LOST) return;
    generation += 1;
    state = CONTEXT_STATES.LOST;
    failure = null;
    registry.markContextLost();
    emit();
  }

  function onContextRestored() {
    if (disposed || state !== CONTEXT_STATES.LOST) return;
    state = CONTEXT_STATES.RESTORING;
    const restoringGeneration = generation;
    emit();

    restorePromise = Promise.resolve()
      .then(() => restoreResources(Object.freeze({ generation: restoringGeneration })))
      .then(() => {
        if (disposed || generation !== restoringGeneration || state !== CONTEXT_STATES.RESTORING) return;
        restoreCount += 1;
        state = CONTEXT_STATES.READY;
        failure = null;
        registry.markContextRestored();
        emit();
      })
      .catch((error) => {
        if (disposed || generation !== restoringGeneration) return;
        state = CONTEXT_STATES.FAILED;
        failure = immutableFailure(error);
        emit();
      });
  }

  lifecycle.listen(canvas, 'webglcontextlost', onContextLost, false, {
    label: 'webglcontextlost',
    replacementKey: 'lost',
  });
  lifecycle.listen(canvas, 'webglcontextrestored', onContextRestored, false, {
    label: 'webglcontextrestored',
    replacementKey: 'restored',
  });

  function subscribe(subscriber) {
    if (typeof subscriber !== 'function') throw new TypeError('Context-state subscriber must be a function');
    if (disposed) throw new Error('Context recovery controller is disposed');
    subscribers.add(subscriber);
    subscriber(snapshot());

    const token = lifecycle.registerCleanup(() => subscribers.delete(subscriber), {
      kind: 'subscription',
      label: 'context-state-subscriber',
    });
    subscriptionTokens.set(subscriber, token);

    return () => {
      subscriptionTokens.delete(subscriber);
      token.release('context-subscription-removed');
    };
  }

  function whenSettled() {
    return restorePromise;
  }

  function release() {
    if (disposed) return;
    disposed = true;
    subscribers.clear();
    subscriptionTokens.clear();
    lifecycle.release('context-recovery-released');
    if (ownsRegistry) registry.dispose('context-recovery-owned-registry-released');
  }

  return Object.freeze({
    subscribe,
    snapshot,
    getSnapshot: snapshot,
    whenSettled,
    release,
    dispose: release,
    get state() {
      return state;
    },
    get canUseGpu() {
      return !disposed && state === CONTEXT_STATES.READY;
    },
    get disposed() {
      return disposed;
    },
  });
}
