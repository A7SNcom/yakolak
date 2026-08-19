import assert from 'node:assert/strict';

import { createResourceRegistry } from '../web/app/core/resource-registry.js';
import {
  POINTER_GESTURE_POLICY,
  clientPointToCanvasNdc,
  createPointerEventsAdapter,
  projectCanvasNdcToRay,
} from '../web/app/gameplay/pointer-events-adapter.js';

class FakeCanvas {
  constructor(rect = { left: 10, top: 30, width: 320, height: 640 }) {
    this.rect = { ...rect };
    this.dataset = {};
    this.listeners = new Map();
    this.captured = new Set();
  }

  getBoundingClientRect() {
    const { left, top, width, height } = this.rect;
    return { left, top, width, height, right: left + width, bottom: top + height };
  }

  addEventListener(type, listener, options) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push({ listener, options });
  }

  removeEventListener(type, listener, options) {
    const records = this.listeners.get(type) || [];
    this.listeners.set(type, records.filter(record => record.listener !== listener || record.options !== options));
  }

  setPointerCapture(pointerId) {
    this.captured.add(pointerId);
  }

  releasePointerCapture(pointerId) {
    this.captured.delete(pointerId);
  }

  hasPointerCapture(pointerId) {
    return this.captured.has(pointerId);
  }

  dispatch(type, event) {
    event.type = type;
    for (const { listener } of [...(this.listeners.get(type) || [])]) {
      listener(event);
      if (event.immediatePropagationStopped) break;
    }
    return event;
  }
}

function fakeEvent({
  pointerId = 1,
  pointerType = 'touch',
  isPrimary = true,
  button = 0,
  clientX = 20,
  clientY = 40,
  cancelable = true,
} = {}) {
  return {
    pointerId,
    pointerType,
    isPrimary,
    button,
    clientX,
    clientY,
    cancelable,
    defaultPrevented: false,
    propagationStopped: false,
    immediatePropagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
    stopImmediatePropagation() {
      this.immediatePropagationStopped = true;
      this.propagationStopped = true;
    },
  };
}

function fakeRaycaster() {
  return {
    last: null,
    ray: {
      origin: { x: 0, y: 0, z: 0 },
      direction: { x: 0, y: 0, z: -1 },
    },
    setFromCamera(ndc, camera) {
      this.last = { ndc: { ...ndc }, camera };
      this.ray = {
        origin: { x: camera.originX, y: camera.originY, z: camera.originZ },
        direction: { x: ndc.x, y: ndc.y, z: -1 },
      };
    },
  };
}

assert.deepEqual(POINTER_GESTURE_POLICY, {
  dragThresholdCssPx: 8,
  compatClickDedupeMs: 750,
  compatClickDistanceCssPx: 12,
});

// Client coordinates use the actual CSS rect, not viewport width, drawing-buffer
// pixels, DPR or guessed safe-area offsets. Exact rect edges remain valid targets.
const geometryCanvas = new FakeCanvas({ left: 12, top: 44, width: 320, height: 640 });
const center = clientPointToCanvasNdc(geometryCanvas, 172, 364);
assert.deepEqual(center.local, { x: 160, y: 320 });
assert.deepEqual(center.ndc, { x: 0, y: 0 });
assert.equal(center.inside, true);
assert.deepEqual(clientPointToCanvasNdc(geometryCanvas, 12, 44).ndc, { x: -1, y: 1 });
assert.deepEqual(clientPointToCanvasNdc(geometryCanvas, 332, 684).ndc, { x: 1, y: -1 });
assert.equal(clientPointToCanvasNdc(geometryCanvas, 11.5, 44).inside, false);
assert(clientPointToCanvasNdc(geometryCanvas, 11.5, 44).ndc.x < -1);

const raycaster = fakeRaycaster();
const camera = { originX: 3, originY: 4, originZ: 5 };
assert.deepEqual(projectCanvasNdcToRay({ x: 0.25, y: -0.5 }, { camera, raycaster }), {
  origin: [3, 4, 5],
  direction: [0.25, -0.5, -1],
});
assert.deepEqual(raycaster.last, { ndc: { x: 0.25, y: -0.5 }, camera });

let nowMs = 100;
const canvas = new FakeCanvas();
const registry = createResourceRegistry({ platform: {} });
const packets = [];
const adapterRaycaster = fakeRaycaster();
const adapterCamera = { originX: 7, originY: 8, originZ: 9 };
const adapter = createPointerEventsAdapter({
  canvas,
  resourceRegistry: registry,
  onGesture: packet => packets.push(packet),
  getCamera: () => adapterCamera,
  raycaster: adapterRaycaster,
  clock: () => nowMs,
});

// Before gameplay explicitly owns gestures, pointer/context-menu events are left
// alone and canvas CSS ownership state is absent.
const idleDown = canvas.dispatch('pointerdown', fakeEvent());
assert.equal(idleDown.defaultPrevented, false);
assert.equal(packets.length, 0);
assert.deepEqual([...canvas.captured], []);
const idleMenu = canvas.dispatch('contextmenu', fakeEvent({ clientX: 0, clientY: 0 }));
assert.equal(idleMenu.defaultPrevented, false);
assert.equal(canvas.dataset.gestureOwner, undefined);

adapter.setGameplayGestureOwnership(true);
assert.equal(canvas.dataset.gestureOwner, 'gameplay');
assert.equal(adapter.snapshot().gameplayOwnsGestures, true);

// Exactly 8 CSS px remains a tap; drag begins only after crossing the threshold.
const down = canvas.dispatch('pointerdown', fakeEvent({ pointerId: 7, clientX: 20, clientY: 40 }));
assert.equal(down.defaultPrevented, true);
assert.equal(canvas.hasPointerCapture(7), true);
assert.equal(canvas.dataset.pointerGestureActive, 'true');
assert.equal(packets.at(-1).phase, 'start');
assert.equal(packets.at(-1).gesture, 'pending');
assert.deepEqual(packets.at(-1).current.ndc, {
  x: (10 / 320) * 2 - 1,
  y: 1 - (10 / 640) * 2,
});
assert.deepEqual(packets.at(-1).current.ray.origin, [7, 8, 9]);

nowMs = 110;
const atThreshold = canvas.dispatch('pointermove', fakeEvent({ pointerId: 7, clientX: 28, clientY: 40 }));
assert.equal(atThreshold.defaultPrevented, true);
assert.equal(packets.at(-1).gesture, 'pending');
nowMs = 120;
const tapUp = canvas.dispatch('pointerup', fakeEvent({ pointerId: 7, clientX: 28, clientY: 40 }));
assert.equal(tapUp.defaultPrevented, true);
assert.equal(canvas.hasPointerCapture(7), false);
assert.equal(canvas.dataset.pointerGestureActive, undefined);
assert.equal(packets.at(-1).phase, 'end');
assert.equal(packets.at(-1).gesture, 'tap');
assert.equal(packets.at(-1).durationMs, 20);
assert.deepEqual(packets.at(-1).deltaCss, { x: 8, y: 0 });
assert.equal(adapter.snapshot().compatClickPending, true);

// Compatibility click from the already-owned pointer gesture is consumed once;
// a second unrelated click is not swallowed.
nowMs = 121;
const syntheticClick = canvas.dispatch('click', fakeEvent({ clientX: 28, clientY: 40 }));
assert.equal(syntheticClick.defaultPrevented, true);
assert.equal(syntheticClick.immediatePropagationStopped, true);
const unrelatedClick = canvas.dispatch('click', fakeEvent({ clientX: 28, clientY: 40 }));
assert.equal(unrelatedClick.defaultPrevented, false);
assert.equal(unrelatedClick.immediatePropagationStopped, false);

// Crossing 8 CSS px classifies the gesture as drag and capture follows the pointer
// even when it leaves the canvas; outside coordinates remain outside instead of
// clamping onto a false edge hit.
nowMs = 200;
canvas.dispatch('pointerdown', fakeEvent({ pointerId: 8, pointerType: 'pen', clientX: 30, clientY: 50 }));
nowMs = 210;
canvas.dispatch('pointermove', fakeEvent({ pointerId: 8, pointerType: 'pen', clientX: 39, clientY: 50 }));
assert.equal(packets.at(-1).gesture, 'drag');
nowMs = 220;
canvas.dispatch('pointermove', fakeEvent({ pointerId: 8, pointerType: 'pen', clientX: 400, clientY: 50 }));
assert.equal(packets.at(-1).current.inside, false);
assert(packets.at(-1).current.ndc.x > 1);
nowMs = 230;
canvas.dispatch('pointerup', fakeEvent({ pointerId: 8, pointerType: 'pen', clientX: 400, clientY: 50 }));
assert.equal(packets.at(-1).gesture, 'drag');
assert.equal(packets.at(-1).phase, 'end');

// Pointer cancel releases capture and emits an explicit cancel packet.
nowMs = 300;
canvas.dispatch('pointerdown', fakeEvent({ pointerId: 9, clientX: 40, clientY: 60 }));
assert.equal(canvas.hasPointerCapture(9), true);
nowMs = 305;
const cancelledEvent = canvas.dispatch('pointercancel', fakeEvent({ pointerId: 9, clientX: 45, clientY: 65 }));
assert.equal(cancelledEvent.defaultPrevented, true);
assert.equal(canvas.hasPointerCapture(9), false);
assert.equal(packets.at(-1).phase, 'cancel');
assert.equal(packets.at(-1).reason, 'pointercancel');

// Unexpected capture loss uses the last normalized point rather than bogus 0/0
// coordinates sometimes exposed on capture-loss events.
nowMs = 400;
canvas.dispatch('pointerdown', fakeEvent({ pointerId: 10, clientX: 50, clientY: 70 }));
nowMs = 405;
canvas.dispatch('pointermove', fakeEvent({ pointerId: 10, clientX: 55, clientY: 72 }));
const expectedLastClient = { ...packets.at(-1).current.client };
canvas.captured.delete(10);
nowMs = 410;
canvas.dispatch('lostpointercapture', fakeEvent({ pointerId: 10, clientX: 0, clientY: 0 }));
assert.equal(packets.at(-1).phase, 'cancel');
assert.equal(packets.at(-1).reason, 'lostpointercapture');
assert.deepEqual(packets.at(-1).current.client, expectedLastClient);

// Releasing gameplay ownership cancels any active gesture, clears ownership CSS,
// and subsequent pointer/context-menu behavior is native again.
nowMs = 500;
canvas.dispatch('pointerdown', fakeEvent({ pointerId: 11, clientX: 60, clientY: 80 }));
assert.equal(canvas.hasPointerCapture(11), true);
nowMs = 505;
adapter.setGameplayGestureOwnership(false);
assert.equal(canvas.hasPointerCapture(11), false);
assert.equal(canvas.dataset.gestureOwner, undefined);
assert.equal(packets.at(-1).phase, 'cancel');
assert.equal(packets.at(-1).reason, 'ownership-released');
const nativeAgain = canvas.dispatch('pointerdown', fakeEvent({ pointerId: 12 }));
assert.equal(nativeAgain.defaultPrevented, false);
const nativeMenuAgain = canvas.dispatch('contextmenu', fakeEvent());
assert.equal(nativeMenuAgain.defaultPrevented, false);

// Context menu is prevented only while gameplay owns canvas gestures.
adapter.setGameplayGestureOwnership(true);
const ownedMenu = canvas.dispatch('contextmenu', fakeEvent());
assert.equal(ownedMenu.defaultPrevented, true);

// Non-primary/right mouse pointer never becomes the gameplay gesture.
const rightMouse = canvas.dispatch('pointerdown', fakeEvent({
  pointerId: 13,
  pointerType: 'mouse',
  button: 2,
}));
assert.equal(rightMouse.defaultPrevented, false);
assert.equal(canvas.hasPointerCapture(13), false);

// Expired compatibility-click dedupe never suppresses a later click.
nowMs = 600;
canvas.dispatch('pointerdown', fakeEvent({ pointerId: 14, clientX: 70, clientY: 90 }));
nowMs = 610;
canvas.dispatch('pointerup', fakeEvent({ pointerId: 14, clientX: 70, clientY: 90 }));
nowMs = 610 + POINTER_GESTURE_POLICY.compatClickDedupeMs + 1;
const expiredClick = canvas.dispatch('click', fakeEvent({ clientX: 70, clientY: 90 }));
assert.equal(expiredClick.defaultPrevented, false);

adapter.dispose();
assert.equal(canvas.dataset.gestureOwner, undefined);
assert.equal(registry.snapshot().listeners, 0);
registry.dispose('pointer-contract-complete');

console.log('THREEJS-030 pointer gesture contract: PASS');
