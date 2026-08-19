import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  DRAG_PHASES,
  DRAG_RETURN_EASING,
  createDragInteractionController,
} from '../web/app/gameplay/drag-interaction.js';
import {
  GAMEPLAY_AUTHORITY_ADAPTERS,
  GAMEPLAY_PRESENTATION_SOURCES,
  createGameplayIntent,
} from '../web/app/gameplay/gameplay-intent.js';
import { createMotionController } from '../web/app/gameplay/motion-controller.js';
import { createSizeSelectionController } from '../web/app/gameplay/size-selection.js';
import { createResourceRegistry } from '../web/app/core/resource-registry.js';
import { emptyBoard } from '../web/app/shared/rules.js';
import { configuredSeatOrder } from '../web/app/shared/seat-order.js';
import { createCanonicalSessionState } from '../web/app/session/canonical-session-state.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worldLayout = JSON.parse(readFileSync(
  path.join(root, 'YAKOLAK_PORTABLE_KIT/assets/layout/world-layout.json'),
  'utf8',
));
const approvedContract = JSON.parse(readFileSync(
  path.join(root, 'YAKOLAK_PORTABLE_KIT/assets/reference/approved-contract.json'),
  'utf8',
));

const seats = configuredSeatOrder('marble', 2).map((slot, index) => ({
  seatId: slot.seatId,
  type: index === 0 ? 'human' : 'computer',
  color: slot.color,
  ready: true,
}));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonical({
  revision = 30,
  generation = 5,
  activeSeatId = 'right',
  board = emptyBoard(),
} = {}) {
  return createCanonicalSessionState({
    preferredColor: 'marble',
    targetPlayers: 2,
    winsToMatch: 3,
    seats,
    board,
    activeSeatId,
    deadlineAtMs: 90_000,
    revision,
    lifecycle: { phase: 'turn-loop', presentationGeneration: generation },
  });
}

function fakePlatform() {
  let sequence = 0;
  const active = new Map();
  const all = new Map();
  return {
    requestAnimationFrame(callback) {
      const id = ++sequence;
      active.set(id, callback);
      all.set(id, callback);
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
      const callback = all.get(id);
      if (!callback) return false;
      callback();
      return true;
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function rayAt(x, z) {
  return { origin: [x, 100, z], direction: [0, -1, 0] };
}

function homeTransform() {
  return {
    position: [135, 2, -48],
    rotationDegrees: [-90, 0, 0],
    scale: [1, 1, 1],
  };
}

function createHarness({ state, size = 'medium', stackTargetId = 'stack:right:0' } = {}) {
  let nowMs = 0;
  const platform = fakePlatform();
  const registry = createResourceRegistry({ platform });
  const motion = createMotionController({
    resourceRegistry: registry,
    clock: () => nowMs,
    generation: state.lifecycle.presentationGeneration,
    revision: state.revision,
  });
  const selectionController = createSizeSelectionController();
  const selection = selectionController.select(state, { stackTargetId, size });
  const pieceId = `piece:marble:${size}:1`;
  const transforms = new Map([[pieceId, homeTransform()]]);
  const canonicalTransforms = new Map([[pieceId, homeTransform()]]);
  const live = new Set([pieceId]);
  const applyLog = [];
  const snapLog = [];
  const cameraLog = [];
  const submitLog = [];
  const pending = deferred();

  const presentation = {
    readPieceTransform(id) {
      const value = transforms.get(id);
      return value ? clone(value) : null;
    },
    readCanonicalPieceTransform(id) {
      const value = canonicalTransforms.get(id);
      return value ? clone(value) : null;
    },
    applyDragTransform(id, transform, meta) {
      transforms.set(id, clone(transform));
      applyLog.push({ id, transform: clone(transform), meta: clone(meta) });
    },
    snapPieceCanonical(id, meta) {
      const canonicalTransform = canonicalTransforms.get(id);
      if (!canonicalTransform) throw new Error('missing-canonical-transform');
      transforms.set(id, clone(canonicalTransform));
      snapLog.push({ id, meta: clone(meta) });
    },
    isPieceLive(id) {
      return live.has(id);
    },
  };

  const authority = {
    submit(intent) {
      submitLog.push(intent);
      return pending.promise;
    },
    snapshot() {
      return Promise.resolve(state);
    },
  };

  const intentFactory = input => createGameplayIntent({
    ...input,
    adapter: GAMEPLAY_AUTHORITY_ADAPTERS.LOCAL,
  });

  const drag = createDragInteractionController({
    motionController: motion,
    authority,
    intentFactory,
    presentation,
    setCameraGesturesEnabled(enabled) {
      cameraLog.push(enabled);
    },
    clearSelection(reason, nextState = null) {
      return selectionController.clear(reason, nextState);
    },
    approvedContract,
    worldLayout,
  });

  return {
    state,
    pieceId,
    platform,
    registry,
    motion,
    selectionController,
    selection,
    transforms,
    canonicalTransforms,
    live,
    applyLog,
    snapLog,
    cameraLog,
    submitLog,
    pending,
    drag,
    setNow(value) { nowMs = value; },
    dispose() {
      motion.release();
      registry.dispose('drag-contract-harness-complete');
    },
  };
}

assert.equal(DRAG_RETURN_EASING, 'easeInOutCubic');
assert.equal(approvedContract.rules.dragHeight, 14);
assert.equal(approvedContract.motion.invalidReturnMs, 300);

// Direct drag follows the pointer at boardY + 14 without creating a tween and exposes
// at most one validated THREEJS-034 destination while camera gestures are disabled.
const mainBoard = emptyBoard();
mainBoard['4'].medium = 'blue';
const state30 = canonical({ board: mainBoard });
const main = createHarness({ state: state30 });
assert.deepEqual(main.drag.snapshot(), { phase: DRAG_PHASES.IDLE });
const begun = main.drag.begin({
  state: state30,
  selection: main.selection,
  pointerId: 7,
  pointerType: 'touch',
});
assert.equal(begun.phase, DRAG_PHASES.DRAGGING);
assert.equal(begun.pieceId, 'piece:marble:medium:1');
assert.deepEqual(main.cameraLog, [false]);
assert.equal(main.registry.snapshot().animationHandles, 0);

const legalUpdate = main.drag.update({
  state: state30,
  selection: main.selection,
  pointerId: 7,
  pointerType: 'touch',
  ray: rayAt(48, 0),
});
assert.deepEqual(main.transforms.get(main.pieceId).position, [48, 16, 0]);
assert.equal(main.applyLog.at(-1).meta.directPointerFollow, true);
assert.equal(main.applyLog.at(-1).meta.dragHeight, 14);
assert.deepEqual(legalUpdate.candidate, {
  targetId: 'board:5',
  cell: 5,
  radius: 42,
  candidateDistance: 0,
  worldPoint: [48, 2, 0],
  placement: { seatId: 'right', color: 'marble', cell: 5, size: 'medium' },
});
assert.equal(Array.isArray(legalUpdate.candidate), false, 'drag exposes at most one candidate');
assert.equal(main.registry.snapshot().animationHandles, 0, 'direct pointer follow is not a tween');

const illegalOverlap = main.drag.update({
  state: state30,
  selection: main.selection,
  pointerId: 7,
  pointerType: 'touch',
  ray: rayAt(24, 0),
});
assert.equal(illegalOverlap.candidate, null);
assert.equal(illegalOverlap.diagnostic.code, 'candidate_illegal_for_selected_size');
assert.equal(illegalOverlap.diagnostic.ruleCode, 'occupied_slot');
assert.equal(illegalOverlap.diagnostic.candidateCell, 4);
assert.deepEqual(main.transforms.get(main.pieceId).position, [24, 16, 0]);

// Valid release recomputes the release candidate, submits exactly once through the
// generic authority adapter, becomes pending immediately and allocates NO travel tween.
const pendingRelease = main.drag.release({
  state: state30,
  selection: main.selection,
  pointerId: 7,
  pointerType: 'touch',
  ray: rayAt(48, 0),
});
assert.equal(pendingRelease.status, 'pending');
assert.equal(main.submitLog.length, 1);
assert.equal(pendingRelease.intent.presentation.source, GAMEPLAY_PRESENTATION_SOURCES.DRAG_RELEASE);
assert.deepEqual(pendingRelease.intent.payload, { cell: 5, size: 'medium' });
assert.equal(pendingRelease.travelRequest.owner, 'THREEJS-042');
assert.equal(pendingRelease.travelRequest.pieceId, main.pieceId);
assert.deepEqual(pendingRelease.travelRequest.fromTransform.position, [48, 16, 0]);
assert.equal(main.drag.snapshot().phase, DRAG_PHASES.PENDING);
assert.deepEqual(main.cameraLog, [false, true]);
assert.equal(main.registry.snapshot().animationHandles, 0, 'accepted travel belongs to THREEJS-042, not 035');

// Pending cannot be locally undone or duplicated. Releasing/cancelling again returns
// the same pending request and never calls authority a second time.
assert.equal(main.drag.cancel({ state: state30 }), false);
assert.equal(main.drag.pointerCancel({ clearState: state30 }), false);
const repeatedRelease = main.drag.release({ state: state30 });
assert.equal(repeatedRelease.status, 'pending');
assert.equal(repeatedRelease.submission, pendingRelease.submission);
assert.equal(main.submitLog.length, 1);
assert.deepEqual(main.transforms.get(main.pieceId).position, [48, 16, 0]);

// Hydration/revision update owns pending resolution. It drops local drag presentation
// immediately and snaps from the latest canonical snapshot; a late submit resolution
// has no local presentation callback to replay.
const acceptedBoard = emptyBoard();
acceptedBoard['4'].medium = 'blue';
acceptedBoard['5'].medium = 'marble';
const acceptedState = canonical({ revision: 31, activeSeatId: 'back', board: acceptedBoard });
main.canonicalTransforms.set(main.pieceId, {
  position: [48, 2, 0],
  rotationDegrees: [-90, 0, 0],
  scale: [1, 1, 1],
});
assert.equal(main.drag.reconcileCanonical({
  state: acceptedState,
  clearReason: 'accepted-resync',
  reason: 'authority-accepted',
}), true);
assert.equal(main.drag.snapshot().phase, DRAG_PHASES.IDLE);
assert.deepEqual(main.transforms.get(main.pieceId).position, [48, 2, 0]);
assert.equal(main.selectionController.snapshot().selectedSize, null);
assert.equal(main.selectionController.snapshot().clearReason, 'accepted-resync');
main.pending.resolve({ accepted: true, snapshot: acceptedState });
await pendingRelease.submission;
assert.deepEqual(main.transforms.get(main.pieceId).position, [48, 2, 0]);
main.dispose();

// Invalid/outside-radius release never submits. It requests the canonical return only
// through THREEJS-096 using the approved 300ms duration and keeps size selection for correction.
const invalid = createHarness({ state: state30 });
invalid.drag.begin({ state: state30, selection: invalid.selection, pointerId: 8, pointerType: 'mouse' });
invalid.drag.update({
  state: state30,
  selection: invalid.selection,
  pointerId: 8,
  pointerType: 'mouse',
  ray: rayAt(100, 100),
});
assert.deepEqual(invalid.transforms.get(invalid.pieceId).position, [100, 16, 100]);
const invalidRelease = invalid.drag.release({
  state: state30,
  selection: invalid.selection,
  pointerId: 8,
  pointerType: 'mouse',
  ray: rayAt(100, 100),
});
assert.equal(invalidRelease.status, 'returned');
assert.equal(invalidRelease.reason, 'invalid-release');
assert.equal(invalid.submitLog.length, 0);
assert.equal(invalid.drag.snapshot().phase, DRAG_PHASES.IDLE);
assert.equal(invalid.selectionController.snapshot().selectedSize, 'medium', 'invalid pre-submit drop remains correctable');
assert.equal(invalid.registry.snapshot().animationHandles, 1);
assert.equal(invalid.motion.snapshot().active[0].durationMs, 300);
assert.equal(invalid.motion.snapshot().active[0].easing, 'easeInOutCubic');
invalid.setNow(150);
for (const id of invalid.platform.pendingIds()) invalid.platform.fire(id);
assert.deepEqual(invalid.transforms.get(invalid.pieceId).position, [117.5, 9, 26]);
invalid.setNow(300);
for (const id of invalid.platform.pendingIds()) invalid.platform.fire(id);
assert.equal((await invalidRelease.returnHandle.finished).status, 'completed');
assert.deepEqual(invalid.transforms.get(invalid.pieceId), homeTransform());
invalid.dispose();

// Explicit user cancel also uses 096 return but clears THREEJS-033 selection atomically.
const cancelled = createHarness({ state: state30 });
cancelled.drag.begin({ state: state30, selection: cancelled.selection, pointerId: 9, pointerType: 'touch' });
cancelled.drag.update({ state: state30, selection: cancelled.selection, pointerId: 9, pointerType: 'touch', ray: rayAt(48, 0) });
assert.equal(cancelled.drag.cancel({ state: state30, reason: 'cancel-button' }), true);
assert.equal(cancelled.selectionController.snapshot().selectedSize, null);
assert.equal(cancelled.selectionController.snapshot().clearReason, 'cancel');
assert.equal(cancelled.registry.snapshot().animationHandles, 1);
cancelled.setNow(300);
for (const id of cancelled.platform.pendingIds()) cancelled.platform.fire(id);
assert.deepEqual(cancelled.transforms.get(cancelled.pieceId), homeTransform());
cancelled.dispose();

// Browser pointercancel is different from a deliberate invalid drop: local drag is
// dropped immediately and rebuilt/snatched from canonical state, with no return tween.
const pointerCancelled = createHarness({ state: state30 });
pointerCancelled.drag.begin({ state: state30, selection: pointerCancelled.selection, pointerId: 10, pointerType: 'touch' });
pointerCancelled.drag.update({ state: state30, selection: pointerCancelled.selection, pointerId: 10, pointerType: 'touch', ray: rayAt(48, 0) });
assert.equal(pointerCancelled.drag.pointerCancel({ clearState: state30 }), true);
assert.deepEqual(pointerCancelled.transforms.get(pointerCancelled.pieceId), homeTransform());
assert.equal(pointerCancelled.registry.snapshot().animationHandles, 0);
assert.equal(pointerCancelled.snapLog.at(-1).meta.immediate, true);
assert.equal(pointerCancelled.selectionController.snapshot().clearReason, 'cancel');
pointerCancelled.dispose();

// Lifecycle/revision/hydration change also drops direct presentation immediately. No
// move intent is submitted and no gameplay state is mutated by the drag controller.
const resync = createHarness({ state: state30 });
resync.drag.begin({ state: state30, selection: resync.selection, pointerId: 11, pointerType: 'touch' });
resync.drag.update({ state: state30, selection: resync.selection, pointerId: 11, pointerType: 'touch', ray: rayAt(48, 0) });
const hydrationState = canonical({ revision: 31, generation: 6, activeSeatId: 'back', board: mainBoard });
assert.equal(resync.drag.reconcileCanonical({
  state: hydrationState,
  clearReason: 'reconnect',
  reason: 'hydration',
}), true);
assert.deepEqual(resync.transforms.get(resync.pieceId), homeTransform());
assert.equal(resync.drag.snapshot().phase, DRAG_PHASES.IDLE);
assert.equal(resync.submitLog.length, 0);
assert.equal(resync.registry.snapshot().animationHandles, 0);
assert.equal(resync.selectionController.snapshot().clearReason, 'reconnect');
assert.deepEqual(resync.cameraLog, [false, true]);
resync.dispose();

// A tampered/used home-piece target cannot start drag even if pointer code tries to
// bypass THREEJS-033 UI filtering.
const usedBoard = emptyBoard();
usedBoard['0'].small = 'marble';
usedBoard['1'].small = 'marble';
const usedState = canonical({ board: usedBoard });
const usedHarness = createHarness({ state: usedState, size: 'medium' });
const tamperedSelection = Object.freeze({
  ...usedHarness.selection,
  selectedSize: 'small',
  stackTargetId: 'stack:right:1',
  selectedPieceTargetId: 'home-piece:right:1:small',
});
assert.throws(() => usedHarness.drag.begin({
  state: usedState,
  selection: tamperedSelection,
  pointerId: 12,
  pointerType: 'touch',
}), /home_piece_already_used/);
assert.deepEqual(usedHarness.cameraLog, []);
usedHarness.dispose();

// Source ownership: direct pointer follow is immediate; only the canonical-return path
// calls THREEJS-096. No local RAF/timer/tween loop or accepted-travel animation exists.
const source = readFileSync(path.join(root, 'web/app/gameplay/drag-interaction.js'), 'utf8');
assert.doesNotMatch(source, /requestAnimationFrame|cancelAnimationFrame|setTimeout|setInterval/);
assert.match(source, /motion\.animate\s*\(/);
assert.match(source, /owner:\s*'THREEJS-042'/);
assert.match(source, /directPointerFollow:\s*true/);
assert.match(source, /drag_submission_pending/);
assert.match(source, /reconcileCanonical/);
assert.equal((source.match(/motion\.animate\s*\(/g) || []).length, 1, '035 only animates canonical return; accepted travel is not animated here');

console.log('THREEJS-035 full drag interaction contract: PASS');
