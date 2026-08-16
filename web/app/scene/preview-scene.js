import * as THREE from 'three';
import { createFrameGovernor, FRAME_GOVERNOR_POLICY } from '../camera/frame-governor.js';

export function createPreviewScene(rendererOwner) {
  if (!rendererOwner) throw new TypeError('Preview scene requires the renderer owner');

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0b1018, 0.085);

  const camera = new THREE.PerspectiveCamera(FRAME_GOVERNOR_POLICY.baseFov, 1, 0.1, 100);
  camera.position.set(0, 1.6, 6.2);
  camera.lookAt(0, 0, 0);

  const group = new THREE.Group();
  scene.add(group);

  const geometry = new THREE.TorusKnotGeometry(1.05, 0.28, 128, 20);
  const material = new THREE.MeshStandardMaterial({
    color: 0xeef2f7,
    metalness: 0.36,
    roughness: 0.28,
  });
  group.add(new THREE.Mesh(geometry, material));

  const ringGeometry = new THREE.TorusGeometry(1.85, 0.025, 12, 128);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x7385a6,
    transparent: true,
    opacity: 0.5,
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = Math.PI * 0.54;
  ring.rotation.z = Math.PI * 0.18;
  group.add(ring);

  scene.add(new THREE.HemisphereLight(0xeef5ff, 0x101722, 2.15));
  const key = new THREE.DirectionalLight(0xffffff, 3.4);
  key.position.set(4, 6, 5);
  scene.add(key);
  const rim = new THREE.PointLight(0x6d85b7, 18, 12, 2);
  rim.position.set(-3.2, 0.8, 2.4);
  scene.add(rim);

  const reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = reducedMotionQuery.matches;
  let animationElapsedMs = 0;
  let lastFrameNow = null;
  let running = false;
  let disposed = false;

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
        ring.rotation.z = Math.PI * 0.18 - t * 0.42;
      } else {
        lastFrameNow = null;
      }

      rendererOwner.render(scene, camera);
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

  function getPresentationSnapshot() {
    return Object.freeze({
      ...frameGovernor.snapshot(),
      running,
      reducedMotion,
      animationElapsedMs,
      cameraAspect: camera.aspect,
      cameraFov: camera.fov,
    });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    running = false;
    reducedMotionQuery.removeEventListener?.('change', onReducedMotionChange);
    frameGovernor.dispose();
    geometry.dispose();
    material.dispose();
    ringGeometry.dispose();
    ringMaterial.dispose();
    scene.clear();
  }

  return Object.freeze({
    scene,
    camera,
    start,
    requestRender: () => frameGovernor.requestRender(),
    getPresentationSnapshot,
    dispose,
  });
}
