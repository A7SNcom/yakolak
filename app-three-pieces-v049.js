import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';

const V = 'v049-three-pieces-only';
const PIECES = [
  { file: 'l', x: -62 },
  { file: 'm', x: 0 },
  { file: 's', x: 62 }
];

const root = document.getElementById('view');
const hint = document.getElementById('hint');
const settingsBtn = document.getElementById('settingsBtn');
const panel = document.getElementById('panel');

if (settingsBtn) settingsBtn.style.display = 'none';
if (panel) panel.style.display = 'none';
if (hint) hint.textContent = 'loading three pieces...';

document.body.style.background = '#6f6f6f';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6f6f6f);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.01, 100000);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
root.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = true;
controls.enableZoom = true;

scene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 2.2));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
keyLight.position.set(120, 220, 160);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 0.65);
fillLight.position.set(-160, 120, -140);
scene.add(fillLight);

const loader = new STLLoader();
const pieceMaterial = new THREE.MeshStandardMaterial({
  color: 0xf7f5ee,
  roughness: 0.82,
  metalness: 0
});

function rad(value) {
  return THREE.MathUtils.degToRad(value);
}

function prepareGeometry(geometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  geometry.translate(
    -(box.min.x + box.max.x) / 2,
    -(box.min.y + box.max.y) / 2,
    -box.min.z
  );
  geometry.computeVertexNormals();
  return geometry;
}

function loadSinglePiece(piece) {
  return new Promise((resolve, reject) => {
    loader.load(
      `./${piece.file}.stl?v=${V}`,
      geometry => {
        prepareGeometry(geometry);

        const group = new THREE.Group();
        group.position.set(piece.x, 0, 0);
        group.rotation.set(rad(-90), 0, 0);

        const mesh = new THREE.Mesh(geometry, pieceMaterial);
        group.add(mesh);
        scene.add(group);

        resolve(group);
      },
      undefined,
      error => reject(error)
    );
  });
}

function fitCamera(objects) {
  const box = new THREE.Box3();
  objects.forEach(object => box.expandByObject(object));

  const center = box.getCenter(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 1);

  camera.position.set(
    center.x + radius * 0.55,
    center.y + radius * 1.05,
    center.z + radius * 2.35
  );
  camera.near = Math.max(radius / 1000, 0.01);
  camera.far = radius * 40;
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.update();
}

Promise.all(PIECES.map(loadSinglePiece))
  .then(objects => {
    fitCamera(objects);
    if (hint) hint.style.display = 'none';
  })
  .catch(() => {
    if (hint) hint.textContent = 'piece load failed';
  });

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();
