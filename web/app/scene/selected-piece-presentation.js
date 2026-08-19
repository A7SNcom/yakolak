import {
  BufferGeometry,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
} from 'three';
import { RESOURCE_KINDS, RESOURCE_OWNERSHIP } from '../core/resource-registry.js';
import { assertCanonicalSessionState } from '../session/canonical-session-state.js';
import {
  COLORS,
  RULES,
  SIZES,
  deriveRemainingInventoryFromState,
  validatePlacementForSeat,
} from '../shared/rules.js';

export const SELECTED_PIECE_CLEAR_REASONS = Object.freeze([
  'cancel',
  'accepted-submit',
  'rejected-submit',
  'turn-change',
  'seat-change',
  'reconnect-hydration',
  'timeout',
  'round-reset',
]);

export const SELECTED_PIECE_VISUAL_POLICY = Object.freeze({
  primaryCue: 'geometry-outline',
  secondaryCue: 'double-halo-ring',
  colorIndependent: true,
  hueOnlyAllowed: false,
  brightnessOnlyAllowed: false,
  filledOverlay: false,
  outlineDepthTest: false,
  haloRadiusScaleInner: 1.18,
  haloRadiusScaleOuter: 1.34,
  haloLiftRatio: 0.05,
  haloMinLift: 0.8,
  ringSegments: 64,
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

function parsePieceId(pieceId) {
  const match = /^piece:([^:]+):([^:]+):(\d+)$/.exec(String(pieceId || ''));
  if (!match) fail('invalid_selected_piece_id');
  const colorId = match[1];
  const size = match[2];
  const copyNumber = Number(match[3]);
  if (!COLORS.includes(colorId)) fail('invalid_selected_piece_color');
  if (!SIZES.includes(size)) fail('invalid_selected_piece_size');
  if (!Number.isInteger(copyNumber) || copyNumber < 1 || copyNumber > RULES.copiesPerSizePerColor) {
    fail('invalid_selected_piece_copy');
  }
  return deepFreeze({
    pieceId: `piece:${colorId}:${size}:${copyNumber}`,
    colorId,
    size,
    copyNumber,
    copyIndex: copyNumber - 1,
  });
}

function witnessFromState(state) {
  assertCanonicalSessionState(state);
  return deepFreeze({
    generation: state.lifecycle.presentationGeneration,
    revision: state.revision,
    round: state.round,
    activeSeatId: state.activeSeatId,
  });
}

function isOlderWitness(next, current) {
  if (!current) return false;
  return next.generation < current.generation || next.revision < current.revision;
}

function sameWitness(left, right) {
  return Boolean(left && right)
    && left.generation === right.generation
    && left.revision === right.revision
    && left.round === right.round
    && left.activeSeatId === right.activeSeatId;
}

export function deriveSelectedPieceEligibility(state, pieceId) {
  assertCanonicalSessionState(state);
  if (state.lifecycle.phase !== 'turn-loop') fail('selected_piece_requires_turn_loop');
  if (state.lifecycle.interrupt !== null) fail('selected_piece_requires_uninterrupted_turn');
  if (state.activeSeatId === null) fail('selected_piece_requires_active_seat');

  const parsed = parsePieceId(pieceId);
  const seat = state.seats.find(candidate => candidate.seatId === state.activeSeatId);
  if (!seat) fail('selected_piece_active_seat_missing');
  if (seat.color !== parsed.colorId) fail('selected_piece_not_owned_by_active_seat');

  const derivedInventory = deriveRemainingInventoryFromState(state);
  const canonicalRemaining = state.inventory?.[seat.seatId]?.[parsed.size];
  const derivedRemaining = derivedInventory?.[seat.seatId]?.[parsed.size];
  if (!Number.isInteger(canonicalRemaining) || canonicalRemaining !== derivedRemaining) {
    fail('selected_piece_inventory_drift');
  }
  if (parsed.copyIndex >= canonicalRemaining) fail('selected_piece_copy_not_remaining');

  const legalCells = [];
  for (let cell = 0; cell < RULES.cellCount; cell += 1) {
    const validation = validatePlacementForSeat(state, seat.seatId, {
      cell,
      size: parsed.size,
    });
    if (validation.ok) legalCells.push(cell);
  }
  if (legalCells.length === 0) fail('selected_piece_has_no_legal_destination');

  return deepFreeze({
    ...parsed,
    seatId: seat.seatId,
    remainingCount: canonicalRemaining,
    legalCells,
    witness: witnessFromState(state),
  });
}

function requirePieceInstances(pieceInstances) {
  if (
    !pieceInstances?.root?.add
    || !pieceInstances?.root?.remove
    || typeof pieceInstances.getSelectionPresentationDescriptor !== 'function'
  ) fail('selected_piece_instances_required');
  return pieceInstances;
}

function requireRegistry(resourceRegistry) {
  if (!resourceRegistry?.createScope) fail('selected_piece_resource_registry_required');
  return resourceRegistry;
}

function requireRenderRequest(requestRender) {
  if (typeof requestRender !== 'function') fail('selected_piece_render_request_required');
  return requestRender;
}

function createUnitRingGeometry(segments) {
  const positions = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = index / segments * Math.PI * 2;
    positions.push(Math.cos(angle), 0, Math.sin(angle));
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return geometry;
}

function configureLineMaterial(material, cueRole) {
  material.depthTest = SELECTED_PIECE_VISUAL_POLICY.outlineDepthTest;
  material.depthWrite = false;
  material.transparent = true;
  material.opacity = 0.96;
  material.toneMapped = false;
  material.userData.presentationOnly = true;
  material.userData.selectedPieceCue = cueRole;
  material.userData.filledOverlay = false;
  return material;
}

function requireDescriptor(descriptor, eligibility) {
  if (!descriptor || descriptor.pieceId !== eligibility.pieceId) fail('selected_piece_descriptor_mismatch');
  if (descriptor.colorId !== eligibility.colorId || descriptor.size !== eligibility.size || descriptor.copyIndex !== eligibility.copyIndex) {
    fail('selected_piece_descriptor_identity_drift');
  }
  if (!descriptor.geometry?.isBufferGeometry) fail('selected_piece_geometry_required');
  if (!Array.isArray(descriptor.matrixElements) || descriptor.matrixElements.length !== 16) fail('selected_piece_matrix_required');
  if (
    !Array.isArray(descriptor.presentationCenter)
    || descriptor.presentationCenter.length !== 3
    || descriptor.presentationCenter.some(value => !Number.isFinite(value))
  ) fail('selected_piece_presentation_center_required');
  if (!Number.isFinite(descriptor.boundingRadius) || descriptor.boundingRadius <= 0) fail('selected_piece_bounding_radius_required');
  if (typeof descriptor.baseMaterialUuid !== 'string' || !descriptor.baseMaterialUuid) fail('selected_piece_base_material_identity_required');
  return descriptor;
}

function requireClearReason(reason) {
  if (!SELECTED_PIECE_CLEAR_REASONS.includes(reason)) fail('invalid_selected_piece_clear_reason');
  return reason;
}

export function createSelectedPiecePresentation({
  pieceInstances,
  resourceRegistry,
  requestRender,
} = {}) {
  const pieces = requirePieceInstances(pieceInstances);
  const registry = requireRegistry(resourceRegistry);
  const renderRequest = requireRenderRequest(requestRender);
  const lifecycle = registry.createScope('selected-piece-presentation', {
    ownership: RESOURCE_OWNERSHIP.GENERATION_SCOPED,
  });

  const root = new Group();
  root.name = 'selected-piece-emphasis';
  root.visible = false;
  root.userData.presentationOnly = true;
  root.userData.selectedPiecePresentation = true;
  root.userData.selectedPieceId = null;
  pieces.root.add(root);

  const brightMaterial = configureLineMaterial(new LineBasicMaterial({ color: 0xffffff }), 'outline-bright');
  const darkMaterial = configureLineMaterial(new LineBasicMaterial({ color: 0x111111 }), 'halo-dark');
  lifecycle.register(brightMaterial, {
    kind: RESOURCE_KINDS.MATERIAL_VARIANT,
    label: 'selected-piece-outline-material',
  });
  lifecycle.register(darkMaterial, {
    kind: RESOURCE_KINDS.MATERIAL_VARIANT,
    label: 'selected-piece-halo-material',
  });

  const ringGeometry = createUnitRingGeometry(SELECTED_PIECE_VISUAL_POLICY.ringSegments);
  lifecycle.register(ringGeometry, {
    kind: RESOURCE_KINDS.GEOMETRY,
    label: 'selected-piece-halo-ring-geometry',
  });

  const haloOuter = new LineLoop(ringGeometry, darkMaterial);
  haloOuter.name = 'selected-piece:halo-outer';
  haloOuter.renderOrder = 1000;
  haloOuter.userData.selectedPieceCue = 'halo-outer';
  const haloInner = new LineLoop(ringGeometry, brightMaterial);
  haloInner.name = 'selected-piece:halo-inner';
  haloInner.renderOrder = 1001;
  haloInner.userData.selectedPieceCue = 'halo-inner';
  root.add(haloOuter, haloInner);

  const edgeGeometryBySource = new Map();
  let outline = null;
  let current = null;
  let latestWitness = null;
  let renderRequestCount = 0;
  let released = false;

  lifecycle.registerCleanup(() => {
    pieces.root.remove(root);
    root.clear();
    edgeGeometryBySource.clear();
  }, { label: 'selected-piece-presentation-detach' });

  function getEdges(sourceGeometry) {
    const key = sourceGeometry.uuid;
    let edges = edgeGeometryBySource.get(key);
    if (!edges) {
      edges = new EdgesGeometry(sourceGeometry, 20);
      edgeGeometryBySource.set(key, edges);
      lifecycle.register(edges, {
        kind: RESOURCE_KINDS.GEOMETRY,
        label: `selected-piece-edges:${key}`,
      });
    }
    return edges;
  }

  function ensureOutline(sourceGeometry) {
    const edges = getEdges(sourceGeometry);
    if (!outline) {
      outline = new LineSegments(edges, brightMaterial);
      outline.name = 'selected-piece:outline';
      outline.matrixAutoUpdate = false;
      outline.renderOrder = 1002;
      outline.userData.selectedPieceCue = 'geometry-outline';
      root.add(outline);
    } else {
      outline.geometry = edges;
    }
    return outline;
  }

  function publishRender() {
    renderRequestCount += 1;
    renderRequest();
  }

  function applyDescriptor(descriptor) {
    const selectedOutline = ensureOutline(descriptor.geometry);
    selectedOutline.matrix.fromArray(descriptor.matrixElements);
    selectedOutline.matrixWorldNeedsUpdate = true;

    const radius = descriptor.boundingRadius;
    const lift = Math.max(
      SELECTED_PIECE_VISUAL_POLICY.haloMinLift,
      radius * SELECTED_PIECE_VISUAL_POLICY.haloLiftRatio,
    );
    haloInner.position.set(
      descriptor.presentationCenter[0],
      descriptor.presentationCenter[1] + lift,
      descriptor.presentationCenter[2],
    );
    haloOuter.position.copy(haloInner.position);
    haloInner.scale.setScalar(radius * SELECTED_PIECE_VISUAL_POLICY.haloRadiusScaleInner);
    haloOuter.scale.setScalar(radius * SELECTED_PIECE_VISUAL_POLICY.haloRadiusScaleOuter);
  }

  function select(state, pieceId) {
    if (released) fail('selected_piece_presentation_released');
    const eligibility = deriveSelectedPieceEligibility(state, pieceId);
    if (isOlderWitness(eligibility.witness, latestWitness)) fail('stale_selected_piece_snapshot');
    if (current && !sameWitness(eligibility.witness, current.witness)) {
      fail('selected_piece_requires_boundary_clear');
    }
    const descriptor = requireDescriptor(
      pieces.getSelectionPresentationDescriptor(eligibility.pieceId),
      eligibility,
    );

    applyDescriptor(descriptor);
    current = deepFreeze({
      pieceId: eligibility.pieceId,
      colorId: eligibility.colorId,
      size: eligibility.size,
      copyIndex: eligibility.copyIndex,
      seatId: eligibility.seatId,
      legalCells: eligibility.legalCells,
      witness: eligibility.witness,
      baseMaterialUuid: descriptor.baseMaterialUuid,
    });
    latestWitness = eligibility.witness;
    root.userData.selectedPieceId = current.pieceId;
    root.visible = true;
    publishRender();
    return snapshot();
  }

  function refresh(state) {
    if (!current) return snapshot();
    const eligibility = deriveSelectedPieceEligibility(state, current.pieceId);
    if (isOlderWitness(eligibility.witness, latestWitness)) fail('stale_selected_piece_snapshot');
    if (!sameWitness(eligibility.witness, current.witness)) fail('selected_piece_refresh_requires_same_witness');
    const descriptor = requireDescriptor(
      pieces.getSelectionPresentationDescriptor(current.pieceId),
      eligibility,
    );
    applyDescriptor(descriptor);
    publishRender();
    return snapshot();
  }

  function clear(reason, { state = null } = {}) {
    requireClearReason(reason);
    let nextWitness = latestWitness;
    if (state !== null) {
      const candidateWitness = witnessFromState(state);
      if (isOlderWitness(candidateWitness, latestWitness)) fail('stale_selected_piece_clear');
      nextWitness = candidateWitness;
    }

    latestWitness = nextWitness;
    if (!current) return false;

    root.visible = false;
    root.userData.selectedPieceId = null;
    current = null;
    publishRender();
    return true;
  }

  function reconcileCanonical({ state, reason } = {}) {
    assertCanonicalSessionState(state);
    return clear(reason, { state });
  }

  function snapshot() {
    return deepFreeze({
      selectedPieceId: current?.pieceId || null,
      selectedColorId: current?.colorId || null,
      selectedSize: current?.size || null,
      witness: current?.witness || null,
      authorityWitness: latestWitness,
      visible: root.visible,
      selectedLogicalObjectCount: root.visible && current ? 1 : 0,
      emphasisRenderPrimitiveCount: root.visible && current ? 3 : 0,
      neighborMaterialMutationCount: 0,
      baseMaterialUuid: current?.baseMaterialUuid || null,
      primaryCue: SELECTED_PIECE_VISUAL_POLICY.primaryCue,
      secondaryCue: SELECTED_PIECE_VISUAL_POLICY.secondaryCue,
      colorIndependent: true,
      filledOverlay: false,
      renderRequestCount,
    });
  }

  function release() {
    if (released) return false;
    released = true;
    current = null;
    root.visible = false;
    root.userData.selectedPieceId = null;
    lifecycle.release('selected-piece-presentation-released');
    return true;
  }

  return Object.freeze({
    root,
    select,
    refresh,
    clear,
    reconcileCanonical,
    snapshot,
    release,
    dispose: release,
  });
}
