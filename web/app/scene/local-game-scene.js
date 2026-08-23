import * as THREE from 'three';
import { createFrameGovernor } from '../camera/frame-governor.js';
import { RESOURCE_OWNERSHIP } from '../core/resource-registry.js';
import { assertFastplayState, createFastplayInitialState } from '../fastplay/local-match-config.js';
import { createAcceptedPieceTravelController } from '../gameplay/accepted-piece-travel.js';
import { createComputerTurnProducer } from '../gameplay/computer-turn.js';
import { createDragInteractionController, DRAG_PHASES } from '../gameplay/drag-interaction.js';
import {
  GAMEPLAY_AUTHORITY_ADAPTERS,
  GAMEPLAY_PRESENTATION_SOURCES,
  createGameplayIntent,
} from '../gameplay/gameplay-intent.js';
import { createMotionController } from '../gameplay/motion-controller.js';
import { createPointerEventsAdapter } from '../gameplay/pointer-events-adapter.js';
import { createSizeSelectionController } from '../gameplay/size-selection.js';
import { createTapClickConfirmationController, TAP_CONFIRMATION_PHASES } from '../gameplay/tap-click-confirmation.js';
import { markOnce, STARTUP_MARKS } from '../perf/startup-marks.js';
import { createLocalAuthorityAdapter } from '../session/local-authority-adapter.js';
import { commitCanonicalMatchEnd, createLocalRematchRequest } from '../session/match-end.js';
import { createExpiredLocalTimeoutIntent } from '../session/local-timeout.js';
import { createBoardAndLidObjects } from './board-and-lid.js';
import { createGameplayInteractionLayer } from './gameplay-interaction-layer.js';
import { createMinimalLightingRig, createTurnEmphasisPresentation } from './lighting-rig.js';
import { createNeutralRoom } from './neutral-room.js';
import { createPieceInstances } from './pieces.js';
import { createPlayerBaseInstances } from './player-bases.js';
import { syncPersistentScoreMarkerInstances } from './score-marker-presentation.js';
import { createScoreMarkerInstances, createTableSurface } from './table-and-score.js';

const LOCAL_GAME_SCHEMA = 'yakolak.fastplay-local-scene/v1';
const isOnlineSeatType = type => type === 'online-human';
const isComputerSeatType = type => type === 'computer';
const isHumanSeatType = type => !isComputerSeatType(type) && !isOnlineSeatType(type);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function requireRendererOwner(rendererOwner) {
  if (!rendererOwner?.canvas || !rendererOwner?.render || !rendererOwner?.resizeToDisplaySize) fail('local_game_renderer_owner_required');
  return rendererOwner;
}

function requireRegistry(resourceRegistry) {
  if (!resourceRegistry?.createScope) fail('local_game_resource_registry_required');
  return resourceRegistry;
}

function requireAsset(value, label) {
  if (value == null) fail(`local_game_asset_missing:${label}`);
  return value;
}

async function loadJson(relativeUrl, label) {
  const response = await fetch(new URL(relativeUrl, import.meta.url), { cache: 'force-cache' });
  if (!response.ok) throw new Error(`${label} metadata failed: HTTP ${response.status}`);
  return response.json();
}

function choosePlayCamera(worldLayout) {
  const width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
  const height = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
  const aspect = width / height;
  const cameraId = aspect < 0.78
    ? 'playPortrait2'
    : width < 820
      ? 'playCompact'
      : 'playDesktop';
  const spec = worldLayout?.cameras?.[cameraId] || worldLayout?.cameras?.playDesktop;
  if (!spec) fail('local_game_play_camera_missing');
  return { cameraId, spec };
}

function applyCameraSpec(camera, spec) {
  camera.position.fromArray(spec.position);
  camera.fov = Number(spec.fov);
  camera.lookAt(new THREE.Vector3(...spec.target));
  camera.updateProjectionMatrix();
}

function degreesToQuaternion(rotationDegrees) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(rotationDegrees[0]),
    THREE.MathUtils.degToRad(rotationDegrees[1]),
    THREE.MathUtils.degToRad(rotationDegrees[2]),
    'XYZ',
  ));
}

function sourcePivotForMesh(mesh) {
  const bounds = mesh.geometry?.userData?.sourceBounds;
  if (!bounds?.min || !bounds?.max) fail('local_game_piece_source_bounds_missing');
  return new THREE.Vector3(
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    bounds.min[2],
  );
}

function matrixForTransform(transform, pivot) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...transform.position),
    degreesToQuaternion(transform.rotationDegrees),
    new THREE.Vector3(...transform.scale),
  );
  return matrix.multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
}

function freezeTransform(position, rotationDegrees) {
  return Object.freeze({
    position: Object.freeze([...position]),
    rotationDegrees: Object.freeze([...rotationDegrees]),
    scale: Object.freeze([1, 1, 1]),
  });
}

function intentSource(pointerType) {
  return pointerType === 'mouse' ? GAMEPLAY_PRESENTATION_SOURCES.CLICK : GAMEPLAY_PRESENTATION_SOURCES.TAP;
}

export async function createLocalGameScene(rendererOwnerInput, {
  runtimeData,
  worldLayout,
  approvedContract,
  roomSpecText,
  assets,
  materialSystem,
  resourceRegistry,
  gameConfig = null,
  initialState: suppliedInitialState = null,
} = {}) {
  const rendererOwner = requireRendererOwner(rendererOwnerInput);
  const registry = requireRegistry(resourceRegistry);
  if (!runtimeData || !worldLayout || !approvedContract || !materialSystem) fail('local_game_canonical_inputs_required');

  const lifecycle = registry.createScope('fastplay-local-game-scene', {
    ownership: RESOURCE_OWNERSHIP.GENERATION_SCOPED,
  });
  const [boardLayout, playerBaseLayout] = await Promise.all([
    loadJson('../../assets/models/board-and-lid-layout.json', 'board-and-lid'),
    loadJson('../../assets/models/player-base-layout.json', 'player-base'),
  ]);

  const scene = new THREE.Scene();
  scene.name = 'YAKOLAKLocalGameScene';
  scene.background = new THREE.Color(runtimeData.materials.palette.wall);

  const selectedCamera = choosePlayCamera(worldLayout);
  const camera = new THREE.PerspectiveCamera(selectedCamera.spec.fov, 1, 0.1, 8000);
  camera.name = `yakolak:${selectedCamera.cameraId}`;
  applyCameraSpec(camera, selectedCamera.spec);

  const lighting = createMinimalLightingRig({ runtimeData });
  const turnEmphasis = createTurnEmphasisPresentation({ materialSystem });
  scene.add(lighting.root);

  const room = createNeutralRoom({
    worldLayout,
    approvedContract,
    roomSpecText,
    wallMaterial: materialSystem.getSurfaceMaterial('wall'),
    floorMaterial: materialSystem.getSurfaceMaterial('floor'),
    resourceRegistry: registry,
  });
  room.setFrontWallVisibility(false);
  scene.add(room.root);

  const table = createTableSurface({
    footprintSvg: requireAsset(assets?.tableFootprint, 'tableFootprint'),
    worldLayout,
    material: materialSystem.getSurfaceMaterial('table'),
    resourceRegistry: registry,
  });
  scene.add(table.mesh);

  const scoreMarkers = createScoreMarkerInstances({
    runtimeAsset: requireAsset(assets?.scoreMarker, 'scoreMarker'),
    worldLayout,
    materialsByColor: materialSystem.players,
    resourceRegistry: registry,
  });
  scene.add(scoreMarkers.group);

  const boardAndLid = createBoardAndLidObjects({
    runtimeAsset: requireAsset(assets?.boardAndLid, 'boardAndLid'),
    layout: boardLayout,
    boardMaterial: materialSystem.getSurfaceMaterial('board'),
  });
  boardAndLid.setLidPhase('post-intro');
  scene.add(boardAndLid.root);

  const playerBases = createPlayerBaseInstances({
    runtimeAsset: requireAsset(assets?.playerBase, 'playerBase'),
    geometryLayout: playerBaseLayout,
    worldLayout,
    materialsByColor: materialSystem.players,
  });
  scene.add(playerBases.root);

  const pieces = createPieceInstances({
    runtimeAssetsBySize: {
      small: requireAsset(assets?.pieceSmall, 'pieceSmall'),
      medium: requireAsset(assets?.pieceMedium, 'pieceMedium'),
      large: requireAsset(assets?.pieceLarge, 'pieceLarge'),
    },
    worldLayout,
    approvedContract,
    materialsByColor: materialSystem.players,
    resourceRegistry: registry,
  });
  scene.add(pieces.root);

  const interactionLayer = createGameplayInteractionLayer({ worldLayout, resourceRegistry: registry });
  scene.add(interactionLayer.root);

  const { cameraId: initialCameraId } = selectedCamera;
  let frameGovernor;
  frameGovernor = createFrameGovernor({
    rendererOwner,
    camera,
    resourceRegistry: registry,
    baseFov: selectedCamera.spec.fov,
    onFrame() {
      if (rendererOwner.render(scene, camera)) markOnce(STARTUP_MARKS.firstVisibleFrame);
    },
  });

  const pieceMeshesByKey = new Map();
  for (const child of pieces.root.children) {
    if (!child?.isInstancedMesh) continue;
    const colorId = child.userData?.colorId;
    const size = child.userData?.size;
    if (colorId && size) pieceMeshesByKey.set(`${colorId}:${size}`, child);
  }
  const piecePlacement = new Map(pieces.pieceIds.map(pieceId => [pieceId, Object.freeze({ kind: 'home' })]));
  const canonicalRotation = Object.freeze([...worldLayout.pieceRotationDegrees]);
  let movePresentationLock = null;

  function logicalPiece(pieceId) {
    const piece = pieces.getLogicalPiece(pieceId);
    if (!piece) fail('local_game_piece_not_found');
    return piece;
  }

  function meshForPiece(pieceId) {
    const piece = logicalPiece(pieceId);
    const mesh = pieceMeshesByKey.get(`${piece.colorId}:${piece.size}`);
    if (!mesh) fail('local_game_piece_mesh_not_found');
    return { piece, mesh };
  }

  function applyTransform(pieceId, transform) {
    const { piece, mesh } = meshForPiece(pieceId);
    const pivot = sourcePivotForMesh(mesh);
    mesh.setMatrixAt(piece.copyIndex, matrixForTransform(transform, pivot));
    mesh.instanceMatrix.needsUpdate = true;
    frameGovernor?.requestRender();
  }

  function readPieceTransform(pieceId) {
    const { piece, mesh } = meshForPiece(pieceId);
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(piece.copyIndex, matrix);
    const pivot = sourcePivotForMesh(mesh).applyMatrix4(matrix);
    return freezeTransform(pivot.toArray(), canonicalRotation);
  }

  function homeTransform(pieceId) {
    return freezeTransform(logicalPiece(pieceId).homeCenter, canonicalRotation);
  }

  function boardTransform(pieceId, cellId) {
    logicalPiece(pieceId);
    const zone = worldLayout.zones.find(candidate => candidate.id === cellId);
    if (!zone) fail('local_game_board_destination_missing');
    return Object.freeze({ cellId, transform: freezeTransform(zone.position, canonicalRotation) });
  }

  function snapPieceCanonical(pieceId) {
    const placement = piecePlacement.get(pieceId);
    if (placement?.kind === 'board') pieces.syncPieceToBoard(pieceId, placement.cellId);
    else pieces.syncPieceHome(pieceId);
    frameGovernor?.requestRender();
  }

  const presentation = Object.freeze({
    readPieceIdentity(pieceId) {
      const piece = logicalPiece(pieceId);
      return Object.freeze({ pieceId, colorId: piece.colorId, size: piece.size });
    },
    readPieceTransform,
    readCanonicalPieceTransform: homeTransform,
    readCanonicalBoardTransform: boardTransform,
    applyDragTransform(pieceId, transform) { applyTransform(pieceId, transform); },
    applyPieceTransform(pieceId, transform) { applyTransform(pieceId, transform); },
    snapPieceCanonical(pieceId) { snapPieceCanonical(pieceId); },
    snapPieceToTransform(pieceId, transform) { applyTransform(pieceId, transform); },
    isPieceLive(pieceId) { return Boolean(pieces.getLogicalPiece(pieceId)); },
    setMovePresentationLock(lock) {
      movePresentationLock = lock;
      if (lock) rendererOwner.canvas.dataset.movePresentationLock = lock.phase || 'locked';
      else delete rendererOwner.canvas.dataset.movePresentationLock;
      frameGovernor?.requestRender();
    },
  });

  const initialState = suppliedInitialState
    ? assertFastplayState(suppliedInitialState)
    : createFastplayInitialState(gameConfig || {});
  const authority = createLocalAuthorityAdapter({
    initialState,
    isOnlineSeatType,
    clock: () => Date.now(),
  });
  let canonicalState = await authority.snapshot();
  syncPersistentScoreMarkerInstances(scoreMarkers, canonicalState);

  const reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') || null;
  const motionController = createMotionController({
    resourceRegistry: registry,
    clock: () => performance.now(),
    reducedMotion: Boolean(reducedMotionQuery?.matches),
    reducedMotionQuery,
    generation: canonicalState.lifecycle.presentationGeneration,
    revision: canonicalState.revision,
  });
  const acceptedTravel = createAcceptedPieceTravelController({ motionController, presentation });
  acceptedTravel.observeSnapshot(canonicalState, { reason: 'fastplay-initial-snapshot' });

  const dragSelection = createSizeSelectionController();
  let selectedPieceId = null;
  let pointerStartPieceId = null;
  let cameraGesturesEnabled = true;
  let disposed = false;
  let deadlineTimer = null;
  let computerInFlight = null;
  let humanSequence = 0;
  const raycaster = new THREE.Raycaster();
  const pieceRaycaster = new THREE.Raycaster();

  function activeSeat(state = canonicalState) {
    return state.seats.find(seat => seat.seatId === state.activeSeatId) || null;
  }

  function setTurnPresentation(state = canonicalState) {
    const seat = activeSeat(state);
    turnEmphasis.setActivePlayer(seat?.color || null);
    rendererOwner.canvas.dataset.activeSeat = seat?.seatId || '';
    rendererOwner.canvas.dataset.activeSeatType = seat?.type || '';
    rendererOwner.canvas.dataset.authorityRevision = String(state.revision);
  }
  setTurnPresentation(canonicalState);

  function syncMotionAuthority(state) {
    const snapshot = motionController.snapshot();
    if (
      state.lifecycle.presentationGeneration > snapshot.generation
      || state.revision > snapshot.revision
    ) {
      motionController.syncSessionAuthority(state.lifecycle, state.revision);
    }
  }

  function clearDeadlineTimer() {
    if (deadlineTimer !== null) window.clearTimeout(deadlineTimer);
    deadlineTimer = null;
  }

  function scheduleDeadline(state = canonicalState) {
    clearDeadlineTimer();
    if (disposed || state.deadlineAtMs === null || state.activeSeatId === null) return;
    const delay = Math.max(0, state.deadlineAtMs - Date.now());
    deadlineTimer = window.setTimeout(() => {
      deadlineTimer = null;
      void reconcileExpiredDeadline();
    }, delay + 4);
  }

  function clearInputForCanonical(state, clearReason, reason) {
    try {
      if (tapController.snapshot().phase !== TAP_CONFIRMATION_PHASES.IDLE) {
        tapController.reconcileCanonical({ state, clearReason });
      }
    } catch (error) {
      console.warn('[fastplay] tap reconciliation recovered', error);
    }
    try {
      if (dragController.snapshot().phase !== DRAG_PHASES.IDLE) {
        dragController.reconcileCanonical({ state, clearReason, reason });
      }
    } catch (error) {
      console.warn('[fastplay] drag reconciliation recovered', error);
    }
    try { dragSelection.clear(clearReason, state); } catch {}
    selectedPieceId = null;
    pointerStartPieceId = null;
  }

  function updateCanonicalState(state) {
    canonicalState = state;
    syncPersistentScoreMarkerInstances(scoreMarkers, state);
    setTurnPresentation(state);
    scheduleDeadline(state);
    frameGovernor.requestRender();
  }

  function chooseComputerPiece(state) {
    const move = state.lastMove;
    if (!move) return null;
    const candidates = pieces.logicalPieces
      .filter(piece => piece.colorId === move.color && piece.size === move.size && piecePlacement.get(piece.id)?.kind === 'home')
      .sort((left, right) => right.copyIndex - left.copyIndex);
    return candidates[0]?.id || null;
  }

  async function playAcceptedTravel(state, pieceId, pendingId = null, { observeFirst = false } = {}) {
    if (!pieceId || state.lastMove === null) return null;
    if (observeFirst) acceptedTravel.observeSnapshot(state, { reason: 'newer-authoritative-move' });
    piecePlacement.set(pieceId, Object.freeze({ kind: 'board', cellId: state.lastMove.cell }));
    try {
      const travel = acceptedTravel.startAcceptedTravel({ state, pieceId, pendingId });
      await travel.handle.finished;
    } catch (error) {
      console.warn('[fastplay] accepted travel snapped to canonical fallback', error);
    }
    pieces.syncPieceToBoard(pieceId, state.lastMove.cell);
    frameGovernor.requestRender();
    return pieceId;
  }

  async function handleHumanSubmission(intent, pieceId, pendingId) {
    try {
      const result = await authority.submit(intent);
      updateCanonicalState(result.snapshot);
      await playAcceptedTravel(result.snapshot, pieceId, pendingId);
      clearInputForCanonical(result.snapshot, 'accepted-resync', 'authority-accepted');
      void runComputerTurns();
      return result;
    } catch (error) {
      acceptedTravel.cancelPending('authority-rejected');
      const current = await authority.snapshot();
      updateCanonicalState(current);
      clearInputForCanonical(current, 'rejected-resync', 'authority-rejected');
      snapPieceCanonical(pieceId);
      throw error;
    }
  }

  const humanAuthority = Object.freeze({
    snapshot: () => authority.snapshot(),
    submit(intent) {
      const pieceId = selectedPieceId;
      if (!pieceId) return Promise.reject(Object.assign(new Error('local_game_selected_piece_required'), { code: 'local_game_selected_piece_required' }));
      const pendingId = `human:${canonicalState.lifecycle.presentationGeneration}:${canonicalState.revision}:${++humanSequence}`;
      try {
        acceptedTravel.beginPending({ state: canonicalState, pendingId });
      } catch (error) {
        return Promise.reject(error);
      }
      return handleHumanSubmission(intent, pieceId, pendingId);
    },
  });

  const intentFactory = input => createGameplayIntent({
    ...input,
    adapter: GAMEPLAY_AUTHORITY_ADAPTERS.LOCAL,
  });

  const tapController = createTapClickConfirmationController({
    authority: humanAuthority,
    intentFactory,
    onFeedback() { frameGovernor.requestRender(); },
    worldLayout,
    approvedContract,
  });

  const dragController = createDragInteractionController({
    motionController,
    authority: humanAuthority,
    intentFactory,
    presentation,
    setCameraGesturesEnabled(enabled) { cameraGesturesEnabled = Boolean(enabled); },
    clearSelection(reason, state = null) { return dragSelection.clear(reason, state); },
    approvedContract,
    worldLayout,
  });

  const computerProducer = createComputerTurnProducer({
    authority,
    isComputerSeatType,
    resourceRegistry: registry,
    clock: () => Date.now(),
  });

  async function runComputerTurns() {
    if (disposed || computerInFlight) return computerInFlight;
    const seat = activeSeat();
    if (!seat || !isComputerSeatType(seat.type) || canonicalState.deadlineAtMs === null) return null;

    computerInFlight = (async () => {
      const result = await computerProducer.playCurrentTurn({ reducedMotion: Boolean(reducedMotionQuery?.matches) });
      if (disposed || result?.status !== 'submitted') return result;
      const nextState = result.result.snapshot;
      const pieceId = chooseComputerPiece(nextState);
      updateCanonicalState(nextState);
      if (pieceId) await playAcceptedTravel(nextState, pieceId, null, { observeFirst: true });
      else acceptedTravel.observeSnapshot(nextState, { reason: 'computer-move-without-piece-presentation' });
      clearInputForCanonical(nextState, 'ownership-change', 'computer-authority-advanced');
      return result;
    })().finally(() => {
      computerInFlight = null;
      if (!disposed && isComputerSeatType(activeSeat()?.type)) void runComputerTurns();
    });
    return computerInFlight;
  }

  async function reconcileExpiredDeadline() {
    if (disposed) return null;
    const state = await authority.snapshot();
    const attempt = createExpiredLocalTimeoutIntent(state, { nowMs: Date.now(), isOnlineSeatType });
    if (!attempt) {
      updateCanonicalState(state);
      return null;
    }
    try {
      const result = await authority.submit(attempt.intent);
      acceptedTravel.observeSnapshot(result.snapshot, { reason: 'authoritative-timeout' });
      syncMotionAuthority(result.snapshot);
      updateCanonicalState(result.snapshot);
      clearInputForCanonical(result.snapshot, 'timeout', 'authoritative-timeout');
      void runComputerTurns();
      return result;
    } catch (error) {
      console.warn('[fastplay] deadline reconciliation retried from authority snapshot', error);
      const current = await authority.snapshot();
      updateCanonicalState(current);
      return null;
    }
  }

  function rayFromPacket(packet) {
    return packet?.current?.ray || null;
  }

  function pickHomePiece(ray) {
    if (!ray || movePresentationLock) return null;
    const seat = activeSeat();
    if (!seat || !isHumanSeatType(seat.type)) return null;
    pieceRaycaster.ray.origin.fromArray(ray.origin);
    pieceRaycaster.ray.direction.fromArray(ray.direction).normalize();
    const hits = pieceRaycaster.intersectObject(pieces.root, true);
    for (const hit of hits) {
      if (!Number.isInteger(hit.instanceId)) continue;
      const size = hit.object?.userData?.size;
      const colorId = hit.object?.userData?.colorId;
      if (!size || colorId !== seat.color) continue;
      const pieceId = `piece:${colorId}:${size}:${hit.instanceId + 1}`;
      const piece = pieces.getLogicalPiece(pieceId);
      if (!piece || piecePlacement.get(pieceId)?.kind !== 'home') continue;
      const remaining = canonicalState.inventory?.[seat.seatId]?.[size];
      if (!Number.isInteger(remaining) || piece.copyIndex >= remaining) continue;
      return piece;
    }
    return null;
  }

  function selectPiece(piece, pointerType) {
    if (!piece) return false;
    const source = intentSource(pointerType);
    const stackTargetId = `stack:${piece.homeSeatId}:${piece.copyIndex}`;
    tapController.tapSize({ state: canonicalState, stackTargetId, size: piece.size, source });
    dragSelection.select(canonicalState, { stackTargetId, size: piece.size });
    selectedPieceId = piece.id;
    frameGovernor.requestRender();
    return true;
  }

  function onPointerGesture(packet) {
    if (disposed || movePresentationLock) return;
    const seat = activeSeat();
    if (!seat || !isHumanSeatType(seat.type)) return;

    if (packet.phase === 'start') {
      const piece = pickHomePiece(rayFromPacket(packet));
      pointerStartPieceId = piece?.id || null;
      if (piece) {
        try { selectPiece(piece, packet.pointerType); } catch (error) { console.warn('[fastplay] piece selection ignored', error); }
      }
      return;
    }

    if (packet.phase === 'move' && packet.gesture === 'drag' && pointerStartPieceId) {
      try {
        if (dragController.snapshot().phase === DRAG_PHASES.IDLE) {
          dragController.begin({
            state: canonicalState,
            selection: dragSelection.snapshot(),
            pointerId: packet.pointerId,
            pointerType: packet.pointerType,
          });
        }
        dragController.update({
          state: canonicalState,
          selection: dragSelection.snapshot(),
          pointerId: packet.pointerId,
          pointerType: packet.pointerType,
          ray: rayFromPacket(packet),
        });
      } catch (error) {
        console.warn('[fastplay] drag update ignored', error);
      }
      return;
    }

    if (packet.phase === 'end') {
      try {
        if (packet.gesture === 'drag' && dragController.snapshot().phase === DRAG_PHASES.DRAGGING) {
          dragController.release({
            state: canonicalState,
            selection: dragSelection.snapshot(),
            pointerId: packet.pointerId,
            pointerType: packet.pointerType,
            ray: rayFromPacket(packet),
          });
        } else if (packet.gesture === 'tap' && !pointerStartPieceId && tapController.snapshot().phase === TAP_CONFIRMATION_PHASES.SELECTED) {
          tapController.tapBoard({
            state: canonicalState,
            ray: rayFromPacket(packet),
            pointerType: packet.pointerType,
            source: intentSource(packet.pointerType),
          });
        }
      } catch (error) {
        console.warn('[fastplay] pointer confirmation ignored', error);
      } finally {
        pointerStartPieceId = null;
      }
      return;
    }

    if (packet.phase === 'cancel') {
      try { dragController.pointerCancel({ clearState: canonicalState }); } catch {}
      pointerStartPieceId = null;
    }
  }

  const pointerAdapter = createPointerEventsAdapter({
    canvas: rendererOwner.canvas,
    resourceRegistry: registry,
    onGesture: onPointerGesture,
    getCamera: () => camera,
    raycaster,
    clock: () => performance.now(),
  });
  pointerAdapter.setGameplayGestureOwnership(true);
  rendererOwner.canvas.setAttribute('aria-label', 'YAKOLAK local game board');

  const unregisterContextRestorer = rendererOwner.registerResourceRestorer(() => {
    frameGovernor.invalidateLayout({ immediate: true });
    frameGovernor.requestRender();
  });
  lifecycle.registerCleanup(unregisterContextRestorer, { label: 'local-game-context-restorer' });
  lifecycle.listen(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible') void reconcileExpiredDeadline();
  }, undefined, { label: 'local-game-deadline-resume' });
  lifecycle.registerCleanup(clearDeadlineTimer, { label: 'local-game-deadline-timer' });

  function start() {
    if (disposed) return false;
    frameGovernor.start();
    frameGovernor.setContinuous(false);
    scheduleDeadline(canonicalState);
    frameGovernor.requestRender();
    void runComputerTurns();
    return true;
  }

  function getPresentationSnapshot() {
    return Object.freeze({
      schema: LOCAL_GAME_SCHEMA,
      cameraId: initialCameraId,
      state: canonicalState,
      selectedPieceId,
      movePresentationLock,
      cameraGesturesEnabled,
      tap: tapController.snapshot(),
      drag: dragController.snapshot(),
      motion: motionController.snapshot(),
      acceptedTravel: acceptedTravel.snapshot(),
      pointer: pointerAdapter.snapshot(),
      frame: frameGovernor.snapshot(),
      scoreMarkers: scoreMarkers.snapshot(),
      pieces: Object.freeze({ counts: pieces.getInstanceCounts(), placements: pieces.getPlacementSnapshot() }),
    });
  }

  function getLightingSnapshot() {
    return Object.freeze({ neutral: lighting.snapshot(), turn: turnEmphasis.snapshot() });
  }

  function setTurnEmphasis(colorId = null) {
    return turnEmphasis.setActivePlayer(colorId);
  }

  async function getCanonicalState() {
    return authority.snapshot();
  }

  async function submitRematch(source = GAMEPLAY_PRESENTATION_SOURCES.CLICK) {
    let state = await authority.snapshot();
    if (state.matchComplete && state.lifecycle.phase === 'win') {
      state = commitCanonicalMatchEnd(state, { expectedRevision: state.revision }).state;
    }
    const rematchAuthority = state === canonicalState
      ? authority
      : createLocalAuthorityAdapter({ initialState: state, isOnlineSeatType, clock: () => Date.now() });
    const request = createLocalRematchRequest(state, { source, isOnlineSeatType });
    return rematchAuthority.submit(request.intent);
  }

  function release() {
    if (disposed) return false;
    disposed = true;
    clearDeadlineTimer();
    computerProducer.cancelPending('local-game-released');
    computerProducer.dispose();
    pointerAdapter.release();
    acceptedTravel.release();
    motionController.release();
    frameGovernor.release();
    interactionLayer.release();
    pieces.release();
    playerBases.dispose();
    boardAndLid.dispose();
    scoreMarkers.release();
    table.release();
    room.release();
    lighting.release();
    scene.clear();
    lifecycle.release('fastplay-local-game-scene-released');
    return true;
  }

  return Object.freeze({
    scene,
    camera,
    start,
    getPresentationSnapshot,
    getLightingSnapshot,
    getCanonicalState,
    submitRematch,
    setTurnEmphasis,
    release,
    dispose: release,
  });
}
