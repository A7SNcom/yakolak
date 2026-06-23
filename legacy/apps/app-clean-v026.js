import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

const VERSION='v036-p-gap-11';
const GOLDEN_DISTANCE=48;
const THREE_RADIUS=135;
const P_RADIUS=85;
const P_GAP_GOLDEN=11;

const hint=document.getElementById('hint');
const root=document.getElementById('view');
const out=document.getElementById('out');
const panel=document.getElementById('panel');
const calTitle=document.getElementById('calTitle');
const calMeta=document.getElementById('calMeta');
const calRange=document.getElementById('calRange');
const calNum=document.getElementById('calNum');
const settingsBtn=document.getElementById('settingsBtn');
const changeBtn=document.getElementById('changeBtn');
const hideBtn=document.getElementById('hideBtn');
const minusBtn=document.getElementById('minusBtn');
const plusBtn=document.getElementById('plusBtn');
const resetBtn=document.getElementById('resetBtn');
const copyBtn=document.getElementById('copyBtn');
const saveBtn=document.getElementById('saveBtn');

const layout={pPieceGap:P_GAP_GOLDEN};
const loader=new STLLoader();
const meshes={};
const stoneGroups=[];
const pMeshes=[];

const defs={
  '9':{file:'9.stl',color:0xd8d8d8},
  '3-right':{file:'3.stl',color:0x89a790},
  '3-left':{file:'3.stl',color:0x89a790},
  '3-front':{file:'3.stl',color:0x89a790},
  '3-back':{file:'3.stl',color:0x89a790}
};
const baseIds=Object.keys(defs);
const boardGrid=[[-1,-1],[0,-1],[1,-1],[-1,0],[0,0],[1,0],[-1,1],[0,1],[1,1]].map(([gx,gz],i)=>({id:'board-'+(i+1),gx,gz}));
const sideCopies=[{id:'left',side:-1},{id:'center',side:0},{id:'right',side:1}];
const lms={px:0,py:2,pz:0,rx:-90,ry:0,rz:0};

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x111111);
const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,.01,100000);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
root.appendChild(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;
scene.add(new THREE.HemisphereLight(0xffffff,0x333333,2.2));
const light=new THREE.DirectionalLight(0xffffff,2.4);
light.position.set(150,220,160);
scene.add(light);
scene.add(new THREE.GridHelper(360,36,0x444444,0x252525));

function deg(v){return THREE.MathUtils.degToRad(v)}
function center(g){g.computeBoundingBox();const c=g.boundingBox.getCenter(new THREE.Vector3());g.translate(-c.x,-c.y,-c.z);g.computeVertexNormals()}
function bottom(g){g.computeBoundingBox();const b=g.boundingBox;g.translate(-(b.min.x+b.max.x)/2,-(b.min.y+b.max.y)/2,-b.min.z);g.computeVertexNormals()}
function gap(){return Number(layout.pPieceGap)||P_GAP_GOLDEN}

function baseAlignment(){return {
  '9':{px:0,py:6,pz:0,rx:-90,ry:0,rz:0},
  '3-right':{px:THREE_RADIUS,py:6,pz:0,rx:-90,ry:0,rz:0},
  '3-left':{px:-THREE_RADIUS,py:6,pz:0,rx:-90,ry:0,rz:180},
  '3-front':{px:0,py:6,pz:THREE_RADIUS,rx:-90,ry:0,rz:90},
  '3-back':{px:0,py:6,pz:-THREE_RADIUS,rx:-90,ry:0,rz:-90}
}}
function pRowsAlignment(){return {
  'p-front':{px:0,py:7,pz:P_RADIUS,rx:-90,ry:0,rz:0},
  'p-back':{px:0,py:7,pz:-P_RADIUS,rx:-90,ry:0,rz:0},
  'p-right':{px:P_RADIUS,py:7,pz:0,rx:-90,ry:0,rz:90},
  'p-left':{px:-P_RADIUS,py:7,pz:0,rx:-90,ry:0,rz:90}
}}
function outerBasePlacements(){return [
  {id:'right-base',px:THREE_RADIUS,pz:0,directionMode:'side'},
  {id:'left-base',px:-THREE_RADIUS,pz:0,directionMode:'side'},
  {id:'front-base',px:0,pz:THREE_RADIUS,directionMode:'main'},
  {id:'back-base',px:0,pz:-THREE_RADIUS,directionMode:'main'}
]}
function applyTransform(obj,t){obj.position.set(t.px,t.py,t.pz);obj.rotation.set(deg(t.rx),deg(t.ry),deg(t.rz))}
function applyBases(){const a=baseAlignment();baseIds.forEach(id=>meshes[id]&&applyTransform(meshes[id],a[id]))}
function outerOffset(side,base){const r=deg(base.directionMode==='side'?90:0);return {x:Math.cos(r)*GOLDEN_DISTANCE*side,z:Math.sin(r)*GOLDEN_DISTANCE*side}}
function applyStones(){const bases=outerBasePlacements();stoneGroups.forEach(g=>{
  if(g.userData.kind==='board')g.position.set(g.userData.gx*GOLDEN_DISTANCE,lms.py,g.userData.gz*GOLDEN_DISTANCE);
  else{const b=bases.find(x=>x.id===g.userData.baseId);const off=outerOffset(g.userData.side,b);g.position.set(b.px+off.x,lms.py,b.pz+off.z)}
  g.rotation.set(deg(lms.rx),deg(lms.ry),deg(lms.rz));
})}
function pAxis(row){return row==='p-front'||row==='p-back'?'x':'z'}
function pInstances(){const rows=pRowsAlignment();const arr=[];Object.keys(rows).forEach(rowId=>{const row=rows[rowId];const axis=pAxis(rowId);for(let side=-3;side<=3;side++)arr.push({id:rowId+'-'+(side+4),row:rowId,side,px:row.px+(axis==='x'?side*gap():0),py:row.py,pz:row.pz+(axis==='z'?side*gap():0),rx:row.rx,ry:row.ry,rz:row.rz})});return arr}
function applyP(){const arr=pInstances();pMeshes.forEach((m,i)=>arr[i]&&applyTransform(m,arr[i]))}
function output(){return {version:VERSION,calibration_rule:'Only pPieceGap is calibrated. It controls spacing between p.stl pieces only.',layout:{goldenDistance:GOLDEN_DISTANCE,threeRadius:THREE_RADIUS,pRadius:P_RADIUS,pPieceGap:gap()},models_alignment:{...baseAlignment(),...pRowsAlignment()},approved_9_and_3:baseAlignment(),p_model:{file:'p.stl',rows:pRowsAlignment(),instances:pInstances(),note:'Centers are fixed. pPieceGap is the only adjustable value.'},stone_setup:{board_grid:'3x3',board_stone_sets:9,outer_base_count:4,copies_per_outer_base:3,outer_stone_sets:12,total_stone_sets:21,distance:GOLDEN_DISTANCE,mainDirectionDeg:0,sideDirectionDeg:90},LMS:{الارتفاع:lms.py,px:lms.px,py:lms.py,pz:lms.pz,rx:lms.rx,ry:lms.ry,rz:lms.rz,boardGrid,outerBasePlacements:outerBasePlacements(),sideCopies}}}
function refresh(){out.value='const YAKOLAK_ALIGNMENT = '+JSON.stringify(output(),null,2)+';'}
function applyAll(){applyBases();applyStones();applyP();refresh();sync()}
function sync(){if(!panel.classList.contains('show'))return;calRange.min=6;calRange.max=48;calRange.step=1;calNum.min=6;calNum.max=48;calNum.step=1;calRange.value=layout.pPieceGap;calNum.value=layout.pPieceGap;calTitle.textContent='المعايرة الوحيدة — تباعد القطع';calMeta.textContent='تباعد قطع p عن بعضها فقط: '+layout.pPieceGap}
function setVal(v){layout.pPieceGap=Math.max(6,Math.min(48,Number(v)||P_GAP_GOLDEN));applyAll()}
function openPanel(){panel.classList.add('show');sync()}
settingsBtn.onclick=openPanel;changeBtn.onclick=openPanel;hideBtn.onclick=()=>panel.classList.remove('show');minusBtn.onclick=()=>setVal(layout.pPieceGap-1);plusBtn.onclick=()=>setVal(layout.pPieceGap+1);calRange.oninput=e=>setVal(e.target.value);calNum.oninput=e=>setVal(e.target.value);resetBtn.onclick=()=>{layout.pPieceGap=P_GAP_GOLDEN;applyAll()};copyBtn.onclick=async()=>{await navigator.clipboard.writeText(out.value);hint.textContent='copied'};saveBtn.onclick=copyBtn.onclick;

function loadModel(id){const def=defs[id];return new Promise(res=>loader.load('./'+def.file+'?v='+VERSION+'-'+id,g=>{center(g);const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:def.color,roughness:.55,metalness:.05}));meshes[id]=m;scene.add(m);applyTransform(m,baseAlignment()[id]);res()},undefined,()=>res()))}
function createStoneGroups(){const parent=new THREE.Group();scene.add(parent);boardGrid.forEach(c=>{const g=new THREE.Group();g.userData={kind:'board',gx:c.gx,gz:c.gz};parent.add(g);stoneGroups.push(g)});outerBasePlacements().forEach(b=>sideCopies.forEach(s=>{const g=new THREE.Group();g.userData={kind:'outer',baseId:b.id,side:s.side};parent.add(g);stoneGroups.push(g)}));applyStones()}
function loadPiece(name,color){return new Promise(res=>loader.load('./'+name+'.stl?v='+VERSION+'-'+name,g=>{bottom(g);const mat=new THREE.MeshStandardMaterial({color,roughness:.55,metalness:.05});stoneGroups.forEach(gr=>gr.add(new THREE.Mesh(g,mat)));res()},undefined,()=>res()))}
function loadP(){return new Promise(res=>loader.load('./p.stl?v='+VERSION,g=>{center(g);const mat=new THREE.MeshStandardMaterial({color:0xd37c00,roughness:.55,metalness:.05});for(let i=0;i<28;i++){const m=new THREE.Mesh(g,mat);pMeshes.push(m);scene.add(m)}applyP();res()},undefined,()=>res()))}

Promise.all(baseIds.map(loadModel)).then(()=>{createStoneGroups();return Promise.all([loadPiece('l',0xf2c078),loadPiece('m',0x8ecae6),loadPiece('s',0xffafcc),loadP()])}).then(()=>{const box=new THREE.Box3();Object.values(meshes).forEach(m=>box.expandByObject(m));stoneGroups.forEach(g=>box.expandByObject(g));pMeshes.forEach(m=>box.expandByObject(m));const size=box.getSize(new THREE.Vector3());const dist=(Math.max(size.x,size.y,size.z)||1)*1.75;camera.position.set(dist,dist*.82,dist);camera.near=Math.max(dist/1000,.01);camera.far=dist*30;camera.updateProjectionMatrix();controls.target.set(0,0,0);controls.update();hint.textContent='Yakolak '+VERSION;refresh()});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera)}
animate();refresh();
