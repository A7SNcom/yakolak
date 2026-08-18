import test from 'node:test';
import assert from 'node:assert/strict';

import { createResourceRegistry } from '../web/app/core/resource-registry.js';

function synchronousPlatform() {
  let next = 0;
  const frames = new Set();
  const timeouts = new Set();
  return {
    frames,
    timeouts,
    requestAnimationFrame(callback) {
      const id = ++next;
      frames.add(id);
      callback(123.5);
      return id;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    setTimeout(callback) {
      const id = ++next;
      timeouts.add(id);
      callback();
      return id;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
  };
}

for (const [name, schedule, activeKey, snapshotKey] of [
  ['animation frame', (registry, callback) => registry.requestFrame(callback), 'frames', 'animationHandles'],
  ['timeout', (registry, callback) => registry.setTimeout(callback, 1), 'timeouts', 'timers'],
]) {
  test(`${name} that fires synchronously never becomes a stale active registry entry`, () => {
    const platform = synchronousPlatform();
    const registry = createResourceRegistry({ platform });
    let callbacks = 0;

    const token = schedule(registry, () => {
      callbacks += 1;
    });

    assert.equal(callbacks, 1, `${name} callback should run exactly once`);
    assert.equal(token.active, false, `${name} token must already be inactive after synchronous completion`);
    assert.equal(registry.snapshot()[snapshotKey], 0, `${name} must not remain registered after it already fired`);
    assert.equal(registry.snapshot().total, 0, 'completed one-shot must not leave any lifecycle entry');
    assert.equal(platform[activeKey].size, 0, `${name} handle must be cancelled after synchronous completion`);
  });
}
