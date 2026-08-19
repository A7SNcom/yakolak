import { RULES, SIZES, validatePlacementForSeat } from '../shared/rules.js';
import { assertCanonicalSessionState } from '../session/canonical-session-state.js';
import { resolveHomePieceTarget } from './home-stack-picking.js';

export const SIZE_SELECTION_CLEAR_REASONS = Object.freeze([
  'cancel',
  'timeout',
  'accepted-resync',
  'rejected-resync',
  'ownership-change',
  'reconnect',
  'round-reset',
]);

export const SIZE_SELECTION_VISUAL_CONTRACT = Object.freeze({
  selectedPieceMarker: 'outline',
  legalCellMarker: 'ring',
  colorIndependent: true,
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

function isOlderWitness(next, current) {
  if (!current) return false;
  return next.generation < current.generation || next.revision < current.revision;
}

function emptySelection({ witness = null, reason = 'initial' } = {}) {
  return deepFreeze({
    selectedSize: null,
    selectedPieceTargetId: null,
    stackTargetId: null,
    seatId: null,
    legalCells: Object.freeze([]),
    legalTargetIds: Object.freeze([]),
    selectedCue: null,
    legalCellCues: Object.freeze([]),
    witness,
    clearReason: reason,
  });
}

function requireSize(size) {
  if (typeof size !== 'string' || !SIZES.includes(size)) fail('invalid_selected_size');
  return size;
}

function legalCellsForSelection(state, seatId, size) {
  const legal = [];
  for (let cell = 0; cell < RULES.cellCount; cell += 1) {
    const result = validatePlacementForSeat(state, seatId, { cell, size });
    if (result.ok) legal.push(cell);
  }
  return Object.freeze(legal);
}

export function deriveSizeSelection(state, {
  stackTargetId,
  size,
} = {}) {
  assertCanonicalSessionState(state);
  const selectedSize = requireSize(size);
  const pieceTarget = resolveHomePieceTarget(state, { stackTargetId, size: selectedSize });
  const legalCells = legalCellsForSelection(state, pieceTarget.seatId, selectedSize);
  const legalTargetIds = Object.freeze(legalCells.map(cell => `board:${cell}`));
  return deepFreeze({
    selectedSize,
    selectedPieceTargetId: pieceTarget.id,
    stackTargetId: pieceTarget.stackTargetId,
    seatId: pieceTarget.seatId,
    legalCells,
    legalTargetIds,
    selectedCue: {
      targetId: pieceTarget.id,
      marker: SIZE_SELECTION_VISUAL_CONTRACT.selectedPieceMarker,
      colorIndependent: true,
      accessibleLabel: `${selectedSize} selected`,
    },
    legalCellCues: legalCells.map(cell => ({
      targetId: `board:${cell}`,
      cellId: cell,
      marker: SIZE_SELECTION_VISUAL_CONTRACT.legalCellMarker,
      visible: true,
      colorIndependent: true,
    })),
    witness: witnessFromState(state),
    clearReason: null,
  });
}

function requireClearReason(reason) {
  if (!SIZE_SELECTION_CLEAR_REASONS.includes(reason)) fail('invalid_size_selection_clear_reason');
  return reason;
}

export function createSizeSelectionController() {
  let authorityWitness = null;
  let current = emptySelection();

  function observeState(state) {
    const next = witnessFromState(state);
    if (isOlderWitness(next, authorityWitness)) fail('stale_size_selection_snapshot');
    authorityWitness = next;
    return next;
  }

  function select(state, input) {
    const witness = observeState(state);
    const next = deriveSizeSelection(state, input);
    if (
      next.witness.generation !== witness.generation
      || next.witness.revision !== witness.revision
      || next.witness.round !== witness.round
      || next.witness.activeSeatId !== witness.activeSeatId
    ) fail('size_selection_witness_drift');
    current = next;
    return current;
  }

  function clear(reason, state = null) {
    const normalizedReason = requireClearReason(reason);
    const witness = state === null ? authorityWitness : observeState(state);
    // One frozen replacement owns both selected size and target visibility, so no
    // observer can see a cleared size with stale legal targets (or the reverse).
    current = emptySelection({ witness, reason: normalizedReason });
    return current;
  }

  function snapshot() {
    return current;
  }

  return Object.freeze({
    select,
    clear,
    snapshot,
  });
}
