import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createResourceRegistry,
  RESOURCE_KINDS,
} from '../web/app/core/resource-registry.js';

function fakePlatform() {
  let id = 0;
  const frames = new Map();
  const timeouts = new Map();
  const intervals = new Map();
  return {
    frames,
    timeouts,
    intervals,
    requestAnimationFrame(callback) {
      const next = ++id;
      frames.set(next, callback);
      return next;
    },
    cancelAnimationFrame(handle) {
      frames.delete(handle);
    },
    setTimeout(callback) {
      const next = ++id;
      timeouts.set(next, callback);
      return next;
    },
    clearTimeout(handle) {
      timeouts.delete(handle);
    },
    setInterval(callback) {
      const next = ++id;
      intervals.set(next, callback);
      return next;
    },
    clearInterval(handle) {
      intervals.delete(handle);
    },
  };
}

test('invalid lifecycle metadata is rejected before external side effects begin', () => {
  const platform = fakePlatform();
  const registry = createResourceRegistry({ platform });
  const invalidOwnership = { ownership: 'invalid-ownership' };

  let added = 0;
  let removed = 0;
  const target = {
    addEventListener() { added += 1; },
    removeEventListener() { removed += 1; },
  };

  let subscribed = 0;
  let unsubscribed = 0;
  const subscribeFn = () => {
    subscribed += 1;
    return () => { unsubscribed += 1; };
  };

  let observed = 0;
  let disconnected = 0;
  const observer = {
    observe() { observed += 1; },
    disconnect() { disconnected += 1; },
  };

  let sharedFactories = 0;
  const expectInvalidOwnership = (operation) => assert.throws(
    operation,
    /Unknown resource ownership: invalid-ownership/,
  );

  expectInvalidOwnership(() => registry.listen(target, 'test', () => {}, undefined, invalidOwnership));
  expectInvalidOwnership(() => registry.subscribe(subscribeFn, () => {}, invalidOwnership));
  expectInvalidOwnership(() => registry.observe(observer, {}, undefined, invalidOwnership));
  expectInvalidOwnership(() => registry.requestFrame(() => {}, invalidOwnership));
  expectInvalidOwnership(() => registry.setTimeout(() => {}, 10, invalidOwnership));
  expectInvalidOwnership(() => registry.setInterval(() => {}, 10, invalidOwnership));

  assert.throws(
    () => registry.getOrCreateShared('invalid-shared', () => {
      sharedFactories += 1;
      return { isMaterial: true, dispose() {} };
    }, { kind: 'invalid-kind' }),
    /Unknown resource kind: invalid-kind/,
  );

  assert.equal(added, 0, 'invalid listener metadata must fail before addEventListener');
  assert.equal(removed, 0, 'no listener cleanup should be needed when preflight rejects');
  assert.equal(subscribed, 0, 'invalid subscription metadata must fail before subscribeFn');
  assert.equal(unsubscribed, 0);
  assert.equal(observed, 0, 'invalid observer metadata must fail before observe');
  assert.equal(disconnected, 0);
  assert.equal(platform.frames.size, 0, 'invalid RAF metadata must fail before scheduling');
  assert.equal(platform.timeouts.size, 0, 'invalid timeout metadata must fail before scheduling');
  assert.equal(platform.intervals.size, 0, 'invalid interval metadata must fail before scheduling');
  assert.equal(sharedFactories, 0, 'invalid shared metadata must fail before running the factory');
  assert.equal(registry.snapshot().total, 0, 'preflight failures must not create registry entries');
});
