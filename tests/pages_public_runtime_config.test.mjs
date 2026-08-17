import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OnlineUnavailableError,
  SUPPORTED_PROTOCOL_VERSION,
  normalizePublicRuntimeConfig,
  requireOnlineRuntimeConfig,
} from '../web/app/core/public-runtime-config.js';

test('missing API_ORIGIN keeps offline/local capability but disables online', () => {
  const config = normalizePublicRuntimeConfig({
    frontendSha: 'abcdef123456',
    protocolVersion: SUPPORTED_PROTOCOL_VERSION,
  });

  assert.equal(config.apiOrigin, null);
  assert.equal(config.onlineAvailable, false);
  assert.match(config.unavailableReason, /API_ORIGIN/i);
  assert.throws(() => requireOnlineRuntimeConfig(config), (error) => {
    assert.ok(error instanceof OnlineUnavailableError);
    assert.equal(error.code, 'ONLINE_UNAVAILABLE');
    assert.match(error.message, /Online play is unavailable/i);
    return true;
  });
});

test('approved HTTPS origin enables online only on supported protocol', () => {
  const config = normalizePublicRuntimeConfig({
    frontendSha: 'abcdef123456',
    protocolVersion: SUPPORTED_PROTOCOL_VERSION,
    apiOrigin: 'https://yakolak-api.example.com',
    environment: 'production',
    branch: 'threejs-rebuild',
  });

  assert.equal(config.apiOrigin, 'https://yakolak-api.example.com');
  assert.equal(config.onlineAvailable, true);
  assert.equal(requireOnlineRuntimeConfig(config), config);
});

test('legacy, credentialed, pathful, insecure, and malformed origins fail closed', () => {
  const rejected = [
    'https://yakolak.vercel.app',
    'https://user:pass@example.com',
    'https://example.com/api',
    'http://example.com',
    'not a url',
  ];

  for (const apiOrigin of rejected) {
    const config = normalizePublicRuntimeConfig({
      protocolVersion: SUPPORTED_PROTOCOL_VERSION,
      apiOrigin,
    });
    assert.equal(config.apiOrigin, null, apiOrigin);
    assert.equal(config.onlineAvailable, false, apiOrigin);
    assert.throws(() => requireOnlineRuntimeConfig(config), OnlineUnavailableError);
  }
});

test('protocol mismatch disables online even with a valid API origin', () => {
  const config = normalizePublicRuntimeConfig({
    protocolVersion: '999',
    apiOrigin: 'https://yakolak-api.example.com',
  });

  assert.equal(config.onlineAvailable, false);
  assert.match(config.unavailableReason, /Unsupported protocol version 999/);
  assert.throws(() => requireOnlineRuntimeConfig(config), OnlineUnavailableError);
});
