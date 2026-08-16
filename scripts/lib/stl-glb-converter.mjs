import { createHash } from 'node:crypto';
import path from 'node:path';

export const CONVERTER_ID = 'yakolak-stl-to-glb';
export const CONVERTER_VERSION = '1.0.0';

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function gitBlobSha1(bytes) {
  return createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex');
}

function normalize3(x, y, z) {
  const length = Math.hypot(x, y, z);
  if (Number.isFinite(length) && length > 0) return [x / length, y / length, z / length];
  return null;
}

function computedNormal(ax, ay, az, bx, by, bz, cx, cy, cz) {
  const abx = bx - ax; const aby = by - ay; const abz = bz - az;
  const acx = cx - ax; const acy = cy - ay; const acz = cz - az;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  return normalize3(nx, ny, nz) || [0, 1, 0];
}

function assertFinitePositions(positions) {
  for (let i = 0; i < positions.length; i += 1) {
    if (!Number.isFinite(positions[i])) throw new Error(`STL contains non-finite vertex coordinate at scalar ${i}`);
  }
}

function parseBinaryStl(bytes) {
  if (bytes.byteLength < 84) throw new Error('Binary STL is too small');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const triangleCount = view.getUint32(80, true);
  const expected = 84 + triangleCount * 50;
  if (expected !== bytes.byteLength) throw new Error(`Binary STL length mismatch: expected ${expected}, got ${bytes.byteLength}`);

  const positions = new Float32Array(triangleCount * 9);
  const faceNormals = new Float32Array(triangleCount * 3);
  const attributes = new Uint16Array(triangleCount);
  let offset = 84;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const nx = view.getFloat32(offset, true);
    const ny = view.getFloat32(offset + 4, true);
    const nz = view.getFloat32(offset + 8, true);
    offset += 12;
    const p = triangle * 9;
    for (let i = 0; i < 9; i += 1) {
      positions[p + i] = view.getFloat32(offset, true);
      offset += 4;
    }
    attributes[triangle] = view.getUint16(offset, true);
    offset += 2;
    const normal = normalize3(nx, ny, nz) || computedNormal(
      positions[p], positions[p + 1], positions[p + 2],
      positions[p + 3], positions[p + 4], positions[p + 5],
      positions[p + 6], positions[p + 7], positions[p + 8],
    );
    faceNormals.set(normal, triangle * 3);
  }
  assertFinitePositions(positions);
  return { format: 'binary', triangleCount, positions, faceNormals, attributes };
}

function parseAsciiStl(bytes) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const facetPattern = /facet\s+normal\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+outer\s+loop\s+vertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+vertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+vertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+endloop\s+endfacet/gim;
  const triangles = [];
  let match;
  while ((match = facetPattern.exec(text)) !== null) {
    const values = match.slice(1).map(Number);
    if (values.some((value) => !Number.isFinite(value))) throw new Error('ASCII STL contains non-finite numeric data');
    triangles.push(values);
  }
  if (!triangles.length) throw new Error('ASCII STL contains no facets');
  const triangleCount = triangles.length;
  const positions = new Float32Array(triangleCount * 9);
  const faceNormals = new Float32Array(triangleCount * 3);
  const attributes = new Uint16Array(triangleCount);
  triangles.forEach((values, triangle) => {
    const p = triangle * 9;
    positions.set(values.slice(3, 12), p);
    const normal = normalize3(values[0], values[1], values[2]) || computedNormal(...values.slice(3, 12));
    faceNormals.set(normal, triangle * 3);
  });
  assertFinitePositions(positions);
  return { format: 'ascii', triangleCount, positions, faceNormals, attributes };
}

export function parseStl(bytes) {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (buffer.byteLength >= 84) {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const triangleCount = view.getUint32(80, true);
    if (84 + triangleCount * 50 === buffer.byteLength) return parseBinaryStl(buffer);
  }
  return parseAsciiStl(buffer);
}

class UnionFind {
  constructor(size) {
    this.parent = new Int32Array(size);
    this.rank = new Uint8Array(size);
    for (let i = 0; i < size; i += 1) this.parent[i] = i;
  }
  find(value) {
    let root = value;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[value] !== value) {
      const next = this.parent[value];
      this.parent[value] = root;
      value = next;
    }
    return root;
  }
  union(a, b) {
    let rootA = this.find(a); let rootB = this.find(b);
    if (rootA === rootB) return;
    if (this.rank[rootA] < this.rank[rootB]) [rootA, rootB] = [rootB, rootA];
    this.parent[rootB] = rootA;
    if (this.rank[rootA] === this.rank[rootB]) this.rank[rootA] += 1;
  }
}

function vertexKey(positions, scalarOffset) {
  return `${positions[scalarOffset]},${positions[scalarOffset + 1]},${positions[scalarOffset + 2]}`;
}

export function connectedTriangleComponents(stl) {
  const { triangleCount, positions } = stl;
  const uf = new UnionFind(triangleCount);
  const ownerByVertex = new Map();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const base = triangle * 9;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const key = vertexKey(positions, base + vertex * 3);
      const owner = ownerByVertex.get(key);
      if (owner === undefined) ownerByVertex.set(key, triangle);
      else uf.union(triangle, owner);
    }
  }
  const componentsByRoot = new Map();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const root = uf.find(triangle);
    let list = componentsByRoot.get(root);
    if (!list) componentsByRoot.set(root, list = []);
    list.push(triangle);
  }
  return [...componentsByRoot.values()].sort((a, b) => a[0] - b[0]);
}

function align4(value) { return (value + 3) & ~3; }

function floatTupleKey(position, normal) {
  return `${position[0]},${position[1]},${position[2]}|${normal[0]},${normal[1]},${normal[2]}`;
}

function buildComponentGeometry(stl, triangles) {
  const vertexMap = new Map();
  const positions = [];
  const normals = [];
  const indices = [];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (const triangle of triangles) {
    const pBase = triangle * 9;
    const nBase = triangle * 3;
    const normal = [stl.faceNormals[nBase], stl.faceNormals[nBase + 1], stl.faceNormals[nBase + 2]];
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const s = pBase + vertex * 3;
      const position = [stl.positions[s], stl.positions[s + 1], stl.positions[s + 2]];
      const key = floatTupleKey(position, normal);
      let index = vertexMap.get(key);
      if (index === undefined) {
        index = positions.length / 3;
        vertexMap.set(key, index);
        positions.push(...position);
        normals.push(...normal);
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis], position[axis]);
          max[axis] = Math.max(max[axis], position[axis]);
        }
      }
      indices.push(index);
    }
  }

  const positionArray = Float32Array.from(positions);
  const normalArray = Float32Array.from(normals);
  const IndexArray = positionArray.length / 3 <= 65535 ? Uint16Array : Uint32Array;
  const indexArray = IndexArray.from(indices);
  return { positionArray, normalArray, indexArray, min, max, triangleCount: triangles.length };
}

function bytesOfTypedArray(array) {
  return new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
}

function pushAligned(chunks, bytes, padByte = 0) {
  const offset = chunks.total;
  chunks.parts.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  chunks.total += bytes.byteLength;
  const padded = align4(chunks.total);
  if (padded > chunks.total) {
    chunks.parts.push(Buffer.alloc(padded - chunks.total, padByte));
    chunks.total = padded;
  }
  return { offset, length: bytes.byteLength };
}

export function stlToGlb(bytes, { sourcePath = 'source.stl', sourceGitBlobSha1 = null } = {}) {
  const sourceBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const parsed = parseStl(sourceBytes);
  const components = connectedTriangleComponents(parsed);
  const chunks = { parts: [], total: 0 };
  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const nodes = [];

  components.forEach((triangleIndices, componentIndex) => {
    const geometry = buildComponentGeometry(parsed, triangleIndices);
    const positionSeg = pushAligned(chunks, bytesOfTypedArray(geometry.positionArray));
    const normalSeg = pushAligned(chunks, bytesOfTypedArray(geometry.normalArray));
    const indexSeg = pushAligned(chunks, bytesOfTypedArray(geometry.indexArray));

    const positionView = bufferViews.push({ buffer: 0, byteOffset: positionSeg.offset, byteLength: positionSeg.length, target: 34962 }) - 1;
    const normalView = bufferViews.push({ buffer: 0, byteOffset: normalSeg.offset, byteLength: normalSeg.length, target: 34962 }) - 1;
    const indexView = bufferViews.push({ buffer: 0, byteOffset: indexSeg.offset, byteLength: indexSeg.length, target: 34963 }) - 1;
    const vertexCount = geometry.positionArray.length / 3;
    const positionAccessor = accessors.push({ bufferView: positionView, componentType: 5126, count: vertexCount, type: 'VEC3', min: geometry.min, max: geometry.max }) - 1;
    const normalAccessor = accessors.push({ bufferView: normalView, componentType: 5126, count: vertexCount, type: 'VEC3' }) - 1;
    const indexComponentType = geometry.indexArray instanceof Uint16Array ? 5123 : 5125;
    const indexAccessor = accessors.push({ bufferView: indexView, componentType: indexComponentType, count: geometry.indexArray.length, type: 'SCALAR', min: [0], max: [vertexCount - 1] }) - 1;
    const suffix = String(componentIndex).padStart(3, '0');
    const name = `${path.basename(sourcePath, path.extname(sourcePath))}#component-${suffix}`;
    const mesh = meshes.push({ name, primitives: [{ attributes: { POSITION: positionAccessor, NORMAL: normalAccessor }, indices: indexAccessor, mode: 4 }], extras: { triangleCount: geometry.triangleCount } }) - 1;
    nodes.push({ name, mesh });
  });

  const binary = Buffer.concat(chunks.parts, chunks.total);
  const provenance = {
    converter: { id: CONVERTER_ID, version: CONVERTER_VERSION, node: '22.x' },
    source: {
      path: sourcePath,
      bytes: sourceBytes.byteLength,
      sha256: sha256(sourceBytes),
      gitBlobSha1: sourceGitBlobSha1 || gitBlobSha1(sourceBytes),
      stlFormat: parsed.format,
    },
    geometry: {
      triangleCount: parsed.triangleCount,
      componentCount: components.length,
      transformPolicy: 'identity-no-center-no-scale-no-rotation',
      normalPolicy: 'source-face-normal-normalized; computed only when source normal is zero/invalid',
      componentPolicy: 'connected-by-exact-float32-shared-vertex; stable first-triangle order',
    },
  };

  const gltf = {
    asset: { version: '2.0', generator: `${CONVERTER_ID}/${CONVERTER_VERSION}` },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, index) => index) }],
    nodes,
    meshes,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binary.byteLength }],
    extras: { yakolakConversion: provenance },
  };
  const jsonRaw = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPaddedLength = align4(jsonRaw.byteLength);
  const jsonChunk = Buffer.alloc(jsonPaddedLength, 0x20);
  jsonRaw.copy(jsonChunk);
  const binPaddedLength = align4(binary.byteLength);
  const binChunk = Buffer.alloc(binPaddedLength, 0);
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

  return {
    glb,
    provenance,
    outputSha256: sha256(glb),
    outputBytes: glb.byteLength,
  };
}
