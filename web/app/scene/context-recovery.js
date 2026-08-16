export const GRAPHICS_CONTEXT_STATES = Object.freeze({
  READY: 'ready',
  LOST: 'lost',
  RESTORING: 'restoring',
  FAILED: 'failed',
});

function normalizeError(error) {
  if (error instanceof Error) return error;
  return new Error(String(error || 'Unknown graphics recovery failure'));
}

export function createContextRecoveryController({ canvas, restoreResources = () => {} }) {
  if (!canvas || typeof canvas.addEventListener !== 'function') {
    throw new TypeError('Context recovery requires the owned WebGL canvas');
  }
  if (typeof restoreResources !== 'function') {
    throw new TypeError('Context recovery requires a restoreResources callback');
  }

  const subscribers = new Set();
  let disposed = false;
  let state = GRAPHICS_CONTEXT_STATES.READY;
  let generation = 0;
  let restoreCount = 0;
  let failure = null;
  let restorationPromise = null;

  function snapshot() {
    return Object.freeze({
      state,
      generation,
      restoreCount,
      canUseGpu: !disposed && state === GRAPHICS_CONTEXT_STATES.READY,
      failure: failure ? Object.freeze({ name: failure.name, message: failure.message }) : null,
    });
  }

  function emit() {
    const next = snapshot();
    for (const subscriber of subscribers) subscriber(next);
    return next;
  }

  function transition(nextState, error = null) {
    state = nextState;
    failure = error ? normalizeError(error) : null;
    return emit();
  }

  function onContextLost(event) {
    if (disposed) return;
    event?.preventDefault?.();
    if (state === GRAPHICS_CONTEXT_STATES.LOST || state === GRAPHICS_CONTEXT_STATES.RESTORING) return;

    generation += 1;
    restorationPromise = null;
    transition(GRAPHICS_CONTEXT_STATES.LOST);
  }

  function onContextRestored() {
    if (disposed || state !== GRAPHICS_CONTEXT_STATES.LOST || restorationPromise) return;

    const restoringGeneration = generation;
    transition(GRAPHICS_CONTEXT_STATES.RESTORING);
    restorationPromise = Promise.resolve()
      .then(() => restoreResources(Object.freeze({ generation: restoringGeneration })))
      .then(() => {
        if (disposed || generation !== restoringGeneration) return snapshot();
        restoreCount += 1;
        return transition(GRAPHICS_CONTEXT_STATES.READY);
      })
      .catch((error) => {
        if (disposed || generation !== restoringGeneration) return snapshot();
        return transition(GRAPHICS_CONTEXT_STATES.FAILED, error);
      });
  }

  function subscribe(subscriber, { emitCurrent = true } = {}) {
    if (typeof subscriber !== 'function') throw new TypeError('Context subscriber must be a function');
    if (disposed) throw new Error('Context recovery has been disposed');
    subscribers.add(subscriber);
    if (emitCurrent) subscriber(snapshot());
    return () => subscribers.delete(subscriber);
  }

  function whenSettled() {
    return restorationPromise || Promise.resolve(snapshot());
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('webglcontextrestored', onContextRestored);
    subscribers.clear();
  }

  canvas.addEventListener('webglcontextlost', onContextLost, false);
  canvas.addEventListener('webglcontextrestored', onContextRestored, false);

  return Object.freeze({
    subscribe,
    snapshot,
    whenSettled,
    dispose,
    get canUseGpu() {
      return !disposed && state === GRAPHICS_CONTEXT_STATES.READY;
    },
  });
}
