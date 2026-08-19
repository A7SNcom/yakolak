import { SIZE_SELECTION_CLEAR_REASONS } from './size-selection.js';
import { assertCanonicalSessionState } from '../session/canonical-session-state.js';

export const PREVIEW_HIGHLIGHT_VISUAL_CONTRACT = Object.freeze({
  marker: 'outline',
  legalBaseMarker: 'ring',
  colorIndependent: true,
});

export const PREVIEW_HIGHLIGHT_SOURCES = Object.freeze({
  HOVER: 'hover',
  PRESS: 'press',
  FOCUS: 'focus',
  DRAG: 'drag',
});

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

function requireSelection(state, selection) {
  if (!selection || typeof selection !== 'object' || typeof selection.selectedSize !== 'string') fail('preview_requires_size_selection');
  const witness = witnessFromState(state);
  if (!sameWitness(selection.witness, witness)) fail('preview_selection_witness_mismatch');
  if (selection.seatId !== state.activeSeatId) fail('preview_selection_seat_mismatch');
  if (!Array.isArray(selection.legalTargetIds)) fail('preview_legal_targets_required');
  const seen = new Set();
  for (const targetId of selection.legalTargetIds) {
    if (typeof targetId !== 'string' || !/^board:[0-8]$/.test(targetId) || seen.has(targetId)) fail('invalid_preview_legal_target');
    seen.add(targetId);
  }
  return { witness, legalTargetIds: Object.freeze([...selection.legalTargetIds]) };
}

function requireStateBridge(setTargetState) {
  if (typeof setTargetState !== 'function') fail('preview_target_state_bridge_required');
  return setTargetState;
}

function requireChangeCallback(onChange) {
  if (typeof onChange !== 'function') fail('preview_change_callback_required');
  return onChange;
}

function requireClearReason(reason) {
  if (!SIZE_SELECTION_CLEAR_REASONS.includes(reason)) fail('invalid_preview_clear_reason');
  return reason;
}

function requireBoardTargetId(targetId) {
  if (typeof targetId !== 'string' || !/^board:[0-8]$/.test(targetId)) fail('invalid_preview_target_id');
  return targetId;
}

export function createPreviewHighlightController({
  setTargetState,
  onChange,
} = {}) {
  const patchTarget = requireStateBridge(setTargetState);
  const emitChange = requireChangeCallback(onChange);

  let latestWitness = null;
  let legalTargets = new Set();
  let selectedSize = null;
  let hoveredTargetId = null;
  let pressedTargetId = null;
  let focusedTargetId = null;
  let dragTargetId = null;
  let clearReason = 'initial';

  function isLegal(targetId) {
    return targetId !== null && legalTargets.has(targetId);
  }

  function resolvedPreview() {
    const ordered = [
      [dragTargetId, PREVIEW_HIGHLIGHT_SOURCES.DRAG],
      [pressedTargetId, PREVIEW_HIGHLIGHT_SOURCES.PRESS],
      [hoveredTargetId, PREVIEW_HIGHLIGHT_SOURCES.HOVER],
      [focusedTargetId, PREVIEW_HIGHLIGHT_SOURCES.FOCUS],
    ];
    const winner = ordered.find(([targetId]) => isLegal(targetId));
    if (!winner) return null;
    return deepFreeze({
      targetId: winner[0],
      source: winner[1],
      marker: PREVIEW_HIGHLIGHT_VISUAL_CONTRACT.marker,
      colorIndependent: true,
    });
  }

  function snapshot() {
    return deepFreeze({
      witness: latestWitness,
      selectedSize,
      legalTargetIds: [...legalTargets],
      hoveredTargetId,
      pressedTargetId,
      focusedTargetId,
      dragTargetId,
      preview: resolvedPreview(),
      visualContract: PREVIEW_HIGHLIGHT_VISUAL_CONTRACT,
      clearReason,
    });
  }

  function emit(kind) {
    const next = snapshot();
    emitChange(next, deepFreeze({ kind, sameRenderOpportunity: true }));
    return next;
  }

  function patchBoolean(oldTargetId, nextTargetId, key) {
    if (oldTargetId === nextTargetId) return;
    if (oldTargetId) patchTarget(oldTargetId, { [key]: false });
    if (nextTargetId) patchTarget(nextTargetId, { [key]: true });
  }

  function clearTransientTargetStates() {
    if (hoveredTargetId) patchTarget(hoveredTargetId, { hovered: false });
    if (pressedTargetId) patchTarget(pressedTargetId, { pressed: false });
    if (focusedTargetId) patchTarget(focusedTargetId, { focused: false });
    hoveredTargetId = null;
    pressedTargetId = null;
    focusedTargetId = null;
    dragTargetId = null;
  }

  function bindSelection(state, selection) {
    const { witness, legalTargetIds } = requireSelection(state, selection);
    if (isOlderWitness(witness, latestWitness)) fail('stale_preview_snapshot');
    if (latestWitness && !sameWitness(witness, latestWitness) && selectedSize !== null) fail('preview_requires_boundary_clear');

    clearTransientTargetStates();
    latestWitness = witness;
    legalTargets = new Set(legalTargetIds);
    selectedSize = selection.selectedSize;
    clearReason = null;
    return emit('selection-bound');
  }

  function assertCurrentState(state) {
    const witness = witnessFromState(state);
    if (isOlderWitness(witness, latestWitness)) fail('stale_preview_snapshot');
    if (!sameWitness(witness, latestWitness)) fail('preview_authority_changed');
    if (selectedSize === null) fail('preview_requires_size_selection');
    return witness;
  }

  function requireLegalTarget(targetId) {
    const normalized = requireBoardTargetId(targetId);
    if (!legalTargets.has(normalized)) fail('preview_target_not_legal');
    return normalized;
  }

  function hover(state, targetId) {
    assertCurrentState(state);
    const next = targetId === null ? null : requireLegalTarget(targetId);
    patchBoolean(hoveredTargetId, next, 'hovered');
    hoveredTargetId = next;
    return emit(next ? 'hover-entered' : 'hover-cleared');
  }

  function press(state, targetId) {
    assertCurrentState(state);
    const next = targetId === null ? null : requireLegalTarget(targetId);
    patchBoolean(pressedTargetId, next, 'pressed');
    pressedTargetId = next;
    return emit(next ? 'press-started' : 'press-cleared');
  }

  function focus(state, targetId) {
    assertCurrentState(state);
    const next = targetId === null ? null : requireLegalTarget(targetId);
    patchBoolean(focusedTargetId, next, 'focused');
    focusedTargetId = next;
    return emit(next ? 'focus-entered' : 'focus-cleared');
  }

  function dragCandidate(state, targetId) {
    assertCurrentState(state);
    dragTargetId = targetId === null ? null : requireLegalTarget(targetId);
    return emit(dragTargetId ? 'drag-preview-changed' : 'drag-preview-cleared');
  }

  function pointerCancel(state) {
    assertCurrentState(state);
    clearTransientTargetStates();
    return emit('pointer-cancelled');
  }

  function clearBoundary(reason, state = null) {
    const normalizedReason = requireClearReason(reason);
    let witness = latestWitness;
    if (state !== null) {
      const nextWitness = witnessFromState(state);
      if (isOlderWitness(nextWitness, latestWitness)) fail('stale_preview_snapshot');
      witness = nextWitness;
    }

    clearTransientTargetStates();
    latestWitness = witness;
    legalTargets = new Set();
    selectedSize = null;
    clearReason = normalizedReason;
    return emit('boundary-cleared');
  }

  return Object.freeze({
    bindSelection,
    hover,
    press,
    focus,
    dragCandidate,
    pointerCancel,
    clearBoundary,
    snapshot,
  });
}
