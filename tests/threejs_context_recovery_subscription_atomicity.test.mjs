import test from 'node:test';
import assert from 'node:assert/strict';

import { createContextRecoveryController } from '../web/app/scene/context-recovery.js';

test('failed initial context-state subscriber is removed before the error escapes', () => {
  const canvas = new EventTarget();
  const recovery = createContextRecoveryController({ canvas });
  let calls = 0;
  const expected = new Error('synthetic initial context subscriber failure');

  assert.throws(
    () => recovery.subscribe(() => {
      calls += 1;
      throw expected;
    }),
    (error) => error === expected,
  );

  assert.equal(calls, 1, 'initial subscriber should run exactly once before failing');

  const lost = new Event('webglcontextlost', { cancelable: true });
  canvas.dispatchEvent(lost);

  assert.equal(lost.defaultPrevented, true);
  assert.equal(calls, 1, 'failed initial subscriber must not remain registered for later emissions');
  assert.equal(recovery.snapshot().state, 'lost');

  recovery.dispose();
});
