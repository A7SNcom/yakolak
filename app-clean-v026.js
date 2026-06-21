import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

const VERSION='v035-p-piece-gap-only';
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

const GOLDEN_DISTANCE=48;
const THREE_RADIUS=135;
const P_RADIUS=85;
const P_GAP_GOLDEN=20;

const layout={pPieceGap:P_GAP_GOLDEN};

const defs={
  '9':{file:'9.stl',color:0xd8d8d8,label:'9 board'},
  '3-right':{file:'3.stl',color:0x89a790,label:'3 right'},
  '3-left':{file:'3.stl',color:0x89a790,label:'3 left'},
  '3-front':{file:'3.stl',color:0x89a790,label:'3 front'},
  '3-back':{file:'3.stl',color:0x89a790,label:'3 back'}
};

const baseIds=['9','3-right','3-left','3-front','3-back'];
const pRowIds=['p-front','p-back','p-right','p-left'];

const lms={px:0,py:2,pz:0,rx:-90,ry:0,rz:0};

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

const groups=[];
const guides=[];
const meshes={};
const pMeshes=[];
let activeProp='pPieceGap';

const fields={
  pPieceGap:{label:'p.stl Piece Gap',min:6,max:48}
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
function gap(){return Number(layout.pPieceGap)||P_GAP_GOLDEN}

function baseAlignment(){
  return {
    '9':{px:0,py:6,pz:0,rx:-90,ry:0,rz:0},
    '3-right':{px:THREE_RADIUS,py:6,pz:0,rx:-90,ry:0,rz:0},
    '3-left':{px:-THREE_RADIUS,py:6,pz:0,rx:-90,ry:0,rz:180},
    '3-front':{px:0,py:6,pz:THREE_RADIUS,rx:-90,ry:0,rz:90},
    '3-back':{px:0,py:6,pz:-THREE_RADIUS,rx:-90,ry:0,rz:-90}
  };
}

function pRowsAlignment(){
  return {
    'p-front':{px:0,py:7,pz:P_RADIUS,rx:-90,ry:0,rz:0},
    'p-back':{px:0,py:7,pz:-P_RADIUS,rx:-90,ry:0,rz:0},
    'p-right':{px:P_RADIUS,py:7,pz:0,rx:-90,ry:0,rz:90},
    'p-left':{px:-P_RADIUS,py:7,pz:0,rx:-90,ry:0,rz:90}
  };
}

function outerBasePlacements(){
  return [
    {id:'right-base',px:THREE_RADIUS,pz:0,directionMode:'side'},
    {id:'left-base',px:-THREE_RADIUS,pz:0,directionMode:'side'},
    {id:'front-base',px:0,pz:THREE_RADIUS,directionMode:'main'},
    {id:'back-base',px:0,pz:-THREE_RADIUS,directionMode:'main'}
  ];
}

function applyOne(id){
  const m=meshes[id],s=baseAlignment()[id];
  if(!m||!s)return;
  m.position.set(s.px,s.py,s.pz);
  m.rotation.set(deg(s.rx),deg(s.ry),deg(s.rz));
}

function outerOffset(side,base){
  const dir=base.directionMode==='side'?90:0;
  const rad=deg(dir);
  return {
    x:Math.cos(rad)*GOLDEN_DISTANCE*side,
    z:Math.sin(rad)*GOLDEN_DISTANCE*side
  };
}

function applyStones(){
  const bases=outerBasePlacements();
  groups.forEach(g=>{
    if(g.userData.kind==='board'){
      const cell=g.userData.cell;
      g.position.set(lms.px+(cell.gx*GOLDEN_DISTANCE),lms.py,lms.pz+(cell.gz*GOLDEN_DISTANCE));
    }else{
      const b=bases.find(x=>x.id===g.userData.baseId);
      const s=g.userData.side;
      const off=outerOffset(s.side,b);
      g.position.set(lms.px+b.px+off.x,lms.py,lms.pz+b.pz+off.z);
    }
    g.rotation.set(deg(lms.rx),deg(lms.ry),deg(lms.rz));
  });
}

function pAxisForRow(id){
  return (id==='p-front'||id==='p-back')?'x':'z';
}

function pInstances(){
  const rows=pRowsAlignment();
  const arr=[];
  pRowIds.forEach(rowId=>{
    const row=rows[rowId];
    const axis=pAxisForRow(rowId);
    for(let side=-3;side<=3;side++){
      arr.push({
        id:rowId+'-'+(side+4),
        row:rowId,
        side:side,
        px:row.px+(axis==='x'?side*gap():0),
        py:row.py,
        pz:row.pz+(axis==='z'?side*gap():0),
        rx:row.rx,
        ry:row.ry,
        rz:row.rz
      });
    }
  });
  return arr;
}

function applyP(){
  const arr=pInstances();
  pMeshes.forEach((m,i)=>{
    const p=arr[i];
    if(!p)return;
    m.position.set(p.px,p.py,p.pz);
    m.rotation.set(deg(p.rx),deg(p.ry),deg(p.rz));
    m.visible=true;
  });
}

function showGuides(){
  guides.forEach(g=>g.visible=panel.classList.contains('show'));
}

function output(){
  return {
    version:VERSION,
    calibration_rule:'Only pPieceGap is calibrated now. Board, 3.stl centers, p.stl row centers, and stone distance remain fixed at the approved golden layout.',
    layout:{
      goldenDistance:GOLDEN_DISTANCE,
      threeRadius:THREE_RADIUS,
      pRadius:P_RADIUS,
      pPieceGap:gap()
    },
    models_alignment:{...baseAlignment(),...pRowsAlignment()},
    approved_9_and_3:baseAlignment(),
    p_model:{
      file:'p.stl',
      rows:pRowsAlignment(),
      instances:pInstances(),
      note:'p.stl row centers are fixed. The only calibration is the spacing between each p piece in the same row.'
    },
    stone_setup:{
      board_grid:'3x3',
      board_stone_sets:boardGrid.length,
      outer_base_count:outerBasePlacements().length,
      copies_per_outer_base:sideCopies.length,
      outer_stone_sets:outerBasePlacements().length*sideCopies.length,
      total_stone_sets:boardGrid.length+(outerBasePlacements().length*sideCopies.length),
      distance:GOLDEN_DISTANCE,
      mainDirectionDeg:0,
      sideDirectionDeg:90,
      note:'approved golden distance is fixed; pPieceGap is separate.'
    },
    LMS:{
      الارتفاع:lms.py,
      px:lms.px,py:lms.py,pz:lms.pz,rx:lms.rx,ry:lms.ry,rz:lms.rz,
      boardGrid:boardGrid,
      outerBasePlacements:outerBasePlacements(),
      sideCopies:sideCopies
    }
  };
}

function refresh(){
  out.value='const YAKOLAK_ALIGNMENT = '+JSON.stringify(output(),null,2)+';';
  showGuides();
}

function applyAll(){
  baseIds.forEach(applyOne);
  applyStones();
  applyP();
  refresh();
  sync();
}

function sync(){
  if(!panel.classList.contains('show'))return;
  const f=fields[activeProp];
  calRange.min=f.min;
  calRange.max=f.max;
  calRange.step=1;
  calNum.min=f.min;
  calNum.max=f.max;
  calNum.step=1;
  calRange.value=layout.pPieceGap;
  calNum.value=layout.pPieceGap;
  calTitle.textContent='المعايرة الوحيدة — تباعد القطع';
  calMeta.textContent='هذا يقرّب/يبعّد نسخ p عن بعضها فقط: '+layout.pPieceGap;
}

function openPanel(){
  menu.style.display='none';
  panel.classList.add('show');
  activeProp='pPieceGap';
  sync();
  showGuides();
}

function setVal(v){
  const f=fields.pPieceGap;
  layout.pPieceGap=Math.max(f.min,Math.min(f.max,Number(v)||P_GAP_GOLDEN));
  applyAll();
}

settingsBtn.onclick=openPanel;
changeBtn.onclick=openPanel;
hideBtn.onclick=()=>{panel.classList.remove('show');showGuides()};
minusBtn.onclick=()=>setVal(layout.pPieceGap-1);
plusBtn.onclick=()=>setVal(layout.pPieceGap+1);
calRange.oninput=e=>setVal(e.target.value);
calNum.oninput=e=>setVal(e.target.value);
resetBtn.onclick=()=>{layout.pPieceGap=P_GAP_GOLDEN;applyAll()};
copyBtn.onclick=async()=>{await navigator.clipboard.writeText(out.value);hint.textContent='copied'};
saveBtn.onclick=async()=>{await navigator.clipboard.writeText(out.value);hint.textContent='saved as copied code ✅'};

const loader=new STLLoader();

function loadModel(id){
  const def=defs[id];
  return new Promise(res=>loader.load('./'+def.file+'?v='+VERSION+'-'+id,g=>{
    center(g);
    const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:def.color,roughness:.55,metalness:.05}));
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

  outerBasePlacements().forEach(base=>{
    sideCopies.forEach(side=>{
      const g=new THREE.Group();
      g.userData.kind='outer';
      g.userData.baseId=base.id;
      g.userData.side=side;
      parent.add(g);
      groups.push(g);
    });
  });

  applyStones();
}

function loadPiece(name,color){
  return new Promise(res=>loader.load('./'+name+'.stl?v='+VERSION+'-'+name,g=>{
    bottom(g);
    const mat=new THREE.MeshStandardMaterial({color:color,roughness:.55,metalness:.05});
    groups.forEach(gr=>{
      const m=new THREE.Mesh(g,mat);
      m.userData.piece=true;
      gr.add(m);
    });
    res();
  },undefined,()=>res()));
}

function loadP(){
  return new Promise(res=>loader.load('./p.stl?v='+VERSION,g=>{
    center(g);
    const mat=new THREE.MeshStandardMaterial({color:0xd37c00,roughness:.55,metalness:.05});
    for(let i=0;i<28;i++){
      const m=new THREE.Mesh(g,mat);
      pMeshes.push(m);
      scene.add(m);
    }
    applyP();
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
  return Promise.all([loadPiece('l',0xf2c078),loadPiece('m',0x8ecae6),loadPiece('s',0xffafcc),loadP()]);
}).then(()=>{
  guidesBuild();
  const box=new THREE.Box3();
  Object.values(meshes).forEach(m=>box.expandByObject(m));
  groups.forEach(g=>box.expandByObject(g));
  pMeshes.forEach(m=>box.expandByObject(m));
  const size=box.getSize(new THREE.Vector3());
  const distance=(Math.max(size.x,size.y,size.z)||1)*1.75;
  camera.position.set(distance,distance*.82,distance);
  camera.near=Math.max(distance/1000,.01);
  camera.far=distance*30;
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
