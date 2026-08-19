import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  TAP_CONFIRMATION_PHASES,
  UX_SELECT_46_PROCESSING_P95_CEILING_MS,
  createTapClickConfirmationController,
} from '../web/app/gameplay/tap-click-confirmation.js';
import {
  GAMEPLAY_AUTHORITY_ADAPTERS,
  GAMEPLAY_PRESENTATION_SOURCES,
  createGameplayIntent,
  gameplayRuleSemantics,
} from '../web/app/gameplay/gameplay-intent.js';
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

function state({ revision = 40, generation = 8, board = emptyBoard(), activeSeatId = 'right' } = {}) {
  return createCanonicalSessionState({
    preferredColor: 'marble', targetPlayers: 2, winsToMatch: 3, seats, board,
    activeSeatId, deadlineAtMs: 100_000, revision,
    lifecycle: { phase: 'turn-loop', presentationGeneration: generation },
  });
}
function rayAt(x, z) { return { origin: [x, 100, z], direction: [0, -1, 0] }; }
function deferred() {
  let resolve;
  const promise = new Promise(res => { resolve = res; });
  return { promise, resolve };
}
function intentFactory(input) {
  return createGameplayIntent({ ...input, adapter: GAMEPLAY_AUTHORITY_ADAPTERS.LOCAL });
}
function harness({ canonicalState, reentrant = false } = {}) {
  const feedback = [];
  const submissions = [];
  const pending = deferred();
  let controller;
  let reentrantResult = null;
  const authority = {
    submit(intent) {
      submissions.push(intent);
      if (reentrant && submissions.length === 1) {
        reentrantResult = controller.tapBoard({
          state: canonicalState,
          ray: rayAt(48, 0),
          pointerType: 'mouse',
          source: GAMEPLAY_PRESENTATION_SOURCES.CLICK,
        });
      }
      return pending.promise;
    },
    snapshot() { return Promise.resolve(canonicalState); },
  };
  controller = createTapClickConfirmationController({
    authority,
    intentFactory,
    onFeedback(snapshot, meta) { feedback.push({ snapshot, meta }); },
    worldLayout,
    approvedContract,
  });
  return { controller, feedback, submissions, pending, getReentrantResult: () => reentrantResult };
}

assert.equal(UX_SELECT_46_PROCESSING_P95_CEILING_MS, 50);

const board = emptyBoard();
board['4'].medium = 'blue';
const s40 = state({ board });
const h = harness({ canonicalState: s40, reentrant: true });

// Size selection produces visible semantic feedback synchronously in the same call.
let feedbackBeforeReturn = false;
const previousFeedbackCount = h.feedback.length;
const selected = h.controller.tapSize({
  state: s40,
  stackTargetId: 'stack:right:0',
  size: 'medium',
  source: GAMEPLAY_PRESENTATION_SOURCES.TAP,
});
feedbackBeforeReturn = h.feedback.length === previousFeedbackCount + 1;
assert.equal(feedbackBeforeReturn, true);
assert.equal(selected.phase, TAP_CONFIRMATION_PHASES.SELECTED);
assert.equal(selected.selection.selectedSize, 'medium');
assert.equal(h.feedback.at(-1).meta.kind, 'size-selected');
assert.equal(h.feedback.at(-1).meta.sameRenderOpportunity, true);
assert.deepEqual(selected.selection.legalCells, [0, 1, 2, 3, 5, 6, 7, 8]);

// Invalid pre-submit tap shows immediate diagnostic, does not submit, and keeps the
// selected size/legal targets so the player can correct the next tap.
const invalid = h.controller.tapBoard({
  state: s40,
  ray: rayAt(0, 0),
  pointerType: 'touch',
  source: GAMEPLAY_PRESENTATION_SOURCES.TAP,
});
assert.equal(invalid.status, 'invalid');
assert.equal(invalid.pick.candidateCell, 4);
assert.equal(invalid.pick.ruleCode, 'occupied_slot');
assert.equal(h.submissions.length, 0);
assert.equal(invalid.snapshot.phase, TAP_CONFIRMATION_PHASES.SELECTED);
assert.equal(invalid.snapshot.selection.selectedSize, 'medium');
assert.equal(h.feedback.at(-1).meta.kind, 'invalid-cell-tap');

// Valid click locks pending before entering authority.submit. The adapter deliberately
// re-enters tapBoard synchronously; the re-entrant click observes pending and cannot
// cause a second submission.
const committed = h.controller.tapBoard({
  state: s40,
  ray: rayAt(48, 0),
  pointerType: 'mouse',
  source: GAMEPLAY_PRESENTATION_SOURCES.CLICK,
});
assert.equal(committed.status, 'pending');
assert.equal(h.submissions.length, 1);
assert.equal(h.getReentrantResult().status, 'pending');
assert.equal(h.submissions.length, 1);
assert.equal(committed.snapshot.phase, TAP_CONFIRMATION_PHASES.PENDING);
assert.equal(committed.intent.presentation.source, GAMEPLAY_PRESENTATION_SOURCES.CLICK);
assert.deepEqual(committed.intent.payload, { cell: 5, size: 'medium' });
assert.equal(h.feedback.some(entry => entry.meta.kind === 'authoritative-commit-pending'), true);
assert.equal(h.controller.cancel({ state: s40 }), false, 'pending tap cannot be locally undone');

// Repeated rapid tap and size tap during pending never duplicate or alter the intent.
const rapidCell = h.controller.tapBoard({
  state: s40, ray: rayAt(-48, 48), pointerType: 'touch', source: GAMEPLAY_PRESENTATION_SOURCES.TAP,
});
assert.equal(rapidCell.status, 'pending');
const rapidSize = h.controller.tapSize({
  state: s40, stackTargetId: 'stack:right:0', size: 'large', source: GAMEPLAY_PRESENTATION_SOURCES.TAP,
});
assert.equal(rapidSize.phase, TAP_CONFIRMATION_PHASES.PENDING);
assert.equal(rapidSize.pendingIntent.payload.size, 'medium');
assert.equal(h.submissions.length, 1);

// Same-witness fake acceptance cannot clear pending; a trusted rejection can.
assert.throws(() => h.controller.reconcileCanonical({
  state: s40, clearReason: 'accepted-resync',
}), /pending_tap_requires_authority_resolution/);
assert.equal(h.controller.snapshot().phase, TAP_CONFIRMATION_PHASES.PENDING);
h.controller.reconcileCanonical({ state: s40, clearReason: 'rejected-resync' });
assert.equal(h.controller.snapshot().phase, TAP_CONFIRMATION_PHASES.IDLE);
assert.equal(h.controller.snapshot().selection.selectedSize, null);

// Tap and click differ only in presentation source. Their rule semantics are identical.
const tapHarness = harness({ canonicalState: s40 });
tapHarness.controller.tapSize({ state: s40, stackTargetId: 'stack:right:0', size: 'large', source: 'tap' });
const tapMove = tapHarness.controller.tapBoard({
  state: s40, ray: rayAt(-48, -48), pointerType: 'touch', source: 'tap',
});
const clickHarness = harness({ canonicalState: s40 });
clickHarness.controller.tapSize({ state: s40, stackTargetId: 'stack:right:0', size: 'large', source: 'click' });
const clickMove = clickHarness.controller.tapBoard({
  state: s40, ray: rayAt(-48, -48), pointerType: 'mouse', source: 'click',
});
assert.deepEqual(gameplayRuleSemantics(tapMove.intent), gameplayRuleSemantics(clickMove.intent));
assert.deepEqual(gameplayRuleSemantics(tapMove.intent), {
  kind: 'move', seat: 'right', payload: { cell: 0, size: 'large' },
});
assert.equal(tapMove.intent.presentation.source, 'tap');
assert.equal(clickMove.intent.presentation.source, 'click');

// Newer authority requires explicit reconciliation; stale state cannot resurrect tap.
const s41 = state({ revision: 41, generation: 9, board, activeSeatId: 'back' });
const staleHarness = harness({ canonicalState: s40 });
staleHarness.controller.tapSize({ state: s40, stackTargetId: 'stack:right:0', size: 'large' });
staleHarness.controller.reconcileCanonical({ state: s41, clearReason: 'ownership-change' });
assert.throws(() => staleHarness.controller.tapSize({
  state: s40, stackTargetId: 'stack:right:0', size: 'large',
}), /stale_tap_snapshot/);

// No camera/light/move animation or scheduler can gate feedback/confirmation here.
const source = readFileSync(path.join(root, 'web/app/gameplay/tap-click-confirmation.js'), 'utf8');
assert.doesNotMatch(source, /requestAnimationFrame|setTimeout|setInterval|motionController|camera|lighting/i);
assert.doesNotMatch(source, /await\s|\.then\s*\(/);
assert.match(source, /validate|resolveBoardCellPick/);
assert.match(source, /phase\s*=\s*TAP_CONFIRMATION_PHASES\.PENDING[\s\S]*authorityAdapter\.submit/);

console.log('THREEJS-036 tap/click confirmation contract: PASS');
