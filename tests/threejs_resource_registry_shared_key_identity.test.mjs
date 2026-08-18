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

test('root shared creation uses stable shared diagnostics scope by default', () => {
  const registry = createResourceRegistry();
  const shared = registry.getOrCreateShared('root-shared', () => material(), {
    kind: RESOURCE_KINDS.MATERIAL,
  });

  const snapshot = registry.snapshot();
  assert.equal(snapshot.byScope.shared, 1);
  assert.equal(snapshot.byScope.root || 0, 0);

  registry.dispose();
  assert.equal(shared.disposeCalls, 1);
});

test('shared key kind collision fails before the second factory runs', () => {
  const registry = createResourceRegistry();
  const shared = registry.getOrCreateShared('typed-shared', () => material(), {
    kind: RESOURCE_KINDS.MATERIAL,
  });
  let secondFactoryCalls = 0;

  assert.throws(
    () => registry.getOrCreateShared('typed-shared', () => {
      secondFactoryCalls += 1;
      return { isTexture: true, dispose() {} };
    }, {
      kind: RESOURCE_KINDS.TEXTURE,
    }),
    /Shared resource key collision: typed-shared kind material != texture/,
  );

  assert.equal(secondFactoryCalls, 0, 'collision must fail before invoking a replacement factory');
  assert.equal(shared.disposeCalls, 0, 'existing shared resource must remain authoritative');
  assert.equal(registry.snapshot().total, 1);

  registry.dispose();
  assert.equal(shared.disposeCalls, 1);
});

test('shared key explicit scope collision fails without disturbing the cached resource', () => {
  const registry = createResourceRegistry();
  const shared = registry.getOrCreateShared('scoped-shared', () => material(), {
    kind: RESOURCE_KINDS.MATERIAL,
    scope: 'asset-cache',
  });
  let secondFactoryCalls = 0;

  assert.throws(
    () => registry.getOrCreateShared('scoped-shared', () => {
      secondFactoryCalls += 1;
      return material();
    }, {
      kind: RESOURCE_KINDS.MATERIAL,
      scope: 'other-cache',
    }),
    /Shared resource key collision: scoped-shared scope asset-cache != other-cache/,
  );

  assert.equal(secondFactoryCalls, 0);
  assert.equal(shared.disposeCalls, 0);
  assert.equal(registry.snapshot().byScope['asset-cache'], 1);

  registry.dispose();
  assert.equal(shared.disposeCalls, 1);
});

test('consumer scope without an explicit shared scope reuses an explicitly scoped cache entry', () => {
  const registry = createResourceRegistry();
  const shared = registry.getOrCreateShared('consumer-reuse-shared', () => material(), {
    kind: RESOURCE_KINDS.MATERIAL,
    scope: 'asset-cache',
  });
  const consumer = registry.createScope('consumer');
  let secondFactoryCalls = 0;

  const reused = consumer.getOrCreateShared('consumer-reuse-shared', () => {
    secondFactoryCalls += 1;
    return material();
  }, {
    kind: RESOURCE_KINDS.MATERIAL,
  });

  assert.equal(reused, shared);
  assert.equal(secondFactoryCalls, 0);
  assert.equal(consumer.release('consumer-complete'), 0);
  assert.equal(registry.snapshot().byScope['asset-cache'], 1);
  assert.equal(shared.disposeCalls, 0);

  registry.dispose();
  assert.equal(shared.disposeCalls, 1);
});
