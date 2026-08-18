import test from 'node:test';
import assert from 'node:assert/strict';

import { createResourceRegistry } from '../web/app/core/resource-registry.js';

test('listener setup rolls back if registration becomes impossible after installation', () => {
  const registry = createResourceRegistry();
  const active = new Set();
  const target = {
    addEventListener(_type, listener) {
      active.add(listener);
      registry.dispose('synthetic-reentrant-dispose');
    },
    removeEventListener(_type, listener) {
      active.delete(listener);
    },
  };

  assert.throws(
    () => registry.listen(target, 'test', () => {}),
    /Resource registry is disposed/,
  );
  assert.equal(active.size, 0, 'listener must be removed when post-install registration fails');
});

test('subscription setup invokes unsubscribe if registration fails reentrantly', () => {
  const registry = createResourceRegistry();
  let active = 0;

  assert.throws(
    () => registry.subscribe(() => {
      active += 1;
      registry.dispose('synthetic-reentrant-dispose');
      return () => { active -= 1; };
    }, () => {}),
    /Resource registry is disposed/,
  );
  assert.equal(active, 0, 'failed registration must rollback the new subscription');
});

test('observer setup disconnects if registration fails after observe begins', () => {
  const registry = createResourceRegistry();
  let active = 0;
  const observer = {
    observe() {
      active += 1;
      registry.dispose('synthetic-reentrant-dispose');
    },
    disconnect() {
      active = 0;
    },
  };

  assert.throws(
    () => registry.observe(observer, {}),
    /Resource registry is disposed/,
  );
  assert.equal(active, 0, 'failed registration must disconnect the observer');
});

function reentrantPlatform() {
  let registry = null;
  let next = 0;
  const frames = new Set();
  const timeouts = new Set();
  const intervals = new Set();
  const platform = {
    bindRegistry(value) { registry = value; },
    frames,
    timeouts,
    intervals,
    requestAnimationFrame() {
      const id = ++next;
      frames.add(id);
      registry.dispose('synthetic-reentrant-dispose');
      return id;
    },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout() {
      const id = ++next;
      timeouts.add(id);
      registry.dispose('synthetic-reentrant-dispose');
      return id;
    },
    clearTimeout(id) { timeouts.delete(id); },
    setInterval() {
      const id = ++next;
      intervals.add(id);
      registry.dispose('synthetic-reentrant-dispose');
      return id;
    },
    clearInterval(id) { intervals.delete(id); },
  };
  return platform;
}

for (const [name, schedule, setName] of [
  ['animation frame', (registry) => registry.requestFrame(() => {}), 'frames'],
  ['timeout', (registry) => registry.setTimeout(() => {}, 1), 'timeouts'],
  ['interval', (registry) => registry.setInterval(() => {}, 1), 'intervals'],
]) {
  test(`${name} setup cancels its handle if registration fails reentrantly`, () => {
    const platform = reentrantPlatform();
    const registry = createResourceRegistry({ platform });
    platform.bindRegistry(registry);

    assert.throws(
      () => schedule(registry),
      /Resource registry is disposed/,
    );
    assert.equal(platform[setName].size, 0, `${name} handle must be rolled back`);
  });
}
