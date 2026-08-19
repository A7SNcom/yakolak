import { Euler, Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { RESOURCE_KINDS, RESOURCE_OWNERSHIP } from '../core/resource-registry.js';
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
  return new Matrix4()
    .compose(new Vector3().fromArray(center), rotation, ONE)
    .multiply(new Matrix4().makeTranslation(-sourcePivot.x, -sourcePivot.y, -sourcePivot.z));
}

export function createPieceInstances({ runtimeAssetsBySize, worldLayout, approvedContract, materialsByColor, resourceRegistry } = {}) {
  if (!resourceRegistry?.createScope) throw new TypeError('Piece instances require the THREEJS-027 resource registry');
  const lifecycle = resourceRegistry.createScope('piece-instances', {
    ownership: RESOURCE_OWNERSHIP.GENERATION_SCOPED,
  });
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

  const renderSlotByPieceId = new Map();
  const meshByKey = new Map();
  const destinationByPieceId = new Map();

  try {
    for (const size of PIECE_SIZES) {
      for (const colorId of PIECE_COLOR_IDS) {
        const mesh = new InstancedMesh(
          resourceBySize.get(size).geometry,
          materialsByColor[colorId],
          PIECE_COPIES_PER_SIZE_PER_COLOR,
        );
        lifecycle.register(mesh, {
          kind: RESOURCE_KINDS.INSTANCED_MESH,
          label: `piece-instanced-mesh:${colorId}:${size}`,
        });
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
  } catch (error) {
    lifecycle.release('piece-instance-construction-failed');
    throw error;
  }

  lifecycle.registerCleanup(() => {
    root.clear();
    meshByKey.clear();
    renderSlotByPieceId.clear();
    destinationByPieceId.clear();
  }, { label: 'piece-instance-structure-release' });

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
    return syncPresentation(pieceId, catalog.getBoardDestination(cellId));
  }

  // Presentation-only read surface for state cues such as THREEJS-039. It exposes only
  // the exact live instance matrix/bounds plus immutable identity metadata. Canonical
  // materials and destination state are not exposed through this bridge.
  function getSelectionPresentationDescriptor(pieceId) {
    const piece = catalog.getPiece(pieceId);
    const slot = renderSlotByPieceId.get(pieceId);
    if (!piece || !slot) throw new TypeError(`Unknown logical piece ${pieceId}`);
    const matrix = new Matrix4();
    slot.mesh.getMatrixAt(slot.instanceIndex, matrix);
    const geometryResource = resourceBySize.get(piece.size);
    const geometry = geometryResource.geometry;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const presentationBounds = geometry.boundingSphere?.clone().applyMatrix4(matrix);
    const boundingRadius = Number(presentationBounds?.radius);
    // The source pivot is the exact anchor used by matrixAt(...). Transforming it through
    // the live instance matrix recovers the actual presentation anchor even after stack/
    // drag motion; bounding-sphere center is deliberately not used as a placement anchor.
    const presentationCenter = geometryResource.sourcePivot.clone().applyMatrix4(matrix).toArray();
    if (
      !Number.isFinite(boundingRadius)
      || boundingRadius <= 0
      || !Array.isArray(presentationCenter)
      || presentationCenter.length !== 3
      || presentationCenter.some(value => !Number.isFinite(value))
    ) {
      throw new Error(`Selected-piece geometry for ${piece.size} is missing finite live presentation bounds`);
    }
    return Object.freeze({
      pieceId: piece.id,
      colorId: piece.colorId,
      size: piece.size,
      copyIndex: piece.copyIndex,
      matrixElements: Object.freeze([...matrix.elements]),
      presentationCenter: Object.freeze(presentationCenter),
      boundingRadius,
      geometry,
      baseMaterialUuid: String(slot.mesh.material?.uuid || ''),
    });
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

  const release = () => lifecycle.release('piece-instances-released');
  return Object.freeze({
    root,
    pieceIds: catalog.pieceIds,
    logicalPieces: catalog.pieces,
    getLogicalPiece: (pieceId) => catalog.getPiece(pieceId),
    getSelectionPresentationDescriptor,
    syncPieceHome,
    syncPieceToBoard,
    getInstanceCounts,
    getPlacementSnapshot,
    release,
    dispose: release,
  });
}
