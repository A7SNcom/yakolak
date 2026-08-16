import { connectedTriangleComponents, parseStl, sha256, stlToGlb } from './stl-glb-converter.mjs';

export const BOARD_LID_PROFILE_ID = 'yakolak-board-intro-lid-v1';
export const BOARD_NODE_NAME = 'YakolakBoard';
export const LID_NODE_NAME = 'YakolakIntroLid';

const BOARD_COMPONENTS = Object.freeze(Array.from({ length: 28 }, (_, index) => index));
const LID_COMPONENTS = Object.freeze([28]);
const EXPECTED_TRIANGLES = 62280;
const EXPECTED_COMPONENTS = 29;
const EXPECTED_BOARD_TRIANGLES = 62184;
const EXPECTED_LID_TRIANGLES = 96;
const EPSILON = 1e-3;

function align4(value) { return (value + 3) & ~3; }

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

function unionBounds(records) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const record of records) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], record.min[axis]);
      max[axis] = Math.max(max[axis], record.max[axis]);
    }
  }
  return { min, max };
}

function centerOf(bounds) {
  return bounds.min.map((value, axis) => (value + bounds.max[axis]) / 2);
}

function near(actual, expected, epsilon = EPSILON) {
  return Math.abs(actual - expected) <= epsilon;
}

function assertVec(actual, expected, label, epsilon = EPSILON) {
  if (actual.length !== expected.length || actual.some((value, axis) => !near(value, expected[axis], epsilon))) {
    throw new Error(`${label} drift: expected [${expected.join(', ')}], got [${actual.join(', ')}]`);
  }
}

function parseGlb(glb) {
  const bytes = Buffer.from(glb);
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) throw new Error('Expected GLB 2.0');
  if (bytes.readUInt32LE(8) !== bytes.byteLength) throw new Error('GLB total length mismatch');
  let offset = 12;
  const jsonLength = bytes.readUInt32LE(offset); offset += 4;
  const jsonType = bytes.readUInt32LE(offset); offset += 4;
  if (jsonType !== 0x4e4f534a) throw new Error('GLB first chunk is not JSON');
  const json = JSON.parse(bytes.subarray(offset, offset + jsonLength).toString('utf8').trimEnd());
  offset += jsonLength;
  const binLength = bytes.readUInt32LE(offset); offset += 4;
  const binType = bytes.readUInt32LE(offset); offset += 4;
  if (binType !== 0x004e4942) throw new Error('GLB second chunk is not BIN');
  const binary = bytes.subarray(offset, offset + binLength);
  return { json, binary };
}

function encodeGlb(json, binary) {
  const jsonRaw = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonChunk = Buffer.alloc(align4(jsonRaw.byteLength), 0x20);
  jsonRaw.copy(jsonChunk);
  const binChunk = Buffer.alloc(align4(binary.byteLength), 0);
  binary.copy(binChunk);
  const totalLength = 12 + 8 + jsonChunk.byteLength + 8 + binChunk.byteLength;
  const glb = Buffer.alloc(totalLength);
  let offset = 0;
  glb.writeUInt32LE(0x46546c67, offset); offset += 4;
  glb.writeUInt32LE(2, offset); offset += 4;
  glb.writeUInt32LE(totalLength, offset); offset += 4;
  glb.writeUInt32LE(jsonChunk.byteLength, offset); offset += 4;
  glb.writeUInt32LE(0x4e4f534a, offset); offset += 4;
  jsonChunk.copy(glb, offset); offset += jsonChunk.byteLength;
  glb.writeUInt32LE(binChunk.byteLength, offset); offset += 4;
  glb.writeUInt32LE(0x004e4942, offset); offset += 4;
  binChunk.copy(glb, offset);
  return glb;
}

function componentRecords(stl, components) {
  return components.map((triangles, index) => ({ index, triangles: triangles.length, ...boundsForTriangles(stl, triangles) }));
}

function validateCanonicalStructure(stl, records) {
  if (stl.triangleCount !== EXPECTED_TRIANGLES) throw new Error(`board-and-lid triangle count drift: ${stl.triangleCount}`);
  if (records.length !== EXPECTED_COMPONENTS) throw new Error(`board-and-lid component count drift: ${records.length}`);
  const boardTriangles = BOARD_COMPONENTS.reduce((sum, index) => sum + records[index].triangles, 0);
  const lidTriangles = LID_COMPONENTS.reduce((sum, index) => sum + records[index].triangles, 0);
  if (boardTriangles !== EXPECTED_BOARD_TRIANGLES || lidTriangles !== EXPECTED_LID_TRIANGLES) {
    throw new Error(`board/lid semantic split drift: board=${boardTriangles}, lid=${lidTriangles}`);
  }
  assertVec(records[27].min, [0, 0, 0], 'board body min');
  assertVec(records[27].max, [180.00006103515625, 180, 9.999999046325684], 'board body max');
  assertVec(records[28].min, [6.551025390625, 6.55108642578125, 0], 'intro lid min');
  assertVec(records[28].max, [173.44903564453125, 173.448974609375, 9.999999046325684], 'intro lid max');
}

export function stlToBoardAndLidGlb(bytes, metadata = {}) {
  const stl = parseStl(bytes);
  const components = connectedTriangleComponents(stl);
  const records = componentRecords(stl, components);
  validateCanonicalStructure(stl, records);

  const base = stlToGlb(bytes, metadata);
  const { json: gltf, binary } = parseGlb(base.glb);
  if (gltf.nodes.length !== EXPECTED_COMPONENTS || gltf.scenes?.[0]?.nodes?.length !== EXPECTED_COMPONENTS) {
    throw new Error('Base GLB component-node structure drift');
  }

  const sourceBounds = unionBounds(records);
  const sourcePivot = centerOf(sourceBounds);
  assertVec(sourcePivot, [90.00003051757812, 90, 6], 'full source pivot');
  const pivotTranslation = sourcePivot.map((value) => -value);
  const boardBounds = unionBounds(BOARD_COMPONENTS.map((index) => records[index]));
  const lidBounds = unionBounds(LID_COMPONENTS.map((index) => records[index]));

  const boardPivotNode = gltf.nodes.push({
    name: 'YakolakBoardGeometryPivot',
    translation: pivotTranslation,
    children: [...BOARD_COMPONENTS],
    extras: { role: 'geometry-pivot', sourcePivot },
  }) - 1;
  const boardRootNode = gltf.nodes.push({
    name: BOARD_NODE_NAME,
    children: [boardPivotNode],
    extras: { semanticRole: 'board', temporary: false },
  }) - 1;
  const lidPivotNode = gltf.nodes.push({
    name: 'YakolakIntroLidGeometryPivot',
    translation: pivotTranslation,
    children: [...LID_COMPONENTS],
    extras: { role: 'geometry-pivot', sourcePivot },
  }) - 1;
  const lidRootNode = gltf.nodes.push({
    name: LID_NODE_NAME,
    children: [lidPivotNode],
    extras: { semanticRole: 'intro-lid', temporary: true },
  }) - 1;
  gltf.scenes[0].nodes = [boardRootNode, lidRootNode];

  const provenance = gltf.extras?.yakolakConversion || base.provenance;
  provenance.geometry.semanticProfile = BOARD_LID_PROFILE_ID;
  provenance.geometry.vertexTransformPolicy = 'source-float32-positions-unchanged';
  provenance.geometry.pivotPolicy = 'full-source-bounds-center-owned-by-semantic-geometry-child';
  provenance.geometry.sourceBounds = sourceBounds;
  provenance.geometry.sourcePivot = sourcePivot;
  provenance.geometry.semanticRoots = [
    { name: BOARD_NODE_NAME, node: boardRootNode, componentIndices: [...BOARD_COMPONENTS], triangleCount: EXPECTED_BOARD_TRIANGLES, sourceBounds: boardBounds },
    { name: LID_NODE_NAME, node: lidRootNode, componentIndices: [...LID_COMPONENTS], triangleCount: EXPECTED_LID_TRIANGLES, sourceBounds: lidBounds, temporary: true },
  ];
  gltf.extras = { ...(gltf.extras || {}), yakolakConversion: provenance };

  const glb = encodeGlb(gltf, binary);
  return {
    glb,
    provenance,
    outputSha256: sha256(glb),
    outputBytes: glb.byteLength,
  };
}
