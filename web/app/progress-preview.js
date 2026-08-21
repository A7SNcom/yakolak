import * as THREE from 'three';
import { decodeGlbComponents } from './assets/glb-components.js';

const mount = document.querySelector('#stage');
const status = document.querySelector('#status');
const statusText = status?.querySelector('span:last-child');

function setStatus(text, state = '') {
  if (statusText) statusText.textContent = text;
  if (status) status.className = `card status ${state}`.trim();
}

function material(color, roughness = 0.72, metalness = 0.03) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

const materials = {
  board: material(0xd8d6cf, 0.82, 0),
  marble: material(0xf2f0ea, 0.86, 0),
  blue: material(0x2866b1, 0.68, 0),
  gold: material(0xc9a34b, 0.45, 0.08),
  green: material(0x39865a, 0.62, 0),
  floor: material(0x171b20, 0.95, 0),
};

async function loadDecoded(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path} → HTTP ${response.status}`);
  return decodeGlbComponents(await response.arrayBuffer());
}

function groupFromDecoded(decoded, mat) {
  const group = new THREE.Group();
  for (const component of decoded.components) {
    const mesh = new THREE.Mesh(component.geometry, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
  }
  return group;
}

function centerAndScale(group, targetMaxDimension) {
  group.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  group.position.sub(center);
  const max = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetMaxDimension / max;
  group.scale.setScalar(scale);
  group.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(group);
  box.getSize(size);
  return { box, size, scale };
}

function flattenToY(group) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (size.x <= size.y && size.x <= size.z) group.rotation.z = Math.PI / 2;
  else if (size.z <= size.x && size.z <= size.y) group.rotation.x = -Math.PI / 2;
  group.updateMatrixWorld(true);
  const oriented = new THREE.Box3().setFromObject(group);
  const minY = oriented.min.y;
  group.position.y -= minY;
}

function cloneAsset(decoded, mat, targetMaxDimension) {
  const group = groupFromDecoded(decoded, mat);
  centerAndScale(group, targetMaxDimension);
  flattenToY(group);
  return group;
}

function addPieceStack(root, decodedPieces, mat, basePosition, rotationY) {
  const offsets = [-0.28, 0, 0.28];
  const targets = [0.22, 0.29, 0.37];
  decodedPieces.forEach((decoded, index) => {
    const piece = cloneAsset(decoded, mat, targets[index]);
    const local = new THREE.Vector3(offsets[index], 0.025, 0.48);
    local.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
    piece.position.add(basePosition).add(local);
    piece.rotation.y += rotationY;
    root.add(piece);
  });
}

async function main() {
  if (!mount) throw new Error('Missing preview mount');
  if (!globalThis.WebGL2RenderingContext) throw new Error('WebGL 2 غير متاح على هذا المتصفح');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x080a0d, 1);
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x080a0d, 10, 22);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 60);
  camera.position.set(6.4, 5.8, 7.4);
  camera.lookAt(0, 0.55, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x26303a, 1.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(4.5, 8, 5.5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xaac7ff, 0.75);
  fill.position.set(-5, 4, -3);
  scene.add(fill);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(8.5, 64), materials.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.015;
  scene.add(floor);

  setStatus('تحميل GLB الحقيقية…');
  const [boardDecoded, baseDecoded, smallDecoded, mediumDecoded, largeDecoded] = await Promise.all([
    loadDecoded('./assets/models/board-and-lid.glb'),
    loadDecoded('./assets/models/player-base.glb'),
    loadDecoded('./assets/models/piece-small.glb'),
    loadDecoded('./assets/models/piece-medium.glb'),
    loadDecoded('./assets/models/piece-large.glb'),
  ]);

  const root = new THREE.Group();
  scene.add(root);

  const board = cloneAsset(boardDecoded, materials.board, 4.6);
  board.position.y = 0.05;
  root.add(board);

  const seatDefs = [
    { mat: materials.marble, pos: new THREE.Vector3(0, 0, 3.15), rot: Math.PI },
    { mat: materials.blue, pos: new THREE.Vector3(-3.15, 0, 0), rot: Math.PI / 2 },
    { mat: materials.gold, pos: new THREE.Vector3(0, 0, -3.15), rot: 0 },
    { mat: materials.green, pos: new THREE.Vector3(3.15, 0, 0), rot: -Math.PI / 2 },
  ];

  for (const seat of seatDefs) {
    const base = cloneAsset(baseDecoded, seat.mat, 1.25);
    base.position.add(seat.pos);
    base.rotation.y += seat.rot;
    root.add(base);
    addPieceStack(root, [smallDecoded, mediumDecoded, largeDecoded], seat.mat, seat.pos, seat.rot);
  }

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(4.55, 4.6, 96),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.09, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.008;
  root.add(ring);

  setStatus('Three.js شغال · مجسمات المشروع محملة', 'ok');

  let desiredYaw = -0.32;
  let yaw = desiredYaw;
  let dragging = false;
  let pointerX = 0;
  let autoRotate = true;

  renderer.domElement.addEventListener('pointerdown', (event) => {
    dragging = true;
    autoRotate = false;
    pointerX = event.clientX;
    renderer.domElement.setPointerCapture?.(event.pointerId);
  });
  renderer.domElement.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const delta = event.clientX - pointerX;
    pointerX = event.clientX;
    desiredYaw += delta * 0.008;
  });
  const endDrag = () => { dragging = false; };
  renderer.domElement.addEventListener('pointerup', endDrag);
  renderer.domElement.addEventListener('pointercancel', endDrag);

  const resize = () => {
    const width = innerWidth;
    const height = innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize, { passive: true });
  resize();

  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (autoRotate) desiredYaw += dt * 0.075;
    yaw += (desiredYaw - yaw) * Math.min(1, dt * 8);
    root.rotation.y = yaw;
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main().catch((error) => {
  console.error('[yakolak-progress-preview]', error);
  setStatus(`فشل المعاينة: ${error.message || error}`, 'bad');
});
