import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitBlobSha1, parseStl, sha256 } from './lib/stl-glb-converter.mjs';
import {
  PIECE_COLOR_IDS,
  PIECE_INSTANCES_PER_SIZE,
  PIECE_SIZES,
  PIECE_TOTAL_INSTANCES,
  createLogicalPieceCatalog,
} from '../web/app/scene/piece-layout.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_PATH = 'web/assets/models/conversion-state.json';
const WORLD_LAYOUT_PATH = 'YAKOLAK_PORTABLE_KIT/assets/layout/world-layout.json';
const CONTRACT_PATH = 'YAKOLAK_PORTABLE_KIT/assets/reference/approved-contract.json';
const MANIFEST_PATH = 'web/app/assets/asset-manifest.js';
const LOGICAL_LAYOUT_PATH = 'web/app/scene/piece-layout.js';
const RENDERER_PATH = 'web/app/scene/pieces.js';
const EPSILON = 1e-5;

const ASSETS = Object.freeze({
  small: Object.freeze({ source: 'YAKOLAK_PORTABLE_KIT/assets/models/piece-small.stl', output: 'web/assets/models/piece-small.glb', logicalId: 'model.piece-small' }),
  medium: Object.freeze({ source: 'YAKOLAK_PORTABLE_KIT/assets/models/piece-medium.stl', output: 'web/assets/models/piece-medium.glb', logicalId: 'model.piece-medium' }),
  large: Object.freeze({ source: 'YAKOLAK_PORTABLE_KIT/assets/models/piece-large.stl', output: 'web/assets/models/piece-large.glb', logicalId: 'model.piece-large' }),
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function near(actual, expected, epsilon = EPSILON) {
  return Math.abs(actual - expected) <= epsilon;
}

function assertVec(actual, expected, label, epsilon = EPSILON) {
  assert(Array.isArray(actual) && actual.length === expected.length, `${label} vector length drift`);
  actual.forEach((value, index) => assert(near(value, expected[index], epsilon), `${label}[${index}] expected ${expected[index]}, got ${value}`));
}

function boundsFromPositions(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let scalar = 0; scalar < positions.length; scalar += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[scalar + axis]);
      max[axis] = Math.max(max[axis], positions[scalar + axis]);
    }
  }
  return { min, max };
}

function radialEnvelope(positions, pivot) {
  let min = Infinity;
  let max = 0;
  for (let scalar = 0; scalar < positions.length; scalar += 3) {
    const radius = Math.hypot(positions[scalar] - pivot[0], positions[scalar + 1] - pivot[1]);
    min = Math.min(min, radius);
    max = Math.max(max, radius);
  }
  return { min, max };
}

function parseGlbJson(bytes) {
  assert(bytes.byteLength >= 20, 'GLB is too small');
  assert(bytes.readUInt32LE(0) === 0x46546c67, 'Expected GLB magic');
  assert(bytes.readUInt32LE(4) === 2, 'Expected GLB 2.0');
  assert(bytes.readUInt32LE(8) === bytes.byteLength, 'GLB total length mismatch');
  const jsonLength = bytes.readUInt32LE(12);
  assert(bytes.readUInt32LE(16) === 0x4e4f534a, 'GLB first chunk must be JSON');
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trim());
}

function glbPositionBounds(gltf) {
  assert(gltf.nodes?.length === 1, 'Piece GLB must expose exactly one node');
  const node = gltf.nodes[0];
  assert(Number.isInteger(node.mesh), 'Piece GLB node must own one mesh');
  assert(!node.matrix && !node.translation && !node.rotation && !node.scale, 'Piece GLB contains a hidden node transform');
  const mesh = gltf.meshes?.[node.mesh];
  assert(mesh?.primitives?.length === 1, 'Piece GLB mesh must contain exactly one primitive');
  const accessor = gltf.accessors?.[mesh.primitives[0].attributes?.POSITION];
  assert(accessor?.min?.length === 3 && accessor?.max?.length === 3, 'Piece GLB POSITION bounds are missing');
  return { min: accessor.min, max: accessor.max };
}

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

function transformPoint(point, sourcePivot, center, rotationDegrees) {
  const local = point.map((value, axis) => value - sourcePivot[axis]);
  const rotated = rotateXYZ(local, rotationDegrees);
  return rotated.map((value, axis) => value + center[axis]);
}

function footprintPivot(bounds) {
  return [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, bounds.min[2]];
}

function countBy(items, key) {
  const result = {};
  for (const item of items) result[item[key]] = (result[item[key]] || 0) + 1;
  return result;
}

export async function verifyPieces() {
  const [stateRaw, worldLayoutRaw, contractRaw, manifestSource, logicalLayoutSource, rendererSource] = await Promise.all([
    readFile(path.join(repoRoot, STATE_PATH), 'utf8'),
    readFile(path.join(repoRoot, WORLD_LAYOUT_PATH), 'utf8'),
    readFile(path.join(repoRoot, CONTRACT_PATH), 'utf8'),
    readFile(path.join(repoRoot, MANIFEST_PATH), 'utf8'),
    readFile(path.join(repoRoot, LOGICAL_LAYOUT_PATH), 'utf8'),
    readFile(path.join(repoRoot, RENDERER_PATH), 'utf8'),
  ]);
  const state = JSON.parse(stateRaw);
  const worldLayout = JSON.parse(worldLayoutRaw);
  const approvedContract = JSON.parse(contractRaw);
  const catalog = createLogicalPieceCatalog({ worldLayout, approvedContract });

  assert(catalog.pieces.length === PIECE_TOTAL_INSTANCES, 'Logical piece catalog must contain exactly 36 pieces');
  const logicalBySize = countBy(catalog.pieces, 'size');
  const logicalByColor = countBy(catalog.pieces, 'colorId');
  for (const size of PIECE_SIZES) assert(logicalBySize[size] === PIECE_INSTANCES_PER_SIZE, `Expected exactly 12 ${size} logical pieces`);
  for (const colorId of PIECE_COLOR_IDS) assert(logicalByColor[colorId] === 9, `Expected exactly 9 ${colorId} logical pieces`);
  assert(new Set(catalog.pieceIds).size === PIECE_TOTAL_INSTANCES, 'Logical piece IDs must be stable and unique');
  assert(!/InstancedMesh|instanceIndex/.test(logicalLayoutSource), 'Logical piece identity must not depend on mesh or instance index');
  assert(/renderSlotByPieceId/.test(rendererSource), 'Renderer must keep logical identity separate from private render slots');
  assert(/new InstancedMesh\s*\(/.test(rendererSource), 'Piece renderer must use shared InstancedMesh resources');
  assert(/matrixAt\(destination\.center, rotation, resourceBySize\.get\(piece\.size\)\.sourcePivot\)/.test(rendererSource), 'Piece renderer must place from authoritative centers plus one asset-derived size pivot');
  assert(!/magicOffset|pieceOffset|offsetByPiece|offsetsByPiece/.test(rendererSource), 'Per-piece magic offsets are forbidden');

  const geometry = {};
  for (const size of PIECE_SIZES) {
    const spec = ASSETS[size];
    const [sourceBytes, glbBytes] = await Promise.all([
      readFile(path.join(repoRoot, spec.source)),
      readFile(path.join(repoRoot, spec.output)),
    ]);
    const stl = parseStl(sourceBytes);
    const gltf = parseGlbJson(glbBytes);
    const sourceBounds = boundsFromPositions(stl.positions);
    const runtimeBounds = glbPositionBounds(gltf);
    const sourcePivot = footprintPivot(sourceBounds);
    const runtimePivot = footprintPivot(runtimeBounds);
    const envelope = radialEnvelope(stl.positions, sourcePivot);
    const stateEntry = state.targets?.[spec.logicalId];

    assert(stateEntry, `Conversion state missing ${spec.logicalId}`);
    assert(stateEntry.sourcePath === spec.source && stateEntry.outputPath === spec.output, `${size} conversion path drift`);
    assert(stateEntry.sourceGitBlobSha1 === gitBlobSha1(sourceBytes), `${size} canonical source Git blob SHA drift`);
    assert(stateEntry.sourceSha256 === sha256(sourceBytes), `${size} canonical source SHA-256 drift`);
    assert(stateEntry.outputSha256 === sha256(glbBytes), `${size} runtime GLB SHA-256 drift`);
    assert(stateEntry.outputBytes === glbBytes.byteLength, `${size} runtime GLB byte count drift`);
    assert(stateEntry.triangleCount === stl.triangleCount, `${size} triangle count drift`);
    assert(stateEntry.componentCount === 1, `${size} canonical piece must stay one connected component`);
    assert(stateEntry.transformPolicy === 'identity-no-center-no-scale-no-rotation', `${size} conversion transform policy drift`);
    assertVec(runtimeBounds.min, sourceBounds.min, `${size} GLB/source min bounds`);
    assertVec(runtimeBounds.max, sourceBounds.max, `${size} GLB/source max bounds`);
    assertVec(runtimePivot, sourcePivot, `${size} GLB/source placement pivot`);
    assert(gltf.extras?.yakolakConversion?.geometry?.transformPolicy === 'identity-no-center-no-scale-no-rotation', `${size} GLB provenance transform policy drift`);
    assert(gltf.extras?.yakolakConversion?.source?.gitBlobSha1 === gitBlobSha1(sourceBytes), `${size} GLB provenance source identity drift`);

    const runtimeGitSha = gitBlobSha1(glbBytes);
    const runtimeNeedle = `runtime('/assets/models/piece-${size}.glb', 'glb-components', '${runtimeGitSha}', ${glbBytes.byteLength})`;
    assert(manifestSource.includes(runtimeNeedle), `${size} manifest must load the committed GLB with immutable runtime identity`);
    assert(manifestSource.includes(`piece${size[0].toUpperCase()}${size.slice(1)}: asset('${spec.logicalId}'`), `${size} logical manifest entry drift`);

    geometry[size] = { sourceBounds, runtimeBounds, sourcePivot, envelope, triangles: stl.triangleCount, sourceGitSha: gitBlobSha1(sourceBytes), runtimeGitSha };
  }

  assert(geometry.small.envelope.max < geometry.medium.envelope.min - EPSILON, 'Small piece no longer nests cleanly inside medium at one center');
  assert(geometry.medium.envelope.max < geometry.large.envelope.min - EPSILON, 'Medium piece no longer nests cleanly inside large at one center');

  let homePlacementsVerified = 0;
  for (const piece of catalog.pieces) {
    const destination = catalog.getHomeDestination(piece.id);
    const pivot = footprintPivot(geometry[piece.size].sourceBounds);
    const landed = transformPoint(pivot, geometry[piece.size].sourcePivot, destination.center, catalog.rotationDegrees);
    assertVec(landed, destination.center, `${piece.id} home center`, EPSILON);
    homePlacementsVerified += 1;
  }
  assert(homePlacementsVerified === PIECE_TOTAL_INSTANCES, 'Every one of the 36 home piece placements must be verified');

  let boardSlotDestinationsVerified = 0;
  for (const size of PIECE_SIZES) {
    for (const zone of worldLayout.zones) {
      const destination = catalog.getBoardDestination(zone.id);
      const landed = transformPoint(footprintPivot(geometry[size].sourceBounds), geometry[size].sourcePivot, destination.center, catalog.rotationDegrees);
      assertVec(landed, zone.position, `${size} board slot ${zone.id}`, EPSILON);
      boardSlotDestinationsVerified += 1;
    }
  }
  assert(boardSlotDestinationsVerified === 27, 'Expected 27 authoritative size-slot destinations on the 3x3 board');

  let boardPlacementCandidatesVerified = 0;
  for (const piece of catalog.pieces) {
    for (const zone of worldLayout.zones) {
      const destination = catalog.getBoardDestination(zone.id);
      const landed = transformPoint(footprintPivot(geometry[piece.size].sourceBounds), geometry[piece.size].sourcePivot, destination.center, catalog.rotationDegrees);
      assertVec(landed, zone.position, `${piece.id} candidate board cell ${zone.id}`, EPSILON);
      boardPlacementCandidatesVerified += 1;
    }
  }
  assert(boardPlacementCandidatesVerified === 324, 'Expected all 36 pieces × 9 board centers to verify without offsets');

  const report = Object.freeze({
    sizes: Object.freeze(Object.fromEntries(PIECE_SIZES.map((size) => [size, Object.freeze({
      instances: logicalBySize[size],
      triangles: geometry[size].triangles,
      sourceBounds: Object.freeze(geometry[size].sourceBounds),
      sourcePivot: Object.freeze(geometry[size].sourcePivot),
      radialEnvelope: Object.freeze(geometry[size].envelope),
      sourceGitSha: geometry[size].sourceGitSha,
      runtimeGitSha: geometry[size].runtimeGitSha,
    })]))),
    totalInstances: catalog.pieces.length,
    logicalIds: catalog.pieceIds,
    homePlacementsVerified,
    boardSlotDestinationsVerified,
    boardPlacementCandidatesVerified,
    stableIdentityIndependentOfMesh: true,
    perPieceMagicOffsets: 0,
  });

  if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(report, null, 2));
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) await verifyPieces();
