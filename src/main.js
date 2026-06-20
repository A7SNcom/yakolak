import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { cloneAlignment } from "./config.js";

const canvas = document.getElementById("game");
const loaderEl = document.getElementById("loader");
const dotsEl = document.getElementById("dots");
const calPanel = document.getElementById("calPanel");
const calStatus = document.getElementById("calStatus");
const calOut = document.getElementById("calOut");

const ui = {
  settingsBtn: document.getElementById("settingsBtn"),
  calCloseBtn: document.getElementById("calCloseBtn"),
  resetBtn: document.getElementById("resetBtn"),
  cameraBtn: document.getElementById("cameraBtn"),
  copyCalBtn: document.getElementById("copyCalBtn"),
  resetCalBtn: document.getElementById("resetCalBtn"),
  target: document.getElementById("calTarget"),
  x: document.getElementById("calX"),
  y: document.getElementById("calY"),
  z: document.getElementById("calZ"),
  rotY: document.getElementById("calRotY"),
  pieceGapX: document.getElementById("pieceGapX"),
  pieceGapZ: document.getElementById("pieceGapZ"),
  pieceLift: document.getElementById("pieceLift"),
  rackLift: document.getElementById("rackLift")
};

const state = {
  alignment: cloneAlignment(),
  geoms: new Map(),
  dims: new Map(),
  mats: new Map(),
  racks: [],
  pieces: [],
  slots: [],
  turn: 0,
  step: 1,
  dragged: null,
  dragPlane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
  dragOffset: new THREE.Vector3(),
  pointer: new THREE.Vector2(),
  raycaster: new THREE.Raycaster()
};

const scene = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 2000);
camera.position.set(150, 170, 185);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 15, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 95;
controls.maxDistance = 420;
controls.maxPolarAngle = Math.PI * 0.47;

const root = new THREE.Group();
scene.add(root);

const boardGroup = new THREE.Group();
const rackGroup = new THREE.Group();
const pieceGroup = new THREE.Group();
root.add(boardGroup, rackGroup, pieceGroup);

setupLights();
setupFloor();
setupDots();
bindUi();
bindPointer();
loadAndStart();

function setupLights() {
  scene.add(new THREE.HemisphereLight(0xfff4df, 0x21170e, 1.35));

  const key = new THREE.DirectionalLight(0xffffff, 1.55);
  key.position.set(140, 220, 150);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -260;
  key.shadow.camera.right = 260;
  key.shadow.camera.top = 260;
  key.shadow.camera.bottom = -260;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffd89a, 0.55);
  fill.position.set(-160, 110, -100);
  scene.add(fill);
}

function setupFloor() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(720, 720),
    new THREE.MeshStandardMaterial({ color: 0x251c13, roughness: 0.92, metalness: 0.02 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  const grid = new THREE.GridHelper(360, 18, 0x6d5737, 0x3e3020);
  grid.position.y = 0.05;
  root.add(grid);
}

function setupDots() {
  dotsEl.innerHTML = "";
  state.alignment.players.forEach((p, i) => {
    const dot = document.createElement("div");
    dot.className = `dot${i === state.turn ? " active" : ""}`;
    dot.style.background = `#${p.color.toString(16).padStart(6, "0")}`;
    dotsEl.appendChild(dot);
  });
}

function updateDots() {
  [...dotsEl.children].forEach((dot, i) => dot.classList.toggle("active", i === state.turn));
}

async function loadAndStart() {
  try {
    const { models } = state.alignment;
    await Promise.all([
      loadModel("rack", models.rack),
      loadModel("small", models.small),
      loadModel("medium", models.medium),
      loadModel("large", models.large)
    ]);

    rebuildAll();
    loaderEl.classList.add("hide");
    animate();
  } catch (error) {
    console.error(error);
    setCalStatus("فشل تحميل ملفات STL. تأكد أن 3.stl و s.stl و m.stl و l.stl في الجذر.", true);
  }
}

function loadModel(key, model) {
  const loader = new STLLoader();
  return new Promise((resolve, reject) => {
    loader.load(model.path, (geometry) => {
      const normalized = normalizeGeometry(geometry, model);
      state.geoms.set(key, normalized.geometry);
      state.dims.set(key, normalized.dims);
      resolve();
    }, undefined, reject);
  });
}

function normalizeGeometry(geometry, model) {
  const g = geometry.clone();
  const rotateX = THREE.MathUtils.degToRad(model.rotateXDeg || 0);
  if (rotateX) g.rotateX(rotateX);

  g.computeVertexNormals();
  g.computeBoundingBox();

  const b = g.boundingBox;
  const centerX = (b.min.x + b.max.x) / 2;
  const centerZ = (b.min.z + b.max.z) / 2;
  g.translate(-centerX, -b.min.y, -centerZ);
  g.computeBoundingBox();

  const nb = g.boundingBox;
  const width = nb.max.x - nb.min.x;
  const depth = nb.max.z - nb.min.z;
  const scale = model.fit / Math.max(width || 1, depth || 1);

  g.scale(scale, scale, scale);
  g.computeBoundingBox();

  const fb = g.boundingBox;
  return {
    geometry: g,
    dims: {
      width: fb.max.x - fb.min.x,
      height: fb.max.y - fb.min.y,
      depth: fb.max.z - fb.min.z
    }
  };
}

function rebuildAll() {
  buildBoard();
  buildRacksAndPieces();
  syncCalibrationUi();
  writeOutput();
}

function clearGroup(group) {
  while (group.children.length) group.remove(group.children[0]);
}

function buildBoard() {
  clearGroup(boardGroup);
  state.slots = [];

  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(142, 4, 142),
    new THREE.MeshStandardMaterial({ color: 0x7a542d, roughness: 0.68, metalness: 0.12 })
  );
  edge.position.y = 2;
  edge.receiveShadow = true;
  boardGroup.add(edge);

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(126, 8, 126),
    new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.82, metalness: 0.05 })
  );
  base.position.y = 7;
  base.castShadow = true;
  base.receiveShadow = true;
  boardGroup.add(base);

  const cellMat = new THREE.MeshStandardMaterial({ color: 0xf4c76b, roughness: 0.58, metalness: 0.18 });
  getCellPositions().forEach((pos, index) => {
    const cell = new THREE.Mesh(
      new THREE.CylinderGeometry(state.alignment.board.cellRadius, state.alignment.board.cellRadius, 2.2, 56),
      cellMat
    );
    cell.position.set(pos.x, pos.y + 4.5, pos.z);
    cell.castShadow = true;
    cell.receiveShadow = true;
    boardGroup.add(cell);

    state.slots.push({ index, position: new THREE.Vector3(pos.x, pos.y + state.alignment.board.snapYOffset, pos.z), stack: [] });
  });
}

function getCellPositions() {
  const { cell1, cell9 } = state.alignment.board;
  const stepX = (cell9.x - cell1.x) / 2;
  const stepZ = (cell9.z - cell1.z) / 2;
  const stepY = (cell9.y - cell1.y) / 2;
  const cells = [];

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      cells.push({
        x: cell1.x + col * stepX,
        y: cell1.y + ((row + col) / 2) * stepY,
        z: cell1.z + row * stepZ
      });
    }
  }
  return cells;
}

function buildRacksAndPieces() {
  clearGroup(rackGroup);
  clearGroup(pieceGroup);
  state.racks = [];
  state.pieces = [];

  state.alignment.racks.forEach((rackCfg, playerIndex) => {
    const player = state.alignment.players[playerIndex];
    const rackMesh = makeMesh("rack", new THREE.MeshStandardMaterial({
      color: shadeColor(player.color, 0.72),
      roughness: 0.62,
      metalness: 0.18
    }));

    rackMesh.position.set(rackCfg.x, rackCfg.y + state.alignment.piecesOnRack.rackLift, rackCfg.z);
    rackMesh.rotation.y = THREE.MathUtils.degToRad(rackCfg.rotY);
    rackMesh.userData.kind = "rack";
    rackMesh.userData.player = playerIndex;
    rackGroup.add(rackMesh);
    state.racks.push(rackMesh);

    createPlayerPieces(playerIndex, rackCfg);
  });
}

function createPlayerPieces(playerIndex, rackCfg) {
  const layout = state.alignment.piecesOnRack;
  const sizes = layout.sizes || ["large", "medium", "small"];
  const sets = layout.sets || 3;
  const rackDims = state.dims.get("rack");
  const player = state.alignment.players[playerIndex];

  for (let setIndex = 0; setIndex < sets; setIndex++) {
    sizes.forEach((sizeKey, sizeIndex) => {
      const piece = makeMesh(sizeKey, getPlayerMaterial(playerIndex, player.color));
      piece.userData = {
        kind: "piece",
        player: playerIndex,
        size: sizeKey,
        home: { playerIndex, setIndex, sizeIndex },
        slotIndex: null
      };
      setPieceHomePosition(piece);
      pieceGroup.add(piece);
      state.pieces.push(piece);
    });
  }

  function setPieceHomePosition(piece) {
    const local = getRackLocalPiecePosition(piece.userData.home.sizeIndex, piece.userData.home.setIndex, rackDims.height);
    const world = localToRackWorld(local, rackCfg);
    piece.position.copy(world);
    piece.rotation.y = THREE.MathUtils.degToRad(rackCfg.rotY);
    piece.userData.homeWorld = world.clone();
  }
}

function getRackLocalPiecePosition(sizeIndex, setIndex, rackHeight) {
  const layout = state.alignment.piecesOnRack;
  const sets = layout.sets || 3;
  const x = (setIndex - (sets - 1) / 2) * layout.gapX;
  const z = layout.centerZ || 0;
  const y = rackHeight + layout.lift + sizeIndex * layout.gapZ;
  return new THREE.Vector3(x, y, z);
}

function localToRackWorld(local, rackCfg) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, THREE.MathUtils.degToRad(rackCfg.rotY), 0));
  return local.clone().applyQuaternion(q).add(new THREE.Vector3(rackCfg.x, rackCfg.y + state.alignment.piecesOnRack.rackLift, rackCfg.z));
}

function makeMesh(key, material) {
  const mesh = new THREE.Mesh(state.geoms.get(key), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function getPlayerMaterial(playerIndex, color) {
  const key = `player-${playerIndex}`;
  if (!state.mats.has(key)) {
    state.mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15 }));
  }
  return state.mats.get(key);
}

function shadeColor(color, factor) {
  const c = new THREE.Color(color);
  c.multiplyScalar(factor);
  return c.getHex();
}

function bindPointer() {
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  renderer.domElement.addEventListener("pointercancel", onPointerUp);
}

function setPointer(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  state.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  state.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  state.raycaster.setFromCamera(state.pointer, camera);
}

function onPointerDown(event) {
  if (calPanel.classList.contains("show")) return;
  setPointer(event);

  const hits = state.raycaster.intersectObjects(state.pieces, false);
  if (!hits.length) return;

  const piece = hits[0].object;
  if (piece.userData.player !== state.turn) return;

  state.dragged = piece;
  controls.enabled = false;
  canvas.classList.add("dragging");
  removePieceFromSlot(piece);

  const hitPoint = new THREE.Vector3();
  state.dragPlane.constant = -piece.position.y;
  state.raycaster.ray.intersectPlane(state.dragPlane, hitPoint);
  state.dragOffset.copy(piece.position).sub(hitPoint);
}

function onPointerMove(event) {
  if (!state.dragged) return;
  setPointer(event);

  const point = new THREE.Vector3();
  if (state.raycaster.ray.intersectPlane(state.dragPlane, point)) {
    state.dragged.position.copy(point.add(state.dragOffset));
  }
}

function onPointerUp() {
  if (!state.dragged) return;

  const piece = state.dragged;
  const slot = findNearestSlot(piece.position);

  if (slot) {
    snapPieceToSlot(piece, slot);
    state.turn = (state.turn + 1) % state.alignment.players.length;
    updateDots();
  } else {
    piece.position.copy(piece.userData.homeWorld);
  }

  state.dragged = null;
  controls.enabled = true;
  canvas.classList.remove("dragging");
}

function findNearestSlot(position) {
  let best = null;
  let bestDist = Infinity;

  state.slots.forEach(slot => {
    const d = Math.hypot(position.x - slot.position.x, position.z - slot.position.z);
    if (d < bestDist) {
      bestDist = d;
      best = slot;
    }
  });

  return bestDist <= state.alignment.board.cellRadius * 1.65 ? best : null;
}

function removePieceFromSlot(piece) {
  const index = piece.userData.slotIndex;
  if (index === null || index === undefined) return;
  const slot = state.slots[index];
  slot.stack = slot.stack.filter(p => p !== piece);
  piece.userData.slotIndex = null;
  restackSlot(slot);
}

function snapPieceToSlot(piece, slot) {
  slot.stack.push(piece);
  piece.userData.slotIndex = slot.index;
  restackSlot(slot);
}

function restackSlot(slot) {
  slot.stack.forEach((piece, stackIndex) => {
    piece.position.set(slot.position.x, slot.position.y + stackIndex * 3.2, slot.position.z);
    piece.rotation.y = 0;
  });
}

function bindUi() {
  ui.settingsBtn.addEventListener("click", () => {
    calPanel.classList.toggle("show");
    syncCalibrationUi();
  });
  ui.calCloseBtn.addEventListener("click", () => calPanel.classList.remove("show"));

  ui.resetBtn.addEventListener("click", resetPiecesOnly);
  ui.cameraBtn.addEventListener("click", resetCamera);

  ui.target.addEventListener("change", syncCalibrationUi);
  [ui.x, ui.y, ui.z, ui.rotY].forEach(input => input.addEventListener("input", applyTargetInputs));
  [ui.pieceGapX, ui.pieceGapZ, ui.pieceLift, ui.rackLift].forEach(input => input.addEventListener("input", applyPieceLayoutInputs));

  document.querySelectorAll("#calStepBtns [data-step]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.step = Number(btn.dataset.step);
      document.querySelectorAll("#calStepBtns [data-step]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  document.querySelectorAll(".calAxis [data-axis]").forEach(btn => {
    btn.addEventListener("click", () => nudge(btn.dataset.axis, Number(btn.dataset.delta) * state.step));
  });

  ui.copyCalBtn.addEventListener("click", copyAlignment);
  ui.resetCalBtn.addEventListener("click", () => {
    state.alignment = cloneAlignment();
    rebuildAll();
    setCalStatus("تم إرجاع الإعدادات الافتراضية.");
  });
}

function getSelectedTarget() {
  const value = ui.target.value;
  if (value.startsWith("rack")) {
    return { type: "rack", data: state.alignment.racks[Number(value.replace("rack", ""))] };
  }
  return { type: "cell", data: state.alignment.board[value] };
}

function syncCalibrationUi() {
  const target = getSelectedTarget();
  ui.x.value = round(target.data.x);
  ui.y.value = round(target.data.y);
  ui.z.value = round(target.data.z);
  ui.rotY.disabled = target.type !== "rack";
  ui.rotY.value = target.type === "rack" ? round(target.data.rotY) : 0;

  ui.pieceGapX.value = round(state.alignment.piecesOnRack.gapX);
  ui.pieceGapZ.value = round(state.alignment.piecesOnRack.gapZ);
  ui.pieceLift.value = round(state.alignment.piecesOnRack.lift);
  ui.rackLift.value = round(state.alignment.piecesOnRack.rackLift);
  writeOutput();
}

function applyTargetInputs() {
  const target = getSelectedTarget();
  target.data.x = Number(ui.x.value);
  target.data.y = Number(ui.y.value);
  target.data.z = Number(ui.z.value);
  if (target.type === "rack") target.data.rotY = Number(ui.rotY.value);
  rebuildAll();
}

function applyPieceLayoutInputs() {
  state.alignment.piecesOnRack.gapX = Number(ui.pieceGapX.value);
  state.alignment.piecesOnRack.gapZ = Number(ui.pieceGapZ.value);
  state.alignment.piecesOnRack.lift = Number(ui.pieceLift.value);
  state.alignment.piecesOnRack.rackLift = Number(ui.rackLift.value);
  buildRacksAndPieces();
  writeOutput();
}

function nudge(axis, delta) {
  const target = getSelectedTarget();
  target.data[axis] = Number(target.data[axis]) + delta;
  rebuildAll();
}

function writeOutput() {
  calOut.value = `const YAKLAK_ALIGNMENT = ${JSON.stringify(state.alignment, null, 2)};`;
}

async function copyAlignment() {
  writeOutput();
  try {
    await navigator.clipboard.writeText(calOut.value);
    setCalStatus("تم نسخ الإعدادات.");
  } catch {
    setCalStatus("انسخ النص يدويًا من المربع.", true);
  }
}

function setCalStatus(text, danger = false) {
  calStatus.textContent = text;
  calStatus.style.color = danger ? "#ff9f9f" : "#b6e0c6";
}

function resetPiecesOnly() {
  state.pieces.forEach(piece => {
    removePieceFromSlot(piece);
    piece.position.copy(piece.userData.homeWorld);
  });
  state.turn = 0;
  updateDots();
}

function resetCamera() {
  camera.position.set(150, 170, 185);
  controls.target.set(0, 15, 0);
  controls.update();
}

function round(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
