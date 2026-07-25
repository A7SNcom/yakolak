import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {SVGLoader} from 'three/addons/loaders/SVGLoader.js';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';

const BUILD='97';
const MODEL_DIR='./assets/models/';
const MARBLE_URL='https://i.ibb.co/B2h2tNKG/Screenshot-2026-06-22-094236.png';
const TABLE_SVG_URL=`${MODEL_DIR}table.svg?v=${BUILD}-table`;
const TABLE_ALBEDO_URL=`${MODEL_DIR}Mars%20Angled%20Stump%20Side%20Table%2030x30x45_Albedo.png?v=${BUILD}-albedo`;
const TABLE_NORMAL_URL=`${MODEL_DIR}Mars%20Angled%20Stump%20Side%20Table%2030x30x45_Normal.png?v=${BUILD}-normal`;
const TABLE_ROUGHNESS_URL=`${MODEL_DIR}Mars%20Angled%20Stump%20Side%20Table%2030x30x45_Roughness.png?v=${BUILD}-roughness`;
const modelPath=n=>`${MODEL_DIR}${n}.stl?v=${BUILD}-${n}`;
const root=document.getElementById('view');
const loaderEl=document.getElementById('yakolakLoader');
const log=(...a)=>console.info('[Yakolak]',...a);
const PERF_PARAMS=new URLSearchParams(location.search);
const PERFORMANCE_MODE=!PERF_PARAMS.has('quality-full');
const MOBILE_VIEW=innerWidth<=900;
const DEVICE_MEMORY=Number(navigator.deviceMemory||4);
const CPU_CORES=Number(navigator.hardwareConcurrency||4);
const MOBILE_HIGH_QUALITY=MOBILE_VIEW&&DEVICE_MEMORY>=4&&CPU_CORES>=6;
const performancePixelRatio=()=>{
  const dpr=Math.max(devicePixelRatio||1,1);
  if(!PERFORMANCE_MODE)return Math.min(dpr,1.5);
  if(!MOBILE_VIEW)return .9;
  if(MOBILE_HIGH_QUALITY)return Math.min(dpr,1.4);
  if(DEVICE_MEMORY>=4||CPU_CORES>=6)return Math.min(dpr,1.25);
  return Math.min(dpr,1.1);
};
globalThis.__yakolakPerformance={enabled:PERFORMANCE_MODE,mobileHighQuality:MOBILE_HIGH_QUALITY,get pixelRatio(){return renderer?.getPixelRatio?.()||performancePixelRatio()}};
function setLoadingProgress(value,status){
  globalThis.__yakolakLoading?.set?.(value,status);
}
function done(){
  setLoadingProgress(100,'جاهز');
  if(root)root.style.opacity='1';
  if(loaderEl){
    setTimeout(()=>loaderEl.classList.add('done'),180);
    setTimeout(()=>{loaderEl.remove();document.body.classList.add('yakolak-ready');render()},620);
  }else document.body.classList.add('yakolak-ready');
}
function fail(e){console.error('[Yakolak] prod stage1 error',e);setLoadingProgress(100,'تعذر التحميل');if(loaderEl)loaderEl.classList.add('error')}

const WIN_HIGHLIGHT_PRESETS={
  clean:{label:'رمشة نظيفة',desc:'رمشة على حجارة الفوز فقط بدون تغيير ألوان الباقي',spriteOpacity:0,spriteScale:42,lightIntensity:0,lightDistance:0,emissive:.72,blinkScale:.035},
  focus:{label:'رمشة واضحة',desc:'رمشة أقوى مع وميض خفيف حول الحجر الفائز',spriteOpacity:.18,spriteScale:50,lightIntensity:.12,lightDistance:72,emissive:.9,blinkScale:.05},
  pulse:{label:'رمشة ناعمة',desc:'رمشة أبطأ قليلاً بإحساس احتفالي خفيف',spriteOpacity:.2,spriteScale:54,lightIntensity:.16,lightDistance:82,emissive:1,blinkScale:.065},
  minimal:{label:'مختصر',desc:'رمشة بسيطة بدون هالة أو إضاءة إضافية',spriteOpacity:0,spriteScale:0,lightIntensity:0,lightDistance:0,emissive:.58,blinkScale:.025}
};

const DEFAULT_CALIBRATION={
  scene:{background:'#e9eef2',exposure:1.03,fog:false,fogColor:'#dfe6eb',fogNear:1800,fogFar:6200,fov:45,minDistance:180,maxDistance:1350,minPolar:32,maxPolar:112,markers:false,pixelRatio:1.25,cameraX:520,cameraY:430,cameraZ:520,targetX:0,targetY:0,targetZ:0},
  room:{
    floor:{color:'#000000',roughness:.9,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    ceiling:{color:'#000000',roughness:.96,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    backWall:{color:'#ffffff',roughness:.94,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    leftWall:{color:'#ffffff',roughness:.94,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    rightWall:{color:'#ffffff',roughness:.94,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    frontWall:{color:'#ffffff',roughness:.94,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    trim:{color:'#d2dbe1',roughness:.9,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    edges:{color:'#9eacb5',opacity:.84,visible:true},
    grid:{color:'#c9d3da',opacity:.3,visible:true}
  },
  game:{
    board:{color:'#161616',roughness:.54,metalness:.04,emissive:'#000000',emissiveIntensity:0},
    right:{color:'#ffffff',roughness:.92,metalness:0,emissive:'#000000',emissiveIntensity:0,marble:true},
    left:{color:'#b37a18',roughness:.48,metalness:.28,emissive:'#000000',emissiveIntensity:0},
    front:{color:'#006144',roughness:.58,metalness:.08,emissive:'#000000',emissiveIntensity:0},
    back:{color:'#001f8f',roughness:.74,metalness:0,emissive:'#000000',emissiveIntensity:0}
  },
  table:{color:'#ffffff',roughness:.92,metalness:0,normalScale:.75,texture:true,repeatX:1,repeatY:1,opacity:1,emissive:'#000000',emissiveIntensity:0,wireframe:false},
  lights:[
    {id:'orbA',name:'A',type:'point',enabled:true,color:'#ffffff',intensity:2.7,distance:2300,decay:.25,size:30,x:-520,y:380,z:430},
    {id:'orbB',name:'B',type:'point',enabled:true,color:'#fff2cf',intensity:1.9,distance:2200,decay:.25,size:26,x:520,y:300,z:360},
    {id:'orbC',name:'C',type:'point',enabled:true,color:'#d8ecff',intensity:1.45,distance:2200,decay:.25,size:24,x:0,y:850,z:-360},
    {id:'spotKey',name:'مركزة',type:'spot',enabled:false,color:'#fff5dc',intensity:2.6,distance:2400,decay:1.3,angle:28,penumbra:.55,size:28,x:0,y:950,z:520,targetX:0,targetY:0,targetZ:0},
    {id:'lineWash',name:'خطية',type:'linear',enabled:false,color:'#dff3ff',intensity:.42,distance:1600,decay:1.35,count:7,length:1300,axis:'x',size:18,x:0,y:1040,z:-760},
    {id:'rectSoft',name:'مستطيلة',type:'rect',enabled:false,color:'#ffffff',intensity:3,width:900,height:120,size:22,x:0,y:1120,z:-900,rx:-62,ry:0,rz:0},
    {id:'sun',name:'اتجاهية',type:'directional',enabled:false,color:'#ffffff',intensity:1.2,size:24,x:-650,y:900,z:620,targetX:0,targetY:0,targetZ:0},
    {id:'hemi',name:'محيطية',type:'hemisphere',enabled:false,color:'#ffffff',groundColor:'#cbd8df',intensity:.45,size:20,x:0,y:1000,z:0},
    {id:'ambient',name:'عامة',type:'ambient',enabled:false,color:'#ffffff',intensity:.24,size:18,x:0,y:850,z:0}
  ],
  play:{dragPieces:true,snapToZones:true,showZones:false,zoneSize:36,zoneColor:'#60a5fa',zoneOpacity:.22,dropRadius:42,turnSeconds:18,winnerHighlightPreset:'clean',winnerBlinkCount:5,winnerBlinkDuration:3000,winnerGlowColor:'#ffffff'}
};
const SURFACE_KEYS={floor:'room-floor',ceiling:'room-ceiling',backWall:'room-back-wall',leftWall:'room-left-wall',rightWall:'room-right-wall',frontWall:'room-front-wall'};
function clone(v){return JSON.parse(JSON.stringify(v))}
function isPlainObject(v){return v&&typeof v==='object'&&!Array.isArray(v)}
function mergeDeep(base,over){
  const out=clone(base);
  if(!isPlainObject(over))return out;
  for(const [k,v] of Object.entries(over)){
    if(Array.isArray(v))out[k]=clone(v);
    else if(isPlainObject(v)&&isPlainObject(out[k]))out[k]=mergeDeep(out[k],v);
    else out[k]=v;
  }
  return out;
}
function readCalibration(){
  return clone(DEFAULT_CALIBRATION);
}
function writeCalibration(){}
const calibration=readCalibration();
let publishedMeta=null,savingCalibration=false;

const scene=new THREE.Scene();
scene.background=new THREE.Color(calibration.scene.background);
const camera=new THREE.PerspectiveCamera(calibration.scene.fov,innerWidth/innerHeight,.1,12000);
const renderer=new THREE.WebGLRenderer({antialias:MOBILE_HIGH_QUALITY,alpha:false,powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.setPixelRatio(performancePixelRatio());
renderer.setSize(innerWidth,innerHeight);
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=calibration.scene.exposure;
renderer.shadowMap.enabled=false;
root.appendChild(renderer.domElement);

const ROOM_CFG={floorY:-650,topY:1250,halfW:2400,backZ:-2400,frontZ:2400};
const ROOM_LIMIT={minX:-ROOM_CFG.halfW+90,maxX:ROOM_CFG.halfW-90,minY:ROOM_CFG.floorY+80,maxY:ROOM_CFG.topY-70,minZ:ROOM_CFG.backZ+90,maxZ:ROOM_CFG.frontZ-90};
const TABLE_TOP_Y=-16;
const TABLE_CONTACT_EPS=.8;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
let controls;
function keepInsideRoom(){
  if(!controls)return;
  camera.position.x=clamp(camera.position.x,ROOM_LIMIT.minX,ROOM_LIMIT.maxX);
  camera.position.y=clamp(camera.position.y,ROOM_LIMIT.minY,ROOM_LIMIT.maxY);
  camera.position.z=clamp(camera.position.z,ROOM_LIMIT.minZ,ROOM_LIMIT.maxZ);
  controls.target.x=clamp(controls.target.x,-560,560);
  controls.target.y=clamp(controls.target.y,ROOM_CFG.floorY+80,ROOM_CFG.topY-170);
  controls.target.z=clamp(controls.target.z,-560,560);
}
function render(){keepInsideRoom();renderer.render(scene,camera)}

controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=false;
controls.enablePan=false;
controls.minDistance=calibration.scene.minDistance;
controls.maxDistance=calibration.scene.maxDistance;
controls.maxPolarAngle=THREE.MathUtils.degToRad(calibration.scene.maxPolar);
controls.minPolarAngle=THREE.MathUtils.degToRad(calibration.scene.minPolar);
controls.addEventListener('change',render);

RectAreaLightUniformsLib.init();
const lightRig=new THREE.Group();
lightRig.name='yakolak-calibration-light-rig';
scene.add(lightRig);
const pointer=new THREE.Vector2();
const raycaster=new THREE.Raycaster();
const dragPlane=new THREE.Plane();
const dragHit=new THREE.Vector3();
const dragWorld=new THREE.Vector3();
const dragLocal=new THREE.Vector3();
let dragState=null;
let dragLightHandles=[];

const roomRefs={surfaces:{},trims:[],edges:[],grid:[]};
function addRoom(){
  const {floorY,topY,halfW,backZ,frontZ}=ROOM_CFG;
  const w=halfW*2,d=frontZ-backZ,h=topY-floorY,my=floorY+h/2;
  const group=new THREE.Group();group.name='yakolak-soft-empty-room';scene.add(group);
  const mat=(color,opt={})=>new THREE.MeshStandardMaterial({color,roughness:opt.roughness??.94,metalness:0,side:THREE.DoubleSide,transparent:!!opt.transparent,opacity:opt.opacity??1,depthWrite:opt.depthWrite??true});
  const floorMat=mat(0xe6ecef,{roughness:.9});
  const ceilMat=mat(0xffffff,{roughness:.96});
  const wallMat=mat(0xfafcfd,{roughness:.94});
  const sideMat=mat(0xf5f8fa,{roughness:.94});
  const frontMat=mat(0xffffff,{transparent:true,opacity:.10,depthWrite:false});
  const trimMat=mat(0xd2dbe1,{roughness:.9});
  const edgeMat=new THREE.LineBasicMaterial({color:0x9eacb5,transparent:true,opacity:.84});
  const gridMat=new THREE.LineBasicMaterial({color:0xc9d3da,transparent:true,opacity:.30});
  const panel=(name,W,H,x,y,z,rx,ry,rz,m)=>{const p=new THREE.Mesh(new THREE.PlaneGeometry(W,H),m);p.name=name;p.position.set(x,y,z);p.rotation.set(rx,ry,rz);p.receiveShadow=false;p.renderOrder=-1000;group.add(p);roomRefs.surfaces[name]=p;return p};
  panel('room-floor',w,d,0,floorY,0,-Math.PI/2,0,0,floorMat);
  panel('room-ceiling',w,d,0,topY,0,Math.PI/2,0,0,ceilMat);
  panel('room-back-wall',w,h,0,my,backZ,0,0,0,wallMat);
  panel('room-left-wall',d,h,-halfW,my,0,0,Math.PI/2,0,sideMat);
  panel('room-right-wall',d,h,halfW,my,0,0,-Math.PI/2,0,sideMat);
  panel('room-front-wall',w,h,0,my,frontZ,0,Math.PI,0,frontMat);
  const box=(name,sx,sy,sz,x,y,z)=>{const b=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),trimMat);b.name=name;b.position.set(x,y,z);b.renderOrder=-900;group.add(b);roomRefs.trims.push(b);return b};
  const t=12,base=18;
  box('base-back',w,base,t,0,floorY+base/2,backZ+t/2);box('base-front',w,base,t,0,floorY+base/2,frontZ-t/2);box('base-left',t,base,d,-halfW+t/2,floorY+base/2,0);box('base-right',t,base,d,halfW-t/2,floorY+base/2,0);
  box('ceiling-back',w,t,t,0,topY-t/2,backZ+t/2);box('ceiling-front',w,t,t,0,topY-t/2,frontZ-t/2);box('ceiling-left',t,t,d,-halfW+t/2,topY-t/2,0);box('ceiling-right',t,t,d,halfW-t/2,topY-t/2,0);
  const line=(pts,m=edgeMat)=>{const g=new THREE.BufferGeometry().setFromPoints(pts.map(p=>new THREE.Vector3(p[0],p[1],p[2])));const l=new THREE.Line(g,m);l.renderOrder=-800;group.add(l);(m===gridMat?roomRefs.grid:roomRefs.edges).push(l);return l};
  const xL=-halfW,xR=halfW,zB=backZ,zF=frontZ;
  [[xL,floorY,zB,xL,topY,zB],[xR,floorY,zB,xR,topY,zB],[xL,floorY,zF,xL,topY,zF],[xR,floorY,zF,xR,topY,zF],[xL,floorY,zB,xR,floorY,zB],[xL,floorY,zF,xR,floorY,zF],[xL,floorY,zB,xL,floorY,zF],[xR,floorY,zB,xR,floorY,zF],[xL,topY,zB,xR,topY,zB],[xL,topY,zF,xR,topY,zF],[xL,topY,zB,xL,topY,zF],[xR,topY,zB,xR,topY,zF]].forEach(a=>line([[a[0],a[1],a[2]],[a[3],a[4],a[5]]]));
  for(let x=-2100;x<=2100;x+=420)line([[x,floorY+2,zB],[x,floorY+2,zF]],gridMat);
  for(let z=-2100;z<=2100;z+=420)line([[xL,floorY+3,z],[xR,floorY+3,z]],gridMat);
  return group;
}
addRoom();

const gameGroup=new THREE.Group();gameGroup.name='yakolak-game-on-table';scene.add(gameGroup);
function addGame(o){gameGroup.add(o);return o}
function alignGameToTable(tableObj){
  gameGroup.updateWorldMatrix(true,true);
  tableObj.updateWorldMatrix(true,true);
  const tb=new THREE.Box3().setFromObject(tableObj),gb=new THREE.Box3().setFromObject(gameGroup);
  if(tb.isEmpty()||gb.isEmpty())return;
  const offset=tb.max.y+TABLE_CONTACT_EPS-gb.min.y;
  gameGroup.position.y+=offset;
  log('game aligned to table',{tableTop:tb.max.y,gameBottom:gb.min.y,offsetY:gameGroup.position.y});
}

const loadingManager=new THREE.LoadingManager();
loadingManager.onStart=()=>setLoadingProgress(12,'تحميل الأصول');
loadingManager.onProgress=(url,itemsLoaded,itemsTotal)=>{
  const ratio=itemsTotal?itemsLoaded/itemsTotal:0;
  setLoadingProgress(18+ratio*68,'تحميل الأصول');
};
loadingManager.onLoad=()=>setLoadingProgress(90,'تركيب المشهد');
loadingManager.onError=()=>setLoadingProgress(90,'استكمال التحميل');
const stl=new STLLoader(loadingManager),svgLoader=new SVGLoader(loadingManager),tex=new THREE.TextureLoader(loadingManager);tex.setCrossOrigin('anonymous');
const makeMat=p=>new THREE.MeshStandardMaterial(p);
const baseMat=makeMat({color:'#161616',roughness:.54,metalness:.04});
const mats={right:makeMat({color:'#fff',roughness:.92,metalness:0}),left:makeMat({color:'#b37a18',roughness:.48,metalness:.28}),front:makeMat({color:'#006144',roughness:.58,metalness:.08}),back:makeMat({color:'#001f8f',roughness:.74,metalness:0})};
const D=48,R3=135,TYPES=['l','m','s'],ORDER=['right','left','front','back'];
const A={'9':{px:0,py:6,pz:0,rx:-90,ry:0,rz:0},'3-right':{px:R3,py:6,pz:0,rx:-90,ry:0,rz:0},'3-left':{px:-R3,py:6,pz:0,rx:-90,ry:0,rz:180},'3-front':{px:0,py:6,pz:R3,rx:-90,ry:0,rz:90},'3-back':{px:0,py:6,pz:-R3,rx:-90,ry:0,rz:-90}};
const LID={px:0,py:62.5,pz:0,rx:-90,ry:180,rz:0};
const WALL={right:{px:81,py:35,pz:0,rx:-90,ry:-90,rz:0},left:{px:-81,py:35,pz:0,rx:-90,ry:90,rz:180},front:{px:0,py:35,pz:81,rx:-180,ry:0,rz:90},back:{px:0,py:35,pz:-81,rx:-180,ry:180,rz:-90}};
const T={lidShake:420,lidLift:900,lidH:740,wallDelay:360,wallLift:260,wallMove:620,wallDrop:280,pieceLead:360,pieceMove:850,pieceArc:30,pieceStagger:42};
let meshes={},lid,pieces=[],loaded=false,playing=false,start=0,raf=0,tableMaps={};
let marbleTexture=null,activeTab='lights',selectedSurface='floor',selectedMaterial='table',selectedLightIndex=0;
const tableMaterials=[];
const PIECE_FINAL_Y=2;
const PIECE_DRAG_Y=14;
const SETUP_CHOICE_Y=PIECE_FINAL_Y;
const DEFAULT_DROP_RADIUS=31;
const boardZones=[[-1,-1],[0,-1],[1,-1],[-1,0],[0,0],[1,0],[-1,1],[0,1],[1,1]].map(([gx,gz],i)=>({id:i,gx,gz,px:gx*D,py:PIECE_FINAL_Y,pz:gz*D}));
const zoneMarkers=[];
const TURN_RING=['right','back','left','front'];
const SIZE_TYPES=['s','m','l'];
const SIZE_LABEL={s:'صغير',m:'وسط',l:'كبير'};
const COLOR_INFO={
  right:{label:'الأبيض',short:'أبيض',css:'#f4f4f0',power:.74},
  back:{label:'الأزرق',short:'أزرق',css:'#001f8f',power:.88},
  left:{label:'الذهبي',short:'ذهبي',css:'#b37a18',power:.66},
  front:{label:'الأخضر',short:'أخضر',css:'#006144',power:.8}
};
function cssRgb(css){
  const c=new THREE.Color(css);
  return `rgb(${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)})`;
}
function winHighlightPreset(id=calibration?.play?.winnerHighlightPreset){
  return WIN_HIGHLIGHT_PRESETS[id]||WIN_HIGHLIGHT_PRESETS.clean;
}
function tonedColor(color,state='normal'){
  const base=new THREE.Color(COLOR_INFO[color]?.css||'#ffffff');
  const hsl={};base.getHSL(hsl);
  if(state==='muted'){
    const p=winHighlightPreset();
    base.setHSL(hsl.h,Math.max(.08,hsl.s*p.mutedS),clamp(hsl.l*p.mutedL,.07,.48));
  }
  if(state==='bright'||state==='active'||state==='win')base.setHSL(hsl.h,Math.min(1,hsl.s*1.2+.1),Math.min(.96,hsl.l*1.18+.1));
  return base;
}
function solidMaterial(mat){
  mat.transparent=false;
  mat.opacity=1;
  mat.depthWrite=true;
  mat.needsUpdate=true;
  return mat;
}
function pieceStateMaterial(color,state='normal'){
  const base=mats[color]||mats.right;
  if(state==='normal')return base;
  const mat=base.clone();
  mat.color.copy(tonedColor(color,state));
  if(mat.emissive){
    const preset=winHighlightPreset();
    mat.emissive.copy(state==='muted'?new THREE.Color(0x000000):tonedColor(color,'bright'));
    mat.emissiveIntensity=state==='win'?preset.emissive:state==='active'?.32:0;
  }
  return solidMaterial(mat);
}
function setPieceVisual(piece,state='normal'){
  piece.mesh.material=pieceStateMaterial(piece.dir,state);
  solidMaterial(piece.mesh.material);
}
const WIN_LINES=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const SLOT_OFFSETS={s:{x:0,z:0},m:{x:0,z:0},l:{x:0,z:0}};
const PR=85,PG=11;
const SCORE_SIDES=[0,-1,1,-2,2,-3,3];
const pRows={front:{px:0,py:7,pz:PR,rx:-90,ry:0,rz:0,axis:'x'},back:{px:0,py:7,pz:-PR,rx:-90,ry:0,rz:0,axis:'x'},right:{px:PR,py:7,pz:0,rx:-90,ry:0,rz:90,axis:'z'},left:{px:-PR,py:7,pz:0,rx:-90,ry:0,rz:90,axis:'z'}};
let pGeometry=null,pPointMat=null;
let pieceGeos={};
const scoreMarkers=[];
const gameHighlightGroup=new THREE.Group();
gameHighlightGroup.name='yakolak-game-highlights';
gameGroup.add(gameHighlightGroup);
const setupGroup=new THREE.Group();
setupGroup.name='yakolak-table-setup';
gameGroup.add(setupGroup);
const setupPickables=[];
const lastMoveMarkers=new Map();
const setupSpinGroups=[];
let setupSpinRaf=0,setupTransitioning=false;
let instructionSprite=null,lastMoveSprite=null,selectionTray=null,selectedPlayPiece=null,timerHandle=0;
const DEFAULT_TURN_SECONDS=18;
const gameState={configured:false,started:false,tutorial:false,round:1,humanColor:null,botCount:3,players:[],turnIndex:0,board:{},scores:{right:0,back:0,left:0,front:0},winner:null,locked:false,setupStep:'color',turnDeadline:0,lastMoves:{right:null,back:null,left:null,front:null}};
globalThis.__yakolakGame={state:gameState,pieces,boardZones,camera,renderer,gameGroup,setupGroup,gameHighlightGroup,THREE};
const tabs=[['lights','الإضاءة'],['room','الغرفة'],['materials','الخامات'],['scene','المشهد'],['play','اللعب'],['system','النظام']];
const roomLabels={floor:'الأرض',ceiling:'السقف',backWall:'الجدار الخلفي',leftWall:'الجدار الأيسر',rightWall:'الجدار الأيمن',frontWall:'الجدار الأمامي',trim:'الحواف',edges:'خطوط الحواف',grid:'شبكة الأرض'};
const materialLabels={table:'الطاولة',board:'القاعدة',right:'الأبيض',left:'الذهبي',front:'الأخضر',back:'الأزرق'};
const lightTypes={point:'نقطة',spot:'مركزة',linear:'خطية',rect:'مستطيلة',directional:'اتجاهية',hemisphere:'محيطية',ambient:'عامة'};
const round=v=>Number(Number(v).toFixed(4));
function findPathIn(root,target,path=[]){
  if(root===target)return path;
  if(!root||typeof root!=='object')return null;
  for(const [k,v] of Object.entries(root)){
    const hit=findPathIn(v,target,path.concat(k));
    if(hit)return hit;
  }
  return null;
}
function pathFor(obj,key){const p=findPathIn(calibration,obj);return p?p.concat(key):null}
function getAt(root,path){return path.reduce((o,k)=>o?.[k],root)}
function setAt(root,path,value){const last=path[path.length-1];const parent=path.slice(0,-1).reduce((o,k)=>o[k],root);parent[last]=clone(value)}
function sameValue(a,b){return JSON.stringify(a)===JSON.stringify(b)}
function resetSetting(obj,key,refresh=true){
  const path=pathFor(obj,key);
  if(!path)return;
  setAt(calibration,path,getAt(DEFAULT_CALIBRATION,path));
  saveApply(refresh);
}
function resetCategory(key){
  calibration[key]=clone(DEFAULT_CALIBRATION[key]);
  if(key==='lights')selectedLightIndex=0;
  saveApply(true);
}
function resetMaterials(){
  calibration.game=clone(DEFAULT_CALIBRATION.game);
  calibration.table=clone(DEFAULT_CALIBRATION.table);
  saveApply(true);
}
function resetAll(){
  Object.assign(calibration,clone(DEFAULT_CALIBRATION));
  activeTab='lights';selectedLightIndex=0;selectedSurface='floor';selectedMaterial='table';
  saveApply(true);
}
function resetButton(obj,key){
  const b=el('button','yc-reset','↺');
  b.type='button';b.title='إعادة هذا الإعداد';b.setAttribute('aria-label','إعادة هذا الإعداد');
  const sync=()=>{
    const path=pathFor(obj,key);
    b.hidden=!path||sameValue(getAt(calibration,path),getAt(DEFAULT_CALIBRATION,path));
  };
  b.onclick=()=>resetSetting(obj,key);
  requestAnimationFrame(sync);
  b._syncReset=sync;
  return b;
}
function syncResetButtons(){document.querySelectorAll('.yc-reset').forEach(b=>b._syncReset?.())}
function saveApply(refresh=false){writeCalibration();applyCalibration();render();if(refresh)renderCalibrationPanel();else syncResetButtons()}
async function loadPublishedCalibration(){
  try{
    const res=await fetch('./api/calibration',{cache:'no-store'});
    if(res.status===404)return false;
    if(!res.ok)throw new Error(`database load ${res.status}`);
    const data=await res.json();
    if(data?.calibration){
      Object.assign(calibration,mergeDeep(DEFAULT_CALIBRATION,data.calibration));
      if(calibration.game?.left?.color==='#8a570f'){
        calibration.game.left.color='#b37a18';
        calibration.game.left.roughness=.48;
        calibration.game.left.metalness=.28;
      }
      calibration.scene.markers=false;
      publishedMeta=data.meta||null;
      log('published calibration loaded',publishedMeta);
      return true;
    }
  }catch(e){
    console.warn('[Yakolak] calibration database load skipped',e);
  }
  return false;
}
async function savePublishedCalibration(btn){
  if(savingCalibration)return false;
  savingCalibration=true;
  const old=btn?.textContent||'حفظ';
  if(btn){btn.disabled=true;btn.textContent='يحفظ'}
  try{
    const res=await fetch('./api/calibration',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({build:Number(BUILD),note:'yakolak published calibration',calibration})
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok||data.ok===false)throw new Error(data.error||`database save ${res.status}`);
    publishedMeta=data.meta||null;
    if(btn){btn.textContent='تم';setTimeout(()=>{btn.textContent=old;btn.disabled=false},900)}
    return true;
  }catch(e){
    console.error('[Yakolak] calibration database save failed',e);
    if(btn){btn.textContent='فشل';setTimeout(()=>{btn.textContent=old;btn.disabled=false},1200)}
    return false;
  }finally{
    savingCalibration=false;
  }
}
function updateMeshMaterial(mesh,cfg,forceTransparent=false){
  if(!mesh||!mesh.material||!cfg)return;
  const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  mats.forEach(mat=>{
    if(mat.color)mat.color.set(cfg.color);
    if('roughness' in mat&&Number.isFinite(+cfg.roughness))mat.roughness=+cfg.roughness;
    if('metalness' in mat&&Number.isFinite(+cfg.metalness))mat.metalness=+cfg.metalness;
    if(mat.emissive&&cfg.emissive)mat.emissive.set(cfg.emissive);
    if('emissiveIntensity' in mat&&Number.isFinite(+cfg.emissiveIntensity))mat.emissiveIntensity=+cfg.emissiveIntensity;
    if('wireframe' in mat)mat.wireframe=!!cfg.wireframe;
    mat.transparent=forceTransparent||+cfg.opacity<1;
    mat.opacity=Number.isFinite(+cfg.opacity)?+cfg.opacity:1;
    mat.depthWrite=!(mat.transparent&&mat.opacity<1);
    mat.needsUpdate=true;
  });
  mesh.visible=cfg.visible!==false;
}
function updateLineMaterial(line,cfg){
  if(!line||!line.material||!cfg)return;
  line.material.color.set(cfg.color);
  line.material.transparent=true;
  line.material.opacity=Number.isFinite(+cfg.opacity)?+cfg.opacity:1;
  line.material.needsUpdate=true;
  line.visible=cfg.visible!==false;
}
function applyTableMaterial(mat){
  if(!mat)return;
  const cfg=calibration.table;
  if(mat.color)mat.color.set(cfg.color);
  mat.roughness=+cfg.roughness;
  mat.metalness=+cfg.metalness;
  if(mat.emissive&&cfg.emissive)mat.emissive.set(cfg.emissive);
  if('emissiveIntensity' in mat&&Number.isFinite(+cfg.emissiveIntensity))mat.emissiveIntensity=+cfg.emissiveIntensity;
  if('wireframe' in mat)mat.wireframe=!!cfg.wireframe;
  mat.transparent=+cfg.opacity<1;
  mat.opacity=Number.isFinite(+cfg.opacity)?+cfg.opacity:1;
  mat.depthWrite=!(mat.transparent&&mat.opacity<1);
  mat.map=cfg.texture?tableMaps.albedo||null:null;
  mat.normalMap=cfg.texture&&!PERFORMANCE_MODE?tableMaps.normal||null:null;
  mat.roughnessMap=cfg.texture&&!PERFORMANCE_MODE?tableMaps.roughness||null:null;
  [mat.map,mat.normalMap,mat.roughnessMap].filter(Boolean).forEach(t=>{
    t.repeat.set(Number.isFinite(+cfg.repeatX)?+cfg.repeatX:1,Number.isFinite(+cfg.repeatY)?+cfg.repeatY:1);
    t.needsUpdate=true;
  });
  if(mat.normalScale)mat.normalScale.set(+cfg.normalScale,+cfg.normalScale);
  mat.needsUpdate=true;
}
function applyGameMaterials(){
  const game=calibration.game;
  [baseMat,mats.right,mats.left,mats.front,mats.back].forEach(mat=>{if(mat)mat.needsUpdate=true});
  baseMat.color.set(game.board.color);baseMat.roughness=+game.board.roughness;baseMat.metalness=+game.board.metalness;
  if(baseMat.emissive&&game.board.emissive)baseMat.emissive.set(game.board.emissive);
  if('emissiveIntensity' in baseMat)baseMat.emissiveIntensity=+game.board.emissiveIntensity||0;
  ORDER.forEach(k=>{const cfg=game[k],mat=mats[k];if(!cfg||!mat)return;mat.color.set(cfg.color);mat.roughness=+cfg.roughness;mat.metalness=+cfg.metalness;if(mat.emissive&&cfg.emissive)mat.emissive.set(cfg.emissive);if('emissiveIntensity' in mat)mat.emissiveIntensity=+cfg.emissiveIntensity||0;mat.needsUpdate=true});
  mats.right.map=game.right.marble&&marbleTexture?marbleTexture:null;
}
function applyRoomMaterials(){
  for(const [key,name] of Object.entries(SURFACE_KEYS)){
    updateMeshMaterial(roomRefs.surfaces[name],calibration.room[key],key==='frontWall');
  }
  roomRefs.trims.forEach(m=>updateMeshMaterial(m,calibration.room.trim));
  roomRefs.edges.forEach(l=>updateLineMaterial(l,calibration.room.edges));
  roomRefs.grid.forEach(l=>updateLineMaterial(l,calibration.room.grid));
}
function applySceneSettings(){
  scene.background=new THREE.Color(calibration.scene.background);
  renderer.toneMappingExposure=+calibration.scene.exposure;
  renderer.setPixelRatio(PERFORMANCE_MODE?performancePixelRatio():Math.min(Math.max(+calibration.scene.pixelRatio||1,1),2));
  scene.fog=calibration.scene.fog?new THREE.Fog(calibration.scene.fogColor,+calibration.scene.fogNear,+calibration.scene.fogFar):null;
  camera.fov=+calibration.scene.fov;camera.updateProjectionMatrix();
  controls.minDistance=+calibration.scene.minDistance;
  controls.maxDistance=+calibration.scene.maxDistance;
  controls.minPolarAngle=THREE.MathUtils.degToRad(+calibration.scene.minPolar);
  controls.maxPolarAngle=THREE.MathUtils.degToRad(+calibration.scene.maxPolar);
}
function disposeObject(o){
  o.traverse?.(n=>{n.geometry?.dispose?.();if(n.material){const arr=Array.isArray(n.material)?n.material:[n.material];arr.forEach(m=>m.dispose?.())}});
}
function makeLightLabel(txt){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='rgba(0,0,0,.72)';ctx.beginPath();ctx.arc(64,64,45,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,.95)';ctx.lineWidth=6;ctx.stroke();
  ctx.fillStyle='#fff';ctx.font='900 44px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(txt).slice(0,3),64,66);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map,transparent:true,depthTest:false,depthWrite:false}));
  sprite.scale.set(36,36,1);sprite.position.y=42;sprite.renderOrder=10000;
  return sprite;
}
function marker(cfg,label,index){
  if(!calibration.scene.markers)return null;
  const group=new THREE.Group();
  const size=Math.max(2,+cfg.size||18);
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(size,24,16),new THREE.MeshBasicMaterial({color:cfg.color,transparent:true,opacity:.78,depthTest:false,depthWrite:false}));
  const halo=new THREE.Mesh(new THREE.SphereGeometry(size*1.9,24,16),new THREE.MeshBasicMaterial({color:cfg.color,transparent:true,opacity:.18,depthTest:false,depthWrite:false}));
  mesh.userData.lightIndex=index;
  halo.userData.lightIndex=index;
  dragLightHandles.push(mesh);
  mesh.renderOrder=9999;halo.renderOrder=9998;group.add(halo,mesh,makeLightLabel(label));
  return group;
}
function positionLight(obj,cfg){obj.position.set(+cfg.x||0,+cfg.y||0,+cfg.z||0);return obj}
function targetFor(cfg){
  const target=new THREE.Object3D();
  target.position.set(+cfg.targetX||0,+cfg.targetY||0,+cfg.targetZ||0);
  lightRig.add(target);
  return target;
}
function addMarker(cfg,label,index){
  const m=marker(cfg,label,index);
  if(!m)return;
  positionLight(m,cfg);
  lightRig.add(m);
}
function addLinearLight(cfg,label,index){
  const count=Math.max(1,Math.round(+cfg.count||1)),len=+cfg.length||0,axis=cfg.axis||'x';
  for(let i=0;i<count;i++){
    const t=count===1?.5:i/(count-1),offset=(t-.5)*len;
    const p=new THREE.PointLight(cfg.color,+cfg.intensity,+cfg.distance,+cfg.decay);
    p.position.set(+cfg.x||0,+cfg.y||0,+cfg.z||0);
    if(axis==='x')p.position.x+=offset;
    if(axis==='y')p.position.y+=offset;
    if(axis==='z')p.position.z+=offset;
    lightRig.add(p);
  }
  if(calibration.scene.markers){
    const a=new THREE.Vector3(+cfg.x||0,+cfg.y||0,+cfg.z||0),b=a.clone();
    if(axis==='x'){a.x-=len/2;b.x+=len/2}
    if(axis==='y'){a.y-=len/2;b.y+=len/2}
    if(axis==='z'){a.z-=len/2;b.z+=len/2}
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([a,b]),new THREE.LineBasicMaterial({color:cfg.color,transparent:true,opacity:.85,depthTest:false}));
    line.renderOrder=9999;lightRig.add(line);addMarker(cfg,label,index);
  }
}
function buildLighting(){
  while(lightRig.children.length){const child=lightRig.children.pop();disposeObject(child)}
  dragLightHandles=[];
  if(PERFORMANCE_MODE){
    lightRig.add(new THREE.HemisphereLight(0xffffff,0x5f6972,.82));
    const key=new THREE.DirectionalLight(0xfff7e8,1.05);
    key.position.set(-520,760,480);
    key.target.position.set(0,0,0);
    lightRig.add(key,key.target);
    return;
  }
  calibration.lights.forEach((cfg,i)=>{
    if(!cfg.enabled)return;
    const label=cfg.name||String(i+1);
    if(cfg.type==='ambient'){lightRig.add(new THREE.AmbientLight(cfg.color,+cfg.intensity));return}
    if(cfg.type==='hemisphere'){const l=new THREE.HemisphereLight(cfg.color,cfg.groundColor||'#cbd8df',+cfg.intensity);positionLight(l,cfg);lightRig.add(l);return}
    if(cfg.type==='directional'){const l=new THREE.DirectionalLight(cfg.color,+cfg.intensity);positionLight(l,cfg);l.target=targetFor(cfg);lightRig.add(l);addMarker(cfg,label,i);return}
    if(cfg.type==='spot'){const l=new THREE.SpotLight(cfg.color,+cfg.intensity,+cfg.distance,THREE.MathUtils.degToRad(+cfg.angle),+cfg.penumbra,+cfg.decay);positionLight(l,cfg);l.target=targetFor(cfg);lightRig.add(l);addMarker(cfg,label,i);return}
    if(cfg.type==='rect'){const l=new THREE.RectAreaLight(cfg.color,+cfg.intensity,+cfg.width,+cfg.height);positionLight(l,cfg);l.rotation.set(THREE.MathUtils.degToRad(+cfg.rx||0),THREE.MathUtils.degToRad(+cfg.ry||0),THREE.MathUtils.degToRad(+cfg.rz||0));lightRig.add(l);if(calibration.scene.markers){const m=new THREE.Mesh(new THREE.PlaneGeometry(+cfg.width||1,+cfg.height||1),new THREE.MeshBasicMaterial({color:cfg.color,transparent:true,opacity:.28,side:THREE.DoubleSide,depthTest:false,depthWrite:false}));positionLight(m,cfg);m.rotation.copy(l.rotation);m.renderOrder=9999;lightRig.add(m);addMarker(cfg,label,i)}return}
    if(cfg.type==='linear'){addLinearLight(cfg,label,i);return}
    const l=new THREE.PointLight(cfg.color,+cfg.intensity,+cfg.distance,+cfg.decay);positionLight(l,cfg);lightRig.add(l);addMarker(cfg,label,i);
  });
}
function applyCalibration(){
  applySceneSettings();
  applyRoomMaterials();
  applyGameMaterials();
  tableMaterials.forEach(applyTableMaterial);
  buildLighting();
  syncZoneMarkers(false);
}
function injectCalibrationCss(){
  if(document.getElementById('yakolakCalibrationCss'))return;
  const style=document.createElement('style');
  style.id='yakolakCalibrationCss';
  style.textContent=`
  @font-face{font-family:ExpoYakolak;src:url('./assets/fonts/expo-arabic-medium.ttf?v=${BUILD}') format('truetype');font-weight:500;font-style:normal;font-display:swap}
  #yakolakTools{position:fixed;right:12px;bottom:12px;z-index:10060;display:flex;gap:8px;direction:rtl}
  .yakolak-tool{width:58px;height:42px;border-radius:12px;border:1px solid rgba(255,255,255,.24);background:rgba(10,11,12,.82);color:#fff;font:900 12px system-ui;box-shadow:0 10px 26px rgba(0,0,0,.32);cursor:pointer;backdrop-filter:blur(10px)}
  .yakolak-tool:active{transform:translateY(1px)}
  #clearCacheBtn.yakolak-tool{position:static!important;left:auto!important;bottom:auto!important;width:58px!important;height:42px!important;border-radius:12px!important;padding:0!important;font-size:12px!important}
  #yakolakCalibrationPanel{position:fixed;right:12px;top:60px;z-index:10080;width:min(600px,calc(100vw - 24px));max-height:calc(100vh - 76px);display:none;overflow:hidden;border:1px solid rgba(255,255,255,.16);border-radius:16px;background:rgba(14,16,18,.94);color:#fff;font:12px system-ui;direction:rtl;box-shadow:0 18px 60px rgba(0,0,0,.45);backdrop-filter:blur(16px)}
  #yakolakCalibrationPanel.open{display:flex;flex-direction:column}
  .yc-head{display:flex;gap:8px;align-items:center;padding:10px 10px 8px;border-bottom:1px solid rgba(255,255,255,.1)}
  .yc-title{font:900 15px system-ui;margin-inline-end:auto}
  .yc-btn{border:1px solid rgba(255,255,255,.18);border-radius:10px;background:#fff;color:#050505;font:900 12px system-ui;padding:8px 10px;cursor:pointer}
  .yc-btn.dark{background:rgba(255,255,255,.08);color:#fff}
  .yc-tabs{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.08)}
  .yc-tab{border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(255,255,255,.06);color:#fff;font:800 11px system-ui;padding:8px 2px;cursor:pointer}
  .yc-tab.active{background:#fff;color:#050505}
  .yc-body{overflow:auto;padding:10px}
  .yc-card{border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:10px;margin-bottom:10px;background:rgba(255,255,255,.045)}
  .yc-card h3{margin:0 0 8px;font:900 13px system-ui}
  .yc-row{display:grid;grid-template-columns:80px 30px minmax(0,1fr) 30px 28px;gap:5px;align-items:center;margin:6px 0}
  .yc-row label,.yc-line label{color:rgba(255,255,255,.82);font-weight:800}
  .yc-row input[type=number],.yc-line input,.yc-line select,.yc-line textarea{width:100%;min-width:0;height:34px;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:#070809;color:#fff;padding:0 8px;font:800 12px system-ui}
  .yc-line textarea{height:94px;padding:8px;resize:vertical;direction:ltr}
  .yc-step,.yc-reset{height:34px;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:rgba(255,255,255,.08);color:#fff;font:900 15px system-ui;cursor:pointer}
  .yc-reset{background:rgba(96,165,250,.16);border-color:rgba(96,165,250,.42);color:#dbeafe}
  .yc-reset[hidden]{visibility:hidden;display:block}
  .yc-line{display:grid;grid-template-columns:96px minmax(0,1fr) 28px;gap:7px;align-items:center;margin:7px 0}
  .yc-line input[type=color]{height:36px;padding:2px}
  .yc-line input[type=checkbox]{width:22px;height:22px}
  .yc-actions{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0}
  .yc-actions .yc-btn{padding:8px 4px}
  .yc-wide{grid-column:1/-1}
  .yc-note{grid-column:1/-1;color:rgba(255,255,255,.7);font:800 11px/1.6 system-ui;margin:2px 0 7px}
  .yc-card-tools{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 8px}
  @media (min-width:900px){
    .yc-card{display:grid;grid-template-columns:1fr 1fr;column-gap:10px;align-items:start}
    .yc-card h3,.yc-card .yc-line:first-of-type,.yc-card .yc-actions,.yc-card .yc-card-tools,.yc-card textarea,.yc-wide{grid-column:1/-1}
    .yc-line{grid-template-columns:82px minmax(0,1fr) 28px}
    .yc-row{grid-template-columns:64px 28px minmax(0,1fr) 28px 26px}
  }
  @media (max-width:640px){
    #yakolakTools{right:8px;bottom:8px;gap:6px}
    .yakolak-tool,#clearCacheBtn.yakolak-tool{width:52px!important;height:40px!important}
    #yakolakCalibrationPanel{right:8px;left:8px;top:54px;bottom:auto;width:auto;max-height:calc(100vh - 112px);border-radius:14px}
    .yc-tabs{grid-template-columns:repeat(3,1fr);gap:4px}
    .yc-row{grid-template-columns:78px 32px minmax(0,1fr) 32px 28px}
    .yc-line{grid-template-columns:90px minmax(0,1fr) 28px}
  }
  #yakolakGameSetup{position:fixed;inset:0;z-index:10030;display:grid;place-items:center;background:transparent;direction:rtl;color:#fff;font:13px ExpoYakolak,system-ui;pointer-events:none}
  #yakolakGameSetup.hidden{display:none}
  .yg-card{display:none}
  .yg-title{font:500 24px ExpoYakolak,system-ui;margin-bottom:14px;text-align:center;letter-spacing:0}
  .yg-label{font:850 12px ExpoYakolak,system-ui;color:rgba(255,255,255,.75);margin:12px 0 7px}
  .yg-colors,.yg-bots{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
  .yg-bots{grid-template-columns:repeat(3,1fr)}
  .yg-choice{min-height:130px;border:1px solid rgba(255,255,255,.14);border-radius:14px;background:rgba(255,255,255,.07);color:#fff;font:900 12px ExpoYakolak,system-ui;cursor:pointer;display:grid;place-items:center;gap:8px;padding:11px}
  .yg-choice.bot{min-height:62px;font-size:15px}
  .yg-choice.active{outline:2px solid #fff;background:rgba(255,255,255,.18)}
  .yg-pieces{height:72px;display:flex;align-items:center;justify-content:center;gap:9px}
  .yg-piece{display:block;border-radius:999px;border:2px solid rgba(255,255,255,.78);background:radial-gradient(circle at 32% 25%,rgba(255,255,255,.78),rgba(255,255,255,0) 25%),linear-gradient(135deg,rgba(255,255,255,.2),rgba(0,0,0,.3)),var(--piece-color);box-shadow:0 10px 22px rgba(0,0,0,.44),inset 0 8px 15px rgba(255,255,255,.2),inset 0 -8px 16px rgba(0,0,0,.22);animation:yg-spin 3s linear infinite}
  .yg-piece.s{width:27px;height:27px}.yg-piece.m{width:39px;height:39px;animation-duration:3.5s}.yg-piece.l{width:52px;height:52px;animation-duration:4s}
  @keyframes yg-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  .yg-name{font:500 16px ExpoYakolak,system-ui}
  .yg-start{display:none}
  body:not(.yakolak-ready) #yakolakGameHud{display:none!important}
  #yakolakGameHud{position:fixed;left:0;right:0;top:0;z-index:10040;display:flex;justify-content:center;align-items:stretch;pointer-events:none;direction:rtl}
  .yg-caption{width:100%;min-height:48px;padding:11px 78px 10px;border:0;border-bottom:1px solid rgba(255,255,255,.18);border-radius:0;background:var(--caption-bg,#111317);color:#fff;text-align:center;font:500 17px/1.55 ExpoYakolak,system-ui;box-shadow:0 10px 26px rgba(0,0,0,.32);letter-spacing:0}
  .yg-score{position:fixed;left:12px;top:58px;z-index:10010;display:flex;gap:6px;direction:rtl}
  .yg-score span{min-width:56px;padding:7px 8px;border:1px solid rgba(255,255,255,.2);border-radius:10px;background:#0b0c0d;color:#fff;font:900 12px ExpoYakolak,system-ui;text-align:center}
  #yakolakTutorialDialog{position:fixed;inset:0;z-index:10090;display:none;place-items:center;padding:18px;direction:rtl;color:#fff;background:rgba(0,0,0,.18);font-family:ExpoYakolak,system-ui;pointer-events:auto}
  #yakolakTutorialDialog.open{display:grid}
  .yt-box{width:min(430px,calc(100vw - 32px));border:1px solid rgba(255,255,255,.18);border-radius:16px;background:rgba(12,14,16,.94);box-shadow:0 20px 70px rgba(0,0,0,.52);padding:16px;text-align:center}
  .yt-text{font:500 18px/1.65 ExpoYakolak,system-ui;margin-bottom:14px}
  .yt-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .yt-actions button{height:42px;border-radius:12px;border:1px solid rgba(255,255,255,.16);cursor:pointer;font:900 13px ExpoYakolak,system-ui}
  .yt-ok{background:#fff;color:#050505}.yt-repeat{background:rgba(255,255,255,.08);color:#fff}
  @media (max-width:640px){.yg-card{padding:14px}.yg-title{font-size:21px}.yg-colors{grid-template-columns:repeat(2,1fr)}.yg-bots{grid-template-columns:1fr}.yg-choice{min-height:104px}.yg-caption{min-height:46px;padding:10px 12px;font-size:14px}.yg-score{top:54px;left:8px;right:8px;flex-wrap:wrap}.yg-score span{min-width:48px;padding:6px}.yt-text{font-size:16px}}`;
  document.head.appendChild(style);
}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n}
function action(label,fn,dark=false){const b=el('button','yc-btn'+(dark?' dark':''),label);b.type='button';b.onclick=fn;return b}
function tools(parent,items){const wrap=el('div','yc-card-tools');items.forEach(([label,fn,dark])=>wrap.append(action(label,fn,!!dark)));parent.append(wrap);return wrap}
function colorField(parent,label,obj,key){const row=el('div','yc-line');row.append(el('label','',label));const input=document.createElement('input');input.type='color';input.value=obj[key];input.oninput=()=>{obj[key]=input.value;saveApply()};row.append(input,resetButton(obj,key));parent.append(row)}
function textField(parent,label,obj,key){const row=el('div','yc-line');row.append(el('label','',label));const input=document.createElement('input');input.value=obj[key]??'';input.oninput=()=>{obj[key]=input.value;saveApply()};row.append(input,resetButton(obj,key));parent.append(row)}
function toggleField(parent,label,obj,key){const row=el('div','yc-line');row.append(el('label','',label));const input=document.createElement('input');input.type='checkbox';input.checked=!!obj[key];input.onchange=()=>{obj[key]=input.checked;saveApply()};row.append(input,resetButton(obj,key));parent.append(row)}
function selectField(parent,label,value,options,onchange){const row=el('div','yc-line');row.append(el('label','',label));const select=document.createElement('select');options.forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;if(String(v)===String(value))o.selected=true;select.append(o)});select.onchange=()=>onchange(select.value);row.append(select);parent.append(row);return select}
function numberField(parent,label,obj,key,step=1){
  const row=el('div','yc-row');row.append(el('label','',label));
  const minus=el('button','yc-step','-'),plus=el('button','yc-step','+'),input=document.createElement('input');
  input.type='number';input.step=String(step);input.value=obj[key]??0;
  const setv=v=>{const n=Number(v);if(!Number.isFinite(n))return;obj[key]=round(n);input.value=obj[key];saveApply()};
  const repeat=(dir)=>{
    let delay=330, timer=null, active=true;
    const tick=()=>{if(!active)return;setv((Number(input.value)||0)+dir*step);timer=setTimeout(tick,delay);delay=Math.max(42,delay*.72)};
    tick();
    const stop=()=>{active=false;clearTimeout(timer);removeEventListener('pointerup',stop);removeEventListener('pointercancel',stop);removeEventListener('blur',stop)};
    addEventListener('pointerup',stop);addEventListener('pointercancel',stop);addEventListener('blur',stop);
  };
  minus.onpointerdown=e=>{e.preventDefault();repeat(-1)};
  plus.onpointerdown=e=>{e.preventDefault();repeat(1)};
  input.oninput=()=>setv(input.value);
  row.append(minus,input,plus,resetButton(obj,key));parent.append(row);
}
function card(parent,title){const c=el('section','yc-card');c.append(el('h3','',title));parent.append(c);return c}
function selectedLight(){selectedLightIndex=Math.min(Math.max(selectedLightIndex,0),Math.max(calibration.lights.length-1,0));return calibration.lights[selectedLightIndex]}
function applyCalibratedCamera(ms=520){
  return setCameraView(
    {x:+calibration.scene.cameraX||520,y:+calibration.scene.cameraY||430,z:+calibration.scene.cameraZ||520},
    {x:+calibration.scene.targetX||0,y:+calibration.scene.targetY||0,z:+calibration.scene.targetZ||0},
    ms
  );
}
function captureCurrentCamera(){
  calibration.scene.cameraX=round(camera.position.x);
  calibration.scene.cameraY=round(camera.position.y);
  calibration.scene.cameraZ=round(camera.position.z);
  calibration.scene.targetX=round(controls.target.x);
  calibration.scene.targetY=round(controls.target.y);
  calibration.scene.targetZ=round(controls.target.z);
  saveApply(true);
}
function renderSceneTab(body){
  const c=card(body,'المشهد');
  tools(c,[['ريست المشهد',()=>resetCategory('scene'),true],['حفظ زاوية الكاميرا',captureCurrentCamera,true],['تطبيق الزاوية',()=>applyCalibratedCamera(),true]]);
  colorField(c,'الخلفية',calibration.scene,'background');
  numberField(c,'التعريض',calibration.scene,'exposure',.05);
  numberField(c,'دقة الرسم',calibration.scene,'pixelRatio',.05);
  numberField(c,'زاوية الكاميرا',calibration.scene,'fov',1);
  numberField(c,'أقرب دوران',calibration.scene,'minDistance',10);
  numberField(c,'أبعد دوران',calibration.scene,'maxDistance',10);
  numberField(c,'ميل أدنى',calibration.scene,'minPolar',1);
  numberField(c,'ميل أعلى',calibration.scene,'maxPolar',1);
  toggleField(c,'علامات الإضاءة',calibration.scene,'markers');
  const cam=card(body,'موضع الكاميرا');
  tools(cam,[['حفظ الحالي',captureCurrentCamera,true],['معاينة الزاوية',()=>applyCalibratedCamera(),true]]);
  numberField(cam,'كاميرا X',calibration.scene,'cameraX',10);
  numberField(cam,'كاميرا Y',calibration.scene,'cameraY',10);
  numberField(cam,'كاميرا Z',calibration.scene,'cameraZ',10);
  numberField(cam,'هدف X',calibration.scene,'targetX',5);
  numberField(cam,'هدف Y',calibration.scene,'targetY',5);
  numberField(cam,'هدف Z',calibration.scene,'targetZ',5);
  const f=card(body,'الضباب');
  tools(f,[['ريست المشهد',()=>resetCategory('scene'),true]]);
  toggleField(f,'تشغيل',calibration.scene,'fog');
  colorField(f,'اللون',calibration.scene,'fogColor');
  numberField(f,'البداية',calibration.scene,'fogNear',50);
  numberField(f,'النهاية',calibration.scene,'fogFar',50);
}
function renderPlayTab(body){
  const c=card(body,'السحب وخانات اللعب');
  tools(c,[['ريست اللعب',()=>resetCategory('play'),true],['إرجاع القطع لمواقعها',()=>{pieces.forEach(p=>{p.zoneIndex=null;tr(p.mesh,p.final)});syncZoneMarkers(false);render()},true]]);
  toggleField(c,'سحب l/m/s',calibration.play,'dragPieces');
  toggleField(c,'سناب للخانات',calibration.play,'snapToZones');
  toggleField(c,'إظهار الخانات',calibration.play,'showZones');
  colorField(c,'لون الخانات',calibration.play,'zoneColor');
  numberField(c,'حجم الخانة',calibration.play,'zoneSize',2);
  numberField(c,'شفافية الخانة',calibration.play,'zoneOpacity',.02);
  numberField(c,'مدى اللمس',calibration.play,'dropRadius',2);
  numberField(c,'ثواني الدور',calibration.play,'turnSeconds',1);
  const win=card(body,'تمييز الفائز');
  tools(win,[['ريست التمييز',()=>{calibration.play.winnerHighlightPreset=DEFAULT_CALIBRATION.play.winnerHighlightPreset;saveApply(true)},true]]);
  selectField(win,'النمط',calibration.play.winnerHighlightPreset||'clean',Object.entries(WIN_HIGHLIGHT_PRESETS).map(([id,p])=>[id,p.label]),v=>{calibration.play.winnerHighlightPreset=v;saveApply()});
  numberField(win,'عدد الرمشات',calibration.play,'winnerBlinkCount',1);
  numberField(win,'مدة الرمش',calibration.play,'winnerBlinkDuration',100);
  colorField(win,'لون الوميض',calibration.play,'winnerGlowColor');
  Object.entries(WIN_HIGHLIGHT_PRESETS).forEach(([id,p])=>{
    const row=el('div','yc-line');
    const label=el('label','',`${p.label} - ${p.desc}`);
    row.append(label,action('معاينة',()=>previewWinnerHighlightPreset(id),true));
    win.append(row);
  });
}
function renderRoomTab(body){
  const keys=Object.keys(roomLabels);
  const c=card(body,'سطح الغرفة');
  tools(c,[['ريست الغرفة',()=>resetCategory('room'),true],['ريست السطح',()=>{calibration.room[selectedSurface]=clone(DEFAULT_CALIBRATION.room[selectedSurface]);saveApply(true)},true]]);
  selectField(c,'العنصر',selectedSurface,keys.map(k=>[k,roomLabels[k]]),v=>{selectedSurface=v;renderCalibrationPanel()});
  const cfg=calibration.room[selectedSurface];
  colorField(c,'اللون',cfg,'color');
  if(!['edges','grid'].includes(selectedSurface)){
    numberField(c,'الخشونة',cfg,'roughness',.02);
    numberField(c,'المعدنية',cfg,'metalness',.02);
    colorField(c,'لون الانبعاث',cfg,'emissive');
    numberField(c,'قوة الانبعاث',cfg,'emissiveIntensity',.02);
    toggleField(c,'وايرفريم',cfg,'wireframe');
  }
  numberField(c,'الشفافية',cfg,'opacity',.02);
  toggleField(c,'ظاهر',cfg,'visible');
}
function renderMaterialsTab(body){
  const keys=Object.keys(materialLabels);
  const c=card(body,'الخامة');
  tools(c,[['ريست الخامات',resetMaterials,true],['ريست هذا العنصر',()=>{if(selectedMaterial==='table')calibration.table=clone(DEFAULT_CALIBRATION.table);else calibration.game[selectedMaterial]=clone(DEFAULT_CALIBRATION.game[selectedMaterial]);saveApply(true)},true]]);
  selectField(c,'العنصر',selectedMaterial,keys.map(k=>[k,materialLabels[k]]),v=>{selectedMaterial=v;renderCalibrationPanel()});
  if(selectedMaterial==='table'){
    const cfg=calibration.table;
    colorField(c,'اللون',cfg,'color');
    numberField(c,'الخشونة',cfg,'roughness',.02);
    numberField(c,'المعدنية',cfg,'metalness',.02);
    numberField(c,'قوة النورمل',cfg,'normalScale',.05);
    numberField(c,'تكرار X',cfg,'repeatX',.05);
    numberField(c,'تكرار Y',cfg,'repeatY',.05);
    numberField(c,'الشفافية',cfg,'opacity',.02);
    colorField(c,'لون الانبعاث',cfg,'emissive');
    numberField(c,'قوة الانبعاث',cfg,'emissiveIntensity',.02);
    toggleField(c,'وايرفريم',cfg,'wireframe');
    toggleField(c,'خرائط الطاولة',cfg,'texture');
    return;
  }
  const cfg=calibration.game[selectedMaterial];
  colorField(c,'اللون',cfg,'color');
  numberField(c,'الخشونة',cfg,'roughness',.02);
  numberField(c,'المعدنية',cfg,'metalness',.02);
  colorField(c,'لون الانبعاث',cfg,'emissive');
  numberField(c,'قوة الانبعاث',cfg,'emissiveIntensity',.02);
  if(selectedMaterial==='right')toggleField(c,'رخام الأبيض',cfg,'marble');
}
function applyLightingPreset(name){
  const set=(id,values)=>{const light=calibration.lights.find(l=>l.id===id);if(light)Object.assign(light,values)};
  calibration.lights.forEach(l=>l.enabled=false);
  if(name==='balanced'){
    set('orbA',{enabled:true,intensity:2.35,x:-520,y:380,z:430,color:'#ffffff'});
    set('orbB',{enabled:true,intensity:1.65,x:520,y:300,z:360,color:'#fff2cf'});
    set('orbC',{enabled:true,intensity:1.05,x:0,y:850,z:-360,color:'#d8ecff'});
  }else if(name==='focus'){
    set('spotKey',{enabled:true,intensity:2.7,x:0,y:880,z:520,targetX:0,targetY:0,targetZ:0,angle:30,penumbra:.58,color:'#fff5dc'});
    set('ambient',{enabled:true,intensity:.08,color:'#ffffff'});
  }else if(name==='soft'){
    set('rectSoft',{enabled:true,intensity:3.4,width:1000,height:170,x:0,y:1040,z:-860,rx:-62,ry:0,rz:0,color:'#ffffff'});
    set('hemi',{enabled:true,intensity:.32,color:'#ffffff',groundColor:'#ccd6df'});
  }else if(name==='off'){
    calibration.lights.forEach(l=>l.enabled=false);
  }
  calibration.scene.markers=true;
  saveApply(true);
}
function newLight(type){
  const base=clone(DEFAULT_CALIBRATION.lights.find(l=>l.type===type)||DEFAULT_CALIBRATION.lights[0]);
  base.id=`${type}-${Date.now()}`;
  base.name=lightTypes[type]||'ضوء';
  base.enabled=true;
  calibration.lights.push(base);
  selectedLightIndex=calibration.lights.length-1;
  saveApply(true);
}
function deleteLight(){
  if(!calibration.lights.length)return;
  calibration.lights.splice(selectedLightIndex,1);
  if(!calibration.lights.length)newLight('point');
  selectedLightIndex=Math.max(0,selectedLightIndex-1);
  saveApply(true);
}
function renderLightsTab(body){
  const cfg=selectedLight();
  const pick=card(body,'مصدر الإضاءة');
  tools(pick,[['ريست الإضاءة',()=>resetCategory('lights'),true],['ريست المصدر',()=>{calibration.lights[selectedLightIndex]=clone(DEFAULT_CALIBRATION.lights[selectedLightIndex]||DEFAULT_CALIBRATION.lights[0]);saveApply(true)},true],['إطفاء الكل',()=>{calibration.lights.forEach(l=>l.enabled=false);saveApply(true)},true],['تشغيل الكل',()=>{calibration.lights.forEach(l=>l.enabled=true);saveApply(true)},true]]);
  selectField(pick,'اختيار',String(selectedLightIndex),calibration.lights.map((l,i)=>[String(i),`${i+1}. ${l.name} - ${lightTypes[l.type]||l.type}`]),v=>{selectedLightIndex=Number(v);renderCalibrationPanel()});
  const preset=card(body,'معاينات سريعة');
  const note=el('div','yc-note','هذه أزرار تجربة مباشرة للإضاءة؛ الحفظ لا يتم إلا بزر حفظ.');
  preset.append(note);
  tools(preset,[['متوازن',()=>applyLightingPreset('balanced'),true],['مركّز',()=>applyLightingPreset('focus'),true],['ناعم',()=>applyLightingPreset('soft'),true],['إطفاء كامل',()=>applyLightingPreset('off'),true]]);
  const actionsRow=el('div','yc-actions');
  [['نقطة','point'],['مركزة','spot'],['خطية','linear'],['مستطيلة','rect'],['اتجاهية','directional'],['محيطية','hemisphere'],['عامة','ambient']].forEach(([label,type])=>actionsRow.append(action(label,()=>newLight(type),true)));
  pick.append(actionsRow);
  pick.append(action('حذف المصدر المختار',deleteLight,true));
  const c=card(body,'الإعدادات');
  textField(c,'الاسم',cfg,'name');
  selectField(c,'النوع',cfg.type,Object.entries(lightTypes).map(([v,t])=>[v,t]),v=>{cfg.type=v;saveApply(true)});
  toggleField(c,'تشغيل',cfg,'enabled');
  colorField(c,'اللون',cfg,'color');
  numberField(c,'القوة',cfg,'intensity',.05);
  if(!['ambient','hemisphere','rect'].includes(cfg.type))numberField(c,'المدى',cfg,'distance',50);
  if(['point','spot','linear'].includes(cfg.type))numberField(c,'التلاشي',cfg,'decay',.05);
  numberField(c,'حجم العلامة',cfg,'size',1);
  if(cfg.type==='hemisphere')colorField(c,'لون الأرض',cfg,'groundColor');
  if(cfg.type==='spot'){
    numberField(c,'زاوية التركيز',cfg,'angle',1);
    numberField(c,'نعومة الحافة',cfg,'penumbra',.05);
  }
  if(cfg.type==='linear'){
    numberField(c,'العدد',cfg,'count',1);
    numberField(c,'الطول',cfg,'length',50);
    selectField(c,'المحور',cfg.axis||'x',[['x','يمين/يسار'],['y','ارتفاع'],['z','عمق']],v=>{cfg.axis=v;saveApply(true)});
  }
  if(cfg.type==='rect'){
    numberField(c,'العرض',cfg,'width',50);
    numberField(c,'الارتفاع',cfg,'height',10);
    numberField(c,'دوران X',cfg,'rx',1);
    numberField(c,'دوران Y',cfg,'ry',1);
    numberField(c,'دوران Z',cfg,'rz',1);
  }
  if(cfg.type!=='ambient'){
    const p=card(body,'الموقع');
    numberField(p,'يمين/يسار',cfg,'x',10);
    numberField(p,'الارتفاع',cfg,'y',10);
    numberField(p,'العمق',cfg,'z',10);
  }
  if(['spot','directional'].includes(cfg.type)){
    const t=card(body,'نقطة التركيز');
    numberField(t,'يمين/يسار',cfg,'targetX',10);
    numberField(t,'الارتفاع',cfg,'targetY',10);
    numberField(t,'العمق',cfg,'targetZ',10);
  }
}
function copyText(text,btn){
  const done=()=>{const old=btn.textContent;btn.textContent='تم';setTimeout(()=>btn.textContent=old,900)};
  if(navigator.clipboard)navigator.clipboard.writeText(text).then(done).catch(()=>fallbackCopy(text,done));
  else fallbackCopy(text,done);
}
function fallbackCopy(text,done){
  const t=document.createElement('textarea');
  t.value=text;t.style.position='fixed';t.style.left='-999px';document.body.append(t);t.select();
  try{document.execCommand('copy');done()}catch(e){}
  t.remove();
}
function renderSystemTab(body){
  const c=card(body,'القيم');
  c.append(action('حفظ القيم',e=>savePublishedCalibration(e.currentTarget)));
  const area=document.createElement('textarea');area.placeholder='JSON';area.dir='ltr';area.value='';
  const row=el('div','yc-line');row.append(el('label','','لصق'));row.append(area);c.append(row);
  c.append(action('تطبيق الملصق',()=>{try{const next=JSON.parse(area.value);Object.assign(calibration,mergeDeep(DEFAULT_CALIBRATION,next));saveApply(true)}catch(e){area.value='JSON غير صحيح'}}));
  const r=card(body,'إعادة');
  r.append(action('ريست كل شيء',resetAll,true));
  r.append(action('ريست التصنيف الحالي',()=>{if(activeTab==='materials')resetMaterials();else resetCategory(activeTab==='room'?'room':activeTab==='scene'?'scene':activeTab==='play'?'play':activeTab==='lights'?'lights':'scene')},true));
  r.append(action('ريست الإضاءة فقط',()=>resetCategory('lights'),true));
}
function renderCalibrationPanel(){
  const panel=document.getElementById('yakolakCalibrationPanel');
  if(!panel)return;
  panel.innerHTML='';
  const head=el('div','yc-head');
  head.append(el('div','yc-title','معايرة Yakolak'));
  head.append(action('معاينة المشهد',()=>panel.classList.remove('open')));
  head.append(action('حفظ',e=>savePublishedCalibration(e.currentTarget),true));
  head.append(action('إغلاق',()=>panel.classList.remove('open'),true));
  panel.append(head);
  const tabbar=el('div','yc-tabs');
  tabs.forEach(([id,label])=>{const b=el('button','yc-tab'+(activeTab===id?' active':''),label);b.type='button';b.onclick=()=>{activeTab=id;renderCalibrationPanel()};tabbar.append(b)});
  panel.append(tabbar);
  const body=el('div','yc-body');panel.append(body);
  if(activeTab==='scene')renderSceneTab(body);
  if(activeTab==='play')renderPlayTab(body);
  if(activeTab==='room')renderRoomTab(body);
  if(activeTab==='materials')renderMaterialsTab(body);
  if(activeTab==='lights')renderLightsTab(body);
  if(activeTab==='system')renderSystemTab(body);
}
function createCalibrationChrome(){
  injectCalibrationCss();
  let tools=document.getElementById('yakolakTools');
  if(!tools){tools=el('div');tools.id='yakolakTools';document.body.append(tools)}
  const clear=document.getElementById('clearCacheBtn');
  if(clear&&!tools.contains(clear)){clear.className='yakolak-tool';clear.textContent='مسح';clear.removeAttribute('style');tools.append(clear)}
  if(!document.getElementById('yakolakReplayBtn')){const b=el('button','yakolak-tool','إعادة');b.id='yakolakReplayBtn';b.type='button';b.onclick=()=>replay();tools.append(b)}
  if(!document.getElementById('yakolakCalibrateBtn')){const b=el('button','yakolak-tool','معايرة');b.id='yakolakCalibrateBtn';b.type='button';b.onclick=()=>document.getElementById('yakolakCalibrationPanel')?.classList.toggle('open');tools.append(b)}
  if(!document.getElementById('yakolakCalibrationPanel')){const p=el('aside');p.id='yakolakCalibrationPanel';document.body.append(p)}
  renderCalibrationPanel();
}
function colorName(c){return COLOR_INFO[c]?.short||c}
function playerSequence(start,count){
  const ring=TURN_RING.slice();
  const at=Math.max(0,ring.indexOf(start));
  const ordered=ring.slice(at).concat(ring.slice(0,at));
  return ordered.slice(0,count);
}
function ensureGameChrome(){
  if(!document.getElementById('yakolakGameHud')){
    const hud=el('div');hud.id='yakolakGameHud';
    hud.append(el('div','yg-caption','اختار لونك المفضل.'));
    document.body.append(hud);
  }
  if(!document.getElementById('yakolakGameScore')){
    const score=el('div','yg-score');score.id='yakolakGameScore';document.body.append(score);
  }
  if(document.getElementById('yakolakGameSetup'))return;
  const wrap=el('div');wrap.id='yakolakGameSetup';
  const card=el('div','yg-card');
  wrap.append(card);document.body.append(wrap);
  renderSetupStep();
}
function ensureTutorialDialog(){
  if(document.getElementById('yakolakTutorialDialog'))return;
  const dlg=el('div');dlg.id='yakolakTutorialDialog';
  const box=el('div','yt-box');
  box.append(el('div','yt-text','هل فهمت؟'));
  const actions=el('div','yt-actions');
  actions.append(el('button','yt-ok','فهمت'),el('button','yt-repeat','إعادة'));
  box.append(actions);dlg.append(box);document.body.append(dlg);
}
function tutorialPrompt(text){
  ensureTutorialDialog();
  const dlg=document.getElementById('yakolakTutorialDialog');
  const msg=dlg.querySelector('.yt-text'),ok=dlg.querySelector('.yt-ok'),repeat=dlg.querySelector('.yt-repeat');
  msg.textContent=text;
  dlg.classList.add('open');
  return new Promise(resolve=>{
    const cleanup=answer=>{
      ok.onclick=null;repeat.onclick=null;dlg.classList.remove('open');resolve(answer);
    };
    ok.onclick=()=>cleanup('ok');
    repeat.onclick=()=>cleanup('repeat');
  });
}
async function tutorialCheckpoint(text,replay){
  while(true){
    const answer=await tutorialPrompt(text);
    if(answer==='ok')return;
    await replay();
  }
}
function piecePreview(color){
  const wrap=el('div','yg-pieces');
  ['s','m','l'].forEach(size=>{const p=el('span',`yg-piece ${size}`);p.style.setProperty('--piece-color',COLOR_INFO[color].css);wrap.append(p)});
  return wrap;
}
function clearGroup(group){
  while(group.children.length){disposeObject(group.children.pop())}
}
function makeTextSprite(text,{size=34,width=760,height=150,color='#ffffff',bg='rgba(0,0,0,.58)'}={}){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,width,height);
  ctx.fillStyle=bg;ctx.beginPath();ctx.roundRect(12,18,width-24,height-36,22);ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,.18)';ctx.lineWidth=3;ctx.stroke();
  ctx.direction='rtl';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle=color;ctx.font=`500 ${size}px ExpoYakolak, Arial, sans-serif`;
  const words=String(text||'').split(/\s+/),lines=[];let line='';
  words.forEach(w=>{const next=line?`${line} ${w}`:w;if(ctx.measureText(next).width>width-90&&line){lines.push(line);line=w}else line=next});
  if(line)lines.push(line);
  const y0=height/2-(lines.length-1)*size*.62;
  lines.slice(0,2).forEach((l,i)=>ctx.fillText(l,width/2,y0+i*size*1.22));
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  const mat=new THREE.SpriteMaterial({map,transparent:true,depthTest:false,depthWrite:false});
  const sprite=new THREE.Sprite(mat);
  sprite.scale.set(width/5,height/5,1);sprite.renderOrder=10030;
  return sprite;
}
function makeTextPlane(text,{size=54,width=1024,height=256,w=150,h=36,color='#ffffff',bg='#111317'}={}){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,width,height);
  ctx.fillStyle=bg;ctx.beginPath();ctx.roundRect(18,22,width-36,height-44,28);ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,.5)';ctx.lineWidth=5;ctx.stroke();
  ctx.direction='rtl';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle=color;ctx.font=`500 ${size}px ExpoYakolak, Arial, sans-serif`;
  const words=String(text||'').split(/\s+/),lines=[];let line='';
  words.forEach(word=>{const next=line?`${line} ${word}`:word;if(ctx.measureText(next).width>width-120&&line){lines.push(line);line=word}else line=next});
  if(line)lines.push(line);
  const y0=height/2-(lines.length-1)*size*.62;
  lines.slice(0,2).forEach((l,i)=>ctx.fillText(l,width/2,y0+i*size*1.22));
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  const mat=new THREE.MeshBasicMaterial({map,transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide});
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);
  plane.rotation.x=-Math.PI/2;
  plane.renderOrder=10032;
  return plane;
}
function replaceSprite(oldSprite,newSprite,pos){
  if(oldSprite){oldSprite.parent?.remove(oldSprite);disposeObject(oldSprite)}
  newSprite.position.set(pos.x,pos.y,pos.z);
  gameGroup.add(newSprite);
  return newSprite;
}
function updateInstruction3D(text){
  if(!text)return;
  instructionSprite=replaceSprite(instructionSprite,makeTextPlane(text,{size:58,w:210,h:42,bg:'rgba(0,0,0,.64)'}),{x:0,y:SETUP_CHOICE_Y+38,z:-98});
  render();
}
function updateLastMove3D(){
  if(lastMoveSprite){lastMoveSprite.parent?.remove(lastMoveSprite);disposeObject(lastMoveSprite);lastMoveSprite=null}
}
function setupStationPosition(color){
  const layout={front:{x:-108,z:0},left:{x:-36,z:0},back:{x:36,z:0},right:{x:108,z:0}};
  return layout[color]||{x:0,z:0};
}
function setupColorsForCount(total){
  const first=gameState.humanColor||TURN_RING[0];
  return playerSequence(first,TURN_RING.length).slice(0,total);
}
function setupMat(color){
  const cfg=COLOR_INFO[color]||COLOR_INFO.right;
  const mat=new THREE.MeshStandardMaterial({color:cfg.css,roughness:color==='left'?.42:.66,metalness:color==='left'?.34:.04});
  if(mat.emissive){mat.emissive.set(cfg.css);mat.emissiveIntensity=.06}
  solidMaterial(mat);
  return mat;
}
function addSetupPickable(obj,action){
  obj.userData.setupAction=action;
  setupPickables.push(obj);
}
function hiddenPickMaterial(){
  const mat=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,depthTest:false,depthWrite:false});
  mat.colorWrite=false;
  return mat;
}
function addSetupPiece(size,color,x,y,z,action,scale=1){
  const mesh=set(new THREE.Mesh(pieceGeos[size],setupMat(color)));
  mesh.position.set(x,y,z);mesh.rotation.set(rad(-90),0,0);mesh.scale.setScalar(scale);mesh.renderOrder=10020;
  addSetupPickable(mesh,action);setupGroup.add(mesh);return mesh;
}
function addSetupSet(color,x,y,z,action,scale=1){
  const group=new THREE.Group();
  group.position.set(x,y,z);
  setupSpinGroups.push(group);
  setupGroup.add(group);
  ['l','m','s'].forEach(size=>{
    const mesh=set(new THREE.Mesh(pieceGeos[size],setupMat(color)));
    mesh.position.set(0,0,0);
    mesh.rotation.set(rad(-90),0,0);
    mesh.scale.setScalar(scale);
    mesh.renderOrder=10020;
    addSetupPickable(mesh,action);
    group.add(mesh);
  });
  return group;
}
function addSetupLabel(text,x,z,bg='rgba(0,0,0,.48)'){
  const label=makeTextPlane(text,{size:48,w:74,h:22,bg,color:'#ffffff'});
  label.position.set(x,SETUP_CHOICE_Y+7,z);
  setupGroup.add(label);
  return label;
}
function startSetupSpin(){
  if(PERFORMANCE_MODE){
    setupSpinGroups.forEach((g,i)=>{g.rotation.y=(i%4)*.14});
    render();
    return;
  }
  if(setupSpinRaf)return;
  const step=()=>{
    if(!setupGroup.visible||gameState.configured){setupSpinRaf=0;return}
    setupSpinGroups.forEach((g,i)=>{g.rotation.y+=0.003+(i%3)*0.0004});
    render();
    setupSpinRaf=requestAnimationFrame(step);
  };
  setupSpinRaf=requestAnimationFrame(step);
}
function renderSetup3D(){
  clearGroup(setupGroup);setupPickables.length=0;setupSpinGroups.length=0;
  if(!pieceGeos.s||!pieceGeos.m||!pieceGeos.l)return;
  if(gameState.configured){setupGroup.visible=false;return}
  if(loaded&&playing){cancelAnimationFrame(raf);playing=false;snap()}
  setupGroup.visible=true;
  if(lid)lid.visible=false;
  pieces.forEach(p=>p.mesh.visible=false);
  if(meshes['9'])meshes['9'].visible=false;
  ORDER.forEach(k=>{if(meshes[`3-${k}`])meshes[`3-${k}`].visible=false});
  syncZoneMarkers(false);
  if(gameState.setupStep==='color'){
    caption('اختار لونك المفضل');
    const onlineColors=globalThis.__yakolakOnlineSetupBridge?.active
      ?globalThis.__yakolakOnlineSetupBridge.availableColors
      :null;
    TURN_RING.filter(color=>!onlineColors||onlineColors.includes(color)).forEach(color=>{
      const pos=setupStationPosition(color),action={type:'color',value:color};
      const plate=new THREE.Mesh(new THREE.CircleGeometry(42,48),hiddenPickMaterial());
      plate.position.set(pos.x,SETUP_CHOICE_Y-.8,pos.z);plate.rotation.x=-Math.PI/2;plate.renderOrder=10018;addSetupPickable(plate,action);setupGroup.add(plate);
      addSetupSet(color,pos.x,SETUP_CHOICE_Y,pos.z,action,1.18);
    });
    startSetupSpin();
    return;
  }
  caption('كم لاعب تحب؟');
  const choices=[{bots:1,total:2,z:-58,label:'لاعبان'},{bots:2,total:3,z:0,label:'3 لاعبين'},{bots:3,total:4,z:58,label:'4 لاعبين'}];
  choices.forEach(choice=>{
    const action={type:'bots',value:choice.bots};
    const plate=new THREE.Mesh(new THREE.PlaneGeometry(214,48),hiddenPickMaterial());
    plate.position.set(0,SETUP_CHOICE_Y-.8,choice.z);plate.rotation.x=-Math.PI/2;plate.renderOrder=10018;addSetupPickable(plate,action);setupGroup.add(plate);
    setupColorsForCount(choice.total).forEach((color,i)=>{
      addSetupSet(color,(i-(choice.total-1)/2)*38,SETUP_CHOICE_Y,choice.z,action,.92);
    });
    addSetupLabel(choice.label,-134,choice.z,'#1f2937');
  });
  startSetupSpin();
}
function animateSetupExit(after){
  if(setupTransitioning)return;
  setupTransitioning=true;
  setupPickables.length=0;
  cancelAnimationFrame(setupSpinRaf);setupSpinRaf=0;
  const items=setupGroup.children.map(child=>({child,pos:child.position.clone(),scale:child.scale.clone(),rot:child.rotation.clone()}));
  const t0=performance.now(),ms=520;
  const step=now=>{
    const q=ease((now-t0)/ms);
    items.forEach(({child,pos,scale,rot},i)=>{
      const drift=(i%2?1:-1)*q*7;
      child.position.set(pos.x+drift,pos.y+q*18,pos.z-q*14);
      child.scale.set(scale.x*(1-q*.82),scale.y*(1-q*.82),scale.z*(1-q*.82));
      child.rotation.set(rot.x,rot.y+q*.62,rot.z);
    });
    render();
    if(q<1)requestAnimationFrame(step);
    else{
      clearGroup(setupGroup);
      setupTransitioning=false;
      after?.();
    }
  };
  requestAnimationFrame(step);
}
function renderSetupStep(){
  const card=document.querySelector('#yakolakGameSetup .yg-card');if(!card)return;
  card.innerHTML='';
  if(gameState.setupStep==='color'){
    card.append(el('div','yg-title','اختار لونك المفضل'));
    const colors=el('div','yg-colors');
    TURN_RING.forEach(c=>{
      const b=el('button','yg-choice');b.type='button';b.dataset.color=c;b.style.borderColor=COLOR_INFO[c].css;
      b.append(piecePreview(c),el('div','yg-name',COLOR_INFO[c].label));
      b.onclick=()=>{gameState.humanColor=c;gameState.setupStep='bots';caption('كم لاعب تحب؟');renderSetupStep();renderSetup3D()};
      colors.append(b);
    });
    card.append(colors);
    return;
  }
  card.append(el('div','yg-title','كم لاعب تحب؟'));
  const bots=el('div','yg-bots');
  [[1,'لاعبان'],[2,'3 لاعبين'],[3,'4 لاعبين']].forEach(([n,label])=>{
    const b=el('button','yg-choice bot',label);b.type='button';b.dataset.bots=n;
    b.onclick=()=>{gameState.botCount=n;beginConfiguredGame()};
    bots.append(b);
  });
  card.append(bots);
  renderSetup3D();
}
function handleSetupPick(action){
  if(!action||gameState.configured||setupTransitioning)return;
  const onlineSetup=globalThis.__yakolakOnlineSetupBridge;
  if(onlineSetup?.active){
    if(action.type==='color'){
      animateSetupExit(()=>{
        gameState.humanColor=action.value;
        onlineSetup.color=action.value;
        if(onlineSetup.mode==='join'){
          onlineSetup.join?.(action.value);
          return;
        }
        gameState.setupStep='bots';
        renderSetupStep();renderSetup3D();
      });
      return;
    }
    if(action.type==='bots'){
      animateSetupExit(()=>onlineSetup.create?.({
        color:onlineSetup.color||gameState.humanColor,
        targetPlayers:action.value+1
      }));
      return;
    }
  }
  if(action.type==='color'){
    animateSetupExit(()=>{
      gameState.humanColor=action.value;
      gameState.setupStep='bots';
      renderSetupStep();renderSetup3D();
    });
    return;
  }
  if(action.type==='bots'){
    animateSetupExit(()=>{
      gameState.botCount=action.value;
      beginConfiguredGame();
    });
  }
}
function clearInstruction3D(){
  if(!instructionSprite)return;
  instructionSprite.parent?.remove(instructionSprite);
  disposeObject(instructionSprite);
  instructionSprite=null;
}
function captionTone(text){
  const s=String(text||'');
  if(s.includes('فاز')||s.includes('أكمل'))return '#0f5b43';
  if(s.includes('دورك')||s.includes('اختر'))return '#12456d';
  if(s.includes('يفكر'))return '#4b3511';
  if(s.includes('انتهى')||s.includes('تعادل'))return '#6a2424';
  if(s.includes('كم لاعب')||s.includes('اختار لون'))return '#20242b';
  if(s.includes('نجهز'))return '#273241';
  return '#111317';
}
function caption(text){
  const c=document.querySelector('#yakolakGameHud .yg-caption');
  if(c){c.textContent=text;c.style.setProperty('--caption-bg',captionTone(text))}
  clearInstruction3D();
}
function syncScoreHud(){
  const score=document.getElementById('yakolakGameScore');if(!score)return;
  score.innerHTML='';
  TURN_RING.forEach(c=>{
    const turn=gameState.started&&currentPlayer()===c&&!gameState.winner?` · ${remainingSeconds()}ث`:'';
    const s=el('span','',`${colorName(c)} ${gameState.scores[c]||0}${turn}`);
    s.style.borderColor=COLOR_INFO[c].css;score.append(s);
  });
}
async function waitUntilLoaded(){
  while(!loaded||!pieceGeos.l||!pieceGeos.m||!pieceGeos.s)await wait(120);
}
function setReadinessBasePose(color,pose){
  const mesh=meshes[`3-${color}`];
  if(!mesh)return;
  mesh.visible=true;
  tr(mesh,pose);
}
function syncActiveReadinessBases(){
  const active=new Set(gameState.players);
  ORDER.forEach(color=>{
    const mesh=meshes[`3-${color}`];
    if(!mesh)return;
    mesh.visible=active.has(color);
    if(mesh.visible)tr(mesh,A[`3-${color}`]);
  });
}
function showAllReadinessBasesForTutorial(){
  ORDER.forEach(color=>setReadinessBasePose(color,A[`3-${color}`]));
  render();
}
function cloneObjectMaterials(obj){
  const touched=[];
  obj.traverse?.(node=>{
    if(!node.material)return;
    const original=node.material;
    const arr=Array.isArray(original)?original:[original];
    const cloned=arr.map(mat=>mat.clone());
    node.material=Array.isArray(original)?cloned:cloned[0];
    touched.push({node,original,cloned});
  });
  return ()=>{
    touched.forEach(({node,original,cloned})=>{
      const arr=Array.isArray(cloned)?cloned:[cloned];
      arr.forEach(mat=>mat.dispose?.());
      node.material=original;
    });
  };
}
function setObjectOpacity(obj,opacity){
  obj.traverse?.(node=>{
    if(!node.material)return;
    const mats=Array.isArray(node.material)?node.material:[node.material];
    mats.forEach(mat=>{
      mat.transparent=opacity<1;
      mat.opacity=opacity;
      mat.depthWrite=opacity>=1;
      mat.needsUpdate=true;
    });
  });
}
async function fadeOutObjects(objects,ms=560){
  const targets=objects.filter(Boolean).map(obj=>({obj,scale:obj.scale.clone(),restore:cloneObjectMaterials(obj)}));
  if(!targets.length)return;
  const t0=performance.now();
  await new Promise(res=>{
    const step=now=>{
      const q=ease((now-t0)/ms),opacity=1-q;
      targets.forEach(t=>{
        setObjectOpacity(t.obj,opacity);
        t.obj.scale.set(t.scale.x*(1-q*.08),t.scale.y*(1-q*.08),t.scale.z*(1-q*.08));
      });
      render();
      if(q<1)requestAnimationFrame(step);
      else res();
    };
    requestAnimationFrame(step);
  });
  targets.forEach(t=>{
    t.obj.visible=false;
    t.obj.scale.copy(t.scale);
    t.restore();
  });
  render();
}
async function withdrawInactiveReadinessBases(){
  const active=new Set(gameState.players);
  const fading=[];
  ORDER.forEach(color=>{
    const mesh=meshes[`3-${color}`];
    if(!mesh)return;
    if(active.has(color)){setReadinessBasePose(color,A[`3-${color}`]);return}
    if(mesh.visible)fading.push(mesh);
    pieces.filter(p=>p.dir===color&&p.mesh.visible).forEach(p=>{
      setPieceVisual(p,'normal');
      fading.push(p.mesh);
    });
  });
  await fadeOutObjects(fading,620);
  ORDER.forEach(color=>{
    const mesh=meshes[`3-${color}`];
    if(mesh&&!active.has(color))tr(mesh,A[`3-${color}`]);
    pieces.filter(p=>p.dir===color&&!active.has(color)).forEach(p=>tr(p.mesh,p.final));
  });
  syncActiveReadinessBases();
  render();
}
async function beginConfiguredGame(){
  if(!gameState.humanColor)return;
  gameState.players=playerSequence(gameState.humanColor,(+gameState.botCount||3)+1);
  gameState.configured=true;
  clearGroup(setupGroup);setupPickables.length=0;setupGroup.visible=false;
  if(meshes['9'])meshes['9'].visible=true;
  ORDER.forEach(k=>{if(meshes[`3-${k}`])meshes[`3-${k}`].visible=true});
  document.getElementById('yakolakGameSetup')?.classList.add('hidden');
  caption('نجهز الطاولة...');
  await waitUntilLoaded();
  syncScoreHud();
  await playIntroOnce();
  showAllReadinessBasesForTutorial();
  await runTutorial();
  await resetTutorialPieces(true);
  await withdrawInactiveReadinessBases();
  await startRound();
}
function clearHighlights(){
  winBlinkToken++;
  if(winBlinkRaf){cancelAnimationFrame(winBlinkRaf);winBlinkRaf=0}
  restoreBlinkMaterials();
  while(gameHighlightGroup.children.length){disposeObject(gameHighlightGroup.children.pop())}
}
const WIN_GLOW_COLOR=0x22c55e;
let winGlowTexture=null;
function glowTexture(){
  if(winGlowTexture)return winGlowTexture;
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=192;
  const ctx=canvas.getContext('2d');
  const g=ctx.createRadialGradient(96,96,0,96,96,94);
  g.addColorStop(0,'rgba(255,255,255,.95)');
  g.addColorStop(.22,'rgba(134,239,172,.72)');
  g.addColorStop(.58,'rgba(34,197,94,.32)');
  g.addColorStop(1,'rgba(34,197,94,0)');
  ctx.fillStyle=g;
  ctx.fillRect(0,0,192,192);
  winGlowTexture=new THREE.CanvasTexture(canvas);
  winGlowTexture.colorSpace=THREE.SRGBColorSpace;
  return winGlowTexture;
}
function addWinGlowAt(pos,color=null,scale=62){
  const preset=winHighlightPreset();
  if(!preset.spriteOpacity&&!preset.lightIntensity)return null;
  const tint=new THREE.Color(color||WIN_GLOW_COLOR);
  const group=new THREE.Group();
  group.position.set(pos.px,pos.py+22,pos.pz);
  if(preset.spriteOpacity){
    const spriteMat=new THREE.SpriteMaterial({
      map:glowTexture(),
      color:tint,
      transparent:true,
      opacity:preset.spriteOpacity,
      blending:THREE.AdditiveBlending,
      depthWrite:false,
      depthTest:false
    });
    spriteMat.userData.baseOpacity=preset.spriteOpacity;
    const sprite=new THREE.Sprite(spriteMat);
    const finalScale=scale*(preset.spriteScale||52)/62;
    sprite.scale.set(finalScale,finalScale,.1);
    sprite.renderOrder=10018;
    sprite.userData.winPulse=!!preset.pulse;
    group.add(sprite);
  }
  if(preset.lightIntensity){
    const light=new THREE.PointLight(tint,preset.lightIntensity,preset.lightDistance||86,2);
    light.position.set(0,18,0);
    group.add(light);
  }
  gameHighlightGroup.add(group);
  return group;
}
function addWinGlowForMesh(mesh,color){
  if(!mesh)return null;
  const pos={px:mesh.position.x,py:mesh.position.y,pz:mesh.position.z};
  return addWinGlowAt(pos,calibration.play.winnerGlowColor||COLOR_INFO[color]?.css||WIN_GLOW_COLOR,64);
}
let winBlinkToken=0,winBlinkRaf=0;
function cloneBlinkMaterial(mesh,color){
  if(!mesh||mesh.userData.winOriginalMaterial)return;
  const original=mesh.material;
  const arr=Array.isArray(original)?original:[original];
  const clones=arr.map(mat=>{
    const c=mat.clone();
    if(c.emissive)c.emissive.set(calibration.play.winnerGlowColor||COLOR_INFO[color]?.css||'#ffffff');
    if('emissiveIntensity' in c)c.emissiveIntensity=0;
    c.needsUpdate=true;
    return c;
  });
  mesh.userData.winOriginalMaterial=original;
  mesh.material=Array.isArray(original)?clones:clones[0];
}
function restoreBlinkMaterials(){
  const restore=mesh=>{
    if(!mesh?.userData?.winOriginalMaterial)return;
    const current=mesh.material;
    const arr=Array.isArray(current)?current:[current];
    arr.forEach(mat=>mat.dispose?.());
    mesh.material=mesh.userData.winOriginalMaterial;
    delete mesh.userData.winOriginalMaterial;
  };
  pieces.forEach(p=>restore(p.mesh));
  gameHighlightGroup.traverse(o=>{if(o.isMesh)restore(o)});
}
function blinkWinEntries(entries){
  const targets=entries.map(e=>({entry:e,mesh:e.mesh,baseScale:e.mesh.scale.clone(),preset:winHighlightPreset()})).filter(t=>t.mesh);
  if(!targets.length)return Promise.resolve();
  const token=++winBlinkToken;
  const duration=Math.max(1000,+calibration.play.winnerBlinkDuration||3000);
  const blinks=Math.max(1,Math.round(+calibration.play.winnerBlinkCount||5));
  targets.forEach(t=>cloneBlinkMaterial(t.mesh,t.entry.color));
  const t0=performance.now();
  return new Promise(resolve=>{
    const step=now=>{
      const t=Math.min(1,(now-t0)/duration);
      const wave=.5+.5*Math.sin(t*Math.PI*2*blinks);
      targets.forEach(({mesh,baseScale,preset})=>{
        const scale=1+wave*(preset.blinkScale||.04);
        mesh.scale.set(baseScale.x*scale,baseScale.y*scale,baseScale.z*scale);
        const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
        mats.forEach(mat=>{
          if('emissiveIntensity' in mat)mat.emissiveIntensity=wave*(preset.emissive||.72);
          mat.needsUpdate=true;
        });
      });
      gameHighlightGroup.traverse(o=>{
        if(o.isSprite&&o.material){
          o.material.opacity=(o.material.userData.baseOpacity??o.material.opacity)*(.35+wave*.65);
          o.material.needsUpdate=true;
        }
      });
      render();
      if(t<1&&token===winBlinkToken)winBlinkRaf=requestAnimationFrame(step);
      else{
        winBlinkRaf=0;
        targets.forEach(({mesh,baseScale})=>mesh.scale.copy(baseScale));
        restoreBlinkMaterials();
        render();
        resolve();
      }
    };
    winBlinkRaf=requestAnimationFrame(step);
  });
}
function highlightWinEntries(winningEntries,allEntries){
  const winning=new Set(winningEntries.map(e=>e.mesh));
  allEntries.forEach(e=>{
    if(e.piece)setPieceVisual(e.piece,'normal');
    else e.mesh.material=pieceStateMaterial(e.color,'normal');
  });
  winningEntries.forEach(e=>addWinGlowForMesh(e.mesh,e.color));
  render();
  return blinkWinEntries(winningEntries.filter(e=>winning.has(e.mesh)));
}
function winEntriesFromPieces(win){
  const winning=win.cells.map(cell=>{
    const piece=pieces.find(p=>p.placed&&p.zoneIndex===cell.zone&&p.type===cell.size);
    return piece?{piece,mesh:piece.mesh,color:piece.dir}:null;
  }).filter(Boolean);
  const all=pieces.filter(p=>p.placed).map(piece=>({piece,mesh:piece.mesh,color:piece.dir}));
  return {winning,all};
}
function showWinHighlight(win){
  clearHighlights();
  const {winning,all}=winEntriesFromPieces(win);
  return highlightWinEntries(winning,all);
}
let winPreviewToken=0;
function previewWinnerHighlightPreset(presetId){
  if(!pieceGeos.l||!pieceGeos.m||!pieceGeos.s)return;
  if(!WIN_HIGHLIGHT_PRESETS[presetId])presetId='clean';
  calibration.play.winnerHighlightPreset=presetId;
  saveApply(true);
  const token=++winPreviewToken;
  clearHighlights();
  const color=gameState.humanColor||'right';
  const rival=TURN_RING.find(c=>c!==color)||'back';
  const winCells=[{zone:0,size:'l'},{zone:1,size:'l'},{zone:2,size:'l'}];
  const extraCells=[{zone:0,size:'s',color:rival},{zone:1,size:'m',color:rival},{zone:4,size:'s',color:rival}];
  const all=[],winning=[];
  [...winCells.map(c=>({...c,color})),...extraCells].forEach(c=>{
    const pos=slotPosition(c.zone,c.size);
    const mesh=set(new THREE.Mesh(pieceGeos[c.size],pieceStateMaterial(c.color,'normal')));
    mesh.position.set(pos.px,pos.py,pos.pz);
    mesh.rotation.set(rad(-90),0,0);
    mesh.renderOrder=10012;
    gameHighlightGroup.add(mesh);
    const entry={mesh,color:c.color};
    all.push(entry);
    if(c.color===color&&winCells.some(w=>w.zone===c.zone&&w.size===c.size))winning.push(entry);
  });
  highlightWinEntries(winning,all);
  caption(`معاينة تمييز الفوز: ${WIN_HIGHLIGHT_PRESETS[presetId].label}`);
  setTimeout(()=>{if(token===winPreviewToken&&!gameState.winner){clearHighlights();render()}},3200);
}
async function resetTutorialPieces(animate=false){
  gameState.board=emptyBoard();
  clearHighlights();clearLastMoveMarkers();syncZoneMarkers(false);
  const moves=[];
  ORDER.forEach(color=>setReadinessBasePose(color,A[`3-${color}`]));
  pieces.forEach(p=>{
    p.placed=false;p.zoneIndex=null;p.slotSize=null;p.mesh.userData.inTray=false;p.mesh.userData.traySelected=false;
    p.mesh.visible=true;
    setPieceVisual(p,'normal');
    const rot={x:rad(p.final.rx),y:rad(p.final.ry),z:rad(p.final.rz)};
    if(animate)moves.push({obj:p.mesh,pos:p.final,rot});
    else tr(p.mesh,p.final);
  });
  if(moves.length)await animateObjectsTo(moves,520,12);
  render();
}
function pickScriptedPiece(color,size){
  return pieces.find(p=>p.dir===color&&p.type===size&&!p.placed)||null;
}
function markScriptedPiece(piece,zoneId){
  piece.placed=true;piece.zoneIndex=zoneId;piece.slotSize=piece.type;
  gameState.board[zoneId][piece.type]=piece.dir;
}
async function animatePieceToZone(piece,zoneId,ms=520,arc=18){
  const pos=slotPosition(zoneId,piece.type);
  const rot={x:rad(piece.final.rx),y:rad(piece.final.ry),z:rad(piece.final.rz)};
  await animateObjectTo(piece.mesh,pos,rot,ms,arc);
}
async function playTutorialDemo(moves,winCells,leadText,winText){
  await resetTutorialPieces(true);
  caption(leadText);
  await wait(260);
  for(const m of moves){
    const piece=pickScriptedPiece(m.color,m.size);
    if(!piece)continue;
    markScriptedPiece(piece,m.zone);
    setPieceVisual(piece,'active');
    await animatePieceToZone(piece,m.zone,460,18);
    await wait(110);
  }
  const win=winnerOn(gameState.board,moves[moves.length-1].color)||{color:moves[moves.length-1].color,cells:winCells,label:'فوز'};
  caption(winText);
  await showWinHighlight(win);
  render();
  await wait(450);
}
function showCells(cells,color='#ffffff'){
  render();
}
function wait(ms){return new Promise(res=>setTimeout(res,ms))}
function setCameraView(pos,target,ms=700){
  const from=camera.position.clone(),to=new THREE.Vector3(pos.x,pos.y,pos.z),tf=controls.target.clone(),tt=new THREE.Vector3(target.x,target.y,target.z);
  const t0=performance.now();
  return new Promise(res=>{
    const step=now=>{
      const q=ease((now-t0)/ms);
      camera.position.lerpVectors(from,to,q);controls.target.lerpVectors(tf,tt,q);controls.update();render();
      if(q<1)requestAnimationFrame(step);else res();
    };
    requestAnimationFrame(step);
  });
}
function animateObjectTo(obj,pos,rot=null,ms=650,arc=22){
  const from=obj.position.clone(),to=new THREE.Vector3(pos.px,pos.py,pos.pz);
  const fromRot=obj.rotation.clone(),toRot=rot?new THREE.Euler(rot.x,rot.y,rot.z):obj.rotation.clone();
  const t0=performance.now();
  return new Promise(res=>{
    const step=now=>{
      const q=ease((now-t0)/ms);
      obj.position.lerpVectors(from,to,q);
      obj.position.y+=Math.sin(q*Math.PI)*arc;
      obj.rotation.set(
        fromRot.x+(toRot.x-fromRot.x)*q,
        fromRot.y+(toRot.y-fromRot.y)*q,
        fromRot.z+(toRot.z-fromRot.z)*q
      );
      render();
      if(q<1)requestAnimationFrame(step);else{obj.position.copy(to);obj.rotation.copy(toRot);render();res()}
    };
    requestAnimationFrame(step);
  });
}
function animateObjectsTo(items,ms=620,arc=16){
  if(!items.length)return Promise.resolve();
  const prepared=items.map(item=>{
    const obj=item.obj;
    return {
      obj,
      from:obj.position.clone(),
      to:new THREE.Vector3(item.pos.px,item.pos.py,item.pos.pz),
      fromRot:obj.rotation.clone(),
      toRot:item.rot?new THREE.Euler(item.rot.x,item.rot.y,item.rot.z):obj.rotation.clone(),
      done:item.done
    };
  });
  const t0=performance.now();
  return new Promise(res=>{
    const step=now=>{
      const q=ease((now-t0)/ms);
      prepared.forEach(item=>{
        item.obj.position.lerpVectors(item.from,item.to,q);
        item.obj.position.y+=Math.sin(q*Math.PI)*arc;
        item.obj.rotation.set(
          item.fromRot.x+(item.toRot.x-item.fromRot.x)*q,
          item.fromRot.y+(item.toRot.y-item.fromRot.y)*q,
          item.fromRot.z+(item.toRot.z-item.fromRot.z)*q
        );
      });
      render();
      if(q<1)requestAnimationFrame(step);
      else{
        prepared.forEach(item=>{
          item.obj.position.copy(item.to);
          item.obj.rotation.copy(item.toRot);
          item.done?.();
        });
        render();
        res();
      }
    };
    requestAnimationFrame(step);
  });
}
function remainingSeconds(){
  const seconds=Math.max(6,Math.round(+calibration.play.turnSeconds||DEFAULT_TURN_SECONDS));
  if(!gameState.turnDeadline)return seconds;
  return Math.max(0,Math.ceil((gameState.turnDeadline-Date.now())/1000));
}
function clearTurnTimer(){
  if(timerHandle){clearInterval(timerHandle);timerHandle=0}
}
function startTurnTimer(){
  clearTurnTimer();
  const seconds=Math.max(6,Math.round(+calibration.play.turnSeconds||DEFAULT_TURN_SECONDS));
  gameState.turnDeadline=Date.now()+seconds*1000;
  syncScoreHud();
  timerHandle=setInterval(()=>{
    syncScoreHud();
    if(!gameState.started||gameState.winner||gameState.tutorial||gameState.locked)return;
    if(remainingSeconds()<=0){
      clearTurnTimer();
      const skipped=currentPlayer();
      caption(`انتهى وقت ${colorName(skipped)}. الدور التالي.`);
      nextTurn();
    }
  },250);
}
async function runTutorial(){
  gameState.tutorial=true;
  await setCameraView({x:520,y:430,z:520},{x:0,y:0,z:0},520);
  const color=gameState.humanColor||'right';
  const o1=TURN_RING.find(c=>c!==color)||'back';
  const o2=TURN_RING.find(c=>c!==color&&c!==o1)||'left';
  const demos=[
    {
      confirm:'هل فهمت فوز ثلاث قطع من نفس الحجم؟',
      run:()=>playTutorialDemo([
        {color,zone:0,size:'l'},{color:o1,zone:0,size:'s'},{color,zone:1,size:'l'},{color:o2,zone:1,size:'m'},{color:o1,zone:2,size:'s'},{color,zone:2,size:'l'}
      ],[{zone:0,size:'l'},{zone:1,size:'l'},{zone:2,size:'l'}],`جولة سريعة: ${colorName(color)} يبحث عن ثلاث قطع كبيرة على خط.`,`الحجر الأخير أكمل خط الكبار. فاز ${colorName(color)}.`)
    },
    {
      confirm:'هل فهمت فوز الخط المتدرج؟',
      run:()=>playTutorialDemo([
        {color,zone:6,size:'s'},{color:o1,zone:6,size:'l'},{color,zone:4,size:'m'},{color:o2,zone:4,size:'s'},{color:o1,zone:2,size:'m'},{color,zone:2,size:'l'}
      ],[{zone:6,size:'s'},{zone:4,size:'m'},{zone:2,size:'l'}],`طريقة ثانية: خط متدرج صغير، وسط، كبير.`,`الحجر الكبير الأخير أكمل التدرج وفاز ${colorName(color)}.`)
    },
    {
      confirm:'هل فهمت فوز نفس الخانة؟',
      run:()=>playTutorialDemo([
        {color,zone:4,size:'s'},{color:o1,zone:3,size:'l'},{color,zone:4,size:'m'},{color:o2,zone:5,size:'s'},{color:o1,zone:1,size:'l'},{color,zone:4,size:'l'}
      ],[{zone:4,size:'s'},{zone:4,size:'m'},{zone:4,size:'l'}],`طريقة ثالثة: نفس الخانة تقبل صغير ووسط وكبير.`,`الحجر الأخير أكمل الخانة نفسها وفاز ${colorName(color)}.`)
    }
  ];
  for(const demo of demos){
    await demo.run();
    await tutorialCheckpoint(demo.confirm,demo.run);
  }
  clearHighlights();caption('دورك: افتح طقمك، اختر الحجم، ثم اضغط خانة متاحة.');
  await setCameraView({x:520,y:430,z:520},{x:0,y:0,z:0},520);await wait(900);
  gameState.tutorial=false;
}
function emptyBoard(){
  const board={};
  boardZones.forEach(z=>board[z.id]={s:null,m:null,l:null});
  return board;
}
function slotPosition(zoneId,size){
  const zone=boardZones[zoneId],off=SLOT_OFFSETS[size]||SLOT_OFFSETS.m;
  return {px:zone.px+off.x,py:PIECE_FINAL_Y,pz:zone.pz+off.z};
}
async function resetRoundPieces(animate=false){
  gameState.board=emptyBoard();gameState.winner=null;gameState.locked=false;
  gameState.lastMoves={right:null,back:null,left:null,front:null};updateLastMove3D();
  selectionTray=null;selectedPlayPiece=null;clearLastMoveMarkers();syncZoneMarkers(false);clearHighlights();render();
  const moves=[];
  pieces.forEach(p=>{
    p.mesh.material=mats[p.dir];p.mesh.material.transparent=false;p.mesh.material.opacity=1;p.mesh.material.needsUpdate=true;
    p.placed=false;p.zoneIndex=null;p.slotSize=null;p.mesh.userData.inTray=false;p.mesh.userData.traySelected=false;p.mesh.visible=gameState.players.includes(p.dir);
    if(p.mesh.visible){
      const rot={x:rad(p.final.rx),y:rad(p.final.ry),z:rad(p.final.rz)};
      if(animate)moves.push({obj:p.mesh,pos:p.final,rot});
      else tr(p.mesh,p.final);
    }
  });
  if(moves.length)await animateObjectsTo(moves,620,16);
  render();
}
async function startRound(animateReset=false){
  if(playing){cancelAnimationFrame(raf);playing=false;snap()}
  gameState.started=false;gameState.locked=true;
  syncActiveReadinessBases();
  await resetRoundPieces(animateReset);
  gameState.started=true;gameState.locked=false;
  gameState.turnIndex=0;
  caption(`الجولة ${gameState.round}: ${turnCaption(currentPlayer())}.`);
  startTurnTimer();
  syncScoreHud();
  updateTurnGlow();
  maybeBotTurn();
}
function currentPlayer(){return gameState.players[gameState.turnIndex%gameState.players.length]}
function turnCaption(color){return color===gameState.humanColor?'دورك':`دور ${colorName(color)}`}
function updateTurnGlow(){
  if(!gameState.configured||gameState.tutorial||gameState.winner)return;
  const glow=isHumanTurn();
  pieces.forEach(p=>{
    if(p.placed)return;
    setPieceVisual(p,glow&&p.dir===gameState.humanColor?'active':'normal');
  });
  render();
}
function nextTurn(){
  if(gameState.winner)return;
  if(selectionTray)closePieceTray();
  gameState.turnIndex=(gameState.turnIndex+1)%gameState.players.length;
  caption(turnCaption(currentPlayer()));
  startTurnTimer();
  updateTurnGlow();
  maybeBotTurn();
}
function isHumanTurn(){return gameState.started&&!gameState.locked&&!gameState.winner&&currentPlayer()===gameState.humanColor}
function legalMoves(color){
  const moves=[];
  pieces.filter(p=>p.dir===color&&!p.placed).forEach(p=>{
    boardZones.forEach(z=>{if(!gameState.board[z.id][p.type])moves.push({piece:p,zone:z.id,size:p.type,color})});
  });
  return moves;
}
function testBoardMove(board,move){
  const next=clone(board);
  next[move.zone][move.size]=move.color;
  return next;
}
function winnerOn(board,color){
  for(const line of WIN_LINES){
    for(const size of SIZE_TYPES){
      if(line.every(z=>board[z][size]===color))return {color,type:'same-size',label:`خط ${SIZE_LABEL[size]}`,cells:line.map(zone=>({zone,size}))};
    }
    for(const seq of [['s','m','l'],['l','m','s']]){
      if(seq.every((size,i)=>board[line[i]][size]===color))return {color,type:'graded',label:'خط متدرج',cells:line.map((zone,i)=>({zone,size:seq[i]}))};
    }
  }
  for(const z of boardZones){
    if(SIZE_TYPES.every(size=>board[z.id][size]===color))return {color,type:'cell',label:'خانة كاملة',cells:SIZE_TYPES.map(size=>({zone:z.id,size}))};
  }
  return null;
}
function describeWin(win){return win?.label||'فوز'}
function clearLastMoveMarkers(){
  lastMoveMarkers.forEach(m=>{m.parent?.remove(m);disposeObject(m)});
  lastMoveMarkers.clear();
}
function showLastMoveMarker(color,zone,size){
  const old=lastMoveMarkers.get(color);
  if(old){old.parent?.remove(old);disposeObject(old)}
  const pos=slotPosition(zone,size);
  const glow=new THREE.Group();
  glow.position.set(pos.px,pos.py,pos.pz);
  const light=new THREE.PointLight(COLOR_INFO[color]?.css||'#ffffff',1.15,92,2);
  light.position.set(0,28,0);
  glow.add(light);
  lastMoveMarkers.set(color,glow);addGame(glow);render();
}
function recordMove(piece,zoneId){
  const oldMove=gameState.lastMoves[piece.dir];
  if(oldMove){
    const oldPiece=pieces.find(p=>p.dir===oldMove.color&&p.zoneIndex===oldMove.zone&&p.type===oldMove.size);
    if(oldPiece)setPieceVisual(oldPiece,'normal');
  }
  gameState.lastMoves[piece.dir]={color:piece.dir,size:piece.type,zone:zoneId};
  setPieceVisual(piece,'active');
  showLastMoveMarker(piece.dir,zoneId,piece.type);
  updateLastMove3D();
}
function finishMove(piece,zoneId){
  recordMove(piece,zoneId);
  const win=winnerOn(gameState.board,piece.dir);
  if(win){handleWin(win);return true}
  if(!legalMoves(currentPlayer()).length&&gameState.players.every(c=>!legalMoves(c).length)){caption('تعادل. جولة جديدة.');setTimeout(()=>{gameState.round++;startRound(true)},1200);return true}
  nextTurn();render();return true;
}
function commitMove(piece,zoneId,animate=true){
  if(!gameState.board[zoneId]||gameState.board[zoneId][piece.type])return false;
  const onlineGameplay=globalThis.__yakolakOnlineGameplayBridge;
  if(onlineGameplay?.active){
    closePieceTray();
    gameState.locked=true;
    onlineGameplay.submit?.({zone:zoneId,size:piece.type,color:piece.dir});
    return true;
  }
  piece.placed=true;piece.zoneIndex=zoneId;piece.slotSize=piece.type;
  gameState.board[zoneId][piece.type]=piece.dir;
  const rot={x:rad(piece.final.rx),y:rad(piece.final.ry),z:rad(piece.final.rz)};
  if(!animate){
    const pos=slotPosition(zoneId,piece.type);
    piece.mesh.position.set(pos.px,pos.py,pos.pz);
    piece.mesh.rotation.set(rot.x,rot.y,rot.z);
    return finishMove(piece,zoneId);
  }
  gameState.locked=true;
  animatePieceToZone(piece,zoneId,520,18).then(()=>{
    gameState.locked=false;
    finishMove(piece,zoneId);
  });
  return true;
}
function handleWin(win){
  gameState.winner=win.color;gameState.locked=true;
  clearTurnTimer();
  syncScoreHud();
  caption(`فاز ${colorName(win.color)}: ${describeWin(win)}. حجارة الفوز ترمش الآن.`);
  showWinHighlight(win).then(()=>{
    if(gameState.winner!==win.color)return;
    gameState.scores[win.color]=(gameState.scores[win.color]||0)+1;
    addScorePoint(win.color);
    syncScoreHud();
    caption(`نقطة لـ ${colorName(win.color)}.`);
    setTimeout(()=>{gameState.round++;caption(`الجولة ${gameState.round}.`);startRound(true)},900);
  });
}
function roundSkill(){
  const seq=[.94,.56,.86,.68,.78];
  return seq[(gameState.round-1)%seq.length];
}
function scoreMove(move){
  let s=0;
  if(winnerOn(testBoardMove(gameState.board,move),move.color))s+=10000;
  gameState.players.filter(c=>c!==move.color).forEach(c=>{
    legalMoves(c).forEach(m=>{if(m.zone===move.zone&&m.size===move.size&&winnerOn(testBoardMove(gameState.board,{...m,color:c}),c))s+=5200});
  });
  for(const line of WIN_LINES){
    if(line.includes(move.zone)){
      for(const size of SIZE_TYPES){
        const count=line.filter(z=>gameState.board[z][size]===move.color).length;
        if(size===move.size)s+=count*18;
      }
    }
  }
  s+=(move.zone===4?18:0)+(move.size==='l'?8:move.size==='m'?5:3);
  return s+Math.random()*8;
}
function chooseBotMove(color){
  const moves=legalMoves(color);
  if(!moves.length)return null;
  moves.forEach(m=>m.score=scoreMove(m));
  moves.sort((a,b)=>b.score-a.score);
  const skill=Math.min(.97,Math.max(.35,roundSkill()*(COLOR_INFO[color]?.power||.75)));
  if(Math.random()<skill)return moves[0];
  return moves[Math.min(moves.length-1,Math.floor(Math.random()*Math.min(5,moves.length)))];
}
function maybeBotTurn(){
  if(!gameState.started||gameState.winner||gameState.tutorial||currentPlayer()===gameState.humanColor)return;
  gameState.locked=true;
  const color=currentPlayer();
  caption(`${colorName(color)} يفكر...`);
  setTimeout(()=>{
    const move=chooseBotMove(color);
    if(!move){gameState.locked=false;nextTurn();return}
    gameState.locked=false;
    commitMove(move.piece,move.zone,true);
  },420+Math.random()*320);
}
function scorePointTransform(color,index){
  const row=pRows[color]||pRows.front,side=SCORE_SIDES[index%SCORE_SIDES.length]??index;
  return {px:row.px+(row.axis==='x'?side*PG:0),py:row.py,pz:row.pz+(row.axis==='z'?side*PG:0),rx:row.rx,ry:row.ry,rz:row.rz};
}
function addScorePoint(color){
  if(!pGeometry)return;
  const idx=(gameState.scores[color]||1)-1;
  const mesh=set(new THREE.Mesh(pGeometry,pPointMat||baseMat));
  mesh.name=`yakolak-score-${color}-${idx+1}`;
  tr(mesh,scorePointTransform(color,idx));
  scoreMarkers.push(mesh);addGame(mesh);render();
}
function loadScorePoints(geo){
  pGeometry=geo;
  pPointMat=new THREE.MeshStandardMaterial({color:'#bfc2c7',roughness:.62,metalness:.08});
}
function attachGameDebug(){
  Object.assign(globalThis.__yakolakGame,{
    emptyBoard,winnerOn,scorePointTransform,
    debugWin(type,color='right'){
      const board=emptyBoard();
      if(type==='same-size'){[0,1,2].forEach(z=>board[z].l=color)}
      if(type==='graded'){board[6].s=color;board[4].m=color;board[2].l=color}
      if(type==='cell'){board[4].s=color;board[4].m=color;board[4].l=color}
      return winnerOn(board,color);
    },
    debugScorePoint(color='right'){
      gameState.scores[color]=(gameState.scores[color]||0)+1;
      addScorePoint(color);
      return scoreMarkers.length;
    },
    debugTriggerWin(type='same-size',color=gameState.humanColor||'right'){
      if(!gameState.configured){
        gameState.humanColor=color;gameState.players=playerSequence(color,2);gameState.configured=true;
      }
      if(!gameState.board||!gameState.board[0])gameState.board=emptyBoard();
      pieces.forEach(p=>{p.placed=false;p.zoneIndex=null;p.slotSize=null;p.mesh.userData.inTray=false;p.mesh.visible=gameState.players.includes(p.dir);setPieceVisual(p,'normal');tr(p.mesh,p.final)});
      gameState.board=emptyBoard();gameState.started=true;gameState.locked=false;gameState.winner=null;
      const cells=type==='graded'?[{zone:6,size:'s'},{zone:4,size:'m'},{zone:2,size:'l'}]:type==='cell'?[{zone:4,size:'s'},{zone:4,size:'m'},{zone:4,size:'l'}]:[{zone:0,size:'l'},{zone:1,size:'l'},{zone:2,size:'l'}];
      cells.forEach(cell=>{
        const p=pieces.find(piece=>piece.dir===color&&piece.type===cell.size&&!piece.placed);
        if(!p)return;
        p.mesh.visible=true;markScriptedPiece(p,cell.zone);
        const pos=slotPosition(cell.zone,cell.size);
        p.mesh.position.set(pos.px,pos.py,pos.pz);
        p.mesh.rotation.set(rad(p.final.rx),rad(p.final.ry),rad(p.final.rz));
      });
      const win=winnerOn(gameState.board,color);
      if(win)handleWin(win);
      return win;
    },
    debugSlot(zone=4,size='m'){return slotPosition(zone,size)},
    scoreMarkers
  });
}
const rad=v=>THREE.MathUtils.degToRad(v);
function setPointer(e){const r=renderer.domElement.getBoundingClientRect();pointer.x=((e.clientX-r.left)/r.width)*2-1;pointer.y=-((e.clientY-r.top)/r.height)*2+1}
function occupiedZone(index,except=null){return pieces.find(p=>p!==except&&p.placed&&p.zoneIndex===index)}
function syncZoneMarkers(force=false){
  const visible=force||calibration.play.showZones;
  zoneMarkers.forEach((m,i)=>{
    const busy=gameState.board[i]&&SIZE_TYPES.some(size=>gameState.board[i][size]);
    m.visible=visible;
    m.material.color.set(busy?0xf59e0b:calibration.play.zoneColor);
    m.material.transparent=false;
    m.material.opacity=1;
    m.scale.setScalar(Math.max(8,+calibration.play.zoneSize)/36);
  });
}
function createBoardZones(){
  if(zoneMarkers.length)return;
  const geo=new THREE.RingGeometry(13.5,16.5,48);
  boardZones.forEach(z=>{
    const mat=new THREE.MeshBasicMaterial({color:calibration.play.zoneColor,side:THREE.DoubleSide,depthTest:false,depthWrite:false});
    const m=new THREE.Mesh(geo,mat);
    m.name=`yakolak-drop-zone-${z.id+1}`;
    m.position.set(z.px,z.py,z.pz);
    m.rotation.x=-Math.PI/2;
    m.renderOrder=10001;
    m.visible=false;
    zoneMarkers.push(m);
    gameGroup.add(m);
  });
}
function nearestZone(local,maxDistance=Infinity){
  let best=null,dist=Infinity;
  boardZones.forEach(z=>{const d=Math.hypot(local.x-z.px,local.z-z.pz);if(d<dist){dist=d;best=z}});
  return dist<=maxDistance?best:null;
}
function placePieceOnZone(piece,zone){
  if(gameState.configured)return commitMove(piece,zone.id);
  piece.zoneIndex=zone.id;
  const pos=slotPosition(zone.id,piece.type||'m');
  piece.mesh.position.set(pos.px,pos.py,pos.pz);
  piece.mesh.rotation.set(rad(piece.final.rx),rad(piece.final.ry),rad(piece.final.rz));
  syncZoneMarkers(true);
  return true;
}
function trayKey(piece){return `${piece.dir}:${piece.side}`}
const SIZE_RANK={l:3,m:2,s:1};
const STACK_LIFT_STEP=19;
function sortedTrayPieces(piece){
  return pieces
    .filter(p=>p.dir===piece.dir&&p.side===piece.side&&!p.placed)
    .sort((a,b)=>SIZE_RANK[b.type]-SIZE_RANK[a.type]);
}
function stackTargetFor(piece,stack){
  const index=Math.max(0,stack.indexOf(piece));
  return {...piece.final,py:piece.final.py+index*STACK_LIFT_STEP};
}
function syncPlayableZoneMarkers(piece){
  if(!piece){syncZoneMarkers(false);return}
  zoneMarkers.forEach((m,i)=>{
    const legal=!gameState.board[i]?.[piece.type];
    m.visible=legal;
    m.material.color.set(COLOR_INFO[piece.dir]?.css||calibration.play.zoneColor);
    m.material.transparent=false;
    m.material.opacity=1;
    m.scale.setScalar(1.04);
  });
}
function selectTrayPiece(piece){
  if(!selectionTray||!piece?.mesh.userData.inTray)return;
  selectedPlayPiece=piece;
  selectionTray.pieces.forEach(p=>{
    p.mesh.userData.traySelected=p===piece;
    setPieceVisual(p,p===piece?'active':'normal');
  });
  syncPlayableZoneMarkers(piece);
  caption('اختر خانة متاحة على القاعدة.');
  render();
}
function closePieceTray(skip=null){
  if(!selectionTray)return;
  const tray=selectionTray;selectionTray=null;
  selectedPlayPiece=null;
  tray.pieces.forEach(p=>{
    p.mesh.userData.inTray=false;p.mesh.userData.traySelected=false;
    if(p===skip||p.placed)return;
    setPieceVisual(p,gameState.configured&&isHumanTurn()&&p.dir===gameState.humanColor?'active':'normal');
    animateObjectTo(p.mesh,p.final,{x:rad(p.final.rx),y:rad(p.final.ry),z:rad(p.final.rz)},360,10);
  });
  syncZoneMarkers(false);
}
function openPieceTray(piece){
  const key=trayKey(piece);
  if(selectionTray&&selectionTray.key===key){closePieceTray();return}
  closePieceTray();
  const available=sortedTrayPieces(piece);
  if(!available.length)return;
  selectionTray={key,dir:piece.dir,side:piece.side,pieces:available};
  available.forEach(p=>{
    const target=stackTargetFor(p,available);
    p.mesh.userData.inTray=true;p.mesh.userData.traySelected=false;
    p.mesh.visible=true;
    setPieceVisual(p,'active');
    animateObjectTo(p.mesh,target,{x:rad(p.final.rx),y:rad(p.final.ry),z:rad(p.final.rz)},360,6);
  });
  selectedPlayPiece=available[0];
  available[0].mesh.userData.traySelected=true;
  syncZoneMarkers(false);
  syncPlayableZoneMarkers(selectedPlayPiece);
  caption('الكبير محدد. اختر حجماً آخر أو اضغط خانة متاحة.');
}
function pickBoardZoneFromPointer(e,maxDistance=Math.max(24,+calibration.play.dropRadius||42)){
  setPointer(e);
  raycaster.setFromCamera(pointer,camera);
  const worldY=gameGroup.localToWorld(new THREE.Vector3(0,PIECE_FINAL_Y,0)).y;
  dragPlane.set(new THREE.Vector3(0,1,0),-worldY);
  if(!raycaster.ray.intersectPlane(dragPlane,dragHit))return null;
  gameGroup.worldToLocal(dragLocal.copy(dragHit));
  return nearestZone(dragLocal,maxDistance);
}
function commitSelectedPieceToZone(zone){
  const piece=selectedPlayPiece;
  if(!piece||!zone)return false;
  if(gameState.board[zone.id]?.[piece.type]){
    caption('هذه الخانة فيها نفس الحجم.');
    return false;
  }
  const ok=commitMove(piece,zone.id,true);
  if(ok)closePieceTray(piece);
  return ok;
}
function pieceForMesh(mesh){
  return pieces.find(p=>p.mesh===mesh)||null;
}
function raycastPiece(filter){
  const objects=pieces.filter(p=>p.mesh.visible&&(!filter||filter(p))).map(p=>p.mesh);
  const hits=raycaster.intersectObjects(objects,false);
  for(const hit of hits){
    const piece=pieceForMesh(hit.object);
    if(piece&&(!filter||filter(piece)))return {kind:'piece',piece,object:hit.object};
  }
  return null;
}
function pointerLocalOnPlayPlane(y=PIECE_FINAL_Y){
  const worldY=gameGroup.localToWorld(new THREE.Vector3(0,y,0)).y;
  dragPlane.set(new THREE.Vector3(0,1,0),-worldY);
  if(!raycaster.ray.intersectPlane(dragPlane,dragHit))return null;
  return gameGroup.worldToLocal(dragLocal.copy(dragHit)).clone();
}
function fallbackTrayPieceFromPointer(maxDistance=38){
  if(!selectionTray)return null;
  const local=pointerLocalOnPlayPlane(PIECE_FINAL_Y);
  if(!local)return null;
  let best=null,dist=Infinity;
  selectionTray.pieces.forEach(p=>{
    if(p.placed)return;
    const target=stackTargetFor(p,selectionTray.pieces);
    const d=Math.hypot(local.x-target.px,local.z-target.pz);
    if(d<dist){dist=d;best=p}
  });
  return best&&dist<=maxDistance?{kind:'piece',piece:best,object:best.mesh}:null;
}
function screenPickTrayPiece(e,maxPx=46){
  if(!selectionTray)return null;
  const rect=renderer.domElement.getBoundingClientRect();
  let best=null,dist=Infinity;
  selectionTray.pieces.forEach(p=>{
    if(p.placed||!p.mesh.visible)return;
    p.mesh.updateWorldMatrix(true,false);
    const pos=new THREE.Vector3();
    p.mesh.getWorldPosition(pos);
    pos.project(camera);
    const sx=rect.left+(pos.x+1)*rect.width/2,sy=rect.top+(1-pos.y)*rect.height/2;
    const d=Math.hypot(e.clientX-sx,e.clientY-sy);
    if(d<dist){dist=d;best=p}
  });
  return best&&dist<=maxPx?{kind:'piece',piece:best,object:best.mesh}:null;
}
function fallbackHumanStackFromPointer(maxDistance=40){
  if(!gameState.configured||!isHumanTurn())return null;
  const local=pointerLocalOnPlayPlane(PIECE_FINAL_Y);
  if(!local)return null;
  let best=null,dist=Infinity;
  pieces.filter(p=>p.dir===gameState.humanColor&&!p.placed&&p.mesh.visible).forEach(p=>{
    const d=Math.hypot(local.x-p.final.px,local.z-p.final.pz);
    if(d<dist){dist=d;best=p}
  });
  return best&&dist<=maxDistance?{kind:'piece',piece:best,object:best.mesh}:null;
}
function pickDraggable(e){
  setPointer(e);raycaster.setFromCamera(pointer,camera);
  if(!gameState.configured&&setupPickables.length){
    const setupHit=raycaster.intersectObjects(setupPickables,false)[0];
    if(setupHit)return {kind:'setup',action:setupHit.object.userData.setupAction,object:setupHit.object};
  }
  const lightHit=raycaster.intersectObjects(dragLightHandles,false)[0];
  if(lightHit)return {kind:'light',index:lightHit.object.userData.lightIndex,object:lightHit.object};
  if(!loaded||!calibration.play.dragPieces)return null;
  if(gameState.configured&&isHumanTurn()&&selectionTray){
    const trayHit=screenPickTrayPiece(e)||raycastPiece(p=>p.dir===gameState.humanColor&&p.mesh.userData.inTray&&!p.placed)||fallbackTrayPieceFromPointer();
    if(trayHit)return trayHit;
    const base=meshes[`3-${gameState.humanColor}`];
    const baseHit=base?raycaster.intersectObject(base,false)[0]:null;
    if(baseHit)return {kind:'trayToggle'};
  }
  const pieceHit=raycastPiece(p=>!gameState.configured||(isHumanTurn()&&p.dir===gameState.humanColor&&!p.placed))||fallbackHumanStackFromPointer();
  if(pieceHit){
    const piece=pieceHit.piece;
    if(gameState.configured&&(!isHumanTurn()||piece.dir!==gameState.humanColor||piece.placed))return null;
    return {kind:'piece',piece,object:pieceHit.object};
  }
  return null;
}
function beginDrag(e){
  const picked=pickDraggable(e);
  if(gameState.configured&&isHumanTurn()&&selectedPlayPiece&&!picked){
    const zone=pickBoardZoneFromPointer(e);
    if(zone&&commitSelectedPieceToZone(zone)){e.preventDefault();return}
  }
  if(!picked)return;
  if(picked.kind==='setup'){
    handleSetupPick(picked.action);
    e.preventDefault();
    return;
  }
  if(picked.kind==='trayToggle'){
    closePieceTray();
    caption(turnCaption(currentPlayer()));
    e.preventDefault();
    return;
  }
  if(picked.kind==='light'){
    const cfg=calibration.lights[picked.index];
    if(!cfg)return;
    selectedLightIndex=picked.index;
    dragState={kind:'light',index:picked.index,cfg,lastY:e.clientY};
    dragPlane.set(new THREE.Vector3(0,1,0),-(+cfg.y||0));
  }else{
    if(playing){cancelAnimationFrame(raf);playing=false;snap();render()}
    const p=picked.piece;
    if(gameState.configured&&isHumanTurn()&&p.mesh.userData.inTray){
      selectTrayPiece(p);
      e.preventDefault();
      return;
    }
    if(gameState.configured&&isHumanTurn()&&!p.mesh.userData.inTray){
      openPieceTray(p);
      e.preventDefault();
      return;
    }
    dragState={kind:'piece',piece:p,zoneIndex:p.zoneIndex??null};
    p.zoneIndex=null;
    p.mesh.getWorldPosition(dragWorld);
    dragPlane.set(new THREE.Vector3(0,1,0),-dragWorld.y);
    syncZoneMarkers(true);
  }
  controls.enabled=false;
  renderer.domElement.style.cursor='grabbing';
  e.preventDefault();
}
function moveDrag(e){
  if(!dragState)return;
  setPointer(e);raycaster.setFromCamera(pointer,camera);
  if(dragState.kind==='light'){
    const cfg=dragState.cfg;
    if(e.shiftKey){cfg.y=round((+cfg.y||0)-(e.clientY-dragState.lastY)*2);dragState.lastY=e.clientY}
    else if(raycaster.ray.intersectPlane(dragPlane,dragHit)){cfg.x=round(dragHit.x);cfg.z=round(dragHit.z)}
    applyCalibration();syncResetButtons();render();
  }else if(raycaster.ray.intersectPlane(dragPlane,dragHit)){
    gameGroup.worldToLocal(dragLocal.copy(dragHit));
    const p=dragState.piece;
    p.mesh.position.x=dragLocal.x;
    p.mesh.position.z=dragLocal.z;
    p.mesh.position.y=PIECE_DRAG_Y;
    const z=nearestZone(dragLocal,Math.max(24,+calibration.play.dropRadius||DEFAULT_DROP_RADIUS));
    zoneMarkers.forEach((m,i)=>{
      const legal=!gameState.configured||!gameState.board[i]?.[p.type];
      m.visible=!!z&&i===z.id;
      m.material.color.set(legal?calibration.play.zoneColor:0xef4444);
      m.material.transparent=false;m.material.opacity=1;
    });
    render();
  }
  e.preventDefault();
}
function endDrag(){
  if(!dragState)return;
  if(dragState.kind==='piece'){
    const p=dragState.piece;
    const zone=nearestZone(p.mesh.position,Math.max(24,+calibration.play.dropRadius||DEFAULT_DROP_RADIUS));
    let placed=false;
    if(calibration.play.snapToZones&&zone&&(!gameState.configured||!gameState.board[zone.id]?.[p.type]))placed=placePieceOnZone(p,zone);
    if(gameState.configured&&placed)closePieceTray(p);
    else if(gameState.configured&&p.mesh.userData.inTray&&selectionTray){
      const target=stackTargetFor(p,selectionTray.pieces);
      if(target)animateObjectTo(p.mesh,target,{x:rad(p.final.rx),y:rad(p.final.ry),z:rad(p.final.rz)},300,8);
    }else if(!placed){p.zoneIndex=dragState.zoneIndex;tr(p.mesh,p.final)}
    syncZoneMarkers(false);
  }
  dragState=null;
  controls.enabled=true;
  renderer.domElement.style.cursor='';
  renderCalibrationPanel();
  render();
}
function set(o){o.castShadow=false;o.receiveShadow=false;return o}
function tr(o,t){o.position.set(t.px,t.py,t.pz);o.rotation.set(rad(t.rx),rad(t.ry),rad(t.rz))}
function ease(t){t=Math.max(0,Math.min(1,t));return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}
function mix(a,b,t){t=ease(t);return{px:a.px+(b.px-a.px)*t,py:a.py+(b.py-a.py)*t,pz:a.pz+(b.pz-a.pz)*t,rx:a.rx+(b.rx-a.rx)*t,ry:a.ry+(b.ry-a.ry)*t,rz:a.rz+(b.rz-a.rz)*t}}
function uv(g){g.computeBoundingBox();g.computeVertexNormals();const p=g.getAttribute('position'),n=g.getAttribute('normal'),b=g.boundingBox,s=b.getSize(new THREE.Vector3()),out=[],sx=s.x||1,sy=s.y||1,sz=s.z||1;for(let i=0;i<p.count;i++){const x=p.getX(i)-b.min.x,y=p.getY(i)-b.min.y,z=p.getZ(i)-b.min.z,nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));let u,v;if(nz>=nx&&nz>=ny){u=x/sx;v=y/sy}else if(nx>=ny&&nx>=nz){u=z/sz;v=y/sy}else{u=x/sx;v=z/sz}out.push(u,v)}g.setAttribute('uv',new THREE.Float32BufferAttribute(out,2));return g}
function center(g){g.computeBoundingBox();const c=g.boundingBox.getCenter(new THREE.Vector3());g.translate(-c.x,-c.y,-c.z);return uv(g)}
function bottom(g){g.computeBoundingBox();const b=g.boundingBox;g.translate(-(b.min.x+b.max.x)/2,-(b.min.y+b.max.y)/2,-b.min.z);return uv(g)}
function load(n,prep){return new Promise((res,rej)=>stl.load(modelPath(n),g=>res(prep(g)),undefined,()=>rej(new Error(n))))}
function loadSvg(url){return new Promise((res,rej)=>svgLoader.load(url,res,undefined,rej))}
function prepTableTex(t,isColor=false){if(isColor)t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),PERFORMANCE_MODE?2:8);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.needsUpdate=true;return t}
function loadSoftTexture(url,label,isColor=false){return new Promise(res=>tex.load(url,t=>{prepTableTex(t,isColor);log(label,'restored');res(t)},undefined,e=>{log(label,'failed',e);res(null)}))}
async function loadTableTextures(){const [albedo,normal,roughness]=await Promise.all([loadSoftTexture(TABLE_ALBEDO_URL,'table albedo',true),loadSoftTexture(TABLE_NORMAL_URL,'table normal'),loadSoftTexture(TABLE_ROUGHNESS_URL,'table roughness')]);tableMaps={albedo,normal,roughness};return tableMaps}
function tableMaterial(){const mat=makeMat({color:'#c79a64',roughness:.72,metalness:0});if(tableMaps.albedo){mat.map=tableMaps.albedo;mat.color.set(0xffffff)}if(tableMaps.normal){mat.normalMap=tableMaps.normal;mat.normalScale.set(.75,.75)}if(tableMaps.roughness){mat.roughnessMap=tableMaps.roughness;mat.roughness=.92}tableMaterials.push(mat);applyTableMaterial(mat);mat.needsUpdate=true;return mat}
function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function bases(){return [{dir:'right',x:R3,z:0,ang:90},{dir:'left',x:-R3,z:0,ang:90},{dir:'front',x:0,z:R3,ang:0},{dir:'back',x:0,z:-R3,ang:0}]}
function finals(){const a=[];bases().forEach(b=>[-1,0,1].forEach(side=>{const r=rad(b.ang);a.push({dir:b.dir,side,px:b.x+Math.cos(r)*D*side,py:2,pz:b.z+Math.sin(r)*D*side,rx:-90,ry:0,rz:0})}));return a}
function makePieces(geos){pieceGeos=geos;const rand=rng(4128),fs=finals();fs.forEach(f=>TYPES.forEach(type=>{const r=rand()*Math.PI*2,rr=rand()*78,mesh=set(new THREE.Mesh(geos[type],mats[f.dir]));const start={px:Math.cos(r)*rr,py:10+rand()*18,pz:Math.sin(r)*rr,rx:-90+(rand()*2-1)*20,ry:(rand()*2-1)*20,rz:Math.round(rand()*360)};const p={mesh,dir:f.dir,type,side:f.side,start,final:{...f},placed:false,zoneIndex:null,slotSize:null};mesh.userData.pieceType=type;mesh.name=`yakolak-piece-${f.dir}-${type}-${pieces.length}`;pieces.push(p);addGame(mesh);tr(mesh,start)}))}
function lidAt(ms){const p={...LID};if(ms<T.lidShake){const f=1-ms/T.lidShake,w=Math.sin(ms*.12)*2.8*f;p.rx+=w*.45;p.rz+=Math.sin(ms*.07)*1.2*f;return p}p.py+=T.lidH*ease((ms-T.lidShake)/T.lidLift);return p}
function wallAt(k,ms){const i=ORDER.indexOf(k),st=WALL[k],fn=A['3-'+k],start=T.lidShake+i*T.wallDelay;let t=ms-start;if(t<=0)return st;const up={...st,py:st.py+20},upF={...fn,py:st.py+20};if(t<T.wallLift)return mix(st,up,t/T.wallLift);t-=T.wallLift;if(t<T.wallMove)return mix(up,upF,t/T.wallMove);t-=T.wallMove;if(t<T.wallDrop)return mix(upF,fn,t/T.wallDrop);return fn}
function pieceStart(p){const i=ORDER.indexOf(p.dir);return T.lidShake+i*T.wallDelay+T.wallLift+T.wallMove-T.pieceLead+(p.side+1)*T.pieceStagger}
function pieceAt(p,ms){const q=ease((ms-pieceStart(p))/T.pieceMove),m=mix(p.start,p.final,q);m.py+=Math.sin(q*Math.PI)*T.pieceArc;return m}
function total(){return T.lidShake+3*T.wallDelay+T.wallLift+T.wallMove+T.wallDrop+T.pieceMove+500}
function activeIntroColors(){return ORDER}
function introBaseColors(){return ORDER}
function prepareIntroPieces(){
  const active=new Set(activeIntroColors());
  selectionTray=null;selectedPlayPiece=null;clearLastMoveMarkers();clearHighlights();syncZoneMarkers(false);
  gameState.board=emptyBoard();gameState.winner=null;gameState.locked=false;
  pieces.forEach(p=>{
    p.placed=false;p.zoneIndex=null;p.slotSize=null;p.mesh.userData.inTray=false;p.mesh.userData.traySelected=false;
    p.mesh.visible=active.has(p.dir);
    setPieceVisual(p,'normal');
    tr(p.mesh,p.start);
  });
}
function apply(ms){
  const active=activeIntroColors(),baseActive=introBaseColors();
  tr(meshes['9'],A['9']);
  if(lid){tr(lid,lidAt(ms));lid.visible=ms<T.lidShake+T.lidLift}
  ORDER.forEach(k=>{const m=meshes['3-'+k];if(m){m.visible=baseActive.includes(k);tr(m,wallAt(k,ms))}});
  pieces.forEach(p=>{if(p.mesh.visible)tr(p.mesh,pieceAt(p,ms))});
  if(ms>=total())snap();
}
function snap(){
  const active=activeIntroColors(),baseActive=introBaseColors();
  tr(meshes['9'],A['9']);
  ORDER.forEach(k=>{const m=meshes['3-'+k];if(m){m.visible=baseActive.includes(k);tr(m,A['3-'+k])}});
  pieces.forEach(p=>{p.zoneIndex=null;p.mesh.visible=active.includes(p.dir);if(p.mesh.visible)tr(p.mesh,p.final)});
  syncZoneMarkers(false);if(lid)lid.visible=false;
}
function fallbackTable(){const g=new THREE.Group();g.name='yakolak-fallback-simple-table';const topMat=tableMaterial(),sideMat=makeMat({color:'#7a4b27',roughness:.82,metalness:0});const top=set(new THREE.Mesh(new THREE.BoxGeometry(680,32,540),topMat));top.position.y=TABLE_TOP_Y-16;g.add(top);const legGeo=new THREE.BoxGeometry(38,TABLE_TOP_Y-ROOM_CFG.floorY,38);[[-275,-210],[275,-210],[-275,210],[275,210]].forEach(([x,z])=>{const leg=set(new THREE.Mesh(legGeo,sideMat));leg.position.set(x,ROOM_CFG.floorY+(TABLE_TOP_Y-ROOM_CFG.floorY)/2,z);g.add(leg)});scene.add(g);return g}
function buildSvgTable(svgData){
  const group=new THREE.Group();
  group.name='yakolak-svg-table';
  const tableMat=tableMaterial();
  const tableHeight=TABLE_TOP_Y-ROOM_CFG.floorY;
  const meshes=[];
  svgData.paths.forEach(path=>{
    SVGLoader.createShapes(path).forEach(shape=>{
      const geo=new THREE.ExtrudeGeometry(shape,{
        depth:tableHeight,
        bevelEnabled:true,
        bevelSize:2.4,
        bevelThickness:2.8,
        bevelSegments:3,
        curveSegments:18
      });
      geo.computeVertexNormals();
      const mesh=set(new THREE.Mesh(geo,tableMat));
      mesh.rotation.x=-Math.PI/2;
      meshes.push(mesh);
      group.add(mesh);
    });
  });
  if(!meshes.length)throw new Error('table svg has no drawable shapes');
  const rawBox=new THREE.Box3().setFromObject(group);
  const rawSize=rawBox.getSize(new THREE.Vector3());
  const targetFootprint=620;
  const scale=targetFootprint/Math.max(rawSize.x||1,rawSize.z||1);
  meshes.forEach(mesh=>mesh.scale.set(scale,scale,1));
  let box=new THREE.Box3().setFromObject(group);
  group.position.x-=((box.min.x+box.max.x)/2);
  group.position.z-=((box.min.z+box.max.z)/2);
  box=new THREE.Box3().setFromObject(group);
  group.position.y+=TABLE_TOP_Y-box.max.y;
  scene.add(group);
  const finalBox=new THREE.Box3().setFromObject(group);
  const finalSize=finalBox.getSize(new THREE.Vector3());
  const fitProxy=new THREE.Mesh(new THREE.BoxGeometry(finalSize.x,120,finalSize.z),new THREE.MeshBasicMaterial({visible:false}));
  fitProxy.name='yakolak-svg-table-fit-proxy';
  fitProxy.position.set(0,TABLE_TOP_Y-60,0);
  group.userData.fitProxy=fitProxy;
  log('svg table built',{url:TABLE_SVG_URL,width:Math.round(finalSize.x),depth:Math.round(finalSize.z),height:Math.round(finalSize.y),top:Math.round(finalBox.max.y),bottom:Math.round(finalBox.min.y)});
  return group;
}
async function realTable(){
  try{
    const [svgData]=await Promise.all([loadSvg(TABLE_SVG_URL),loadTableTextures()]);
    return buildSvgTable(svgData);
  }catch(e){
    console.warn('[Yakolak] svg table failed, fallback table used',e);
    if(!tableMaps.albedo)await loadTableTextures();
    return fallbackTable();
  }
}
function fit(objects){const box=new THREE.Box3();objects.forEach(o=>box.expandByObject(o));const s=box.getSize(new THREE.Vector3()),dist=(Math.max(s.x,s.y,s.z)||260)*1.65;camera.position.set(dist,dist*.82,dist);camera.near=Math.max(dist/1200,.1);camera.far=dist*22;camera.updateProjectionMatrix();controls.target.set(0,0,0);controls.update();keepInsideRoom()}
function frame(now){if(!playing)return;const e=now-start;apply(Math.min(e,total()));render();if(e<total())raf=requestAnimationFrame(frame);else{playing=false;snap();render()}}
function replay(){if(!loaded)return;cancelAnimationFrame(raf);prepareIntroPieces();start=performance.now();playing=true;if(lid)lid.visible=true;apply(0);render();raf=requestAnimationFrame(frame)}
function playIntroOnce(){
  if(!loaded)return Promise.resolve();
  cancelAnimationFrame(raf);
  prepareIntroPieces();
  start=performance.now();
  playing=true;
  if(lid)lid.visible=true;
  apply(0);
  render();
  return new Promise(resolve=>{
    const step=now=>{
      if(!playing){resolve();return}
      const e=now-start;
      apply(Math.min(e,total()));
      render();
      if(e<total())raf=requestAnimationFrame(step);
      else{playing=false;snap();render();resolve()}
    };
    raf=requestAnimationFrame(step);
  });
}
function marble(){tex.load(MARBLE_URL,t=>{t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=renderer.capabilities.getMaxAnisotropy();marbleTexture=t;applyCalibration();render()},undefined,()=>{})}
async function boot(){try{setLoadingProgress(34,'تحميل المجسمات');const [g9,g3,gl,gm,gs,gp]=await Promise.all([load('9',center),load('3',center),load('l',bottom),load('m',bottom),load('s',bottom),load('p',center)]);setLoadingProgress(72,'تجميع الحجارة');loadScorePoints(gp);const objects=[];meshes['9']=set(new THREE.Mesh(g9,baseMat));addGame(meshes['9']);objects.push(meshes['9']);ORDER.forEach(k=>{meshes['3-'+k]=set(new THREE.Mesh(g3,baseMat));addGame(meshes['3-'+k]);objects.push(meshes['3-'+k])});lid=set(new THREE.Mesh(g9,baseMat));addGame(lid);makePieces({l:gl,m:gm,s:gs});createBoardZones();apply(0);setLoadingProgress(84,'تجهيز الطاولة');const tableObj=await realTable();alignGameToTable(tableObj);objects.push(...pieces.map(p=>p.mesh),tableObj.userData.fitProxy||tableObj);fit(objects);loaded=true;applyCalibration();renderSetup3D();render();setLoadingProgress(96,'إظهار اللعبة');requestAnimationFrame(()=>requestAnimationFrame(done));marble();log('game v091 ready - svg table footprint')}catch(e){fail(e)}}
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(performancePixelRatio());renderer.setSize(innerWidth,innerHeight);render()},{passive:true});
addEventListener('keydown',e=>{if(e.key.toLowerCase()==='r')replay()});
renderer.domElement.addEventListener('pointerdown',beginDrag);
addEventListener('pointermove',moveDrag,{passive:false});
addEventListener('pointerup',endDrag);
addEventListener('pointercancel',endDrag);
async function startApp(){
  setLoadingProgress(8,'تجهيز الواجهة');
  createCalibrationChrome();
  ensureGameChrome();
  attachGameDebug();
  applyCalibration();
  setLoadingProgress(18,'تحميل المعايرة');
  await loadPublishedCalibration();
  applyCalibration();
  renderCalibrationPanel();
  await boot();
}
startApp().catch(fail);
