import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

const VERSION='v027-clean-fixed';
const hint=document.getElementById('hint');
const root=document.getElementById('view');
const out=document.getElementById('out');
const menu=document.getElementById('menu');
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

const defs={
  '9':{file:'9.stl',color:0xd8d8d8,label:'9 board'},
  '3-right':{file:'3.stl',color:0x89a790,label:'3 right'},
  '3-left':{file:'3.stl',color:0x89a790,label:'3 left'},
  '3-front':{file:'3.stl',color:0x89a790,label:'3 front'},
  '3-back':{file:'3.stl',color:0x89a790,label:'3 back'}
};
const approved={
  '9':{px:0,py:6,pz:0,rx:-90,ry:0,rz:0},
  '3-right':{px:135,py:6,pz:0,rx:-90,ry:0,rz:0},
  '3-left':{px:-135,py:6,pz:0,rx:-90,ry:0,rz:180},
  '3-front':{px:0,py:6,pz:135,rx:-90,ry:0,rz:90},
  '3-back':{px:0,py:6,pz:-135,rx:-90,ry:0,rz:-90}
};
const lms={px:0,py:2,pz:0,rx:-90,ry:0,rz:0};
const places=[
  {id:'center',px:0,pz:0},
  {id:'right-base',px:135,pz:0},
  {id:'left-base',px:-135,pz:0},
  {id:'front-base',px:0,pz:135},
  {id:'back-base',px:0,pz:-135}
];
const state=JSON.parse(JSON.stringify(approved));
const meshes={};
const groups=[];
const guides=[];
let activeModel='LMS';
let activeProp='py';
const fields={
  px:{label:'Move X',min:-300,max:300},
  py:{label:'Move Y',min:-120,max:150},
  pz:{label:'Move Z',min:-300,max:300},
  rx:{label:'Rotate X',min:-180,max:180},
  ry:{label:'Rotate Y',min:-180,max:180},
  rz:{label:'Rotate Z',min:-180,max:180}
};

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x111111);
const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,.01,100000);
camera.position.set(260,210,260);
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
function getS(){return activeModel==='LMS'?lms:state[activeModel]}
function applyOne(id){const m=meshes[id],s=state[id];if(!m)return;m.position.set(s.px,s.py,s.pz);m.rotation.set(deg(s.rx),deg(s.ry),deg(s.rz))}
function applyLms(){groups.forEach(g=>{const p=g.userData.place;g.position.set(lms.px+p.px,lms.py,lms.pz+p.pz);g.rotation.set(deg(lms.rx),deg(lms.ry),deg(lms.rz))})}
function showGuides(){guides.forEach(g=>g.visible=activeModel==='LMS'&&panel.classList.contains('show'))}
function output(){return{approved_9_and_3:state,LMS:{الارتفاع:lms.py,px:lms.px,py:lms.py,pz:lms.pz,rx:lms.rx,ry:lms.ry,rz:lms.rz,placements:places},LMS_rule:'l/m/s bottoms equalized; five LMS groups: center plus four base centers'}}
function refresh(){out.value='const YAKOLAK_ALIGNMENT = '+JSON.stringify(output(),null,2)+';';showGuides()}
function applyAll(){Object.keys(state).forEach(applyOne);applyLms();refresh();sync()}
function sync(){if(!panel.classList.contains('show'))return;const s=getS(),f=fields[activeProp];calRange.min=f.min;calRange.max=f.max;calRange.step=1;calNum.min=f.min;calNum.max=f.max;calNum.step=1;calRange.value=s[activeProp];calNum.value=s[activeProp];calTitle.textContent=activeModel==='LMS'?'LMS — الارتفاع':(defs[activeModel].label+' — '+f.label);calMeta.textContent=activeModel==='LMS'?'5 نسخ: الوسط + القواعد الأربعة':activeModel+'.'+activeProp}
function openMenu(){panel.classList.remove('show');menu.style.display='block';menu.innerHTML='<div style="font-weight:800;margin-bottom:10px">إيش تبغى تعاير؟</div><div class="choices"><button class="choice primary" data-m="LMS">LMS</button><button class="choice" data-m="9">9 board</button><button class="choice" data-m="3-right">3 right</button><button class="choice" data-m="3-left">3 left</button><button class="choice" data-m="3-front">3 front</button><button class="choice" data-m="3-back">3 back</button></div>';menu.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{activeModel=b.dataset.m;if(activeModel==='LMS'){activeProp='py';openPanel()}else openProps()})}
function openProps(){menu.innerHTML='<div style="font-weight:800;margin-bottom:10px">إيش الخاصية؟</div><div class="choices"><button class="choice" data-p="px">Move X</button><button class="choice" data-p="py">Move Y</button><button class="choice" data-p="pz">Move Z</button><button class="choice" data-p="rx">Rotate X</button><button class="choice" data-p="ry">Rotate Y</button><button class="choice" data-p="rz">Rotate Z</button></div>';menu.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{activeProp=b.dataset.p;openPanel()})}
function openPanel(){menu.style.display='none';panel.classList.add('show');sync();showGuides()}
function setVal(v){const s=getS(),f=fields[activeProp];s[activeProp]=Math.max(f.min,Math.min(f.max,Number(v)||0));applyAll()}

settingsBtn.onclick=openMenu;
changeBtn.onclick=openMenu;
hideBtn.onclick=()=>{panel.classList.remove('show');showGuides()};
minusBtn.onclick=()=>setVal(getS()[activeProp]-1);
plusBtn.onclick=()=>setVal(getS()[activeProp]+1);
calRange.oninput=e=>setVal(e.target.value);
calNum.oninput=e=>setVal(e.target.value);
resetBtn.onclick=()=>{if(activeModel==='LMS')Object.assign(lms,{px:0,py:2,pz:0,rx:-90,ry:0,rz:0});else Object.assign(state[activeModel],approved[activeModel]);applyAll()};
copyBtn.onclick=async()=>{await navigator.clipboard.writeText(out.value);hint.textContent='copied'};
saveBtn.onclick=async()=>{await navigator.clipboard.writeText(out.value);hint.textContent='saved as copied code ✅'};

const loader=new STLLoader();
function loadModel(id){const d=defs[id];return new Promise(res=>loader.load('./'+d.file+'?v='+VERSION+'-'+id,g=>{center(g);const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:d.color,roughness:.55,metalness:.05}));meshes[id]=m;scene.add(m);applyOne(id);res()},undefined,()=>res()))}
function createGroups(){const parent=new THREE.Group();scene.add(parent);places.forEach(p=>{const g=new THREE.Group();g.userData.place=p;parent.add(g);groups.push(g)});applyLms()}
function loadPiece(n,c){return new Promise(res=>loader.load('./'+n+'.stl?v='+VERSION+'-'+n,g=>{bottom(g);const mat=new THREE.MeshStandardMaterial({color:c,roughness:.55,metalness:.05});groups.forEach(gr=>{const m=new THREE.Mesh(g,mat);m.userData.piece=true;gr.add(m)});res()},undefined,()=>res()))}
function guidesBuild(){groups.forEach(gr=>{const box=new THREE.Box3();gr.children.forEach(ch=>{ch.geometry.computeBoundingBox();const b=ch.geometry.boundingBox.clone();b.translate(ch.position);box.union(b)});const size=box.getSize(new THREE.Vector3()),cen=box.getCenter(new THREE.Vector3()),plate=new THREE.Mesh(new THREE.PlaneGeometry(size.x+10,size.y+10),new THREE.MeshBasicMaterial({color:0x00ff99,transparent:true,opacity:.28,side:THREE.DoubleSide,depthWrite:false}));plate.position.set(cen.x,cen.y,.04);plate.visible=false;gr.add(plate);guides.push(plate)})}

Promise.all(Object.keys(defs).map(loadModel)).then(()=>{createGroups();return Promise.all([loadPiece('l',0xf2c078),loadPiece('m',0x8ecae6),loadPiece('s',0xffafcc)])}).then(()=>{guidesBuild();const box=new THREE.Box3();Object.values(meshes).forEach(m=>box.expandByObject(m));groups.forEach(g=>box.expandByObject(g));const size=box.getSize(new THREE.Vector3()),d=(Math.max(size.x,size.y,size.z)||1)*1.75;camera.position.set(d,d*.82,d);camera.near=Math.max(d/1000,.01);camera.far=d*30;camera.updateProjectionMatrix();controls.target.set(0,0,0);controls.update();hint.textContent='Yakolak '+VERSION;refresh()});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera)}
animate();refresh();
