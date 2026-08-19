import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  CylinderGeometry,
  Group,
  Matrix4,
  MeshStandardMaterial,
} from 'three';

import { createResourceRegistry } from '../web/app/core/resource-registry.js';
import {
  SELECTED_PIECE_CLEAR_REASONS,
  SELECTED_PIECE_VISUAL_POLICY,
  createSelectedPiecePresentation,
  deriveSelectedPieceEligibility,
} from '../web/app/scene/selected-piece-presentation.js';
import { configuredSeatOrder } from '../web/app/shared/seat-order.js';
import { emptyBoard } from '../web/app/shared/rules.js';
import { createCanonicalSessionState } from '../web/app/session/canonical-session-state.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seats = configuredSeatOrder('marble', 4).map((slot, index) => ({
  seatId: slot.seatId,
  type: index === 0 ? 'human' : 'computer',
  color: slot.color,
  ready: true,
}));
const seatByColor = Object.fromEntries(seats.map(seat => [seat.color, seat.seatId]));

function canonical({
  revision = 80,
  generation = 14,
  round = 1,
  activeSeatId = 'right',
  board = emptyBoard(),
} = {}) {
  return createCanonicalSessionState({
    preferredColor: 'marble',
    targetPlayers: 4,
    winsToMatch: 3,
    seats,
    board,
    activeSeatId,
    deadlineAtMs: 200_000 + revision,
    round,
    revision,
    lifecycle: { phase: 'turn-loop', presentationGeneration: generation },
  });
}

function geometryFor(size) {
  const radius = { small: 6, medium: 9, large: 12 }[size];
  const geometry = new CylinderGeometry(radius, radius, 4, 24);
  geometry.computeBoundingSphere();
  return geometry;
}

function fakePieces() {
  const rootGroup = new Group();
  const geometries = Object.fromEntries(['small', 'medium', 'large'].map(size => [size, geometryFor(size)]));
  const materials = Object.fromEntries(['marble', 'blue', 'gold', 'green'].map(color => [
    color,
    new MeshStandardMaterial({ color: { marble: 0xf2f0ea, blue: 0x2d64a3, gold: 0xb89235, green: 0x2f7550 }[color] }),
  ]));
  const centers = {
    marble: [135, 2, 0],
    blue: [0, 2, -135],
    gold: [-135, 2, 0],
    green: [0, 2, 135],
  };
  return {
    root: rootGroup,
    geometries,
    materials,
    getSelectionPresentationDescriptor(pieceId) {
      const match = /^piece:([^:]+):([^:]+):(\d+)$/.exec(pieceId);
      if (!match) throw new TypeError('unknown-piece');
      const [, colorId, size, copyNumberRaw] = match;
      const copyIndex = Number(copyNumberRaw) - 1;
      const center = [...centers[colorId]];
      center[0] += copyIndex * 28;
      const matrix = new Matrix4().makeTranslation(...center);
      const geometry = geometries[size];
      return Object.freeze({
        pieceId,
        colorId,
        size,
        copyIndex,
        destination: Object.freeze({ kind: 'home', seatId: seatByColor[colorId], stackIndex: copyIndex, center: Object.freeze(center) }),
        matrixElements: Object.freeze([...matrix.elements]),
        boundingRadius: geometry.boundingSphere.radius,
        geometry,
        baseMaterial: materials[colorId],
      });
    },
    dispose() {
      for (const geometry of Object.values(geometries)) geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
    },
  };
}

function createHarness() {
  const pieces = fakePieces();
  const registry = createResourceRegistry();
  let renderRequests = 0;
  const presentation = createSelectedPiecePresentation({
    pieceInstances: pieces,
    resourceRegistry: registry,
    requestRender() { renderRequests += 1; },
  });
  return {
    pieces,
    registry,
    presentation,
    getRenderRequests: () => renderRequests,
    dispose() {
      presentation.release();
      registry.dispose('selected-piece-contract-complete');
      pieces.dispose();
    },
  };
}

assert.deepEqual(SELECTED_PIECE_CLEAR_REASONS, [
  'cancel',
  'accepted-submit',
  'rejected-submit',
  'turn-change',
  'seat-change',
  'reconnect-hydration',
  'timeout',
  'round-reset',
]);
assert.equal(SELECTED_PIECE_VISUAL_POLICY.primaryCue, 'geometry-outline');
assert.equal(SELECTED_PIECE_VISUAL_POLICY.secondaryCue, 'double-halo-ring');
assert.equal(SELECTED_PIECE_VISUAL_POLICY.colorIndependent, true);
assert.equal(SELECTED_PIECE_VISUAL_POLICY.filledOverlay, false);

const state80 = canonical();
const eligibility = deriveSelectedPieceEligibility(state80, 'piece:marble:medium:1');
assert.equal(eligibility.seatId, 'right');
assert.equal(eligibility.remainingCount, 3);
assert.deepEqual(eligibility.legalCells, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
assert.deepEqual(eligibility.witness, { generation: 14, revision: 80, round: 1, activeSeatId: 'right' });
assert.throws(() => deriveSelectedPieceEligibility(state80, 'piece:blue:medium:1'), /selected_piece_not_owned_by_active_seat/);

// Canonical inventory + shared validation own availability. Once one medium marble is
// committed, copy 3 is no longer a remaining physical source but copies 1/2 remain.
const usedMediumBoard = emptyBoard();
usedMediumBoard['0'].medium = 'marble';
const usedMediumState = canonical({ revision: 81, board: usedMediumBoard });
assert.equal(deriveSelectedPieceEligibility(usedMediumState, 'piece:marble:medium:2').remainingCount, 2);
assert.throws(() => deriveSelectedPieceEligibility(usedMediumState, 'piece:marble:medium:3'), /selected_piece_copy_not_remaining/);

// Even with inventory remaining, a size with every cell occupied is not selectable.
const blockedBoard = emptyBoard();
const blockers = ['blue', 'blue', 'blue', 'gold', 'gold', 'gold', 'green', 'green', 'green'];
for (let cell = 0; cell < blockers.length; cell += 1) blockedBoard[String(cell)].large = blockers[cell];
assert.throws(() => deriveSelectedPieceEligibility(canonical({ board: blockedBoard }), 'piece:marble:large:1'), /selected_piece_has_no_legal_destination/);

const harness = createHarness();
const marbleMaterial = harness.pieces.materials.marble;
const originalMaterialSnapshot = {
  uuid: marbleMaterial.uuid,
  color: marbleMaterial.color.getHex(),
  opacity: marbleMaterial.opacity,
  transparent: marbleMaterial.transparent,
  roughness: marbleMaterial.roughness,
  metalness: marbleMaterial.metalness,
};

// Selection feedback is synchronous: exactly one logical object owns a line-only
// outline + double halo, the base/shared material is untouched, and render is requested now.
let snapshot = harness.presentation.select(state80, 'piece:marble:large:1');
assert.equal(snapshot.selectedPieceId, 'piece:marble:large:1');
assert.equal(snapshot.selectedLogicalObjectCount, 1);
assert.equal(snapshot.emphasisRenderPrimitiveCount, 3);
assert.equal(snapshot.visible, true);
assert.equal(snapshot.filledOverlay, false);
assert.equal(snapshot.neighborMaterialMutationCount, 0);
assert.equal(snapshot.renderRequestCount, 1);
assert.equal(harness.getRenderRequests(), 1);
assert.equal(harness.presentation.root.children.length, 3, 'outline + two halo lines only');
assert(harness.presentation.root.children.every(child => child.isLine || child.isLineSegments || child.isLineLoop));
assert.deepEqual({
  uuid: marbleMaterial.uuid,
  color: marbleMaterial.color.getHex(),
  opacity: marbleMaterial.opacity,
  transparent: marbleMaterial.transparent,
  roughness: marbleMaterial.roughness,
  metalness: marbleMaterial.metalness,
}, originalMaterialSnapshot, 'selection must not mutate the canonical piece material');

// Selecting another valid size replaces the same logical cue root; it never accumulates
// a second selected-looking object or duplicate outline primitive.
snapshot = harness.presentation.select(state80, 'piece:marble:medium:1');
assert.equal(snapshot.selectedPieceId, 'piece:marble:medium:1');
assert.equal(snapshot.selectedLogicalObjectCount, 1);
assert.equal(snapshot.emphasisRenderPrimitiveCount, 3);
assert.equal(harness.presentation.root.children.length, 3);
assert.equal(snapshot.renderRequestCount, 2);

// Presentation follows the selected piece's current render matrix on synchronous refresh
// without a camera/tween dependency.
const beforeRefresh = snapshot.renderRequestCount;
harness.presentation.refresh(state80);
assert.equal(harness.presentation.snapshot().renderRequestCount, beforeRefresh + 1);

// A new authoritative witness cannot slip underneath a live selection; a clear boundary
// must happen first. Reconnect/turn clear records the new witness so old snapshots stay stale.
const state82Back = canonical({ revision: 82, generation: 15, activeSeatId: 'back' });
assert.throws(() => harness.presentation.select(state82Back, 'piece:blue:medium:1'), /selected_piece_requires_boundary_clear/);
assert.equal(harness.presentation.reconcileCanonical({ state: state82Back, reason: 'seat-change' }), true);
assert.equal(harness.presentation.snapshot().selectedLogicalObjectCount, 0);
assert.equal(harness.presentation.snapshot().visible, false);
assert.deepEqual(harness.presentation.snapshot().authorityWitness, { generation: 15, revision: 82, round: 1, activeSeatId: 'back' });
assert.throws(() => harness.presentation.select(state80, 'piece:marble:medium:1'), /stale_selected_piece_snapshot/);
harness.dispose();

// Every UX-SELECT-44 acceptance boundary atomically removes all selected-looking cues.
for (const reason of SELECTED_PIECE_CLEAR_REASONS) {
  const boundaryHarness = createHarness();
  const base = canonical({ revision: 90, generation: 20 });
  boundaryHarness.presentation.select(base, 'piece:marble:small:1');
  assert.equal(boundaryHarness.presentation.snapshot().selectedLogicalObjectCount, 1);

  if (reason === 'cancel' || reason === 'rejected-submit') {
    assert.equal(boundaryHarness.presentation.clear(reason), true);
  } else {
    const next = canonical({
      revision: 91,
      generation: reason === 'reconnect-hydration' || reason === 'round-reset' ? 21 : 20,
      round: reason === 'round-reset' ? 2 : 1,
      activeSeatId: reason === 'turn-change' || reason === 'seat-change' || reason === 'timeout' || reason === 'accepted-submit' ? 'back' : 'right',
    });
    assert.equal(boundaryHarness.presentation.reconcileCanonical({ state: next, reason }), true);
  }

  const cleared = boundaryHarness.presentation.snapshot();
  assert.equal(cleared.selectedPieceId, null, `${reason} clears logical selection`);
  assert.equal(cleared.selectedLogicalObjectCount, 0, `${reason} clears selected-looking object`);
  assert.equal(cleared.emphasisRenderPrimitiveCount, 0, `${reason} hides all emphasis primitives`);
  assert.equal(cleared.visible, false, `${reason} hides emphasis root`);
  assert.equal(boundaryHarness.presentation.root.visible, false);
  boundaryHarness.dispose();
}

// Source contract: presentation owns only line cues. Canonical 045 state + 046 shared
// inventory/validator are the only availability sources; there is no camera/tween loop.
const source = readFileSync(path.join(root, 'web/app/scene/selected-piece-presentation.js'), 'utf8');
assert.match(source, /assertCanonicalSessionState/);
assert.match(source, /deriveRemainingInventoryFromState/);
assert.match(source, /validatePlacementForSeat/);
assert.match(source, /EdgesGeometry/);
assert.match(source, /LineSegments/);
assert.match(source, /LineLoop/);
assert.doesNotMatch(source, /MeshBasicMaterial|MeshStandardMaterial|ShaderMaterial/);
assert.doesNotMatch(source, /requestAnimationFrame|setTimeout|setInterval|Promise\./);
assert.doesNotMatch(source, /camera|Camera/);
assert.doesNotMatch(source, /\.board\s*\[/, '039 must not implement private board/inventory legality');

console.log('THREEJS-039 selected-piece presentation contract: PASS');
