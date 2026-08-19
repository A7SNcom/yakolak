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

function sameWitness(left, right) {
  return Boolean(left && right)
    && left.generation === right.generation
    && left.revision === right.revision
    && left.round === right.round
    && left.activeSeatId === right.activeSeatId;
}

function assertWitnessNotOlder(next, current) {
  if (isOlderWitness(next, current)) fail('stale_size_selection_snapshot');
  return next;
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
      size: selectedSize,
      selected: true,
      marker: SIZE_SELECTION_VISUAL_CONTRACT.selectedPieceMarker,
      colorIndependent: true,
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

  function select(state, input) {
    const candidateWitness = assertWitnessNotOlder(witnessFromState(state), authorityWitness);
    if (current.selectedSize !== null && authorityWitness && !sameWitness(candidateWitness, authorityWitness)) {
      fail('size_selection_requires_boundary_clear');
    }

    // Derive the complete replacement before mutating either controller field. A
    // failed/illegal selection therefore cannot pair old visuals with a new witness.
    const next = deriveSizeSelection(state, input);
    if (!sameWitness(next.witness, candidateWitness)) fail('size_selection_witness_drift');
    authorityWitness = candidateWitness;
    current = next;
    return current;
  }

  function clear(reason, state = null) {
    const normalizedReason = requireClearReason(reason);
    const candidateWitness = state === null
      ? authorityWitness
      : assertWitnessNotOlder(witnessFromState(state), authorityWitness);

    // One frozen replacement owns witness + selected size + target visibility, so no
    // observer can see a new authority witness with stale selection/targets.
    const next = emptySelection({ witness: candidateWitness, reason: normalizedReason });
    authorityWitness = candidateWitness;
    current = next;
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
