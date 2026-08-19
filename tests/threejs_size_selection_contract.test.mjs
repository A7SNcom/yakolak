import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  SIZE_SELECTION_CLEAR_REASONS,
  SIZE_SELECTION_VISUAL_CONTRACT,
  createSizeSelectionController,
  deriveSizeSelection,
} from '../web/app/gameplay/size-selection.js';
import { emptyBoard } from '../web/app/shared/rules.js';
import { configuredSeatOrder } from '../web/app/shared/seat-order.js';
import { createCanonicalSessionState } from '../web/app/session/canonical-session-state.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seats = configuredSeatOrder('marble', 2).map((slot, index) => ({
  seatId: slot.seatId,
  type: index === 0 ? 'human' : 'computer',
  color: slot.color,
  ready: true,
}));

const board = emptyBoard();
board['0'].medium = 'blue';
board['2'].medium = 'marble';
board['5'].small = 'marble';
board['6'].small = 'marble';

function canonical({
  revision,
  generation = 4,
  round = 1,
  activeSeatId = 'right',
  nextBoard = board,
} = {}) {
  return createCanonicalSessionState({
    preferredColor: 'marble',
    targetPlayers: 2,
    winsToMatch: 3,
    seats,
    board: nextBoard,
    activeSeatId,
    deadlineAtMs: 20_000 + revision,
    round,
    revision,
    lifecycle: { phase: 'turn-loop', presentationGeneration: generation },
  });
}

const state10 = canonical({ revision: 10 });
assert.deepEqual(SIZE_SELECTION_VISUAL_CONTRACT, {
  selectedPieceMarker: 'outline',
  legalCellMarker: 'ring',
  colorIndependent: true,
});
assert.deepEqual(SIZE_SELECTION_CLEAR_REASONS, [
  'cancel',
  'timeout',
  'accepted-resync',
  'rejected-resync',
  'ownership-change',
  'reconnect',
  'round-reset',
]);

// Selection is synchronous and uses the shared validator for all nine cells. Medium
// is unavailable only in cells 0 and 2, so only the seven legal board targets exist.
const medium = deriveSizeSelection(state10, {
  stackTargetId: 'stack:right:0',
  size: 'medium',
});
assert.equal(medium.selectedSize, 'medium');
assert.equal(medium.selectedPieceTargetId, 'home-piece:right:0:medium');
assert.deepEqual(medium.legalCells, [1, 3, 4, 5, 6, 7, 8]);
assert.deepEqual(medium.legalTargetIds, [
  'board:1', 'board:3', 'board:4', 'board:5', 'board:6', 'board:7', 'board:8',
]);
assert.equal(medium.legalCellCues.length, medium.legalCells.length);
assert(medium.legalCellCues.every(cue => cue.visible && cue.marker === 'ring' && cue.colorIndependent));
assert.deepEqual(Object.keys(medium.selectedCue).sort(), [
  'accessibleLabel', 'colorIndependent', 'marker', 'targetId',
]);
assert.equal(medium.selectedCue.marker, 'outline');
assert.equal(medium.selectedCue.colorIndependent, true);
assert.equal(medium.clearReason, null);
assert.deepEqual(medium.witness, {
  generation: 4,
  revision: 10,
  round: 1,
  activeSeatId: 'right',
});
assert.equal(typeof medium.then, 'undefined', 'legal cells must be computed synchronously');

const controller = createSizeSelectionController();
assert.equal(controller.snapshot().selectedSize, null);
assert.deepEqual(controller.snapshot().legalCells, []);

const selectedMedium = controller.select(state10, {
  stackTargetId: 'stack:right:0',
  size: 'medium',
});
assert.equal(selectedMedium.selectedSize, 'medium');

// Exactly one size exists: selecting large replaces medium and its entire legal-target
// model atomically rather than layering a second selection.
const selectedLarge = controller.select(state10, {
  stackTargetId: 'stack:right:0',
  size: 'large',
});
assert.equal(selectedLarge.selectedSize, 'large');
assert.equal(selectedLarge.selectedPieceTargetId, 'home-piece:right:0:large');
assert.deepEqual(selectedLarge.legalCells, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
assert.equal(selectedLarge.legalCellCues.length, 9);
assert.equal(JSON.stringify(selectedLarge).includes('home-piece:right:0:medium'), false);

// THREEJS-031 remaining inventory gate runs before selection: with only one small
// remaining, stack copy 1 is already used and cannot become selected.
assert.deepEqual(state10.inventory.right.small, 1);
assert.throws(() => controller.select(state10, {
  stackTargetId: 'stack:right:1',
  size: 'small',
}), /home_piece_already_used/);
assert.equal(controller.snapshot().selectedSize, 'large', 'failed selection must not partially clear/replace current state');

// Every required boundary clears selected size + selected piece + legal cells +
// visible legal target cues in one frozen replacement.
let revision = 10;
for (const reason of SIZE_SELECTION_CLEAR_REASONS) {
  const selected = controller.select(canonical({ revision }), {
    stackTargetId: 'stack:right:0',
    size: 'large',
  });
  assert.equal(selected.selectedSize, 'large');
  revision += 1;
  let boundaryState = canonical({ revision });
  if (reason === 'ownership-change') boundaryState = canonical({ revision, activeSeatId: 'back' });
  if (reason === 'reconnect') boundaryState = canonical({ revision, generation: 5 });
  if (reason === 'round-reset') boundaryState = canonical({ revision, generation: 6, round: 2, nextBoard: emptyBoard() });
  const cleared = controller.clear(reason, boundaryState);
  assert.equal(cleared.selectedSize, null, `${reason} clears selected size`);
  assert.equal(cleared.selectedPieceTargetId, null, `${reason} clears selected piece`);
  assert.equal(cleared.stackTargetId, null, `${reason} clears stack`);
  assert.equal(cleared.seatId, null, `${reason} clears seat ownership`);
  assert.deepEqual(cleared.legalCells, [], `${reason} clears legal cells`);
  assert.deepEqual(cleared.legalTargetIds, [], `${reason} clears legal target IDs`);
  assert.equal(cleared.selectedCue, null, `${reason} clears selected cue`);
  assert.deepEqual(cleared.legalCellCues, [], `${reason} clears visual target cues`);
  assert.equal(cleared.clearReason, reason);
  assert(Object.isFrozen(cleared));
}

// Once a newer canonical boundary has been observed, an old snapshot cannot resurrect
// a stale selection after reconnect/resync.
assert.throws(() => controller.select(state10, {
  stackTargetId: 'stack:right:0',
  size: 'large',
}), /stale_size_selection_snapshot/);
assert.equal(controller.snapshot().selectedSize, null);
assert.deepEqual(controller.snapshot().legalCells, []);

// Source contract: legality must stay delegated to shared validation; this module
// contains no board-slot occupancy/inventory rule clone and no async feedback delay.
const source = readFileSync(path.join(root, 'web/app/gameplay/size-selection.js'), 'utf8');
assert.match(source, /validatePlacementForSeat\s*\(/);
assert.doesNotMatch(source, /setTimeout|setInterval|requestAnimationFrame|async\s+function|Promise\./);
assert.doesNotMatch(source, /\.board\s*\[/, 'size selection must not duplicate board occupancy rules');
assert.match(source, /selectedPieceMarker:\s*'outline'/);
assert.match(source, /legalCellMarker:\s*'ring'/);

console.log('THREEJS-033 size selection and legal-cell visualization contract: PASS');
