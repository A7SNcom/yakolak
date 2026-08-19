import {
  ConeGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import { RESOURCE_KINDS, RESOURCE_OWNERSHIP } from '../core/resource-registry.js';
import { deriveGameplayInteractionTargets } from '../gameplay/interaction-targets.js';
import { assertCanonicalSessionState } from '../session/canonical-session-state.js';

export const LAST_MOVE_MARKER_VISUAL_POLICY = Object.freeze({
  markerKind: 'last-accepted-move-pointer',
  shape: 'inverted-pyramid',
  colorIndependent: true,
  usesRing: false,
  usesPieceOutline: false,
  usesWinningHighlight: false,
  markerLift: 18,
  radius: 5,
  height: 8,
  radialSegments: 4,
  sizeScale: Object.freeze({
    small: 0.82,
    medium: 1,
    large: 1.18,
  }),
});

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function witnessFromState(state) {
  assertCanonicalSessionState(state);
  return deepFreeze({
    generation: state.lifecycle.presentationGeneration,
    revision: state.revision,
    round: state.round,
  });
}

function isOlderWitness(next, current) {
  if (!current) return false;
  return next.generation < current.generation
    || next.revision < current.revision
    || next.round < current.round;
}

function requireWorldLayout(worldLayout) {
  if (!worldLayout || typeof worldLayout !== 'object') fail('last_move_world_layout_required');
  return worldLayout;
}

function requireParent(parent) {
  if (!parent?.add || !parent?.remove) fail('last_move_marker_parent_required');
  return parent;
}

function requireRegistry(resourceRegistry) {
  if (!resourceRegistry?.createScope) fail('last_move_resource_registry_required');
  return resourceRegistry;
}

function requireRenderRequest(requestRender) {
  if (typeof requestRender !== 'function') fail('last_move_render_request_required');
  return requestRender;
}

function moveIdentity(state) {
  const move = state.lastMove;
  return `revision:${state.revision}|round:${state.round}|move:${move.seatId}:${move.color}:${move.cell}:${move.size}`;
}

export function deriveLastMoveMarkerModel(state, { worldLayout } = {}) {
  assertCanonicalSessionState(state);
  const layout = deriveGameplayInteractionTargets(requireWorldLayout(worldLayout));
  const witness = witnessFromState(state);

  if (state.lastMove === null) return null;
  const move = state.lastMove;
  const boardCell = state.board?.[String(move.cell)];
  if (!boardCell || boardCell[move.size] !== move.color) fail('last_move_board_mismatch');

  const zone = layout.zones.find(candidate => candidate.cellId === move.cell);
  if (!zone) fail('last_move_target_missing');
  const scale = LAST_MOVE_MARKER_VISUAL_POLICY.sizeScale[move.size];
  if (!Number.isFinite(scale)) fail('last_move_size_scale_missing');

  return deepFreeze({
    markerKind: LAST_MOVE_MARKER_VISUAL_POLICY.markerKind,
    shape: LAST_MOVE_MARKER_VISUAL_POLICY.shape,
    colorIndependent: true,
    moveIdentity: moveIdentity(state),
    generation: witness.generation,
    revision: witness.revision,
    round: witness.round,
    seatId: move.seatId,
    color: move.color,
    cell: move.cell,
    size: move.size,
    targetId: zone.id,
    boardCenter: zone.center,
    position: [
      zone.center[0],
      zone.center[1] + LAST_MOVE_MARKER_VISUAL_POLICY.markerLift,
      zone.center[2],
    ],
    scale,
  });
}

function configureMaterial(material, cueRole) {
  material.depthTest = true;
  material.depthWrite = false;
  material.toneMapped = false;
  material.userData.presentationOnly = true;
  material.userData.lastMoveMarkerCue = cueRole;
  return material;
}

export function createLastMoveMarkerPresentation({
  parent,
  worldLayout,
  resourceRegistry,
  requestRender,
} = {}) {
  const markerParent = requireParent(parent);
  const canonicalWorldLayout = requireWorldLayout(worldLayout);
  const registry = requireRegistry(resourceRegistry);
  const renderRequest = requireRenderRequest(requestRender);
  const lifecycle = registry.createScope('last-move-marker', {
    ownership: RESOURCE_OWNERSHIP.GENERATION_SCOPED,
  });

  const root = new Group();
  root.name = 'last-accepted-move-marker';
  root.visible = false;
  root.userData.presentationOnly = true;
  root.userData.markerKind = LAST_MOVE_MARKER_VISUAL_POLICY.markerKind;
  root.userData.moveIdentity = null;

  const geometry = new ConeGeometry(
    LAST_MOVE_MARKER_VISUAL_POLICY.radius,
    LAST_MOVE_MARKER_VISUAL_POLICY.height,
    LAST_MOVE_MARKER_VISUAL_POLICY.radialSegments,
  );
  lifecycle.register(geometry, {
    kind: RESOURCE_KINDS.GEOMETRY,
    label: 'last-move-inverted-pyramid-geometry',
  });
  const edgesGeometry = new EdgesGeometry(geometry, 15);
  lifecycle.register(edgesGeometry, {
    kind: RESOURCE_KINDS.GEOMETRY,
    label: 'last-move-inverted-pyramid-edges',
  });

  const fillMaterial = configureMaterial(new MeshBasicMaterial({ color: 0xf4f0e6 }), 'pointer-fill');
  const edgeMaterial = configureMaterial(new LineBasicMaterial({ color: 0x171717 }), 'pointer-edge');
  lifecycle.register(fillMaterial, {
    kind: RESOURCE_KINDS.MATERIAL_VARIANT,
    label: 'last-move-pointer-fill-material',
  });
  lifecycle.register(edgeMaterial, {
    kind: RESOURCE_KINDS.MATERIAL_VARIANT,
    label: 'last-move-pointer-edge-material',
  });

  const pointer = new Mesh(geometry, fillMaterial);
  pointer.name = 'last-move:pointer-fill';
  pointer.rotation.z = Math.PI;
  pointer.renderOrder = 850;
  pointer.userData.markerKind = LAST_MOVE_MARKER_VISUAL_POLICY.markerKind;
  const pointerEdges = new LineSegments(edgesGeometry, edgeMaterial);
  pointerEdges.name = 'last-move:pointer-edge';
  pointerEdges.rotation.z = Math.PI;
  pointerEdges.renderOrder = 851;
  pointerEdges.userData.markerKind = LAST_MOVE_MARKER_VISUAL_POLICY.markerKind;
  root.add(pointer, pointerEdges);
  markerParent.add(root);

  let latestWitness = null;
  let current = null;
  let renderRequestCount = 0;
  let released = false;

  lifecycle.registerCleanup(() => {
    markerParent.remove(root);
    root.clear();
  }, { label: 'last-move-marker-detach' });

  function requestImmediateRender() {
    renderRequestCount += 1;
    renderRequest();
  }

  function applySnapshot(state) {
    if (released) fail('last_move_marker_released');
    const witness = witnessFromState(state);
    if (isOlderWitness(witness, latestWitness)) fail('stale_last_move_snapshot');
    const model = deriveLastMoveMarkerModel(state, { worldLayout: canonicalWorldLayout });
    latestWitness = witness;

    if (model === null) {
      const wasVisible = root.visible || current !== null;
      root.visible = false;
      root.userData.moveIdentity = null;
      current = null;
      if (wasVisible) requestImmediateRender();
      return snapshot();
    }

    root.position.fromArray(model.position);
    root.scale.setScalar(model.scale);
    root.userData.moveIdentity = model.moveIdentity;
    root.visible = true;
    current = model;
    requestImmediateRender();
    return snapshot();
  }

  function snapshot() {
    return deepFreeze({
      visible: root.visible,
      markerKind: LAST_MOVE_MARKER_VISUAL_POLICY.markerKind,
      shape: LAST_MOVE_MARKER_VISUAL_POLICY.shape,
      moveIdentity: current?.moveIdentity || null,
      targetId: current?.targetId || null,
      cell: current?.cell ?? null,
      size: current?.size || null,
      moveRevision: current?.revision ?? null,
      authorityWitness: latestWitness,
      logicalMarkerCount: root.visible && current ? 1 : 0,
      renderPrimitiveCount: root.visible && current ? 2 : 0,
      colorIndependent: true,
      usesRing: false,
      usesPieceOutline: false,
      usesWinningHighlight: false,
      renderRequestCount,
    });
  }

  function release() {
    if (released) return false;
    released = true;
    current = null;
    latestWitness = null;
    root.visible = false;
    root.userData.moveIdentity = null;
    lifecycle.release('last-move-marker-released');
    return true;
  }

  // Deliberately expose no clear(reason) API. Authority clears the marker only by
  // delivering a canonical snapshot whose lastMove is null.
  return Object.freeze({
    root,
    applySnapshot,
    snapshot,
    release,
    dispose: release,
  });
}
