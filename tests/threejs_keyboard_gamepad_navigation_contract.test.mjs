import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  NAVIGATION_ACTIONS,
  NAVIGATION_FOCUS_VISUAL,
  NAVIGATION_PHASES,
  createKeyboardGamepadNavigationController,
  deriveLegalCellFocusTargets,
  deriveRemainingSizeFocusTargets,
  gamepadNavigationAction,
  keyboardNavigationAction,
  navigationDomProps,
} from '../web/app/gameplay/keyboard-gamepad-navigation.js';
import {
  GAMEPLAY_AUTHORITY_ADAPTERS,
  GAMEPLAY_PRESENTATION_SOURCES,
  createGameplayIntent,
  gameplayRuleSemantics,
} from '../web/app/gameplay/gameplay-intent.js';
import { createTapClickConfirmationController } from '../web/app/gameplay/tap-click-confirmation.js';
import { emptyBoard } from '../web/app/shared/rules.js';
import { configuredSeatOrder } from '../web/app/shared/seat-order.js';
import { createCanonicalSessionState } from '../web/app/session/canonical-session-state.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worldLayout = JSON.parse(readFileSync(path.join(root, 'YAKOLAK_PORTABLE_KIT/assets/layout/world-layout.json'), 'utf8'));
const approvedContract = JSON.parse(readFileSync(path.join(root, 'YAKOLAK_PORTABLE_KIT/assets/reference/approved-contract.json'), 'utf8'));
const seats = configuredSeatOrder('marble', 2).map((slot, index) => ({
  seatId: slot.seatId,
  type: index === 0 ? 'human' : 'computer',
  color: slot.color,
  ready: true,
}));

function canonical({ revision = 50, generation = 12, board = emptyBoard(), activeSeatId = 'right' } = {}) {
  return createCanonicalSessionState({
    preferredColor: 'marble',
    targetPlayers: 2,
    winsToMatch: 3,
    seats,
    board,
    activeSeatId,
    deadlineAtMs: 150_000,
    revision,
    lifecycle: { phase: 'turn-loop', presentationGeneration: generation },
  });
}

function deferred() {
  let resolve;
  const promise = new Promise(res => { resolve = res; });
  return { promise, resolve };
}

function intentFactory(input) {
  return createGameplayIntent({ ...input, adapter: GAMEPLAY_AUTHORITY_ADAPTERS.LOCAL });
}

function gamepad({ buttons = {}, axes = [0, 0] } = {}) {
  const list = Array.from({ length: 16 }, (_, index) => ({ pressed: false, value: 0 }));
  for (const [index, value] of Object.entries(buttons)) {
    list[Number(index)] = { pressed: Boolean(value), value: value ? 1 : 0 };
  }
  return { buttons: list, axes };
}

function harness(state, { reentrant = false } = {}) {
  const feedback = [];
  const submissions = [];
  const pending = deferred();
  let controller;
  let reentrantResult = null;
  const authority = {
    submit(intent) {
      submissions.push(intent);
      if (reentrant && submissions.length === 1) {
        reentrantResult = controller.confirm({
          state,
          source: GAMEPLAY_PRESENTATION_SOURCES.KEYBOARD_CONFIRM,
        });
      }
      return pending.promise;
    },
    snapshot() { return Promise.resolve(state); },
  };
  controller = createKeyboardGamepadNavigationController({
    authority,
    intentFactory,
    onFeedback(snapshot, meta) { feedback.push({ snapshot, meta }); },
  });
  return { controller, feedback, submissions, pending, getReentrantResult: () => reentrantResult };
}

assert.deepEqual(NAVIGATION_FOCUS_VISUAL, { marker: 'focus-ring', colorIndependent: true });
assert.equal(keyboardNavigationAction({ key: 'ArrowRight' }), NAVIGATION_ACTIONS.NEXT);
assert.equal(keyboardNavigationAction({ key: 'ArrowDown' }), NAVIGATION_ACTIONS.NEXT);
assert.equal(keyboardNavigationAction({ key: 'ArrowLeft' }), NAVIGATION_ACTIONS.PREVIOUS);
assert.equal(keyboardNavigationAction({ key: 'ArrowUp' }), NAVIGATION_ACTIONS.PREVIOUS);
assert.equal(keyboardNavigationAction({ key: 'Enter' }), NAVIGATION_ACTIONS.CONFIRM);
assert.equal(keyboardNavigationAction({ key: ' ' }), NAVIGATION_ACTIONS.CONFIRM);
assert.equal(keyboardNavigationAction({ key: 'Escape' }), NAVIGATION_ACTIONS.CANCEL);
assert.equal(keyboardNavigationAction({ key: 'q' }), null);

const neutralPad = gamepad();
assert.equal(gamepadNavigationAction(gamepad({ buttons: { 0: true } }), neutralPad), NAVIGATION_ACTIONS.CONFIRM);
assert.equal(gamepadNavigationAction(gamepad({ buttons: { 1: true } }), neutralPad), NAVIGATION_ACTIONS.CANCEL);
assert.equal(gamepadNavigationAction(gamepad({ buttons: { 15: true } }), neutralPad), NAVIGATION_ACTIONS.NEXT);
assert.equal(gamepadNavigationAction(gamepad({ buttons: { 13: true } }), neutralPad), NAVIGATION_ACTIONS.NEXT);
assert.equal(gamepadNavigationAction(gamepad({ buttons: { 14: true } }), neutralPad), NAVIGATION_ACTIONS.PREVIOUS);
assert.equal(gamepadNavigationAction(gamepad({ buttons: { 12: true } }), neutralPad), NAVIGATION_ACTIONS.PREVIOUS);
assert.equal(gamepadNavigationAction(gamepad({ axes: [0.7, 0] }), neutralPad), NAVIGATION_ACTIONS.NEXT);
assert.equal(gamepadNavigationAction(gamepad({ axes: [-0.7, 0] }), neutralPad), NAVIGATION_ACTIONS.PREVIOUS);
assert.equal(gamepadNavigationAction(gamepad({ buttons: { 0: true } }), gamepad({ buttons: { 0: true } })), null, 'held gamepad confirm must edge-trigger once');

// Exhaust small pieces for the active seat and occupy medium slot 4. Keyboard/gamepad
// focus must therefore offer only large -> medium, then medium legal cells 0,1,2,3,5,6,7,8.
const board = emptyBoard();
board['0'].small = 'marble';
board['1'].small = 'marble';
board['2'].small = 'marble';
board['4'].medium = 'blue';
const state50 = canonical({ board });

const sizeTargets = deriveRemainingSizeFocusTargets(state50);
assert.deepEqual(sizeTargets.map(target => target.size), ['large', 'medium']);
assert.deepEqual(sizeTargets.map(target => target.stackTargetId), ['stack:right:0', 'stack:right:0']);
assert(sizeTargets.every(target => target.focusCue.marker === 'focus-ring' && target.focusCue.colorIndependent));
assert(sizeTargets.every(target => Object.hasOwn(target.focusCue, 'color') === false));
assert.deepEqual(navigationDomProps(sizeTargets[0], true), {
  role: 'button',
  ariaLabel: 'Select large remaining piece',
  tabIndex: 0,
  dataFocusMarker: 'focus-ring',
  dataNavigationFocused: 'true',
});
assert.deepEqual(navigationDomProps(sizeTargets[1], false), {
  role: 'button',
  ariaLabel: 'Select medium remaining piece',
  tabIndex: -1,
  dataFocusMarker: 'focus-ring',
  dataNavigationFocused: 'false',
});

const keyboard = harness(state50, { reentrant: true });
let view = keyboard.controller.begin({ state: state50 });
assert.equal(view.phase, NAVIGATION_PHASES.SIZE);
assert.equal(view.focusTarget.size, 'large');
assert.equal(view.focusedDomProps.ariaLabel, 'Select large remaining piece');
assert.equal(keyboard.feedback.at(-1).meta.sameRenderOpportunity, true);

view = keyboard.controller.handleKeyboard({ state: state50, event: { key: 'ArrowRight' } }).snapshot;
assert.equal(view.focusTarget.size, 'medium');
view = keyboard.controller.handleKeyboard({ state: state50, event: { key: 'ArrowRight' } }).snapshot;
assert.equal(view.focusTarget.size, 'large', 'focus order wraps deterministically');
view = keyboard.controller.handleKeyboard({ state: state50, event: { key: 'ArrowLeft' } }).snapshot;
assert.equal(view.focusTarget.size, 'medium');

const selectedByKeyboard = keyboard.controller.handleKeyboard({ state: state50, event: { key: 'Enter' } }).result;
assert.equal(selectedByKeyboard.status, 'selected');
view = selectedByKeyboard.snapshot;
assert.equal(view.phase, NAVIGATION_PHASES.CELL);
assert.equal(view.selection.selectedSize, 'medium');
assert.deepEqual(view.focusTargets.map(target => target.cell), [0, 1, 2, 3, 5, 6, 7, 8]);
assert.equal(view.focusTarget.cell, 0);
assert.equal(view.focusTarget.dom.ariaLabel, 'Place medium piece in board cell 1');
assert(view.focusTargets.every(target => target.kind === 'legal-cell' && target.focusCue.colorIndependent));
assert.deepEqual(deriveLegalCellFocusTargets(view.selection).map(target => target.cell), view.focusTargets.map(target => target.cell));

// Explicit Cancel from cell focus clears selection and returns to deterministic size focus.
assert.equal(keyboard.controller.handleKeyboard({ state: state50, event: { key: 'Escape' } }).cancelled, true);
view = keyboard.controller.snapshot();
assert.equal(view.phase, NAVIGATION_PHASES.SIZE);
assert.equal(view.selection.selectedSize, null);
assert.equal(view.focusTarget.size, 'large');

// Re-select medium, move to legal cell 5, then confirm. Pending is locked before submit,
// so a re-entrant confirm from inside authority.submit returns the same pending state.
keyboard.controller.handleKeyboard({ state: state50, event: { key: 'ArrowRight' } });
keyboard.controller.handleKeyboard({ state: state50, event: { key: 'Enter' } });
for (let index = 0; index < 4; index += 1) keyboard.controller.handleKeyboard({ state: state50, event: { key: 'ArrowRight' } });
assert.equal(keyboard.controller.snapshot().focusTarget.cell, 5);
const keyboardCommit = keyboard.controller.handleKeyboard({ state: state50, event: { key: 'Enter' } }).result;
assert.equal(keyboardCommit.status, 'pending');
assert.equal(keyboard.submissions.length, 1);
assert.equal(keyboard.getReentrantResult().status, 'pending');
assert.equal(keyboard.submissions.length, 1, 're-entrant keyboard confirm must not duplicate authority mutation');
assert.equal(keyboardCommit.intent.presentation.source, GAMEPLAY_PRESENTATION_SOURCES.KEYBOARD_CONFIRM);
assert.deepEqual(keyboardCommit.intent.payload, { cell: 5, size: 'medium' });
assert.equal(keyboard.controller.cancel({ state: state50 }), false, 'pending navigation cannot be locally undone');
const repeatedKeyboard = keyboard.controller.confirm({ state: state50, source: GAMEPLAY_PRESENTATION_SOURCES.KEYBOARD_CONFIRM });
assert.equal(repeatedKeyboard.status, 'pending');
assert.equal(repeatedKeyboard.submission, keyboardCommit.submission);
assert.equal(keyboard.submissions.length, 1);
assert.throws(() => keyboard.controller.reconcileCanonical({ state: state50, clearReason: 'accepted-resync' }), /pending_navigation_requires_authority_resolution/);
keyboard.controller.reconcileCanonical({ state: state50, clearReason: 'rejected-resync' });
assert.equal(keyboard.controller.snapshot().phase, NAVIGATION_PHASES.SIZE);
assert.equal(keyboard.controller.snapshot().selection.selectedSize, null);

// Gamepad uses the same controller/rules path. D-pad down moves large -> medium, A confirms
// size, d-pad navigation reaches cell 5, and A emits only a gamepad presentation source.
const padHarness = harness(state50);
padHarness.controller.begin({ state: state50 });
let previous = neutralPad;
let current = gamepad({ buttons: { 13: true } });
assert.equal(padHarness.controller.handleGamepad({ state: state50, gamepad: current, previousGamepad: previous }).handled, true);
assert.equal(padHarness.controller.snapshot().focusTarget.size, 'medium');
previous = neutralPad;
current = gamepad({ buttons: { 0: true } });
const padSelect = padHarness.controller.handleGamepad({ state: state50, gamepad: current, previousGamepad: previous }).result;
assert.equal(padSelect.status, 'selected');
for (let index = 0; index < 4; index += 1) {
  padHarness.controller.handleGamepad({
    state: state50,
    gamepad: gamepad({ buttons: { 15: true } }),
    previousGamepad: neutralPad,
  });
}
assert.equal(padHarness.controller.snapshot().focusTarget.cell, 5);
const padCommit = padHarness.controller.handleGamepad({
  state: state50,
  gamepad: gamepad({ buttons: { 0: true } }),
  previousGamepad: neutralPad,
}).result;
assert.equal(padCommit.status, 'pending');
assert.equal(padCommit.intent.presentation.source, GAMEPLAY_PRESENTATION_SOURCES.GAMEPAD_CONFIRM);
assert.deepEqual(padCommit.intent.payload, { cell: 5, size: 'medium' });
assert.equal(padHarness.submissions.length, 1);

// Pointer/click, keyboard and gamepad differ only in presentation source. Rule semantics
// must be byte-equivalent for the same selected size/cell.
const pointerFeedback = [];
const pointerSubmissions = [];
const pointer = createTapClickConfirmationController({
  authority: {
    submit(intent) { pointerSubmissions.push(intent); return Promise.resolve({ accepted: true }); },
    snapshot() { return Promise.resolve(state50); },
  },
  intentFactory,
  onFeedback(snapshot, meta) { pointerFeedback.push({ snapshot, meta }); },
  worldLayout,
  approvedContract,
});
pointer.tapSize({ state: state50, stackTargetId: 'stack:right:0', size: 'medium', source: GAMEPLAY_PRESENTATION_SOURCES.CLICK });
const pointerMove = pointer.tapBoard({
  state: state50,
  ray: { origin: [48, 100, 0], direction: [0, -1, 0] },
  pointerType: 'mouse',
  source: GAMEPLAY_PRESENTATION_SOURCES.CLICK,
});
assert.equal(pointerMove.status, 'pending');
assert.deepEqual(gameplayRuleSemantics(pointerMove.intent), gameplayRuleSemantics(keyboardCommit.intent));
assert.deepEqual(gameplayRuleSemantics(pointerMove.intent), gameplayRuleSemantics(padCommit.intent));
assert.deepEqual(gameplayRuleSemantics(pointerMove.intent), {
  kind: 'move', seat: 'right', payload: { cell: 5, size: 'medium' },
});
assert.equal(pointerSubmissions.length, 1);

// Authority change cannot silently carry focus/selection across revisions. Reconcile
// rebuilds deterministic size focus from the new canonical state; old snapshots fail.
const newerState = canonical({ revision: 51, generation: 13, board, activeSeatId: 'back' });
const stale = harness(state50);
stale.controller.begin({ state: state50 });
stale.controller.handleKeyboard({ state: state50, event: { key: 'ArrowRight' } });
stale.controller.reconcileCanonical({ state: newerState, clearReason: 'ownership-change' });
assert.equal(stale.controller.snapshot().phase, NAVIGATION_PHASES.SIZE);
assert.equal(stale.controller.snapshot().focusTarget.size, 'large');
assert.throws(() => stale.controller.handleKeyboard({ state: state50, event: { key: 'ArrowRight' } }), /stale_navigation_snapshot/);

// Source boundary: legality is inherited only from 031/033; this module owns no board
// rules, no pointer ray path, no animation scheduler and no color-only focus styling.
const source = readFileSync(path.join(root, 'web/app/gameplay/keyboard-gamepad-navigation.js'), 'utf8');
assert.match(source, /deriveActiveHomeStackTargets/);
assert.match(source, /deriveSizeSelection/);
assert.match(source, /createSizeSelectionController/);
assert.doesNotMatch(source, /validatePlacementForSeat|placePiece|winningOutcome|\.board\s*\[/);
assert.doesNotMatch(source, /resolveBoardCellPick|Raycaster|requestAnimationFrame|setTimeout|setInterval/);
assert.doesNotMatch(source, /focusCue:\s*\{[\s\S]*?color:/);
assert.match(source, /marker:\s*'focus-ring'/);
assert.match(source, /ariaLabel/);
assert.match(source, /role:\s*'button'/);
assert.match(source, /KEYBOARD_CONFIRM/);
assert.match(source, /GAMEPAD_CONFIRM/);

console.log('THREEJS-037 keyboard/gamepad target navigation contract: PASS');
