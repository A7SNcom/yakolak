import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { createResourceRegistry } from '../web/app/core/resource-registry.js';
import { createMotionController } from '../web/app/gameplay/motion-controller.js';
import {
  STACK_CLOSE_ARC_HEIGHT,
  STACK_MOTION_EASING,
  STACK_OPEN_SEPARATION_Y,
  cancelStackMotion,
  deriveStackMotionPlan,
  submitStackMotionPlan,
} from '../web/app/gameplay/stack-motion-sequences.js';
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const seats = configuredSeatOrder('marble', 2).map((slot, index) => ({
  seatId: slot.seatId,
  type: index === 0 ? 'human' : 'computer',
  color: slot.color,
  ready: true,
}));
const board = emptyBoard();
board['0'].small = 'marble';
board['1'].small = 'marble';
board['2'].medium = 'marble';
const state = createCanonicalSessionState({
  preferredColor: 'marble',
  targetPlayers: 2,
  winsToMatch: 3,
  seats,
  board,
  activeSeatId: 'right',
  deadlineAtMs: 20_000,
  revision: 17,
  lifecycle: { phase: 'turn-loop', presentationGeneration: 4 },
});

assert.equal(STACK_OPEN_SEPARATION_Y, 19);
assert.equal(STACK_CLOSE_ARC_HEIGHT, 10);
assert.equal(STACK_MOTION_EASING, 'easeInOutCubic');

const openPlan = deriveStackMotionPlan({
  state,
  stackTargetId: 'stack:right:0',
  action: 'open',
  worldLayout,
  approvedContract,
});
assert.equal(openPlan.generation, 4);
assert.equal(openPlan.revision, 17);
assert.equal(openPlan.durationMs, 360);
assert.equal(openPlan.easing, 'easeInOutCubic');
assert.deepEqual(openPlan.pieces.map(piece => [piece.size, piece.pieceId, piece.targetTransform.position, piece.arcHeight]), [
  ['large', 'piece:marble:large:1', [135, 2, -48], 0],
  ['medium', 'piece:marble:medium:1', [135, 21, -48], 0],
  ['small', 'piece:marble:small:1', [135, 40, -48], 0],
]);
assert(openPlan.pieces.every(piece => (
  JSON.stringify(piece.homeTransform.rotationDegrees) === JSON.stringify([-90, 0, 0])
  && JSON.stringify(piece.targetTransform.scale) === JSON.stringify([1, 1, 1])
)));

// Used copies are absent before sequence construction; another seat cannot open.
const secondStack = deriveStackMotionPlan({
  state,
  stackTargetId: 'stack:right:1',
  action: 'open',
  worldLayout,
  approvedContract,
});
assert.deepEqual(secondStack.pieces.map(piece => [piece.size, piece.targetTransform.position[1]]), [
  ['large', 2],
  ['medium', 21],
]);
assert.throws(() => deriveStackMotionPlan({
  state,
  stackTargetId: 'stack:back:0',
  action: 'open',
  worldLayout,
  approvedContract,
}), /home_stack_not_active_seat/);

let nowMs = 0;
const platform = fakePlatform();
const registry = createResourceRegistry({ platform });
const controller = createMotionController({
  resourceRegistry: registry,
  clock: () => nowMs,
  generation: 4,
  revision: 17,
});
const transforms = new Map();
const canonicalTransforms = new Map();
const livePieces = new Set();
const applyLog = [];
const snapLog = [];
for (const piece of openPlan.pieces) {
  transforms.set(piece.pieceId, clone(piece.homeTransform));
  canonicalTransforms.set(piece.pieceId, clone(piece.homeTransform));
  livePieces.add(piece.pieceId);
}
const presentation = {
  readPieceTransform(pieceId) {
    const value = transforms.get(pieceId);
    return value ? clone(value) : null;
  },
  applyPieceTransform(pieceId, transform, meta) {
    transforms.set(pieceId, clone(transform));
    applyLog.push({ pieceId, transform: clone(transform), progress: meta.progress });
  },
  snapPieceCanonical(pieceId, meta) {
    const canonical = canonicalTransforms.get(pieceId);
    if (!canonical) throw new Error('missing-canonical-transform');
    transforms.set(pieceId, clone(canonical));
    snapLog.push({ pieceId, reason: meta.reason, revision: meta.controllerRevision });
  },
  isPieceLive(pieceId) {
    return livePieces.has(pieceId);
  },
};

// Submission is all-or-nothing at the sequence boundary: all current transforms are
// preflighted before authority sync or the first 096 tween is allocated.
const brokenPresentation = {
  ...presentation,
  readPieceTransform(pieceId) {
    if (pieceId === 'piece:marble:medium:1') return null;
    return presentation.readPieceTransform(pieceId);
  },
};
assert.throws(() => submitStackMotionPlan({
  plan: openPlan,
  motionController: controller,
  presentation: brokenPresentation,
}), /stack_motion_piece_transform_missing/);
assert.equal(controller.snapshot().activeCount, 0);
assert.equal(controller.snapshot().revision, 17);
assert.equal(registry.snapshot().animationHandles, 0);

// Open: every remaining piece runs through the one THREEJS-096 controller.
const opened = submitStackMotionPlan({ plan: openPlan, motionController: controller, presentation });
assert.equal(opened.handles.length, 3);
assert.equal(registry.snapshot().animationHandles, 3);
nowMs = 360;
for (const id of platform.pendingIds()) platform.fire(id);
for (const handle of opened.handles) assert.equal((await handle.finished).status, 'completed');
assert.deepEqual(openPlan.pieces.map(piece => transforms.get(piece.pieceId).position[1]), [2, 21, 40]);
assert.equal(snapLog.length, 0);

// Close: the stationary anchor has no arc; only separated pieces use approved arc 10.
const closePlan = deriveStackMotionPlan({
  state,
  stackTargetId: 'stack:right:0',
  action: 'close',
  worldLayout,
  approvedContract,
});
assert.equal(closePlan.durationMs, 360);
assert.equal(closePlan.closeArcHeight, 10);
assert.deepEqual(closePlan.pieces.map(piece => piece.arcHeight), [0, 10, 10]);
nowMs = 400;
const closing = submitStackMotionPlan({ plan: closePlan, motionController: controller, presentation });
nowMs = 580;
for (const id of platform.pendingIds()) platform.fire(id);
assert.equal(transforms.get('piece:marble:large:1').position[1], 2);
assert.equal(transforms.get('piece:marble:medium:1').position[1], 21.5);
assert.equal(transforms.get('piece:marble:small:1').position[1], 31);
nowMs = 760;
for (const id of platform.pendingIds()) platform.fire(id);
for (const handle of closing.handles) assert.equal((await handle.finished).status, 'completed');
assert.deepEqual(closePlan.pieces.map(piece => transforms.get(piece.pieceId).position), [
  [135, 2, -48],
  [135, 2, -48],
  [135, 2, -48],
]);

// Explicit cancel delegates to 096 and snaps to the current canonical presentation.
nowMs = 800;
const cancelling = submitStackMotionPlan({ plan: openPlan, motionController: controller, presentation });
const cancelledFrames = platform.pendingIds();
assert.equal(cancelStackMotion({
  motionController: controller,
  stackTargetId: 'stack:right:0',
  reason: 'selection-cancelled',
}), 3);
for (const handle of cancelling.handles) {
  const result = await handle.finished;
  assert.equal(result.reason, 'selection-cancelled');
  assert.equal(result.snappedCanonical, true);
}
assert.equal(snapLog.filter(entry => entry.reason === 'selection-cancelled').length, 3);
for (const id of cancelledFrames) platform.fireCancelled(id);
assert.deepEqual(openPlan.pieces.map(piece => transforms.get(piece.pieceId).position[1]), [2, 2, 2]);

// A newer revision can mean one formerly-home piece was committed to the board.
// Canonical snap must therefore consult the latest snapshot adapter, never force home.
nowMs = 900;
const staleRun = submitStackMotionPlan({ plan: openPlan, motionController: controller, presentation });
const staleFrames = platform.pendingIds();
const acceptedSmallBoardTransform = {
  position: [48, 2, 0],
  rotationDegrees: [-90, 0, 0],
  scale: [1, 1, 1],
};
canonicalTransforms.set('piece:marble:small:1', clone(acceptedSmallBoardTransform));
controller.setRevision(18);
for (const handle of staleRun.handles) {
  const result = await handle.finished;
  assert.equal(result.reason, 'revision-changed');
  assert.equal(result.snappedCanonical, true);
}
for (const id of staleFrames) platform.fireCancelled(id);
assert.deepEqual(transforms.get('piece:marble:large:1').position, [135, 2, -48]);
assert.deepEqual(transforms.get('piece:marble:medium:1').position, [135, 2, -48]);
assert.deepEqual(transforms.get('piece:marble:small:1').position, [48, 2, 0]);
assert.throws(() => submitStackMotionPlan({
  plan: openPlan,
  motionController: controller,
  presentation,
}), /stale_stack_motion_revision/);

// Reset this presentation fixture to a later canonical snapshot where the three
// remaining pieces are home again, then prove Reduced Motion uses the identical path.
for (const piece of openPlan.pieces) {
  transforms.set(piece.pieceId, clone(piece.homeTransform));
  canonicalTransforms.set(piece.pieceId, clone(piece.homeTransform));
}
const newerState = createCanonicalSessionState({
  preferredColor: 'marble',
  targetPlayers: 2,
  winsToMatch: 3,
  seats,
  board,
  activeSeatId: 'right',
  deadlineAtMs: 30_000,
  revision: 19,
  lifecycle: { phase: 'turn-loop', presentationGeneration: 5 },
});
const newerPlan = deriveStackMotionPlan({
  state: newerState,
  stackTargetId: 'stack:right:0',
  action: 'open',
  worldLayout,
  approvedContract,
});
controller.setReducedMotion(true);
const instant = submitStackMotionPlan({ plan: newerPlan, motionController: controller, presentation });
for (const handle of instant.handles) assert.equal((await handle.finished).status, 'reduced-motion');
assert.deepEqual(newerPlan.pieces.map(piece => transforms.get(piece.pieceId).position[1]), [2, 21, 40]);
assert.equal(registry.snapshot().animationHandles, 0);

// Source ownership: 032 defines paths/targets only; it never schedules its own motion.
const source = readFileSync(path.join(root, 'web/app/gameplay/stack-motion-sequences.js'), 'utf8');
assert.doesNotMatch(source, /requestAnimationFrame|cancelAnimationFrame|setTimeout|setInterval|Promise\.all|\.then\s*\(/);
assert.match(source, /controller\.animate\s*\(/);
assert.match(source, /controller\.syncSessionAuthority\s*\(/);
assert.match(source, /cancelScope\s*\(/);
assert.match(source, /snapPieceCanonical\s*\(/);

controller.release();
registry.dispose('stack-motion-sequence-test-complete');
console.log('THREEJS-032 stack motion sequence contract: PASS');
