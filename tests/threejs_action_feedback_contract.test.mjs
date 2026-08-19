import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  ACTION_FEEDBACK_KINDS,
  ACTION_FEEDBACK_POLICY,
  createActionFeedbackController,
} from '../web/app/gameplay/action-feedback.js';
import { createMotionController } from '../web/app/gameplay/motion-controller.js';
import { createResourceRegistry } from '../web/app/core/resource-registry.js';
import { configuredSeatOrder } from '../web/app/shared/seat-order.js';
import { emptyBoard } from '../web/app/shared/rules.js';
import { createCanonicalSessionState } from '../web/app/session/canonical-session-state.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seats = configuredSeatOrder('marble', 2).map((slot, index) => ({
  seatId: slot.seatId,
  type: index === 0 ? 'human' : 'computer',
  color: slot.color,
  ready: true,
}));

function canonical({ revision = 10, generation = 3, round = 1, activeSeatId = 'right' } = {}) {
  return createCanonicalSessionState({
    preferredColor: 'marble',
    targetPlayers: 2,
    winsToMatch: 3,
    seats,
    board: emptyBoard(),
    activeSeatId,
    deadlineAtMs: 400_000 + revision,
    round,
    revision,
    lifecycle: { phase: 'turn-loop', presentationGeneration: generation },
  });
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

function createHarness({ initialState, snapshotImpl } = {}) {
  let nowMs = 0;
  const platform = fakePlatform();
  const registry = createResourceRegistry({ platform });
  const motion = createMotionController({
    resourceRegistry: registry,
    clock: () => nowMs,
    generation: initialState.lifecycle.presentationGeneration,
    revision: initialState.revision,
  });
  const feedbackLive = new Map();
  const showLog = [];
  const applyLog = [];
  const clearLog = [];
  const cancelLog = [];
  const rebuildLog = [];

  const presentation = {
    showFeedback(model) {
      feedbackLive.set(model.id, { model, visual: null });
      showLog.push(model);
    },
    applyFeedback(id, visual, meta) {
      const entry = feedbackLive.get(id);
      if (!entry) throw new Error('feedback-not-live');
      entry.visual = JSON.parse(JSON.stringify(visual));
      applyLog.push({ id, visual: entry.visual, meta: JSON.parse(JSON.stringify(meta)) });
    },
    clearFeedback(id, meta) {
      feedbackLive.delete(id);
      clearLog.push({ id, meta: JSON.parse(JSON.stringify(meta)) });
    },
    isFeedbackLive(id) {
      return feedbackLive.has(id);
    },
  };

  const authority = {
    snapshot: snapshotImpl || (() => Promise.resolve(initialState)),
  };
  const controller = createActionFeedbackController({
    motionController: motion,
    authority,
    presentation,
    cancelSpeculativePresentation(reason) {
      cancelLog.push(reason);
    },
    rebuildFromCanonical(state, meta) {
      rebuildLog.push({ state, meta });
    },
  });

  return {
    platform,
    registry,
    motion,
    feedbackLive,
    showLog,
    applyLog,
    clearLog,
    cancelLog,
    rebuildLog,
    controller,
    setNow(value) { nowMs = value; },
    dispose() {
      controller.release();
      motion.release();
      registry.dispose('action-feedback-contract-complete');
    },
  };
}

assert.deepEqual(ACTION_FEEDBACK_POLICY.from, { opacity: 1, scale: 1 });
assert.deepEqual(ACTION_FEEDBACK_POLICY.to, { opacity: 0, scale: 0.96 });
assert.equal(ACTION_FEEDBACK_POLICY.cue, 'brief-cross-badge');
assert.equal(ACTION_FEEDBACK_POLICY.durationMs, 480);
assert.equal(ACTION_FEEDBACK_POLICY.easing, 'easeOutCubic');

// Pre-submit invalid input never mutates authority or cancels speculative/pending state.
// Both semantic self-clear and optional physical return are owned by THREEJS-096 with
// the current generation/revision injected by 041 rather than caller-provided authority.
const state10 = canonical();
const beforeState10 = JSON.stringify(state10);
const invalid = createHarness({ initialState: state10 });
const returnApply = [];
const returnSnap = [];
const invalidResult = invalid.controller.preSubmitInvalid({
  state: state10,
  reasonCode: 'occupied_slot',
  targetId: 'board:4',
  returnMotion: {
    scope: 'piece:return:marble:medium:1',
    key: 'invalid-return',
    durationMs: 300,
    from: { x: 10 },
    to: { x: 0 },
    easing: 'easeInOutCubic',
    generation: 999,
    revision: 999,
    apply(value, meta) { returnApply.push({ value, meta }); },
    isTargetLive: () => true,
    snapToCanonical(meta) { returnSnap.push(meta); },
  },
});
assert.equal(invalidResult.status, 'invalid-pre-submit');
assert.equal(invalidResult.mutationSubmitted, false);
assert.equal(invalidResult.authoritativeStateChangedByFeedback, false);
assert.equal(invalidResult.feedback.kind, ACTION_FEEDBACK_KINDS.PRE_SUBMIT_INVALID);
assert.equal(invalidResult.feedback.reasonCode, 'occupied_slot');
assert.equal(invalidResult.feedback.messageKey, 'target-slot-occupied');
assert.equal(invalidResult.feedback.targetId, 'board:4');
assert.equal(invalidResult.feedback.role, 'status');
assert.equal(invalidResult.feedback.ariaLive, 'polite');
assert.equal(invalid.cancelLog.length, 0);
assert.equal(invalid.rebuildLog.length, 0);
assert.equal(JSON.stringify(state10), beforeState10);
assert.equal(invalid.feedbackLive.size, 1);

const invalidActive = invalid.motion.snapshot().active;
assert.equal(invalidActive.length, 2);
assert(invalidActive.every(entry => entry.generation === 3 && entry.revision === 10));
const semanticEntry = invalidActive.find(entry => entry.scope === ACTION_FEEDBACK_POLICY.semanticScope);
const returnEntry = invalidActive.find(entry => entry.scope === 'piece:return:marble:medium:1');
assert.equal(semanticEntry.durationMs, 480);
assert.equal(semanticEntry.easing, 'easeOutCubic');
assert.equal(returnEntry.durationMs, 300);
assert.equal(returnEntry.easing, 'easeInOutCubic');

invalid.setNow(150);
for (const id of invalid.platform.pendingIds()) invalid.platform.fire(id);
assert(returnApply.length > 0);
assert(invalid.applyLog.length > 0);
invalid.setNow(300);
for (const id of invalid.platform.pendingIds()) invalid.platform.fire(id);
assert.equal((await invalidResult.returnHandle.finished).status, 'completed');
assert.equal(returnSnap.length, 0, 'normal invalid return completes without an extra canonical snap');
invalid.setNow(480);
for (const id of invalid.platform.pendingIds()) invalid.platform.fire(id);
assert.equal((await invalidResult.feedbackHandle.finished).status, 'completed');
await Promise.resolve();
assert.equal(invalid.feedbackLive.size, 0, 'semantic feedback self-clears through 096 completion');
assert.equal(invalid.controller.snapshot().activeFeedbackId, null);
assert.deepEqual(invalid.controller.snapshot().activeReturnScopes, []);
invalid.dispose();

// Newer hydration cancels both feedback and invalid physical return, snaps the return to
// canonical via 096, rebuilds the newer snapshot, and stale cancelled RAF callbacks no-op.
const hydrateHarness = createHarness({ initialState: state10 });
const hydrateReturnApply = [];
const hydrateReturnSnap = [];
const hydrationInvalid = hydrateHarness.controller.preSubmitInvalid({
  state: state10,
  reasonCode: 'outside_target_radius',
  returnMotion: {
    scope: 'piece:return:hydrate-test',
    key: 'invalid-return',
    durationMs: 900,
    from: { x: 50 },
    to: { x: 0 },
    easing: 'easeInOutCubic',
    apply(value) { hydrateReturnApply.push(value); },
    isTargetLive: () => true,
    snapToCanonical(meta) { hydrateReturnSnap.push(meta); },
  },
});
const cancelledRafIds = hydrateHarness.platform.pendingIds();
const state11 = canonical({ revision: 11, generation: 4 });
const hydration = hydrateHarness.controller.observeHydration(state11, { reason: 'reconnect-hydration' });
assert.equal(hydration.status, 'rebuilt');
assert.deepEqual(hydrateHarness.cancelLog, ['reconnect-hydration']);
assert.equal(hydrateHarness.rebuildLog.length, 1);
assert.equal(hydrateHarness.rebuildLog[0].state, state11);
assert.equal(hydrateHarness.rebuildLog[0].meta.source, 'hydration');
assert.equal(hydrateHarness.feedbackLive.size, 0);
assert.equal(hydrateReturnSnap.length, 1, '096 cancellation owns invalid-return snap');
assert.equal(hydrateHarness.motion.snapshot().active.length, 0);
const applyCountAfterHydration = hydrateReturnApply.length + hydrateHarness.applyLog.length;
hydrateHarness.setNow(1000);
for (const id of cancelledRafIds) hydrateHarness.platform.fireCancelled(id);
assert.equal(hydrateReturnApply.length + hydrateHarness.applyLog.length, applyCountAfterHydration, 'late cancelled frame cannot replay old feedback/return');
assert.equal((await hydrationInvalid.returnHandle.finished).status, 'cancelled');
assert.equal((await hydrationInvalid.feedbackHandle.finished).status, 'cancelled');
assert.equal(hydrateHarness.controller.observeHydration(state11).status, 'unchanged');
assert.equal(hydrateHarness.rebuildLog.length, 1, 'same hydration does not rebuild twice');
hydrateHarness.dispose();

// Authority rejection cancels speculative presentation before awaiting snapshot, then
// rebuilds from the actual current authority snapshot and shows rejected semantic feedback.
const attempted20 = canonical({ revision: 20, generation: 7 });
const current21 = canonical({ revision: 21, generation: 7, activeSeatId: 'back' });
const rejectedCurrent = createHarness({
  initialState: attempted20,
  snapshotImpl: () => Promise.resolve(current21),
});
const rejectionPromise = rejectedCurrent.controller.authoritativeRejected({
  attemptedState: attempted20,
  rejection: { code: 'version_conflict' },
  targetId: 'board:3',
});
assert.deepEqual(rejectedCurrent.cancelLog, ['authority-rejected'], 'pending/speculative presentation is cancelled synchronously');
const rejected = await rejectionPromise;
assert.equal(rejected.status, 'authority-rejected');
assert.equal(rejected.rejectionCode, 'version_conflict');
assert.equal(rejected.canonicalSnapshot, current21);
assert.equal(rejected.mutationSubmitted, true);
assert.equal(rejected.authoritativeStateChangedByFeedback, false);
assert.equal(rejected.feedback.kind, ACTION_FEEDBACK_KINDS.AUTHORITY_REJECTED);
assert.equal(rejected.feedback.messageKey, 'move-not-accepted-board-refreshed');
assert.equal(rejected.feedback.revision, 21);
assert.equal(rejectedCurrent.rebuildLog.length, 1);
assert.equal(rejectedCurrent.rebuildLog[0].state, current21);
assert.equal(rejectedCurrent.rebuildLog[0].meta.source, 'current-snapshot');
assert.equal(rejectedCurrent.motion.snapshot().revision, 21);
rejectedCurrent.dispose();

// If current snapshot fetch fails, an explicit authoritative returned snapshot is enough;
// the attempted pre-submit state itself is never guessed as a rollback source.
const returned21 = canonical({ revision: 21, generation: 8, activeSeatId: 'back' });
const returnedHarness = createHarness({
  initialState: attempted20,
  snapshotImpl: () => Promise.reject(new Error('offline-current-read')),
});
const returnedResult = await returnedHarness.controller.authoritativeRejected({
  attemptedState: attempted20,
  rejection: { code: 'stale_revision' },
  returnedSnapshot: returned21,
});
assert.equal(returnedResult.canonicalSnapshot, returned21);
assert.equal(returnedHarness.rebuildLog.at(-1).meta.source, 'returned-snapshot');
returnedHarness.dispose();

const unavailableHarness = createHarness({
  initialState: attempted20,
  snapshotImpl: () => Promise.reject(new Error('snapshot-unavailable')),
});
await assert.rejects(
  unavailableHarness.controller.authoritativeRejected({
    attemptedState: attempted20,
    rejection: { code: 'version_conflict' },
  }),
  /authority_rejection_snapshot_unavailable/,
);
assert.equal(unavailableHarness.rebuildLog.length, 0, '041 never guesses rollback from attempted state');
unavailableHarness.dispose();

// Race: rejection waits for current snapshot while a newer hydration arrives. The newer
// hydrated snapshot must win over returned/current rejection snapshots, and later feedback
// completion must not overwrite a still newer hydration.
const attempted30 = canonical({ revision: 30, generation: 10 });
const returned31 = canonical({ revision: 31, generation: 10, activeSeatId: 'back' });
const currentDeferred = deferred();
const race = createHarness({
  initialState: attempted30,
  snapshotImpl: () => currentDeferred.promise,
});
const racePromise = race.controller.authoritativeRejected({
  attemptedState: attempted30,
  rejection: { code: 'version_conflict' },
  returnedSnapshot: returned31,
  targetId: 'board:7',
});
assert.deepEqual(race.cancelLog, ['authority-rejected']);
const hydrated32 = canonical({ revision: 32, generation: 11, activeSeatId: 'back' });
race.controller.observeHydration(hydrated32, { reason: 'newer-hydration-during-rejection' });
assert.equal(race.rebuildLog.at(-1).state, hydrated32);
currentDeferred.resolve(returned31);
const raceResult = await racePromise;
assert.equal(raceResult.canonicalSnapshot, hydrated32);
assert.equal(raceResult.feedback.revision, 32);
assert.equal(race.rebuildLog.at(-1).state, hydrated32);
assert.equal(race.rebuildLog.at(-1).meta.source, 'newer-hydration');

const oldFeedbackId = raceResult.feedback.id;
const oldFeedbackRafs = race.platform.pendingIds();
const hydrated33 = canonical({ revision: 33, generation: 12, activeSeatId: 'right' });
race.controller.observeHydration(hydrated33, { reason: 'hydration-after-rejection-feedback' });
assert.equal(race.feedbackLive.has(oldFeedbackId), false);
assert.equal(race.rebuildLog.at(-1).state, hydrated33);
const clearsAfterNewestHydration = race.clearLog.length;
const appliesAfterNewestHydration = race.applyLog.length;
race.setNow(2000);
for (const id of oldFeedbackRafs) race.platform.fireCancelled(id);
await raceResult.feedbackHandle.finished;
await Promise.resolve();
assert.equal(race.clearLog.length, clearsAfterNewestHydration, 'late feedback completion cannot clear newer presentation');
assert.equal(race.applyLog.length, appliesAfterNewestHydration, 'late feedback frame cannot apply after newer hydration');
assert.deepEqual(race.controller.snapshot().latestWitness, { generation: 12, revision: 33, round: 1 });
race.dispose();

// Source ownership: all visual/physical motion submits to THREEJS-096, rejection snapshots
// come from authority, and no rules/board mutation or private animation loop exists here.
const source = readFileSync(path.join(root, 'web/app/gameplay/action-feedback.js'), 'utf8');
assert.match(source, /motion\.animate\s*\(/);
assert.match(source, /motion\.syncSessionAuthority\s*\(/);
assert.match(source, /authorityAdapter\.snapshot\s*\(/);
assert.match(source, /cancelSpeculative/);
assert.match(source, /rebuildCanonical/);
assert.match(source, /newerHydration/);
assert.doesNotMatch(source, /requestAnimationFrame|cancelAnimationFrame|setTimeout|setInterval/);
assert.doesNotMatch(source, /placePiece|validatePlacementForSeat|deriveRemainingInventory|winningOutcome|state\.board|state\.inventory/);
assert.doesNotMatch(source, /authorityAdapter\.submit\s*\(/, 'feedback must never submit gameplay mutations');

console.log('THREEJS-041 invalid/rejected action feedback contract: PASS');
