import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { cloneAlignment } from "./config.js?v=003";
const $ = (id) => document.getElementById(id);
const canvas = $("game");
const loaderEl = $("loader");
const dotsEl = $("dots");
const panel = $("calPanel");
const out = $("calOut");
const statusEl = $("calStatus");
const ui = {
settings: $("settingsBtn"),
close: $("calCloseBtn"),
reset: $("resetBtn"),
camera: $("cameraBtn"),
copy: $("copyCalBtn"),
resetCal: $("resetCalBtn"),
target: $("calTarget"),
x: $("calX"),
y: $("calY"),
z: $("calZ"),
rotY: $("calRotY"),
gapX: $("pieceGapX"),
gapZ: $("pieceGapZ"),
lift: $("pieceLift"),
rackLift: $("rackLift")
};
const state = {
cfg: cloneAlignment(),
geoms: new Map(),
dims: new Map(),
mats: new Map(),
racks: [],
pieces: [],
slots: [],
turn: 0,
step: 1,
drag: null,
pointer: new THREE.Vector2(),
ray: new THREE.Raycaster(),
plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
offset: new THREE.Vector3()
};
window.YAKLAK_ALIGNMENT = state.cfg;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 2000);
camera.position.set(155, 165, 185);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 14, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 85;
controls.maxDistance = 430;
controls.maxPolarAngle = Math.PI * 0.49;
const root = new THREE.Group();
const boardGroup = new THREE.Group();
const rackGroup = new THREE.Group();
const pieceGroup = new THREE.Group();
scene.add(root);
root.add(boardGroup, rackGroup, pieceGroup);
init();
async function init() {
try {
setupLights();
setupFloor();
setupDots();
bindUI();
bindDrag();
const m = state.cfg.models;
await Promise.all([
loadSTL("rack", m.rack),
loadSTL("small", m.small),
loadSTL("medium", m.medium),
loadSTL("large", m.large)
]);
rebuild();
loaderEl.classList.add("hide");
animate();
} catch (e) {
console.error(e);
setStatus("فشل تحميل ملفات المجسمات.", true);
}
}
function setupLights() {
scene.add(new THREE.HemisphereLight(0xfff4df, 0x21170e, 1.3));
const key = new THREE.DirectionalLight(0xffffff, 1.55);
key.position.set(140, 220, 150);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -260;
key.shadow.camera.right = 260;
key.shadow.camera.top = 260;
key.shadow.camera.bottom = -260;
scene.add(key);
const fill = new THREE.DirectionalLight(0xffd89a, 0.45);
fill.position.set(-160, 120, -110);
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
function loadSTL(key, model) {
return new Promise((resolve, reject) => {
new STLLoader().load(model.path, (geo) => {
const normalized = normalizeGeometry(geo, model);
state.geoms.set(key, normalized.geometry);
state.dims.set(key, normalized.dims);
resolve();
}, undefined, reject);
});
}
function normalizeGeometry(geo, model) {
const g = geo.clone();
const rx = THREE.MathUtils.degToRad(model.rotateXDeg || 0);
if (rx) g.rotateX(rx);
g.computeVertexNormals();
g.computeBoundingBox();
let b = g.boundingBox;
g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
g.computeBoundingBox();
b = g.boundingBox;
const sizeX = b.max.x - b.min.x;
const sizeZ = b.max.z - b.min.z;
const scale = model.fit / Math.max(sizeX || 1, sizeZ || 1);
g.scale(scale, scale, scale);
g.computeBoundingBox();
b = g.boundingBox;
return {
geometry: g,
dims: {
width: b.max.x - b.min.x,
height: b.max.y - b.min.y,
depth: b.max.z - b.min.z
}
};
}
function rebuild() {
buildBoard();
buildRacks();
syncUI();
writeOut();
}
function clear(group) {
while (group.children.length) group.remove(group.children[0]);
}
function buildBoard() {
clear(boardGroup);
state.slots = [];
const rim = new THREE.Mesh(
new THREE.BoxGeometry(142, 4, 142),
new THREE.MeshStandardMaterial({ color: 0x7a542d, roughness: 0.68, metalness: 0.12 })
);
rim.position.y = 2;
rim.receiveShadow = true;
boardGroup.add(rim);
const top = new THREE.Mesh(
new THREE.BoxGeometry(126, 8, 126),
new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.82, metalness: 0.05 })
);
top.position.y = 7;
top.castShadow = true;
top.receiveShadow = true;
boardGroup.add(top);
const mat = new THREE.MeshStandardMaterial({ color: 0xf4c76b, roughness: 0.58, metalness: 0.18 });
cells().forEach((p, i) => {
const cell = new THREE.Mesh(new THREE.CylinderGeometry(state.cfg.board.cellRadius, state.cfg.board.cellRadius, 2.2, 56), mat);
cell.position.set(p.x, p.y + 4.5, p.z);
cell.castShadow = true;
cell.receiveShadow = true;
boardGroup.add(cell);
state.slots.push({ index: i, position: new THREE.Vector3(p.x, p.y + state.cfg.board.snapYOffset, p.z), stack: [] });
});
}
function cells() {
const { cell1, cell9 } = state.cfg.board;
const dx = (cell9.x - cell1.x) / 2;
const dy = (cell9.y - cell1.y) / 2;
const dz = (cell9.z - cell1.z) / 2;
const arr = [];
for (let r = 0; r < 3; r++) {
for (let c = 0; c < 3; c++) {
arr.push({ x: cell1.x + c * dx, y: cell1.y + ((r + c) / 2) * dy, z: cell1.z + r * dz });
}
}
return arr;
}
function buildRacks() {
clear(rackGroup);
clear(pieceGroup);
state.racks = [];
state.pieces = [];
state.cfg.racks.forEach((rack, playerIndex) => {
const tray = mesh("rack", new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.78, metalness: 0.1 }));
tray.position.set(rack.x, rack.y + state.cfg.piecesOnRack.rackLift, rack.z);
tray.rotation.y = THREE.MathUtils.degToRad(rack.rotY);
tray.userData = { kind: "rack", player: playerIndex };
rackGroup.add(tray);
state.racks.push(tray);
createPieces(playerIndex, rack);
});
}
function createPieces(playerIndex, rack) {
const layout = state.cfg.piecesOnRack;
const sizes = layout.sizes || ["large", "medium", "small"];
const sets = layout.sets || 3;
const rackHeight = state.dims.get("rack").height;
const player = state.cfg.players[playerIndex];
for (let setIndex = 0; setIndex < sets; setIndex++) {
sizes.forEach((size, sizeIndex) => {
const p = mesh(size, playerMaterial(playerIndex, player.color));
p.userData = { kind: "piece", player: playerIndex, size, home: { setIndex, sizeIndex }, slotIndex: null };
const local = rackLocal(sizeIndex, setIndex, rackHeight);
const world = toRackWorld(local, rack);
p.position.copy(world);
p.rotation.y = THREE.MathUtils.degToRad(rack.rotY);
p.userData.homeWorld = world.clone();
pieceGroup.add(p);
state.pieces.push(p);
});
}
}
function rackLocal(sizeIndex, setIndex, rackHeight) {
const l = state.cfg.piecesOnRack;
const sets = l.sets || 3;
return new THREE.Vector3(
(setIndex - (sets - 1) / 2) * l.gapX,
rackHeight + l.lift + sizeIndex * l.gapZ,
l.centerZ || 0
);
}
function toRackWorld(local, rack) {
const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, THREE.MathUtils.degToRad(rack.rotY), 0));
return local.clone().applyQuaternion(q).add(new THREE.Vector3(rack.x, rack.y + state.cfg.piecesOnRack.rackLift, rack.z));
}
function mesh(key, mat) {
const m = new THREE.Mesh(state.geoms.get(key), mat);
m.castShadow = true;
m.receiveShadow = true;
return m;
}
function playerMaterial(i, color) {
const key = `p-${i}`;
if (!state.mats.has(key)) state.mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.58, metalness: 0.1 }));
return state.mats.get(key);
}
function setupDots() {
dotsEl.innerHTML = "";
state.cfg.players.forEach((p, i) => {
const dot = document.createElement("div");
dot.className = `dot${i === state.turn ? " active" : ""}`;
dot.style.background = `#${p.color.toString(16).padStart(6, "0")}`;
dotsEl.appendChild(dot);
});
}
function updateDots() {
[...dotsEl.children].forEach((d, i) => d.classList.toggle("active", i === state.turn));
}
function bindDrag() {
canvas.addEventListener("pointerdown", down);
canvas.addEventListener("pointermove", move);
canvas.addEventListener("pointerup", up);
canvas.addEventListener("pointercancel", up);
}
function setPointer(e) {
const r = canvas.getBoundingClientRect();
state.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
state.pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
state.ray.setFromCamera(state.pointer, camera);
}
function down(e) {
if (panel.classList.contains("show")) return;
setPointer(e);
const hit = state.ray.intersectObjects(state.pieces, false)[0];
if (!hit || hit.object.userData.player !== state.turn) return;
state.drag = hit.object;
controls.enabled = false;
canvas.classList.add("dragging");
removeFromSlot(state.drag);
const point = new THREE.Vector3();
state.plane.constant = -state.drag.position.y;
state.ray.ray.intersectPlane(state.plane, point);
state.offset.copy(state.drag.position).sub(point);
}
function move(e) {
if (!state.drag) return;
setPointer(e);
const point = new THREE.Vector3();
if (state.ray.ray.intersectPlane(state.plane, point)) state.drag.position.copy(point.add(state.offset));
}
function up() {
if (!state.drag) return;
const piece = state.drag;
const slot = nearestSlot(piece.position);
if (slot) {
snap(piece, slot);
state.turn = (state.turn + 1) % state.cfg.players.length;
updateDots();
} else {
piece.position.copy(piece.userData.homeWorld);
piece.rotation.y = THREE.MathUtils.degToRad(state.cfg.racks[piece.userData.player].rotY);
}
state.drag = null;
controls.enabled = true;
canvas.classList.remove("dragging");
}
function nearestSlot(pos) {
let best = null;
let bestDist = Infinity;
for (const s of state.slots) {
const d = Math.hypot(pos.x - s.position.x, pos.z - s.position.z);
if (d < bestDist) {
bestDist = d;
best = s;
}
}
return bestDist <= state.cfg.board.cellRadius * 1.65 ? best : null;
}
function removeFromSlot(piece) {
const idx = piece.userData.slotIndex;
if (idx === null || idx === undefined) return;
const slot = state.slots[idx];
slot.stack = slot.stack.filter((p) => p !== piece);
piece.userData.slotIndex = null;
restack(slot);
}
function snap(piece, slot) {
slot.stack.push(piece);
piece.userData.slotIndex = slot.index;
restack(slot);
}
function restack(slot) {
slot.stack.forEach((piece, i) => {
piece.position.set(slot.position.x, slot.position.y + i * 3.2, slot.position.z);
piece.rotation.y = 0;
});
}
function bindUI() {
ui.settings.addEventListener("click", () => {
panel.classList.toggle("show");
syncUI();
});
ui.close.addEventListener("click", () => panel.classList.remove("show"));
ui.reset.addEventListener("click", resetPieces);
ui.camera.addEventListener("click", resetCamera);
ui.target.addEventListener("change", syncUI);
[ui.x, ui.y, ui.z, ui.rotY].forEach((el) => el.addEventListener("input", applyTarget));
[ui.gapX, ui.gapZ, ui.lift, ui.rackLift].forEach((el) => el.addEventListener("input", applyLayout));
document.querySelectorAll("#calStepBtns [data-step]").forEach((btn) => {
btn.addEventListener("click", () => {
state.step = Number(btn.dataset.step);
document.querySelectorAll("#calStepBtns [data-step]").forEach((b) => b.classList.remove("active"));
btn.classList.add("active");
});
});
document.querySelectorAll(".calAxis [data-axis]").forEach((btn) => {
btn.addEventListener("click", () => nudge(btn.dataset.axis, Number(btn.dataset.delta) * state.step));
});
ui.copy.addEventListener("click", copySettings);
ui.resetCal.addEventListener("click", () => {
state.cfg = cloneAlignment();
window.YAKLAK_ALIGNMENT = state.cfg;
rebuild();
setStatus("تم إرجاع الإعدادات الافتراضية.");
});
}
function selected() {
const v = ui.target.value;
if (v.startsWith("rack")) return { type: "rack", data: state.cfg.racks[Number(v.replace("rack", ""))] };
return { type: "cell", data: state.cfg.board[v] };
}
function syncUI() {
const t = selected();
ui.x.value = round(t.data.x);
ui.y.value = round(t.data.y);
ui.z.value = round(t.data.z);
ui.rotY.disabled = t.type !== "rack";
ui.rotY.value = t.type === "rack" ? round(t.data.rotY) : 0;
ui.gapX.value = round(state.cfg.piecesOnRack.gapX);
ui.gapZ.value = round(state.cfg.piecesOnRack.gapZ);
ui.lift.value = round(state.cfg.piecesOnRack.lift);
ui.rackLift.value = round(state.cfg.piecesOnRack.rackLift);
writeOut();
}
function applyTarget() {
const t = selected();
t.data.x = Number(ui.x.value);
t.data.y = Number(ui.y.value);
t.data.z = Number(ui.z.value);
if (t.type === "rack") t.data.rotY = Number(ui.rotY.value);
rebuild();
}
function applyLayout() {
const l = state.cfg.piecesOnRack;
l.gapX = Number(ui.gapX.value);
l.gapZ = Number(ui.gapZ.value);
l.lift = Number(ui.lift.value);
l.rackLift = Number(ui.rackLift.value);
buildRacks();
writeOut();
}
function nudge(axis, delta) {
const t = selected();
t.data[axis] = Number(t.data[axis]) + delta;
rebuild();
}
function writeOut() {
out.value = `const YAKLAK_ALIGNMENT = ${JSON.stringify(state.cfg, null, 2)};`;
}
async function copySettings() {
writeOut();
try {
await navigator.clipboard.writeText(out.value);
setStatus("تم نسخ الإعدادات.");
} catch {
setStatus("انسخ النص يدويًا من المربع.", true);
}
}
function setStatus(text, danger = false) {
statusEl.textContent = text;
statusEl.style.color = danger ? "#ff9f9f" : "#b6e0c6";
}
function resetPieces() {
for (const piece of state.pieces) {
removeFromSlot(piece);
piece.position.copy(piece.userData.homeWorld);
piece.rotation.y = THREE.MathUtils.degToRad(state.cfg.racks[piece.userData.player].rotY);
}
state.turn = 0;
updateDots();
}
function resetCamera() {
camera.position.set(155, 165, 185);
controls.target.set(0, 14, 0);
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
