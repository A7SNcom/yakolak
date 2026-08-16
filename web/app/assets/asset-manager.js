import { ASSET_LIST, ASSET_GROUPS, assetsForGroup, unavailableRequiredAssets } from './asset-manifest.js';

export class AssetUnavailableError extends Error {
  constructor(asset) {
    super(`Runtime asset is not ready: ${asset.logicalId}`);
    this.name = 'AssetUnavailableError';
    this.assetId = asset.logicalId;
    this.plannedUrl = asset.runtime.plannedUrl || null;
  }
}

export class AssetLoadError extends Error {
  constructor(asset, cause) {
    super(`Failed to load asset ${asset.logicalId}: ${cause?.message || cause}`);
    this.name = 'AssetLoadError';
    this.assetId = asset.logicalId;
    this.cause = cause;
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

function initialState(asset) {
  return {
    id: asset.logicalId,
    group: asset.group,
    status: asset.runtime.ready ? 'idle' : (asset.runtimeRequired ? 'unavailable' : 'optional-unavailable'),
    attempts: 0,
    loadedBytes: 0,
    totalBytes: null,
    error: null,
  };
}

function abortError() {
  return new DOMException('Asset load cancelled', 'AbortError');
}

function parseBytes(bytes, type) {
  if (type === 'arrayBuffer') return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const text = new TextDecoder().decode(bytes);
  if (type === 'json') return JSON.parse(text);
  return text;
}

function concatChunks(chunks, size) {
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

export function createAssetManager({
  manifest = ASSET_LIST,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  onProgress = null,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Asset manager requires fetch');

  const byId = new Map(manifest.map((asset) => [asset.logicalId, asset]));
  const states = new Map(manifest.map((asset) => [asset.logicalId, initialState(asset)]));
  const cache = new Map();
  const inFlight = new Map();
  const listeners = new Set();
  if (typeof onProgress === 'function') listeners.add(onProgress);

  function groupSnapshot(group = null) {
    const selected = group ? manifest.filter((asset) => asset.group === group) : manifest;
    const assetStates = selected.map((asset) => states.get(asset.logicalId));
    const knownTotals = assetStates.filter((state) => Number.isFinite(state.totalBytes));
    const loadedBytes = assetStates.reduce((sum, state) => sum + state.loadedBytes, 0);
    const totalKnownBytes = knownTotals.reduce((sum, state) => sum + state.totalBytes, 0);
    const allTotalsKnown = selected.length > 0 && knownTotals.length === selected.filter((asset) => asset.runtime.ready).length;
    return Object.freeze({
      group,
      totalAssets: selected.length,
      readyAssets: assetStates.filter((state) => state.status === 'ready').length,
      failedAssets: assetStates.filter((state) => state.status === 'failed').length,
      unavailableAssets: assetStates.filter((state) => state.status.includes('unavailable')).length,
      loadingAssets: assetStates.filter((state) => state.status === 'loading').length,
      loadedBytes,
      totalKnownBytes,
      percent: allTotalsKnown && totalKnownBytes > 0 ? Math.min(100, (loadedBytes / totalKnownBytes) * 100) : null,
      indeterminate: !allTotalsKnown,
    });
  }

  function emit(asset, group = asset?.group || null) {
    const payload = Object.freeze({
      asset: asset ? Object.freeze({ ...states.get(asset.logicalId) }) : null,
      group: groupSnapshot(group),
      overall: groupSnapshot(null),
    });
    for (const listener of listeners) listener(payload);
  }

  function setState(asset, patch) {
    states.set(asset.logicalId, { ...states.get(asset.logicalId), ...patch });
    emit(asset);
  }

  async function readResponse(response, asset, signal) {
    const headerBytes = Number.parseInt(response.headers.get('content-length') || '', 10);
    const totalBytes = Number.isFinite(headerBytes) && headerBytes >= 0 ? headerBytes : null;
    setState(asset, { totalBytes, loadedBytes: 0 });

    if (!response.body?.getReader) {
      const buffer = new Uint8Array(await response.arrayBuffer());
      if (signal?.aborted) throw abortError();
      setState(asset, { loadedBytes: buffer.byteLength, totalBytes: totalBytes ?? buffer.byteLength });
      return parseBytes(buffer, asset.runtime.type);
    }

    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    try {
      while (true) {
        if (signal?.aborted) {
          await reader.cancel();
          throw abortError();
        }
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        setState(asset, { loadedBytes: received });
      }
    } finally {
      reader.releaseLock();
    }

    if (totalBytes !== null && received !== totalBytes) {
      throw new Error(`Incomplete response for ${asset.logicalId}: ${received}/${totalBytes} bytes`);
    }
    setState(asset, { loadedBytes: received, totalBytes: totalBytes ?? received });
    return parseBytes(concatChunks(chunks, received), asset.runtime.type);
  }

  async function fetchAsset(asset, signal) {
    const response = await fetchImpl(asset.runtime.url, {
      signal,
      credentials: 'same-origin',
      cache: 'default',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return readResponse(response, asset, signal);
  }

  function loadAsset(id, { signal = null, retry = false } = {}) {
    const asset = byId.get(id);
    if (!asset) return Promise.reject(new TypeError(`Unknown asset: ${id}`));
    if (!asset.runtime.ready || !asset.runtime.url) {
      setState(asset, { status: asset.runtimeRequired ? 'unavailable' : 'optional-unavailable' });
      return asset.runtimeRequired ? Promise.reject(new AssetUnavailableError(asset)) : Promise.resolve(null);
    }
    if (cache.has(id) && !retry) return Promise.resolve(cache.get(id));
    if (inFlight.has(id)) return inFlight.get(id);

    const previous = states.get(id);
    if (previous.status === 'failed' && !retry) {
      return Promise.reject(previous.error || new AssetLoadError(asset, new Error('Previous attempt failed; retry is required')));
    }

    const promise = (async () => {
      setState(asset, {
        status: 'loading',
        attempts: previous.attempts + 1,
        loadedBytes: 0,
        totalBytes: null,
        error: null,
      });
      try {
        if (signal?.aborted) throw abortError();
        const value = await fetchAsset(asset, signal);
        cache.set(id, value);
        setState(asset, { status: 'ready', error: null });
        return value;
      } catch (error) {
        if (error?.name === 'AbortError') {
          setState(asset, { status: 'cancelled', error });
          throw error;
        }
        const wrapped = error instanceof AssetLoadError ? error : new AssetLoadError(asset, error);
        setState(asset, { status: 'failed', error: wrapped });
        throw wrapped;
      } finally {
        inFlight.delete(id);
      }
    })();

    inFlight.set(id, promise);
    return promise;
  }

  async function loadGroup(group, { signal = null, retry = false } = {}) {
    if (!ASSET_GROUPS[group]) throw new TypeError(`Unknown asset group: ${group}`);
    const entries = assetsForGroup(group);
    const blockers = unavailableRequiredAssets(group);
    if (blockers.length) throw new AssetGroupNotReadyError(group, blockers);

    const settled = await Promise.allSettled(entries.map((asset) => loadAsset(asset.logicalId, { signal, retry })));
    const requiredFailures = [];
    const degraded = [];
    const values = new Map();

    settled.forEach((result, index) => {
      const asset = entries[index];
      if (result.status === 'fulfilled') {
        values.set(asset.logicalId, result.value);
      } else if (asset.runtimeRequired) {
        requiredFailures.push(result.reason);
      } else {
        degraded.push(Object.freeze({ id: asset.logicalId, error: result.reason }));
      }
    });

    if (requiredFailures.length) {
      const error = new AggregateError(requiredFailures, `Required assets failed in ${group}`);
      error.name = 'AssetGroupLoadError';
      error.group = group;
      throw error;
    }

    return Object.freeze({ group, values, degraded: Object.freeze(degraded), progress: groupSnapshot(group) });
  }

  function startGroupLoad(group, options = {}) {
    const controller = new AbortController();
    const external = options.signal;
    const forwardAbort = () => controller.abort(external?.reason);
    external?.addEventListener?.('abort', forwardAbort, { once: true });
    const promise = loadGroup(group, { ...options, signal: controller.signal })
      .finally(() => external?.removeEventListener?.('abort', forwardAbort));
    return Object.freeze({
      group,
      promise,
      cancel: (reason = 'cancelled') => controller.abort(reason),
    });
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('Progress listener must be a function');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function get(id) {
    return cache.get(id);
  }

  function getState(id) {
    const state = states.get(id);
    return state ? Object.freeze({ ...state }) : null;
  }

  function clear(id = null) {
    if (id) {
      cache.delete(id);
      const asset = byId.get(id);
      if (asset && !inFlight.has(id)) states.set(id, initialState(asset));
      return;
    }
    cache.clear();
    for (const asset of manifest) if (!inFlight.has(asset.logicalId)) states.set(asset.logicalId, initialState(asset));
  }

  return Object.freeze({
    loadAsset,
    loadGroup,
    startGroupLoad,
    subscribe,
    get,
    getState,
    snapshot: groupSnapshot,
    clear,
  });
}
