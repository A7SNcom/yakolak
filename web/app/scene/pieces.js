import { Euler, Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import {
  PIECE_COLOR_IDS,
  PIECE_COPIES_PER_SIZE_PER_COLOR,
  PIECE_INSTANCES_PER_SIZE,
  PIECE_SIZES,
  PIECE_TOTAL_INSTANCES,
  createLogicalPieceCatalog,
} from './piece-layout.js';

const ONE = new Vector3(1, 1, 1);

function requireSharedGeometry(runtimeAsset, size) {
  if (runtimeAsset?.format !== 'yakolak-glb-components-v1') throw new TypeError(`${size} pieces require deterministic GLB components`);
  if (runtimeAsset.components?.length !== 1) throw new Error(`${size} piece GLB must contain exactly one geometry component`);
  const geometry = runtimeAsset.getComponent?.(0)?.geometry || runtimeAsset.components[0]?.geometry;
  if (!geometry) throw new Error(`${size} piece GLB is missing component 0 geometry`);
  const bounds = geometry.userData?.sourceBounds;
  if (!bounds?.min || !bounds?.max) throw new Error(`${size} piece GLB is missing source bounds provenance`);

  const sourcePivot = new Vector3(
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    bounds.min[2],
  );
  if (![sourcePivot.x, sourcePivot.y, sourcePivot.z].every(Number.isFinite)) {
    throw new Error(`${size} piece GLB has invalid source pivot bounds`);
  }
  return Object.freeze({ geometry, sourcePivot });
}

function quaternionFor(rotationDegrees) {
  const euler = new Euler(
    rotationDegrees[0] * Math.PI / 180,
    rotationDegrees[1] * Math.PI / 180,
    rotationDegrees[2] * Math.PI / 180,
    'XYZ',
  );
  return new Quaternion().setFromEuler(euler);
}

function matrixAt(center, rotation, sourcePivot) {
  // One asset-level pivot correction per canonical size: T(center) * R * T(-sourcePivot).
  // It is derived from immutable GLB source bounds, never from a logical piece or destination.
  return new Matrix4()
    .compose(new Vector3().fromArray(center), rotation, ONE)
    .multiply(new Matrix4().makeTranslation(-sourcePivot.x, -sourcePivot.y, -sourcePivot.z));
}

export function createPieceInstances({ runtimeAssetsBySize, worldLayout, approvedContract, materialsByColor } = {}) {
  const catalog = createLogicalPieceCatalog({ worldLayout, approvedContract });
  const rotation = quaternionFor(catalog.rotationDegrees);
  const resourceBySize = new Map();
  for (const size of PIECE_SIZES) resourceBySize.set(size, requireSharedGeometry(runtimeAssetsBySize?.[size], size));
  for (const colorId of PIECE_COLOR_IDS) {
    if (!materialsByColor?.[colorId]) throw new TypeError(`Missing shared piece material for canonical color ${colorId}`);
  }

  const root = new Group();
  root.name = 'pieces-runtime';
  root.userData.presentationOnly = true;

  // Render slots are intentionally private. Logical piece identity lives in piece-layout.js
  // and remains stable even if these meshes are rebuilt or their instance ordering changes.
  const renderSlotByPieceId = new Map();
  const meshByKey = new Map();
  const destinationByPieceId = new Map();

  for (const size of PIECE_SIZES) {
    for (const colorId of PIECE_COLOR_IDS) {
      const mesh = new InstancedMesh(
        resourceBySize.get(size).geometry,
        materialsByColor[colorId],
        PIECE_COPIES_PER_SIZE_PER_COLOR,
      );
      mesh.name = `pieces:${colorId}:${size}`;
      mesh.userData.presentationOnly = true;
      mesh.userData.size = size;
      mesh.userData.colorId = colorId;
      meshByKey.set(`${colorId}:${size}`, mesh);
      root.add(mesh);
    }
  }

  for (const piece of catalog.pieces) {
    const mesh = meshByKey.get(`${piece.colorId}:${piece.size}`);
    const instanceIndex = piece.copyIndex;
    renderSlotByPieceId.set(piece.id, { mesh, instanceIndex });
    const destination = catalog.getHomeDestination(piece.id);
    destinationByPieceId.set(piece.id, destination);
    mesh.setMatrixAt(instanceIndex, matrixAt(destination.center, rotation, resourceBySize.get(piece.size).sourcePivot));
  }

  for (const mesh of meshByKey.values()) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }

  function syncPresentation(pieceId, destination) {
    const piece = catalog.getPiece(pieceId);
    const slot = renderSlotByPieceId.get(pieceId);
    if (!piece || !slot) throw new TypeError(`Unknown logical piece ${pieceId}`);
    slot.mesh.setMatrixAt(slot.instanceIndex, matrixAt(destination.center, rotation, resourceBySize.get(piece.size).sourcePivot));
    slot.mesh.instanceMatrix.needsUpdate = true;
    slot.mesh.computeBoundingSphere();
    destinationByPieceId.set(pieceId, destination);
    return piece;
  }

  function syncPieceHome(pieceId) {
    return syncPresentation(pieceId, catalog.getHomeDestination(pieceId));
  }

  function syncPieceToBoard(pieceId, cellId) {
    // This is presentation reconciliation only. Rules/authority must decide whether
    // a move is legal before calling it; rendering never claims or mutates a board slot.
    return syncPresentation(pieceId, catalog.getBoardDestination(cellId));
  }

  function getInstanceCounts() {
    const bySize = Object.fromEntries(PIECE_SIZES.map((size) => [size, 0]));
    for (const piece of catalog.pieces) bySize[piece.size] += 1;
    return Object.freeze({
      bySize: Object.freeze(bySize),
      total: catalog.pieces.length,
      renderMeshes: meshByKey.size,
      instancesPerSize: PIECE_INSTANCES_PER_SIZE,
      totalExpected: PIECE_TOTAL_INSTANCES,
    });
  }

  function getPlacementSnapshot() {
    return Object.freeze(catalog.pieces.map((piece) => {
      const destination = destinationByPieceId.get(piece.id);
      return Object.freeze({
        pieceId: piece.id,
        colorId: piece.colorId,
        size: piece.size,
        copyIndex: piece.copyIndex,
        destination,
      });
    }));
  }

  function dispose() {
    // Geometry is AssetManager-owned and shared by all colors of a size.
    // Materials are scene-owned and shared by all sizes of a color.
    root.clear();
    meshByKey.clear();
    renderSlotByPieceId.clear();
    destinationByPieceId.clear();
  }

  return Object.freeze({
    root,
    pieceIds: catalog.pieceIds,
    logicalPieces: catalog.pieces,
    getLogicalPiece: (pieceId) => catalog.getPiece(pieceId),
    syncPieceHome,
    syncPieceToBoard,
    getInstanceCounts,
    getPlacementSnapshot,
    dispose,
  });
}
