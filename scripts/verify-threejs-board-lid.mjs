import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOARD_LID_PROFILE_ID, BOARD_NODE_NAME, LID_NODE_NAME } from './lib/board-lid-semantic-glb.mjs';
import { connectedTriangleComponents, gitBlobSha1, parseStl, sha256 } from './lib/stl-glb-converter.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_PATH = 'YAKOLAK_PORTABLE_KIT/assets/models/board-and-lid.stl';
const GLB_PATH = 'web/assets/models/board-and-lid.glb';
const STATE_PATH = 'web/assets/models/conversion-state.json';
const MANIFEST_PATH = 'YAKOLAK_PORTABLE_KIT/assets/manifest.json';
const LAYOUT_PATH = 'YAKOLAK_PORTABLE_KIT/assets/layout/world-layout.json';
const CONTRACT_PATH = 'YAKOLAK_PORTABLE_KIT/assets/reference/approved-contract.json';
const README_PATH = 'YAKOLAK_PORTABLE_KIT/README.md';

const EXPECTED_SOURCE_BOUNDS = Object.freeze({ min: Object.freeze([0, 0, 0]), max: Object.freeze([180.00006103515625, 180, 12]) });
const EXPECTED_SOURCE_PIVOT = Object.freeze([90.00003051757812, 90, 6]);
const EXPECTED_BOARD_POSE = Object.freeze({ position: Object.freeze([0, 6, 0]), rotationDegrees: Object.freeze([-90, 0, 0]) });
const EXPECTED_LID_CLOSED = Object.freeze({ position: Object.freeze([0, 62.5, 0]), rotationDegrees: Object.freeze([-90, 180, 0]) });
const EXPECTED_LID_LIFT = 740;
const EXPECTED_FINAL_SNAP_MS = 4010;
const CELL_VISUAL_TOLERANCE = 0.35;
const EPSILON = 1e-3;

function assert(condition, message) { if (!condition) throw new Error(message); }
function near(actual, expected, epsilon = EPSILON) { return Math.abs(actual - expected) <= epsilon; }
function assertNumber(actual, expected, label, epsilon = EPSILON) { assert(near(actual, expected, epsilon), `${label}: expected ${expected}, got ${actual}`); }
function assertVec(actual, expected, label, epsilon = EPSILON) {
  assert(Array.isArray(actual) && actual.length === expected.length, `${label}: expected vector length ${expected.length}`);
  actual.forEach((value, axis) => assertNumber(value, expected[axis], `${label}[${axis}]`, epsilon));
}

function boundsForTriangles(stl, triangles) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const triangle of triangles) {
    const base = triangle * 9;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const scalar = base + vertex * 3;
      for (let axis = 0; axis < 3; axis += 1) {
        const value = stl.positions[scalar + axis];
        min[axis] = Math.min(min[axis], value);
        max[axis] = Math.max(max[axis], value);
      }
    }
  }
  return { min, max };
}

function unionBounds(bounds) {
  return {
    min: [0, 1, 2].map((axis) => Math.min(...bounds.map((entry) => entry.min[axis]))),
    max: [0, 1, 2].map((axis) => Math.max(...bounds.map((entry) => entry.max[axis]))),
  };
}
function centerOf(bounds) { return bounds.min.map((value, axis) => (value + bounds.max[axis]) / 2); }

function parseGlbJson(bytes) {
  const buffer = Buffer.from(bytes);
  assert(buffer.readUInt32LE(0) === 0x46546c67, 'GLB magic drift');
  assert(buffer.readUInt32LE(4) === 2, 'GLB version drift');
  assert(buffer.readUInt32LE(8) === buffer.byteLength, 'GLB length header drift');
  const jsonLength = buffer.readUInt32LE(12);
  assert(buffer.readUInt32LE(16) === 0x4e4f534a, 'GLB JSON chunk missing');
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8').trimEnd());
}

function eulerXyzMatrix(rotationDegrees) {
  const [x, y, z] = rotationDegrees.map((value) => value * Math.PI / 180);
  const cx = Math.cos(x); const sx = Math.sin(x);
  const cy = Math.cos(y); const sy = Math.sin(y);
  const cz = Math.cos(z); const sz = Math.sin(z);
  return [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx],
  ];
}
function transformPoint(point, position, rotationDegrees) {
  const matrix = eulerXyzMatrix(rotationDegrees);
  return matrix.map((row, axis) => row[0] * point[0] + row[1] * point[1] + row[2] * point[2] + position[axis]);
}
function transformedBounds(sourceBounds, pivot, pose) {
  const points = [];
  for (const x of [sourceBounds.min[0], sourceBounds.max[0]]) for (const y of [sourceBounds.min[1], sourceBounds.max[1]]) for (const z of [sourceBounds.min[2], sourceBounds.max[2]]) {
    points.push(transformPoint([x - pivot[0], y - pivot[1], z - pivot[2]], pose.position, pose.rotationDegrees));
  }
  return {
    min: [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis]))),
    max: [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis]))),
  };
}

function clusterCellFeatureCenters(componentBounds) {
  const clusters = [];
  for (let index = 0; index < 27; index += 1) {
    const center = centerOf(componentBounds[index]);
    let cluster = clusters.find((candidate) => Math.hypot(candidate.seed[0] - center[0], candidate.seed[1] - center[1]) < 0.01);
    if (!cluster) { cluster = { seed: center, centers: [], indices: [] }; clusters.push(cluster); }
    cluster.centers.push(center); cluster.indices.push(index);
  }
  assert(clusters.length === 9, `Expected 9 visual cell-center clusters, got ${clusters.length}`);
  return clusters.map((cluster) => {
    assert(cluster.indices.length === 3, `Visual cell cluster ${cluster.indices.join(',')} does not contain 3 ring components`);
    return [0, 1, 2].map((axis) => cluster.centers.reduce((sum, center) => sum + center[axis], 0) / cluster.centers.length);
  });
}

function verifyCellCenters(componentBounds, sourcePivot, layout) {
  const visual = clusterCellFeatureCenters(componentBounds).map((sourceCenter) => ({
    sourceCenter,
    world: transformPoint(sourceCenter.map((value, axis) => value - sourcePivot[axis]), layout.board.position, layout.board.rotationDegrees),
  }));
  const remaining = new Set(visual.map((_, index) => index));
  const matches = layout.zones.map((zone) => {
    let best = null;
    for (const index of remaining) {
      const candidate = visual[index];
      const error = Math.hypot(candidate.world[0] - zone.position[0], candidate.world[2] - zone.position[2]);
      if (!best || error < best.error) best = { index, error, candidate };
    }
    assert(best && best.error <= CELL_VISUAL_TOLERANCE, `Visual center for zone ${zone.id} exceeds ${CELL_VISUAL_TOLERANCE}`);
    remaining.delete(best.index);
    assertNumber(zone.position[1], 2, `zone ${zone.id} authoritative Y`);
    return { id: zone.id, authoritative: zone.position, visual: best.candidate.world, error: best.error };
  });
  assert(remaining.size === 0, 'Visual cell-center mapping left unmatched geometry');
  return matches;
}

function semanticGroup(conversion, name) {
  const group = conversion.geometry.semanticGroups?.find((entry) => entry.name === name);
  assert(group, `Missing semantic group ${name}`);
  return group;
}

export async function verifyBoardAndLid() {
  const [sourceBytes, glbBytes, stateRaw, manifestRaw, layoutRaw, contractRaw, readme] = await Promise.all([
    readFile(path.join(repoRoot, MODEL_PATH)), readFile(path.join(repoRoot, GLB_PATH)), readFile(path.join(repoRoot, STATE_PATH), 'utf8'),
    readFile(path.join(repoRoot, MANIFEST_PATH), 'utf8'), readFile(path.join(repoRoot, LAYOUT_PATH), 'utf8'),
    readFile(path.join(repoRoot, CONTRACT_PATH), 'utf8'), readFile(path.join(repoRoot, README_PATH), 'utf8'),
  ]);
  const state = JSON.parse(stateRaw); const manifest = JSON.parse(manifestRaw); const layout = JSON.parse(layoutRaw); const contract = JSON.parse(contractRaw);
  const stl = parseStl(sourceBytes); const components = connectedTriangleComponents(stl);
  const componentBounds = components.map((triangles) => boundsForTriangles(stl, triangles));
  const sourceBounds = unionBounds(componentBounds); const sourcePivot = centerOf(sourceBounds);

  const manifestEntry = manifest.assets.find((entry) => entry.path === 'models/board-and-lid.stl');
  assert(manifestEntry, 'Portable manifest is missing models/board-and-lid.stl');
  assert(manifest.status === 'definitive' && manifest.scalePolicy === 'uniform-only', 'Portable manifest authority/scale policy drift');
  assert(manifestEntry.role === 'board-and-intro-lid' && manifestEntry.instances === '1 board + 1 temporary lid' && manifestEntry.required === true, 'Portable board/lid contract drift');
  assert(stl.triangleCount === 62280 && components.length === 29, 'Canonical board/lid triangle/component count drift');
  assertVec(sourceBounds.min, EXPECTED_SOURCE_BOUNDS.min, 'source bounds min'); assertVec(sourceBounds.max, EXPECTED_SOURCE_BOUNDS.max, 'source bounds max');
  assertVec(sourcePivot, EXPECTED_SOURCE_PIVOT, 'source full-bounds center pivot');

  assert(layout.units === 'arbitrary; uniform scaling only', `Unexpected layout scale contract: ${layout.units}`);
  assertVec(layout.board.position, EXPECTED_BOARD_POSE.position, 'authoritative board position'); assertVec(layout.board.rotationDegrees, EXPECTED_BOARD_POSE.rotationDegrees, 'authoritative board rotation');
  assert(layout.zones.length === 9 && layout.zones.every((zone, index) => zone.id === index), 'Authoritative 3x3 zone order drift');
  const cellMatches = verifyCellCenters(componentBounds, sourcePivot, layout); const maxCellCenterError = Math.max(...cellMatches.map((match) => match.error));

  assert(readme.includes('- Lid initial transform: position `(0,62.5,0)`, rotation `(-90,180,0)`.'), 'Definitive README lid initial transform drift');
  const motion = contract.motion?.unboxing; assert(motion, 'Approved contract is missing unboxing motion');
  assertNumber(motion.lidLiftHeight, EXPECTED_LID_LIFT, 'authoritative lid lift height'); assertNumber(motion.finalSnapMs, EXPECTED_FINAL_SNAP_MS, 'authoritative final snap time');
  const lidOpen = { position: [0, EXPECTED_LID_CLOSED.position[1] + motion.lidLiftHeight, 0], rotationDegrees: [...EXPECTED_LID_CLOSED.rotationDegrees] };
  assertVec(lidOpen.position, [0, 802.5, 0], 'derived lid open position');

  const gltf = parseGlbJson(glbBytes); const conversion = gltf.extras?.yakolakConversion;
  assert(conversion?.geometry?.semanticProfile === BOARD_LID_PROFILE_ID, 'GLB semantic profile missing or stale');
  assertVec(conversion.geometry.sourcePivot, EXPECTED_SOURCE_PIVOT, 'GLB recorded source pivot');
  assert(conversion.geometry.pivotPolicy === 'full-source-bounds-center-applied-only-by-runtime-addressable-wrapper', 'GLB pivot ownership drift');
  assert(gltf.nodes.length === 29 && gltf.scenes?.[0]?.nodes?.length === 29, 'Runtime GLB must expose exactly 29 transform-free mesh nodes');
  gltf.nodes.forEach((node, index) => {
    assert(Number.isInteger(node.mesh), `Runtime GLB node ${index} must remain a mesh`);
    assert(!node.matrix && !node.translation && !node.rotation && !node.scale, `Runtime GLB node ${index} contains a hidden transform`);
    assert(gltf.scenes[0].nodes[index] === index, `Runtime GLB scene component order drift at ${index}`);
  });
  const boardGroup = semanticGroup(conversion, BOARD_NODE_NAME); const lidGroup = semanticGroup(conversion, LID_NODE_NAME);
  assert(boardGroup.semanticRole === 'board' && boardGroup.triangleCount === 62184, 'Board semantic group drift');
  assert(boardGroup.componentIndices.length === 28 && boardGroup.componentIndices.every((index, slot) => index === slot), 'Board must own components 0..27');
  assert(lidGroup.semanticRole === 'intro-lid' && lidGroup.temporary === true && lidGroup.triangleCount === 96, 'Intro lid semantic group drift');
  assert(lidGroup.componentIndices.length === 1 && lidGroup.componentIndices[0] === 28, 'Intro lid must own component 28 only');

  const stateEntry = state.targets?.['model.board-and-lid']; assert(stateEntry, 'Conversion state is missing model.board-and-lid');
  assert(stateEntry.conversionProfile === BOARD_LID_PROFILE_ID && stateEntry.semanticProfile === BOARD_LID_PROFILE_ID, 'Conversion state profile drift');
  assertVec(stateEntry.sourcePivot, EXPECTED_SOURCE_PIVOT, 'conversion-state source pivot');
  assert(stateEntry.sourceGitBlobSha1 === gitBlobSha1(sourceBytes) && stateEntry.sourceBytes === sourceBytes.byteLength, 'Conversion state source identity drift');
  assert(stateEntry.outputSha256 === sha256(glbBytes) && stateEntry.outputBytes === glbBytes.byteLength, 'Committed GLB identity does not match conversion state');

  const boardWorldBounds = transformedBounds(unionBounds(componentBounds.slice(0, 28)), sourcePivot, layout.board);
  const lidClosedBounds = transformedBounds(componentBounds[28], sourcePivot, EXPECTED_LID_CLOSED); const lidOpenBounds = transformedBounds(componentBounds[28], sourcePivot, lidOpen);
  assertVec(boardWorldBounds.min, [-90.00003051757812, 0, -90], 'board final world bounds min'); assertVec(boardWorldBounds.max, [90.00003051757812, 12, 90], 'board final world bounds max');
  assertVec(lidClosedBounds.min, [-83.44900512695312, 56.5, -83.44891357421875], 'lid closed world bounds min'); assertVec(lidClosedBounds.max, [83.44900512695312, 66.49999904632568, 83.448974609375], 'lid closed world bounds max');
  assertVec(lidOpenBounds.min, [-83.44900512695312, 796.5, -83.44891357421875], 'lid open world bounds min'); assertVec(lidOpenBounds.max, [83.44900512695312, 806.4999990463257, 83.448974609375], 'lid open world bounds max');

  return Object.freeze({
    profile: BOARD_LID_PROFILE_ID, sourcePivot, boardPose: layout.board, boardWorldBounds, cellCenterTolerance: CELL_VISUAL_TOLERANCE, maxCellCenterError, cells: cellMatches,
    lid: Object.freeze({ closed: EXPECTED_LID_CLOSED, open: lidOpen, final: Object.freeze({ ...lidOpen, visible: false, snapMs: motion.finalSnapMs }), closedWorldBounds: lidClosedBounds, openWorldBounds: lidOpenBounds }),
    rulesCoordinatesAdjusted: false,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await verifyBoardAndLid(); console.log('THREEJS018_VERIFY_BEGIN'); console.log(JSON.stringify(report, null, 2)); console.log('THREEJS018_VERIFY_OK');
}
