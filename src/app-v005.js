import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { cloneAlignment } from './config.js?v=005';

const $ = id => document.getElementById(id);
const canvas = $('game'), panel = $('calPanel'), loader = $('loader'), dots = $('dots');
const cfg = cloneAlignment();
window.YAKLAK_ALIGNMENT = cfg;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 2500);
camera.position.set(170, 170, 190);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const orbit = new OrbitControls(camera, canvas);
orbit.target.set(0, 18, 0);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;
orbit.minDistance = 70;
orbit.maxDistance = 620;
orbit.maxPolarAngle = Math.PI * 0.49;

const transform = new TransformControls(camera, renderer.domElement);
transform.setSpace('local');
scene.add(transform);
transform.addEventListener('dragging-changed', e => orbit.enabled = !e.value);
transform.addEventListener('objectChange', () => syncSelectedFromObject(false));
transform.addEventListener('mouseUp', () => syncSelectedFromObject(true));

const root = new THREE.Group();
const boardRoot = new THREE.Group();
const rackLayer = new THREE.Group();
const pieceLayer = new THREE.Group();
const markerLayer = new THREE.Group();
scene.add(root);
root.add(boardRoot, rackLayer, pieceLayer, markerLayer);

const raw = {}, geos = {}, dims = {}, mats = {}, pieces = [], slots = [];
const objects = new Map();
let selectedKey = 'board', turn = 0, dragPiece = null;
const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), dragOffset = new THREE.Vector3();

setupLights();
setupFloor();
setupPanel();
setupDots();
bindUI();
bindPieceDrag();
loadAndStart();

async function loadAndStart() {
  try {
    await Promise.all(Object.entries(cfg.models).map(([k, m]) => loadSTL(k, m.path)));
    rebuildAll();
    selectObject('board');
    loader.classList.add('hide');
    animate();
  } catch (e) {
    console.error(e);
    setStatus('فشل تحميل STL. تأكد من 9.stl و 3.stl و s/m/l.stl', true);
  }
}

function loadSTL(key, path) {
  return new Promise((resolve, reject) => new STLLoader().load(path, g => { raw[key] = g; resolve(); }, undefined, reject));
}

function setupLights() {
  scene.add(new THREE.HemisphereLight(0xfff4df, 0x21170e, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 1.65);
  key.position.set(150, 230, 160);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -320; key.shadow.camera.right = 320; key.shadow.camera.top = 320; key.shadow.camera.bottom = -320;
  scene.add(key);
}

function setupFloor() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(850, 850), new THREE.MeshStandardMaterial({ color: 0x251c13, roughness: 0.92 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);
  const grid = new THREE.GridHelper(420, 21, 0x6d5737, 0x3e3020);
  grid.position.y = 0.04;
  root.add(grid);
}

function setupPanel() {
  panel.innerHTML = `<div class="calHead"><b>معايرة 3D حقيقية</b><button class="calBtn" id="calCloseBtn">×</button></div>
  <div class="calHint">البورد الآن من 9.stl. استخدم أسهم التحريك/التدوير/التكبير داخل المشهد، ثم انسخ الإعدادات.</div>
  <label class="field full"><span>العنصر</span><select id="calTarget"></select></label>
  <div class="calRow"><button class="calBtn active" data-mode="translate">تحريك</button><button class="calBtn" data-mode="rotate">تدوير</button><button class="calBtn" data-mode="scale">تكبير</button><button class="calBtn" id="spaceBtn">Local</button></div>
  <div class="calGrid"><label class="field"><span>X</span><input id="calX" type="number" step="0.1"></label><label class="field"><span>Y</span><input id="calY" type="number" step="0.1"></label><label class="field"><span>Z</span><input id="calZ" type="number" step="0.1"></label><label class="field"><span>RX</span><input id="calRX" type="number" step="0.1"></label><label class="field"><span>RY</span><input id="calRY" type="number" step="0.1"></label><label class="field"><span>RZ</span><input id="calRZ" type="number" step="0.1"></label><label class="field"><span>SX</span><input id="calSX" type="number" step="0.01"></label><label class="field"><span>SY</span><input id="calSY" type="number" step="0.01"></label><label class="field"><span>SZ</span><input id="calSZ" type="number" step="0.01"></label><label class="field"><span>Fit / Radius</span><input id="calFit" type="number" step="0.1"></label></div>
  <div class="calRow"><button class="calBtn primary" id="copyCalBtn">نسخ الإعدادات</button><button class="calBtn" id="saveLocalBtn">حفظ محلي</button><button class="calBtn" id="loadLocalBtn">استرجاع</button><button class="calBtn danger" id="resetCalBtn">إعادة</button></div>
  <textarea id="calOut" readonly></textarea><div class="calStatus" id="calStatus"></div>`;
  const target = $('calTarget');
  const opts = [['board','البورد الحقيقي 9.stl'], ['boardModel','اتجاه/حجم موديل البورد'], ['cellRadius','حجم نقاط اللعب']];
  for (let i = 0; i < 9; i++) opts.push([`cell:${i}`, `مكان اللعب على البورد ${i + 1}`]);
  for (let i = 0; i < 4; i++) opts.push([`rack:${i}`, `قاعدة اللاعب ${i + 1}`]);
  for (let p = 0; p < 4; p++) for (let h = 0; h < 3; h++) opts.push([`home:${p}:${h}`, `مكان حجارة لاعب ${p + 1} مجموعة ${h + 1}`]);
  for (const s of ['large','medium','small']) opts.push([`piece:${s}`, `تداخل/اتجاه حجر ${s}`]);
  for (const m of ['rack','large','medium','small']) opts.push([`model:${m}`, `اتجاه/حجم موديل ${m}`]);
  target.innerHTML = opts.map(([v,t]) => `<option value="${v}">${t}</option>`).join('');
}

function setupDots() {
  dots.innerHTML = '';
  cfg.players.forEach((p, i) => { const d = document.createElement('div'); d.className = `dot${i === turn ? ' active' : ''}`; d.style.background = `#${p.color.toString(16).padStart(6,'0')}`; dots.appendChild(d); });
}
function updateDots(){ [...dots.children].forEach((d,i)=>d.classList.toggle('active', i===turn)); }

function normalizedGeometry(key) {
  const m = cfg.models[key], g = raw[key].clone();
  g.rotateX(rad(m.rx)); g.rotateY(rad(m.ry)); g.rotateZ(rad(m.rz));
  g.computeVertexNormals(); g.computeBoundingBox();
  let b = g.boundingBox;
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y + (m.yOffset || 0), -(b.min.z + b.max.z) / 2);
  g.computeBoundingBox(); b = g.boundingBox;
  const scale = (m.fit || 1) / Math.max((b.max.x - b.min.x) || 1, (b.max.z - b.min.z) || 1);
  g.scale(scale * (m.sx || 1), scale * (m.sy || 1), scale * (m.sz || 1));
  g.computeBoundingBox(); b = g.boundingBox;
  geos[key] = g; dims[key] = { h: b.max.y - b.min.y };
}
function rebuildGeos(){ Object.keys(cfg.models).forEach(normalizedGeometry); }

function rebuildAll() {
  transform.detach(); objects.clear(); pieces.length = 0; slots.length = 0;
  rebuildGeos(); clear(boardRoot); clear(rackLayer); clear(pieceLayer); clear(markerLayer);
  buildBoard(); buildRacks(); buildMarkers(); buildSlots(); selectObject(selectedKey); writeOut();
}
function clear(g){ while(g.children.length) g.remove(g.children[0]); }

function buildBoard() {
  applyT(boardRoot, cfg.board.transform);
  const board = makeMesh('board', new THREE.MeshStandardMaterial({ color: 0x3b2819, roughness: 0.76, metalness: 0.06 }));
  boardRoot.add(board); objects.set('board', boardRoot);
}

function buildRacks() {
  cfg.racks.forEach((r, p) => {
    const rr = new THREE.Group(); applyT(rr, r); rackLayer.add(rr); objects.set(`rack:${p}`, rr);
    rr.add(makeMesh('rack', new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.78, metalness: 0.1 })));
    for (let h = 0; h < 3; h++) for (const size of ['large','medium','small']) {
      const home = cfg.rackHomes[p][h], off = cfg.pieceOffsets[size];
      const piece = makeMesh(size, playerMaterial(p, cfg.players[p].color));
      const local = new THREE.Vector3(home.x + off.x, home.y + off.y, home.z + off.z);
      piece.position.copy(rr.localToWorld(local));
      piece.rotation.set(rad(off.rx), rad(off.ry), rad(off.rz));
      piece.scale.set(off.sx || 1, off.sy || 1, off.sz || 1);
      piece.userData = { player:p, slotIndex:null, homeWorld:piece.position.clone(), homeRot:piece.rotation.clone() };
      pieceLayer.add(piece); pieces.push(piece);
    }
  });
}

function buildMarkers() {
  const cm = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent:true, opacity:0.72 });
  const hm = new THREE.MeshBasicMaterial({ color: 0xfff176, transparent:true, opacity:0.82 });
  for (let i=0;i<9;i++) { const c = cfg.board.cells[i]; const o = new THREE.Mesh(new THREE.SphereGeometry(3,18,12), cm); o.position.set(c.x,c.y,c.z); boardRoot.add(o); objects.set(`cell:${i}`, o); }
  for (let p=0;p<4;p++) { const rr = objects.get(`rack:${p}`); for (let h=0;h<3;h++) { const v=cfg.rackHomes[p][h]; const o=new THREE.Mesh(new THREE.SphereGeometry(3,18,12),hm); o.position.set(v.x,v.y,v.z); rr.add(o); objects.set(`home:${p}:${h}`, o); } }
}

function buildSlots() {
  for (let i=0;i<9;i++) { const o = objects.get(`cell:${i}`); slots.push({ index:i, position:o.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,cfg.board.snapYOffset,0)), stack:[] }); }
}

function makeMesh(key, mat){ const m = new THREE.Mesh(geos[key], mat); m.castShadow = true; m.receiveShadow = true; return m; }
function playerMaterial(i,c){ if(!mats[i]) mats[i] = new THREE.MeshStandardMaterial({ color:c, roughness:.58, metalness:.1 }); return mats[i]; }

function bindUI() {
  $('settingsBtn').onclick = () => { panel.classList.toggle('show'); if(panel.classList.contains('show')) selectObject(selectedKey); else transform.detach(); };
  $('calCloseBtn').onclick = () => { panel.classList.remove('show'); transform.detach(); };
  $('calTarget').onchange = e => selectObject(e.target.value);
  $('resetBtn').onclick = resetPieces;
  $('cameraBtn').onclick = resetCamera;
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { transform.setMode(b.dataset.mode); document.querySelectorAll('[data-mode]').forEach(x=>x.classList.remove('active')); b.classList.add('active'); });
  $('spaceBtn').onclick = e => { const next = transform.space === 'local' ? 'world' : 'local'; transform.setSpace(next); e.target.textContent = next === 'local' ? 'Local' : 'World'; };
  ['X','Y','Z','RX','RY','RZ','SX','SY','SZ','Fit'].forEach(k => $('cal'+k).oninput = applyInputs);
  $('copyCalBtn').onclick = copyOut;
  $('saveLocalBtn').onclick = () => { localStorage.setItem('yaklak_transform_v005', JSON.stringify(cfg)); setStatus('تم الحفظ محلياً'); };
  $('loadLocalBtn').onclick = () => { const s = localStorage.getItem('yaklak_transform_v005'); if(!s) return setStatus('لا يوجد حفظ محلي', true); Object.assign(cfg, JSON.parse(s)); rebuildAll(); setStatus('تم الاسترجاع'); };
  $('resetCalBtn').onclick = () => location.reload();
}

function selectObject(key) {
  selectedKey = key; $('calTarget').value = key;
  const obj = objects.get(key);
  if (obj && panel.classList.contains('show')) transform.attach(obj); else transform.detach();
  syncPanel(); writeOut();
}

function syncSelectedFromObject(rebuildPieces) {
  const obj = objects.get(selectedKey); if(!obj) return;
  if (selectedKey === 'board') readT(obj, cfg.board.transform);
  else if (selectedKey.startsWith('rack:')) readT(obj, cfg.racks[+selectedKey.split(':')[1]]);
  else if (selectedKey.startsWith('cell:')) readXYZ(obj, cfg.board.cells[+selectedKey.split(':')[1]]);
  else if (selectedKey.startsWith('home:')) { const a=selectedKey.split(':'); readXYZ(obj, cfg.rackHomes[+a[1]][+a[2]]); }
  if (rebuildPieces) { const keep = selectedKey; rebuildAll(); selectObject(keep); }
  else { buildSlots(); syncPanel(); writeOut(); }
}

function ref() {
  if (selectedKey === 'board') return { type:'t', data:cfg.board.transform };
  if (selectedKey === 'cellRadius') return { type:'radius', data:cfg.board };
  if (selectedKey === 'boardModel') return { type:'model', data:cfg.models.board };
  if (selectedKey.startsWith('model:')) return { type:'model', data:cfg.models[selectedKey.split(':')[1]] };
  if (selectedKey.startsWith('piece:')) return { type:'t', data:cfg.pieceOffsets[selectedKey.split(':')[1]] };
  if (selectedKey.startsWith('rack:')) return { type:'t', data:cfg.racks[+selectedKey.split(':')[1]] };
  if (selectedKey.startsWith('cell:')) return { type:'xyz', data:cfg.board.cells[+selectedKey.split(':')[1]] };
  if (selectedKey.startsWith('home:')) { const a=selectedKey.split(':'); return { type:'xyz', data:cfg.rackHomes[+a[1]][+a[2]] }; }
  return { type:'t', data:cfg.board.transform };
}

function syncPanel() {
  const r = ref(), d = r.data;
  setInput('X', d.x, true); setInput('Y', d.y, true); setInput('Z', d.z, true);
  setInput('RX', d.rx, r.type==='t'||r.type==='model'); setInput('RY', d.ry, r.type==='t'||r.type==='model'); setInput('RZ', d.rz, r.type==='t'||r.type==='model');
  setInput('SX', d.sx, r.type==='t'||r.type==='model'); setInput('SY', d.sy, r.type==='t'||r.type==='model'); setInput('SZ', d.sz, r.type==='t'||r.type==='model');
  setInput('Fit', r.type==='model'?d.fit:r.type==='radius'?d.cellRadius:'', r.type==='model'||r.type==='radius');
}
function setInput(k,v,en){ const el=$('cal'+k); el.disabled=!en; el.value = v==null ? '' : round(v); }
function applyInputs() { const r=ref(), d=r.data; ['x','y','z','rx','ry','rz','sx','sy','sz'].forEach(k=>{const el=$('cal'+k.toUpperCase()); if(el && !el.disabled) d[k]=num(el.value, k[0]==='s'?1:0);}); if(!$('calFit').disabled){ if(r.type==='model') d.fit=num($('calFit').value,d.fit); if(r.type==='radius') d.cellRadius=num($('calFit').value,d.cellRadius); } rebuildAll(); selectObject(selectedKey); }

function bindPieceDrag(){ canvas.onpointerdown=e=>{ if(panel.classList.contains('show')) return; setPointer(e); const hit=ray.intersectObjects(pieces,false)[0]; if(!hit || hit.object.userData.player!==turn) return; dragPiece=hit.object; orbit.enabled=false; removeSlot(dragPiece); const p=new THREE.Vector3(); dragPlane.constant=-dragPiece.position.y; ray.ray.intersectPlane(dragPlane,p); dragOffset.copy(dragPiece.position).sub(p); }; canvas.onpointermove=e=>{ if(!dragPiece) return; setPointer(e); const p=new THREE.Vector3(); if(ray.ray.intersectPlane(dragPlane,p)) dragPiece.position.copy(p.add(dragOffset)); }; canvas.onpointerup=()=>{ if(!dragPiece) return; const s=nearest(dragPiece.position); if(s){ snap(dragPiece,s); turn=(turn+1)%cfg.players.length; updateDots(); } else { dragPiece.position.copy(dragPiece.userData.homeWorld); dragPiece.rotation.copy(dragPiece.userData.homeRot); } dragPiece=null; orbit.enabled=true; }; }
function setPointer(e){ const r=canvas.getBoundingClientRect(); pointer.x=((e.clientX-r.left)/r.width)*2-1; pointer.y=-((e.clientY-r.top)/r.height)*2+1; ray.setFromCamera(pointer,camera); }
function nearest(p){ let best=null, dist=1e9; for(const s of slots){ const d=Math.hypot(p.x-s.position.x,p.z-s.position.z); if(d<dist){dist=d; best=s;} } return dist <= cfg.board.cellRadius*1.65 ? best : null; }
function removeSlot(p){ const i=p.userData.slotIndex; if(i==null) return; slots[i].stack=slots[i].stack.filter(x=>x!==p); p.userData.slotIndex=null; restack(slots[i]); }
function snap(p,s){ s.stack.push(p); p.userData.slotIndex=s.index; restack(s); }
function restack(s){ s.stack.forEach((p,i)=>{ p.position.set(s.position.x, s.position.y+i*cfg.board.stackGap, s.position.z); p.rotation.set(0,0,0); }); }
function resetPieces(){ pieces.forEach(p=>{ removeSlot(p); p.position.copy(p.userData.homeWorld); p.rotation.copy(p.userData.homeRot); }); turn=0; updateDots(); }
function resetCamera(){ camera.position.set(170,170,190); orbit.target.set(0,18,0); orbit.update(); }

function applyT(o,t){ o.position.set(t.x||0,t.y||0,t.z||0); o.rotation.set(rad(t.rx),rad(t.ry),rad(t.rz)); o.scale.set(t.sx||1,t.sy||1,t.sz||1); }
function readT(o,t){ t.x=round(o.position.x); t.y=round(o.position.y); t.z=round(o.position.z); t.rx=round(deg(o.rotation.x)); t.ry=round(deg(o.rotation.y)); t.rz=round(deg(o.rotation.z)); t.sx=round(o.scale.x); t.sy=round(o.scale.y); t.sz=round(o.scale.z); }
function readXYZ(o,t){ t.x=round(o.position.x); t.y=round(o.position.y); t.z=round(o.position.z); }
function writeOut(){ const out=$('calOut'); if(out) out.value = `const YAKLAK_ALIGNMENT = ${JSON.stringify(cfg,null,2)};`; }
async function copyOut(){ writeOut(); try{ await navigator.clipboard.writeText($('calOut').value); setStatus('تم نسخ الإعدادات'); } catch { setStatus('انسخ من المربع يدويًا', true); } }
function setStatus(t,b=false){ const el=$('calStatus'); if(el){ el.textContent=t; el.style.color=b?'#ff9f9f':'#b6e0c6'; } }
function rad(v){ return THREE.MathUtils.degToRad(v||0); } function deg(v){ return THREE.MathUtils.radToDeg(v||0); } function num(v,f){ const n=Number(v); return Number.isFinite(n)?n:f; } function round(n){ return Math.round(Number(n)*1000)/1000; }
function animate(){ requestAnimationFrame(animate); orbit.update(); renderer.render(scene,camera); }
addEventListener('resize',()=>{ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });
