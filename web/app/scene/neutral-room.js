import * as THREE from 'three';
import { createResourceRegistry, RESOURCE_KINDS, RESOURCE_OWNERSHIP } from '../core/resource-registry.js';
import { deriveNeutralRoomLayout } from './room-layout.js';

function createOwnedMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0,
    roughness: 1,
    side: THREE.FrontSide,
  });
}

function addSurface(root, id, geometry, material, position, rotation) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `room-${id}`;
  mesh.position.fromArray(position);
  mesh.rotation.set(...rotation);
  mesh.userData.roomSurface = id;
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  root.add(mesh);
  return mesh;
}

export function createNeutralRoom({
  worldLayout,
  approvedContract,
  roomSpecText,
  wallMaterial = null,
  floorMaterial = null,
  resourceRegistry = null,
} = {}) {
  const layout = deriveNeutralRoomLayout({ worldLayout, approvedContract, roomSpecText });
  const ownsRegistry = !resourceRegistry;
  const registry = resourceRegistry || createResourceRegistry();
  const lifecycle = registry.createScope('neutral-room', {
    ownership: RESOURCE_OWNERSHIP.GENERATION_SCOPED,
  });
  const { bounds, dimensions } = layout;
  const root = new THREE.Group();
  root.name = 'neutral-room-runtime';

  const horizontalGeometry = new THREE.PlaneGeometry(dimensions.width, dimensions.depth, 1, 1);
  const verticalGeometry = new THREE.PlaneGeometry(dimensions.width, dimensions.height, 1, 1);
  lifecycle.register(horizontalGeometry, { kind: RESOURCE_KINDS.GEOMETRY, label: 'room-horizontal-planes' });
  lifecycle.register(verticalGeometry, { kind: RESOURCE_KINDS.GEOMETRY, label: 'room-vertical-planes' });

  const ownsWallMaterial = !wallMaterial;
  const ownsFloorMaterial = !floorMaterial;
  const resolvedWallMaterial = wallMaterial || createOwnedMaterial(layout.palette.wall);
  const resolvedFloorMaterial = floorMaterial || createOwnedMaterial(layout.palette.floor);
  if (ownsWallMaterial) lifecycle.register(resolvedWallMaterial, { kind: RESOURCE_KINDS.MATERIAL, label: 'room-wall-material' });
  if (ownsFloorMaterial) lifecycle.register(resolvedFloorMaterial, { kind: RESOURCE_KINDS.MATERIAL, label: 'room-floor-material' });

  const centerX = layout.center[0];
  const centerY = layout.center[1];
  const centerZ = layout.center[2];
  const halfPi = Math.PI / 2;

  const surfaces = Object.freeze({
    floor: addSurface(root, 'floor', horizontalGeometry, resolvedFloorMaterial,
      [centerX, bounds.floorY, centerZ], [-halfPi, 0, 0]),
    ceiling: addSurface(root, 'ceiling', horizontalGeometry, resolvedWallMaterial,
      [centerX, bounds.ceilingY, centerZ], [halfPi, 0, 0]),
    back: addSurface(root, 'back', verticalGeometry, resolvedWallMaterial,
      [centerX, centerY, bounds.backZ], [0, 0, 0]),
    front: addSurface(root, 'front', verticalGeometry, resolvedWallMaterial,
      [centerX, centerY, bounds.frontZ], [0, Math.PI, 0]),
    left: addSurface(root, 'left', verticalGeometry, resolvedWallMaterial,
      [bounds.minX, centerY, centerZ], [0, halfPi, 0]),
    right: addSurface(root, 'right', verticalGeometry, resolvedWallMaterial,
      [bounds.maxX, centerY, centerZ], [0, -halfPi, 0]),
  });
  surfaces.front.visible = layout.frontWallVisibleDefault;

  const backContentAnchor = new THREE.Group();
  backContentAnchor.name = 'room-content-back';
  backContentAnchor.position.fromArray(layout.wallContent.back.position);
  root.add(backContentAnchor);

  const rightContentAnchor = new THREE.Group();
  rightContentAnchor.name = 'room-content-right';
  rightContentAnchor.position.fromArray(layout.wallContent.right.position);
  rightContentAnchor.rotation.y = -halfPi;
  root.add(rightContentAnchor);

  const contentAnchors = Object.freeze({ back: backContentAnchor, right: rightContentAnchor });
  let disposed = false;

  lifecycle.registerCleanup(() => root.remove(...Object.values(surfaces), ...Object.values(contentAnchors)), {
    label: 'neutral-room-detach',
  });

  function setFrontWallVisibility(visible) {
    if (disposed) return false;
    surfaces.front.visible = Boolean(visible);
    return surfaces.front.visible;
  }

  function getRuntimeSnapshot() {
    const surfaceBounds = {};
    for (const id of layout.surfaceIds) {
      const box = new THREE.Box3().setFromObject(surfaces[id]);
      surfaceBounds[id] = Object.freeze({
        min: Object.freeze(box.min.toArray()),
        max: Object.freeze(box.max.toArray()),
        visible: surfaces[id].visible,
      });
    }
    return Object.freeze({
      bounds: layout.bounds,
      dimensions: layout.dimensions,
      surfaceBounds: Object.freeze(surfaceBounds),
      frontWallVisible: surfaces.front.visible,
      wallContentInset: layout.wallContent.inset,
      cameraValidation: layout.cameraValidation,
      voidSafety: layout.voidSafety,
    });
  }

  function release() {
    if (disposed) return;
    disposed = true;
    lifecycle.release('neutral-room-released');
    if (ownsRegistry) registry.dispose('neutral-room-owned-registry-released');
  }

  return Object.freeze({
    root,
    layout,
    surfaces,
    contentAnchors,
    materials: Object.freeze({ wall: resolvedWallMaterial, floor: resolvedFloorMaterial }),
    geometries: Object.freeze({ horizontal: horizontalGeometry, vertical: verticalGeometry }),
    setFrontWallVisibility,
    getRuntimeSnapshot,
    release,
    dispose: release,
  });
}
