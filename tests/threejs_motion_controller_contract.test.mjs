import assert from 'node:assert/strict';

import { createResourceRegistry } from '../web/app/core/resource-registry.js';
import {
  MOTION_EASINGS,
  createMotionController,
} from '../web/app/gameplay/motion-controller.js';

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
});

// One numeric-tree tween can carry transform/scale/opacity together. Initial state
// applies synchronously; every subsequent frame is resource-registry-owned.
const applied = [];
const target = { live: true };
const first = controller.animate({
  scope: 'stack:right:0',
  key: 'open-close',
  generation: 1,
  durationMs: 100,
  from: { position: [0, 0, 0], scale: [1, 1, 1], opacity: 0 },
  to: { position: [10, 20, 30], scale: [2, 2, 2], opacity: 1 },
  easing: 'linear',
  apply: (value, meta) => applied.push({ value, meta }),
  isTargetLive: () => target.live,
});
assert.equal(applied.length, 1);
assert.deepEqual(applied[0].value, { opacity: 0, position: [0, 0, 0], scale: [1, 1, 1] });
assert.equal(registry.snapshot().animationHandles, 1);
assert.equal(controller.snapshot().activeCount, 1);
let frameId = platform.pendingIds()[0];
nowMs = 50;
platform.fire(frameId);
assert.deepEqual(applied.at(-1).value, { opacity: 0.5, position: [5, 10, 15], scale: [1.5, 1.5, 1.5] });
assert.equal(applied.at(-1).meta.progress, 0.5);
assert.equal(registry.snapshot().animationHandles, 1);
frameId = platform.pendingIds()[0];
nowMs = 100;
platform.fire(frameId);
assert.deepEqual(applied.at(-1).value, { opacity: 1, position: [10, 20, 30], scale: [2, 2, 2] });
assert.deepEqual(await first.finished, {
  scope: 'stack:right:0', key: 'open-close', generation: 1, sequence: 1, status: 'completed', reason: null,
});
assert.equal(controller.snapshot().activeCount, 0);
assert.equal(registry.snapshot().animationHandles, 0);

// Newer motion for the same scoped key cancels the old motion. Even if a platform
// delivers the cancelled rAF callback later, the sequence/current-entry check makes
// that stale callback a no-op.
nowMs = 200;
const oldWrites = [];
const old = controller.animate({
  scope: 'piece:right:0:large', key: 'transform', generation: 1, durationMs: 100,
  from: [0], to: [10], apply: value => oldWrites.push(value[0]), isTargetLive: () => true,
});
const cancelledFrameId = platform.pendingIds()[0];
const newerWrites = [];
const newer = controller.animate({
  scope: 'piece:right:0:large', key: 'transform', generation: 1, durationMs: 100,
  from: [3], to: [30], apply: value => newerWrites.push(value[0]), isTargetLive: () => true,
});
assert.equal(oldWrites.length, 1);
assert.equal(newerWrites.length, 1);
assert.equal(platform.fireCancelled(cancelledFrameId), true);
assert.deepEqual(oldWrites, [0], 'cancelled callback must not mutate superseded target state');
assert.equal((await old.finished).status, 'cancelled');
assert.equal((await old.finished).reason, 'superseded-by-newer-motion');
nowMs = 300;
platform.fire(platform.pendingIds()[0]);
assert.equal((await newer.finished).status, 'completed');
assert.deepEqual(newerWrites, [3, 30]);

// Different scoped keys coexist; cancelScope cancels only that logical interaction.
nowMs = 400;
const left = controller.animate({
  scope: 'stack:right:0', key: 'piece:large', generation: 1, durationMs: 100,
  from: 0, to: 1, apply: () => {}, isTargetLive: () => true,
});
const right = controller.animate({
  scope: 'stack:right:1', key: 'piece:large', generation: 1, durationMs: 100,
  from: 0, to: 1, apply: () => {}, isTargetLive: () => true,
});
assert.equal(controller.snapshot().activeCount, 2);
assert.equal(controller.cancelScope('stack:right:0', 'stack-closed'), 1);
assert.equal((await left.finished).status, 'cancelled');
assert.equal(controller.snapshot().activeCount, 1);
assert.equal(controller.cancel('stack:right:1', 'piece:large', 'other-stack-opened'), true);
assert.equal((await right.finished).reason, 'other-stack-opened');
assert.equal(controller.snapshot().activeCount, 0);

// Generation change invalidates all active callbacks. A stale-generation request is
// settled without applying from/to or scheduling a frame.
nowMs = 500;
let generationWrites = 0;
const generationMotion = controller.animate({
  scope: 'selection', key: 'pulse', generation: 1, durationMs: 100,
  from: 0, to: 1, apply: () => { generationWrites += 1; }, isTargetLive: () => true,
});
const generationFrame = platform.pendingIds()[0];
assert.equal(generationWrites, 1);
controller.setGeneration(2);
assert.equal((await generationMotion.finished).reason, 'generation-changed');
platform.fireCancelled(generationFrame);
assert.equal(generationWrites, 1);
let staleWrites = 0;
const staleGeneration = controller.animate({
  scope: 'selection', key: 'pulse', generation: 1, durationMs: 100,
  from: 0, to: 1, apply: () => { staleWrites += 1; }, isTargetLive: () => true,
});
assert.equal((await staleGeneration.finished).status, 'stale-generation');
assert.equal(staleWrites, 0);
assert.equal(registry.snapshot().animationHandles, 0);

// Rebuilt/released targets are checked immediately before every apply. Once liveness
// changes, no stale frame mutates the object and the handle settles.
nowMs = 600;
const liveness = { live: true, writes: [] };
const liveMotion = controller.animate({
  scope: 'piece', key: 'return-home', generation: 2, durationMs: 100,
  from: 0, to: 10, apply: value => liveness.writes.push(value), isTargetLive: () => liveness.live,
});
const liveFrame = platform.pendingIds()[0];
assert.deepEqual(liveness.writes, [0]);
liveness.live = false;
nowMs = 650;
platform.fire(liveFrame);
assert.deepEqual(liveness.writes, [0]);
assert.equal((await liveMotion.finished).status, 'stale-target');
assert.equal(registry.snapshot().animationHandles, 0);

// Reduced Motion during an active cosmetic tween cancels rAF and writes only the
// exact final committed presentation state. No gameplay caller needs to await it.
nowMs = 700;
const reducedWrites = [];
const reducedActive = controller.animate({
  scope: 'stack', key: 'open', generation: 2, durationMs: 500,
  from: { x: 0, opacity: 0 }, to: { x: 42, opacity: 1 },
  apply: value => reducedWrites.push(value), isTargetLive: () => true,
});
const reducedFrame = platform.pendingIds()[0];
assert.equal(registry.snapshot().animationHandles, 1);
controller.setReducedMotion(true);
assert.equal(registry.snapshot().animationHandles, 0);
assert.deepEqual(reducedWrites, [{ opacity: 0, x: 0 }, { opacity: 1, x: 42 }]);
assert.equal((await reducedActive.finished).status, 'reduced-motion');
platform.fireCancelled(reducedFrame);
assert.equal(reducedWrites.length, 2);

// New motion while Reduced Motion is enabled immediately reaches final state and
// never allocates an animation frame. Duration zero behaves the same when motion is enabled.
const instantWrites = [];
const instant = controller.animate({
  scope: 'piece', key: 'lift', generation: 2, durationMs: 250,
  from: [0, 0, 0], to: [0, 14, 0], apply: value => instantWrites.push(value), isTargetLive: () => true,
});
assert.deepEqual(instantWrites, [[0, 14, 0]]);
assert.equal((await instant.finished).status, 'reduced-motion');
assert.equal(registry.snapshot().animationHandles, 0);
controller.setReducedMotion(false);
const zeroWrites = [];
const zero = controller.animate({
  scope: 'piece', key: 'snap', generation: 2, durationMs: 0,
  from: 0, to: 9, apply: value => zeroWrites.push(value), isTargetLive: () => true,
});
assert.deepEqual(zeroWrites, [9]);
assert.equal((await zero.finished).status, 'completed');

// A media-query subscription is registry-owned and switching it on snaps active
// motion to final. Releasing the controller removes the listener and active handles.
const mediaPlatform = fakePlatform();
const mediaRegistry = createResourceRegistry({ platform: mediaPlatform });
const mediaQuery = new FakeMediaQuery(false);
let mediaNow = 0;
const mediaController = createMotionController({
  resourceRegistry: mediaRegistry,
  clock: () => mediaNow,
  generation: 3,
  reducedMotionQuery: mediaQuery,
});
assert.equal(mediaRegistry.snapshot().listeners, 1);
const mediaWrites = [];
const mediaMotion = mediaController.animate({
  scope: 'overlay', key: 'opacity', generation: 3, durationMs: 100,
  from: 0, to: 1, apply: value => mediaWrites.push(value), isTargetLive: () => true,
});
const mediaFrame = mediaPlatform.pendingIds()[0];
mediaQuery.set(true);
assert.deepEqual(mediaWrites, [0, 1]);
assert.equal((await mediaMotion.finished).status, 'reduced-motion');
mediaPlatform.fireCancelled(mediaFrame);
assert.deepEqual(mediaWrites, [0, 1]);
assert.equal(mediaController.release(), true);
assert.equal(mediaRegistry.snapshot().listeners, 0);
assert.equal(mediaRegistry.snapshot().animationHandles, 0);
assert.equal(mediaQuery.listeners.size, 0);
mediaRegistry.dispose('motion-media-test-complete');

// Controller release settles active work and blocks stale cancelled callbacks.
nowMs = 900;
const releaseWrites = [];
const releaseMotion = controller.animate({
  scope: 'reset', key: 'return-home', generation: 2, durationMs: 100,
  from: 0, to: 1, apply: value => releaseWrites.push(value), isTargetLive: () => true,
});
const releaseFrame = platform.pendingIds()[0];
assert.equal(controller.release(), true);
assert.equal((await releaseMotion.finished).reason, 'controller-released');
platform.fireCancelled(releaseFrame);
assert.deepEqual(releaseWrites, [0]);
assert.equal(registry.snapshot().animationHandles, 0);
assert.throws(() => controller.animate({}), /motion_controller_disposed/);
registry.dispose('motion-controller-test-complete');

console.log('THREEJS-096 motion controller contract: PASS');
