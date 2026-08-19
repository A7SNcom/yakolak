import * as THREE from 'three';
import { RESOURCE_KINDS, RESOURCE_OWNERSHIP } from '../core/resource-registry.js';
import {
  GAMEPLAY_INTERACTION_LAYER,
  createInteractionStateStore,
  deriveGameplayInteractionTargets,
} from '../gameplay/interaction-targets.js';

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function requireRegistry(resourceRegistry) {
  if (!resourceRegistry?.createScope) fail('interaction_resource_registry_required');
  return resourceRegistry;
}

function finiteTriple(value, code) {
  if (!Array.isArray(value) || value.length !== 3) fail(code);
  const triple = value.map(Number);
  if (triple.some(number => !Number.isFinite(number))) fail(code);
  return triple;
}

function positiveTriple(value, code) {
  const triple = finiteTriple(value, code);
  if (triple.some(number => number <= 0)) fail(code);
  return triple;
}

function targetMatrix(center, scale = [1, 1, 1]) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...center),
    new THREE.Quaternion(),
    new THREE.Vector3(...scale),
  );
}

function createInstancedTargets({ descriptors, geometry, material, label, lifecycle }) {
  const mesh = new THREE.InstancedMesh(geometry, material, descriptors.length);
  mesh.name = label;
  mesh.layers.set(GAMEPLAY_INTERACTION_LAYER);
  mesh.frustumCulled = false;
  mesh.userData.interactionProxy = true;
  mesh.userData.targetIds = descriptors.map(target => target.id);
  descriptors.forEach((target, instanceId) => mesh.setMatrixAt(instanceId, targetMatrix(target.center)));
  mesh.instanceMatrix.needsUpdate = true;
  lifecycle.register(mesh, {
    kind: RESOURCE_KINDS.INSTANCED_MESH,
    label,
  });
  return mesh;
}

function descriptorDistanceSq(descriptor, point) {
  const dx = point.x - descriptor.center[0];
  const dz = point.z - descriptor.center[2];
  return dx * dx + dz * dz;
}

export function createGameplayInteractionLayer({
  worldLayout,
  resourceRegistry,
} = {}) {
  const registry = requireRegistry(resourceRegistry);
  const layout = deriveGameplayInteractionTargets(worldLayout);
  const lifecycle = registry.createScope('gameplay-interaction-layer', {
    ownership: RESOURCE_OWNERSHIP.GENERATION_SCOPED,
  });

  const root = new THREE.Group();
  root.name = 'gameplay-interaction-layer';
  root.layers.set(GAMEPLAY_INTERACTION_LAYER);
  root.userData.interactionOnly = true;
  root.userData.visiblePresentation = false;

  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    colorWrite: false,
    toneMapped: false,
  });
  lifecycle.register(material, {
    kind: RESOURCE_KINDS.MATERIAL,
    label: 'interaction-proxy-invisible-material',
  });

  const zoneGeometry = new THREE.CylinderGeometry(
    layout.boardZoneTouchRadius,
    layout.boardZoneTouchRadius,
    layout.zones[0].height,
    24,
    1,
    false,
  );
  const stackGeometry = new THREE.CylinderGeometry(
    layout.stackTouchRadius,
    layout.stackTouchRadius,
    layout.stacks[0].height,
    20,
    1,
    false,
  );
  const controlGeometry = new THREE.BoxGeometry(1, 1, 1);
  lifecycle.register(zoneGeometry, { kind: RESOURCE_KINDS.GEOMETRY, label: 'interaction-zone-cylinder' });
  lifecycle.register(stackGeometry, { kind: RESOURCE_KINDS.GEOMETRY, label: 'interaction-stack-cylinder' });
  lifecycle.register(controlGeometry, { kind: RESOURCE_KINDS.GEOMETRY, label: 'interaction-control-unit-box' });

  const zoneMesh = createInstancedTargets({
    descriptors: layout.zones,
    geometry: zoneGeometry,
    material,
    label: 'interaction-zones',
    lifecycle,
  });
  const stackMesh = createInstancedTargets({
    descriptors: layout.stacks,
    geometry: stackGeometry,
    material,
    label: 'interaction-piece-stacks',
    lifecycle,
  });
  root.add(zoneMesh, stackMesh);

  const descriptorById = new Map(layout.targets.map(target => [target.id, target]));
  const state = createInteractionStateStore(layout.targets);
  const controlMeshes = new Map();

  function addControlTarget({ id, center, size } = {}) {
    if (typeof id !== 'string' || !id.startsWith('control:') || descriptorById.has(id)) fail('invalid_control_interaction_id');
    const normalizedCenter = finiteTriple(center, 'invalid_control_interaction_center');
    const normalizedSize = positiveTriple(size, 'invalid_control_interaction_size');
    const descriptor = Object.freeze({
      id,
      kind: 'control',
      center: Object.freeze(normalizedCenter),
      size: Object.freeze(normalizedSize),
    });
    const mesh = new THREE.Mesh(controlGeometry, material);
    mesh.name = `interaction-${id}`;
    mesh.layers.set(GAMEPLAY_INTERACTION_LAYER);
    mesh.position.fromArray(normalizedCenter);
    mesh.scale.fromArray(normalizedSize);
    mesh.userData.interactionProxy = true;
    mesh.userData.targetId = id;
    root.add(mesh);
    descriptorById.set(id, descriptor);
    controlMeshes.set(id, mesh);
    state.register(id);
    return descriptor;
  }

  function removeControlTarget(id) {
    const mesh = controlMeshes.get(id);
    if (!mesh) return false;
    mesh.removeFromParent();
    controlMeshes.delete(id);
    descriptorById.delete(id);
    state.unregister(id);
    return true;
  }

  function descriptorForIntersection(hit) {
    if (hit.object === zoneMesh && Number.isInteger(hit.instanceId)) return layout.zones[hit.instanceId] || null;
    if (hit.object === stackMesh && Number.isInteger(hit.instanceId)) return layout.stacks[hit.instanceId] || null;
    const targetId = hit.object?.userData?.targetId;
    return typeof targetId === 'string' ? descriptorById.get(targetId) || null : null;
  }

  function raycast(raycaster) {
    if (!raycaster || typeof raycaster.intersectObject !== 'function' || !raycaster.layers) fail('interaction_raycaster_required');
    root.updateMatrixWorld(true);
    const previousMask = raycaster.layers.mask;
    raycaster.layers.set(GAMEPLAY_INTERACTION_LAYER);
    let hits;
    try {
      hits = raycaster.intersectObject(root, true);
    } finally {
      raycaster.layers.mask = previousMask;
    }

    const candidates = [];
    const seen = new Set();
    for (const hit of hits) {
      const descriptor = descriptorForIntersection(hit);
      if (!descriptor || seen.has(descriptor.id)) continue;
      seen.add(descriptor.id);
      candidates.push({
        descriptor,
        hit,
        centerDistanceSq: descriptorDistanceSq(descriptor, hit.point),
      });
    }
    candidates.sort((left, right) => (
      left.centerDistanceSq - right.centerDistanceSq
      || left.hit.distance - right.hit.distance
      || left.descriptor.id.localeCompare(right.descriptor.id)
    ));
    const winner = candidates[0];
    if (!winner) return null;
    return Object.freeze({
      target: winner.descriptor,
      point: Object.freeze(winner.hit.point.toArray()),
      distance: winner.hit.distance,
      candidateCount: candidates.length,
    });
  }

  function setTargetState(targetId, patch) {
    return state.set(targetId, patch);
  }

  function getTargetState(targetId) {
    return state.get(targetId);
  }

  function snapshot() {
    return Object.freeze({
      layer: GAMEPLAY_INTERACTION_LAYER,
      zoneProxyCount: layout.zones.length,
      stackProxyCount: layout.stacks.length,
      controlProxyCount: controlMeshes.size,
      raycastRoots: Object.freeze([zoneMesh.name, stackMesh.name, ...[...controlMeshes.values()].map(mesh => mesh.name)]),
      zoneGeometryShared: zoneMesh.geometry === zoneGeometry,
      stackGeometryShared: stackMesh.geometry === stackGeometry,
      invisibleMaterialShared: zoneMesh.material === material && stackMesh.material === material,
      materialOpacity: material.opacity,
      materialColorWrite: material.colorWrite,
      states: state.snapshot(),
      visiblePresentationMutation: false,
    });
  }

  lifecycle.registerCleanup(() => {
    root.removeFromParent();
    root.clear();
    controlMeshes.clear();
    descriptorById.clear();
  }, { label: 'gameplay-interaction-layer-structure-release' });

  const release = () => lifecycle.release('gameplay-interaction-layer-released');
  return Object.freeze({
    root,
    layout,
    zoneMesh,
    stackMesh,
    addControlTarget,
    removeControlTarget,
    raycast,
    setTargetState,
    getTargetState,
    snapshot,
    release,
    dispose: release,
  });
}
