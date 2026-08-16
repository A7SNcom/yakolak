import * as THREE from 'three';

export class WebGLNotSupportedError extends Error {
  constructor(message = 'WebGL 2 is unavailable') {
    super(message);
    this.name = 'WebGLNotSupportedError';
  }
}

function supportsWebGL2() {
  const probe = document.createElement('canvas');
  return Boolean(probe.getContext('webgl2', { failIfMajorPerformanceCaveat: false }));
}

export function createRendererShell(canvas) {
  if (!supportsWebGL2()) throw new WebGLNotSupportedError();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x0b1018, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

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
  const knot = new THREE.Mesh(geometry, material);
  group.add(knot);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.85, 0.025, 12, 128),
    new THREE.MeshBasicMaterial({ color: 0x7385a6, transparent: true, opacity: 0.5 }),
  );
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
  let disposed = false;

  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const targetWidth = Math.floor(width * renderer.getPixelRatio());
    const targetHeight = Math.floor(height * renderer.getPixelRatio());
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
  }

  function render(now) {
    if (disposed) return;
    resize();
    if (!reducedMotion) {
      const t = (now - startedAt) * 0.00022;
      group.rotation.y = t;
      group.rotation.x = Math.sin(t * 0.8) * 0.11;
      ring.rotation.z = Math.PI * 0.18 - t * 0.42;
    }
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(render);
  }

  frameId = requestAnimationFrame(render);

  return {
    renderer,
    scene,
    camera,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frameId);
      geometry.dispose();
      material.dispose();
      ring.geometry.dispose();
      ring.material.dispose();
      renderer.dispose();
    },
  };
}
