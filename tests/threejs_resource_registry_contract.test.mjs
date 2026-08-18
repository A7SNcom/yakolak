import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

import {
  createResourceRegistry,
  RESOURCE_KINDS,
  RESOURCE_OWNERSHIP,
} from '../web/app/core/resource-registry.js';

function disposable(kindFlag, { throws = false } = {}) {
  let calls = 0;
  return {
    [kindFlag]: true,
    get disposeCalls() { return calls; },
    dispose() {
      calls += 1;
      if (throws) throw new Error('synthetic disposal failure');
    },
  };
}

function fakePlatform() {
  let id = 0;
  const frames = new Map();
  const timeouts = new Map();
  const intervals = new Map();
  return {
    frames,
    timeouts,
    intervals,
    requestAnimationFrame(callback) {
      const next = ++id;
      frames.set(next, callback);
      return next;
    },
    cancelAnimationFrame(handle) {
      frames.delete(handle);
    },
    setTimeout(callback) {
      const next = ++id;
      timeouts.set(next, callback);
      return next;
    },
    clearTimeout(handle) {
      timeouts.delete(handle);
    },
    setInterval(callback) {
      const next = ++id;
      intervals.set(next, callback);
      return next;
    },
    clearInterval(handle) {
      intervals.delete(handle);
    },
  };
}

test('shared immutable resources are reused and destroyed only by the root registry', () => {
  const registry = createResourceRegistry();
  let factories = 0;
  const geometry = disposable('isBufferGeometry');

  const first = registry.getOrCreateShared('board-geometry', () => {
    factories += 1;
    return geometry;
  }, { kind: RESOURCE_KINDS.GEOMETRY });
  const second = registry.getOrCreateShared('board-geometry', () => {
    factories += 1;
    return disposable('isBufferGeometry');
  }, { kind: RESOURCE_KINDS.GEOMETRY });

  assert.equal(first, second);
  assert.equal(factories, 1);

  const consumer = registry.createScope('consumer', {
    ownership: RESOURCE_OWNERSHIP.GENERATION_SCOPED,
  });
  consumer.register(first, { kind: RESOURCE_KINDS.GEOMETRY });
  consumer.release();
  assert.equal(geometry.disposeCalls, 0, 'consumer teardown must not destroy shared immutable geometry');

  registry.dispose();
  registry.dispose();
  assert.equal(geometry.disposeCalls, 1, 'root teardown must be idempotent');
});

test('replacement disposes the replaced transient exactly once', () => {
  const registry = createResourceRegistry();
  const scope = registry.createScope('replacement');
  const first = disposable('isMaterial');
  const second = disposable('isMaterial');

  scope.replace('hover-material', first, { kind: RESOURCE_KINDS.MATERIAL });
  const secondToken = scope.replace('hover-material', second, { kind: RESOURCE_KINDS.MATERIAL });

  assert.equal(first.disposeCalls, 1);
  assert.equal(second.disposeCalls, 0);
  assert.equal(secondToken.release('explicit-replacement-release'), true);
  assert.equal(secondToken.release('duplicate-release'), false);
  assert.equal(second.disposeCalls, 1);
});

test('context-loss cleanup remains idempotent even when a driver-facing disposer throws', () => {
  const registry = createResourceRegistry();
  const texture = disposable('isTexture', { throws: true });
  const token = registry.register(texture, {
    kind: RESOURCE_KINDS.TEXTURE,
    ownership: RESOURCE_OWNERSHIP.TRANSIENT,
  });

  registry.markContextLost();
  assert.equal(token.release('context-lost-resource-replaced'), true);
  assert.equal(token.release('duplicate-after-context-loss'), false);
  assert.equal(texture.disposeCalls, 1);
  assert.equal(registry.snapshot().total, 0);
  assert.equal(registry.snapshot().disposalErrors.length, 1);
});

test('decoded GLB geometry and ImageBitmap-like resources are centrally adopted and released', () => {
  const registry = createResourceRegistry();
  const geometry = disposable('isBufferGeometry');
  let closed = 0;
  const bitmap = { close() { closed += 1; } };
  const aggregate = {
    format: 'yakolak-glb-components-v1',
    components: [{ geometry }],
  };

  registry.adoptDeep(aggregate, {
    ownership: RESOURCE_OWNERSHIP.TRANSIENT,
    scope: 'asset-staging',
  });
  registry.register(bitmap, {
    kind: RESOURCE_KINDS.IMAGE_BITMAP,
    ownership: RESOURCE_OWNERSHIP.TRANSIENT,
  });

  assert.equal(registry.snapshot().gpuObjects, 1);
  assert.equal(registry.releaseDeep(aggregate, 'asset-rollback'), 1);
  registry.dispose();
  assert.equal(geometry.disposeCalls, 1);
  assert.equal(closed, 1);
});

test('25 setup/play/rematch/return generations do not grow GPU objects, handles or subscriptions', () => {
  const platform = fakePlatform();
  const registry = createResourceRegistry({ platform });
  const shared = disposable('isBufferGeometry');
  registry.getOrCreateShared('immutable-board', () => shared, {
    kind: RESOURCE_KINDS.GEOMETRY,
    scope: 'asset-cache',
  });
  const baseline = registry.snapshot();

  const target = new EventTarget();
  let activeObservers = 0;
  let maxObservers = 0;

  for (let cycle = 1; cycle <= 25; cycle += 1) {
    registry.beginGeneration(`match-${cycle}`);
    const lifecycle = registry.createScope(`match-${cycle}`, {
      ownership: RESOURCE_OWNERSHIP.GENERATION_SCOPED,
    });
    const geometry = disposable('isBufferGeometry');
    lifecycle.register(geometry, { kind: RESOURCE_KINDS.GEOMETRY, label: `cycle-${cycle}-geometry` });
    const instancedMesh = disposable('isInstancedMesh');
    lifecycle.register(instancedMesh, { kind: RESOURCE_KINDS.INSTANCED_MESH, label: `cycle-${cycle}-instances` });

    lifecycle.listen(target, 'yakolak-cycle', () => {}, undefined, {
      replacementKey: 'cycle-listener',
    });
    lifecycle.requestFrame(() => {}, { replacementKey: 'cycle-frame' });
    lifecycle.setTimeout(() => {}, 50, { replacementKey: 'cycle-timeout' });

    const observer = {
      observe() {
        activeObservers += 1;
        maxObservers = Math.max(maxObservers, activeObservers);
      },
      disconnect() {
        activeObservers -= 1;
      },
    };
    lifecycle.observe(observer, target, undefined, { label: 'cycle-observer' });

    let subscribed = true;
    lifecycle.registerCleanup(() => { subscribed = false; }, {
      kind: RESOURCE_KINDS.SUBSCRIPTION,
      label: 'cycle-subscription',
    });

    const during = registry.snapshot();
    assert.equal(during.gpuObjects, baseline.gpuObjects + 2);
    assert.equal(during.animationHandles, 1);
    assert.equal(during.timers, 1);
    assert.equal(during.listeners, 1);
    assert.equal(during.observers, 1);
    assert.equal(during.subscriptions, 1);

    lifecycle.release('return-to-setup');
    lifecycle.release('duplicate-return');

    const after = registry.snapshot();
    assert.equal(geometry.disposeCalls, 1);
    assert.equal(instancedMesh.disposeCalls, 1);
    assert.equal(subscribed, false);
    assert.equal(after.gpuObjects, baseline.gpuObjects);
    assert.equal(after.animationHandles, baseline.animationHandles);
    assert.equal(after.timers, baseline.timers);
    assert.equal(after.listeners, baseline.listeners);
    assert.equal(after.observers, baseline.observers);
    assert.equal(after.subscriptions, baseline.subscriptions);
    assert.equal(platform.frames.size, 0);
    assert.equal(platform.timeouts.size, 0);
    assert.equal(activeObservers, 0);
  }

  assert.equal(maxObservers, 1, 'observer count must never stack across rematches');
  assert.equal(shared.disposeCalls, 0);
  registry.dispose();
  assert.equal(shared.disposeCalls, 1);
});

test('presentation source has no ad-hoc Three/WebGL resource destruction outside the registry', async () => {
  async function javascriptFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
      .map((entry) => `${directory}/${entry.name}`);
  }

  const files = [
    ...await javascriptFiles('web/app/scene'),
    ...await javascriptFiles('web/app/materials'),
    ...await javascriptFiles('web/app/assets'),
    ...await javascriptFiles('web/app/camera'),
    ...await javascriptFiles('web/app/boot'),
  ];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const directDestruction = [...source.matchAll(/\b([A-Za-z_$][\w$]*)\s*\.\s*(dispose|close)\s*\(/g)]
      .map((match) => ({ receiver: match[1], method: match[2] }))
      .filter(({ receiver }) => !['registry', 'resourceRegistry'].includes(receiver));
    assert.deepEqual(
      directDestruction,
      [],
      `${file} must delegate every .dispose()/.close() resource call to resource-registry.js`,
    );
    assert.doesNotMatch(
      source,
      /\b(?:window|document|canvas|reducedMotionQuery|dprMedia|visualViewport)\s*\.\s*removeEventListener\s*\(/,
      `${file} must delegate listener removal to resource-registry.js`,
    );
    assert.doesNotMatch(
      source,
      /\b(?:cancelAnimationFrame|clearTimeout|clearInterval)\s*\(/,
      `${file} must delegate animation/timer cancellation to resource-registry.js`,
    );
  }
});
