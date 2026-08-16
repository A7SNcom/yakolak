import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitBlobSha1, sha256 } from './lib/stl-glb-converter.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED_PROFILE = 'yakolak-board-intro-lid-v2';
const EXPECTED_PIVOT = [90.00003051757812, 90, 6];
const EXPECTED_CELLS = [
  [-48, 2, -48], [0, 2, -48], [48, 2, -48],
  [-48, 2, 0], [0, 2, 0], [48, 2, 0],
  [-48, 2, 48], [0, 2, 48], [48, 2, 48],
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sameVec(actual, expected, epsilon = 1e-6) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => Math.abs(value - expected[index]) <= epsilon);
}

const [glb, stateRaw, layoutRaw, manifestSource, wrapperSource] = await Promise.all([
  readFile(path.join(repoRoot, 'web/assets/models/board-and-lid.glb')),
  readFile(path.join(repoRoot, 'web/assets/models/conversion-state.json'), 'utf8'),
  readFile(path.join(repoRoot, 'web/assets/models/board-and-lid-layout.json'), 'utf8'),
  readFile(path.join(repoRoot, 'web/app/assets/asset-manifest.js'), 'utf8'),
  readFile(path.join(repoRoot, 'web/app/scene/board-and-lid.js'), 'utf8'),
]);

const state = JSON.parse(stateRaw);
const layout = JSON.parse(layoutRaw);
const runtimeGitBlobSha1 = gitBlobSha1(glb);
const runtimeSha256 = sha256(glb);
const runtimeBytes = glb.byteLength;
const stateEntry = state.targets?.['model.board-and-lid'];

assert(layout.semanticProfile === EXPECTED_PROFILE, 'Board/lid layout semantic profile drift');
assert(stateEntry?.conversionProfile === EXPECTED_PROFILE && stateEntry?.semanticProfile === EXPECTED_PROFILE, 'Conversion-state semantic profile drift');
assert(layout.source.runtimeGitBlobSha1 === runtimeGitBlobSha1, 'Layout runtime Git blob SHA does not match committed GLB');
assert(layout.source.runtimeSha256 === runtimeSha256, 'Layout runtime SHA-256 does not match committed GLB');
assert(layout.source.runtimeBytes === runtimeBytes, 'Layout runtime byte count does not match committed GLB');
assert(stateEntry.outputSha256 === runtimeSha256 && stateEntry.outputBytes === runtimeBytes, 'Conversion-state output identity does not match committed GLB');

assert(layout.axisPolicy.sourcePlane === 'XY', 'Source plane must remain XY');
assert(layout.axisPolicy.sourceDepthAxis === '+Z', 'Source depth axis must remain +Z');
assert(layout.axisPolicy.worldUp === '+Y', 'Runtime world up must remain +Y');
assert(layout.axisPolicy.uniformScale === 1, 'Board/lid runtime scale must remain exactly 1');
assert(layout.axisPolicy.ruleCoordinatesReceiveMeshOffsets === false, 'Visual mesh offsets must never enter rule coordinates');
assert(sameVec(layout.board.assetPivot, EXPECTED_PIVOT), 'Board pivot drift');
assert(sameVec(layout.lid.assetPivot, EXPECTED_PIVOT), 'Intro lid must share the same full-source pivot as board');
assert(layout.board.componentIndices.length === 28 && layout.board.componentIndices.every((value, index) => value === index), 'Board component split must be 0..27');
assert(layout.lid.componentIndices.length === 1 && layout.lid.componentIndices[0] === 28, 'Intro lid component split must be [28]');
assert(sameVec(layout.board.finalTransform.position, [0, 6, 0]) && sameVec(layout.board.finalTransform.rotationDegrees, [-90, 0, 0]), 'Board authoritative transform drift');
assert(sameVec(layout.board.worldBoundsAtFinal.min, [-90.00003051757812, 0, -90]) && sameVec(layout.board.worldBoundsAtFinal.max, [90.00003051757812, 12, 90]), 'Board verified final bounds drift');
assert(sameVec(layout.lid.introStartTransform.position, [0, 62.5, 0]) && sameVec(layout.lid.introStartTransform.rotationDegrees, [-90, 180, 0]), 'Intro lid start transform drift');
assert(sameVec(layout.lid.introLiftedTransform.position, [0, 802.5, 0]) && sameVec(layout.lid.introLiftedTransform.rotationDegrees, [-90, 180, 0]), 'Intro lid lifted transform drift');
assert(layout.lid.liftHeight === 740 && layout.lid.postIntroFinal.snapAtMs === 4010 && layout.lid.postIntroFinal.visible === false, 'Intro lid final state/timing drift');
assert(sameVec(layout.lid.worldBoundsAtStart.min, [-83.44900512695312, 56.5, -83.44891357421875]) && sameVec(layout.lid.worldBoundsAtStart.max, [83.44900512695312, 66.49999904632568, 83.448974609375]), 'Intro lid start bounds drift');
assert(sameVec(layout.lid.worldBoundsAtLifted.min, [-83.44900512695312, 796.5, -83.44891357421875]) && sameVec(layout.lid.worldBoundsAtLifted.max, [83.44900512695312, 806.4999990463257, 83.448974609375]), 'Intro lid lifted bounds drift');

assert(layout.board.cellVisualGroups.length === 9, 'Expected nine verified visual cell groups');
layout.board.cellVisualGroups.forEach((cell, index) => {
  assert(cell.cellId === index, `Cell visual group order drift at ${index}`);
  assert(sameVec(cell.authoritativeWorldCenter, EXPECTED_CELLS[index]), `Authoritative rule center drift for cell ${index}`);
  assert(cell.visualXZDeltaFromRuleCenter.every((value) => Math.abs(value) <= layout.board.visualCenterVerificationTolerance), `Visual center exceeds tolerance for cell ${index}`);
});

const manifestRuntimeNeedle = `runtime('/assets/models/board-and-lid.glb', 'glb-components', '${runtimeGitBlobSha1}', ${runtimeBytes})`;
assert(manifestSource.includes(manifestRuntimeNeedle), 'Runtime asset manifest is not pinned to the verified board/lid GLB');

assert(wrapperSource.includes("root.name = 'board-and-lid-runtime'"), 'Runtime board/lid wrapper root missing');
assert(wrapperSource.includes("createAddressableObject('board'"), 'Board is not independently addressable at runtime');
assert(wrapperSource.includes("createAddressableObject('intro-lid'"), 'Intro lid is not independently addressable at runtime');
assert(wrapperSource.includes('assetSpace.position.set(-pivot[0], -pivot[1], -pivot[2])'), 'Pivot compensation must stay inside visual asset-space wrapper');
assert(wrapperSource.includes('new Mesh(component.geometry, material)'), 'Runtime wrapper must reuse decoded component geometry');
assert(!wrapperSource.includes('component.geometry.clone('), 'Board/lid wrapper must not clone shared geometry');
assert(!wrapperSource.includes('component.geometry.dispose('), 'Board/lid wrapper must not dispose AssetManager-owned shared geometry');
assert(wrapperSource.includes("phase === 'intro-start'") && wrapperSource.includes("phase === 'intro-lifted'") && wrapperSource.includes("phase === 'post-intro'"), 'Intro lid phase addressing contract incomplete');

console.log(`THREEJS018_RUNTIME_CONTRACT_OK git=${runtimeGitBlobSha1} bytes=${runtimeBytes}`);
