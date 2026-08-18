import { BufferAttribute, BufferGeometry } from 'three';

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

const COMPONENT_ARRAYS = Object.freeze({
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
});
const TYPE_WIDTH = Object.freeze({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 });

function requireRange(bytes, offset, length, label) {
  if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length < 0 || offset + length > bytes.byteLength) {
    throw new Error(`Invalid GLB ${label} range`);
  }
}

function parseChunks(bytes) {
  if (bytes.byteLength < 20) throw new Error('GLB is too small');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('Invalid GLB magic');
  if (view.getUint32(4, true) !== 2) throw new Error('Only glTF 2.0 GLB is supported');
  if (view.getUint32(8, true) !== bytes.byteLength) throw new Error('GLB declared length mismatch');

  let offset = 12;
  let json = null;
  let binaryOffset = null;
  let binaryLength = null;
  while (offset < bytes.byteLength) {
    requireRange(bytes, offset, 8, 'chunk header');
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    offset += 8;
    requireRange(bytes, offset, length, 'chunk');
    if (type === JSON_CHUNK) {
      if (json) throw new Error('GLB contains duplicate JSON chunks');
      json = JSON.parse(new TextDecoder().decode(bytes.subarray(offset, offset + length)).trim());
    } else if (type === BIN_CHUNK) {
      if (binaryOffset !== null) throw new Error('GLB contains duplicate BIN chunks');
      binaryOffset = offset;
      binaryLength = length;
    }
    offset += length;
  }
  if (!json || binaryOffset === null) throw new Error('GLB requires JSON and BIN chunks');
  return { json, binaryOffset, binaryLength };
}

function accessorArray(bytes, gltf, binaryOffset, accessorIndex) {
  const accessor = gltf.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`Missing GLB accessor ${accessorIndex}`);
  if (accessor.byteOffset) throw new Error('Converter GLB accessors must not use byteOffset');
  const bufferView = gltf.bufferViews?.[accessor.bufferView];
  if (!bufferView || bufferView.buffer !== 0) throw new Error(`Invalid GLB bufferView for accessor ${accessorIndex}`);
  if (bufferView.byteStride) throw new Error('Interleaved converter GLB is not supported');
  const ArrayType = COMPONENT_ARRAYS[accessor.componentType];
  const width = TYPE_WIDTH[accessor.type];
  if (!ArrayType || !width) throw new Error(`Unsupported GLB accessor type ${accessor.componentType}/${accessor.type}`);
  const scalarCount = accessor.count * width;
  const byteLength = scalarCount * ArrayType.BYTES_PER_ELEMENT;
  if (byteLength > bufferView.byteLength) throw new Error(`Accessor ${accessorIndex} exceeds its bufferView`);
  const start = bytes.byteOffset + binaryOffset + (bufferView.byteOffset || 0);
  return { accessor, array: new ArrayType(bytes.buffer, start, scalarCount), width };
}

export function decodeGlbComponents(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const { json: gltf, binaryOffset, binaryLength } = parseChunks(bytes);
  if (gltf.asset?.version !== '2.0') throw new Error('GLB asset version must be 2.0');
  if (gltf.buffers?.length !== 1 || gltf.buffers[0].byteLength > binaryLength) throw new Error('Unexpected GLB buffer layout');

  const components = [];
  for (const [nodeIndex, node] of (gltf.nodes || []).entries()) {
    if (!Number.isInteger(node.mesh)) continue;
    if (node.matrix || node.translation || node.rotation || node.scale) throw new Error(`GLB component node ${nodeIndex} contains a hidden transform`);
    const mesh = gltf.meshes?.[node.mesh];
    if (!mesh || mesh.primitives?.length !== 1) throw new Error(`GLB mesh ${node.mesh} must contain exactly one primitive`);
    const primitive = mesh.primitives[0];
    if ((primitive.mode ?? 4) !== 4) throw new Error('Only triangle primitives are supported');
    const position = accessorArray(bytes, gltf, binaryOffset, primitive.attributes?.POSITION);
    const normal = accessorArray(bytes, gltf, binaryOffset, primitive.attributes?.NORMAL);
    const index = accessorArray(bytes, gltf, binaryOffset, primitive.indices);
    if (position.width !== 3 || normal.width !== 3 || index.width !== 1) throw new Error('Unexpected converter GLB attribute widths');
    if (position.accessor.count !== normal.accessor.count) throw new Error('Position/normal vertex count mismatch');

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(position.array, 3));
    geometry.setAttribute('normal', new BufferAttribute(normal.array, 3));
    geometry.setIndex(new BufferAttribute(index.array, 1));
    if (position.accessor.min && position.accessor.max) {
      geometry.userData.sourceBounds = Object.freeze({
        min: Object.freeze([...position.accessor.min]),
        max: Object.freeze([...position.accessor.max]),
      });
    }
    const match = /#component-(\d+)$/.exec(node.name || mesh.name || '');
    if (!match) throw new Error(`Converter GLB mesh node lacks stable component name: ${node.name || nodeIndex}`);
    components.push(Object.freeze({
      index: Number(match[1]),
      name: node.name,
      triangleCount: mesh.extras?.triangleCount ?? index.accessor.count / 3,
      geometry,
    }));
  }
  components.sort((a, b) => a.index - b.index);
  for (let index = 0; index < components.length; index += 1) {
    if (components[index].index !== index) throw new Error(`GLB component sequence gap at ${index}`);
  }

  const provenance = Object.freeze({ ...(gltf.extras?.yakolakConversion || {}) });
  const geometryProvenance = provenance.geometry || {};
  if (Number.isInteger(geometryProvenance.componentCount) && geometryProvenance.componentCount !== components.length) {
    throw new Error(`GLB provenance/component count mismatch: ${geometryProvenance.componentCount}/${components.length}`);
  }
  const semanticGroups = Object.freeze([...(geometryProvenance.semanticGroups || geometryProvenance.semanticRoots || [])]);

  // THREEJS-027: the decoder creates geometry, but ownership is adopted immediately
  // by the asset manager's root resource registry. This aggregate has no disposer.
  return Object.freeze({
    format: 'yakolak-glb-components-v1',
    components: Object.freeze(components),
    provenance,
    semanticProfile: geometryProvenance.semanticProfile || null,
    semanticGroups,
    semanticRoots: semanticGroups,
    sourcePivot: geometryProvenance.sourcePivot ? Object.freeze([...geometryProvenance.sourcePivot]) : null,
    getComponent: (index) => components[index] || null,
  });
}
