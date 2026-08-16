import { Box3, Group, MathUtils, Mesh, Vector3 } from 'three';

export const PLAYER_BASE_SEAT_ORDER = Object.freeze(['right', 'back', 'left', 'front']);
export const PLAYER_BASE_COLOR_BY_SEAT = Object.freeze({
  right: 'marble',
  back: 'blue',
  left: 'gold',
  front: 'green',
});

function assertVec(actual, expected, label, epsilon = 1e-9) {
  if (!Array.isArray(actual) || actual.length !== expected.length || actual.some((value, index) => Math.abs(value - expected[index]) > epsilon)) {
    throw new Error(`${label} drift`);
  }
}

function applyAuthoritativeTransform(object, transform) {
  object.position.fromArray(transform.position);
  object.rotation.set(
    MathUtils.degToRad(transform.rotationDegrees[0]),
    MathUtils.degToRad(transform.rotationDegrees[1]),
    MathUtils.degToRad(transform.rotationDegrees[2]),
    'XYZ',
  );
  object.scale.set(1, 1, 1);
}

function requireGeometry(runtimeAsset, componentIndices) {
  return componentIndices.map((index) => {
    const component = runtimeAsset?.getComponent?.(index) || runtimeAsset?.components?.[index];
    if (!component?.geometry) throw new Error(`Player-base GLB is missing component ${index}`);
    return component;
  });
}

function validateAuthority(worldLayout) {
  if (!worldLayout?.identities || !worldLayout?.bases || !worldLayout?.homeStacks) {
    throw new TypeError('Player bases require authoritative world-layout identities, bases and homeStacks');
  }
  assertVec(worldLayout.turnRing, PLAYER_BASE_SEAT_ORDER, 'turnRing', 0);
  for (const seatId of PLAYER_BASE_SEAT_ORDER) {
    if (worldLayout.identities[seatId] !== PLAYER_BASE_COLOR_BY_SEAT[seatId]) {
      throw new Error(`Canonical seat/color mapping drift for ${seatId}`);
    }
    if (!worldLayout.bases[seatId]?.position || !worldLayout.bases[seatId]?.rotationDegrees) {
      throw new Error(`Missing authoritative base transform for ${seatId}`);
    }
    if (!Array.isArray(worldLayout.homeStacks[seatId]) || worldLayout.homeStacks[seatId].length !== 3) {
      throw new Error(`Missing authoritative home-stack centers for ${seatId}`);
    }
  }
}

function createSeatBase({ seatId, colorId, runtimeAsset, geometryLayout, transform, material }) {
  const base = new Group();
  base.name = `player-base:${seatId}`;
  base.userData.seatId = seatId;
  base.userData.colorId = colorId;
  base.userData.ownershipSource = 'world-layout.identities';
  applyAuthoritativeTransform(base, transform);

  const assetSpace = new Group();
  assetSpace.name = `player-base:${seatId}:asset-space`;
  assetSpace.position.fromArray(geometryLayout.geometry.assetPivot).multiplyScalar(-1);
  base.add(assetSpace);

  for (const component of requireGeometry(runtimeAsset, geometryLayout.geometry.componentIndices)) {
    const mesh = new Mesh(component.geometry, material);
    mesh.name = `player-base:${seatId}:${component.index}`;
    mesh.userData.seatId = seatId;
    mesh.userData.colorId = colorId;
    mesh.userData.assetComponentIndex = component.index;
    mesh.userData.ownershipSource = 'world-layout.identities';
    assetSpace.add(mesh);
  }

  return { base, assetSpace };
}

function distance(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.hypot(dx, dy, dz);
}

function roundedVec(vector) {
  return [vector.x, vector.y, vector.z];
}

export function createPlayerBaseInstances({ runtimeAsset, geometryLayout, worldLayout, materialsByColor } = {}) {
  if (runtimeAsset?.format !== 'yakolak-glb-components-v1') throw new TypeError('Player bases require deterministic GLB components');
  if (!geometryLayout?.geometry || geometryLayout.source?.componentCount !== 12) throw new TypeError('Player bases require verified player-base geometry metadata');
  if (geometryLayout.axisPolicy?.uniformScale !== 1 || geometryLayout.axisPolicy?.ownershipDerivedFromMeshPosition !== false) {
    throw new Error('Player-base geometry policy drift');
  }
  if (runtimeAsset.components?.length !== geometryLayout.source.componentCount) throw new Error('Player-base GLB component count drift');
  validateAuthority(worldLayout);

  const root = new Group();
  root.name = 'player-bases-runtime';
  const seats = new Map();

  for (const seatId of PLAYER_BASE_SEAT_ORDER) {
    const colorId = worldLayout.identities[seatId];
    const material = materialsByColor?.[colorId];
    if (!material) throw new TypeError(`Missing player-base material for canonical color ${colorId}`);
    const record = createSeatBase({
      seatId,
      colorId,
      runtimeAsset,
      geometryLayout,
      transform: worldLayout.bases[seatId],
      material,
    });
    seats.set(seatId, Object.freeze({ seatId, colorId, ...record }));
    root.add(record.base);
  }

  root.updateMatrixWorld(true);

  function getOwnershipSnapshot() {
    return Object.freeze(PLAYER_BASE_SEAT_ORDER.map((seatId) => Object.freeze({
      seatId,
      colorId: seats.get(seatId).colorId,
      source: 'world-layout.identities',
    })));
  }

  function getBoundsReport() {
    const sourceBounds = geometryLayout.geometry.sourceBounds;
    const corners = [];
    for (const x of [sourceBounds.min[0], sourceBounds.max[0]]) {
      for (const y of [sourceBounds.min[1], sourceBounds.max[1]]) {
        for (const z of [sourceBounds.min[2], sourceBounds.max[2]]) corners.push([x, y, z]);
      }
    }
    root.updateMatrixWorld(true);
    return Object.freeze(PLAYER_BASE_SEAT_ORDER.map((seatId) => {
      const { assetSpace } = seats.get(seatId);
      const box = new Box3();
      for (const corner of corners) box.expandByPoint(assetSpace.localToWorld(new Vector3(...corner)));
      return Object.freeze({
        seatId,
        min: Object.freeze(roundedVec(box.min)),
        max: Object.freeze(roundedVec(box.max)),
      });
    }));
  }

  function getHomeAlignmentReport() {
    root.updateMatrixWorld(true);
    return Object.freeze(PLAYER_BASE_SEAT_ORDER.map((seatId) => {
      const { assetSpace } = seats.get(seatId);
      const authoritative = worldLayout.homeStacks[seatId];
      const visual = geometryLayout.geometry.visualStackGroups.map((group) => {
        const point = roundedVec(assetSpace.localToWorld(new Vector3(...group.measuredSourceCenter)));
        const nearest = authoritative
          .map((homeCenter, homeIndex) => ({ homeIndex, homeCenter, error: distance(point, homeCenter) }))
          .sort((a, b) => a.error - b.error)[0];
        return Object.freeze({
          visualGroupId: group.id,
          worldCenter: Object.freeze(point),
          homeIndex: nearest.homeIndex,
          authoritativeCenter: Object.freeze([...nearest.homeCenter]),
          error: nearest.error,
        });
      });
      const uniqueHomes = new Set(visual.map((entry) => entry.homeIndex));
      const maxError = Math.max(...visual.map((entry) => entry.error));
      return Object.freeze({
        seatId,
        colorId: seats.get(seatId).colorId,
        visual: Object.freeze(visual),
        maxError,
        uniqueHomeCount: uniqueHomes.size,
        withinTolerance: uniqueHomes.size === 3 && maxError <= geometryLayout.geometry.homeAlignmentTolerance,
      });
    }));
  }

  function dispose() {
    // Geometry is AssetManager-owned and shared by all four bases. Materials are scene-owned.
    for (const { base, assetSpace } of seats.values()) {
      assetSpace.clear();
      base.clear();
    }
    root.clear();
    seats.clear();
  }

  return Object.freeze({
    root,
    seatOrder: PLAYER_BASE_SEAT_ORDER,
    getSeat: (seatId) => seats.get(seatId) || null,
    getOwnershipSnapshot,
    getBoundsReport,
    getHomeAlignmentReport,
    dispose,
  });
}
