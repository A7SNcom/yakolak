import { Group, Mesh, MathUtils } from 'three';

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

  const root = new Group();
  root.name = 'board-and-lid-runtime';

  const board = createAddressableObject('board', runtimeAsset, layout.board.componentIndices, layout.board.assetPivot, boardMaterial);
  const lid = createAddressableObject('intro-lid', runtimeAsset, layout.lid.componentIndices, layout.lid.assetPivot, lidMaterial);
  applyTransform(board, layout.board.finalTransform);
  applyTransform(lid, layout.lid.introStartTransform);
  root.add(board, lid);

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

  function getVisualAlignmentReport() {
    return Object.freeze(layout.board.cellVisualGroups.map((cell) => Object.freeze({
      cellId: cell.cellId,
      visualXZDeltaFromRuleCenter: Object.freeze([...cell.visualXZDeltaFromRuleCenter]),
      withinTolerance: Math.max(...cell.visualXZDeltaFromRuleCenter.map(Math.abs)) <= layout.board.visualCenterVerificationTolerance,
    })));
  }

  function dispose() {
    // Geometry is owned/disposed by AssetManager; materials are scene-owned and may be shared.
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
    getVisualAlignmentReport,
    dispose,
  });
}
