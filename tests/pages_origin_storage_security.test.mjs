import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  PAGES_BROWSER_ORIGIN,
  RECOVERY_HANDLE_MAX_TTL_MS,
  broadcastChannelName,
  cacheStorageName,
  deleteOwnedCaches,
  indexedDbName,
  isAllowedPagesOrigin,
  isYakolakOwnedName,
  localStorageKey,
  removeOwnedWebStorage,
  seatCredentialPolicy,
  sessionStorageKey,
} from '../web/app/security/pages-origin-security.js';

async function walk(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

test('GitHub Pages paths are one browser origin', () => {
  assert.equal(PAGES_BROWSER_ORIGIN, 'https://a7sncom.github.io');
  assert.equal(new URL('https://a7sncom.github.io/yakolak/').origin, PAGES_BROWSER_ORIGIN);
  assert.equal(new URL('https://a7sncom.github.io/yakolak/threejs/').origin, PAGES_BROWSER_ORIGIN);
  assert.equal(isAllowedPagesOrigin('https://a7sncom.github.io/yakolak/threejs/'), true);
  assert.equal(isAllowedPagesOrigin('https://example.com/yakolak/'), false);
});

test('every browser persistence/channel name is owned by YAKOLAK', () => {
  for (const name of [
    localStorageKey('ui', 'reduced-motion'),
    sessionStorageKey('recovery', 'room-54-p2'),
    indexedDbName('offline-state'),
    cacheStorageName('static-r185'),
    broadcastChannelName('room-events'),
  ]) {
    assert.match(name, /^YAKOLAK:v1:/);
    assert.equal(isYakolakOwnedName(name), true);
  }
  assert.equal(isYakolakOwnedName('other-app:v1:cache'), false);
});

test('cleanup removes only YAKOLAK-owned local/session keys and never calls clear()', () => {
  const values = new Map([
    ['YAKOLAK:v1:local:ui:a', '1'],
    ['other-app:key', '2'],
    ['YAKOLAK:v1:session:recovery:b', '3'],
  ]);
  const storage = {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    removeItem(key) { values.delete(key); },
    clear() { throw new Error('broad clear must never be called'); },
  };
  removeOwnedWebStorage(storage);
  assert.deepEqual([...values.keys()], ['other-app:key']);
});

test('cache cleanup deletes only YAKOLAK-owned caches', async () => {
  const deleted = [];
  const cacheStorage = {
    async keys() { return ['YAKOLAK:v1:cache:assets', 'other-app-cache']; },
    async delete(name) { deleted.push(name); return true; },
  };
  const owned = await deleteOwnedCaches(cacheStorage);
  assert.deepEqual(owned, ['YAKOLAK:v1:cache:assets']);
  assert.deepEqual(deleted, ['YAKOLAK:v1:cache:assets']);
});

test('seat bearer credentials are memory-only; recovery handle is short-lived and one-time', () => {
  assert.equal(seatCredentialPolicy.bearerPersistence, 'memory-only');
  assert.equal(seatCredentialPolicy.browserStorageBearerAllowed, false);
  assert.equal(seatCredentialPolicy.broadcastBearerAllowed, false);
  assert.equal(seatCredentialPolicy.recoveryHandlePersistence, 'sessionStorage-only');
  assert.equal(seatCredentialPolicy.recoveryHandleBearer, false);
  assert.equal(seatCredentialPolicy.recoveryHandleOneTimeUse, true);
  assert.equal(seatCredentialPolicy.recoveryHandleMaxTtlMs, RECOVERY_HANDLE_MAX_TTL_MS);
  assert.ok(RECOVERY_HANDLE_MAX_TTL_MS <= 5 * 60 * 1000);
  assert.equal(seatCredentialPolicy.takeoverRotatesSeatCredential, true);
  assert.equal(seatCredentialPolicy.previousGenerationRejectedAfterTakeover, true);
});

test('Pages public artifact does not contain backend/admin secret bindings or broad browser-storage clears', async () => {
  const files = (await walk('web')).filter(file => /\.(?:js|mjs|html|css|json)$/i.test(file));
  const forbidden = [
    /localStorage\s*\.\s*clear\s*\(/,
    /sessionStorage\s*\.\s*clear\s*\(/,
    /TURSO_AUTH_TOKEN/,
    /TURSO_DATABASE_URL/,
    /DATABASE_ADMIN(?:_TOKEN|_SECRET)?/,
    /SERVICE_ROLE(?:_KEY|_TOKEN)?/,
  ];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${file} contains forbidden public-artifact pattern ${pattern}`);
    }
  }
});
