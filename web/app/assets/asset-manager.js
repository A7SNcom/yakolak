import { ASSET_LIST, ASSET_GROUPS } from './asset-manifest.js';

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();
let stlLoaderPromise = null;

export class AssetUnavailableError extends Error {
  constructor(asset) {
    super(`Runtime asset is not ready: ${asset.logicalId}`);
    this.name = 'AssetUnavailableError';
    this.assetId = asset.logicalId;
  }
}

export class AssetLoadError extends Error {
  constructor(asset, cause) {
    super(`Failed to load asset ${asset.logicalId}: ${cause?.message || cause}`, { cause });
    this.name = 'AssetLoadError';
    this.assetId = asset.logicalId;
    this.asset = asset;
  }
}

export class AssetIntegrityError extends AssetLoadError {
  constructor(asset, actualHash) {
    super(asset, new Error(`integrity mismatch: expected ${asset.source.gitBlobSha}, got ${actualHash}`));
    this.name = 'AssetIntegrityError';
    this.expectedHash = asset.source.gitBlobSha;
    this.actualHash = actualHash;
  }
}

export class AssetGroupNotReadyError extends Error {
  constructor(group, assets) {
    super(`Asset group ${group} is blocked by unavailable required assets: ${assets.map((asset) => asset.logicalId).join(', ')}`);
    this.name = 'AssetGroupNotReadyError';
    this.group = group;
    this.assetIds = Object.freeze(assets.map((asset) => asset.logicalId));
  }
}

export class AssetGroupLoadError extends Error {
  constructor(group, failures) {
    super(`Required assets failed in ${group}`);
    this.name = 'AssetGroupLoadError';
    this.group = group;
    this.failures = Object.freeze(failures.map((failure) => Object.freeze({ ...failure })));
  }
}

export class AssetLoadCancelledError extends Error {
  constructor(group, reason = 'cancelled') {
    super(`Asset loading cancelled for ${group}`);
    this.name = 'AssetLoadCancelledError';
    this.group = group;
    this.reason = reason;
  }
}

function initialState(asset) {
  return {
    id: asset.logicalId,
    group: asset.group,
    status: asset.runtime.ready ? 'idle' : (asset.runtimeRequired ? 'unavailable' : 'optional-unavailable'),
    attempts: 0,
    loadedBytes: 0,
    totalBytes: asset.source.bytes,
    error: null,
  };
}

function disposeResource(resource) {
  if (resource == null) return;
  if (Array.isArray(resource)) {
    for (const item of resource) disposeResource(item);
    return;
  }
  if (resource instanceof Map) {
    for (const item of resource.values()) disposeResource(item);
    return;
  }
  if (typeof resource.dispose === 'function') resource.dispose();
  else if (typeof resource.close === 'function') resource.close();
}

function abortReason(signal) {
  return typeof signal?.reason === 'string' && signal.reason ? signal.reason : 'cancelled';
}

function isAbortError(error) {
  return error?.name === 'AbortError' || error instanceof AssetLoadCancelledError;
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyGitBlobSha(asset, bytes) {
  if (!globalThis.crypto?.subtle) throw new AssetLoadError(asset, new Error('Web Crypto unavailable for integrity verification'));
  const header = textEncoder.encode(`blob ${bytes.byteLength}\0`);
  const payload = new Uint8Array(header.byteLength + bytes.byteLength);
  payload.set(header, 0);
  payload.set(bytes, header.byteLength);
  const digest = await globalThis.crypto.subtle.digest('SHA-1', payload);
  const actualHash = toHex(digest);
  if (actualHash !== asset.source.gitBlobSha) throw new AssetIntegrityError(asset, actualHash);
}

async function getStlLoader() {
  if (!stlLoaderPromise) {
    stlLoaderPromise = import('three/addons/loaders/STLLoader.js').then(({ STLLoader }) => new STLLoader());
  }
  return stlLoaderPromise;
}

async function defaultDecode(asset, bytes) {
  if (asset.runtime.type === 'json') return JSON.parse(textDecoder.decode(bytes));
  if (asset.runtime.type === 'text') return textDecoder.decode(bytes);
  if (asset.runtime.type === 'stl') {
    const loader = await getStlLoader();
    return loader.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  }
  if (asset.runtime.type === 'png') {
    const blob = new Blob([bytes], { type: 'image/png' });
    return typeof createImageBitmap === 'function' ? createImageBitmap(blob) : blob;
  }
  throw new AssetLoadError(asset, new Error(`Unsupported runtime type: ${asset.runtime.type}`));
}

function immutableState(state) {
  return Object.freeze({ ...state });
}

export function createAssetManager({
  manifest = ASSET_LIST,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  decodeImpl = defaultDecode,
  integrityImpl = verifyGitBlobSha,
  onProgress = null,
  concurrency = 3,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Asset manager requires fetch');
  if (typeof decodeImpl !== 'function') throw new TypeError('Asset manager requires a decoder');
  if (typeof integrityImpl !== 'function') throw new TypeError('Asset manager requires an integrity verifier');

  const localManifest = Object.freeze([...manifest]);
  const byId = new Map(localManifest.map((asset) => [asset.logicalId, asset]));
  if (byId.size !== localManifest.length) throw new TypeError('Asset manifest contains duplicate logical IDs');
  for (const asset of localManifest) {
    if (!ASSET_GROUPS[asset.group]) throw new TypeError(`Unknown asset group: ${asset.group}`);
    if (!/^[0-9a-f]{40}$/.test(asset.source?.gitBlobSha || '')) throw new TypeError(`Missing immutable Git blob SHA for ${asset.logicalId}`);
    if (!Number.isInteger(asset.source?.bytes) || asset.source.bytes <= 0) throw new TypeError(`Missing exact byte size for ${asset.logicalId}`);
    if (asset.runtimeRequired && !ASSET_GROUPS[asset.group].blocking) throw new TypeError(`Required asset ${asset.logicalId} cannot be optional`);
  }

  const states = new Map(localManifest.map((asset) => [asset.logicalId, initialState(asset)]));
  const groupStates = new Map(Object.keys(ASSET_GROUPS).map((group) => [group, {
    status: 'idle', attempt: 0, failures: [],
  }]));
  const cache = new Map();
  const assetRuns = new Map();
  const groupRuns = new Map();
  const listeners = new Set();
  let disposed = false;
  if (typeof onProgress === 'function') listeners.add(onProgress);

  function groupEntries(group) {
    return localManifest.filter((asset) => asset.group === group);
  }

  function groupSnapshot(group = null) {
    const selected = group ? groupEntries(group) : localManifest;
    const assetStates = selected.map((asset) => states.get(asset.logicalId));
    const loadedBytes = assetStates.reduce((sum, state) => sum + Math.min(state.loadedBytes, state.totalBytes), 0);
    const totalBytes = assetStates.reduce((sum, state) => sum + state.totalBytes, 0);
    const base = group ? groupStates.get(group) : null;
    return Object.freeze({
      group,
      status: base?.status || null,
      attempt: base?.attempt || 0,
      totalAssets: selected.length,
      readyAssets: assetStates.filter((state) => state.status === 'ready').length,
      failedAssets: assetStates.filter((state) => state.status === 'failed').length,
      cancelledAssets: assetStates.filter((state) => state.status === 'cancelled').length,
      unavailableAssets: assetStates.filter((state) => state.status.includes('unavailable')).length,
      loadingAssets: assetStates.filter((state) => ['loading', 'verifying', 'decoding'].includes(state.status)).length,
      loadedBytes,
      totalBytes,
      percent: totalBytes > 0 ? Math.min(100, (loadedBytes / totalBytes) * 100) : 100,
      failures: Object.freeze([...(base?.failures || [])]),
    });
  }

  function emit(asset = null, group = asset?.group || null) {
    const payload = Object.freeze({
      asset: asset ? immutableState(states.get(asset.logicalId)) : null,
      group: group ? groupSnapshot(group) : null,
      overall: groupSnapshot(null),
    });
    for (const listener of listeners) listener(payload);
  }

  function setAssetState(asset, patch) {
    states.set(asset.logicalId, { ...states.get(asset.logicalId), ...patch });
    emit(asset);
  }

  function setGroupState(group, patch) {
    groupStates.set(group, { ...groupStates.get(group), ...patch });
    emit(null, group);
  }

  async function readResponse(response, asset, signal) {
    if (!response.ok) throw new AssetLoadError(asset, new Error(`HTTP ${response.status}`));
    const reader = response.body?.getReader?.();
    if (!reader) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      setAssetState(asset, { loadedBytes: bytes.byteLength });
      if (signal?.aborted) throw new DOMException('cancelled', 'AbortError');
      return bytes;
    }

    const chunks = [];
    let received = 0;
    try {
      while (true) {
        if (signal?.aborted) {
          await reader.cancel();
          throw new DOMException('cancelled', 'AbortError');
        }
        const { done, value } = await reader.read();
        if (done) break;
        if (!value?.byteLength) continue;
        chunks.push(value);
        received += value.byteLength;
        setAssetState(asset, { loadedBytes: received });
      }
    } finally {
      reader.releaseLock?.();
    }

    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }

  function startAssetFetch(asset, { signal = null, retry = false } = {}) {
    if (disposed) return Promise.reject(new Error('Asset manager is disposed'));
    if (!asset.runtime.ready || !asset.runtime.url) {
      setAssetState(asset, { status: asset.runtimeRequired ? 'unavailable' : 'optional-unavailable' });
      return asset.runtimeRequired ? Promise.reject(new AssetUnavailableError(asset)) : Promise.resolve(null);
    }
    if (cache.has(asset.logicalId) && !retry) return Promise.resolve(cache.get(asset.logicalId));
    if (assetRuns.has(asset.logicalId)) return assetRuns.get(asset.logicalId);

    const previous = states.get(asset.logicalId);
    if (previous.status === 'failed' && !retry) return Promise.reject(previous.error || new AssetLoadError(asset, new Error('Explicit retry required')));

    const promise = (async () => {
      setAssetState(asset, {
        status: 'loading',
        attempts: previous.attempts + 1,
        loadedBytes: 0,
        totalBytes: asset.source.bytes,
        error: null,
      });
      try {
        if (signal?.aborted) throw new DOMException('cancelled', 'AbortError');
        const response = await fetchImpl(asset.runtime.url, { signal, credentials: 'same-origin', cache: 'default' });
        const bytes = await readResponse(response, asset, signal);
        if (bytes.byteLength !== asset.source.bytes) {
          throw new AssetLoadError(asset, new Error(`byte-size mismatch: expected ${asset.source.bytes}, got ${bytes.byteLength}`));
        }
        setAssetState(asset, { status: 'verifying' });
        await integrityImpl(asset, bytes);
        if (signal?.aborted) throw new DOMException('cancelled', 'AbortError');
        setAssetState(asset, { status: 'decoding' });
        const value = await decodeImpl(asset, bytes);
        if (signal?.aborted) {
          disposeResource(value);
          throw new DOMException('cancelled', 'AbortError');
        }
        setAssetState(asset, { status: 'loaded', error: null });
        return value;
      } catch (error) {
        if (isAbortError(error) || signal?.aborted) {
          setAssetState(asset, { status: 'cancelled', error });
          throw error;
        }
        const wrapped = error instanceof AssetLoadError ? error : new AssetLoadError(asset, error);
        setAssetState(asset, { status: 'failed', error: wrapped });
        throw wrapped;
      } finally {
        assetRuns.delete(asset.logicalId);
      }
    })();

    assetRuns.set(asset.logicalId, promise);
    return promise;
  }

  function loadAsset(id, { signal = null, retry = false } = {}) {
    const asset = byId.get(id);
    if (!asset) return Promise.reject(new TypeError(`Unknown asset: ${id}`));
    return startAssetFetch(asset, { signal, retry }).then((value) => {
      if (value !== null) {
        const prior = cache.get(id);
        cache.set(id, value);
        if (prior !== undefined && prior !== value) disposeResource(prior);
        setAssetState(asset, { status: 'ready' });
      }
      return value;
    });
  }

  async function executeGroup(group, controller, { retry }) {
    const entries = groupEntries(group);
    const blockers = entries.filter((asset) => asset.runtimeRequired && (!asset.runtime.ready || !asset.runtime.url));
    if (blockers.length) throw new AssetGroupNotReadyError(group, blockers);

    const priorGroup = groupStates.get(group);
    setGroupState(group, { status: 'loading', attempt: priorGroup.attempt + 1, failures: [] });
    for (const asset of entries) {
      if (retry || states.get(asset.logicalId).status !== 'ready') {
        states.set(asset.logicalId, { ...initialState(asset), attempts: states.get(asset.logicalId).attempts });
      }
    }
    emit(null, group);

    const queue = [...entries];
    const staged = new Map();
    const failures = [];
    const workerCount = Math.min(Math.max(1, concurrency), Math.max(1, queue.length));

    const worker = async () => {
      while (queue.length && !controller.signal.aborted) {
        const asset = queue.shift();
        if (!asset) return;
        try {
          const value = await startAssetFetch(asset, { signal: controller.signal, retry });
          if (value !== null) staged.set(asset.logicalId, value);
        } catch (error) {
          if (controller.signal.aborted || isAbortError(error)) return;
          failures.push({ id: asset.logicalId, name: error?.name || 'Error', message: error?.message || String(error) });
        }
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    if (controller.signal.aborted) {
      for (const value of staged.values()) disposeResource(value);
      for (const asset of entries) {
        const state = states.get(asset.logicalId);
        if (state.status === 'loaded') states.set(asset.logicalId, { ...state, status: 'rolled-back' });
        else if (['idle', 'loading', 'verifying', 'decoding'].includes(state.status)) states.set(asset.logicalId, { ...state, status: 'cancelled' });
      }
      setGroupState(group, { status: 'cancelled', failures });
      throw new AssetLoadCancelledError(group, abortReason(controller.signal));
    }

    if (ASSET_GROUPS[group].blocking && failures.length) {
      for (const value of staged.values()) disposeResource(value);
      for (const [id] of staged) states.set(id, { ...states.get(id), status: 'rolled-back' });
      setGroupState(group, { status: 'failed', failures });
      throw new AssetGroupLoadError(group, failures);
    }

    for (const [id, value] of staged) {
      const prior = cache.get(id);
      cache.set(id, value);
      if (prior !== undefined && prior !== value) disposeResource(prior);
      states.set(id, { ...states.get(id), status: 'ready' });
    }
    setGroupState(group, { status: failures.length ? 'degraded' : 'ready', failures });
    return Object.freeze({
      group,
      values: new Map(entries.map((asset) => [asset.logicalId, cache.get(asset.logicalId) ?? null])),
      degraded: Object.freeze(failures.map((failure) => Object.freeze({ ...failure }))),
      progress: groupSnapshot(group),
    });
  }

  function loadGroup(group, { signal = null, retry = false } = {}) {
    if (!ASSET_GROUPS[group]) return Promise.reject(new TypeError(`Unknown asset group: ${group}`));
    if (disposed) return Promise.reject(new Error('Asset manager is disposed'));

    const existing = groupRuns.get(group);
    if (existing) {
      if (!retry || existing.isRetry) return existing.promise;
      if (existing.restartPromise) return existing.restartPromise;
      existing.controller.abort('retry');
      existing.restartPromise = existing.promise.catch(() => undefined).then(() => loadGroup(group, { signal, retry: false }));
      return existing.restartPromise;
    }

    const state = groupStates.get(group);
    if (!retry && (state.status === 'ready' || state.status === 'degraded')) {
      return Promise.resolve(Object.freeze({ group, values: new Map(groupEntries(group).map((asset) => [asset.logicalId, cache.get(asset.logicalId) ?? null])), degraded: Object.freeze([...state.failures]), progress: groupSnapshot(group) }));
    }

    const controller = new AbortController();
    const forwardAbort = () => controller.abort(abortReason(signal));
    signal?.addEventListener?.('abort', forwardAbort, { once: true });
    if (signal?.aborted) forwardAbort();

    const run = { controller, promise: null, restartPromise: null, isRetry: retry };
    run.promise = executeGroup(group, controller, { retry })
      .finally(() => {
        signal?.removeEventListener?.('abort', forwardAbort);
        if (groupRuns.get(group) === run) groupRuns.delete(group);
      });
    groupRuns.set(group, run);
    return run.promise;
  }

  function startGroupLoad(group, options = {}) {
    const promise = loadGroup(group, options);
    return Object.freeze({ group, promise, cancel: (reason = 'cancelled') => cancelGroup(group, reason) });
  }

  function cancelGroup(group, reason = 'cancelled') {
    groupRuns.get(group)?.controller.abort(reason);
  }

  function cancelAll(reason = 'cancelled') {
    for (const run of groupRuns.values()) run.controller.abort(reason);
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('Progress listener must be a function');
    listeners.add(listener);
    listener(Object.freeze({ asset: null, group: null, overall: groupSnapshot(null) }));
    return () => listeners.delete(listener);
  }

  function get(id) {
    return cache.get(id);
  }

  function getState(id) {
    const state = states.get(id);
    return state ? immutableState(state) : null;
  }

  function clear(id = null) {
    if (id) {
      const prior = cache.get(id);
      if (prior !== undefined) disposeResource(prior);
      cache.delete(id);
      const asset = byId.get(id);
      if (asset && !assetRuns.has(id)) states.set(id, initialState(asset));
      return;
    }
    for (const resource of cache.values()) disposeResource(resource);
    cache.clear();
    for (const asset of localManifest) if (!assetRuns.has(asset.logicalId)) states.set(asset.logicalId, initialState(asset));
    for (const group of Object.keys(ASSET_GROUPS)) groupStates.set(group, { status: 'idle', attempt: 0, failures: [] });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAll('disposed');
    listeners.clear();
    clear();
  }

  return Object.freeze({
    loadAsset,
    loadGroup,
    startGroupLoad,
    cancelGroup,
    cancelAll,
    subscribe,
    get,
    getState,
    snapshot: groupSnapshot,
    clear,
    dispose,
  });
}
