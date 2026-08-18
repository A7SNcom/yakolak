import * as THREE from 'three';
import { RESOURCE_KINDS, RESOURCE_OWNERSHIP } from '../core/resource-registry.js';
import {
  deriveAuthoritativeScoreLayout,
  deriveScoreMarkerContactPivot,
  deriveTableGameContactReport,
  parseAuthoritativeTableFootprint,
} from './table-score-layout.js';

function requireMaterial(material, label) {
  if (!material?.isMaterial) throw new TypeError(`${label} must be a Three.js Material`);
  return material;
}

function requireRegistry(resourceRegistry, label) {
  if (!resourceRegistry?.register || !resourceRegistry?.createScope) {
    throw new TypeError(`${label} requires the THREEJS-027 resource registry`);
  }
  return resourceRegistry;
}

function colorMaterial(approvedContract, colorId, resourceRegistry, scope = 'table-and-score') {
  const color = approvedContract?.materials?.palette?.[colorId];
  if (typeof color !== 'string' || !color) throw new Error(`Missing approved material color for ${colorId}`);
  return resourceRegistry.getOrCreateShared(`table-score-material:${colorId}`, () => new THREE.MeshStandardMaterial({ color }), {
    kind: RESOURCE_KINDS.MATERIAL,
    scope,
    label: `table-score:${colorId}`,
  });
}

export function createTableMaterial({ approvedContract, optionalMaps = {}, resourceRegistry } = {}) {
  const registry = requireRegistry(resourceRegistry, 'Table material');
  const material = colorMaterial(approvedContract, 'table', registry);
  const assignments = [
    ['map', optionalMaps.albedo],
    ['normalMap', optionalMaps.normal],
    ['roughnessMap', optionalMaps.roughness],
  ];
  for (const [property, texture] of assignments) {
    if (texture == null) continue;
    if (!texture.isTexture) throw new TypeError(`Optional table ${property} must be a Three.js Texture when supplied`);
    // Textures are asset-registry owned and shared; this material borrows them.
    material[property] = texture;
  }
  material.needsUpdate = true;
  return material;
}

export function createTableSurface({ footprintSvg, worldLayout, material, resourceRegistry } = {}) {
  const registry = requireRegistry(resourceRegistry, 'Table surface');
  const lifecycle = registry.createScope('table-surface', {
    ownership: RESOURCE_OWNERSHIP.GENERATION_SCOPED,
  });
  const tableMaterial = requireMaterial(material, 'Table material');
  const footprint = parseAuthoritativeTableFootprint(footprintSvg);
  const points = footprint.centeredPoints;
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index += 1) shape.lineTo(points[index][0], points[index][1]);
  shape.closePath();

  // The portable kit defines an exact top/contact height but no authoritative tabletop thickness.
  // Keep the runtime asset as the exact top surface instead of inventing a hidden vertical dimension.
  const geometry = new THREE.ShapeGeometry(shape);
  lifecycle.register(geometry, {
    kind: RESOURCE_KINDS.GEOMETRY,
    label: 'authoritative-table-shape',
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();
  const mesh = new THREE.Mesh(geometry, tableMaterial);
  mesh.name = 'YakolakTableSurface';
  mesh.position.set(0, Number(worldLayout?.room?.tableTopY), 0);
  mesh.receiveShadow = false;
  mesh.userData.authoritativeFootprint = footprint;
  mesh.userData.tableTopY = Number(worldLayout?.room?.tableTopY);
  mesh.userData.optionalMapsAffectGeometry = false;

  lifecycle.registerCleanup(() => mesh.removeFromParent(), {
    label: 'table-surface-detach',
  });

  const release = () => lifecycle.release('table-surface-released');
  return Object.freeze({
    mesh,
    geometry,
    footprint,
    tableTopY: mesh.position.y,
    release,
    dispose: release,
  });
}

export function createScoreMaterials(approvedContract, { resourceRegistry } = {}) {
  const registry = requireRegistry(resourceRegistry, 'Score materials');
  const colorIds = approvedContract?.rules?.colors;
  if (!Array.isArray(colorIds) || colorIds.length !== 4 || new Set(colorIds).size !== 4) {
    throw new Error('Approved contract must provide four unique playable color IDs');
  }
  return Object.freeze(Object.fromEntries(colorIds.map((colorId) => [colorId, colorMaterial(approvedContract, colorId, registry)])));
}

function materialFor(materialsByColor, colorId) {
  const material = materialsByColor instanceof Map ? materialsByColor.get(colorId) : materialsByColor?.[colorId];
  return requireMaterial(material, `Score material for ${colorId}`);
}

function scoreMarkerGeometry(runtimeAsset) {
  if (runtimeAsset?.format !== 'yakolak-glb-components-v1') {
    throw new Error(`Score marker runtime asset must be yakolak-glb-components-v1, got ${runtimeAsset?.format || 'missing'}`);
  }
  if (runtimeAsset.components?.length !== 1) throw new Error('Score marker runtime asset must contain exactly one geometry component');
  const geometry = runtimeAsset.components[0]?.geometry;
  if (!geometry?.isBufferGeometry) throw new Error('Score marker runtime asset is missing BufferGeometry');
  const sourceBounds = geometry.userData?.sourceBounds;
  if (!sourceBounds) throw new Error('Score marker geometry must preserve converter source bounds');
  return { geometry, sourceBounds, pivot: deriveScoreMarkerContactPivot(sourceBounds) };
}

function markerMatrix(position, pivot) {
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0, 'XYZ'));
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    quaternion,
    new THREE.Vector3(1, 1, 1),
  );
  return matrix.multiply(new THREE.Matrix4().makeTranslation(-pivot[0], -pivot[1], -pivot[2]));
}

export function createScoreMarkerInstances({ runtimeAsset, worldLayout, materialsByColor, resourceRegistry } = {}) {
  const registry = requireRegistry(resourceRegistry, 'Score marker instances');
  const lifecycle = registry.createScope('score-marker-instances', {
    ownership: RESOURCE_OWNERSHIP.GENERATION_SCOPED,
  });
  const { geometry, sourceBounds, pivot } = scoreMarkerGeometry(runtimeAsset);
  const layout = deriveAuthoritativeScoreLayout(worldLayout);
  const group = new THREE.Group();
  group.name = 'YakolakScoreMarkers';
  const records = [];
  const byColor = new Map();

  for (const seat of layout.seats) {
    const material = materialFor(materialsByColor, seat.colorId);
    const mesh = new THREE.InstancedMesh(geometry, material, seat.slots.length);
    lifecycle.register(mesh, {
      kind: RESOURCE_KINDS.INSTANCED_MESH,
      label: `score-marker-instanced-mesh:${seat.seatId}`,
    });
    mesh.name = `YakolakScore:${seat.seatId}:${seat.colorId}`;
    mesh.count = 0;
    mesh.userData.seatId = seat.seatId;
    mesh.userData.colorId = seat.colorId;
    mesh.userData.capacity = seat.slots.length;
    mesh.userData.authoritativeSlots = seat.slots;
    for (const slot of seat.slots) mesh.setMatrixAt(slot.index, markerMatrix(slot.position, pivot));
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    const record = Object.freeze({ seatId: seat.seatId, colorId: seat.colorId, mesh, slots: seat.slots });
    records.push(record);
    byColor.set(seat.colorId, record);
  }

  function setScore(colorId, value) {
    const record = byColor.get(colorId);
    if (!record) throw new RangeError(`Unknown score color ${colorId}`);
    const score = Number(value);
    if (!Number.isInteger(score) || score < 0 || score > record.slots.length) {
      throw new RangeError(`Score for ${colorId} must be an integer from 0 to ${record.slots.length}`);
    }
    record.mesh.count = score;
    return score;
  }

  function setScores(scoresByColor = {}) {
    for (const record of records) setScore(record.colorId, scoresByColor[record.colorId] ?? 0);
  }

  function snapshot() {
    return Object.freeze({
      sourceBounds,
      sourceContactPivot: pivot,
      geometrySharedAcrossSeats: records.every((record) => record.mesh.geometry === geometry),
      scoreLayout: layout,
      seats: Object.freeze(records.map((record) => Object.freeze({
        seatId: record.seatId,
        colorId: record.colorId,
        count: record.mesh.count,
        capacity: record.slots.length,
        geometryUuid: record.mesh.geometry.uuid,
        materialUuid: record.mesh.material.uuid,
      }))),
    });
  }

  lifecycle.registerCleanup(() => {
    group.removeFromParent();
    group.clear();
    // Geometry is owned by the decoded asset cache; materials are owned by the caller.
  }, { label: 'score-marker-detach' });

  const release = () => lifecycle.release('score-marker-instances-released');
  return Object.freeze({
    group,
    layout,
    geometry,
    sourceBounds,
    pivot,
    records: Object.freeze(records),
    setScore,
    setScores,
    snapshot,
    release,
    dispose: release,
  });
}

export function createTableAndScoreContactReport({ worldLayout, boardLayout } = {}) {
  return deriveTableGameContactReport({ worldLayout, boardLayout });
}
