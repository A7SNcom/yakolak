export const PAGES_BROWSER_ORIGIN = 'https://a7sncom.github.io';
export const YAKOLAK_NAMESPACE = 'YAKOLAK';
export const YAKOLAK_STORAGE_VERSION = 'v1';
export const RECOVERY_HANDLE_MAX_TTL_MS = 5 * 60 * 1000;

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

function segment(value, name) {
  const normalized = String(value ?? '').trim();
  if (!normalized || !SAFE_SEGMENT.test(normalized)) {
    throw new TypeError(`${name} must be a non-empty safe storage segment`);
  }
  return normalized;
}

export function yakolakName(kind, ...parts) {
  return [
    YAKOLAK_NAMESPACE,
    YAKOLAK_STORAGE_VERSION,
    segment(kind, 'kind'),
    ...parts.map((part, index) => segment(part, `part${index + 1}`)),
  ].join(':');
}

export function localStorageKey(area, key) {
  return yakolakName('local', area, key);
}

export function sessionStorageKey(area, key) {
  return yakolakName('session', area, key);
}

export function indexedDbName(purpose) {
  return yakolakName('idb', purpose);
}

export function cacheStorageName(purpose) {
  return yakolakName('cache', purpose);
}

export function broadcastChannelName(purpose) {
  return yakolakName('channel', purpose);
}

export function isYakolakOwnedName(value) {
  return String(value || '').startsWith(`${YAKOLAK_NAMESPACE}:${YAKOLAK_STORAGE_VERSION}:`);
}

export function isAllowedPagesOrigin(value) {
  try {
    return new URL(String(value)).origin === PAGES_BROWSER_ORIGIN;
  } catch {
    return false;
  }
}

export function removeOwnedWebStorage(storage) {
  if (!storage || typeof storage.length !== 'number' || typeof storage.key !== 'function' || typeof storage.removeItem !== 'function') {
    throw new TypeError('a Storage-compatible object is required');
  }
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (isYakolakOwnedName(key)) storage.removeItem(key);
  }
}

export async function deleteOwnedCaches(cacheStorage) {
  if (!cacheStorage || typeof cacheStorage.keys !== 'function' || typeof cacheStorage.delete !== 'function') {
    throw new TypeError('a CacheStorage-compatible object is required');
  }
  const names = await cacheStorage.keys();
  const owned = names.filter(isYakolakOwnedName);
  await Promise.all(owned.map(name => cacheStorage.delete(name)));
  return owned;
}

export function deleteOwnedIndexedDb(indexedDBFactory, purpose) {
  if (!indexedDBFactory || typeof indexedDBFactory.deleteDatabase !== 'function') {
    throw new TypeError('an IndexedDB factory is required');
  }
  const name = indexedDbName(purpose);
  return indexedDBFactory.deleteDatabase(name);
}

export const seatCredentialPolicy = Object.freeze({
  bearerPersistence: 'memory-only',
  browserStorageBearerAllowed: false,
  broadcastBearerAllowed: false,
  recoveryHandlePersistence: 'sessionStorage-only',
  recoveryHandleBearer: false,
  recoveryHandleOneTimeUse: true,
  recoveryHandleMaxTtlMs: RECOVERY_HANDLE_MAX_TTL_MS,
  takeoverRotatesSeatCredential: true,
  previousGenerationRejectedAfterTakeover: true,
});
