import test from 'node:test';
import assert from 'node:assert/strict';

import { createResourceRegistry } from '../web/app/core/resource-registry.js';

function throwingSynchronousPlatform() {
  let next = 0;
  const frames = new Set();
  const timeouts = new Set();
  return {
    frames,
    timeouts,
    requestAnimationFrame(callback) {
      const id = ++next;
      frames.add(id);
      callback(321.5);
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

for (const [name, schedule, activeKey] of [
  ['animation frame', (registry, callback) => registry.requestFrame(callback), 'frames'],
  ['timeout', (registry, callback) => registry.setTimeout(callback, 1), 'timeouts'],
]) {
  test(`${name} cleans its synchronous handle before rethrowing callback failure`, () => {
    const platform = throwingSynchronousPlatform();
    const registry = createResourceRegistry({ platform });
    let callbacks = 0;

    assert.throws(
      () => schedule(registry, () => {
        callbacks += 1;
        throw new Error(`synthetic ${name} callback failure`);
      }),
      new RegExp(`synthetic ${name} callback failure`),
    );

    assert.equal(callbacks, 1, `${name} callback should run exactly once`);
    assert.equal(platform[activeKey].size, 0, `${name} handle must be cancelled before callback error escapes`);
    assert.equal(registry.snapshot().total, 0, `${name} callback failure must not leave a lifecycle entry`);
  });
}
