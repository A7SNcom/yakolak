import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Group } from 'three';

import { createResourceRegistry } from '../web/app/core/resource-registry.js';
import {
  LAST_MOVE_MARKER_VISUAL_POLICY,
  createLastMoveMarkerPresentation,
  deriveLastMoveMarkerModel,
} from '../web/app/scene/last-move-marker.js';
import { configuredSeatOrder } from '../web/app/shared/seat-order.js';
import { emptyBoard } from '../web/app/shared/rules.js';
import { createCanonicalSessionState } from '../web/app/session/canonical-session-state.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worldLayout = JSON.parse(readFileSync(
  path.join(root, 'YAKOLAK_PORTABLE_KIT/assets/layout/world-layout.json'),
  'utf8',
));
const seats = configuredSeatOrder('marble', 2).map((slot, index) => ({
  seatId: slot.seatId,
  type: index === 0 ? 'human' : 'computer',
  color: slot.color,
  ready: true,
}));

function canonical({
  revision = 12,
  generation = 5,
  round = 1,
  activeSeatId = 'back',
  board = emptyBoard(),
  lastMove = null,
} = {}) {
  return createCanonicalSessionState({
    preferredColor: 'marble',
    targetPlayers: 2,
    winsToMatch: 3,
    seats,
    board,
    activeSeatId,
    deadlineAtMs: activeSeatId === null ? null : 300_000 + revision,
    round,
    revision,
    lastMove,
    lifecycle: { phase: 'turn-loop', presentationGeneration: generation },
  });
}

function boardWith(...placements) {
  const board = emptyBoard();
  for (const { cell, size, color } of placements) board[String(cell)][size] = color;
  return board;
}

assert.deepEqual(LAST_MOVE_MARKER_VISUAL_POLICY.sizeScale, {
  small: 0.82,
  medium: 1,
  large: 1.18,
});
assert.equal(LAST_MOVE_MARKER_VISUAL_POLICY.markerKind, 'last-accepted-move-pointer');
assert.equal(LAST_MOVE_MARKER_VISUAL_POLICY.shape, 'inverted-pyramid');
assert.equal(LAST_MOVE_MARKER_VISUAL_POLICY.colorIndependent, true);
assert.equal(LAST_MOVE_MARKER_VISUAL_POLICY.usesRing, false);
assert.equal(LAST_MOVE_MARKER_VISUAL_POLICY.usesPieceOutline, false);
assert.equal(LAST_MOVE_MARKER_VISUAL_POLICY.usesWinningHighlight, false);

const firstBoard = boardWith({ cell: 4, size: 'medium', color: 'marble' });
const first = canonical({
  board: firstBoard,
  lastMove: { seatId: 'right', color: 'marble', cell: 4, size: 'medium' },
});
const firstModel = deriveLastMoveMarkerModel(first, { worldLayout });
assert.deepEqual(firstModel.boardCenter, [0, 2, 0]);
assert.deepEqual(firstModel.position, [0, 20, 0]);
assert.equal(firstModel.targetId, 'board:4');
assert.equal(firstModel.scale, 1);
assert.equal(firstModel.markerKind, 'last-accepted-move-pointer');
assert.equal(firstModel.shape, 'inverted-pyramid');
assert.equal(firstModel.moveIdentity, 'revision:12|round:1|move:right:marble:4:medium');
assert.equal(firstModel.revision, 12);
assert.equal(firstModel.round, 1);

// Marker size encodes the accepted size while shape stays identical/non-color-only.
const smallBoard = boardWith({ cell: 0, size: 'small', color: 'marble' });
const small = canonical({
  revision: 20,
  board: smallBoard,
  lastMove: { seatId: 'right', color: 'marble', cell: 0, size: 'small' },
});
assert.equal(deriveLastMoveMarkerModel(small, { worldLayout }).scale, 0.82);
const largeBoard = boardWith({ cell: 8, size: 'large', color: 'marble' });
const large = canonical({
  revision: 21,
  board: largeBoard,
  lastMove: { seatId: 'right', color: 'marble', cell: 8, size: 'large' },
});
assert.equal(deriveLastMoveMarkerModel(large, { worldLayout }).scale, 1.18);

// Canonical lastMove identity must agree with the committed board slot; presentation
// fails closed instead of pointing at an impossible move.
const mismatch = canonical({
  revision: 22,
  board: emptyBoard(),
  lastMove: { seatId: 'right', color: 'marble', cell: 4, size: 'medium' },
});
assert.throws(() => deriveLastMoveMarkerModel(mismatch, { worldLayout }), /last_move_board_mismatch/);
assert.equal(deriveLastMoveMarkerModel(canonical({ revision: 23 }), { worldLayout }), null);

const parent = new Group();
const registry = createResourceRegistry();
let renderRequests = 0;
const marker = createLastMoveMarkerPresentation({
  parent,
  worldLayout,
  resourceRegistry: registry,
  requestRender() { renderRequests += 1; },
});

assert.equal(Object.hasOwn(marker, 'clear'), false, 'marker must not expose a local clear API');
assert.equal(marker.root.visible, false);
assert.equal(marker.root.children.length, 2);
assert.equal(marker.root.children[0].isMesh, true);
assert.equal(marker.root.children[0].geometry.type, 'ConeGeometry');
assert.equal(marker.root.children[1].isLineSegments, true);
assert.equal(marker.root.userData.markerKind, 'last-accepted-move-pointer');

let snapshot = marker.applySnapshot(first);
assert.equal(snapshot.visible, true);
assert.equal(snapshot.logicalMarkerCount, 1);
assert.equal(snapshot.renderPrimitiveCount, 2);
assert.equal(snapshot.moveIdentity, firstModel.moveIdentity);
assert.equal(snapshot.cell, 4);
assert.equal(snapshot.size, 'medium');
assert.equal(snapshot.colorIndependent, true);
assert.equal(snapshot.usesRing, false);
assert.equal(snapshot.usesPieceOutline, false);
assert.equal(snapshot.usesWinningHighlight, false);
assert.equal(renderRequests, 1);
assert.deepEqual(marker.root.position.toArray(), [0, 20, 0]);
assert.deepEqual(marker.root.scale.toArray(), [1, 1, 1]);

// Refresh/reconnect rebuilds from the authoritative snapshot. Same move may remain while
// its current authority revision/generation binding changes; no local lifecycle event clears it.
const reconnect = canonical({
  revision: 13,
  generation: 6,
  board: firstBoard,
  lastMove: { seatId: 'right', color: 'marble', cell: 4, size: 'medium' },
});
snapshot = marker.applySnapshot(reconnect);
assert.equal(snapshot.visible, true);
assert.equal(snapshot.cell, 4);
assert.equal(snapshot.moveRevision, 13);
assert.equal(snapshot.moveIdentity, 'revision:13|round:1|move:right:marble:4:medium');
assert.deepEqual(snapshot.authorityWitness, { generation: 6, revision: 13, round: 1 });
assert.equal(renderRequests, 2);
assert.throws(() => marker.applySnapshot(first), /stale_last_move_snapshot/);

// A later accepted move replaces marker identity/location exactly once from lastMove.
const secondBoard = boardWith(
  { cell: 4, size: 'medium', color: 'marble' },
  { cell: 5, size: 'small', color: 'blue' },
);
const second = canonical({
  revision: 14,
  generation: 6,
  activeSeatId: 'right',
  board: secondBoard,
  lastMove: { seatId: 'back', color: 'blue', cell: 5, size: 'small' },
});
snapshot = marker.applySnapshot(second);
assert.equal(snapshot.logicalMarkerCount, 1);
assert.equal(snapshot.cell, 5);
assert.equal(snapshot.size, 'small');
assert.equal(snapshot.moveIdentity, 'revision:14|round:1|move:back:blue:5:small');
assert.deepEqual(marker.root.position.toArray(), [48, 20, 0]);
assert.deepEqual(marker.root.scale.toArray(), [0.82, 0.82, 0.82]);
assert.equal(marker.root.children.length, 2, 'new lastMove reuses one marker instead of accumulating cues');

// Authority defines the clear boundary by lastMove=null. Round reset may preserve the
// same revision/generation while advancing round, so round participates in stale ordering.
const reset = canonical({
  revision: 14,
  generation: 6,
  round: 2,
  activeSeatId: 'right',
  board: emptyBoard(),
  lastMove: null,
});
snapshot = marker.applySnapshot(reset);
assert.equal(snapshot.visible, false);
assert.equal(snapshot.logicalMarkerCount, 0);
assert.equal(snapshot.renderPrimitiveCount, 0);
assert.equal(snapshot.moveIdentity, null);
assert.deepEqual(snapshot.authorityWitness, { generation: 6, revision: 14, round: 2 });
assert.equal(marker.root.visible, false);
assert.throws(() => marker.applySnapshot(second), /stale_last_move_snapshot/, 'previous-round snapshot cannot resurrect marker at same revision');

// Repeated authoritative null snapshots remain hidden without a redundant render request.
const resetRevision15 = canonical({
  revision: 15,
  generation: 6,
  round: 2,
  activeSeatId: 'right',
  board: emptyBoard(),
  lastMove: null,
});
const rendersBeforeHiddenRefresh = renderRequests;
marker.applySnapshot(resetRevision15);
assert.equal(renderRequests, rendersBeforeHiddenRefresh);
assert.equal(marker.snapshot().visible, false);

assert.equal(marker.release(), true);
assert.equal(marker.release(), false);
registry.dispose('last-move-marker-contract-complete');

// Source contract: distinct single-cell pointer, snapshot-only authority, no selection/
// legal-target/winning-highlight dependency and no private motion loop.
const source = readFileSync(path.join(root, 'web/app/scene/last-move-marker.js'), 'utf8');
assert.match(source, /state\.lastMove/);
assert.match(source, /state\.board/);
assert.match(source, /deriveGameplayInteractionTargets/);
assert.match(source, /ConeGeometry/);
assert.match(source, /radialSegments:\s*4/);
assert.match(source, /last-accepted-move-pointer/);
assert.doesNotMatch(source, /createSizeSelectionController|deriveSizeSelection|legalCellCues|selectedPieceMarker/);
assert.doesNotMatch(source, /winningOutcome|winner|winningPattern|winning highlight/i);
assert.doesNotMatch(source, /requestAnimationFrame|setTimeout|setInterval|Promise\./);
assert.doesNotMatch(source, /function\s+clear\s*\(/, '040 must not own an independent marker-clear command');

console.log('THREEJS-040 authoritative last-move marker contract: PASS');
