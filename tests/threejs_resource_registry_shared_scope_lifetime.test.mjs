import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createResourceRegistry,
  RESOURCE_KINDS,
} from '../web/app/core/resource-registry.js';

function material() {
  let disposeCalls = 0;
  return {
    isMaterial: true,
    get disposeCalls() { return disposeCalls; },
    dispose() { disposeCalls += 1; },
  };
}

test('shared resources created through a consumer scope use stable shared diagnostics ownership', () => {
  const registry = createResourceRegistry();
  const firstConsumer = registry.createScope('consumer-a');
  let factories = 0;

  const shared = firstConsumer.getOrCreateShared('consumer-shared', () => {
    factories += 1;
    return material();
  }, { kind: RESOURCE_KINDS.MATERIAL });

  assert.equal(registry.snapshot().byScope.shared, 1);
  assert.equal(registry.snapshot().byScope[firstConsumer.id] || 0, 0);
  assert.equal(firstConsumer.release('consumer-a-complete'), 0);
  assert.equal(shared.disposeCalls, 0);
  assert.equal(registry.snapshot().byScope.shared, 1);
  assert.equal(registry.snapshot().byScope[firstConsumer.id] || 0, 0, 'released consumer scope must not remain as shared owner');

  const secondConsumer = registry.createScope('consumer-b');
  const reused = secondConsumer.getOrCreateShared('consumer-shared', () => {
    factories += 1;
    return material();
  }, { kind: RESOURCE_KINDS.MATERIAL });

  assert.equal(reused, shared);
  assert.equal(factories, 1);
  assert.equal(secondConsumer.release('consumer-b-complete'), 0);
  assert.equal(registry.snapshot().byScope.shared, 1);
  assert.equal(registry.snapshot().byScope[secondConsumer.id] || 0, 0);

  registry.dispose();
  assert.equal(shared.disposeCalls, 1);
});

test('scope shared creation preserves an explicit stable shared scope label', () => {
  const registry = createResourceRegistry();
  const consumer = registry.createScope('consumer');
  const shared = consumer.getOrCreateShared('explicit-cache-shared', () => material(), {
    kind: RESOURCE_KINDS.MATERIAL,
    scope: 'asset-cache',
  });

  const snapshot = registry.snapshot();
  assert.equal(snapshot.byScope['asset-cache'], 1);
  assert.equal(snapshot.byScope[consumer.id] || 0, 0);
  assert.equal(consumer.release('consumer-complete'), 0);
  assert.equal(shared.disposeCalls, 0);
  assert.equal(registry.snapshot().byScope['asset-cache'], 1);

  registry.dispose();
  assert.equal(shared.disposeCalls, 1);
});
