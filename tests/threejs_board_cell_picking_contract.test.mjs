import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  deriveBoardCellHitSurfaces,
  projectRayToBoardPlane,
  resolveBoardCellPick,
} from '../web/app/gameplay/board-cell-picking.js';
import { deriveSizeSelection } from '../web/app/gameplay/size-selection.js';
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

function canonical({ revision = 20, generation = 7, board = emptyBoard() } = {}) {
  return createCanonicalSessionState({
    preferredColor: 'marble',
    targetPlayers: 2,
    winsToMatch: 3,
    seats,
    board,
    activeSeatId: 'right',
    deadlineAtMs: 50_000,
    revision,
    lifecycle: { phase: 'turn-loop', presentationGeneration: generation },
  });
}

function verticalRay(x, z, y = 100) {
  return { origin: [x, y, z], direction: [0, -1, 0] };
}

const board = emptyBoard();
board['4'].medium = 'blue';
const state = canonical({ board });
const selection = deriveSizeSelection(state, {
  stackTargetId: 'stack:right:0',
  size: 'medium',
});
assert.equal(selection.legalCells.includes(4), false);
assert.equal(selection.legalCells.includes(5), true);

const surfaces = deriveBoardCellHitSurfaces({ worldLayout, approvedContract });
assert.equal(surfaces.planeY, 2);
assert.deepEqual(surfaces.radii, { normal: 31, touch: 42 });
assert.equal(surfaces.surfaces.length, 9);
assert.deepEqual(surfaces.surfaces.map(surface => [surface.id, surface.cellId, surface.center]), [
  ['board:0', 0, [-48, 2, -48]],
  ['board:1', 1, [0, 2, -48]],
  ['board:2', 2, [48, 2, -48]],
  ['board:3', 3, [-48, 2, 0]],
  ['board:4', 4, [0, 2, 0]],
  ['board:5', 5, [48, 2, 0]],
  ['board:6', 6, [-48, 2, 48]],
  ['board:7', 7, [0, 2, 48]],
  ['board:8', 8, [48, 2, 48]],
]);
assert(surfaces.surfaces.every(surface => surface.normalRadius === 31 && surface.touchRadius === 42));

// Board-plane projection is world-space and independent of visible board mesh size.
assert.deepEqual(projectRayToBoardPlane(verticalRay(48, 0), 2), {
  point: [48, 2, 0],
  rayDistance: 98,
});
assert.equal(projectRayToBoardPlane({ origin: [0, 100, 0], direction: [1, 0, 0] }, 2), null);
assert.equal(projectRayToBoardPlane({ origin: [0, 100, 0], direction: [0, 1, 0] }, 2), null);

const center5 = resolveBoardCellPick({
  state,
  selection,
  ray: verticalRay(48, 0),
  pointerType: 'mouse',
  worldLayout,
  approvedContract,
});
assert.equal(center5.ok, true);
assert.equal(center5.pointerClass, 'normal');
assert.equal(center5.radius, 31);
assert.equal(center5.candidateCell, 5);
assert.equal(center5.candidateTargetId, 'board:5');
assert.deepEqual(center5.placement, { seatId: 'right', color: 'marble', cell: 5, size: 'medium' });

// The authoritative normal/touch radii differ in world space. A point 35 units from
// cell 0 is outside mouse/pen radius 31 but inside touch radius 42.
const normalOutside = resolveBoardCellPick({
  state,
  selection,
  ray: verticalRay(-83, -48),
  pointerType: 'mouse',
  worldLayout,
  approvedContract,
});
assert.equal(normalOutside.ok, false);
assert.equal(normalOutside.code, 'outside_target_radius');
assert.equal(normalOutside.radius, 31);
const penOutside = resolveBoardCellPick({
  state,
  selection,
  ray: verticalRay(-83, -48),
  pointerType: 'pen',
  worldLayout,
  approvedContract,
});
assert.equal(penOutside.pointerClass, 'normal');
assert.equal(penOutside.code, 'outside_target_radius');
const touchInside = resolveBoardCellPick({
  state,
  selection,
  ray: verticalRay(-83, -48),
  pointerType: 'touch',
  worldLayout,
  approvedContract,
});
assert.equal(touchInside.ok, true);
assert.equal(touchInside.pointerClass, 'touch');
assert.equal(touchInside.radius, 42);
assert.equal(touchInside.candidateCell, 0);
assert.equal(touchInside.candidateDistance, 35);

// At the exact midpoint between cells 4 and 5 both normal surfaces overlap equally.
// Stable cell ID breaks the geometry tie: cell 4 wins. Because cell 4 is occupied for
// the selected medium size, the result stays illegal; it MUST NOT magnetize to legal 5.
const midpoint = resolveBoardCellPick({
  state,
  selection,
  ray: verticalRay(24, 0),
  pointerType: 'mouse',
  worldLayout,
  approvedContract,
});
assert.equal(midpoint.ok, false);
assert.equal(midpoint.code, 'candidate_illegal_for_selected_size');
assert.equal(midpoint.ruleCode, 'occupied_slot');
assert.equal(midpoint.candidateCell, 4);
assert.equal(midpoint.candidateTargetId, 'board:4');
assert.equal(midpoint.candidateDistance, 24);
assert.deepEqual(midpoint.overlapCandidateCells, [4, 5]);
assert.equal(midpoint.placement, null);

// Moving one unit toward cell 5 makes geometry choose 5 first, after which the same
// shared validator confirms it. Legality never participates in geometric ranking.
const toward5 = resolveBoardCellPick({
  state,
  selection,
  ray: verticalRay(25, 0),
  pointerType: 'mouse',
  worldLayout,
  approvedContract,
});
assert.equal(toward5.ok, true);
assert.equal(toward5.candidateCell, 5);
assert.equal(toward5.candidateDistance, 23);
assert.deepEqual(toward5.overlapCandidateCells, [5, 4]);

const missesPlane = resolveBoardCellPick({
  state,
  selection,
  ray: { origin: [0, 100, 0], direction: [1, 0, 0] },
  pointerType: 'touch',
  worldLayout,
  approvedContract,
});
assert.equal(missesPlane.ok, false);
assert.equal(missesPlane.code, 'ray_misses_board_plane');
assert.equal(missesPlane.worldPoint, null);

// 034 consumes a current THREEJS-033 selection, not a stale/tampered visual list.
const newerState = canonical({ revision: 21, generation: 8, board });
assert.throws(() => resolveBoardCellPick({
  state: newerState,
  selection,
  ray: verticalRay(48, 0),
  worldLayout,
  approvedContract,
}), /board_pick_selection_witness_mismatch/);

const tamperedCells = Object.freeze({ ...selection, legalCells: Object.freeze([5]) });
assert.throws(() => resolveBoardCellPick({
  state,
  selection: tamperedCells,
  ray: verticalRay(48, 0),
  worldLayout,
  approvedContract,
}), /board_pick_selection_legal_cells_drift/);
const tamperedIds = Object.freeze({ ...selection, legalTargetIds: Object.freeze(['board:5']) });
assert.throws(() => resolveBoardCellPick({
  state,
  selection: tamperedIds,
  ray: verticalRay(48, 0),
  worldLayout,
  approvedContract,
}), /board_pick_selection_target_ids_drift/);

// Source contract: this resolver projects the normalized ray into canonical world
// space; it does not raycast decorative/visible meshes or implement another rule set.
const source = readFileSync(path.join(root, 'web/app/gameplay/board-cell-picking.js'), 'utf8');
assert.match(source, /validatePlacementForSeat\s*\(/);
assert.match(source, /deriveGameplayInteractionTargets\s*\(/);
assert.doesNotMatch(source, /intersectObject|intersectObjects|Raycaster|InstancedMesh|MeshStandardMaterial|MeshBasicMaterial/);
assert.doesNotMatch(source, /requestAnimationFrame|setTimeout|setInterval|Promise\./);

console.log('THREEJS-034 deterministic board-cell picking contract: PASS');
