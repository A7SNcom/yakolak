import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

const VERSION='v032-p-model-calibration';
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
  '3-back':{file:'3.stl',color:0x89a790,label:'3 back'},
  'p':{file:'p.stl',color:0xd37c00,label:'p.stl'}
};

const approved={
  '9':{px:0,py:6,pz:0,rx:-90,ry:0,rz:0},
  '3-right':{px:135,py:6,pz:0,rx:-90,ry:0,rz:0},
  '3-left':{px:-135,py:6,pz:0,rx:-90,ry:0,rz:180},
  '3-front':{px:0,py:6,pz:135,rx:-90,ry:0,rz:90},
  '3-back':{px:0,py:6,pz:-135,rx:-90,ry:0,rz:-90},
  'p':{px:0,py:6,pz:0,rx:-90,ry:0,rz:0}
};

const lms={px:0,py:2,pz:0,rx:-90,ry:0,rz:0};

const stoneSetup={
  distance:48,
  mainDirectionDeg:0,
  sideDirectionDeg:90
};

const outerBasePlaces=[
  {id:'right-base',px:135,pz:0,directionMode:'side'},
  {id:'left-base',px:-135,pz:0,directionMode:'side'},
  {id:'front-base',px:0,pz:135,directionMode:'main'},
  {id:'back-base',px:0,pz:-135,directionMode:'main'}
];

const boardGrid=[
  {id:'board-r1-c1',gx:-1,gz:-1},{id:'board-r1-c2',gx:0,gz:-1},{id:'board-r1-c3',gx:1,gz:-1},
  {id:'board-r2-c1',gx:-1,gz:0},{id:'board-r2-c2',gx:0,gz:0},{id:'board-r2-c3',gx:1,gz:0},
  {id:'board-r3-c1',gx:-1,gz:1},{id:'board-r3-c2',gx:0,gz:1},{id:'board-r3-c3',gx:1,gz:1}
];

const sideCopies=[
  {id:'left',side:-1},
  {id:'center',side:0},
  {id:'right',side:1}
];

const state=JSON.parse(JSON.stringify(approved));
const meshes={};
const groups=[];
const guides=[];
let activeModel='STONE_DISTANCE';
let activeProp='distance';

const fields={
  px:{label:'Move X',min:-300,max:300},
  py:{label:'Move Y',min:-120,max:150},
  pz:{label:'Move Z',min:-300,max:300},
  rx:{label:'Rotate X',min:-180,max:180},
  ry:{label:'Rotate Y',min:-180,max:180},
  rz:{label:'Rotate Z',min:-180,max:180},
  distance:{label:'Stone Distance',min:0,max:90},
  mainDirectionDeg:{label:'Main Direction',min:-180,max:180},
  sideDirectionDeg:{label:'Side Direction',min:-180,max:180}
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

function getActiveStore(){
  if(activeModel==='STONE_DISTANCE'||activeModel==='STONE_MAIN_DIRECTION'||activeModel==='STONE_SIDE_DIRECTION')return stoneSetup;
  if(activeModel==='LMS')return lms;
  return state[activeModel];
}

function applyOne(id){
  const m=meshes[id],s=state[id];
  if(!m)return;
  m.position.set(s.px,s.py,s.pz);
  m.rotation.set(deg(s.rx),deg(s.ry),deg(s.rz));
}

function directionForOuterBase(base){
  return base.directionMode==='side'?stoneSetup.sideDirectionDeg:stoneSetup.mainDirectionDeg;
}

function outerOffset(side,base){
  const r=deg(directionForOuterBase(base));
  return {
    x:Math.cos(r)*stoneSetup.distance*side,
    z:Math.sin(r)*stoneSetup.distance*side
  };
}

function applyStones(){
  groups.forEach(g=>{
    if(g.userData.kind==='board'){
      const cell=g.userData.cell;
      g.position.set(lms.px+(cell.gx*stoneSetup.distance),lms.py,lms.pz+(cell.gz*stoneSetup.distance));
    }else{
      const b=g.userData.base;
      const s=g.userData.side;
      const off=outerOffset(s.side,b);
      g.position.set(lms.px+b.px+off.x,lms.py,lms.pz+b.pz+off.z);
    }
    g.rotation.set(deg(lms.rx),deg(lms.ry),deg(lms.rz));
  });
}

function showGuides(){
  guides.forEach(g=>g.visible=(activeModel.startsWith('STONE')||activeModel==='LMS')&&panel.classList.contains('show'));
}

function output(){
  return {
    version:VERSION,
    models_alignment:state,
    approved_9_and_3:state,
    p_model:{
      file:'p.stl',
      alignment:state.p,
      note:'p.stl is a standalone calibrated model. Use px/py/pz/rx/ry/rz to describe its exact position.'
    },
    stone_setup:{
      board_grid:'3x3',
      board_stone_sets:boardGrid.length,
      outer_base_count:outerBasePlaces.length,
      copies_per_outer_base:sideCopies.length,
      outer_stone_sets:outerBasePlaces.length*sideCopies.length,
      total_stone_sets:boardGrid.length+(outerBasePlaces.length*sideCopies.length),
      distance:stoneSetup.distance,
      mainDirectionDeg:stoneSetup.mainDirectionDeg,
      sideDirectionDeg:stoneSetup.sideDirectionDeg,
      note:'same distance controls board 3x3 grid and outer stone copies'
    },
    LMS:{
      الارتفاع:lms.py,
      px:lms.px,py:lms.py,pz:lms.pz,rx:lms.rx,ry:lms.ry,rz:lms.rz,
      boardGrid:boardGrid,
      outerBasePlacements:outerBasePlaces,
      sideCopies:sideCopies
    },
    LMS_rule:'Board has 9 stone sets using same distance. Outer four bases keep left/center/right using same distance; right/left bases use 90 degrees.'
  };
}

function refresh(){
  out.value='const YAKOLAK_ALIGNMENT = '+JSON.stringify(output(),null,2)+';';
  showGuides();
}

function applyAll(){
  Object.keys(state).forEach(applyOne);
  applyStones();
  refresh();
  sync();
}

function sync(){
  if(!panel.classList.contains('show'))return;
  const s=getActiveStore();
  const f=fields[activeProp];
  calRange.min=f.min;
  calRange.max=f.max;
  calRange.step=1;
  calNum.min=f.min;
  calNum.max=f.max;
  calNum.step=1;
  calRange.value=s[activeProp];
  calNum.value=s[activeProp];

  if(activeModel==='STONE_DISTANCE'){
    calTitle.textContent='الحجر — التباعد';
    calMeta.textContent='نفس التباعد للجميع، المعتمد 48';
  }else if(activeModel==='STONE_MAIN_DIRECTION'){
    calTitle.textContent='الحجر — اتجاه الأمام والخلف';
    calMeta.textContent='الأمام + الخلف، المعتمد 0';
  }else if(activeModel==='STONE_SIDE_DIRECTION'){
    calTitle.textContent='الحجر — اتجاه اليمين واليسار';
    calMeta.textContent='اليمين + اليسار، المعتمد 90';
  }else if(activeModel==='LMS'){
    calTitle.textContent='الحجر — الارتفاع';
    calMeta.textContent='يطبق على كل الحجر';
  }else{
    calTitle.textContent=defs[activeModel].label+' — '+f.label;
    calMeta.textContent=activeModel+'.'+activeProp;
  }
}

function openMenu(){
  panel.classList.remove('show');
  showGuides();
  menu.style.display='block';
  menu.innerHTML='<div style="font-weight:800;margin-bottom:10px">إيش تبغى تعاير؟</div><div class="choices"><button class="choice primary" data-special="distance">الحجر: التباعد</button><button class="choice primary" data-special="mainDirectionDeg">اتجاه الأمام والخلف</button><button class="choice primary" data-special="sideDirectionDeg">اتجاه اليمين واليسار</button><button class="choice" data-m="LMS">الحجر: الارتفاع</button><button class="choice" data-m="9">9 board</button><button class="choice" data-m="3-right">3 right</button><button class="choice" data-m="3-left">3 left</button><button class="choice" data-m="3-front">3 front</button><button class="choice" data-m="3-back">3 back</button><button class="choice primary" data-m="p">p.stl</button></div>';
  menu.querySelectorAll('[data-special]').forEach(b=>b.onclick=()=>{
    if(b.dataset.special==='distance'){
      activeModel='STONE_DISTANCE';
      activeProp='distance';
    }else if(b.dataset.special==='mainDirectionDeg'){
      activeModel='STONE_MAIN_DIRECTION';
      activeProp='mainDirectionDeg';
    }else{
      activeModel='STONE_SIDE_DIRECTION';
      activeProp='sideDirectionDeg';
    }
    openPanel();
  });
  menu.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{
    activeModel=b.dataset.m;
    if(activeModel==='LMS'){
      activeProp='py';
      openPanel();
    }else{
      openProps();
    }
  });
}

function openProps(){
  menu.innerHTML='<div style="font-weight:800;margin-bottom:10px">إيش الخاصية؟</div><div class="choices"><button class="choice" data-p="px">Move X</button><button class="choice" data-p="py">Move Y</button><button class="choice" data-p="pz">Move Z</button><button class="choice" data-p="rx">Rotate X</button><button class="choice" data-p="ry">Rotate Y</button><button class="choice" data-p="rz">Rotate Z</button></div>';
  menu.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{activeProp=b.dataset.p;openPanel()});
}

function openPanel(){
  menu.style.display='none';
  panel.classList.add('show');
  sync();
  showGuides();
}

function setVal(v){
  const s=getActiveStore();
  const f=fields[activeProp];
  s[activeProp]=Math.max(f.min,Math.min(f.max,Number(v)||0));
  applyAll();
}

settingsBtn.onclick=openMenu;
changeBtn.onclick=openMenu;
hideBtn.onclick=()=>{panel.classList.remove('show');showGuides()};
minusBtn.onclick=()=>setVal(getActiveStore()[activeProp]-1);
plusBtn.onclick=()=>setVal(getActiveStore()[activeProp]+1);
calRange.oninput=e=>setVal(e.target.value);
calNum.oninput=e=>setVal(e.target.value);
resetBtn.onclick=()=>{
  if(activeModel==='STONE_DISTANCE')stoneSetup.distance=48;
  else if(activeModel==='STONE_MAIN_DIRECTION')stoneSetup.mainDirectionDeg=0;
  else if(activeModel==='STONE_SIDE_DIRECTION')stoneSetup.sideDirectionDeg=90;
  else if(activeModel==='LMS')Object.assign(lms,{px:0,py:2,pz:0,rx:-90,ry:0,rz:0});
  else Object.assign(state[activeModel],approved[activeModel]);
  applyAll();
};
copyBtn.onclick=async()=>{await navigator.clipboard.writeText(out.value);hint.textContent='copied'};
saveBtn.onclick=async()=>{await navigator.clipboard.writeText(out.value);hint.textContent='saved as copied code ✅'};

const loader=new STLLoader();

function loadModel(id){
  const d=defs[id];
  return new Promise(res=>loader.load('./'+d.file+'?v='+VERSION+'-'+id,g=>{
    center(g);
    const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:d.color,roughness:.55,metalness:.05}));
    meshes[id]=m;
    scene.add(m);
    applyOne(id);
    res();
  },undefined,()=>res()));
}

function createStoneGroups(){
  const parent=new THREE.Group();
  scene.add(parent);

  boardGrid.forEach(cell=>{
    const g=new THREE.Group();
    g.userData.kind='board';
    g.userData.cell=cell;
    parent.add(g);
    groups.push(g);
  });

  outerBasePlaces.forEach(base=>{
    sideCopies.forEach(side=>{
      const g=new THREE.Group();
      g.userData.kind='outer';
      g.userData.base=base;
      g.userData.side=side;
      parent.add(g);
      groups.push(g);
    });
  });

  applyStones();
}

function loadPiece(n,c){
  return new Promise(res=>loader.load('./'+n+'.stl?v='+VERSION+'-'+n,g=>{
    bottom(g);
    const mat=new THREE.MeshStandardMaterial({color:c,roughness:.55,metalness:.05});
    groups.forEach(gr=>{
      const m=new THREE.Mesh(g,mat);
      m.userData.piece=true;
      gr.add(m);
    });
    res();
  },undefined,()=>res()));
}

function guidesBuild(){
  groups.forEach(gr=>{
    const box=new THREE.Box3();
    gr.children.forEach(ch=>{
      ch.geometry.computeBoundingBox();
      const b=ch.geometry.boundingBox.clone();
      b.translate(ch.position);
      box.union(b);
    });
    const size=box.getSize(new THREE.Vector3());
    const cen=box.getCenter(new THREE.Vector3());
    const plate=new THREE.Mesh(new THREE.PlaneGeometry(size.x+10,size.y+10),new THREE.MeshBasicMaterial({color:0x00ff99,transparent:true,opacity:.18,side:THREE.DoubleSide,depthWrite:false}));
    plate.position.set(cen.x,cen.y,.04);
    plate.visible=false;
    gr.add(plate);
    guides.push(plate);
  });
}

Promise.all(Object.keys(defs).map(loadModel)).then(()=>{
  createStoneGroups();
  return Promise.all([loadPiece('l',0xf2c078),loadPiece('m',0x8ecae6),loadPiece('s',0xffafcc)]);
}).then(()=>{
  guidesBuild();
  const box=new THREE.Box3();
  Object.values(meshes).forEach(m=>box.expandByObject(m));
  groups.forEach(g=>box.expandByObject(g));
  const size=box.getSize(new THREE.Vector3());
  const d=(Math.max(size.x,size.y,size.z)||1)*1.75;
  camera.position.set(d,d*.82,d);
  camera.near=Math.max(d/1000,.01);
  camera.far=d*30;
  camera.updateProjectionMatrix();
  controls.target.set(0,0,0);
  controls.update();
  hint.textContent='Yakolak '+VERSION;
  refresh();
});

addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});

function animate(){
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene,camera);
}

animate();
refresh();
