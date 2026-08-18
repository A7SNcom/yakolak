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

test('non-shared resources cannot be silently claimed by another scope', () => {
  const registry = createResourceRegistry();
  const owner = registry.createScope('owner');
  const foreign = registry.createScope('foreign');
  const resource = material();

  owner.register(resource, { kind: RESOURCE_KINDS.MATERIAL });

  assert.throws(
    () => foreign.register(resource, { kind: RESOURCE_KINDS.MATERIAL }),
    /Resource already owned by another scope: owner#\d+/,
  );
  assert.equal(resource.disposeCalls, 0);
  assert.equal(registry.snapshot().byScope[owner.id], 1);
  assert.equal(registry.snapshot().byScope[foreign.id] || 0, 0);

  assert.equal(owner.release('owner-complete'), 1);
  assert.equal(resource.disposeCalls, 1);
  assert.equal(foreign.release('foreign-complete'), 0);
});

test('explicit reclassify transfers non-shared ownership between scopes', () => {
  const registry = createResourceRegistry();
  const owner = registry.createScope('owner');
  const successor = registry.createScope('successor');
  const resource = material();

  owner.register(resource, { kind: RESOURCE_KINDS.MATERIAL });
  successor.register(resource, {
    kind: RESOURCE_KINDS.MATERIAL,
    reclassify: true,
  });

  assert.equal(owner.release('old-owner-complete'), 0);
  assert.equal(resource.disposeCalls, 0, 'old scope must not destroy transferred ownership');
  assert.equal(successor.release('successor-complete'), 1);
  assert.equal(resource.disposeCalls, 1);
});

test('shared immutable resources remain borrowable across consumer scopes', () => {
  const registry = createResourceRegistry();
  const firstConsumer = registry.createScope('consumer-a');
  const secondConsumer = registry.createScope('consumer-b');
  const shared = registry.getOrCreateShared('cross-scope-shared', () => material(), {
    kind: RESOURCE_KINDS.MATERIAL,
    scope: 'asset-cache',
  });

  firstConsumer.register(shared, { kind: RESOURCE_KINDS.MATERIAL });
  secondConsumer.register(shared, { kind: RESOURCE_KINDS.MATERIAL });

  assert.equal(firstConsumer.release('consumer-a-complete'), 0);
  assert.equal(secondConsumer.release('consumer-b-complete'), 0);
  assert.equal(shared.disposeCalls, 0);
  registry.dispose();
  assert.equal(shared.disposeCalls, 1);
});

test('foreign observer ownership is rejected before observe creates side effects', () => {
  const registry = createResourceRegistry();
  const owner = registry.createScope('observer-owner');
  const foreign = registry.createScope('observer-foreign');
  let observeCalls = 0;
  let disconnectCalls = 0;
  const observer = {
    observe() { observeCalls += 1; },
    disconnect() { disconnectCalls += 1; },
  };

  owner.observe(observer, { id: 'first-target' });
  assert.equal(observeCalls, 1);

  assert.throws(
    () => foreign.observe(observer, { id: 'second-target' }),
    /Resource already owned by another scope: observer-owner#\d+/,
  );
  assert.equal(observeCalls, 1, 'foreign scope must fail before observer.observe runs');
  assert.equal(disconnectCalls, 0);

  owner.release('observer-owner-complete');
  assert.equal(disconnectCalls, 1);
  assert.equal(foreign.release('observer-foreign-complete'), 0);
});
