import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createResourceRegistry,
  RESOURCE_KINDS,
  RESOURCE_OWNERSHIP,
} from '../web/app/core/resource-registry.js';

function material() {
  return { isMaterial: true };
}

test('reclassification replaces cleanup only when a new cleanup is explicit', () => {
  const registry = createResourceRegistry();
  const resource = material();
  const calls = [];

  registry.register(resource, {
    kind: RESOURCE_KINDS.MATERIAL,
    ownership: RESOURCE_OWNERSHIP.TRANSIENT,
    scope: 'asset-staging',
    cleanup: (reason) => calls.push(`staging:${reason}`),
  });

  registry.register(resource, {
    kind: RESOURCE_KINDS.MATERIAL,
    ownership: RESOURCE_OWNERSHIP.SHARED_IMMUTABLE,
    scope: 'asset-cache',
    label: 'asset-cache:material',
    cleanup: (reason) => calls.push(`cache:${reason}`),
    reclassify: true,
  });

  assert.equal(registry.snapshot().byScope['asset-cache'], 1);
  assert.equal(registry.snapshot().byOwnership[RESOURCE_OWNERSHIP.SHARED_IMMUTABLE], 1);

  registry.dispose('root-complete');
  assert.deepEqual(calls, ['cache:root-complete'], 'explicit reclassification cleanup must replace staging cleanup');
});

test('reclassification preserves cleanup when no new cleanup is supplied', () => {
  const registry = createResourceRegistry();
  const resource = material();
  const calls = [];

  registry.register(resource, {
    kind: RESOURCE_KINDS.MATERIAL,
    ownership: RESOURCE_OWNERSHIP.TRANSIENT,
    scope: 'asset-staging',
    cleanup: (reason) => calls.push(`staging:${reason}`),
  });

  registry.register(resource, {
    kind: RESOURCE_KINDS.MATERIAL,
    ownership: RESOURCE_OWNERSHIP.SHARED_IMMUTABLE,
    scope: 'asset-cache',
    label: 'asset-cache:material',
    reclassify: true,
  });

  registry.dispose('root-complete');
  assert.deepEqual(calls, ['staging:root-complete'], 'omitted cleanup must preserve the prior registered cleanup');
});

test('partial reclassification preserves omitted ownership, scope and kind metadata', () => {
  const registry = createResourceRegistry();
  const resource = material();
  const calls = [];

  registry.register(resource, {
    kind: RESOURCE_KINDS.MATERIAL_VARIANT,
    ownership: RESOURCE_OWNERSHIP.SHARED_IMMUTABLE,
    scope: 'asset-cache',
    label: 'canonical-variant',
    cleanup: (reason) => calls.push(`original:${reason}`),
  });

  registry.register(resource, {
    cleanup: (reason) => calls.push(`replacement:${reason}`),
    reclassify: true,
  });

  const snapshot = registry.snapshot();
  assert.equal(snapshot.byScope['asset-cache'], 1, 'omitted scope must preserve the existing scope');
  assert.equal(snapshot.byScope.root || 0, 0, 'partial reclassification must not default scope back to root');
  assert.equal(snapshot.byOwnership[RESOURCE_OWNERSHIP.SHARED_IMMUTABLE], 1, 'omitted ownership must preserve shared ownership');
  assert.equal(snapshot.byOwnership[RESOURCE_OWNERSHIP.TRANSIENT] || 0, 0, 'partial reclassification must not default ownership to transient');
  assert.equal(snapshot.byKind[RESOURCE_KINDS.MATERIAL_VARIANT], 1, 'omitted kind must preserve the registered kind');
  assert.equal(snapshot.byKind[RESOURCE_KINDS.MATERIAL] || 0, 0, 'partial reclassification must not replace kind with inference');

  registry.dispose('root-complete');
  assert.deepEqual(calls, ['replacement:root-complete']);
});
