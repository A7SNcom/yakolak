import {
  GAMEPLAY_INTENT_KINDS,
  GAMEPLAY_INTENT_ORIGINS,
  GAMEPLAY_PRESENTATION_SOURCES,
  assertGameplayIntent,
} from './gameplay-intent.js';
import {
  NESTED_HOME_SIZE_ORDER,
  deriveActiveHomeStackTargets,
} from './home-stack-picking.js';
import {
  SIZE_SELECTION_CLEAR_REASONS,
  createSizeSelectionController,
  deriveSizeSelection,
} from './size-selection.js';
import { assertCanonicalSessionState } from '../session/canonical-session-state.js';

export const NAVIGATION_PHASES = Object.freeze({
  IDLE: 'idle',
  SIZE: 'size',
  CELL: 'cell',
  PENDING: 'pending',
});

export const NAVIGATION_ACTIONS = Object.freeze({
  NEXT: 'next',
  PREVIOUS: 'previous',
  CONFIRM: 'confirm',
  CANCEL: 'cancel',
});

export const NAVIGATION_FOCUS_VISUAL = Object.freeze({
  marker: 'focus-ring',
  colorIndependent: true,
});

const CONFIRM_SOURCES = new Set([
  GAMEPLAY_PRESENTATION_SOURCES.KEYBOARD_CONFIRM,
  GAMEPLAY_PRESENTATION_SOURCES.GAMEPAD_CONFIRM,
]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function requireAuthority(authority) {
  if (!authority?.submit || !authority?.snapshot) fail('navigation_authority_adapter_required');
  return authority;
}

function requireIntentFactory(intentFactory) {
  if (typeof intentFactory !== 'function') fail('navigation_intent_factory_required');
  return intentFactory;
}

function requireFeedback(onFeedback) {
  if (typeof onFeedback !== 'function') fail('navigation_feedback_callback_required');
  return onFeedback;
}

function requireConfirmSource(source) {
  if (!CONFIRM_SOURCES.has(source)) fail('invalid_navigation_confirm_source');
  return source;
}

function requireClearReason(reason) {
  if (!SIZE_SELECTION_CLEAR_REASONS.includes(reason)) fail('invalid_navigation_clear_reason');
  return reason;
}

function witnessFromState(state) {
  assertCanonicalSessionState(state);
  return deepFreeze({
    generation: state.lifecycle.presentationGeneration,
    revision: state.revision,
    round: state.round,
    activeSeatId: state.activeSeatId,
  });
}

function sameWitness(left, right) {
  return Boolean(left && right)
    && left.generation === right.generation
    && left.revision === right.revision
    && left.round === right.round
    && left.activeSeatId === right.activeSeatId;
}

function isOlderWitness(next, current) {
  if (!current) return false;
  return next.generation < current.generation || next.revision < current.revision;
}

function accessibleSizeLabel(size) {
  return `Select ${size} remaining piece`;
}

function accessibleCellLabel(cell, size) {
  return `Place ${size} piece in board cell ${cell + 1}`;
}

function focusDescriptor({ id, kind, targetId, label, size = null, cell = null, stackTargetId = null, pieceTargetId = null } = {}) {
  return deepFreeze({
    id,
    kind,
    targetId,
    size,
    cell,
    stackTargetId,
    pieceTargetId,
    focusCue: {
      marker: NAVIGATION_FOCUS_VISUAL.marker,
      colorIndependent: true,
    },
    dom: {
      role: 'button',
      ariaLabel: label,
      tabIndex: -1,
    },
  });
}

export function navigationDomProps(target, focused = false) {
  if (!target?.dom || typeof target.dom.ariaLabel !== 'string' || !target.dom.ariaLabel) {
    fail('invalid_navigation_dom_target');
  }
  return deepFreeze({
    role: target.dom.role,
    ariaLabel: target.dom.ariaLabel,
    tabIndex: focused ? 0 : -1,
    dataFocusMarker: NAVIGATION_FOCUS_VISUAL.marker,
    dataNavigationFocused: focused ? 'true' : 'false',
  });
}

export function deriveRemainingSizeFocusTargets(state) {
  assertCanonicalSessionState(state);
  const derived = deriveActiveHomeStackTargets(state);
  const targets = [];

  // Match the physical nested stack order from THREEJS-031. One focus target exists per
  // remaining size, using the lowest available stack index for that size so copies do
  // not create duplicate keyboard/gamepad choices.
  for (const size of NESTED_HOME_SIZE_ORDER) {
    const piece = derived.remainingTargets
      .filter(candidate => candidate.size === size)
      .sort((left, right) => left.stackIndex - right.stackIndex)[0];
    if (!piece) continue;
    targets.push(focusDescriptor({
      id: `focus-size:${size}`,
      kind: 'remaining-size',
      targetId: piece.id,
      label: accessibleSizeLabel(size),
      size,
      stackTargetId: piece.stackTargetId,
      pieceTargetId: piece.id,
    }));
  }
  return Object.freeze(targets);
}

export function deriveLegalCellFocusTargets(selection) {
  if (!selection || typeof selection.selectedSize !== 'string' || !Array.isArray(selection.legalCells)) {
    fail('navigation_selection_required');
  }
  return Object.freeze(selection.legalCells.map(cell => focusDescriptor({
    id: `focus-cell:${cell}`,
    kind: 'legal-cell',
    targetId: `board:${cell}`,
    label: accessibleCellLabel(cell, selection.selectedSize),
    size: selection.selectedSize,
    cell,
  })));
}

function nextIndex(index, length, action) {
  if (!Number.isInteger(index) || index < 0 || index >= length || length < 1) fail('invalid_navigation_focus_index');
  if (action === NAVIGATION_ACTIONS.NEXT) return (index + 1) % length;
  if (action === NAVIGATION_ACTIONS.PREVIOUS) return (index - 1 + length) % length;
  fail('invalid_navigation_move_action');
}

export function keyboardNavigationAction(event) {
  const key = String(event?.key || '');
  if (key === 'ArrowRight' || key === 'ArrowDown') return NAVIGATION_ACTIONS.NEXT;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return NAVIGATION_ACTIONS.PREVIOUS;
  if (key === 'Enter' || key === ' ') return NAVIGATION_ACTIONS.CONFIRM;
  if (key === 'Escape') return NAVIGATION_ACTIONS.CANCEL;
  return null;
}

function pressed(button) {
  return Boolean(button && (button.pressed === true || Number(button.value) >= 0.5));
}

function axisDirection(gamepad, threshold) {
  const horizontal = Number(gamepad?.axes?.[0] || 0);
  const vertical = Number(gamepad?.axes?.[1] || 0);
  if (horizontal >= threshold || vertical >= threshold) return NAVIGATION_ACTIONS.NEXT;
  if (horizontal <= -threshold || vertical <= -threshold) return NAVIGATION_ACTIONS.PREVIOUS;
  return null;
}

function gamepadActionLevel(gamepad, threshold) {
  if (pressed(gamepad?.buttons?.[1])) return NAVIGATION_ACTIONS.CANCEL;
  if (pressed(gamepad?.buttons?.[0])) return NAVIGATION_ACTIONS.CONFIRM;
  if (pressed(gamepad?.buttons?.[15]) || pressed(gamepad?.buttons?.[13])) return NAVIGATION_ACTIONS.NEXT;
  if (pressed(gamepad?.buttons?.[14]) || pressed(gamepad?.buttons?.[12])) return NAVIGATION_ACTIONS.PREVIOUS;
  return axisDirection(gamepad, threshold);
}

export function gamepadNavigationAction(gamepad, previousGamepad = null, { axisThreshold = 0.6 } = {}) {
  const threshold = Number(axisThreshold);
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) fail('invalid_gamepad_axis_threshold');
  const current = gamepadActionLevel(gamepad, threshold);
  if (current === null) return null;
  const previous = gamepadActionLevel(previousGamepad, threshold);
  return current === previous ? null : current;
}

function assertIntentMatchesNavigation(intent, selection, cell, source) {
  assertGameplayIntent(intent);
  if (intent.kind !== GAMEPLAY_INTENT_KINDS.MOVE) fail('navigation_intent_must_be_move');
  if (intent.origin !== GAMEPLAY_INTENT_ORIGINS.HUMAN) fail('navigation_intent_must_be_human');
  if (intent.presentation.source !== source) fail('navigation_intent_source_mismatch');
  if (intent.authority.seat !== selection.seatId) fail('navigation_intent_seat_mismatch');
  if (intent.authority.revision !== selection.witness.revision) fail('navigation_intent_revision_mismatch');
  if (intent.payload.cell !== cell || intent.payload.size !== selection.selectedSize) fail('navigation_intent_payload_mismatch');
  return intent;
}

export function createKeyboardGamepadNavigationController({
  authority,
  intentFactory,
  onFeedback,
} = {}) {
  const authorityAdapter = requireAuthority(authority);
  const makeIntent = requireIntentFactory(intentFactory);
  const feedback = requireFeedback(onFeedback);
  const selectionController = createSizeSelectionController();

  let phase = NAVIGATION_PHASES.IDLE;
  let targets = Object.freeze([]);
  let focusIndex = -1;
  let latestWitness = null;
  let pending = null;
  let inputSequence = 0;

  function currentTarget() {
    return focusIndex >= 0 && focusIndex < targets.length ? targets[focusIndex] : null;
  }

  function snapshot() {
    const focused = currentTarget();
    return deepFreeze({
      phase,
      focusIndex,
      focusTarget: focused,
      focusTargets: targets,
      focusedDomProps: focused ? navigationDomProps(focused, true) : null,
      selection: selectionController.snapshot(),
      pendingIntent: pending?.intent || null,
      pendingSource: pending?.source || null,
      inputSequence,
    });
  }

  function emit(kind, extra = {}) {
    const visible = snapshot();
    feedback(visible, deepFreeze({ kind, sameRenderOpportunity: true, ...extra }));
    return visible;
  }

  function candidateWitness(state) {
    const witness = witnessFromState(state);
    if (isOlderWitness(witness, latestWitness)) fail('stale_navigation_snapshot');
    return witness;
  }

  function sizeTargetsForState(state) {
    if (state.lifecycle.phase !== 'turn-loop' || state.lifecycle.interrupt !== null || state.activeSeatId === null) {
      return Object.freeze([]);
    }
    return deriveRemainingSizeFocusTargets(state);
  }

  function begin({ state } = {}) {
    assertCanonicalSessionState(state);
    if (phase === NAVIGATION_PHASES.PENDING) return snapshot();
    const witness = candidateWitness(state);
    const nextTargets = sizeTargetsForState(state);
    selectionController.clear('cancel', state);
    latestWitness = witness;
    pending = null;
    targets = nextTargets;
    focusIndex = targets.length ? 0 : -1;
    phase = targets.length ? NAVIGATION_PHASES.SIZE : NAVIGATION_PHASES.IDLE;
    inputSequence += 1;
    return emit('navigation-began');
  }

  function assertCurrentAuthority(state) {
    assertCanonicalSessionState(state);
    const witness = candidateWitness(state);
    if (latestWitness && !sameWitness(witness, latestWitness)) fail('navigation_requires_authority_reconcile');
    return witness;
  }

  function move({ state, action } = {}) {
    assertCurrentAuthority(state);
    if (phase === NAVIGATION_PHASES.PENDING) return snapshot();
    if (phase !== NAVIGATION_PHASES.SIZE && phase !== NAVIGATION_PHASES.CELL) fail('navigation_not_active');
    if (action !== NAVIGATION_ACTIONS.NEXT && action !== NAVIGATION_ACTIONS.PREVIOUS) fail('invalid_navigation_move_action');
    focusIndex = nextIndex(focusIndex, targets.length, action);
    inputSequence += 1;
    return emit('focus-moved', { action });
  }

  function confirm({ state, source } = {}) {
    const confirmSource = requireConfirmSource(source);
    const witness = assertCurrentAuthority(state);
    inputSequence += 1;

    if (phase === NAVIGATION_PHASES.PENDING) {
      return deepFreeze({ status: 'pending', submission: pending.submission, snapshot: emit('pending-duplicate-confirm', { source: confirmSource }) });
    }
    if (phase !== NAVIGATION_PHASES.SIZE && phase !== NAVIGATION_PHASES.CELL) fail('navigation_not_active');

    const target = currentTarget();
    if (!target) fail('navigation_focus_target_missing');

    if (phase === NAVIGATION_PHASES.SIZE) {
      const preview = deriveSizeSelection(state, {
        stackTargetId: target.stackTargetId,
        size: target.size,
      });
      const cellTargets = deriveLegalCellFocusTargets(preview);
      if (cellTargets.length === 0) fail('navigation_selected_size_has_no_legal_cells');

      const selection = selectionController.select(state, {
        stackTargetId: target.stackTargetId,
        size: target.size,
      });
      if (!sameWitness(selection.witness, witness)) fail('navigation_selection_witness_drift');
      targets = cellTargets;
      focusIndex = 0;
      phase = NAVIGATION_PHASES.CELL;
      return deepFreeze({ status: 'selected', snapshot: emit('size-confirmed', { source: confirmSource, selectedSize: selection.selectedSize }) });
    }

    const selection = selectionController.snapshot();
    if (!sameWitness(selection.witness, witness)) fail('navigation_selection_witness_mismatch');
    if (target.kind !== 'legal-cell' || !selection.legalCells.includes(target.cell)) fail('navigation_focus_not_legal_cell');

    const intent = makeIntent(deepFreeze({
      kind: GAMEPLAY_INTENT_KINDS.MOVE,
      origin: GAMEPLAY_INTENT_ORIGINS.HUMAN,
      seat: selection.seatId,
      revision: selection.witness.revision,
      payload: { cell: target.cell, size: selection.selectedSize },
      source: confirmSource,
    }));
    assertIntentMatchesNavigation(intent, selection, target.cell, confirmSource);

    // Lock pending before entering authority.submit, mirroring the pointer confirmation
    // exactly-once boundary so keyboard/gamepad cannot race a second mutation.
    phase = NAVIGATION_PHASES.PENDING;
    pending = { intent, source: confirmSource, submission: null };
    latestWitness = witness;
    const pendingVisible = emit('authoritative-commit-pending', {
      source: confirmSource,
      cell: target.cell,
      selectedSize: selection.selectedSize,
    });

    let submission;
    try {
      submission = authorityAdapter.submit(intent);
    } catch (error) {
      phase = NAVIGATION_PHASES.CELL;
      pending = null;
      emit('submission-start-failed', { source: confirmSource });
      throw error;
    }
    if (!submission || typeof submission.then !== 'function') {
      phase = NAVIGATION_PHASES.CELL;
      pending = null;
      emit('submission-start-failed', { source: confirmSource });
      fail('navigation_authority_submit_must_return_promise');
    }

    pending = { intent, source: confirmSource, submission };
    return deepFreeze({ status: 'pending', intent, submission, snapshot: pendingVisible });
  }

  function cancel({ state } = {}) {
    assertCurrentAuthority(state);
    if (phase === NAVIGATION_PHASES.PENDING) return false;
    inputSequence += 1;

    if (phase === NAVIGATION_PHASES.CELL) {
      selectionController.clear('cancel', state);
      targets = sizeTargetsForState(state);
      focusIndex = targets.length ? 0 : -1;
      phase = targets.length ? NAVIGATION_PHASES.SIZE : NAVIGATION_PHASES.IDLE;
      emit('selection-cancelled');
      return true;
    }

    selectionController.clear('cancel', state);
    targets = Object.freeze([]);
    focusIndex = -1;
    phase = NAVIGATION_PHASES.IDLE;
    emit('navigation-cancelled');
    return true;
  }

  function reconcileCanonical({ state, clearReason } = {}) {
    assertCanonicalSessionState(state);
    const reason = requireClearReason(clearReason);
    const witness = candidateWitness(state);

    if (
      phase === NAVIGATION_PHASES.PENDING
      && pending
      && latestWitness
      && sameWitness(witness, latestWitness)
      && reason !== 'rejected-resync'
      && reason !== 'reconnect'
    ) {
      fail('pending_navigation_requires_authority_resolution');
    }

    selectionController.clear(reason, state);
    latestWitness = witness;
    pending = null;
    targets = sizeTargetsForState(state);
    focusIndex = targets.length ? 0 : -1;
    phase = targets.length ? NAVIGATION_PHASES.SIZE : NAVIGATION_PHASES.IDLE;
    inputSequence += 1;
    emit('canonical-reconciled', { clearReason: reason });
    return true;
  }

  function handleKeyboard({ state, event } = {}) {
    const action = keyboardNavigationAction(event);
    if (action === null) return deepFreeze({ handled: false, snapshot: snapshot() });
    if (action === NAVIGATION_ACTIONS.NEXT || action === NAVIGATION_ACTIONS.PREVIOUS) {
      return deepFreeze({ handled: true, action, snapshot: move({ state, action }) });
    }
    if (action === NAVIGATION_ACTIONS.CONFIRM) {
      return deepFreeze({
        handled: true,
        action,
        result: confirm({ state, source: GAMEPLAY_PRESENTATION_SOURCES.KEYBOARD_CONFIRM }),
      });
    }
    return deepFreeze({ handled: true, action, cancelled: cancel({ state }), snapshot: snapshot() });
  }

  function handleGamepad({ state, gamepad, previousGamepad = null, axisThreshold } = {}) {
    const action = gamepadNavigationAction(gamepad, previousGamepad, { axisThreshold });
    if (action === null) return deepFreeze({ handled: false, snapshot: snapshot() });
    if (action === NAVIGATION_ACTIONS.NEXT || action === NAVIGATION_ACTIONS.PREVIOUS) {
      return deepFreeze({ handled: true, action, snapshot: move({ state, action }) });
    }
    if (action === NAVIGATION_ACTIONS.CONFIRM) {
      return deepFreeze({
        handled: true,
        action,
        result: confirm({ state, source: GAMEPLAY_PRESENTATION_SOURCES.GAMEPAD_CONFIRM }),
      });
    }
    return deepFreeze({ handled: true, action, cancelled: cancel({ state }), snapshot: snapshot() });
  }

  return Object.freeze({
    begin,
    move,
    confirm,
    cancel,
    reconcileCanonical,
    handleKeyboard,
    handleGamepad,
    snapshot,
  });
}
