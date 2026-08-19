import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  ACCEPTED_PIECE_TRAVEL_POLICY,
  createAcceptedPieceTravelController,
  deriveAcceptedPieceTravelPlan,
} from '../web/app/gameplay/accepted-piece-travel.js';
import { createMotionController } from '../web/app/gameplay/motion-controller.js';
import { createResourceRegistry } from '../web/app/core/resource-registry.js';
import { configuredSeatOrder } from '../web/app/shared/seat-order.js';
import { emptyBoard } from '../web/app/shared/rules.js';
import { createCanonicalSessionState } from '../web/app/session/canonical-session-state.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PIECE_ID = 'piece:marble:medium:2';
const SOURCE_TRANSFORM = Object.freeze({
  position: Object.freeze([135, 2, 0]),
  rotationDegrees: Object.freeze([-90, 0, 0]),
  scale: Object.freeze([1, 1, 1]),
});
const FINAL_TRANSFORM = Object.freeze({
  position: Object.freeze([0, 2, 0]),
  rotationDegrees: Object.freeze([-90, 0, 0]),
  scale: Object.freeze([1, 1, 1]),
});

const seats = configuredSeatOrder('marble', 2).map((slot, index) => ({
  seatId: slot.seatId,
  type: index === 0 ? 'human' : 'computer',
  color: slot.color,
  ready: true,
}));

function boardWithAcceptedMove() {
  const board = emptyBoard();
  board['4'].medium = 'marble';
  return board;
}

function canonical({
  revision = 10,
  generation = 5,
  round = 1,
  accepted = false,
  activeSeatId = accepted ? 'back' : 'right',
  deadlineAtMs = 500_000 + revision,
} = {}) {
  return createCanonicalSessionState({
    preferredColor: 'marble',
    targetPlayers: 2,
    winsToMatch: 3,
    seats,
    board: accepted ? boardWithAcceptedMove() : emptyBoard(),
    activeSeatId,
    deadlineAtMs,
    round,
    revision,
    lastMove: accepted
      ? { seatId: 'right', color: 'marble', cell: 4, size: 'medium' }
      : null,
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createHarness({ initialState, reducedMotion = false } = {}) {
  let nowMs = 0;
  let live = true;
  let currentTransform = clone(SOURCE_TRANSFORM);
  const platform = fakePlatform();
  const registry = createResourceRegistry({ platform });
  const motion = createMotionController({
    resourceRegistry: registry,
    clock: () => nowMs,
    reducedMotion,
    generation: initialState.lifecycle.presentationGeneration,
    revision: initialState.revision,
  });
  const applyLog = [];
  const snapLog = [];
  const lockLog = [];
  const presentation = {
    readPieceIdentity(pieceId) {
      return pieceId === PIECE_ID
        ? { pieceId, colorId: 'marble', size: 'medium', copyIndex: 1 }
        : { pieceId, colorId: 'blue', size: 'medium', copyIndex: 0 };
    },
    readPieceTransform(pieceId) {
      assert.equal(pieceId, PIECE_ID);
      return clone(currentTransform);
    },
    readCanonicalBoardTransform(pieceId, cellId) {
      assert.equal(pieceId, PIECE_ID);
      return { cellId, transform: clone(FINAL_TRANSFORM) };
    },
    applyPieceTransform(pieceId, transform, meta) {
      assert.equal(pieceId, PIECE_ID);
      currentTransform = clone(transform);
      applyLog.push({ pieceId, transform: clone(transform), meta: clone(meta) });
    },
    snapPieceToTransform(pieceId, transform, meta) {
      assert.equal(pieceId, PIECE_ID);
      currentTransform = clone(transform);
      snapLog.push({ pieceId, transform: clone(transform), meta: clone(meta) });
    },
    isPieceLive(pieceId) {
      return pieceId === PIECE_ID && live;
    },
    setMovePresentationLock(lock, meta) {
      lockLog.push({ lock: lock ? clone(lock) : null, meta: clone(meta) });
    },
  };
  const controller = createAcceptedPieceTravelController({ motionController: motion, presentation });
  return {
    platform,
    registry,
    motion,
    controller,
    applyLog,
    snapLog,
    lockLog,
    getCurrentTransform: () => clone(currentTransform),
    setNow(value) { nowMs = value; },
    setLive(value) { live = Boolean(value); },
    dispose() {
      controller.release();
      motion.release();
      registry.dispose('accepted-piece-travel-contract-complete');
    },
  };
}

assert.equal(ACCEPTED_PIECE_TRAVEL_POLICY.durationMs, 520);
assert.equal(ACCEPTED_PIECE_TRAVEL_POLICY.arcHeight, 18);
assert.equal(ACCEPTED_PIECE_TRAVEL_POLICY.easing, 'easeInOutCubic');
assert.deepEqual(ACCEPTED_PIECE_TRAVEL_POLICY.conflictLocks, [
  'board-targeting',
  'piece-selection',
  'piece-drag',
  'move-confirmation',
  'free-camera',
]);
assert(ACCEPTED_PIECE_TRAVEL_POLICY.authorityUnaffected.includes('turn-deadline'));
assert(ACCEPTED_PIECE_TRAVEL_POLICY.authorityUnaffected.includes('turn-handoff'));
assert(ACCEPTED_PIECE_TRAVEL_POLICY.authorityUnaffected.includes('score'));
assert(ACCEPTED_PIECE_TRAVEL_POLICY.authorityUnaffected.includes('round-lifecycle'));

const accepted11 = canonical({ revision: 11, accepted: true });
const runtimePiece = {
  pieceId: PIECE_ID,
  colorId: 'marble',
  size: 'medium',
  fromTransform: SOURCE_TRANSFORM,
  canonicalDestination: { cellId: 4, transform: FINAL_TRANSFORM },
};
const plan = deriveAcceptedPieceTravelPlan({ state: accepted11, pieceId: PIECE_ID, runtimePiece });
assert.equal(plan.pieceId, PIECE_ID);
assert.equal(plan.cell, 4);
assert.equal(plan.color, 'marble');
assert.equal(plan.size, 'medium');
assert.equal(plan.generation, 5);
assert.equal(plan.acceptedRevision, 11);
assert.equal(plan.round, 1);
assert.equal(plan.durationMs, 520);
assert.equal(plan.arcHeight, 18);
assert.equal(plan.easing, 'easeInOutCubic');
assert.deepEqual(plan.fromTransform, SOURCE_TRANSFORM);
assert.deepEqual(plan.canonicalFinalTransform, FINAL_TRANSFORM);
assert.deepEqual(plan.conflictLocks, ACCEPTED_PIECE_TRAVEL_POLICY.conflictLocks);
assert.deepEqual(plan.authorityUnaffected, ACCEPTED_PIECE_TRAVEL_POLICY.authorityUnaffected);

assert.throws(() => deriveAcceptedPieceTravelPlan({
  state: accepted11,
  pieceId: PIECE_ID,
  runtimePiece: { ...runtimePiece, colorId: 'blue' },
}), /accepted_travel_piece_color_mismatch/);
assert.throws(() => deriveAcceptedPieceTravelPlan({
  state: accepted11,
  pieceId: PIECE_ID,
  runtimePiece: { ...runtimePiece, canonicalDestination: { cellId: 5, transform: FINAL_TRANSFORM } },
}), /accepted_travel_destination_cell_mismatch/);
assert.throws(() => deriveAcceptedPieceTravelPlan({
  state: canonical({ revision: 10 }),
  pieceId: PIECE_ID,
  runtimePiece,
}), /accepted_travel_requires_last_move/);

// Pending blocks only conflicting presentation/input and does not touch authority state.
const pre10 = canonical({ revision: 10 });
const normal = createHarness({ initialState: pre10 });
const preBefore = JSON.stringify(pre10);
const acceptedBefore = JSON.stringify(accepted11);
const pending = normal.controller.beginPending({ state: pre10, pendingId: 'mutation-accepted-001' });
assert.equal(pending.phase, 'pending');
assert.equal(pending.pieceId, null);
assert.deepEqual(pending.blocks, ACCEPTED_PIECE_TRAVEL_POLICY.conflictLocks);
assert(pending.authorityUnaffected.includes('turn-deadline'));
assert.equal(normal.motion.snapshot().active.length, 0);
assert.equal(JSON.stringify(pre10), preBefore);
assert.throws(() => normal.controller.beginPending({ state: pre10, pendingId: 'duplicate' }), /accepted_travel_pending_already_active/);

const travel = normal.controller.startAcceptedTravel({
  state: accepted11,
  pieceId: PIECE_ID,
  pendingId: 'mutation-accepted-001',
});
assert.equal(travel.lock.phase, 'travel');
assert.equal(travel.lock.pieceId, PIECE_ID);
assert.equal(travel.plan.acceptedRevision, 11);
assert.equal(normal.motion.snapshot().revision, 11);
assert.equal(normal.motion.snapshot().active.length, 1);
assert.equal(normal.motion.snapshot().active[0].scope, ACCEPTED_PIECE_TRAVEL_POLICY.scope);
assert.equal(normal.motion.snapshot().active[0].durationMs, 520);
assert.equal(normal.applyLog.length, 1, '096 applies the exact source transform synchronously');
assert.deepEqual(normal.applyLog[0].transform, SOURCE_TRANSFORM);
assert.equal(JSON.stringify(accepted11), acceptedBefore, 'travel presentation must not mutate canonical state');
assert.equal(accepted11.deadlineAtMs, 500_011, 'accepted travel cannot extend or rewrite the authoritative deadline');

normal.setNow(260);
for (const id of normal.platform.pendingIds()) normal.platform.fire(id);
const mid = normal.applyLog.at(-1).transform;
assert(Math.abs(mid.position[0] - 67.5) < 1e-9);
assert.equal(mid.position[1], 20, 'midpoint receives the approved +18 Y arc');
normal.setNow(520);
for (const id of normal.platform.pendingIds()) normal.platform.fire(id);
const completedResult = await travel.handle.finished;
await Promise.resolve();
assert.equal(completedResult.status, 'completed');
assert.deepEqual(normal.applyLog.at(-1).transform, FINAL_TRANSFORM, 'travel ends exactly at committed destination');
assert.deepEqual(normal.getCurrentTransform(), FINAL_TRANSFORM);
assert.equal(normal.snapLog.length, 0, 'normal completion needs no extra snap');
assert.equal(normal.controller.snapshot().activeTravel, null);
assert.equal(normal.lockLog.at(-1).lock, null);
assert.equal(JSON.stringify(accepted11), acceptedBefore);
normal.dispose();

// Reduced-motion still applies the exact accepted final transform because active travel is
// registered before THREEJS-096 performs its synchronous reduced-motion completion.
const reduced = createHarness({ initialState: pre10, reducedMotion: true });
reduced.controller.beginPending({ state: pre10, pendingId: 'mutation-reduced-001' });
const reducedTravel = reduced.controller.startAcceptedTravel({
  state: accepted11,
  pieceId: PIECE_ID,
  pendingId: 'mutation-reduced-001',
});
const reducedResult = await reducedTravel.handle.finished;
await Promise.resolve();
assert.equal(reducedResult.status, 'reduced-motion');
assert.deepEqual(reduced.getCurrentTransform(), FINAL_TRANSFORM);
assert.deepEqual(reduced.applyLog.at(-1).transform, FINAL_TRANSFORM);
assert.equal(reduced.snapLog.length, 0);
assert.equal(reduced.controller.snapshot().activeTravel, null);
reduced.dispose();

// Newer revision cancels through 096, snaps exactly once to the accepted canonical final
// transform, clears the travel lock, and late cancelled RAF callbacks cannot replay motion.
const revisionRace = createHarness({ initialState: pre10 });
revisionRace.controller.beginPending({ state: pre10, pendingId: 'mutation-race-001' });
const raceTravel = revisionRace.controller.startAcceptedTravel({
  state: accepted11,
  pieceId: PIECE_ID,
  pendingId: 'mutation-race-001',
});
const cancelledIds = revisionRace.platform.pendingIds();
const newer12 = canonical({ revision: 12, accepted: true, deadlineAtMs: 500_012 });
const observe12 = revisionRace.controller.observeSnapshot(newer12, { reason: 'newer-revision-hydration' });
assert.equal(observe12.status, 'advanced');
assert.deepEqual(observe12.witness, { generation: 5, revision: 12, round: 1 });
const cancelledResult = await raceTravel.handle.finished;
assert.equal(cancelledResult.status, 'cancelled');
assert.equal(revisionRace.snapLog.length, 1, '096 cancellation snaps accepted travel exactly once');
assert.deepEqual(revisionRace.snapLog[0].transform, FINAL_TRANSFORM);
assert.equal(revisionRace.snapLog[0].meta.acceptedRevision, 11);
assert.equal(revisionRace.snapLog[0].meta.cell, 4);
assert.deepEqual(revisionRace.getCurrentTransform(), FINAL_TRANSFORM);
assert.equal(revisionRace.controller.snapshot().activeTravel, null);
assert.equal(revisionRace.lockLog.at(-1).lock, null);
const applyCountAfterHydration = revisionRace.applyLog.length;
revisionRace.setNow(900);
for (const id of cancelledIds) revisionRace.platform.fireCancelled(id);
assert.equal(revisionRace.applyLog.length, applyCountAfterHydration, 'late cancelled frame cannot replay stale travel');
assert.equal(revisionRace.snapLog.length, 1, 'late completion cannot snap or mutate twice');
revisionRace.dispose();

// Round advance may preserve revision. 096 still owns cancellation: if authority sync alone
// does not cancel because generation/revision are unchanged, 042 asks 096 to cancel its scope.
const roundRace = createHarness({ initialState: pre10 });
roundRace.controller.beginPending({ state: pre10, pendingId: 'mutation-round-001' });
const roundTravel = roundRace.controller.startAcceptedTravel({
  state: accepted11,
  pieceId: PIECE_ID,
  pendingId: 'mutation-round-001',
});
const round2SameRevision = canonical({
  revision: 11,
  generation: 5,
  round: 2,
  accepted: false,
  activeSeatId: 'back',
  deadlineAtMs: 600_000,
});
roundRace.controller.observeSnapshot(round2SameRevision, { reason: 'round-reset-hydration' });
const roundCancelled = await roundTravel.handle.finished;
assert.equal(roundCancelled.status, 'cancelled');
assert.equal(roundCancelled.reason, 'newer-canonical-snapshot');
assert.equal(roundRace.snapLog.length, 1);
assert.deepEqual(roundRace.snapLog[0].transform, FINAL_TRANSFORM);
assert.equal(roundRace.controller.snapshot().activeTravel, null);
roundRace.dispose();

// A newer snapshot also clears a pending-only lock without creating travel or authority work.
const pendingHydration = createHarness({ initialState: pre10 });
pendingHydration.controller.beginPending({ state: pre10, pendingId: 'mutation-pending-hydration' });
pendingHydration.controller.observeSnapshot(accepted11, { reason: 'accepted-snapshot-before-travel-start' });
assert.equal(pendingHydration.controller.snapshot().pendingLock, null);
assert.equal(pendingHydration.motion.snapshot().active.length, 0);
assert.equal(pendingHydration.lockLog.at(-1).lock, null);
pendingHydration.dispose();

// Same witness cannot silently describe contradictory canonical states.
const conflict = createHarness({ initialState: pre10 });
conflict.controller.beginPending({ state: pre10, pendingId: 'mutation-conflict' });
const sameWitnessDifferentDeadline = canonical({ revision: 10, deadlineAtMs: 777_777 });
assert.throws(
  () => conflict.controller.observeSnapshot(sameWitnessDifferentDeadline),
  /accepted_travel_same_witness_snapshot_conflict/,
);
conflict.dispose();

// Source ownership: accepted travel may coordinate locks and submit numeric transforms to
// THREEJS-096, but it owns no RAF/timer, rule mutation, scoring, turn/deadline or lifecycle commit.
const source = readFileSync(path.join(root, 'web/app/gameplay/accepted-piece-travel.js'), 'utf8');
assert.match(source, /motion\.animate\s*\(/);
assert.match(source, /motion\.syncSessionAuthority\s*\(/);
assert.match(source, /motion\.cancelScope\s*\(/);
assert.match(source, /state\.lastMove/);
assert.match(source, /canonicalFinalTransform/);
assert.doesNotMatch(source, /requestAnimationFrame|cancelAnimationFrame|setTimeout|setInterval/);
assert.doesNotMatch(source, /placePiece|deriveRemainingInventory|validatePlacementForSeat|winningOutcome/);
assert.doesNotMatch(source, /commitAuthoritative|advanceAcceptedRevision|beginAuthoritativeLocalTurnDeadline/);
assert.doesNotMatch(source, /state\.(scores|deadlineAtMs|activeSeatId|inventory)\s*=/);

console.log('THREEJS-042 revision-safe accepted piece travel contract: PASS');
