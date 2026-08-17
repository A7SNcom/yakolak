import * as THREE from 'three';
import { createFrameGovernor, FRAME_GOVERNOR_POLICY } from '../camera/frame-governor.js';
import { markOnce, STARTUP_MARKS } from '../perf/startup-marks.js';
import { createMinimalLightingRig, createTurnEmphasisPresentation } from './lighting-rig.js';

function createGpuFacingPreviewResources(group, materialSystem) {
  const geometry = new THREE.TorusKnotGeometry(1.05, 0.28, 128, 20);
  const hero = new THREE.Mesh(geometry, materialSystem.getSurfaceMaterial('board'));
  hero.name = 'preview:canonical-board-material';
  group.add(hero);

  const ringGeometry = new THREE.TorusGeometry(1.85, 0.025, 12, 128);
  const ring = new THREE.Mesh(ringGeometry, materialSystem.getPlayerMaterial('marble'));
  ring.name = 'preview:canonical-marble-material';
  ring.rotation.x = Math.PI * 0.54;
  ring.rotation.z = Math.PI * 0.18;
  group.add(ring);

  function dispose() {
    group.remove(hero, ring);
    geometry.dispose();
    ringGeometry.dispose();
    // Canonical materials are owned by the boot-level material system.
  }

  return Object.freeze({ ring, dispose });
}

export function createPreviewScene(rendererOwner, { runtimeData, materialSystem } = {}) {
  if (!rendererOwner) throw new TypeError('Preview scene requires the renderer owner');
  if (!runtimeData?.materials?.palette?.wall) throw new TypeError('Preview scene requires validated canonical runtime data');
  if (!materialSystem?.getSurfaceMaterial || !materialSystem?.getPlayerMaterial) {
    throw new TypeError('Preview scene requires the canonical material system');
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(runtimeData.materials.palette.wall);

  const camera = new THREE.PerspectiveCamera(FRAME_GOVERNOR_POLICY.baseFov, 1, 0.1, 100);
  camera.position.set(0, 1.6, 6.2);
  camera.lookAt(0, 0, 0);

  const group = new THREE.Group();
  scene.add(group);
  let resources = createGpuFacingPreviewResources(group, materialSystem);
  let restoredResourceGeneration = 0;

  const lightingRig = createMinimalLightingRig({ runtimeData });
  const turnEmphasis = createTurnEmphasisPresentation({ materialSystem });
  scene.add(lightingRig.root);

  const reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = reducedMotionQuery.matches;
  let animationElapsedMs = 0;
  let lastFrameNow = null;
  let running = false;
  let disposed = false;

  const unregisterResourceRestorer = rendererOwner.registerResourceRestorer(({ generation }) => {
    if (disposed || generation <= restoredResourceGeneration) return;
    resources.dispose();
    resources = createGpuFacingPreviewResources(group, materialSystem);
    restoredResourceGeneration = generation;
    lastFrameNow = null;
  });

  const frameGovernor = createFrameGovernor({
    rendererOwner,
    camera,
    onFrame({ now, resumed }) {
      if (!running || disposed) return;

      if (!reducedMotion) {
        if (lastFrameNow == null || resumed) lastFrameNow = now;
        const deltaMs = Math.min(Math.max(now - lastFrameNow, 0), 50);
        lastFrameNow = now;
        animationElapsedMs += deltaMs;

        const t = animationElapsedMs * 0.00022;
        group.rotation.y = t;
        group.rotation.x = Math.sin(t * 0.8) * 0.11;
        resources.ring.rotation.z = Math.PI * 0.18 - t * 0.42;
      } else {
        lastFrameNow = null;
      }

      if (rendererOwner.render(scene, camera)) markOnce(STARTUP_MARKS.firstVisibleFrame);
    },
  });

  function onReducedMotionChange(event) {
    reducedMotion = event.matches;
    lastFrameNow = null;
    frameGovernor.setContinuous(!reducedMotion);
    frameGovernor.requestRender();
  }

  reducedMotionQuery.addEventListener?.('change', onReducedMotionChange);

  function start() {
    if (running || disposed) return;
    running = true;
    frameGovernor.start();
    frameGovernor.setContinuous(!reducedMotion);
    frameGovernor.requestRender();
  }

  function getLightingSnapshot() {
    return Object.freeze({
      neutral: lightingRig.snapshot(),
      turnEmphasis: turnEmphasis.snapshot(),
    });
  }

  function getPresentationSnapshot() {
    return Object.freeze({
      ...frameGovernor.snapshot(),
      running,
      reducedMotion,
      animationElapsedMs,
      restoredResourceGeneration,
      cameraAspect: camera.aspect,
      cameraFov: camera.fov,
      lighting: getLightingSnapshot(),
    });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    running = false;
    reducedMotionQuery.removeEventListener?.('change', onReducedMotionChange);
    unregisterResourceRestorer();
    frameGovernor.dispose();
    resources.dispose();
    lightingRig.dispose();
    scene.clear();
  }

  return Object.freeze({
    scene,
    camera,
    start,
    requestRender: () => frameGovernor.requestRender(),
    setTurnEmphasis: turnEmphasis.setActivePlayer,
    getLightingSnapshot,
    getPresentationSnapshot,
    dispose,
  });
}
