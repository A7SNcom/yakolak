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

function motionArgs({
  scope = 'piece',
  key = 'transform',
  generation = 1,
  revision = 7,
  durationMs = 100,
  from = 0,
  to = 1,
  apply = () => {},
  isTargetLive = () => true,
  snapToCanonical = () => {},
  easing = 'linear',
} = {}) {
  return {
    scope,
    key,
    generation,
    revision,
    durationMs,
    from,
    to,
    apply,
    isTargetLive,
    snapToCanonical,
    easing,
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
assert.deepEqual(controller.snapshot(), {
  disposed: false,
  generation: 1,
  revision: 7,
  reducedMotion: false,
  activeCount: 0,
  active: [],
});

// Numeric-tree tweening is deterministic and every frame is registry-owned.
const applied = [];
let completedSnaps = 0;
const first = controller.animate(motionArgs({
  scope: 'stack:right:0',
  key: 'open-close',
  from: { position: [0, 0, 0], opacity: 0 },
  to: { position: [10, 20, 30], opacity: 1 },
  apply: (value, meta) => applied.push({ value, meta }),
  snapToCanonical: () => { completedSnaps += 1; },
}));
assert.deepEqual(applied[0].value, { opacity: 0, position: [0, 0, 0] });
assert.equal(applied[0].meta.revision, 7);
assert.equal(registry.snapshot().animationHandles, 1);
let frame = platform.pendingIds()[0];
nowMs = 50;
platform.fire(frame);
assert.deepEqual(applied.at(-1).value, { opacity: 0.5, position: [5, 10, 15] });
frame = platform.pendingIds()[0];
nowMs = 100;
platform.fire(frame);
assert.deepEqual(applied.at(-1).value, { opacity: 1, position: [10, 20, 30] });
assert.deepEqual(await first.finished, {
  scope: 'stack:right:0',
  key: 'open-close',
  generation: 1,
  revision: 7,
  sequence: 1,
  status: 'completed',
  reason: null,
  snappedCanonical: false,
});
assert.equal(completedSnaps, 0, 'normal completion must not invoke cancellation snap');
assert.equal(registry.snapshot().animationHandles, 0);

// Same-key supersession cancels the old work, snaps canonical exactly once, and a
// cancelled platform callback cannot mutate afterwards.
nowMs = 200;
const oldWrites = [];
const oldSnaps = [];
const old = controller.animate(motionArgs({
  scope: 'piece:right:0:large',
  key: 'transform',
  from: 0,
  to: 10,
  apply: value => oldWrites.push(value),
  snapToCanonical: meta => oldSnaps.push(meta.reason),
}));
const cancelledFrame = platform.pendingIds()[0];
const newerWrites = [];
const newer = controller.animate(motionArgs({
  scope: 'piece:right:0:large',
  key: 'transform',
  from: 3,
  to: 30,
  apply: value => newerWrites.push(value),
}));
assert.deepEqual(oldSnaps, ['superseded-by-newer-motion']);
assert.equal((await old.finished).snappedCanonical, true);
platform.fireCancelled(cancelledFrame);
assert.deepEqual(oldWrites, [0]);
nowMs = 300;
platform.fire(platform.pendingIds()[0]);
assert.equal((await newer.finished).status, 'completed');
assert.deepEqual(newerWrites, [3, 30]);

// Authoritative revision replacement invalidates all active motion and snaps each
// still-live target exactly once before stale callbacks can write.
nowMs = 400;
const revisionWrites = [];
const revisionSnaps = [];
const revisionMotion = controller.animate(motionArgs({
  scope: 'piece',
  key: 'travel',
  from: 0,
  to: 50,
  apply: value => revisionWrites.push(value),
  snapToCanonical: meta => revisionSnaps.push({ reason: meta.reason, controllerRevision: meta.controllerRevision }),
}));
const revisionFrame = platform.pendingIds()[0];
assert.equal(controller.setRevision(8), 8);
assert.deepEqual(revisionSnaps, [{ reason: 'revision-changed', controllerRevision: 8 }]);
assert.deepEqual(await revisionMotion.finished, {
  scope: 'piece',
  key: 'travel',
  generation: 1,
  revision: 7,
  sequence: 4,
  status: 'cancelled',
  reason: 'revision-changed',
  snappedCanonical: true,
});
platform.fireCancelled(revisionFrame);
assert.deepEqual(revisionWrites, [0]);
const staleRevision = controller.animate(motionArgs({ revision: 7 }));
assert.equal((await staleRevision.finished).status, 'stale-revision');
assert.equal(registry.snapshot().animationHandles, 0);

// THREEJS-060 presentationGeneration is the lifecycle generation source. Advancing
// lifecycle and authoritative revision together cancels stale motion under one call.
let lifecycle = createSessionLifecycleState({
  phase: SESSION_LIFECYCLE_PHASES.BOOT,
  presentationGeneration: 1,
});
const lifecycleWrites = [];
const lifecycleSnaps = [];
const lifecycleMotion = controller.animate(motionArgs({
  scope: 'setup',
  key: 'surface',
  revision: 8,
  from: 0,
  to: 1,
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
assert.deepEqual(controller.snapshot().generation, 2);
assert.deepEqual(controller.snapshot().revision, 9);

// A released/rebuilt target is never touched by either stale frame or canonical snap.
nowMs = 500;
const target = { live: true, writes: [], snaps: 0 };
const releasedTarget = controller.animate(motionArgs({
  generation: 2,
  revision: 9,
  scope: 'piece',
  key: 'released-target',
  from: 0,
  to: 10,
  apply: value => target.writes.push(value),
  isTargetLive: () => target.live,
  snapToCanonical: () => { target.snaps += 1; },
}));
const releasedFrame = platform.pendingIds()[0];
assert.deepEqual(target.writes, [0]);
target.live = false;
controller.setRevision(10);
assert.equal((await releasedTarget.finished).snappedCanonical, true, 'snap attempt is consumed exactly once');
assert.equal(target.snaps, 0, 'released target must not be mutated by canonical snap');
platform.fireCancelled(releasedFrame);
assert.deepEqual(target.writes, [0]);

// Reduced Motion uses the same semantic transition and commits `to` directly; it is
// not a cancellation snap and does not allocate another lifecycle path.
nowMs = 600;
const reducedWrites = [];
let reducedSnaps = 0;
const reducedActive = controller.animate(motionArgs({
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
assert.equal((await reducedActive.finished).status, 'reduced-motion');
assert.equal(reducedSnaps, 0);
assert.equal(registry.snapshot().animationHandles, 0);
platform.fireCancelled(reducedFrame);
assert.equal(reducedWrites.length, 2);

const instantWrites = [];
const instant = controller.animate(motionArgs({
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

// Scope cancellation and controller release both canonical-snap live targets once.
const scopeSnaps = [];
controller.animate(motionArgs({
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
const releaseMotion = controller.animate(motionArgs({
  generation: 2,
  revision: 10,
  scope: 'reset',
  key: 'return-home',
  apply: value => releaseWrites.push(value),
  snapToCanonical: meta => releaseSnaps.push(meta.reason),
}));
const releaseFrame = platform.pendingIds()[0];
assert.equal(controller.release(), true);
assert.deepEqual(releaseSnaps, ['controller-released']);
assert.equal((await releaseMotion.finished).snappedCanonical, true);
platform.fireCancelled(releaseFrame);
assert.deepEqual(releaseWrites, [0]);
assert.equal(registry.snapshot().animationHandles, 0);
assert.throws(() => controller.animate({}), /motion_controller_disposed/);
registry.dispose('motion-controller-test-complete');

// Media-query listener is owned by the registry and Reduced Motion still uses the
// same controller path.
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
const mediaMotion = mediaController.animate(motionArgs({
  generation: 3,
  revision: 11,
  scope: 'overlay',
  key: 'opacity',
  from: 0,
  to: 1,
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

// Stale sequences cannot omit the authority witness or canonical snap contract.
const validationRegistry = createResourceRegistry({ platform: fakePlatform() });
const validationController = createMotionController({ resourceRegistry: validationRegistry, generation: 0, revision: 0 });
assert.throws(() => validationController.animate(motionArgs({ revision: undefined })), /invalid_motion_revision/);
assert.throws(() => validationController.animate(motionArgs({ snapToCanonical: undefined })), /motion_snap_to_canonical_required/);
validationController.release();
validationRegistry.dispose('motion-validation-test-complete');

console.log('THREEJS-096 motion controller contract: PASS');
