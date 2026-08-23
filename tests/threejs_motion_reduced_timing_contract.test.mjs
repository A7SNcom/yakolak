import assert from 'node:assert/strict';

import { createResourceRegistry } from '../web/app/core/resource-registry.js';
import { createMotionController } from '../web/app/gameplay/motion-controller.js';

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

function motionArgs(overrides = {}) {
  return {
    scope: 'setup',
    key: 'surface',
    generation: 4,
    revision: 12,
    durationMs: 1000,
    reducedDurationMs: 200,
    from: 0,
    to: 10,
    easing: 'linear',
    apply: () => {},
    isTargetLive: () => true,
    snapToCanonical: () => {},
    ...overrides,
  };
}

let nowMs = 0;
const platform = fakePlatform();
const registry = createResourceRegistry({ platform });
const controller = createMotionController({
  resourceRegistry: registry,
  clock: () => nowMs,
  generation: 4,
  revision: 12,
  reducedMotion: true,
});

// Approved reduced timings keep the same scheduler/handle semantics instead of
// taking a separate instant lifecycle path.
const reducedWrites = [];
const reduced = controller.animate(motionArgs({
  apply: (value, meta) => reducedWrites.push({ value, meta }),
}));
assert.deepEqual(reducedWrites.map(write => write.value), [0]);
assert.equal(controller.snapshot().active[0].durationMs, 1000);
assert.equal(controller.snapshot().active[0].reducedDurationMs, 200);
assert.equal(controller.snapshot().active[0].effectiveDurationMs, 200);
assert.equal(controller.snapshot().active[0].timingMode, 'reduced');
assert.equal(registry.snapshot().animationHandles, 1);

nowMs = 100;
platform.fire(platform.pendingIds()[0]);
assert.deepEqual(reducedWrites.map(write => write.value), [0, 5]);
assert.equal(reducedWrites.at(-1).meta.timingMode, 'reduced');

nowMs = 200;
platform.fire(platform.pendingIds()[0]);
assert.deepEqual(reducedWrites.map(write => write.value), [0, 5, 10]);
const reducedResult = await reduced.finished;
assert.equal(reducedResult.status, 'completed');
assert.equal(reducedResult.timingMode, 'reduced');
assert.equal(reducedResult.snapAttempted, false);
assert.equal(registry.snapshot().animationHandles, 0);

// Changing the preference mid-flight retimes the same semantic motion. The old
// registry-owned callback may fire late but cannot write, and no canonical
// cancellation snap occurs merely because accessibility timing changed.
controller.setReducedMotion(false);
nowMs = 300;
const retimedWrites = [];
let retimedSnaps = 0;
const retimed = controller.animate(motionArgs({
  scope: 'reveal',
  key: 'room',
  from: 0,
  to: 100,
  apply: value => retimedWrites.push(value),
  snapToCanonical: () => { retimedSnaps += 1; },
}));
assert.deepEqual(retimedWrites, [0]);
nowMs = 550;
platform.fire(platform.pendingIds()[0]);
assert.deepEqual(retimedWrites, [0, 25]);
const staleNormalFrame = platform.pendingIds()[0];
const sequenceBeforeRetime = retimed.sequence;
controller.setReducedMotion(true);
assert.equal(controller.snapshot().active[0].sequence, sequenceBeforeRetime);
assert.equal(controller.snapshot().active[0].effectiveDurationMs, 200);
assert.equal(controller.snapshot().active[0].timingMode, 'reduced');
assert.equal(retimedSnaps, 0);

platform.fireCancelled(staleNormalFrame);
assert.deepEqual(retimedWrites, [0, 25]);
nowMs = 650;
platform.fire(platform.pendingIds()[0]);
assert.deepEqual(retimedWrites, [0, 25, 75]);
nowMs = 700;
platform.fire(platform.pendingIds()[0]);
assert.deepEqual(retimedWrites, [0, 25, 75, 100]);
const retimedResult = await retimed.finished;
assert.equal(retimedResult.status, 'completed');
assert.equal(retimedResult.timingMode, 'reduced');
assert.equal(retimedSnaps, 0);

assert.throws(() => controller.animate(motionArgs({
  durationMs: 100,
  reducedDurationMs: 101,
})), /reduced_motion_duration_must_not_exceed_normal/);

controller.release();
registry.dispose('motion-reduced-timing-test-complete');

console.log('THREEJS-096 approved Reduced Motion timing contract: PASS');
