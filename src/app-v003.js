import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { cloneAlignment } from "./config.js?v=004";

const $ = id => document.getElementById(id);
const canvas = $("game"), panel = $("calPanel"), loader = $("loader"), dots = $("dots");
const cfg = upgrade(cloneAlignment());
window.YAKLAK_ALIGNMENT = cfg;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 2400);
camera.position.set(155, 165, 185);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 14, 0);
controls.enableDamping = true;
controls.minDistance = 70;
controls.maxDistance = 520;
controls.maxPolarAngle = Math.PI * 0.49;

const root = new THREE.Group(), boardG = new THREE.Group(), rackG = new THREE.Group(), pieceG = new THREE.Group(), markG = new THREE.Group();
scene.add(root);
root.add(boardG, rackG, pieceG, markG);

const raw = {}, geos = {}, dims = {}, mats = {}, slots = [], pieces = [], rackRoots = [];
let selected = "board", step = 1, turn = 0, dragged = null;
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), offset = new THREE.Vector3();
const ui = {};

init();

async function init() {
  try {
    setupLights();
    setupFloor();
    setupPanel();
    bindUI();
    bindDrag();
    setupDots();
    await loadAll();
    rebuildAll();
    loader.classList.add("hide");
    animate();
  } catch (err) {
    console.error(err);
    setStatus("في مشكلة تحميل أو تشغيل. صوّر الكونسول لو ظهر خطأ.", true);
  }
}

function upgrade(c) {
  c.board ||= {};
  c.board.transform ||= { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
  c.board.base ||= { width: 126, depth: 126, height: 8, rimWidth: 142, rimDepth: 142, rimHeight: 4 };
  c.board.cellRadius ||= 13.5;
  c.board.snapYOffset ||= 4.2;
  c.board.stackGap ||= 3.2;
  if (!c.board.cells) {
    const a = c.board.cell1 || { x: -48, y: 2.8, z: 48 }, b = c.board.cell9 || { x: 48, y: 2.8, z: -48 };
    const dx = (b.x - a.x) / 2, dy = (b.y - a.y) / 2, dz = (b.z - a.z) / 2;
    c.board.cells = [];
    for (let r = 0; r < 3; r++) for (let col = 0; col < 3; col++) c.board.cells.push({ x: a.x + col * dx, y: a.y + ((r + col) / 2) * dy, z: a.z + r * dz });
  }
  for (const k of ["rack", "small", "medium", "large"]) {
    const m = c.models[k];
    m.rx = m.rx ?? m.rotateXDeg ?? 0; m.ry = m.ry ?? 0; m.rz = m.rz ?? 0;
    m.sx = m.sx ?? 1; m.sy = m.sy ?? 1; m.sz = m.sz ?? 1; m.yOffset = m.yOffset ?? 0;
  }
  c.racks = c.racks.map(r => ({ x: r.x || 0, y: r.y || 0, z: r.z || 0, rx: r.rx || 0, ry: r.ry ?? r.rotY ?? 0, rz: r.rz || 0, sx: r.sx || 1, sy: r.sy || 1, sz: r.sz || 1 }));
  const layout = c.piecesOnRack || { gapX: 23.5, gapZ: 2.8, lift: 0.9, sets: 3 };
  c.rackHomes ||= c.racks.map(() => [{ x: -layout.gapX, y: layout.lift, z: 0 }, { x: 0, y: layout.lift, z: 0 }, { x: layout.gapX, y: layout.lift, z: 0 }]);
  c.pieceOffsets ||= {
    large: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },
    medium: { x: 0, y: layout.gapZ, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },
    small: { x: 0, y: layout.gapZ * 2, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 }
  };
  return c;
}

function setupPanel() {
  panel.innerHTML = `
    <div class="calHead"><b>معايرة شاملة</b><button class="calBtn" id="calCloseBtn">×</button></div>
    <div class="calHint">اختر أي عنصر: البورد، خانات اللعب، قواعد الاستعداد، أماكن الحجار فوق القواعد، أو اتجاه المجسمات. عدّل وانسخ الناتج.</div>
    <label class="field full"><span>العنصر</span><select id="calTarget"></select></label>
    <div class="calGrid">
      <label class="field"><span>X</span><input id="calX" type="number" step="0.1"></label>
      <label class="field"><span>Y</span><input id="calY" type="number" step="0.1"></label>
      <label class="field"><span>Z</span><input id="calZ" type="number" step="0.1"></label>
      <label class="field"><span>RX</span><input id="calRX" type="number" step="0.1"></label>
      <label class="field"><span>RY</span><input id="calRY" type="number" step="0.1"></label>
      <label class="field"><span>RZ</span><input id="calRZ" type="number" step="0.1"></label>
      <label class="field"><span>SX</span><input id="calSX" type="number" step="0.01"></label>
      <label class="field"><span>SY</span><input id="calSY" type="number" step="0.01"></label>
      <label class="field"><span>SZ</span><input id="calSZ" type="number" step="0.01"></label>
      <label class="field"><span>Fit/Radius</span><input id="calFit" type="number" step="0.1"></label>
    </div>
    <div class="calRow" id="calStepBtns"><button class="calBtn" data-step="0.1">0.1</button><button class="calBtn" data-step="0.25">0.25</button><button class="calBtn active" data-step="1">1</button><button class="calBtn" data-step="5">5</button><button class="calBtn" data-step="10">10</button></div>
    <div class="calAxis"><button class="calBtn" data-axis="x" data-delta="-1">X−</button><button class="calBtn" data-axis="y" data-delta="-1">Y−</button><button class="calBtn" data-axis="z" data-delta="-1">Z−</button><button class="calBtn" data-axis="x" data-delta="1">X+</button><button class="calBtn" data-axis="y" data-delta="1">Y+</button><button class="calBtn" data-axis="z" data-delta="1">Z+</button></div>
    <div class="calAxis"><button class="calBtn" data-axis="rx" data-delta="-1">RX−</button><button class="calBtn" data-axis="ry" data-delta="-1">RY−</button><button class="calBtn" data-axis="rz" data-delta="-1">RZ−</button><button class="calBtn" data-axis="rx" data-delta="1">RX+</button><button class="calBtn" data-axis="ry" data-delta="1">RY+</button><button class="calBtn" data-axis="rz" data-delta="1">RZ+</button></div>
    <textarea id="calOut" readonly></textarea>
    <div class="calRow"><button class="calBtn primary" id="copyCalBtn">نسخ الإعدادات</button><button class="calBtn" id="saveLocalBtn">حفظ محلي</button><button class="calBtn" id="loadLocalBtn">استرجاع</button><button class="calBtn danger" id="resetCalBtn">افتراضي</button></div>
    <div class="calStatus" id="calStatus"></div>`;
  Object.assign(ui, { settings: $("settingsBtn"), close: $("calCloseBtn"), reset: $("resetBtn"), camera: $("cameraBtn"), target: $("calTarget"), x: $("calX"), y: $("calY"), z: $("calZ"), rx: $("calRX"), ry: $("calRY"), rz: $("calRZ"), sx: $("calSX"), sy: $("calSY"), sz: $("calSZ"), fit: $("calFit"), out: $("calOut"), copy: $("copyCalBtn"), save: $("saveLocalBtn"), load: $("loadLocalBtn"), resetCal: $("resetCalBtn"), status: $("calStatus") });
  const opts = [["board", "البورد كامل"], ["boardBase", "مقاس البورد"], ["cellRadius", "حجم دوائر البورد"]];
  for (let i = 0; i < 9; i++) opts.push([`cell:${i}`, `مكان البورد ${i + 1}`]);
  for (let i = 0; i < 4; i++) opts.push([`rack:${i}`, `قاعدة اللاعب ${i + 1}`]);
  for (let p = 0; p < 4; p++) for (let h = 0; h < 3; h++) opts.push([`home:${p}:${h}`, `مكان حجارة اللاعب ${p + 1} مجموعة ${h + 1}`]);
  for (const s of ["large", "medium", "small"]) opts.push([`piece:${s}`, `تداخل/اتجاه حجر ${s}`]);
  for (const m of ["rack", "large", "medium", "small"]) opts.push([`model:${m}`, `اتجاه/حجم مجسم ${m}`]);
  ui.target.innerHTML = opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
}

function setupLights(){scene.add(new THREE.HemisphereLight(0xfff4df,0x21170e,1.3));const k=new THREE.DirectionalLight(0xffffff,1.55);k.position.set(140,220,150);k.castShadow=true;k.shadow.mapSize.set(2048,2048);scene.add(k);const f=new THREE.DirectionalLight(0xffd89a,.45);f.position.set(-160,120,-110);scene.add(f)}
function setupFloor(){const f=new THREE.Mesh(new THREE.PlaneGeometry(760,760),new THREE.MeshStandardMaterial({color:0x251c13,roughness:.92,metalness:.02}));f.rotation.x=-Math.PI/2;f.receiveShadow=true;root.add(f);const g=new THREE.GridHelper(380,19,0x6d5737,0x3e3020);g.position.y=.05;root.add(g)}
function setupDots(){dots.innerHTML="";cfg.players.forEach((p,i)=>{const d=document.createElement("div");d.className=`dot${i===turn?" active":""}`;d.style.background=`#${p.color.toString(16).padStart(6,"0")}`;dots.appendChild(d)})}
function updateDots(){[...dots.children].forEach((d,i)=>d.classList.toggle("active",i===turn))}
async function loadAll(){await Promise.all(Object.entries(cfg.models).map(([k,m])=>new Promise((res,rej)=>new STLLoader().load(m.path,g=>{raw[k]=g;res()},undefined,rej))));rebuildGeos()}
function rebuildGeos(){for(const [k,m] of Object.entries(cfg.models)){const g=raw[k].clone();g.rotateX(rad(m.rx));g.rotateY(rad(m.ry));g.rotateZ(rad(m.rz));g.computeVertexNormals();g.computeBoundingBox();let b=g.boundingBox;g.translate(-(b.min.x+b.max.x)/2,-b.min.y+(m.yOffset||0),-(b.min.z+b.max.z)/2);g.computeBoundingBox();b=g.boundingBox;const sc=(m.fit||1)/Math.max((b.max.x-b.min.x)||1,(b.max.z-b.min.z)||1);g.scale(sc*(m.sx||1),sc*(m.sy||1),sc*(m.sz||1));g.computeBoundingBox();b=g.boundingBox;geos[k]=g;dims[k]={w:b.max.x-b.min.x,h:b.max.y-b.min.y,d:b.max.z-b.min.z}}}
function rebuildAll(){rebuildGeos();buildBoard();buildRacks();buildMarks();syncUI();writeOut()}
function clear(g){while(g.children.length)g.remove(g.children[0])}
function buildBoard(){clear(boardG);slots.length=0;applyT(boardG,cfg.board.transform);const b=cfg.board.base;const rim=new THREE.Mesh(new THREE.BoxGeometry(b.rimWidth,b.rimHeight,b.rimDepth),new THREE.MeshStandardMaterial({color:0x7a542d,roughness:.68,metalness:.12}));rim.position.y=b.rimHeight/2;rim.receiveShadow=true;boardG.add(rim);const top=new THREE.Mesh(new THREE.BoxGeometry(b.width,b.height,b.depth),new THREE.MeshStandardMaterial({color:0x3a2a1a,roughness:.82,metalness:.05}));top.position.y=b.rimHeight+b.height/2;top.castShadow=true;top.receiveShadow=true;boardG.add(top);const mat=new THREE.MeshStandardMaterial({color:0xf4c76b,roughness:.58,metalness:.18});cfg.board.cells.forEach((c,i)=>{const cell=new THREE.Mesh(new THREE.CylinderGeometry(cfg.board.cellRadius,cfg.board.cellRadius,2.2,56),mat);cell.position.set(c.x,c.y+b.rimHeight+b.height,c.z);cell.castShadow=true;cell.receiveShadow=true;boardG.add(cell);slots.push({index:i,position:boardG.localToWorld(new THREE.Vector3(c.x,c.y+b.rimHeight+b.height+cfg.board.snapYOffset,c.z)),stack:[]})})}
function buildRacks(){clear(rackG);clear(pieceG);rackRoots.length=0;pieces.length=0;cfg.racks.forEach((r,p)=>{const rootR=new THREE.Group();applyT(rootR,r);rackG.add(rootR);rackRoots.push(rootR);const tray=mesh("rack",new THREE.MeshStandardMaterial({color:0x151515,roughness:.78,metalness:.1}));rootR.add(tray);for(let h=0;h<3;h++)for(const s of ["large","medium","small"]){const off=cfg.pieceOffsets[s],home=cfg.rackHomes[p][h],pc=mesh(s,playerMat(p,cfg.players[p].color));pc.userData={player:p,slotIndex:null};const pos=new THREE.Vector3(home.x+off.x,home.y+off.y,home.z+off.z);pc.position.copy(rootR.localToWorld(pos));pc.rotation.set(rad(off.rx),rad(off.ry),rad(off.rz));pc.scale.set(off.sx||1,off.sy||1,off.sz||1);pc.userData.homeWorld=pc.position.clone();pc.userData.homeRot=pc.rotation.clone();pieceG.add(pc);pieces.push(pc)}})}
function buildMarks(){clear(markG);if(!panel.classList.contains("show"))return;const cyan=new THREE.MeshBasicMaterial({color:0x00e5ff,transparent:true,opacity:.75}),yellow=new THREE.MeshBasicMaterial({color:0xfff176,transparent:true,opacity:.75});slots.forEach((s,i)=>{const m=new THREE.Mesh(new THREE.SphereGeometry(selected===`cell:${i}`?4:2.2,16,12),cyan);m.position.copy(s.position);markG.add(m)});rackRoots.forEach((rr,p)=>cfg.rackHomes[p].forEach((h,i)=>{const m=new THREE.Mesh(new THREE.SphereGeometry(selected===`home:${p}:${i}`?4:2.2,16,12),yellow);m.position.copy(rr.localToWorld(new THREE.Vector3(h.x,h.y,h.z)));markG.add(m)}))}
function mesh(k,mat){const m=new THREE.Mesh(geos[k],mat);m.castShadow=true;m.receiveShadow=true;return m}
function playerMat(i,c){if(!mats[i])mats[i]=new THREE.MeshStandardMaterial({color:c,roughness:.58,metalness:.1});return mats[i]}
function bindUI(){ui.settings.onclick=()=>{panel.classList.toggle("show");buildMarks();syncUI()};ui.close.onclick=()=>{panel.classList.remove("show");buildMarks()};ui.reset.onclick=resetPieces;ui.camera.onclick=()=>{camera.position.set(155,165,185);controls.target.set(0,14,0);controls.update()};ui.target.onchange=()=>{selected=ui.target.value;syncUI();buildMarks()};[ui.x,ui.y,ui.z,ui.rx,ui.ry,ui.rz,ui.sx,ui.sy,ui.sz,ui.fit].forEach(e=>e.oninput=applyUI);document.querySelectorAll("#calStepBtns [data-step]").forEach(b=>b.onclick=()=>{step=Number(b.dataset.step);document.querySelectorAll("#calStepBtns [data-step]").forEach(x=>x.classList.remove("active"));b.classList.add("active")});document.querySelectorAll(".calAxis [data-axis]").forEach(b=>b.onclick=()=>{const r=ref();if(b.dataset.axis in r.data)r.data[b.dataset.axis]=num(r.data[b.dataset.axis],0)+Number(b.dataset.delta)*step;rebuildBy(r.kind)});ui.copy.onclick=copy;ui.save.onclick=()=>{localStorage.setItem("yaklak_v004",JSON.stringify(cfg));status("تم الحفظ محليًا")};ui.load.onclick=()=>{const s=localStorage.getItem("yaklak_v004");if(!s)return status("لا يوجد حفظ",true);Object.assign(cfg,JSON.parse(s));rebuildAll();status("تم الاسترجاع")};ui.resetCal.onclick=()=>location.reload()}
function ref(){if(selected==="board")return{data:cfg.board.transform,kind:"all",type:"t"};if(selected==="boardBase")return{data:cfg.board.base,kind:"board",type:"base"};if(selected==="cellRadius")return{data:cfg.board,kind:"board",type:"radius"};if(selected.startsWith("cell:"))return{data:cfg.board.cells[+selected.split(":")[1]],kind:"board",type:"xyz"};if(selected.startsWith("rack:"))return{data:cfg.racks[+selected.split(":")[1]],kind:"racks",type:"t"};if(selected.startsWith("home:")){const a=selected.split(":");return{data:cfg.rackHomes[+a[1]][+a[2]],kind:"racks",type:"xyz"}}if(selected.startsWith("piece:"))return{data:cfg.pieceOffsets[selected.split(":")[1]],kind:"racks",type:"t"};if(selected.startsWith("model:"))return{data:cfg.models[selected.split(":")[1]],kind:"all",type:"model"};return{data:cfg.board.transform,kind:"all",type:"t"}}
function syncUI(){const r=ref(),d=r.data;set(ui.x,d.x,true);set(ui.y,d.y,true);set(ui.z,d.z,true);set(ui.rx,d.rx,r.type==="t"||r.type==="model");set(ui.ry,d.ry,r.type==="t"||r.type==="model");set(ui.rz,d.rz,r.type==="t"||r.type==="model");set(ui.sx,d.sx,r.type==="t"||r.type==="model");set(ui.sy,d.sy,r.type==="t"||r.type==="model");set(ui.sz,d.sz,r.type==="t"||r.type==="model");set(ui.fit,r.type==="model"?d.fit:r.type==="radius"?d.cellRadius:r.type==="base"?d.width:"",r.type==="model"||r.type==="radius"||r.type==="base");writeOut()}
function set(el,v,en){el.disabled=!en;el.value=v==null?"":round(v)}
function applyUI(){const r=ref(),d=r.data;for(const k of ["x","y","z","rx","ry","rz","sx","sy","sz"])if(!ui[k].disabled)d[k]=num(ui[k].value,k[0]==="s"?1:0);if(!ui.fit.disabled){if(r.type==="model")d.fit=num(ui.fit.value,d.fit);if(r.type==="radius")d.cellRadius=num(ui.fit.value,d.cellRadius);if(r.type==="base"){d.width=num(ui.fit.value,d.width);d.depth=d.width;d.rimWidth=d.width+16;d.rimDepth=d.depth+16}}rebuildBy(r.kind)}
function rebuildBy(k){if(k==="board")buildBoard();else if(k==="racks")buildRacks();else rebuildAll();buildMarks();syncUI()}
function applyT(o,t){o.position.set(t.x||0,t.y||0,t.z||0);o.rotation.set(rad(t.rx),rad(t.ry),rad(t.rz));o.scale.set(t.sx||1,t.sy||1,t.sz||1)}
function bindDrag(){canvas.onpointerdown=e=>{if(panel.classList.contains("show"))return;point(e);const h=ray.intersectObjects(pieces,false)[0];if(!h||h.object.userData.player!==turn)return;dragged=h.object;controls.enabled=false;removeSlot(dragged);const p=new THREE.Vector3();plane.constant=-dragged.position.y;ray.ray.intersectPlane(plane,p);offset.copy(dragged.position).sub(p)};canvas.onpointermove=e=>{if(!dragged)return;point(e);const p=new THREE.Vector3();if(ray.ray.intersectPlane(plane,p))dragged.position.copy(p.add(offset))};canvas.onpointerup=()=>{if(!dragged)return;const s=near(dragged.position);if(s){snap(dragged,s);turn=(turn+1)%cfg.players.length;updateDots()}else{dragged.position.copy(dragged.userData.homeWorld);dragged.rotation.copy(dragged.userData.homeRot)}dragged=null;controls.enabled=true}}
function point(e){const r=canvas.getBoundingClientRect();ptr.x=((e.clientX-r.left)/r.width)*2-1;ptr.y=-((e.clientY-r.top)/r.height)*2+1;ray.setFromCamera(ptr,camera)}
function near(p){let b=null,bd=1e9;for(const s of slots){const d=Math.hypot(p.x-s.position.x,p.z-s.position.z);if(d<bd){bd=d;b=s}}return bd<=cfg.board.cellRadius*1.65?b:null}
function removeSlot(p){const i=p.userData.slotIndex;if(i==null)return;slots[i].stack=slots[i].stack.filter(x=>x!==p);p.userData.slotIndex=null;restack(slots[i])}
function snap(p,s){s.stack.push(p);p.userData.slotIndex=s.index;restack(s)}
function restack(s){s.stack.forEach((p,i)=>{p.position.set(s.position.x,s.position.y+i*cfg.board.stackGap,s.position.z);p.rotation.set(0,0,0)})}
function resetPieces(){for(const p of pieces){removeSlot(p);p.position.copy(p.userData.homeWorld);p.rotation.copy(p.userData.homeRot)}turn=0;updateDots()}
function writeOut(){ui.out.value=`const YAKLAK_ALIGNMENT = ${JSON.stringify(cfg,null,2)};`}
async function copy(){writeOut();try{await navigator.clipboard.writeText(ui.out.value);status("تم نسخ الإعدادات")}catch{status("انسخ يدويًا",true)}}
function status(t,b=false){ui.status.textContent=t;ui.status.style.color=b?"#ff9f9f":"#b6e0c6"}
function rad(v){return THREE.MathUtils.degToRad(v||0)}function num(v,f){const n=Number(v);return Number.isFinite(n)?n:f}function round(n){return Math.round(Number(n)*1000)/1000}
function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera)}
addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
