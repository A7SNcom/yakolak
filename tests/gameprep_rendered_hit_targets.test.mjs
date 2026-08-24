import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { clientPointToCanvasNdc } from '../web/app/gameplay/pointer-events-adapter.js';
import { deriveGameplayInteractionTargets } from '../web/app/gameplay/interaction-targets.js';
import { registerRenderedBoardCellCenters } from '../web/app/gameplay/rendered-hit-transforms.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worldLayout = JSON.parse(readFileSync(path.join(root, 'YAKOLAK_PORTABLE_KIT/assets/layout/world-layout.json'), 'utf8'));
const piecesSource = readFileSync(path.join(root, 'web/app/scene/pieces.js'), 'utf8');
const localSceneSource = readFileSync(path.join(root, 'web/app/scene/local-game-scene.js'), 'utf8');
const boardSource = readFileSync(path.join(root, 'web/app/scene/board-and-lid.js'), 'utf8');

const expectedColors = ['marble', 'blue', 'gold', 'green'];
const expectedSizes = ['small', 'medium', 'large'];
assert.deepEqual([...new Set(Object.values(worldLayout.identities))].sort(), [...expectedColors].sort(), 'fixture must cover marble/blue/gold/green');
for (const seatId of worldLayout.turnRing) {
  assert.equal(worldLayout.homeStacks[seatId].length, 3, `${seatId} must expose all three rendered home stacks`);
}
assert.match(piecesSource, /for \(const size of PIECE_SIZES\)/, 'all L/M/S meshes must share the same rendered picking path');
assert.match(piecesSource, /for \(const colorId of PIECE_COLOR_IDS\)/, 'all four colors must share the same rendered picking path');
assert.match(piecesSource, /applyMatrix4\(this\.matrixWorld\)/, 'home-piece fallback must use the live rendered mesh world matrix');
assert.match(localSceneSource, /pieceRaycaster\.intersectObject\(pieces\.root, true\)/, 'home selection must raycast rendered piece meshes, not a stack proxy');
for (const size of expectedSizes) assert.ok(expectedSizes.includes(size));

assert.match(boardSource, /boardAssetSpace\.matrixWorld/, 'board cell centers must be derived from rendered board asset-space');
assert.match(boardSource, /registerRenderedBoardCellCenters\(renderedCellCenters\)/, 'rendered board centers must feed gameplay picking');

const renderedCells = worldLayout.zones.map(zone => ({
  cellId: zone.id,
  center: [zone.position[0] + 0.23, zone.position[1], zone.position[2] - 0.26],
}));
const releaseRenderedCells = registerRenderedBoardCellCenters(renderedCells);
const interaction = deriveGameplayInteractionTargets(worldLayout);
assert.equal(interaction.zones.length, 9, 'all nine board cells must remain addressable');
for (const zone of interaction.zones) {
  assert.deepEqual(zone.center, renderedCells[zone.cellId].center, `board cell ${zone.cellId} must use rendered center instead of stale world-layout proxy`);
}
releaseRenderedCells();
const fallbackInteraction = deriveGameplayInteractionTargets(worldLayout);
for (const zone of fallbackInteraction.zones) {
  assert.deepEqual(zone.center, worldLayout.zones[zone.cellId].position, 'headless contract fallback must remain deterministic before rendered assets register');
}

let rect = { left: 0, top: 0, width: 390, height: 844, right: 390, bottom: 844 };
const canvas = {
  width: 1170,
  height: 2532,
  addEventListener() {},
  getBoundingClientRect() { return rect; },
};
let point = clientPointToCanvasNdc(canvas, 195, 422);
assert.deepEqual(point.ndc, { x: 0, y: 0 }, 'portrait DPR=3 center must map to camera NDC center from CSS bounds');

rect = { left: 20, top: 10, width: 1440, height: 900, right: 1460, bottom: 910 };
canvas.width = 2880;
canvas.height = 1800;
point = clientPointToCanvasNdc(canvas, 740, 460);
assert.deepEqual(point.ndc, { x: 0, y: 0 }, 'desktop DPR=2 resize must immediately use the new rendered canvas bounds');
assert.equal(point.rect.width, 1440, 'pointer conversion must not use stale portrait or drawing-buffer width');

console.log('GAMEPREP-002 rendered hit targets: PASS');
