import * as THREE from 'three';
import { createFrameGovernor } from '../camera/frame-governor.js';
import { RESOURCE_KINDS, RESOURCE_OWNERSHIP } from '../core/resource-registry.js';
import { createMotionController } from '../gameplay/motion-controller.js';
import { createBoardAndLidObjects } from './board-and-lid.js';
import { createMinimalLightingRig } from './lighting-rig.js';
import { createNeutralRoom } from './neutral-room.js';
import { createPlayerBaseInstances } from './player-bases.js';
import { createTableSurface } from './table-and-score.js';

// Frozen visual/sequence reference: archive/perfect-intro-v1-2026-08-06.
// All timing/interpolation ownership stays inside THREEJS-096.
export const APPROVED_INTRO_TIMING = Object.freeze({
  matchHoldMs: 260,
  morphMs: 980,
  settleMs: 300,
  cameraOrbitMs: 1250,
  cameraHoldMs: 220,
  closedBoxDropMs: 1200,
  closedBoxHoldMs: 420,
  lidShakeMs: 550,
  lidLiftMs: 1300,
  wallDelayMs: 520,
  wallShakeMs: 280,
  wallRaise: 20,
  wallLiftMs: 360,
  wallMoveMs: 850,
  wallDropMs: 430,
});

const CLOSED_BOX_START_HEIGHT = 8.4;
const CLOSED_BOX_IMPACT_DEPTH = 0.10;
const CLOSED_BOX_REBOUND_HEIGHT = 0.06;
const LID_LIFT_HEIGHT = 740;
const WALL_START = Object.freeze({
  right: Object.freeze({ position: Object.freeze([81, 35, 0]), rotationDegrees: Object.freeze([-90, -90, 0]) }),
  left: Object.freeze({ position: Object.freeze([-81, 35, 0]), rotationDegrees: Object.freeze([-90, 90, 180]) }),
  front: Object.freeze({ position: Object.freeze([0, 35, 81]), rotationDegrees: Object.freeze([-180, 0, 90]) }),
  back: Object.freeze({ position: Object.freeze([0, 35, -81]), rotationDegrees: Object.freeze([-180, 180, -90]) }),
});

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function smootherstep(value) {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function easeInCubic(value) {
  const t = clamp01(value);
  return t * t * t;
}

function easeOutCubic(value) {
  const t = clamp01(value);
  return 1 - ((1 - t) ** 3);
}

function easeInOutCubic(value) {
  const t = clamp01(value);
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpArray(a, b, t) {
  return a.map((value, index) => lerp(value, b[index], t));
}

function applyPose(object, pose) {
  object.position.fromArray(pose.position);
  object.rotation.set(
    THREE.MathUtils.degToRad(pose.rotationDegrees[0]),
    THREE.MathUtils.degToRad(pose.rotationDegrees[1]),
    THREE.MathUtils.degToRad(pose.rotationDegrees[2]),
    'XYZ',
  );
}

function mixPose(a, b, t) {
  return {
    position: lerpArray(a.position, b.position, t),
    rotationDegrees: lerpArray(a.rotationDegrees, b.rotationDegrees, t),
  };
}

function choosePlayCamera(worldLayout) {
  const width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
  const height = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
  const aspect = width / height;
  const cameraId = aspect < 0.78 ? 'playPortrait2' : width < 820 ? 'playCompact' : 'playDesktop';
  const spec = worldLayout?.cameras?.[cameraId] || worldLayout?.cameras?.playDesktop;
  if (!spec) throw new Error('approved_intro_play_camera_missing');
  return { cameraId, spec };
}

async function loadJson(relativeUrl, label) {
  const response = await fetch(new URL(relativeUrl, import.meta.url), { cache: 'force-cache' });
  if (!response.ok) throw new Error(`${label} metadata failed: HTTP ${response.status}`);
  return response.json();
}

function publishPhase(phase) {
  document.documentElement.dataset.yakolakPreIntro = phase;
  document.documentElement.dataset.yakolakIntro = phase === 'complete' ? 'complete' : 'playing';
  document.documentElement.dataset.gameprep003 = phase;
  window.__yakolakApprovedIntroPhases = window.__yakolakApprovedIntroPhases || [];
  const last = window.__yakolakApprovedIntroPhases.at(-1)?.phase;
  if (last !== phase) window.__yakolakApprovedIntroPhases.push({ phase, at: performance.now() });
}

export function createApprovedIntroLoadingStar({ mount, svgText } = {}) {
  if (!mount || typeof svgText !== 'string' || !svgText.includes('<svg')) return null;
  const element = document.createElement('div');
  element.id = 'yakolak-approved-loading-star';
  element.setAttribute('aria-hidden', 'true');
  element.innerHTML = svgText;
  Object.assign(element.style, {
    position: 'fixed',
    left: '50%',
    top: '50%',
    width: 'min(62vw, 420px)',
    maxHeight: '62vh',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
    zIndex: '8',
    opacity: '1',
  });
  const svg = element.querySelector('svg');
  if (svg) {
    svg.style.display = 'block';
    svg.style.width = '100%';
    svg.style.height = 'auto';
  }
  mount.append(element);
  document.documentElement.dataset.yakolakLoaderHandoff = 'loading-star';
  let released = false;
  return Object.freeze({
    element,
    setOpacity(value) {
      if (!released) element.style.opacity = String(clamp01(value));
    },
    release() {
      if (released) return;
      released = true;
      element.remove();
    },
  });
}

function wallPoseAt(seatId, elapsedMs, worldLayout) {
  const start = WALL_START[seatId];
  const finish = worldLayout.bases[seatId];
  const index = worldLayout.introOrder.indexOf(seatId);
  const deploymentStart = APPROVED_INTRO_TIMING.lidShakeMs + index * APPROVED_INTRO_TIMING.wallDelayMs;
  let time = elapsedMs - deploymentStart;
  if (time <= 0) return start;

  if (time < APPROVED_INTRO_TIMING.wallShakeMs) {
    const fade = 1 - time / APPROVED_INTRO_TIMING.wallShakeMs;
    const wave = Math.sin(time * 0.06) * 2.2 * fade;
    return {
      position: [...start.position],
      rotationDegrees: [
        start.rotationDegrees[0] + wave * 0.4,
        start.rotationDegrees[1] + wave * 0.25,
        start.rotationDegrees[2] + wave * 0.35,
      ],
    };
  }
  time -= APPROVED_INTRO_TIMING.wallShakeMs;

  const raised = {
    position: [start.position[0], start.position[1] + APPROVED_INTRO_TIMING.wallRaise, start.position[2]],
    rotationDegrees: [...start.rotationDegrees],
  };
  if (time < APPROVED_INTRO_TIMING.wallLiftMs) {
    return mixPose(start, raised, easeInOutCubic(time / APPROVED_INTRO_TIMING.wallLiftMs));
  }
  time -= APPROVED_INTRO_TIMING.wallLiftMs;

  const raisedFinish = {
    position: [finish.position[0], start.position[1] + APPROVED_INTRO_TIMING.wallRaise, finish.position[2]],
    rotationDegrees: [...finish.rotationDegrees],
  };
  if (time < APPROVED_INTRO_TIMING.wallMoveMs) {
    return mixPose(raised, raisedFinish, easeInOutCubic(time / APPROVED_INTRO_TIMING.wallMoveMs));
  }
  time -= APPROVED_INTRO_TIMING.wallMoveMs;

  if (time < APPROVED_INTRO_TIMING.wallDropMs) {
    return mixPose(raisedFinish, finish, easeInOutCubic(time / APPROVED_INTRO_TIMING.wallDropMs));
  }
  return finish;
}

function closedBoxDropY(elapsedMs) {
  const raw = clamp01(elapsedMs / APPROVED_INTRO_TIMING.closedBoxDropMs);
  if (raw < 0.78) return lerp(CLOSED_BOX_START_HEIGHT, -CLOSED_BOX_IMPACT_DEPTH, easeInCubic(raw / 0.78));
  if (raw < 0.90) return lerp(-CLOSED_BOX_IMPACT_DEPTH, CLOSED_BOX_REBOUND_HEIGHT, easeOutCubic((raw - 0.78) / 0.12));
  return lerp(CLOSED_BOX_REBOUND_HEIGHT, 0, smootherstep((raw - 0.90) / 0.10));
}

export async function createApprovedIntroScene(rendererOwner, {
  runtimeData,
  worldLayout,
  approvedContract,
  roomSpecText,
  assets,
  materialSystem,
  resourceRegistry,
  loadingStar = null,
} = {}) {
  if (!rendererOwner?.render || !rendererOwner?.resizeToDisplaySize) throw new TypeError('approved_intro_renderer_required');
  if (!resourceRegistry?.createScope) throw new TypeError('approved_intro_resource_registry_required');
  if (!runtimeData || !worldLayout || !approvedContract || !materialSystem) throw new TypeError('approved_intro_canonical_inputs_required');

  const lifecycle = resourceRegistry.createScope('gameprep-003-approved-intro', {
    ownership: RESOURCE_OWNERSHIP.GENERATION_SCOPED,
  });
  const [boardLayout, playerBaseLayout] = await Promise.all([
    loadJson('../../assets/models/board-and-lid-layout.json', 'board-and-lid'),
    loadJson('../../assets/models/player-base-layout.json', 'player-base'),
  ]);

  const scene = new THREE.Scene();
  scene.name = 'YAKOLAKApprovedIntroScene';
  scene.background = new THREE.Color(runtimeData.materials.palette.wall);

  const selectedCamera = choosePlayCamera(worldLayout);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 8000);
  camera.name = 'yakolak:approved-intro-camera';

  const lighting = createMinimalLightingRig({ runtimeData });
  scene.add(lighting.root);

  const room = createNeutralRoom({
    worldLayout,
    approvedContract,
    roomSpecText,
    wallMaterial: materialSystem.getSurfaceMaterial('wall'),
    floorMaterial: materialSystem.getSurfaceMaterial('floor'),
    resourceRegistry,
  });
  room.setFrontWallVisibility(false);
  room.root.visible = false;
  scene.add(room.root);

  const canonicalTableMaterial = materialSystem.getSurfaceMaterial('table');
  const introTableMaterial = canonicalTableMaterial.clone();
  lifecycle.register(introTableMaterial, {
    kind: RESOURCE_KINDS.MATERIAL_VARIANT,
    label: 'gameprep-003-table-material',
  });
  const finalTableColor = canonicalTableMaterial.color?.clone?.() || new THREE.Color(0xffffff);
  const finalRoughness = Number.isFinite(canonicalTableMaterial.roughness) ? canonicalTableMaterial.roughness : 0.7;
  const finalMetalness = Number.isFinite(canonicalTableMaterial.metalness) ? canonicalTableMaterial.metalness : 0;
  const table = createTableSurface({
    footprintSvg: assets?.tableFootprint,
    worldLayout,
    material: introTableMaterial,
    resourceRegistry,
  });
  scene.add(table.mesh);

  const boardMaterial = materialSystem.getSurfaceMaterial('board');
  const boardAndLid = createBoardAndLidObjects({
    runtimeAsset: assets?.boardAndLid,
    layout: boardLayout,
    boardMaterial,
  });
  const playerBases = createPlayerBaseInstances({
    runtimeAsset: assets?.playerBase,
    geometryLayout: playerBaseLayout,
    worldLayout,
    materialsByColor: materialSystem.players,
  });
  for (const seatId of playerBases.seatOrder) {
    const record = playerBases.getSeat(seatId);
    record.base.traverse((object) => {
      if (object?.isMesh) object.material = boardMaterial;
    });
    applyPose(record.base, WALL_START[seatId]);
  }
  boardAndLid.setLidPhase('intro-start');

  const closedBoxRoot = new THREE.Group();
  closedBoxRoot.name = 'approved-intro-closed-box';
  closedBoxRoot.add(boardAndLid.root, playerBases.root);
  closedBoxRoot.visible = false;
  scene.add(closedBoxRoot);

  table.geometry.computeBoundingBox();
  const tableBounds = table.geometry.boundingBox;
  const tableSize = new THREE.Vector3();
  tableBounds.getSize(tableSize);
  const viewportWidth = Math.max(1, window.innerWidth || 1);
  const viewportHeight = Math.max(1, window.innerHeight || 1);
  const aspect = viewportWidth / viewportHeight;
  const starFov = 42;
  const vHalf = THREE.MathUtils.degToRad(starFov) / 2;
  const hHalf = Math.atan(Math.tan(vHalf) * aspect);
  const desiredFraction = 0.62;
  const halfWidth = Math.max(1, tableSize.x / 2);
  const halfDepth = Math.max(1, tableSize.z / 2);
  const starDistance = Math.max(
    halfWidth / (desiredFraction * Math.tan(hHalf)),
    halfDepth / (desiredFraction * Math.tan(vHalf)),
  );
  const starPosition = new THREE.Vector3(0, table.mesh.position.y + starDistance, 0);
  const starTarget = new THREE.Vector3(0, table.mesh.position.y, 0);
  const starCamera = new THREE.PerspectiveCamera(starFov, aspect, 0.1, 8000);
  starCamera.position.copy(starPosition);
  starCamera.up.set(0, 0, -1);
  starCamera.lookAt(starTarget);
  const starQuaternion = starCamera.quaternion.clone();

  const finalPosition = new THREE.Vector3(...selectedCamera.spec.position);
  const finalTarget = new THREE.Vector3(...selectedCamera.spec.target);
  const finalCamera = new THREE.PerspectiveCamera(selectedCamera.spec.fov, aspect, 0.1, 8000);
  finalCamera.position.copy(finalPosition);
  finalCamera.up.set(0, 1, 0);
  finalCamera.lookAt(finalTarget);
  const finalQuaternion = finalCamera.quaternion.clone();

  camera.position.copy(starPosition);
  camera.quaternion.copy(starQuaternion);
  camera.fov = starFov;
  camera.updateProjectionMatrix();

  let running = false;
  let disposed = false;
  let completed = false;
  let stage = 'ready';
  const frameGovernor = createFrameGovernor({
    rendererOwner,
    camera,
    resourceRegistry,
    baseFov: starFov,
    onFrame() {
      if (!disposed) rendererOwner.render(scene, camera);
    },
  });
  frameGovernor.start();
  frameGovernor.setContinuous(false);

  const reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') || null;
  const motion = createMotionController({
    resourceRegistry,
    generation: 0,
    revision: 0,
    reducedMotion: Boolean(reducedMotionQuery?.matches),
    reducedMotionQuery: reducedMotionQuery?.addEventListener ? reducedMotionQuery : null,
  });

  const requestRender = () => frameGovernor.requestRender();
  const isLive = () => !disposed;

  function setTableBridge(progress) {
    const t = clamp01(progress);
    introTableMaterial.color?.lerpColors?.(new THREE.Color(0xffffff), finalTableColor, t);
    if ('roughness' in introTableMaterial) introTableMaterial.roughness = lerp(0.54, finalRoughness, t);
    if ('metalness' in introTableMaterial) introTableMaterial.metalness = lerp(0, finalMetalness, t);
    if (introTableMaterial.emissive?.setRGB) {
      const emission = 0.16 * (1 - t);
      introTableMaterial.emissive.setRGB(emission, emission, emission);
      introTableMaterial.emissiveIntensity = 1;
    }
    introTableMaterial.needsUpdate = true;
  }

  function applyFinalCamera() {
    camera.position.copy(finalPosition);
    camera.quaternion.copy(finalQuaternion);
    camera.fov = Number(selectedCamera.spec.fov);
    camera.updateProjectionMatrix();
  }

  function snapSetupFinal() {
    room.root.visible = true;
    setTableBridge(1);
    table.mesh.scale.set(1, 1, 1);
    closedBoxRoot.visible = true;
    closedBoxRoot.position.set(0, 0, 0);
    boardAndLid.setLidPhase('post-intro');
    for (const seatId of playerBases.seatOrder) applyPose(playerBases.getSeat(seatId).base, worldLayout.bases[seatId]);
    applyFinalCamera();
    loadingStar?.setOpacity?.(0);
    document.documentElement.dataset.yakolakLoaderHandoff = 'matched';
    requestRender();
  }

  function animateStage({ key, durationMs, apply, snap = snapSetupFinal }) {
    const handle = motion.animate({
      scope: 'unboxing',
      key,
      generation: 0,
      revision: 0,
      durationMs,
      from: { progress: 0 },
      to: { progress: 1 },
      easing: 'linear',
      apply: ({ progress }) => {
        if (!disposed) apply(progress);
      },
      isTargetLive: isLive,
      snapToCanonical: snap,
    });
    return handle.finished;
  }

  const tableTotalMs = APPROVED_INTRO_TIMING.matchHoldMs
    + APPROVED_INTRO_TIMING.morphMs
    + APPROVED_INTRO_TIMING.settleMs
    + APPROVED_INTRO_TIMING.cameraOrbitMs
    + APPROVED_INTRO_TIMING.cameraHoldMs;
  const dropTotalMs = APPROVED_INTRO_TIMING.closedBoxDropMs + APPROVED_INTRO_TIMING.closedBoxHoldMs;
  const unboxTotalMs = APPROVED_INTRO_TIMING.lidShakeMs
    + (worldLayout.introOrder.length - 1) * APPROVED_INTRO_TIMING.wallDelayMs
    + APPROVED_INTRO_TIMING.wallShakeMs
    + APPROVED_INTRO_TIMING.wallLiftMs
    + APPROVED_INTRO_TIMING.wallMoveMs
    + APPROVED_INTRO_TIMING.wallDropMs;

  function applyPreIntro(progress) {
    const elapsed = progress * tableTotalMs;
    closedBoxRoot.visible = false;
    table.mesh.visible = true;

    if (elapsed <= APPROVED_INTRO_TIMING.matchHoldMs) {
      stage = 'matched';
      publishPhase(stage);
      loadingStar?.setOpacity?.(1 - clamp01(elapsed / APPROVED_INTRO_TIMING.matchHoldMs));
      setTableBridge(0);
      camera.position.copy(starPosition);
      camera.quaternion.copy(starQuaternion);
      camera.fov = starFov;
      camera.updateProjectionMatrix();
    } else if (elapsed <= APPROVED_INTRO_TIMING.matchHoldMs + APPROVED_INTRO_TIMING.morphMs) {
      stage = 'star-to-3d';
      publishPhase(stage);
      loadingStar?.setOpacity?.(0);
      document.documentElement.dataset.yakolakLoaderHandoff = 'matched';
      const t = smootherstep((elapsed - APPROVED_INTRO_TIMING.matchHoldMs) / APPROVED_INTRO_TIMING.morphMs);
      setTableBridge(t);
      table.mesh.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.003);
    } else if (elapsed <= APPROVED_INTRO_TIMING.matchHoldMs + APPROVED_INTRO_TIMING.morphMs + APPROVED_INTRO_TIMING.settleMs) {
      stage = 'table-settling';
      publishPhase(stage);
      const start = APPROVED_INTRO_TIMING.matchHoldMs + APPROVED_INTRO_TIMING.morphMs;
      const t = smootherstep((elapsed - start) / APPROVED_INTRO_TIMING.settleMs);
      setTableBridge(1);
      table.mesh.scale.setScalar(lerp(1.003, 1, t));
    } else {
      const orbitStart = APPROVED_INTRO_TIMING.matchHoldMs + APPROVED_INTRO_TIMING.morphMs + APPROVED_INTRO_TIMING.settleMs;
      const orbitEnd = orbitStart + APPROVED_INTRO_TIMING.cameraOrbitMs;
      room.root.visible = true;
      table.mesh.scale.set(1, 1, 1);
      setTableBridge(1);
      if (elapsed <= orbitEnd) {
        stage = 'camera-orbit';
        publishPhase(stage);
        const t = smootherstep((elapsed - orbitStart) / APPROVED_INTRO_TIMING.cameraOrbitMs);
        camera.position.lerpVectors(starPosition, finalPosition, t);
        camera.quaternion.slerpQuaternions(starQuaternion, finalQuaternion, t);
        camera.fov = lerp(starFov, Number(selectedCamera.spec.fov), t);
        camera.updateProjectionMatrix();
      } else {
        stage = 'camera-settled';
        publishPhase(stage);
        applyFinalCamera();
      }
    }
    requestRender();
  }

  function applyClosedBoxDrop(progress) {
    const elapsed = progress * dropTotalMs;
    stage = elapsed < APPROVED_INTRO_TIMING.closedBoxDropMs ? 'box-closed-descending' : 'box-closed-landed';
    publishPhase(stage);
    room.root.visible = true;
    closedBoxRoot.visible = true;
    boardAndLid.setLidPhase('intro-start');
    for (const seatId of playerBases.seatOrder) applyPose(playerBases.getSeat(seatId).base, WALL_START[seatId]);
    closedBoxRoot.position.set(0, elapsed < APPROVED_INTRO_TIMING.closedBoxDropMs ? closedBoxDropY(elapsed) : 0, 0);
    applyFinalCamera();
    requestRender();
  }

  function applyUnboxing(progress) {
    const elapsed = progress * unboxTotalMs;
    stage = 'lid-opening';
    publishPhase(stage);
    closedBoxRoot.visible = true;
    closedBoxRoot.position.set(0, 0, 0);

    const lidStart = boardLayout.lid.introStartTransform;
    if (elapsed < APPROVED_INTRO_TIMING.lidShakeMs) {
      const fade = 1 - elapsed / APPROVED_INTRO_TIMING.lidShakeMs;
      const wave = Math.sin(elapsed * 0.12) * 2.8 * fade;
      applyPose(boardAndLid.lid, {
        position: [...lidStart.position],
        rotationDegrees: [
          lidStart.rotationDegrees[0] + wave * 0.55,
          lidStart.rotationDegrees[1] + Math.cos(elapsed * 0.09) * 1.1 * fade,
          lidStart.rotationDegrees[2] + Math.sin(elapsed * 0.07) * 1.4 * fade,
        ],
      });
      boardAndLid.lid.visible = true;
    } else {
      const lift = easeInOutCubic((elapsed - APPROVED_INTRO_TIMING.lidShakeMs) / APPROVED_INTRO_TIMING.lidLiftMs);
      applyPose(boardAndLid.lid, {
        position: [lidStart.position[0], lidStart.position[1] + LID_LIFT_HEIGHT * lift, lidStart.position[2]],
        rotationDegrees: [...lidStart.rotationDegrees],
      });
      boardAndLid.lid.visible = elapsed < APPROVED_INTRO_TIMING.lidShakeMs + APPROVED_INTRO_TIMING.lidLiftMs;
    }

    for (const seatId of playerBases.seatOrder) applyPose(playerBases.getSeat(seatId).base, wallPoseAt(seatId, elapsed, worldLayout));
    applyFinalCamera();
    requestRender();
  }

  async function play() {
    if (running) return { status: completed ? 'completed' : 'running' };
    if (disposed) return { status: 'released' };
    running = true;
    document.documentElement.dataset.fastplayScene = 'approved-intro';
    document.documentElement.dataset.bootState = 'intro-playing';
    document.documentElement.dataset.yakolakSceneFlow = 'loading-star>star>table>camera>closed-box-drop>lid-open>setup';
    publishPhase('matched');
    requestRender();

    try {
      await animateStage({ key: 'star-table-camera', durationMs: tableTotalMs, apply: applyPreIntro });
      if (disposed) return { status: 'released' };
      await animateStage({ key: 'closed-box-drop', durationMs: dropTotalMs, apply: applyClosedBoxDrop });
      if (disposed) return { status: 'released' };
      await animateStage({ key: 'lid-and-walls', durationMs: unboxTotalMs, apply: applyUnboxing });
      if (disposed) return { status: 'released' };
      snapSetupFinal();
      completed = true;
      stage = 'complete';
      publishPhase('complete');
      return { status: 'completed' };
    } catch (error) {
      if (!disposed) {
        snapSetupFinal();
        stage = 'interrupted-safe-final';
        publishPhase(stage);
      }
      return { status: 'interrupted', error };
    } finally {
      running = false;
      loadingStar?.release?.();
    }
  }

  function getPresentationSnapshot() {
    return Object.freeze({
      schema: 'yakolak.gameprep-003-approved-intro/v1',
      stage,
      running,
      completed,
      disposed,
      reducedMotion: Boolean(reducedMotionQuery?.matches),
      cameraId: selectedCamera.cameraId,
      motion: motion.snapshot(),
      flow: 'loading-star>star>table>camera>closed-box-drop>lid-open>setup',
    });
  }

  function release() {
    if (disposed) return;
    disposed = true;
    running = false;
    loadingStar?.release?.();
    motion.release();
    frameGovernor.release();
    boardAndLid.dispose();
    playerBases.dispose();
    table.release();
    room.release?.();
    lighting.release();
    scene.clear();
    lifecycle.release('gameprep-003-approved-intro-released');
  }

  return Object.freeze({
    scene,
    camera,
    play,
    snapSetupFinal,
    getPresentationSnapshot,
    release,
    dispose: release,
  });
}
