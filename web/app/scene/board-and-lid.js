import { Group, Mesh, MathUtils, Vector3 } from 'three';
import { registerRenderedBoardCellCenters } from '../gameplay/rendered-hit-transforms.js';

function applyTransform(object, transform) {
  object.position.fromArray(transform.position);
  object.rotation.set(
    MathUtils.degToRad(transform.rotationDegrees[0]),
    MathUtils.degToRad(transform.rotationDegrees[1]),
    MathUtils.degToRad(transform.rotationDegrees[2]),
  );
  object.scale.fromArray(transform.scale);
  if ('visible' in transform) object.visible = transform.visible;
}

function sameIndices(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function sameVector(actual, expected, epsilon = 1e-5) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => Math.abs(value - expected[index]) <= epsilon);
}

function validateSemanticContract(runtimeAsset, layout) {
  if (runtimeAsset?.semanticProfile !== layout.semanticProfile) {
    throw new Error(`Board/lid semantic profile mismatch: ${runtimeAsset?.semanticProfile || 'missing'} / ${layout.semanticProfile}`);
  }
  if (!sameVector(runtimeAsset.sourcePivot, layout.board.assetPivot) || !sameVector(layout.lid.assetPivot, layout.board.assetPivot)) {
    throw new Error('Board/lid source pivot drift');
  }
  const groups = runtimeAsset.semanticGroups || [];
  const boardGroup = groups.find((group) => group.semanticRole === 'board' || group.name === layout.board.semanticNode);
  const lidGroup = groups.find((group) => group.semanticRole === 'intro-lid' || group.name === layout.lid.semanticNode);
  if (!boardGroup || !sameIndices(boardGroup.componentIndices, layout.board.componentIndices)) throw new Error('Board semantic component mapping drift');
  if (!lidGroup || !sameIndices(lidGroup.componentIndices, layout.lid.componentIndices)) throw new Error('Intro lid semantic component mapping drift');
}

function requireComponents(runtimeAsset, indices, label) {
  return indices.map((index) => {
    const component = runtimeAsset?.getComponent?.(index) || runtimeAsset?.components?.[index];
    if (!component?.geometry) throw new Error(`${label} is missing GLB component ${index}`);
    return component;
  });
}

function createAddressableObject(name, runtimeAsset, indices, pivot, material) {
  const root = new Group();
  root.name = name;
  const assetSpace = new Group();
  assetSpace.name = `${name}:asset-space`;
  assetSpace.position.set(-pivot[0], -pivot[1], -pivot[2]);
  root.add(assetSpace);

  for (const component of requireComponents(runtimeAsset, indices, name)) {
    const mesh = new Mesh(component.geometry, material);
    mesh.name = component.name;
    mesh.userData.assetComponentIndex = component.index;
    assetSpace.add(mesh);
  }
  return root;
}

export function createBoardAndLidObjects({ runtimeAsset, layout, boardMaterial, lidMaterial = boardMaterial } = {}) {
  if (runtimeAsset?.format !== 'yakolak-glb-components-v1') throw new TypeError('Board/lid runtime requires deterministic GLB components');
  if (!layout?.board || !layout?.lid) throw new TypeError('Board/lid runtime requires verified layout metadata');
  if (!boardMaterial || !lidMaterial) throw new TypeError('Board/lid runtime requires presentation materials supplied by the scene');
  validateSemanticContract(runtimeAsset, layout);

  const root = new Group();
  root.name = 'board-and-lid-runtime';

  const board = createAddressableObject('board', runtimeAsset, layout.board.componentIndices, layout.board.assetPivot, boardMaterial);
  const lid = createAddressableObject('intro-lid', runtimeAsset, layout.lid.componentIndices, layout.lid.assetPivot, lidMaterial);
  applyTransform(board, layout.board.finalTransform);
  applyTransform(lid, layout.lid.introStartTransform);
  root.add(board, lid);

  root.updateMatrixWorld(true);
  const boardAssetSpace = board.getObjectByName('board:asset-space');
  if (!boardAssetSpace) throw new Error('Board rendered asset-space is missing');
  const renderedCellCenters = layout.board.cellVisualGroups.map((cell) => {
    const sourceX = Number(cell?.measuredSourceCenterXY?.[0]);
    const sourceY = Number(cell?.measuredSourceCenterXY?.[1]);
    const sourceZ = Number(cell?.authoritativeWorldCenter?.[1]);
    if (![sourceX, sourceY, sourceZ].every(Number.isFinite)) throw new Error(`Board cell ${cell?.cellId} rendered center provenance is invalid`);
    const center = new Vector3(sourceX, sourceY, sourceZ).applyMatrix4(boardAssetSpace.matrixWorld).toArray();
    return Object.freeze({ cellId: cell.cellId, center: Object.freeze(center) });
  });
  const releaseRenderedBoardCellCenters = registerRenderedBoardCellCenters(renderedCellCenters);

  function setLidPhase(phase) {
    const transform = phase === 'intro-start'
      ? layout.lid.introStartTransform
      : phase === 'intro-lifted'
        ? layout.lid.introLiftedTransform
        : phase === 'post-intro'
          ? layout.lid.postIntroFinal
          : null;
    if (!transform) throw new TypeError(`Unknown lid phase: ${phase}`);
    applyTransform(lid, transform);
  }

  function getRuleCellCenters() {
    return Object.freeze(layout.board.cellVisualGroups.map((cell) => Object.freeze([...cell.authoritativeWorldCenter])));
  }

  function getRenderedCellCenters() {
    return Object.freeze(renderedCellCenters.map((cell) => Object.freeze([...cell.center])));
  }

  function getVisualAlignmentReport() {
    return Object.freeze(layout.board.cellVisualGroups.map((cell) => Object.freeze({
      cellId: cell.cellId,
      visualXZDeltaFromRuleCenter: Object.freeze([...cell.visualXZDeltaFromRuleCenter]),
      withinTolerance: Math.max(...cell.visualXZDeltaFromRuleCenter.map(Math.abs)) <= layout.board.visualCenterVerificationTolerance,
    })));
  }

  function dispose() {
    // Geometry is owned/disposed by AssetManager; materials are scene-owned and may be shared.
    releaseRenderedBoardCellCenters();
    root.clear();
    board.clear();
    lid.clear();
  }

  return Object.freeze({
    root,
    board,
    lid,
    setLidPhase,
    getRuleCellCenters,
    getRenderedCellCenters,
    getVisualAlignmentReport,
    dispose,
  });
}
