import test from 'node:test';
import assert from 'node:assert/strict';

import { createResourceRegistry } from '../web/app/core/resource-registry.js';

test('failed listener replacement preserves the previously active listener', () => {
  const registry = createResourceRegistry();
  let addCalls = 0;
  let removeCalls = 0;
  const activeListeners = new Set();
  const target = {
    addEventListener(_type, listener) {
      addCalls += 1;
      if (addCalls === 2) throw new Error('synthetic listener install failure');
      activeListeners.add(listener);
    },
    removeEventListener(_type, listener) {
      removeCalls += 1;
      activeListeners.delete(listener);
    },
  };

  const firstListener = () => {};
  const replacementListener = () => {};
  const firstToken = registry.listen(target, 'yakolak-atomic-listener', firstListener, undefined, {
    replacementKey: 'atomic-listener',
  });

  assert.equal(firstToken.active, true);
  assert.equal(activeListeners.has(firstListener), true);
  assert.equal(registry.snapshot().listeners, 1);

  assert.throws(
    () => registry.listen(target, 'yakolak-atomic-listener', replacementListener, undefined, {
      replacementKey: 'atomic-listener',
    }),
    /synthetic listener install failure/,
  );

  assert.equal(firstToken.active, true, 'failed replacement must not release the stable listener');
  assert.equal(activeListeners.has(firstListener), true, 'stable listener must remain installed');
  assert.equal(activeListeners.has(replacementListener), false);
  assert.equal(removeCalls, 0, 'failed replacement must not tear down the stable listener');
  assert.equal(registry.snapshot().listeners, 1, 'registry must retain exactly the stable listener');

  firstToken.release('test-complete');
  assert.equal(removeCalls, 1);
  assert.equal(activeListeners.size, 0);
});
