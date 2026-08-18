import * as THREE from 'three';
import { createResourceRegistry, RESOURCE_KINDS, RESOURCE_OWNERSHIP } from '../core/resource-registry.js';
import { createFrameGovernor, FRAME_GOVERNOR_POLICY } from '../camera/frame-governor.js';
import { markOnce, STARTUP_MARKS } from '../perf/startup-marks.js';
import { createMinimalLightingRig, createTurnEmphasisPresentation } from './lighting-rig.js';

function createGpuFacingPreviewResources(group, materialSystem, registry, generation) {
  const lifecycle = registry.createScope(`preview-gpu:${generation}`, {
    ownership: RESOURCE_OWNERSHIP.TRANSIENT,
  });
  let hero = null;
  let ring = null;

  lifecycle.registerCleanup(() => {
    if (hero) group.remove(hero);
    if (ring) group.remove(ring);
  }, { label: 'preview-mesh-detach' });

  try {
    const geometry = new THREE.TorusKnotGeometry(1.05, 0.28, 128, 20);
    lifecycle.register(geometry, {
      kind: RESOURCE_KINDS.GEOMETRY,
      label: 'preview-hero-geometry',
    });
    hero = new THREE.Mesh(geometry, materialSystem.getSurfaceMaterial('board'));
    hero.name = 'preview:canonical-board-material';
    group.add(hero);

    const ringGeometry = new THREE.TorusGeometry(1.85, 0.025, 12, 128);
    lifecycle.register(ringGeometry, {
      kind: RESOURCE_KINDS.GEOMETRY,
      label: 'preview-ring-geometry',
    });
    ring = new THREE.Mesh(ringGeometry, materialSystem.getPlayerMaterial('marble'));
    ring.name = 'preview:canonical-marble-material';
    ring.rotation.x = Math.PI * 0.54;
    ring.rotation.z = Math.PI * 0.18;
    group.add(ring);

    return Object.freeze({
      ring,
      release: () => lifecycle.release('preview-gpu-generation-replaced'),
    });
  } catch (error) {
    lifecycle.release('preview-gpu-construction-failed');
    throw error;
  }
}

export function createPreviewScene(rendererOwner, {
  runtimeData,
  materialSystem,
  resourceRegistry = null,
} = {}) {
  if (!rendererOwner) throw new TypeError('Preview scene requires the renderer owner');
  if (!runtimeData?.materials?.palette?.wall) throw new TypeError('Preview scene requires validated canonical runtime data');
  if (!materialSystem?.getSurfaceMaterial || !materialSystem?.getPlayerMaterial) {
    throw new TypeError('Preview scene requires the canonical material system');
  }

  const ownsRegistry = !resourceRegistry;
  const registry = resourceRegistry || createResourceRegistry({ platform: window });
  const lifecycle = registry.createScope('preview-scene', {
    ownership: RESOURCE_OWNERSHIP.GENERATION_SCOPED,
  });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(runtimeData.materials.palette.wall);

  const camera = new THREE.PerspectiveCamera(FRAME_GOVERNOR_POLICY.baseFov, 1, 0.1, 100);
  camera.position.set(0, 1.6, 6.2);
  camera.lookAt(0, 0, 0);

  const group = new THREE.Group();
  scene.add(group);
  let resources = createGpuFacingPreviewResources(group, materialSystem, registry, 0);
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
    resources.release();
    resources = createGpuFacingPreviewResources(group, materialSystem, registry, generation);
    restoredResourceGeneration = generation;
    lastFrameNow = null;
  });
  lifecycle.registerCleanup(unregisterResourceRestorer, {
    kind: RESOURCE_KINDS.SUBSCRIPTION,
    label: 'preview-resource-restorer',
  });

  const frameGovernor = createFrameGovernor({
    rendererOwner,
    camera,
    resourceRegistry: registry,
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
  lifecycle.registerCleanup(() => frameGovernor.release(), {
    label: 'preview-frame-governor',
  });

  function onReducedMotionChange(event) {
    reducedMotion = event.matches;
    lastFrameNow = null;
    frameGovernor.setContinuous(!reducedMotion);
    frameGovernor.requestRender();
  }

  if (reducedMotionQuery?.addEventListener) {
    lifecycle.listen(reducedMotionQuery, 'change', onReducedMotionChange, undefined, {
      label: 'prefers-reduced-motion',
    });
  }

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
      resources: registry.snapshot(),
    });
  }

  function release() {
    if (disposed) return;
    disposed = true;
    running = false;
    resources.release();
    lightingRig.release();
    scene.clear();
    lifecycle.release('preview-scene-released');
    if (ownsRegistry) registry.dispose('preview-owned-registry-released');
  }

  return Object.freeze({
    scene,
    camera,
    start,
    requestRender: () => frameGovernor.requestRender(),
    setTurnEmphasis: turnEmphasis.setActivePlayer,
    getLightingSnapshot,
    getPresentationSnapshot,
    release,
    dispose: release,
  });
}
