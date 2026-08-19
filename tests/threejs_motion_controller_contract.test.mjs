import assert from 'node:assert/strict';

import { createResourceRegistry } from '../web/app/core/resource-registry.js';
import { createMotionController, MOTION_EASINGS } from '../web/app/gameplay/motion-controller.js';
import {
  SESSION_LIFECYCLE_EVENT_TYPES,
  SESSION_LIFECYCLE_PHASES,
  createSessionLifecycleState,
  reduceSessionLifecycle,
} from '../web/app/session/session-lifecycle.js';

function fakePlatform() {
  let sequence = 0;
  const active = new Map();
  const allCallbacks = new Map();
  return {
    requestAnimationFrame(callback) {
      const id = ++sequence;
      active.set(id, callback);
      allCallbacks.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      active.delete(id);
    },
    pendingIds() {
      return [...active.keys()];
    },
    fire(id) {
      const callback = active.get(id);
      if (!callback) return false;
      active.delete(id);
      callback();
      return true;
    },
    fireCancelled(id) {
      const callback = allCallbacks.get(id);
      if (!callback) return false;
      callback();
      return true;
    },
  };
}

class FakeMediaQuery {
  constructor(matches = false) {
    this.matches = matches;
    this.listeners = new Set();
  }
  addEventListener(type, listener) {
    if (type === 'change') this.listeners.add(listener);
  }
  removeEventListener(type, listener) {
    if (type === 'change') this.listeners.delete(listener);
  }
  set(matches) {
    this.matches = matches;
    for (const listener of [...this.listeners]) listener({ matches });
  }
}

function args(overrides = {}) {
  return {
    scope: 'piece',
    key: 'transform',
    generation: 1,
    revision: 7,
    durationMs: 100,
    from: 0,
    to: 1,
    easing: 'linear',
    apply: () => {},
    isTargetLive: () => true,
    snapToCanonical: () => {},
    ...overrides,
  };
}

assert.equal(MOTION_EASINGS.linear(0.5), 0.5);
assert.equal(MOTION_EASINGS.easeOutCubic(1), 1);
assert.equal(MOTION_EASINGS.easeInOutCubic(0), 0);

let nowMs = 0;
const platform = fakePlatform();
const registry = createResourceRegistry({ platform });
const controller = createMotionController({
  resourceRegistry: registry,
  clock: () => nowMs,
  generation: 1,
  revision: 7,
});
assert.equal(controller.snapshot().generation, 1);
assert.equal(controller.snapshot().revision, 7);
assert.equal(controller.snapshot().activeCount, 0);

// Deterministic numeric-tree interpolation with registry-owned frames.
const writes = [];
let normalSnapCount = 0;
const first = controller.animate(args({
  scope: 'stack:right:0',
  key: 'open-close',
  from: { position: [0, 0, 0], opacity: 0 },
  to: { position: [10, 20, 30], opacity: 1 },
  apply: (value, meta) => writes.push({ value, meta }),
  snapToCanonical: () => { normalSnapCount += 1; },
}));
assert.deepEqual(writes[0].value, { opacity: 0, position: [0, 0, 0] });
assert.equal(writes[0].meta.revision, 7);
assert.equal(registry.snapshot().animationHandles, 1);
nowMs = 50;
platform.fire(platform.pendingIds()[0]);
assert.deepEqual(writes.at(-1).value, { opacity: 0.5, position: [5, 10, 15] });
nowMs = 100;
platform.fire(platform.pendingIds()[0]);
assert.deepEqual(writes.at(-1).value, { opacity: 1, position: [10, 20, 30] });
const firstResult = await first.finished;
assert.equal(firstResult.status, 'completed');
assert.equal(firstResult.revision, 7);
assert.equal(firstResult.snapAttempted, false);
assert.equal(firstResult.snappedCanonical, false);
assert.equal(normalSnapCount, 0);
assert.equal(registry.snapshot().animationHandles, 0);

// Same-key supersession snaps the old live target exactly once. A cancelled rAF that
// fires late is a no-op.
nowMs = 200;
const oldWrites = [];
const oldSnaps = [];
const old = controller.animate(args({
  scope: 'piece:right:0:large',
  from: 0,
  to: 10,
  apply: value => oldWrites.push(value),
  snapToCanonical: meta => oldSnaps.push(meta.reason),
}));
const cancelledFrame = platform.pendingIds()[0];
const newerWrites = [];
const newer = controller.animate(args({
  scope: 'piece:right:0:large',
  from: 3,
  to: 30,
  apply: value => newerWrites.push(value),
}));
const oldResult = await old.finished;
assert.equal(oldResult.reason, 'superseded-by-newer-motion');
assert.equal(oldResult.snapAttempted, true);
assert.equal(oldResult.snappedCanonical, true);
assert.deepEqual(oldSnaps, ['superseded-by-newer-motion']);
platform.fireCancelled(cancelledFrame);
assert.deepEqual(oldWrites, [0]);
nowMs = 300;
platform.fire(platform.pendingIds()[0]);
assert.equal((await newer.finished).status, 'completed');
assert.deepEqual(newerWrites, [3, 30]);

// Revision change is an authority boundary, not cosmetic state. It cancels active
// motion and supplies the new controller revision to canonical snap.
nowMs = 400;
const revisionWrites = [];
const revisionSnaps = [];
const revisionMotion = controller.animate(args({
  scope: 'piece',
  key: 'travel',
  apply: value => revisionWrites.push(value),
  snapToCanonical: meta => revisionSnaps.push(meta),
}));
const revisionFrame = platform.pendingIds()[0];
controller.setRevision(8);
const revisionResult = await revisionMotion.finished;
assert.equal(revisionResult.reason, 'revision-changed');
assert.equal(revisionResult.snapAttempted, true);
assert.equal(revisionResult.snappedCanonical, true);
assert.equal(revisionSnaps.length, 1);
assert.equal(revisionSnaps[0].controllerRevision, 8);
platform.fireCancelled(revisionFrame);
assert.deepEqual(revisionWrites, [0]);
let staleWrites = 0;
const staleRevision = controller.animate(args({
  revision: 7,
  apply: () => { staleWrites += 1; },
}));
assert.equal((await staleRevision.finished).status, 'stale-revision');
assert.equal(staleWrites, 0);

// THREEJS-060 presentationGeneration feeds the same authority witness. Lifecycle
// advance plus new revision cancels stale motion once.
let lifecycle = createSessionLifecycleState({
  phase: SESSION_LIFECYCLE_PHASES.BOOT,
  presentationGeneration: 1,
});
const lifecycleSnaps = [];
const lifecycleWrites = [];
const lifecycleMotion = controller.animate(args({
  revision: 8,
  scope: 'setup',
  key: 'surface',
  apply: value => lifecycleWrites.push(value),
  snapToCanonical: meta => lifecycleSnaps.push(meta.reason),
}));
const lifecycleFrame = platform.pendingIds()[0];
lifecycle = reduceSessionLifecycle(lifecycle, {
  type: SESSION_LIFECYCLE_EVENT_TYPES.ADVANCE,
  to: SESSION_LIFECYCLE_PHASES.LOADING,
  presentationGeneration: 1,
});
assert.equal(lifecycle.presentationGeneration, 2);
assert.deepEqual(controller.syncSessionAuthority(lifecycle, 9), { generation: 2, revision: 9 });
assert.deepEqual(lifecycleSnaps, ['generation-and-revision-changed']);
assert.equal((await lifecycleMotion.finished).snappedCanonical, true);
platform.fireCancelled(lifecycleFrame);
assert.deepEqual(lifecycleWrites, [0]);

// Released/rebuilt targets receive neither stale writes nor canonical snap writes.
nowMs = 500;
const target = { live: true, writes: [], snaps: 0 };
const released = controller.animate(args({
  generation: 2,
  revision: 9,
  key: 'released-target',
  apply: value => target.writes.push(value),
  isTargetLive: () => target.live,
  snapToCanonical: () => { target.snaps += 1; },
}));
const releasedFrame = platform.pendingIds()[0];
assert.deepEqual(target.writes, [0]);
target.live = false;
controller.setRevision(10);
const releasedResult = await released.finished;
assert.equal(releasedResult.snapAttempted, true);
assert.equal(releasedResult.snappedCanonical, false);
assert.equal(target.snaps, 0);
platform.fireCancelled(releasedFrame);
assert.deepEqual(target.writes, [0]);

// Reduced Motion follows the same semantic transition and writes exact `to`; it does
// not invoke cancellation snap.
nowMs = 600;
const reducedWrites = [];
let reducedSnaps = 0;
const reducedActive = controller.animate(args({
  generation: 2,
  revision: 10,
  scope: 'stack',
  key: 'open',
  durationMs: 500,
  from: { x: 0, opacity: 0 },
  to: { x: 42, opacity: 1 },
  apply: value => reducedWrites.push(value),
  snapToCanonical: () => { reducedSnaps += 1; },
}));
const reducedFrame = platform.pendingIds()[0];
controller.setReducedMotion(true);
assert.deepEqual(reducedWrites, [{ opacity: 0, x: 0 }, { opacity: 1, x: 42 }]);
const reducedResult = await reducedActive.finished;
assert.equal(reducedResult.status, 'reduced-motion');
assert.equal(reducedResult.snapAttempted, false);
assert.equal(reducedSnaps, 0);
assert.equal(registry.snapshot().animationHandles, 0);
platform.fireCancelled(reducedFrame);
assert.equal(reducedWrites.length, 2);

const instantWrites = [];
const instant = controller.animate(args({
  generation: 2,
  revision: 10,
  scope: 'piece',
  key: 'lift',
  durationMs: 250,
  from: [0, 0, 0],
  to: [0, 14, 0],
  apply: value => instantWrites.push(value),
}));
assert.deepEqual(instantWrites, [[0, 14, 0]]);
assert.equal((await instant.finished).status, 'reduced-motion');
controller.setReducedMotion(false);

// Scope cancellation and controller release both snap live targets once.
const scopeSnaps = [];
controller.animate(args({
  generation: 2,
  revision: 10,
  scope: 'stack:right:0',
  key: 'large',
  snapToCanonical: meta => scopeSnaps.push(meta.reason),
}));
assert.equal(controller.cancelScope('stack:right:0', 'stack-closed'), 1);
assert.deepEqual(scopeSnaps, ['stack-closed']);

const releaseWrites = [];
const releaseSnaps = [];
const releaseMotion = controller.animate(args({
  generation: 2,
  revision: 10,
  scope: 'reset',
  key: 'return-home',
  apply: value => releaseWrites.push(value),
  snapToCanonical: meta => releaseSnaps.push(meta.reason),
}));
const releaseFrame = platform.pendingIds()[0];
controller.release();
assert.deepEqual(releaseSnaps, ['controller-released']);
assert.equal((await releaseMotion.finished).snappedCanonical, true);
platform.fireCancelled(releaseFrame);
assert.deepEqual(releaseWrites, [0]);
assert.equal(registry.snapshot().animationHandles, 0);
registry.dispose('motion-controller-test-complete');

// Media-query ownership remains in THREEJS-027 and flips the same controller path.
const mediaPlatform = fakePlatform();
const mediaRegistry = createResourceRegistry({ platform: mediaPlatform });
const mediaQuery = new FakeMediaQuery(false);
const mediaController = createMotionController({
  resourceRegistry: mediaRegistry,
  clock: () => 0,
  generation: 3,
  revision: 11,
  reducedMotionQuery: mediaQuery,
});
assert.equal(mediaRegistry.snapshot().listeners, 1);
const mediaWrites = [];
const mediaMotion = mediaController.animate(args({
  generation: 3,
  revision: 11,
  scope: 'overlay',
  key: 'opacity',
  apply: value => mediaWrites.push(value),
}));
const mediaFrame = mediaPlatform.pendingIds()[0];
mediaQuery.set(true);
assert.deepEqual(mediaWrites, [0, 1]);
assert.equal((await mediaMotion.finished).status, 'reduced-motion');
mediaPlatform.fireCancelled(mediaFrame);
assert.deepEqual(mediaWrites, [0, 1]);
mediaController.release();
assert.equal(mediaRegistry.snapshot().listeners, 0);
assert.equal(mediaQuery.listeners.size, 0);
mediaRegistry.dispose('motion-media-test-complete');

// A sequence cannot omit revision or the canonical snap contract.
const validationRegistry = createResourceRegistry({ platform: fakePlatform() });
const validationController = createMotionController({ resourceRegistry: validationRegistry, generation: 0, revision: 0 });
assert.throws(() => validationController.animate({
  scope: 'x', key: 'y', generation: 0, durationMs: 1,
  from: 0, to: 1, apply: () => {}, isTargetLive: () => true, snapToCanonical: () => {},
}), /invalid_motion_revision/);
assert.throws(() => validationController.animate({
  scope: 'x', key: 'y', generation: 0, revision: 0, durationMs: 1,
  from: 0, to: 1, apply: () => {}, isTargetLive: () => true,
}), /motion_snap_to_canonical_required/);
validationController.release();
validationRegistry.dispose('motion-validation-test-complete');

console.log('THREEJS-096 motion controller contract: PASS');
