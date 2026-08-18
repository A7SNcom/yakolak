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

test('shared factory resource is disposed if reentrant registry disposal prevents registration', () => {
  const registry = createResourceRegistry();
  let created = null;

  assert.throws(
    () => registry.getOrCreateShared('reentrant-shared', () => {
      created = material();
      registry.dispose('synthetic-reentrant-dispose');
      return created;
    }, {
      kind: RESOURCE_KINDS.MATERIAL,
      scope: 'asset-cache',
    }),
    /Resource registry is disposed/,
  );

  assert.ok(created);
  assert.equal(created.disposeCalls, 1, 'unregistered shared resource must be rolled back exactly once');
  assert.equal(registry.snapshot().total, 0);
});

test('shared factory must return a concrete resource', () => {
  const registry = createResourceRegistry();

  assert.throws(
    () => registry.getOrCreateShared('null-shared', () => null),
    /Shared resource factory must return a resource/,
  );
  assert.equal(registry.snapshot().total, 0);
});

test('failed shared claim never disposes a resource already owned by another scope', () => {
  const registry = createResourceRegistry();
  const owner = registry.createScope('owner');
  const resource = material();
  owner.register(resource, { kind: RESOURCE_KINDS.MATERIAL });

  assert.throws(
    () => registry.getOrCreateShared('foreign-owned', () => resource, {
      kind: RESOURCE_KINDS.MATERIAL,
      scope: 'asset-cache',
    }),
    /Resource already owned by another scope: owner#\d+/,
  );

  assert.equal(resource.disposeCalls, 0, 'rollback must not destroy a pre-owned resource');
  assert.equal(owner.release('owner-complete'), 1);
  assert.equal(resource.disposeCalls, 1);
});
