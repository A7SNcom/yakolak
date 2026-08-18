import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createResourceRegistry,
  RESOURCE_KINDS,
} from '../web/app/core/resource-registry.js';

function material() {
  let calls = 0;
  return {
    isMaterial: true,
    get disposeCalls() { return calls; },
    dispose() { calls += 1; },
  };
}

test('scope releaseDeep cannot destroy shared or foreign-scope resources', () => {
  const registry = createResourceRegistry();
  const owner = registry.createScope('owner');
  const foreign = registry.createScope('foreign');

  const ownedMaterial = material();
  const foreignMaterial = material();
  const sharedMaterial = registry.getOrCreateShared('scope-ownership-shared', () => material(), {
    kind: RESOURCE_KINDS.MATERIAL,
    scope: 'asset-cache',
  });

  owner.register(ownedMaterial, { kind: RESOURCE_KINDS.MATERIAL });
  foreign.register(foreignMaterial, { kind: RESOURCE_KINDS.MATERIAL });

  assert.equal(
    owner.releaseDeep(foreignMaterial, 'must-not-cross-scope'),
    0,
    'a scope must not release a resource owned by another scope',
  );
  assert.equal(foreignMaterial.disposeCalls, 0);

  assert.equal(
    owner.releaseDeep(sharedMaterial, 'must-not-release-shared'),
    0,
    'a consumer scope must not release shared immutable resources',
  );
  assert.equal(sharedMaterial.disposeCalls, 0);

  assert.equal(owner.releaseDeep(ownedMaterial, 'owned-deep-release'), 1);
  assert.equal(ownedMaterial.disposeCalls, 1);
  assert.equal(owner.releaseDeep(ownedMaterial, 'duplicate-owned-release'), 0);
  assert.equal(owner.release('owner-complete'), 0);
  assert.throws(
    () => owner.releaseDeep(ownedMaterial, 'late-deep-release'),
    /Resource scope is released: owner#\d+/,
    'a released scope must not regain destruction authority',
  );

  foreign.release();
  assert.equal(foreignMaterial.disposeCalls, 1);
  assert.equal(sharedMaterial.disposeCalls, 0);

  registry.dispose();
  assert.equal(sharedMaterial.disposeCalls, 1);
});
