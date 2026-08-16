import * as THREE from 'three';

export function createPreviewScene(rendererOwner) {
  if (!rendererOwner) throw new TypeError('Preview scene requires the renderer owner');

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0b1018, 0.085);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
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

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const startedAt = performance.now();
  let frameId = 0;
  let running = false;
  let disposed = false;

  function draw(now) {
    if (!running || disposed) return;

    const { width, height, resized } = rendererOwner.resizeToDisplaySize();
    const aspect = width / height;
    if (resized || camera.aspect !== aspect) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }

    if (!reducedMotion) {
      const t = (now - startedAt) * 0.00022;
      group.rotation.y = t;
      group.rotation.x = Math.sin(t * 0.8) * 0.11;
      ring.rotation.z = Math.PI * 0.18 - t * 0.42;
    }

    rendererOwner.render(scene, camera);
    frameId = requestAnimationFrame(draw);
  }

  function start() {
    if (running || disposed) return;
    running = true;
    frameId = requestAnimationFrame(draw);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    running = false;
    cancelAnimationFrame(frameId);
    geometry.dispose();
    material.dispose();
    ringGeometry.dispose();
    ringMaterial.dispose();
    scene.clear();
  }

  return Object.freeze({ scene, camera, start, dispose });
}
