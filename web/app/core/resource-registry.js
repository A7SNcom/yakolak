// THREEJS-027: the only owner allowed to destroy presentation resources or lifecycle handles.
export const RESOURCE_OWNERSHIP = Object.freeze({
  SHARED_IMMUTABLE: 'shared-immutable',
  GENERATION_SCOPED: 'generation-scoped',
  TRANSIENT: 'transient',
});

export const RESOURCE_KINDS = Object.freeze({
  GEOMETRY: 'geometry',
  MATERIAL: 'material',
  TEXTURE: 'texture',
  IMAGE_BITMAP: 'image-bitmap',
  RENDER_TARGET: 'render-target',
  SHADOW_MAP: 'shadow-map',
  RENDERER: 'renderer',
  INSTANCED_MESH: 'instanced-mesh',
  LOADER: 'loader',
  DECODER: 'decoder',
  SHADER_VARIANT: 'shader-variant',
  MATERIAL_VARIANT: 'material-variant',
  ANIMATION_FRAME: 'animation-frame',
  TIMEOUT: 'timeout',
  INTERVAL: 'interval',
  OBSERVER: 'observer',
  LISTENER: 'listener',
  SUBSCRIPTION: 'subscription',
  DOM_NODE: 'dom-node',
  CLEANUP: 'cleanup',
  OTHER: 'other',
});

const OWNERSHIP_VALUES = new Set(Object.values(RESOURCE_OWNERSHIP));
const KIND_VALUES = new Set(Object.values(RESOURCE_KINDS));
const GPU_KINDS = new Set([
  RESOURCE_KINDS.GEOMETRY,
  RESOURCE_KINDS.MATERIAL,
  RESOURCE_KINDS.TEXTURE,
  RESOURCE_KINDS.RENDER_TARGET,
  RESOURCE_KINDS.SHADOW_MAP,
  RESOURCE_KINDS.RENDERER,
  RESOURCE_KINDS.INSTANCED_MESH,
  RESOURCE_KINDS.SHADER_VARIANT,
  RESOURCE_KINDS.MATERIAL_VARIANT,
]);

function inferKind(resource) {
  if (!resource) return RESOURCE_KINDS.OTHER;
  if (resource.isWebGLRenderer) return RESOURCE_KINDS.RENDERER;
  if (resource.isInstancedMesh) return RESOURCE_KINDS.INSTANCED_MESH;
  if (resource.isWebGLRenderTarget) return RESOURCE_KINDS.RENDER_TARGET;
  if (resource.isTexture) return RESOURCE_KINDS.TEXTURE;
  if (resource.isMaterial) return RESOURCE_KINDS.MATERIAL;
  if (resource.isBufferGeometry) return RESOURCE_KINDS.GEOMETRY;
  if (typeof ImageBitmap !== 'undefined' && resource instanceof ImageBitmap) return RESOURCE_KINDS.IMAGE_BITMAP;
  return RESOURCE_KINDS.OTHER;
}

function normaliseMetadata(metadata = {}) {
  const ownership = metadata.ownership || RESOURCE_OWNERSHIP.TRANSIENT;
  const kind = metadata.kind || RESOURCE_KINDS.OTHER;
  if (!OWNERSHIP_VALUES.has(ownership)) throw new TypeError(`Unknown resource ownership: ${ownership}`);
  if (!KIND_VALUES.has(kind)) throw new TypeError(`Unknown resource kind: ${kind}`);
  return {
    ...metadata,
    ownership,
    kind,
    scope: metadata.scope || 'root',
    label: metadata.label || '',
    replacementKey: metadata.replacementKey || null,
  };
}

function createNoopToken() {
  return Object.freeze({
    id: null,
    get active() { return false; },
    release: () => false,
    cancel: () => false,
  });
}

export function createResourceRegistry({
  platform = globalThis,
  onDisposalError = null,
} = {}) {
  const entries = new Map();
  const objectEntries = new WeakMap();
  const scopeEntries = new Map();
  const replacementEntries = new Map();
  const sharedEntries = new Map();
  const disposalErrors = [];
  let sequence = 0;
  let scopeSequence = 0;
  let currentGeneration = 0;
  let contextLost = false;
  let disposed = false;

  function assertLive() {
    if (disposed) throw new Error('Resource registry is disposed');
  }

  function recordError(error, entry, reason) {
    const failure = Object.freeze({
      id: entry.id,
      kind: entry.kind,
      ownership: entry.ownership,
      scope: entry.scope,
      label: entry.label,
      reason,
      message: error?.message || String(error),
    });
    disposalErrors.push(failure);
    try {
      onDisposalError?.(failure, error);
    } catch {
      // Disposal reporting is never allowed to make teardown non-idempotent.
    }
  }

  function addToScope(entry) {
    if (!scopeEntries.has(entry.scope)) scopeEntries.set(entry.scope, new Set());
    scopeEntries.get(entry.scope).add(entry.id);
  }

  function removeFromIndexes(entry) {
    scopeEntries.get(entry.scope)?.delete(entry.id);
    if (entry.replacementKey && replacementEntries.get(entry.replacementKey) === entry.id) {
      replacementEntries.delete(entry.replacementKey);
    }
    if (entry.sharedKey && sharedEntries.get(entry.sharedKey) === entry.id) {
      sharedEntries.delete(entry.sharedKey);
    }
    if (entry.resource && (typeof entry.resource === 'object' || typeof entry.resource === 'function')) {
      if (objectEntries.get(entry.resource) === entry.id) objectEntries.delete(entry.resource);
    }
  }

  function runDefaultCleanup(entry) {
    const resource = entry.resource;
    if (!resource) return;

    switch (entry.kind) {
      case RESOURCE_KINDS.IMAGE_BITMAP:
        resource.close?.();
        return;
      case RESOURCE_KINDS.RENDERER:
        resource.setAnimationLoop?.(null);
        resource.dispose?.();
        if (!contextLost) resource.forceContextLoss?.();
        return;
      case RESOURCE_KINDS.INSTANCED_MESH:
      case RESOURCE_KINDS.GEOMETRY:
      case RESOURCE_KINDS.MATERIAL:
      case RESOURCE_KINDS.TEXTURE:
      case RESOURCE_KINDS.RENDER_TARGET:
      case RESOURCE_KINDS.SHADOW_MAP:
      case RESOURCE_KINDS.SHADER_VARIANT:
      case RESOURCE_KINDS.MATERIAL_VARIANT:
        resource.dispose?.();
        return;
      case RESOURCE_KINDS.OBSERVER:
        resource.disconnect?.();
        return;
      case RESOURCE_KINDS.DOM_NODE:
        resource.remove?.();
        return;
      case RESOURCE_KINDS.LOADER:
      case RESOURCE_KINDS.DECODER:
        if (typeof resource.dispose === 'function') resource.dispose();
        else resource.close?.();
        return;
      case RESOURCE_KINDS.OTHER:
      default:
        // Opaque resources without an explicit cleanup are registry-owned no-op resources.
    }
  }

  function releaseId(id, reason = 'released') {
    const entry = entries.get(id);
    if (!entry || entry.released) return false;

    // Mark first: cleanup may recurse, throw, or dispatch events.
    entry.released = true;
    removeFromIndexes(entry);
    try {
      if (typeof entry.cleanup === 'function') entry.cleanup(reason);
      else runDefaultCleanup(entry);
    } catch (error) {
      recordError(error, entry, reason);
    } finally {
      entries.delete(id);
    }
    return true;
  }

  function tokenFor(id) {
    const token = {
      id,
      get active() {
        const entry = entries.get(id);
        return Boolean(entry && !entry.released);
      },
      release(reason = 'released') {
        return releaseId(id, reason);
      },
      cancel(reason = 'cancelled') {
        return releaseId(id, reason);
      },
    };
    return Object.freeze(token);
  }

  function activeObjectEntry(resource) {
    if (resource == null) return null;
    const objectLike = typeof resource === 'object' || typeof resource === 'function';
    if (!objectLike) return null;
    const id = objectEntries.get(resource);
    const entry = id ? entries.get(id) : null;
    return entry && !entry.released ? entry : null;
  }

  function assertObjectRegistrationAllowed(resource, normalised) {
    const existing = activeObjectEntry(resource);
    if (
      existing
      && existing.scope !== normalised.scope
      && existing.ownership !== RESOURCE_OWNERSHIP.SHARED_IMMUTABLE
      && !normalised.reclassify
    ) {
      throw new Error(`Resource already owned by another scope: ${existing.scope}`);
    }
    return existing;
  }

  function register(resource, metadata = {}) {
    assertLive();
    if (resource == null) return createNoopToken();

    const inferred = inferKind(resource);
    const normalised = normaliseMetadata({
      ...metadata,
      kind: metadata.kind || inferred,
    });
    const existing = assertObjectRegistrationAllowed(resource, normalised);

    if (normalised.replacementKey) {
      const priorId = replacementEntries.get(normalised.replacementKey);
      if (priorId) {
        const prior = entries.get(priorId);
        if (prior && !prior.released && prior.resource !== resource) {
          releaseId(priorId, 'replaced');
        }
      }
    }

    if (existing) {
      if (normalised.reclassify) {
        if (existing.scope !== normalised.scope) {
          scopeEntries.get(existing.scope)?.delete(existing.id);
          existing.scope = normalised.scope;
          addToScope(existing);
        }
        existing.ownership = normalised.ownership;
        existing.kind = normalised.kind;
        existing.label = normalised.label || existing.label;
      }
      if (normalised.replacementKey) {
        if (
          existing.replacementKey
          && existing.replacementKey !== normalised.replacementKey
          && replacementEntries.get(existing.replacementKey) === existing.id
        ) {
          replacementEntries.delete(existing.replacementKey);
        }
        existing.replacementKey = normalised.replacementKey;
        replacementEntries.set(normalised.replacementKey, existing.id);
      }
      return tokenFor(existing.id);
    }

    const objectLike = typeof resource === 'object' || typeof resource === 'function';
    const id = `resource-${++sequence}`;
    const entry = {
      id,
      resource,
      kind: normalised.kind,
      ownership: normalised.ownership,
      scope: normalised.scope,
      label: normalised.label,
      replacementKey: normalised.replacementKey,
      sharedKey: normalised.sharedKey || null,
      cleanup: normalised.cleanup || null,
      generation: currentGeneration,
      released: false,
    };
    entries.set(id, entry);
    if (objectLike) objectEntries.set(resource, id);
    addToScope(entry);
    if (entry.replacementKey) replacementEntries.set(entry.replacementKey, id);
    if (entry.sharedKey) sharedEntries.set(entry.sharedKey, id);
    return tokenFor(id);
  }

  function replace(replacementKey, resource, metadata = {}) {
    if (!replacementKey) throw new TypeError('Resource replacement requires a stable key');
    return register(resource, { ...metadata, replacementKey });
  }

  function getOrCreateShared(sharedKey, factory, metadata = {}) {
    assertLive();
    if (!sharedKey) throw new TypeError('Shared resource requires a stable key');
    if (typeof factory !== 'function') throw new TypeError('Shared resource factory must be a function');
    normaliseMetadata({
      ...metadata,
      ownership: RESOURCE_OWNERSHIP.SHARED_IMMUTABLE,
      replacementKey: `shared:${sharedKey}`,
    });
    const activeId = sharedEntries.get(sharedKey);
    const active = activeId ? entries.get(activeId) : null;
    if (active && !active.released) return active.resource;

    const resource = factory();
    register(resource, {
      ...metadata,
      ownership: RESOURCE_OWNERSHIP.SHARED_IMMUTABLE,
      sharedKey,
      replacementKey: `shared:${sharedKey}`,
    });
    return resource;
  }

  function walkKnownResources(value, visit, seen = new WeakSet()) {
    if (value == null) return;
    if (typeof value !== 'object' && typeof value !== 'function') return;
    if (seen.has(value)) return;
    seen.add(value);

    const kind = inferKind(value);
    if (kind !== RESOURCE_KINDS.OTHER) {
      visit(value, kind);
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) walkKnownResources(item, visit, seen);
      return;
    }
    if (value instanceof Map || value instanceof Set) {
      for (const item of value.values()) walkKnownResources(item, visit, seen);
      return;
    }

    // Decoded YAKOLAK GLB component bundles are intentionally the only plain-object
    // aggregate traversed here; arbitrary runtime JSON must never be recursively owned.
    if (value.format === 'yakolak-glb-components-v1' && Array.isArray(value.components)) {
      for (const component of value.components) walkKnownResources(component?.geometry, visit, seen);
    }
  }

  function adoptDeep(value, metadata = {}) {
    const tokens = [];
    walkKnownResources(value, (resource, kind) => {
      tokens.push(register(resource, { ...metadata, kind }));
    });
    return Object.freeze(tokens);
  }

  function releaseDeep(value, reason = 'released') {
    let releasedCount = 0;
    walkKnownResources(value, (resource) => {
      const id = objectEntries.get(resource);
      if (id && releaseId(id, reason)) releasedCount += 1;
    });
    return releasedCount;
  }

  function releaseDeepInScope(value, scope, reason = 'released') {
    let releasedCount = 0;
    walkKnownResources(value, (resource) => {
      const id = objectEntries.get(resource);
      if (!id) return;
      const entry = entries.get(id);
      if (
        entry
        && !entry.released
        && entry.scope === scope
        && entry.ownership !== RESOURCE_OWNERSHIP.SHARED_IMMUTABLE
        && releaseId(id, reason)
      ) {
        releasedCount += 1;
      }
    });
    return releasedCount;
  }

  function releaseScope(scope, reason = 'scope-released', { includeShared = false } = {}) {
    const ids = [...(scopeEntries.get(scope) || [])];
    let releasedCount = 0;
    for (const id of ids.reverse()) {
      const entry = entries.get(id);
      if (!entry || entry.released) continue;
      if (!includeShared && entry.ownership === RESOURCE_OWNERSHIP.SHARED_IMMUTABLE) continue;
      if (releaseId(id, reason)) releasedCount += 1;
    }
    const remaining = [...(scopeEntries.get(scope) || [])].filter((id) => {
      const entry = entries.get(id);
      return entry && !entry.released;
    });
    if (remaining.length) scopeEntries.set(scope, new Set(remaining));
    else scopeEntries.delete(scope);
    return releasedCount;
  }

  function releaseOwnership(ownership, reason = 'ownership-released') {
    if (!OWNERSHIP_VALUES.has(ownership)) throw new TypeError(`Unknown resource ownership: ${ownership}`);
    const ids = [...entries.values()]
      .filter((entry) => !entry.released && entry.ownership === ownership)
      .map((entry) => entry.id);
    let count = 0;
    for (const id of ids.reverse()) if (releaseId(id, reason)) count += 1;
    return count;
  }

  function beginGeneration(nextGeneration = currentGeneration + 1) {
    assertLive();
    if (nextGeneration === currentGeneration) return currentGeneration;
    releaseOwnership(RESOURCE_OWNERSHIP.GENERATION_SCOPED, 'generation-superseded');
    currentGeneration = nextGeneration;
    return currentGeneration;
  }

  function markContextLost() {
    contextLost = true;
  }

  function markContextRestored() {
    contextLost = false;
  }

  function rollbackExternalSetup(cleanup) {
    try {
      cleanup?.();
    } catch {
      // Rollback is best-effort and must never hide the original setup/registration error.
    }
  }

  function registerAfterExternalSetup(resource, metadata, rollback) {
    try {
      return register(resource, metadata);
    } catch (error) {
      rollbackExternalSetup(rollback);
      throw error;
    }
  }

  function listen(target, type, listener, options, metadata = {}) {
    assertLive();
    if (!target?.addEventListener || !target?.removeEventListener) {
      throw new TypeError('Registry listener target must implement addEventListener/removeEventListener');
    }
    if (typeof listener !== 'function') throw new TypeError('Registry listener must be a function');
    const prepared = normaliseMetadata({ ...metadata, kind: RESOURCE_KINDS.LISTENER });
    const rollback = () => target.removeEventListener(type, listener, options);
    try {
      target.addEventListener(type, listener, options);
    } catch (error) {
      rollbackExternalSetup(rollback);
      throw error;
    }
    const holder = { target, type, listener };
    return registerAfterExternalSetup(holder, {
      ...prepared,
      cleanup: rollback,
    }, rollback);
  }

  function subscribe(subscribeFn, listener, metadata = {}) {
    assertLive();
    if (typeof subscribeFn !== 'function') throw new TypeError('Registry subscription requires a subscribe function');
    const prepared = normaliseMetadata({ ...metadata, kind: RESOURCE_KINDS.SUBSCRIPTION });
    const unsubscribe = subscribeFn(listener);
    if (typeof unsubscribe !== 'function') throw new TypeError('Subscription must return an unsubscribe function');
    const holder = { unsubscribe };
    return registerAfterExternalSetup(holder, {
      ...prepared,
      cleanup: unsubscribe,
    }, unsubscribe);
  }

  function observe(observer, target, options, metadata = {}) {
    assertLive();
    if (!observer?.observe || !observer?.disconnect) throw new TypeError('Registry observer must implement observe/disconnect');
    const prepared = normaliseMetadata({ ...metadata, kind: RESOURCE_KINDS.OBSERVER });
    assertObjectRegistrationAllowed(observer, prepared);
    const rollback = () => observer.disconnect();
    try {
      observer.observe(target, options);
    } catch (error) {
      rollbackExternalSetup(rollback);
      throw error;
    }
    return registerAfterExternalSetup(observer, prepared, rollback);
  }

  function platformFunction(name) {
    const fn = platform?.[name] || globalThis?.[name];
    if (typeof fn !== 'function') throw new Error(`${name} is unavailable`);
    const receiver = platform?.[name] ? platform : globalThis;
    return fn.bind(receiver);
  }

  function oneShot(kind, scheduleName, cancelName, callback, delay, metadata) {
    assertLive();
    if (typeof callback !== 'function') throw new TypeError(`${kind} callback must be a function`);
    const prepared = normaliseMetadata({ ...metadata, kind });
    const scheduleFn = platformFunction(scheduleName);
    const cancelFn = platformFunction(cancelName);
    const holder = { handle: null };
    let token = null;
    let firedBeforeRegistration = false;
    const wrapped = (...args) => {
      if (!token) firedBeforeRegistration = true;
      if (token?.active) {
        const entry = entries.get(token.id);
        if (entry) {
          entry.released = true;
          removeFromIndexes(entry);
          entries.delete(entry.id);
        }
      }
      callback(...args);
    };
    holder.handle = delay == null ? scheduleFn(wrapped) : scheduleFn(wrapped, delay);
    const rollback = () => cancelFn(holder.handle);
    if (firedBeforeRegistration) {
      rollbackExternalSetup(rollback);
      return createNoopToken();
    }
    token = registerAfterExternalSetup(holder, {
      ...prepared,
      cleanup: rollback,
    }, rollback);
    return token;
  }

  function requestFrame(callback, metadata = {}) {
    return oneShot(
      RESOURCE_KINDS.ANIMATION_FRAME,
      'requestAnimationFrame',
      'cancelAnimationFrame',
      callback,
      null,
      metadata,
    );
  }

  function setTimeoutHandle(callback, delay, metadata = {}) {
    return oneShot(
      RESOURCE_KINDS.TIMEOUT,
      'setTimeout',
      'clearTimeout',
      callback,
      Math.max(0, Number(delay) || 0),
      metadata,
    );
  }

  function setIntervalHandle(callback, delay, metadata = {}) {
    assertLive();
    if (typeof callback !== 'function') throw new TypeError('interval callback must be a function');
    const prepared = normaliseMetadata({ ...metadata, kind: RESOURCE_KINDS.INTERVAL });
    const setIntervalFn = platformFunction('setInterval');
    const clearIntervalFn = platformFunction('clearInterval');
    const holder = { handle: setIntervalFn(callback, Math.max(0, Number(delay) || 0)) };
    const rollback = () => clearIntervalFn(holder.handle);
    return registerAfterExternalSetup(holder, {
      ...prepared,
      cleanup: rollback,
    }, rollback);
  }

  function registerCleanup(cleanup, metadata = {}) {
    if (typeof cleanup !== 'function') throw new TypeError('Cleanup must be a function');
    const prepared = normaliseMetadata({
      ...metadata,
      kind: metadata.kind || RESOURCE_KINDS.CLEANUP,
    });
    const holder = { cleanup };
    return register(holder, {
      ...prepared,
      cleanup,
    });
  }

  function createScope(name = 'scope', {
    ownership = RESOURCE_OWNERSHIP.TRANSIENT,
  } = {}) {
    assertLive();
    if (!OWNERSHIP_VALUES.has(ownership)) throw new TypeError(`Unknown resource ownership: ${ownership}`);
    const scope = `${name}#${++scopeSequence}`;
    let released = false;

    function assertScopeLive() {
      assertLive();
      if (released) throw new Error(`Resource scope is released: ${scope}`);
    }

    function scopedMetadata(metadata = {}) {
      assertScopeLive();
      return {
        ...metadata,
        scope,
        ownership: metadata.ownership || ownership,
        replacementKey: metadata.replacementKey ? `${scope}:${metadata.replacementKey}` : null,
      };
    }

    const api = {
      id: scope,
      register: (resource, metadata) => register(resource, scopedMetadata(metadata)),
      replace: (key, resource, metadata) => replace(`${scope}:${key}`, resource, scopedMetadata(metadata)),
      adoptDeep: (value, metadata) => adoptDeep(value, scopedMetadata(metadata)),
      releaseDeep(value, reason = 'released') {
        assertScopeLive();
        return releaseDeepInScope(value, scope, reason);
      },
      listen: (target, type, listener, options, metadata) => listen(target, type, listener, options, scopedMetadata(metadata)),
      subscribe: (subscribeFn, listener, metadata) => subscribe(subscribeFn, listener, scopedMetadata(metadata)),
      observe: (observer, target, options, metadata) => observe(observer, target, options, scopedMetadata(metadata)),
      requestFrame: (callback, metadata) => requestFrame(callback, scopedMetadata(metadata)),
      setTimeout: (callback, delay, metadata) => setTimeoutHandle(callback, delay, scopedMetadata(metadata)),
      setInterval: (callback, delay, metadata) => setIntervalHandle(callback, delay, scopedMetadata(metadata)),
      registerCleanup: (cleanup, metadata) => registerCleanup(cleanup, scopedMetadata(metadata)),
      getOrCreateShared(key, factory, metadata) {
        assertScopeLive();
        return getOrCreateShared(key, factory, { ...metadata, scope });
      },
      release(reason = 'scope-released') {
        if (released) return 0;
        released = true;
        return releaseScope(scope, reason);
      },
      get released() {
        return released;
      },
    };
    return Object.freeze(api);
  }

  function snapshot() {
    const active = [...entries.values()].filter((entry) => !entry.released);
    const countBy = (field) => Object.freeze(Object.fromEntries(
      [...new Set(active.map((entry) => entry[field]))]
        .sort()
        .map((value) => [value, active.filter((entry) => entry[field] === value).length]),
    ));
    return Object.freeze({
      disposed,
      contextLost,
      generation: currentGeneration,
      total: active.length,
      gpuObjects: active.filter((entry) => GPU_KINDS.has(entry.kind)).length,
      imageBitmaps: active.filter((entry) => entry.kind === RESOURCE_KINDS.IMAGE_BITMAP).length,
      loaders: active.filter((entry) => entry.kind === RESOURCE_KINDS.LOADER).length,
      decoders: active.filter((entry) => entry.kind === RESOURCE_KINDS.DECODER).length,
      shaderVariants: active.filter((entry) => entry.kind === RESOURCE_KINDS.SHADER_VARIANT).length,
      materialVariants: active.filter((entry) => entry.kind === RESOURCE_KINDS.MATERIAL_VARIANT).length,
      animationHandles: active.filter((entry) => entry.kind === RESOURCE_KINDS.ANIMATION_FRAME).length,
      timers: active.filter((entry) => entry.kind === RESOURCE_KINDS.TIMEOUT || entry.kind === RESOURCE_KINDS.INTERVAL).length,
      observers: active.filter((entry) => entry.kind === RESOURCE_KINDS.OBSERVER).length,
      listeners: active.filter((entry) => entry.kind === RESOURCE_KINDS.LISTENER).length,
      subscriptions: active.filter((entry) => entry.kind === RESOURCE_KINDS.SUBSCRIPTION).length,
      byKind: countBy('kind'),
      byOwnership: countBy('ownership'),
      byScope: countBy('scope'),
      disposalErrors: Object.freeze([...disposalErrors]),
    });
  }

  function dispose(reason = 'registry-disposed') {
    if (disposed) return false;
    const ids = [...entries.values()].filter((entry) => !entry.released).map((entry) => entry.id);
    for (const id of ids.reverse()) releaseId(id, reason);
    disposed = true;
    return true;
  }

  return Object.freeze({
    register,
    replace,
    getOrCreateShared,
    adoptDeep,
    releaseDeep,
    releaseScope,
    releaseOwnership,
    beginGeneration,
    markContextLost,
    markContextRestored,
    listen,
    subscribe,
    observe,
    requestFrame,
    setTimeout: setTimeoutHandle,
    setInterval: setIntervalHandle,
    registerCleanup,
    createScope,
    snapshot,
    dispose,
    get disposed() { return disposed; },
    get contextLost() { return contextLost; },
    get generation() { return currentGeneration; },
  });
}
