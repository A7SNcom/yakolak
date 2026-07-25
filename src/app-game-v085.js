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
const lightTypes={point:'نقطة',spot:'مركزة',linear:'خطية',rect:'مستطيلة',directional:'اتجاهية'…22179 tokens truncated…us||42)){
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
