import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import {
  BUILD_ID,
  DEFAULT_CALIBRATION,
  PLAYER_COLORS,
  SIZE_DATA,
  STORAGE_KEY,
  WIN_LINES
} from './config.js';

const canvas = document.querySelector('#gameCanvas');
const settingsBtn = document.querySelector('#settingsBtn');
const closePanelBtn = document.querySelector('#closePanelBtn');
const panel = document.querySelector('#devPanel');
const toast = document.querySelector('#toast');
const output = document.querySelector('#calibrationOutput');

const inputs = {
  originX: document.querySelector('#originX'),
  originY: document.querySelector('#originY'),
  originZ: document.querySelector('#originZ'),
  gridStep: document.querySelector('#gridStep'),
  dropHeight: document.querySelector('#dropHeight'),
  pieceScale: document.querySelector('#pieceScale'),
  trayRadius: document.querySelector('#trayRadius')
};

const buttons = {
  copy: document.querySelector('#copyCodeBtn'),
  resetCalibration: document.querySelector('#resetCalibrationBtn'),
  resetGame: document.querySelector('#resetGameBtn')
};

let calibration = loadCalibration();
let renderer;
let scene;
let camera;
let controls;
let raycaster;
let pointer;
let dragPlane;
let boardGroup;
let slotGroup;
let trayGroup;
let pieces = [];
let slotState = makeSlotState();
let activePiece = null;
let dragBackup = null;
let toastTimer = null;
let stlLoader;
const modelGeometryCache = new Map();

init();

function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf1eadf);

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);
  camera.position.set(6.5, 7.5, 8.5);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minDistance = 4;
  controls.maxDistance = 18;

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -getPieceY());
  stlLoader = new STLLoader();

  addLights();
  addWorld();
  buildBoard();
  buildPieces();
  setupUi();
  syncInputs();
  updateCalibrationOutput();
  onResize();
  animate();

  window.addEventListener('resize', onResize);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
}

function addLights() {
  const hemi = new THREE.HemisphereLight(0xffffff, 0x7b6c5c, 1.4);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 2.3);
  key.position.set(5, 10, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 30;
  scene.add(key);
}

function addWorld() {
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(14, 96),
    new THREE.MeshStandardMaterial({ color: 0xe6daca, roughness: 0.92, metalness: 0.02 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.04;
  floor.receiveShadow = true;
  scene.add(floor);
}

function buildBoard() {
  if (boardGroup) scene.remove(boardGroup);
  boardGroup = new THREE.Group();
  slotGroup = new THREE.Group();
  scene.add(boardGroup);
  boardGroup.add(slotGroup);

  const boardSize = calibration.gridStep * 3.35;
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(boardSize, 0.14, boardSize),
    new THREE.MeshStandardMaterial({ color: 0xc7a16d, roughness: 0.78, metalness: 0.02 })
  );
  base.position.set(calibration.origin.x, calibration.origin.y - 0.08, calibration.origin.z);
  base.receiveShadow = true;
  base.castShadow = true;
  boardGroup.add(base);

  for (let i = 0; i < 9; i += 1) {
    const pos = getSlotPosition(i);
    const marker = new THREE.Mesh(
      new THREE.TorusGeometry(calibration.gridStep * 0.26, 0.018, 10, 80),
      new THREE.MeshStandardMaterial({ color: 0x6f4e2f, roughness: 0.85 })
    );
    marker.rotation.x = Math.PI / 2;
    marker.position.set(pos.x, calibration.origin.y + 0.012, pos.z);
    marker.userData.slotIndex = i;
    marker.receiveShadow = true;
    slotGroup.add(marker);

    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.035, 20),
      new THREE.MeshBasicMaterial({ color: 0x243027 })
    );
    dot.rotation.x = -Math.PI / 2;
    dot.position.set(pos.x, calibration.origin.y + 0.017, pos.z);
    slotGroup.add(dot);
  }
}

function buildPieces() {
  clearPieces();
  trayGroup = new THREE.Group();
  scene.add(trayGroup);

  for (let player = 0; player < 4; player += 1) {
    for (let set = 0; set < 3; set += 1) {
      for (const size of Object.keys(SIZE_DATA)) {
        const piece = createPiece(player, size, set);
        pieces.push(piece);
        trayGroup.add(piece);
      }
    }
  }

  layoutTrayPieces();
  tryLoadStlModels();
}

function clearPieces() {
  pieces.forEach((piece) => disposeObject(piece));
  pieces = [];
  if (trayGroup) scene.remove(trayGroup);
  slotState = makeSlotState();
}

function createPiece(player, size, set) {
  const data = SIZE_DATA[size];
  const geometry = createFallbackGeometry(size);
  const material = new THREE.MeshStandardMaterial({
    color: PLAYER_COLORS[player],
    roughness: 0.55,
    metalness: 0.06
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = {
    type: 'piece',
    player,
    size,
    set,
    slotIndex: null,
    home: new THREE.Vector3(),
    radius: data.radius
  };
  mesh.scale.setScalar(calibration.pieceScale);
  return mesh;
}

function createFallbackGeometry(size) {
  const data = SIZE_DATA[size];
  const geometry = new THREE.TorusGeometry(data.radius, data.tube, 18, 96);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

function tryLoadStlModels() {
  for (const size of Object.keys(SIZE_DATA)) {
    const fileName = calibration.modelFiles?.[size];
    if (!fileName) continue;

    const url = `${calibration.modelBaseUrl}${fileName}`;
    if (modelGeometryCache.has(url)) {
      replaceGeometryForSize(size, modelGeometryCache.get(url));
      continue;
    }

    stlLoader.load(
      url,
      (geometry) => {
        normalizeStlGeometry(geometry, SIZE_DATA[size].radius * 2);
        modelGeometryCache.set(url, geometry);
        replaceGeometryForSize(size, geometry);
      },
      undefined,
      () => {
        console.warn(`STL fallback used for ${size}: ${url}`);
      }
    );
  }
}

function normalizeStlGeometry(geometry, targetDiameter) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  geometry.translate(-center.x, -center.y, -center.z);

  const maxAxis = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetDiameter / maxAxis;
  geometry.scale(scale, scale, scale);
  geometry.computeVertexNormals();
}

function replaceGeometryForSize(size, sourceGeometry) {
  pieces
    .filter((piece) => piece.userData.size === size)
    .forEach((piece) => {
      piece.geometry.dispose();
      piece.geometry = sourceGeometry.clone();
      piece.geometry.rotateX(Math.PI / 2);
      piece.scale.setScalar(calibration.pieceScale);
    });
}

function setupUi() {
  settingsBtn.addEventListener('click', () => panel.classList.toggle('open'));
  closePanelBtn.addEventListener('click', () => panel.classList.remove('open'));

  Object.values(inputs).forEach((input) => input.addEventListener('input', onCalibrationInput));
  buttons.copy.addEventListener('click', copyCalibration);
  buttons.resetCalibration.addEventListener('click', resetCalibration);
  buttons.resetGame.addEventListener('click', resetGame);
}

function onCalibrationInput() {
  calibration.origin.x = readNumber(inputs.originX, calibration.origin.x);
  calibration.origin.y = readNumber(inputs.originY, calibration.origin.y);
  calibration.origin.z = readNumber(inputs.originZ, calibration.origin.z);
  calibration.gridStep = Math.max(0.5, readNumber(inputs.gridStep, calibration.gridStep));
  calibration.dropHeight = readNumber(inputs.dropHeight, calibration.dropHeight);
  calibration.pieceScale = Math.max(0.2, readNumber(inputs.pieceScale, calibration.pieceScale));
  calibration.trayRadius = Math.max(2, readNumber(inputs.trayRadius, calibration.trayRadius));

  saveCalibration();
  rebuildFromCalibration();
}

function rebuildFromCalibration() {
  buildBoard();
  dragPlane.constant = -getPieceY();
  pieces.forEach((piece) => {
    piece.scale.setScalar(calibration.pieceScale);
    if (piece.userData.slotIndex === null) return;
    placePiece(piece, piece.userData.slotIndex, false);
  });
  layoutTrayPieces();
  updateCalibrationOutput();
}

function syncInputs() {
  inputs.originX.value = fixed(calibration.origin.x);
  inputs.originY.value = fixed(calibration.origin.y);
  inputs.originZ.value = fixed(calibration.origin.z);
  inputs.gridStep.value = fixed(calibration.gridStep);
  inputs.dropHeight.value = fixed(calibration.dropHeight);
  inputs.pieceScale.value = fixed(calibration.pieceScale);
  inputs.trayRadius.value = fixed(calibration.trayRadius);
}

function updateCalibrationOutput() {
  const exportData = {
    build: BUILD_ID,
    note: 'one point only: origin controls all 9 slots and shared height',
    calibration
  };
  output.value = `window.YAKOLAK_ONE_POINT_CALIBRATION = ${JSON.stringify(exportData, null, 2)};`;
}

async function copyCalibration() {
  updateCalibrationOutput();
  try {
    await navigator.clipboard.writeText(output.value);
    showToast('تم نسخ كود المعايرة ✅');
  } catch {
    output.select();
    document.execCommand('copy');
    showToast('تم النسخ');
  }
}

function resetCalibration() {
  calibration = structuredClone(DEFAULT_CALIBRATION);
  saveCalibration();
  syncInputs();
  rebuildFromCalibration();
  showToast('تم تصفير المعايرة');
}

function resetGame() {
  buildPieces();
  showToast('تمت إعادة اللعب');
}

function onPointerDown(event) {
  setPointer(event);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pieces, false);
  if (!hits.length) return;

  activePiece = hits[0].object;
  dragBackup = {
    position: activePiece.position.clone(),
    slotIndex: activePiece.userData.slotIndex
  };

  if (activePiece.userData.slotIndex !== null) {
    removePieceFromSlot(activePiece);
  }

  activePiece.userData.slotIndex = null;
  activePiece.position.y = getPieceY() + 0.35;
  controls.enabled = false;
  canvas.setPointerCapture(event.pointerId);
}

function onPointerMove(event) {
  if (!activePiece) return;
  setPointer(event);
  raycaster.setFromCamera(pointer, camera);

  const hit = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(dragPlane, hit)) {
    activePiece.position.x = hit.x;
    activePiece.position.z = hit.z;
    activePiece.position.y = getPieceY() + 0.35;
  }
}

function onPointerUp(event) {
  if (!activePiece) return;

  const nearest = findNearestSlot(activePiece.position);
  if (nearest && canPlace(activePiece, nearest.index)) {
    placePiece(activePiece, nearest.index, true);
    checkWinner();
  } else {
    restoreDraggedPiece();
  }

  activePiece = null;
  dragBackup = null;
  controls.enabled = true;
  try { canvas.releasePointerCapture(event.pointerId); } catch {}
}

function placePiece(piece, slotIndex, announce) {
  const size = piece.userData.size;
  const pos = getSlotPosition(slotIndex);
  piece.position.set(pos.x, getPieceY(), pos.z);
  piece.userData.slotIndex = slotIndex;
  slotState[slotIndex][size] = piece;
  if (piece.parent !== scene) scene.add(piece);
  if (announce) showToast('تم تثبيت الحجر');
}

function restoreDraggedPiece() {
  if (!activePiece || !dragBackup) return;

  if (dragBackup.slotIndex !== null && canPlace(activePiece, dragBackup.slotIndex)) {
    placePiece(activePiece, dragBackup.slotIndex, false);
    return;
  }

  activePiece.userData.slotIndex = null;
  activePiece.position.copy(dragBackup.position);
  if (activePiece.parent !== trayGroup) trayGroup.add(activePiece);
  showToast('المكان غير مناسب');
}

function removePieceFromSlot(piece) {
  const slotIndex = piece.userData.slotIndex;
  if (slotIndex === null) return;
  const size = piece.userData.size;
  if (slotState[slotIndex]?.[size] === piece) slotState[slotIndex][size] = null;
}

function canPlace(piece, slotIndex) {
  const size = piece.userData.size;
  return !slotState[slotIndex][size];
}

function findNearestSlot(position) {
  let best = null;
  for (let i = 0; i < 9; i += 1) {
    const slot = getSlotPosition(i);
    const distance = Math.hypot(position.x - slot.x, position.z - slot.z);
    if (!best || distance < best.distance) best = { index: i, distance };
  }
  return best && best.distance <= calibration.gridStep * 0.52 ? best : null;
}

function layoutTrayPieces() {
  if (!trayGroup) return;

  const counts = new Map();
  const ordered = pieces.filter((piece) => piece.userData.slotIndex === null);

  ordered.forEach((piece) => {
    const player = piece.userData.player;
    const key = `${player}-${piece.userData.size}`;
    const count = counts.get(key) || 0;
    counts.set(key, count + 1);

    const sideAngle = player * Math.PI * 0.5 + Math.PI * 0.25;
    const sizeRank = SIZE_DATA[piece.userData.size].rank;
    const sideOffset = (count - 1) * 0.48;
    const innerOffset = (sizeRank - 1) * 0.68;

    const radial = calibration.trayRadius + innerOffset;
    const tangent = new THREE.Vector3(-Math.sin(sideAngle), 0, Math.cos(sideAngle)).multiplyScalar(sideOffset);
    const home = new THREE.Vector3(
      Math.cos(sideAngle) * radial + tangent.x,
      getPieceY(),
      Math.sin(sideAngle) * radial + tangent.z
    );

    piece.userData.home.copy(home);
    piece.position.copy(home);
    piece.rotation.y = -sideAngle;
    if (piece.parent !== trayGroup) trayGroup.add(piece);
  });
}

function checkWinner() {
  for (let player = 0; player < 4; player += 1) {
    for (const size of Object.keys(SIZE_DATA)) {
      for (const line of WIN_LINES) {
        if (line.every((slot) => slotState[slot][size]?.userData.player === player)) {
          showToast(`فاز اللاعب ${player + 1} 🎉`);
          return;
        }
      }
    }

    for (let slot = 0; slot < 9; slot += 1) {
      const fullSpot = Object.keys(SIZE_DATA).every((size) => slotState[slot][size]?.userData.player === player);
      if (fullSpot) {
        showToast(`فاز اللاعب ${player + 1} 🎉`);
        return;
      }
    }

    for (const line of WIN_LINES) {
      const ascending = ['small', 'medium', 'large'].every((size, index) => slotState[line[index]][size]?.userData.player === player);
      const descending = ['large', 'medium', 'small'].every((size, index) => slotState[line[index]][size]?.userData.player === player);
      if (ascending || descending) {
        showToast(`فاز اللاعب ${player + 1} 🎉`);
        return;
      }
    }
  }
}

function getSlotPosition(index) {
  const row = Math.floor(index / 3);
  const col = index % 3;
  return new THREE.Vector3(
    calibration.origin.x + (col - 1) * calibration.gridStep,
    calibration.origin.y,
    calibration.origin.z + (row - 1) * calibration.gridStep
  );
}

function getPieceY() {
  return calibration.origin.y + calibration.dropHeight;
}

function makeSlotState() {
  return Array.from({ length: 9 }, () => ({ small: null, medium: null, large: null }));
}

function loadCalibration() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return mergeCalibration(DEFAULT_CALIBRATION, saved || {});
  } catch {
    return structuredClone(DEFAULT_CALIBRATION);
  }
}

function mergeCalibration(defaults, saved) {
  return {
    ...structuredClone(defaults),
    ...saved,
    origin: { ...defaults.origin, ...(saved.origin || {}) },
    modelFiles: { ...defaults.modelFiles, ...(saved.modelFiles || {}) }
  };
}

function saveCalibration() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(calibration));
}

function setPointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
}

function readNumber(input, fallback) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function fixed(value) {
  return Number(value).toFixed(2).replace(/\.00$/, '');
}

function disposeObject(object) {
  object.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose?.());
    else child.material?.dispose?.();
  });
}
