import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectedTriangleComponents, gitBlobSha1, parseStl, sha256 } from './lib/stl-glb-converter.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_PATH = 'YAKOLAK_PORTABLE_KIT/assets/models/player-base.stl';
const GLB_PATH = 'web/assets/models/player-base.glb';
const STATE_PATH = 'web/assets/models/conversion-state.json';
const GEOMETRY_LAYOUT_PATH = 'web/assets/models/player-base-layout.json';
const WORLD_LAYOUT_PATH = 'YAKOLAK_PORTABLE_KIT/assets/layout/world-layout.json';
const MANIFEST_SOURCE_PATH = 'web/app/assets/asset-manifest.js';
const WRAPPER_SOURCE_PATH = 'web/app/scene/player-bases.js';

const SEAT_ORDER = Object.freeze(['right', 'back', 'left', 'front']);
const COLOR_BY_SEAT = Object.freeze({ right: 'marble', back: 'blue', left: 'gold', front: 'green' });
const EXPECTED_SOURCE_BOUNDS = Object.freeze({ min: Object.freeze([0, 0, 0]), max: Object.freeze([66, 169, 12]) });
const EXPECTED_PIVOT = Object.freeze([33, 84.5, 6]);
const EXPECTED_TRIANGLES = 199100;
const EXPECTED_COMPONENTS = 12;
const EXPECTED_VISUAL_GROUPS = Object.freeze([
  Object.freeze({ id: 'source-high', componentIndices: Object.freeze([4, 5, 6]) }),
  Object.freeze({ id: 'source-middle', componentIndices: Object.freeze([0, 10, 11]) }),
  Object.freeze({ id: 'source-low', componentIndices: Object.freeze([7, 8, 9]) }),
]);
const EXPECTED_BASES = Object.freeze({
  right: Object.freeze({ position: Object.freeze([135, 6, 0]), rotationDegrees: Object.freeze([-90, 0, 0]) }),
  back: Object.freeze({ position: Object.freeze([0, 6, -135]), rotationDegrees: Object.freeze([-90, 0, -90]) }),
  left: Object.freeze({ position: Object.freeze([-135, 6, 0]), rotationDegrees: Object.freeze([-90, 0, 180]) }),
  front: Object.freeze({ position: Object.freeze([0, 6, 135]), rotationDegrees: Object.freeze([-90, 0, 90]) }),
});
const EXPECTED_HOME_STACKS = Object.freeze({
  right: Object.freeze([Object.freeze([135, 2, -48]), Object.freeze([135, 2, 0]), Object.freeze([135, 2, 48])]),
  back: Object.freeze([Object.freeze([-48, 2, -135]), Object.freeze([0, 2, -135]), Object.freeze([48, 2, -135])]),
  left: Object.freeze([Object.freeze([-135, 2, -48]), Object.freeze([-135, 2, 0]), Object.freeze([-135, 2, 48])]),
  front: Object.freeze([Object.freeze([-48, 2, 135]), Object.freeze([0, 2, 135]), Object.freeze([48, 2, 135])]),
});
const EPSILON = 1e-6;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function near(actual, expected, epsilon = EPSILON) {
  return Math.abs(actual - expected) <= epsilon;
}

function sameArray(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function assertVec(actual, expected, label, epsilon = EPSILON) {
  assert(Array.isArray(actual) && actual.length === expected.length, `${label} vector length drift`);
  actual.forEach((value, index) => assert(near(value, expected[index], epsilon), `${label}[${index}] expected ${expected[index]}, got ${value}`));
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

function centerOf(bounds) {
  return bounds.min.map((value, axis) => (value + bounds.max[axis]) / 2);
}

function unionBounds(boundsList) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const bounds of boundsList) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], bounds.min[axis]);
      max[axis] = Math.max(max[axis], bounds.max[axis]);
    }
  }
  return { min, max };
}

function parseGlbJson(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) throw new Error('Expected GLB 2.0');
  if (bytes.readUInt32LE(8) !== bytes.byteLength) throw new Error('GLB total length mismatch');
  const jsonLength = bytes.readUInt32LE(12);
  const jsonType = bytes.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a) throw new Error('GLB first chunk must be JSON');
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trim());
}

// Matches Three.js Euler order 'XYZ': source-space Z is applied before X when Y=0.
function rotateXYZ(point, rotationDegrees) {
  const [xDeg, yDeg, zDeg] = rotationDegrees;
  const x = xDeg * Math.PI / 180;
  const y = yDeg * Math.PI / 180;
  const z = zDeg * Math.PI / 180;
  const a = Math.cos(x); const b = Math.sin(x);
  const c = Math.cos(y); const d = Math.sin(y);
  const e = Math.cos(z); const f = Math.sin(z);
  const ae = a * e; const af = a * f; const be = b * e; const bf = b * f;
  return [
    c * e * point[0] - c * f * point[1] + d * point[2],
    (af + be * d) * point[0] + (ae - bf * d) * point[1] - b * c * point[2],
    (bf - ae * d) * point[0] + (be + af * d) * point[1] + a * c * point[2],
  ];
}

function transformPoint(point, pivot, transform) {
  const local = point.map((value, axis) => value - pivot[axis]);
  const rotated = rotateXYZ(local, transform.rotationDegrees);
  return rotated.map((value, axis) => value + transform.position[axis]);
}

function transformedBounds(sourceBounds, pivot, transform) {
  const points = [];
  for (const x of [sourceBounds.min[0], sourceBounds.max[0]]) {
    for (const y of [sourceBounds.min[1], sourceBounds.max[1]]) {
      for (const z of [sourceBounds.min[2], sourceBounds.max[2]]) points.push(transformPoint([x, y, z], pivot, transform));
    }
  }
  return {
    min: [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis]))),
    max: [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis]))),
  };
}

function distanceXZ(a, b) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function verifyHomeAlignment({ visualCenters, pivot, transform, homes, tolerance }) {
  const visualWorld = visualCenters.map((center) => transformPoint(center, pivot, transform));
  const matches = visualWorld.map((worldCenter, visualIndex) => {
    const nearest = homes
      .map((homeCenter, homeIndex) => ({ homeIndex, homeCenter, errorXZ: distanceXZ(worldCenter, homeCenter) }))
      .sort((a, b) => a.errorXZ - b.errorXZ)[0];
    return { visualIndex, worldCenter, ...nearest };
  });
  const uniqueHomes = new Set(matches.map((match) => match.homeIndex));
  const maxErrorXZ = Math.max(...matches.map((match) => match.errorXZ));
  assert(uniqueHomes.size === 3, 'Player-base visual stacks must map one-to-one to three authoritative home centers');
  assert(maxErrorXZ <= tolerance, `Player-base home-stack alignment exceeds tolerance: ${maxErrorXZ}`);
  return { matches, maxErrorXZ };
}

export async function verifyPlayerBases() {
  const [sourceBytes, glbBytes, stateRaw, geometryLayoutRaw, worldLayoutRaw, manifestSource, wrapperSource] = await Promise.all([
    readFile(path.join(repoRoot, SOURCE_PATH)),
    readFile(path.join(repoRoot, GLB_PATH)),
    readFile(path.join(repoRoot, STATE_PATH), 'utf8'),
    readFile(path.join(repoRoot, GEOMETRY_LAYOUT_PATH), 'utf8'),
    readFile(path.join(repoRoot, WORLD_LAYOUT_PATH), 'utf8'),
    readFile(path.join(repoRoot, MANIFEST_SOURCE_PATH), 'utf8'),
    readFile(path.join(repoRoot, WRAPPER_SOURCE_PATH), 'utf8'),
  ]);

  const stl = parseStl(sourceBytes);
  const components = connectedTriangleComponents(stl);
  assert(sourceBytes.byteLength === 9955084, 'Canonical player-base source byte count drift');
  assert(stl.triangleCount === EXPECTED_TRIANGLES, 'Canonical player-base triangle count drift');
  assert(components.length === EXPECTED_COMPONENTS, 'Canonical player-base component count drift');
  const globalBounds = boundsForTriangles(stl, Array.from({ length: stl.triangleCount }, (_, index) => index));
  assertVec(globalBounds.min, EXPECTED_SOURCE_BOUNDS.min, 'player-base source min');
  assertVec(globalBounds.max, EXPECTED_SOURCE_BOUNDS.max, 'player-base source max');
  const pivot = centerOf(globalBounds);
  assertVec(pivot, EXPECTED_PIVOT, 'player-base source pivot');

  const componentBounds = components.map((triangles) => boundsForTriangles(stl, triangles));
  const measuredVisualCenters = EXPECTED_VISUAL_GROUPS.map((group) => centerOf(unionBounds(group.componentIndices.map((index) => componentBounds[index]))));

  const gltf = parseGlbJson(glbBytes);
  assert(gltf.asset?.version === '2.0', 'Player-base GLB version drift');
  assert(gltf.nodes?.length === EXPECTED_COMPONENTS, 'Player-base GLB must expose exactly 12 component nodes');
  assert(gltf.scenes?.[0]?.nodes?.length === EXPECTED_COMPONENTS, 'Player-base GLB scene must reference all 12 components directly');
  gltf.nodes.forEach((node, index) => {
    assert(Number.isInteger(node.mesh), `Player-base GLB node ${index} must own a mesh`);
    assert(!node.matrix && !node.translation && !node.rotation && !node.scale, `Player-base GLB node ${index} contains a hidden transform`);
    assert(new RegExp(`#component-${String(index).padStart(3, '0')}$`).test(node.name || ''), `Player-base GLB component name drift at ${index}`);
  });

  const state = JSON.parse(stateRaw);
  const geometryLayout = JSON.parse(geometryLayoutRaw);
  const worldLayout = JSON.parse(worldLayoutRaw);
  const stateEntry = state.targets?.['model.player-base'];
  const runtimeGitBlobSha1 = gitBlobSha1(glbBytes);
  const runtimeSha256 = sha256(glbBytes);
  assert(stateEntry, 'Conversion state missing model.player-base');
  assert(stateEntry.sourceGitBlobSha1 === gitBlobSha1(sourceBytes), 'Player-base conversion source Git blob SHA drift');
  assert(stateEntry.outputSha256 === runtimeSha256 && stateEntry.outputBytes === glbBytes.byteLength, 'Player-base conversion output identity drift');
  assert(stateEntry.triangleCount === EXPECTED_TRIANGLES && stateEntry.componentCount === EXPECTED_COMPONENTS, 'Player-base conversion geometry counts drift');

  assert(geometryLayout.source.canonicalGitBlobSha1 === gitBlobSha1(sourceBytes), 'Player-base geometry metadata canonical Git blob SHA drift');
  assert(geometryLayout.source.runtimeGitBlobSha1 === runtimeGitBlobSha1, 'Player-base geometry metadata runtime Git blob SHA drift');
  assert(geometryLayout.source.runtimeSha256 === runtimeSha256, 'Player-base geometry metadata runtime SHA-256 drift');
  assert(geometryLayout.source.runtimeBytes === glbBytes.byteLength, 'Player-base geometry metadata runtime byte count drift');
  assert(geometryLayout.source.triangleCount === EXPECTED_TRIANGLES && geometryLayout.source.componentCount === EXPECTED_COMPONENTS, 'Player-base geometry metadata counts drift');
  assert(geometryLayout.axisPolicy.uniformScale === 1 && geometryLayout.axisPolicy.ownershipDerivedFromMeshPosition === false, 'Player-base axis/ownership policy drift');
  assertVec(geometryLayout.geometry.assetPivot, EXPECTED_PIVOT, 'player-base geometry metadata pivot');
  assertVec(geometryLayout.geometry.sourceBounds.min, EXPECTED_SOURCE_BOUNDS.min, 'player-base metadata source min');
  assertVec(geometryLayout.geometry.sourceBounds.max, EXPECTED_SOURCE_BOUNDS.max, 'player-base metadata source max');
  assert(sameArray(geometryLayout.geometry.componentIndices, Array.from({ length: EXPECTED_COMPONENTS }, (_, index) => index)), 'Player-base geometry component map drift');
  assert(geometryLayout.geometry.visualStackGroups.length === 3, 'Player-base geometry must expose three visual stack groups');
  geometryLayout.geometry.visualStackGroups.forEach((group, index) => {
    assert(group.id === EXPECTED_VISUAL_GROUPS[index].id, `Player-base visual stack ID drift at ${index}`);
    assert(sameArray(group.componentIndices, EXPECTED_VISUAL_GROUPS[index].componentIndices), `Player-base visual stack component map drift at ${index}`);
    assertVec(group.measuredSourceCenter, measuredVisualCenters[index], `Player-base visual stack measured center ${index}`, 1e-5);
  });

  assert(sameArray(worldLayout.turnRing, SEAT_ORDER), 'Authoritative player-base seat order drift');
  const seatReports = [];
  let maxHomeErrorXZ = 0;
  for (const seatId of SEAT_ORDER) {
    assert(worldLayout.identities[seatId] === COLOR_BY_SEAT[seatId], `Authoritative color mapping drift for ${seatId}`);
    assertVec(worldLayout.bases[seatId].position, EXPECTED_BASES[seatId].position, `${seatId} base position`);
    assertVec(worldLayout.bases[seatId].rotationDegrees, EXPECTED_BASES[seatId].rotationDegrees, `${seatId} base rotation`);
    EXPECTED_HOME_STACKS[seatId].forEach((home, index) => assertVec(worldLayout.homeStacks[seatId][index], home, `${seatId} home ${index}`));
    const bounds = transformedBounds(globalBounds, pivot, worldLayout.bases[seatId]);
    assertVec(bounds.min, geometryLayout.verifiedWorldBounds[seatId].min, `${seatId} world bounds min`, 1e-5);
    assertVec(bounds.max, geometryLayout.verifiedWorldBounds[seatId].max, `${seatId} world bounds max`, 1e-5);
    const alignment = verifyHomeAlignment({
      visualCenters: measuredVisualCenters,
      pivot,
      transform: worldLayout.bases[seatId],
      homes: worldLayout.homeStacks[seatId],
      tolerance: geometryLayout.geometry.homeAlignmentTolerance,
    });
    maxHomeErrorXZ = Math.max(maxHomeErrorXZ, alignment.maxErrorXZ);
    seatReports.push({
      seatId,
      colorId: worldLayout.identities[seatId],
      transform: worldLayout.bases[seatId],
      bounds,
      homeAlignment: alignment,
    });
  }

  const manifestNeedle = `runtime('/assets/models/player-base.glb', 'glb-components', '${runtimeGitBlobSha1}', ${glbBytes.byteLength})`;
  assert(manifestSource.includes(manifestNeedle), 'Runtime manifest is not pinned to committed player-base GLB');
  assert(wrapperSource.includes("ownershipSource = 'world-layout.identities'"), 'Player-base wrapper must tag ownership source explicitly');
  assert(wrapperSource.includes('worldLayout.identities[seatId]'), 'Player-base wrapper must resolve color from authoritative identity mapping');
  assert(wrapperSource.includes('worldLayout.bases[seatId]'), 'Player-base wrapper must use authoritative base transforms');
  assert(wrapperSource.includes('worldLayout.homeStacks[seatId]'), 'Player-base wrapper must verify against authoritative home-stack centers');
  assert(!wrapperSource.includes('.geometry.clone('), 'Player-base instances must share decoded geometry instead of cloning it');
  assert(!wrapperSource.includes('component.geometry.dispose('), 'Player-base wrapper must not dispose AssetManager-owned shared geometry');

  return Object.freeze({
    sourcePivot: Object.freeze([...pivot]),
    runtimeGitBlobSha1,
    runtimeBytes: glbBytes.byteLength,
    triangleCount: stl.triangleCount,
    componentCount: components.length,
    seatOrder: SEAT_ORDER,
    ownership: Object.freeze(SEAT_ORDER.map((seatId) => Object.freeze({ seatId, colorId: worldLayout.identities[seatId] }))),
    maxHomeErrorXZ,
    homeAlignmentTolerance: geometryLayout.geometry.homeAlignmentTolerance,
    seats: Object.freeze(seatReports),
    ownershipDerivedFromMeshPosition: false,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await verifyPlayerBases();
  console.log('THREEJS019_VERIFY_BEGIN');
  console.log(JSON.stringify(report, null, 2));
  console.log('THREEJS019_VERIFY_OK');
}
