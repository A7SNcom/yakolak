import { RULES, validatePlacementForSeat } from '../shared/rules.js';
import { assertCanonicalSessionState } from '../session/canonical-session-state.js';
import { deriveGameplayInteractionTargets } from './interaction-targets.js';

const RAY_EPSILON = 1e-9;

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

function finiteTriple(value, code) {
  if (!Array.isArray(value) || value.length !== 3) fail(code);
  const triple = value.map(Number);
  if (triple.some(number => !Number.isFinite(number))) fail(code);
  return Object.freeze(triple);
}

function requireRadius(value, code) {
  const radius = Number(value);
  if (!Number.isFinite(radius) || radius <= 0) fail(code);
  return radius;
}

function radiusContract(approvedContract, interactionLayout) {
  const rules = approvedContract?.rules;
  if (!rules) fail('board_pick_rules_contract_required');
  const normal = requireRadius(rules.normalDropRadius, 'invalid_normal_drop_radius');
  const touch = requireRadius(rules.touchDropRadius, 'invalid_touch_drop_radius');
  if (touch !== interactionLayout.boardZoneTouchRadius) fail('board_touch_radius_interaction_drift');
  return deepFreeze({ normal, touch });
}

function pointerClass(pointerType) {
  return pointerType === 'touch' ? 'touch' : 'normal';
}

function distanceXZSquared(point, center) {
  const dx = point[0] - center[0];
  const dz = point[2] - center[2];
  return dx * dx + dz * dz;
}

function sameIntegerArray(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function selectionWitnessMatchesState(selection, state) {
  const witness = selection?.witness;
  return Boolean(witness)
    && witness.generation === state.lifecycle.presentationGeneration
    && witness.revision === state.revision
    && witness.round === state.round
    && witness.activeSeatId === state.activeSeatId;
}

function requireCurrentSelection(selection, state) {
  if (!selection || typeof selection !== 'object' || typeof selection.selectedSize !== 'string') {
    fail('board_pick_requires_size_selection');
  }
  if (!selectionWitnessMatchesState(selection, state)) fail('board_pick_selection_witness_mismatch');
  if (selection.seatId !== state.activeSeatId) fail('board_pick_selection_seat_mismatch');

  const legalCells = [];
  for (let cell = 0; cell < RULES.cellCount; cell += 1) {
    const validation = validatePlacementForSeat(state, selection.seatId, {
      cell,
      size: selection.selectedSize,
    });
    if (validation.ok) legalCells.push(cell);
  }
  if (!sameIntegerArray(selection.legalCells, legalCells)) fail('board_pick_selection_legal_cells_drift');
  if (!sameIntegerArray(
    selection.legalTargetIds?.map(targetId => Number(/^board:([0-8])$/.exec(targetId)?.[1])),
    legalCells,
  )) fail('board_pick_selection_target_ids_drift');
  return selection;
}

export function deriveBoardCellHitSurfaces({
  worldLayout,
  approvedContract,
} = {}) {
  const interactionLayout = deriveGameplayInteractionTargets(worldLayout);
  const radii = radiusContract(approvedContract, interactionLayout);
  const planeY = interactionLayout.zones[0]?.center?.[1];
  if (!Number.isFinite(planeY)) fail('board_pick_plane_missing');
  if (interactionLayout.zones.some(zone => zone.center[1] !== planeY)) fail('board_pick_zone_plane_drift');

  const surfaces = interactionLayout.zones.map(zone => deepFreeze({
    id: zone.id,
    kind: 'board-cell-hit-surface',
    cellId: zone.cellId,
    center: finiteTriple(zone.center, `invalid_board_surface_${zone.cellId}`),
    normalRadius: radii.normal,
    touchRadius: radii.touch,
  }));
  if (surfaces.length !== RULES.cellCount || RULES.cellCount !== 9) fail('board_pick_requires_nine_surfaces');

  return deepFreeze({
    planeY,
    radii,
    surfaces,
  });
}

export function projectRayToBoardPlane(ray, planeY) {
  const origin = finiteTriple(ray?.origin, 'invalid_board_pick_ray_origin');
  const direction = finiteTriple(ray?.direction, 'invalid_board_pick_ray_direction');
  const y = Number(planeY);
  if (!Number.isFinite(y)) fail('invalid_board_pick_plane_y');
  if (Math.abs(direction[1]) <= RAY_EPSILON) return null;
  const distance = (y - origin[1]) / direction[1];
  if (!Number.isFinite(distance) || distance < 0) return null;
  return deepFreeze({
    point: [
      origin[0] + direction[0] * distance,
      y,
      origin[2] + direction[2] * distance,
    ],
    rayDistance: distance,
  });
}

export function resolveBoardCellPick({
  state,
  selection,
  ray,
  pointerType = 'mouse',
  worldLayout,
  approvedContract,
} = {}) {
  assertCanonicalSessionState(state);
  const currentSelection = requireCurrentSelection(selection, state);
  const layout = deriveBoardCellHitSurfaces({ worldLayout, approvedContract });
  const projected = projectRayToBoardPlane(ray, layout.planeY);
  const inputClass = pointerClass(pointerType);
  const radius = layout.radii[inputClass];

  if (!projected) {
    return deepFreeze({
      ok: false,
      code: 'ray_misses_board_plane',
      ruleCode: null,
      pointerClass: inputClass,
      radius,
      worldPoint: null,
      candidateCell: null,
      candidateTargetId: null,
      overlapCandidateCells: [],
      placement: null,
    });
  }

  const radiusSquared = radius * radius;
  const candidates = layout.surfaces
    .map(surface => ({
      surface,
      distanceSquared: distanceXZSquared(projected.point, surface.center),
    }))
    .filter(candidate => candidate.distanceSquared <= radiusSquared)
    .sort((left, right) => (
      left.distanceSquared - right.distanceSquared
      || left.surface.cellId - right.surface.cellId
    ));

  if (candidates.length === 0) {
    return deepFreeze({
      ok: false,
      code: 'outside_target_radius',
      ruleCode: null,
      pointerClass: inputClass,
      radius,
      worldPoint: projected.point,
      candidateCell: null,
      candidateTargetId: null,
      overlapCandidateCells: [],
      placement: null,
    });
  }

  // Geometry chooses first. Never filter by legality before this step: doing so could
  // magnetize an input from a nearer illegal cell into a farther legal neighbor.
  const winner = candidates[0];
  const candidateCell = winner.surface.cellId;
  const validation = validatePlacementForSeat(state, currentSelection.seatId, {
    cell: candidateCell,
    size: currentSelection.selectedSize,
  });
  const overlapCandidateCells = Object.freeze(candidates.map(candidate => candidate.surface.cellId));

  if (!validation.ok) {
    return deepFreeze({
      ok: false,
      code: 'candidate_illegal_for_selected_size',
      ruleCode: validation.code,
      pointerClass: inputClass,
      radius,
      worldPoint: projected.point,
      candidateCell,
      candidateTargetId: winner.surface.id,
      candidateDistance: Math.sqrt(winner.distanceSquared),
      overlapCandidateCells,
      placement: null,
    });
  }

  if (!currentSelection.legalCells.includes(candidateCell)) fail('board_pick_legal_visual_drift');
  return deepFreeze({
    ok: true,
    code: null,
    ruleCode: null,
    pointerClass: inputClass,
    radius,
    worldPoint: projected.point,
    candidateCell,
    candidateTargetId: winner.surface.id,
    candidateDistance: Math.sqrt(winner.distanceSquared),
    overlapCandidateCells,
    placement: validation.placement,
  });
}
