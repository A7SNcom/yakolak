import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';

const V='v071-golden-intro-independent-v058-spill',D=48,R3=135,PR=85,PG=11;
const MODEL_DIR='./assets/models/';
const MARBLE_URL='https://i.ibb.co/B2h2tNKG/Screenshot-2026-06-22-094236.png';
const WOOD_URL='./assets/models/background.webp';
const BIG_BACK_URL='./assets/models/Asset%201big.svg';
const TABLE_OBJ_URL='./assets/models/uploads_files_3139458_Mars+Angled+Stump+Side+Table+30x30x45.obj';
const TABLE_ALBEDO_URL='./assets/models/Mars%20Angled%20Stump%20Side%20Table%2030x30x45_Albedo.png';
const TABLE_NORMAL_URL='./assets/models/Mars%20Angled%20Stump%20Side%20Table%2030x30x45_Normal.png';
const TABLE_ROUGHNESS_URL='./assets/models/Mars%20Angled%20Stump%20Side%20Table%2030x30x45_Roughness.png';
const modelPath=n=>MODEL_DIR+n+'.stl';
const log=(...a)=>console.info('[Yakolak]',...a);

const root=document.getElementById('view'),hint=document.getElementById('hint'),panel=document.getElementById('panel'),btn=document.getElementById('settingsBtn'),out=document.getElementById('out'),loaderEl=document.getElementById('yakolakLoader'),loaderText=document.getElementById('yakolakLoaderText');
if(root)root.style.opacity='0';
if(hint)hint.style.display='none';
if(btn)btn.style.display='none';
if(panel)panel.style.display='none';

function status(t){if(loaderText)loaderText.textContent=t;log(t)}
function reveal(){if(root)root.style.opacity='1';if(replayBtn)replayBtn.style.opacity='1';if(calibrateBtn)calibrateBtn.style.opacity='1';if(loaderEl){loaderEl.classList.add('done');setTimeout(()=>loaderEl.remove(),520)}}
function fatal(e){console.error('[Yakolak] fatal load error',e);if(loaderEl)loaderEl.classList.add('error');if(loaderText)loaderText.textContent='تعذر تحميل اللعبة، حدث الصفحة';}

const replayBtn=document.createElement('button');
replayBtn.textContent='↻';
replayBtn.title='إعادة التشغيل';
replayBtn.setAttribute('aria-label','إعادة التشغيل');
Object.assign(replayBtn.style,{position:'fixed',right:'16px',bottom:'16px',zIndex:50,width:'52px',height:'52px',borderRadius:'50%',border:'1px solid #333',background:'#050505',color:'#fff',fontSize:'26px',lineHeight:'1',fontFamily:'inherit',fontWeight:'800',cursor:'pointer',boxShadow:'0 8px 22px rgba(0,0,0,.35)',display:'grid',placeItems:'center',opacity:'0',transition:'opacity .35s ease'});
document.body.appendChild(replayBtn);

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x777777);

const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,.01,100000);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.04;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
root.appendChild(renderer.domElement);

const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;

const hemiLight=new THREE.HemisphereLight(0xfff5e6,0x46505f,.65);
scene.add(hemiLight);

const keyLight=new THREE.DirectionalLight(0xffe8c8,1.25);
keyLight.position.set(180,270,160);
keyLight.castShadow=true;
keyLight.shadow.mapSize.set(1536,1536);
keyLight.shadow.bias=-.00008;
keyLight.shadow.normalBias=.018;
Object.assign(keyLight.shadow.camera,{left:-520,right:520,top:520,bottom:-520,near:1,far:1000});
keyLight.shadow.camera.updateProjectionMatrix();
scene.add(keyLight);

const fillLight=new THREE.DirectionalLight(0xc8d8ff,.25);
fillLight.position.set(-230,160,-190);
scene.add(fillLight);

const rimLight=new THREE.DirectionalLight(0xffffff,.42);
rimLight.position.set(-150,230,260);
scene.add(rimLight);

const topLight=new THREE.PointLight(0xfff1d6,.38,520,1.65);
topLight.position.set(0,210,0);
scene.add(topLight);

const frontSpot=new THREE.SpotLight(0xffe0b8,.32,650,Math.PI/5,.48,1.25);
frontSpot.position.set(0,230,280);
frontSpot.target.position.set(0,0,0);
scene.add(frontSpot,frontSpot.target);

const LIGHTING_PRESETS={
  neutral:{label:'محايدة',hemi:.72,key:.95,fill:.35,rim:.28,top:.18,spot:.12,exposure:1.02,keyPos:[180,260,170],fillPos:[-220,150,-170],rimPos:[-150,230,250],topPos:[0,210,0],spotPos:[0,230,280]},
  soft:{label:'ناعمة',hemi:.68,key:.82,fill:.42,rim:.18,top:.20,spot:.10,exposure:1.06,keyPos:[150,250,160],fillPos:[-220,150,-180],rimPos:[-140,210,240],topPos:[0,210,0],spotPos:[0,230,270]},
  balanced:{label:'متوازنة',hemi:.62,key:1.15,fill:.28,rim:.38,top:.24,spot:.20,exposure:1.04,keyPos:[180,270,160],fillPos:[-230,160,-190],rimPos:[-150,230,260],topPos:[0,210,0],spotPos:[0,230,280]},
  product:{label:'منتج',hemi:.78,key:1.05,fill:.50,rim:.36,top:.42,spot:.28,exposure:1.08,keyPos:[90,310,210],fillPos:[-240,190,-150],rimPos:[-210,240,230],topPos:[0,260,0],spotPos:[0,250,260]},
  warm:{label:'دافئة',hemi:.58,key:1.24,fill:.20,rim:.32,top:.28,spot:.38,exposure:1.00,keyPos:[160,300,170],fillPos:[-260,135,-210],rimPos:[-180,230,260],topPos:[-20,230,10],spotPos:[10,240,290]},
  cinematic:{label:'سينمائية',hemi:.34,key:1.30,fill:.12,rim:.62,top:.12,spot:.30,exposure:.94,keyPos:[130,310,190],fillPos:[-260,110,-210],rimPos:[-190,260,300],topPos:[0,240,0],spotPos:[-30,250,300]},
  bright:{label:'فاتحة',hemi:.88,key:.98,fill:.48,rim:.24,top:.34,spot:.18,exposure:1.16,keyPos:[190,250,130],fillPos:[-220,180,-150],rimPos:[-110,210,230],topPos:[0,220,0],spotPos:[0,230,250]},
  lowglare:{label:'بدون لمعان',hemi:.74,key:.72,fill:.42,rim:.16,top:.08,spot:.08,exposure:1.04,keyPos:[210,250,210],fillPos:[-240,180,-210],rimPos:[-120,210,250],topPos:[0,200,0],spotPos:[0,210,260]},
  detail:{label:'تفاصيل',hemi:.50,key:1.18,fill:.18,rim:.70,top:.18,spot:.34,exposure:.98,keyPos:[110,320,210],fillPos:[-280,120,-240],rimPos:[-220,280,320],topPos:[0,240,0],spotPos:[20,260,290]}
};
let activeLightingPreset='balanced';

const loader=new STLLoader(),objLoader=new OBJLoader(),texLoader=new THREE.TextureLoader();
texLoader.setCrossOrigin('anonymous');

const TLINE={lidShake:550,lidLift:1300,lidH:900,wallStart:0,wallDelay:520,wallShake:280,wallRaise:20,wallLift:360,wallMove:850,wallDrop:430,pieceLead:520,pieceMove:1200,pieceArc:34,pieceStagger:60};
const SPILL={seed:4128,spread:1.08,height:.82,clearance:1.32};
const LID_START={px:0,py:62.5,pz:0,rx:-90,ry:180,rz:0};
const WALL_START={right:{px:81,py:35,pz:0,rx:-90,ry:-90,rz:0},left:{px:-81,py:35,pz:0,rx:-90,ry:90,rz:180},front:{px:0,py:35,pz:81,rx:-180,ry:0,rz:90},back:{px:0,py:35,pz:-81,rx:-180,ry:180,rz:-90}};
const ORDER=['right','left','front','back'],TYPES=['l','m','s'],DIR_COLOR={right:'marble',left:'gold',front:'green',back:'blue'},COLOR_DIR={marble:'right',gold:'left',green:'front',blue:'back'};
const meshes={},pMeshes=[],geos={},pieceMeshes=[],texRefs=[];
let lidMesh,tableMesh,woodTexture,tableMaps={},marbleTexture=null,started=performance.now(),playing=false,loaded=false;

const palette={
  board:{color:'#161616',roughness:.52,metalness:.06},
  p:{base:'#6f7378',roughness:.86,metalness:0,visible:false},
  right:{base:'#ffffff',roughness:.92,metalness:0},
  left:{color:'#a97718',roughness:.50,metalness:.34},
  front:{color:'#18805f',roughness:.48,metalness:.22},
  back:{color:'#001d8f',roughness:.68,metalness:.06},
  table:{color:'#c79a64',roughness:.72,metalness:0},
  tableSide:{color:'#7a4b27',roughness:.82,metalness:0}
};

const CAL={
  lighting:{
    ...LIGHTING_PRESETS.balanced,shadowBias:-.00008,normalBias:.018,shadowSize:1536,spotAngle:36,spotPenumbra:.48,spotTargetX:0,spotTargetY:0,spotTargetZ:0,
    lamps:[
      {enabled:true,label:'لمبة 1',color:'#fff2d0',intensity:.65,distance:360,decay:1.55,pos:[-120,145,115]},
      {enabled:true,label:'لمبة 2',color:'#d8e6ff',intensity:.38,distance:330,decay:1.65,pos:[140,125,-120]},
      {enabled:true,label:'لمبة 3',color:'#ffffff',intensity:.42,distance:300,decay:1.55,pos:[0,185,20]}
    ]
  },
  materials:{
    boardColor:'#161616',boardRough:.52,boardMetal:.06,boardEmissive:'#000000',boardEmit:0,
    marbleColor:'#ffffff',marbleRough:.92,marbleMetal:0,marbleEmit:0,marbleTexture:true,
    goldColor:'#8a570f',goldRough:.58,goldMetal:.18,goldEmit:0,
    greenColor:'#006144',greenRough:.56,greenMetal:.10,greenEmit:0,
    blueColor:'#001f8f',blueRough:.72,blueMetal:0,blueEmit:0
  }
};

function std(p){return new THREE.MeshStandardMaterial({color:p.color||p.base,roughness:p.roughness,metalness:p.metalness})}
const baseMat=std(palette.board),pMat=std(palette.p),mats={right:std(palette.right),left:std(palette.left),front:std(palette.front),back:std(palette.back)};
const texState={textureMode:'pattern',textureRepeat:1,offsetX:0,offsetY:.15,rotation:0,power:0};

function setShadow(o,cast=true,receive=true){
  if(!o)return o;
  if(o.isMesh){o.castShadow=cast;o.receiveShadow=receive}
  if(o.traverse)o.traverse(ch=>{if(ch.isMesh){ch.castShadow=cast;ch.receiveShadow=receive}});
  return o;
}

function setVec(v,arr){v.set(arr[0],arr[1],arr[2])}
function clamp(v,min,max){return Math.max(min,Math.min(max,Number(v)||0))}
function getPath(path){return path.split('.').reduce((o,k)=>o[k],CAL)}
function setNumber(path,val){const parts=path.split('.');let o=CAL;for(let i=0;i<parts.length-1;i++)o=o[parts[i]];o[parts.at(-1)]=Number(val)}
function setBool(path,val){const parts=path.split('.');let o=CAL;for(let i=0;i<parts.length-1;i++)o=o[parts[i]];o[parts.at(-1)]=!!val}
function setColor(path,val){const parts=path.split('.');let o=CAL;for(let i=0;i<parts.length-1;i++)o=o[parts[i]];o[parts.at(-1)]=val}

const movableLamps=[];
let draggingLamp=null;
const pointer=new THREE.Vector2(),raycaster=new THREE.Raycaster(),dragPlane=new THREE.Plane(),dragHit=new THREE.Vector3();
function createMovableLamps(){
  const geo=new THREE.SphereGeometry(8,24,16);
  CAL.lighting.lamps.forEach((cfg,i)=>{
    const group=new THREE.Group();
    const light=new THREE.PointLight(cfg.color,cfg.intensity,cfg.distance,cfg.decay);
    const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:cfg.color,transparent:true,opacity:.88,depthTest:true}));
    mesh.userData.lampIndex=i;
    const halo=new THREE.Mesh(new THREE.SphereGeometry(13,24,16),new THREE.MeshBasicMaterial({color:cfg.color,transparent:true,opacity:.13,depthWrite:false}));
    group.add(light,mesh,halo);
    group.position.set(...cfg.pos);
    scene.add(group);
    movableLamps.push({group,light,mesh,halo});
  });
}
function setPointer(e){const r=renderer.domElement.getBoundingClientRect();pointer.x=((e.clientX-r.left)/r.width)*2-1;pointer.y=-((e.clientY-r.top)/r.height)*2+1}
function pickLamp(e){setPointer(e);raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(movableLamps.map(l=>l.mesh),false);return hits[0]?.object||null}
function startLampDrag(e){const mesh=pickLamp(e);if(!mesh)return;const i=mesh.userData.lampIndex;draggingLamp=movableLamps[i];controls.enabled=false;dragPlane.set(new THREE.Vector3(0,1,0),-draggingLamp.group.position.y);renderer.domElement.style.cursor='grabbing';e.preventDefault()}
function moveLampDrag(e){if(!draggingLamp)return;setPointer(e);raycaster.setFromCamera(pointer,camera);if(raycaster.ray.intersectPlane(dragPlane,dragHit)){const i=draggingLamp.mesh.userData.lampIndex;draggingLamp.group.position.x=dragHit.x;draggingLamp.group.position.z=dragHit.z;CAL.lighting.lamps[i].pos=[+dragHit.x.toFixed(2),+draggingLamp.group.position.y.toFixed(2),+dragHit.z.toFixed(2)];syncCalibrationInputs();refresh()}e.preventDefault()}
function endLampDrag(){if(!draggingLamp)return;draggingLamp=null;controls.enabled=true;renderer.domElement.style.cursor=''}
renderer.domElement.addEventListener('pointerdown',startLampDrag);
addEventListener('pointermove',moveLampDrag);
addEventListener('pointerup',endLampDrag);

function applyLightingState(){
  const l=CAL.lighting;
  hemiLight.intensity=l.hemi; keyLight.intensity=l.key; fillLight.intensity=l.fill; rimLight.intensity=l.rim; topLight.intensity=l.top; frontSpot.intensity=l.spot;
  setVec(keyLight.position,l.keyPos); setVec(fillLight.position,l.fillPos); setVec(rimLight.position,l.rimPos); setVec(topLight.position,l.topPos); setVec(frontSpot.position,l.spotPos);
  frontSpot.angle=THREE.MathUtils.degToRad(l.spotAngle); frontSpot.penumbra=l.spotPenumbra;
  frontSpot.target.position.set(l.spotTargetX,l.spotTargetY,l.spotTargetZ); frontSpot.target.updateMatrixWorld();
  renderer.toneMappingExposure=l.exposure;
  keyLight.shadow.bias=l.shadowBias; keyLight.shadow.normalBias=l.normalBias;
  const size=Math.round(clamp(l.shadowSize,512,4096)); keyLight.shadow.mapSize.set(size,size);
  keyLight.shadow.camera.updateProjectionMatrix();
  l.lamps.forEach((cfg,i)=>{const lamp=movableLamps[i];if(!lamp)return;lamp.group.visible=cfg.enabled;lamp.group.position.set(...cfg.pos);lamp.light.color.set(cfg.color);lamp.light.intensity=cfg.intensity;lamp.light.distance=cfg.distance;lamp.light.decay=cfg.decay;lamp.mesh.material.color.set(cfg.color);lamp.halo.material.color.set(cfg.color);lamp.mesh.material.opacity=cfg.enabled?.88:.22;lamp.halo.material.opacity=cfg.enabled?.13:.04});
  refresh();
}

function applyMaterialState(){
  const m=CAL.materials;
  baseMat.color.set(m.boardColor); baseMat.roughness=m.boardRough; baseMat.metalness=m.boardMetal; baseMat.emissive.set(m.boardEmissive); baseMat.emissiveIntensity=m.boardEmit; baseMat.needsUpdate=true;
  const right=mats.right;
  right.color.set(m.marbleColor); right.roughness=m.marbleRough; right.metalness=m.marbleMetal; right.emissive.set(m.marbleColor); right.emissiveIntensity=m.marbleEmit;
  if(m.marbleTexture&&marbleTexture){right.map=marbleTexture}else{right.map=null}
  right.emissiveMap=null; right.needsUpdate=true;
  const gold=mats.left; gold.color.set(m.goldColor); gold.roughness=m.goldRough; gold.metalness=m.goldMetal; gold.emissive.set(m.goldColor); gold.emissiveIntensity=m.goldEmit; gold.needsUpdate=true;
  const green=mats.front; green.color.set(m.greenColor); green.roughness=m.greenRough; green.metalness=m.greenMetal; green.emissive.set(m.greenColor); green.emissiveIntensity=m.greenEmit; green.needsUpdate=true;
  const blue=mats.back; blue.color.set(m.blueColor); blue.roughness=m.blueRough; blue.metalness=m.blueMetal; blue.emissive.set(m.blueColor); blue.emissiveIntensity=m.blueEmit; blue.needsUpdate=true;
  refresh();
}

function applyLightingPreset(name){
  const p=LIGHTING_PRESETS[name]||LIGHTING_PRESETS.balanced;
  const oldLamps=JSON.parse(JSON.stringify(CAL.lighting.lamps));
  activeLightingPreset=LIGHTING_PRESETS[name]?name:'balanced';
  Object.assign(CAL.lighting,JSON.parse(JSON.stringify(p)));
  CAL.lighting.lamps=oldLamps;
  if(CAL.lighting.shadowBias===undefined)CAL.lighting.shadowBias=-.00008;
  if(CAL.lighting.normalBias===undefined)CAL.lighting.normalBias=.018;
  if(CAL.lighting.shadowSize===undefined)CAL.lighting.shadowSize=1536;
  if(CAL.lighting.spotAngle===undefined)CAL.lighting.spotAngle=36;
  if(CAL.lighting.spotPenumbra===undefined)CAL.lighting.spotPenumbra=.48;
  if(CAL.lighting.spotTargetX===undefined){CAL.lighting.spotTargetX=0;CAL.lighting.spotTargetY=0;CAL.lighting.spotTargetZ=0}
  applyLightingState();
  syncCalibrationInputs();
  log('lighting preset',activeLightingPreset,p);
}

function calibrationSnapshot(){
  return {version:V,createdAt:new Date().toISOString(),activeLightingPreset,lighting:CAL.lighting,materials:CAL.materials,notes:'table material unchanged; board and four bases share baseMat; stones are separately tunable; three draggable light spheres included'};
}

function copyCalibration(){
  const text='const YAKOLAK_VISUAL_CALIBRATION = '+JSON.stringify(calibrationSnapshot(),null,2)+';';
  const done=()=>{copyBtn.textContent='تم النسخ ✓';setTimeout(()=>copyBtn.textContent='نسخ النتيجة',1100)};
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(done).catch(()=>{if(out){out.style.display='block';out.value=text;out.select();document.execCommand('copy');out.style.display='none';done()}});
  else if(out){out.style.display='block';out.value=text;out.select();document.execCommand('copy');out.style.display='none';done()}
}

function makeButton(text){const b=document.createElement('button');b.type='button';b.textContent=text;Object.assign(b.style,{height:'32px',padding:'0 11px',borderRadius:'999px',border:'1px solid rgba(255,255,255,.18)',background:'rgba(255,255,255,.08)',color:'#fff',font:'800 12px system-ui,Arial',cursor:'pointer'});return b}
function makeRow(label,input){const row=document.createElement('label');Object.assign(row.style,{display:'grid',gridTemplateColumns:'88px 1fr 48px',gap:'8px',alignItems:'center',font:'700 11px system-ui,Arial',color:'#eee'});const s=document.createElement('span');s.textContent=label;const v=document.createElement('span');v.textContent=input.type==='checkbox'?(input.checked?'ON':'OFF'):input.value;v.style.opacity=.72;input.addEventListener('input',()=>{v.textContent=input.type==='checkbox'?(input.checked?'ON':'OFF'):input.value});row.append(s,input,v);return row}
function range(label,path,min,max,step){const i=document.createElement('input');i.type='range';i.min=min;i.max=max;i.step=step;i.value=getPath(path);i.dataset.path=path;i.addEventListener('input',()=>{setNumber(path,i.value);applyLightingState();applyMaterialState()});return makeRow(label,i)}
function color(label,path){const i=document.createElement('input');i.type='color';i.value=getPath(path);i.dataset.path=path;i.addEventListener('input',()=>{setColor(path,i.value);if(path.startsWith('lighting.'))applyLightingState();else applyMaterialState()});return makeRow(label,i)}
function check(label,path){const i=document.createElement('input');i.type='checkbox';i.checked=getPath(path);i.dataset.path=path;i.addEventListener('input',()=>{setBool(path,i.checked);if(path.startsWith('lighting.'))applyLightingState();else applyMaterialState()});return makeRow(label,i)}
function section(title){const h=document.createElement('div');h.textContent=title;Object.assign(h.style,{font:'900 13px system-ui,Arial',color:'#fff',padding:'12px 0 5px',borderTop:'1px solid rgba(255,255,255,.10)',marginTop:'8px'});return h}
function syncCalibrationInputs(){
  if(!calibrationPanel)return;
  calibrationPanel.querySelectorAll('input[data-path]').forEach(i=>{const val=getPath(i.dataset.path);if(i.type==='checkbox')i.checked=!!val;else i.value=val});
  calibrationPanel.querySelectorAll('button[data-preset]').forEach(b=>{const on=b.dataset.preset===activeLightingPreset;b.style.background=on?'#fff':'rgba(255,255,255,.08)';b.style.color=on?'#111':'#fff';b.style.borderColor=on?'#fff':'rgba(255,255,255,.18)'});
}

const calibrateBtn=document.createElement('button');
calibrateBtn.textContent='معايرة';
calibrateBtn.title='فتح معايرة الإضاءة والخامات';
Object.assign(calibrateBtn.style,{position:'fixed',right:'16px',top:'16px',zIndex:60,height:'40px',padding:'0 16px',borderRadius:'999px',border:'1px solid rgba(255,255,255,.22)',background:'rgba(0,0,0,.56)',color:'#fff',font:'900 13px system-ui,Arial',cursor:'pointer',boxShadow:'0 10px 30px rgba(0,0,0,.35)',opacity:'0',transition:'opacity .35s ease'});
document.body.appendChild(calibrateBtn);

const calibrationPanel=document.createElement('div');
Object.assign(calibrationPanel.style,{position:'fixed',right:'16px',top:'64px',zIndex:59,width:'390px',maxWidth:'calc(100vw - 32px)',maxHeight:'calc(100vh - 92px)',overflow:'auto',display:'none',direction:'rtl',padding:'12px',border:'1px solid rgba(255,255,255,.16)',borderRadius:'18px',background:'rgba(5,5,5,.82)',backdropFilter:'blur(14px)',boxShadow:'0 18px 60px rgba(0,0,0,.45)'});
const panelTitle=document.createElement('div');panelTitle.textContent='مختبر معايرة الإضاءة والخامات';Object.assign(panelTitle.style,{font:'900 15px system-ui,Arial',color:'#fff',padding:'2px 4px 8px'});calibrationPanel.appendChild(panelTitle);
const presetsWrap=document.createElement('div');Object.assign(presetsWrap.style,{display:'flex',gap:'6px',flexWrap:'wrap'});Object.keys(LIGHTING_PRESETS).forEach(k=>{const b=makeButton(LIGHTING_PRESETS[k].label);b.dataset.preset=k;b.onclick=()=>applyLightingPreset(k);presetsWrap.appendChild(b)});calibrationPanel.appendChild(presetsWrap);
const copyBtn=makeButton('نسخ النتيجة');copyBtn.style.width='100%';copyBtn.style.marginTop='10px';copyBtn.onclick=copyCalibration;calibrationPanel.appendChild(copyBtn);
calibrationPanel.appendChild(section('كرات ضوئية قابلة للسحب'));
const lampNote=document.createElement('div');lampNote.textContent='اسحب الكرة بالماوس لتحريكها يمين/يسار وأمام/خلف. الارتفاع يتغير من Height.';Object.assign(lampNote.style,{font:'700 11px system-ui,Arial',color:'#ddd',opacity:.75,lineHeight:'1.6',padding:'0 0 6px'});calibrationPanel.appendChild(lampNote);
for(let i=0;i<3;i++){
  calibrationPanel.appendChild(section(`لمبة ${i+1}`));
  calibrationPanel.appendChild(check('تشغيل',`lighting.lamps.${i}.enabled`));
  calibrationPanel.appendChild(color('لون',`lighting.lamps.${i}.color`));
  [['قوة',`lighting.lamps.${i}.intensity`,0,3,.01],['مدى',`lighting.lamps.${i}.distance`,40,800,1],['تلاشي',`lighting.lamps.${i}.decay`,.2,3,.01],['X',`lighting.lamps.${i}.pos.0`,-260,260,1],['Height',`lighting.lamps.${i}.pos.1`,20,360,1],['Z',`lighting.lamps.${i}.pos.2`,-260,260,1]].forEach(a=>calibrationPanel.appendChild(range(...a)));
}
calibrationPanel.appendChild(section('إضاءة عامة ومركزة'));
[['تعريض','lighting.exposure',.5,1.8,.01],['عام','lighting.hemi',0,1.8,.01],['رئيسي','lighting.key',0,3,.01],['تعبئة','lighting.fill',0,2,.01],['حافة','lighting.rim',0,2,.01],['علوي','lighting.top',0,2,.01],['سبوت','lighting.spot',0,2,.01],['زاوية سبوت','lighting.spotAngle',8,75,1],['نعومة سبوت','lighting.spotPenumbra',0,1,.01]].forEach(a=>calibrationPanel.appendChild(range(...a)));
calibrationPanel.appendChild(section('موقع الضوء الرئيسي'));
[['Key X','lighting.keyPos.0',-420,420,1],['Key Y','lighting.keyPos.1',40,520,1],['Key Z','lighting.keyPos.2',-420,420,1],['Fill X','lighting.fillPos.0',-420,420,1],['Fill Y','lighting.fillPos.1',40,420,1],['Fill Z','lighting.fillPos.2',-420,420,1],['Rim X','lighting.rimPos.0',-420,420,1],['Rim Y','lighting.rimPos.1',40,520,1],['Rim Z','lighting.rimPos.2',-420,420,1],['Spot X','lighting.spotPos.0',-420,420,1],['Spot Y','lighting.spotPos.1',40,520,1],['Spot Z','lighting.spotPos.2',-420,420,1]].forEach(a=>calibrationPanel.appendChild(range(...a)));
calibrationPanel.appendChild(section('الظلال'));
[['Shadow size','lighting.shadowSize',512,4096,256],['Bias','lighting.shadowBias',-.001,.001,.00001],['Normal bias','lighting.normalBias',0,.08,.001]].forEach(a=>calibrationPanel.appendChild(range(...a)));
calibrationPanel.appendChild(section('خامة البورد والقواعد الأربعة'));
calibrationPanel.appendChild(color('لون البورد','materials.boardColor'));[['خشونة','materials.boardRough',0,1,.01],['معدني','materials.boardMetal',0,1,.01],['توهج','materials.boardEmit',0,.25,.001]].forEach(a=>calibrationPanel.appendChild(range(...a)));
calibrationPanel.appendChild(section('خامات الحجارة'));
calibrationPanel.appendChild(check('رخام أبيض','materials.marbleTexture'));calibrationPanel.appendChild(color('أبيض','materials.marbleColor'));[['خشونة أبيض','materials.marbleRough',0,1,.01],['معدني أبيض','materials.marbleMetal',0,1,.01],['توهج أبيض','materials.marbleEmit',0,.25,.001]].forEach(a=>calibrationPanel.appendChild(range(...a)));
calibrationPanel.appendChild(color('ذهبي','materials.goldColor'));[['خشونة ذهبي','materials.goldRough',0,1,.01],['معدني ذهبي','materials.goldMetal',0,1,.01],['توهج ذهبي','materials.goldEmit',0,.25,.001]].forEach(a=>calibrationPanel.appendChild(range(...a)));
calibrationPanel.appendChild(color('أخضر','materials.greenColor'));[['خشونة أخضر','materials.greenRough',0,1,.01],['معدني أخضر','materials.greenMetal',0,1,.01],['توهج أخضر','materials.greenEmit',0,.25,.001]].forEach(a=>calibrationPanel.appendChild(range(...a)));
calibrationPanel.appendChild(color('أزرق','materials.blueColor'));[['خشونة أزرق','materials.blueRough',0,1,.01],['معدني أزرق','materials.blueMetal',0,1,.01],['توهج أزرق','materials.blueEmit',0,.25,.001]].forEach(a=>calibrationPanel.appendChild(range(...a)));
document.body.appendChild(calibrationPanel);
calibrateBtn.onclick=()=>{const open=calibrationPanel.style.display==='none';calibrationPanel.style.display=open?'block':'none';calibrateBtn.textContent=open?'إغلاق':'معايرة'};
createMovableLamps();

function repeat(){return texState.textureMode==='single'?1:texState.textureRepeat}
function applyTexSettings(t){if(!t)return;t.wrapS=t.wrapT=texState.textureMode==='single'?THREE.ClampToEdgeWrapping:THREE.RepeatWrapping;t.repeat.set(repeat(),repeat());t.offset.set(texState.offsetX,texState.offsetY);t.center.set(.5,.5);t.rotation=THREE.MathUtils.degToRad(texState.rotation);t.needsUpdate=true}
function addAutoUV(g){g.computeBoundingBox();g.computeVertexNormals();const pos=g.getAttribute('position'),nor=g.getAttribute('normal'),b=g.boundingBox,s=b.getSize(new THREE.Vector3()),uv=[];const sx=s.x||1,sy=s.y||1,sz=s.z||1;for(let i=0;i<pos.count;i++){const x=pos.getX(i)-b.min.x,y=pos.getY(i)-b.min.y,z=pos.getZ(i)-b.min.z,nx=Math.abs(nor.getX(i)),ny=Math.abs(nor.getY(i)),nz=Math.abs(nor.getZ(i));let u,v;if(nz>=nx&&nz>=ny){u=x/sx;v=y/sy}else if(nx>=ny&&nx>=nz){u=z/sz;v=y/sy}else{u=x/sx;v=z/sz}uv.push(u,v)}g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));return g}
function makeTextureMat(mat,tex,tint){mat.map=tex;mat.emissiveMap=null;mat.emissive=new THREE.Color(0xffffff);mat.emissiveIntensity=0;mat.color.set(tint);mat.roughness=.92;mat.metalness=0;mat.needsUpdate=true}
function loadTextureTo(mat,tint,label='texture'){return new Promise((res,rej)=>texLoader.load(MARBLE_URL,t=>{t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=renderer.capabilities.getMaxAnisotropy();texRefs.push(t);applyTexSettings(t);if(mat===mats.right)marbleTexture=t;makeTextureMat(mat,t,tint);applyMaterialState();refresh();log(label,'marble restored');res(t)},undefined,e=>{log(label,'marble texture failed',e);rej(e)}))}
function prepTableTex(t,isColor=false){if(!t)return t;if(isColor)t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=renderer.capabilities.getMaxAnisotropy();t.wrapS=t.wrapT=THREE.RepeatWrapping;t.needsUpdate=true;return t}
function loadSoftTexture(url,label,isColor=false){return new Promise(res=>texLoader.load(url+'?v='+Date.now(),t=>{prepTableTex(t,isColor);log(label,'loaded');res(t)},undefined,e=>{log(label,'failed',e);res(null)}))}
function loadTableTextures(){return Promise.all([loadSoftTexture(TABLE_ALBEDO_URL,'table albedo',true),loadSoftTexture(TABLE_NORMAL_URL,'table normal'),loadSoftTexture(TABLE_ROUGHNESS_URL,'table roughness')]).then(([albedo,normal,roughness])=>{tableMaps={albedo,normal,roughness};return tableMaps})}
function loadWoodSurface(){return new Promise(res=>texLoader.load(WOOD_URL+'?v='+Date.now(),t=>{t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=renderer.capabilities.getMaxAnisotropy();t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(2.2,2.2);woodTexture=t;log('wood texture restored',WOOD_URL);res(t)},undefined,e=>{log('wood texture failed, fallback color used',e);woodTexture=null;res(null)}))}
function loadSceneBackground(){return new Promise(res=>texLoader.load(BIG_BACK_URL+'?v='+Date.now(),t=>{t.colorSpace=THREE.SRGBColorSpace;t.mapping=THREE.EquirectangularReflectionMapping;scene.background=t;log('scene background restored',BIG_BACK_URL);res(t)},undefined,e=>{log('scene background failed, fallback gray used',e);res(null)}))}

function tableMaterial(){const mat=std(palette.table);if(tableMaps.albedo){mat.map=tableMaps.albedo;mat.color.set(0xffffff)}else if(woodTexture){mat.map=woodTexture;mat.color.set(0xffffff)}if(tableMaps.normal){mat.normalMap=tableMaps.normal;mat.normalScale.set(.75,.75)}if(tableMaps.roughness){mat.roughnessMap=tableMaps.roughness;mat.roughness=.92}mat.needsUpdate=true;return mat}
function fitTableObject(o){const b=new THREE.Box3().setFromObject(o),s=b.getSize(new THREE.Vector3()),maxTop=Math.max(s.x,s.z)||1,targetTop=420,scale=targetTop/maxTop;o.scale.setScalar(scale);const b2=new THREE.Box3().setFromObject(o),c=b2.getCenter(new THREE.Vector3());o.position.x-=c.x;o.position.z-=c.z;o.position.y+=-1-b2.max.y;o.rotation.y=Math.PI/4;return o}
function createFallbackTable(){if(tableMesh)return tableMesh;const group=new THREE.Group(),topMat=tableMaterial(),sideMat=std(palette.tableSide);const top=new THREE.Mesh(new THREE.BoxGeometry(470,24,360),topMat);top.position.y=-13;group.add(setShadow(top,true,true));const legGeo=new THREE.BoxGeometry(28,260,28);[[-190,-130],[190,-130],[-190,130],[190,130]].forEach(([x,z])=>{const leg=new THREE.Mesh(legGeo,sideMat);leg.position.set(x,-155,z);group.add(setShadow(leg,true,true))});tableMesh=group;scene.add(group);return group}
function loadRealTable(){return new Promise(res=>objLoader.load(TABLE_OBJ_URL+'?v='+Date.now(),o=>{const mat=tableMaterial();o.traverse(ch=>{if(ch.isMesh){ch.material=mat;if(ch.geometry)ch.geometry.computeVertexNormals()}});fitTableObject(o);setShadow(o,true,true);tableMesh=o;scene.add(o);log('real table restored',TABLE_OBJ_URL);res(o)},undefined,e=>{log('real table failed, fallback table used',e);res(createFallbackTable())}))}

function rad(v){return THREE.MathUtils.degToRad(v)}
function tr(o,t){o.position.set(t.px,t.py,t.pz);o.rotation.set(rad(t.rx),rad(t.ry),rad(t.rz))}
function center(g){g.computeBoundingBox();const c=g.boundingBox.getCenter(new THREE.Vector3());g.translate(-c.x,-c.y,-c.z);g.computeVertexNormals();addAutoUV(g)}
function bottom(g){g.computeBoundingBox();const b=g.boundingBox;g.translate(-(b.min.x+b.max.x)/2,-(b.min.y+b.max.y)/2,-b.min.z);g.computeVertexNormals();g.computeBoundingBox();const s=g.boundingBox.getSize(new THREE.Vector3());g.userData.rad=Math.max(s.x,s.y)*.38;addAutoUV(g)}
function ease(t){t=Math.max(0,Math.min(1,t));return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}
function mix(a,b,t){t=ease(t);return{px:a.px+(b.px-a.px)*t,py:a.py+(b.py-a.py)*t,pz:a.pz+(b.pz-a.pz)*t,rx:a.rx+(b.rx-a.rx)*t,ry:a.ry+(b.ry-a.ry)*t,rz:a.rz+(b.rz-a.rz)*t}}
function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function baseA(){return {'9':{px:0,py:6,pz:0,rx:-90,ry:0,rz:0},'3-right':{px:R3,py:6,pz:0,rx:-90,ry:0,rz:0},'3-left':{px:-R3,py:6,pz:0,rx:-90,ry:0,rz:180},'3-front':{px:0,py:6,pz:R3,rx:-90,ry:0,rz:90},'3-back':{px:0,py:6,pz:-R3,rx:-90,ry:0,rz:-90}}}
function bases(){return [{id:'right-base',dir:'right',px:R3,pz:0,mode:'side'},{id:'left-base',dir:'left',px:-R3,pz:0,mode:'side'},{id:'front-base',dir:'front',px:0,pz:R3,mode:'main'},{id:'back-base',dir:'back',px:0,pz:-R3,mode:'main'}]}
function pRows(){return {'p-front':{px:0,py:7,pz:PR,rx:-90,ry:0,rz:0,axis:'x'},'p-back':{px:0,py:7,pz:-PR,rx:-90,ry:0,rz:0,axis:'x'},'p-right':{px:PR,py:7,pz:0,rx:-90,ry:0,rz:90,axis:'z'},'p-left':{px:-PR,py:7,pz:0,rx:-90,ry:0,rz:90,axis:'z'}}}
function off(side,b){const r=rad(b.mode==='side'?90:0);return{x:Math.cos(r)*D*side,z:Math.sin(r)*D*side}}
function pInstances(){const rows=pRows(),a=[];Object.keys(rows).forEach(k=>{const r=rows[k];for(let s=-3;s<=3;s++)a.push({id:k+'-'+(s+4),row:k,side:s,px:r.px+(r.axis==='x'?s*PG:0),py:r.py,pz:r.pz+(r.axis==='z'?s*PG:0),rx:r.rx,ry:r.ry,rz:r.rz,visible:false})});return a}
function outerPositions(){const a=[];bases().forEach(b=>[-1,0,1].forEach(side=>{const o=off(side,b);a.push({id:b.id+'-'+side,direction:b.dir,side,px:b.px+o.x,py:2,pz:b.pz+o.z,rx:-90,ry:0,rz:0})}));return a}
function buildSpillList(seed){let arr=[];['marble','gold','blue','green'].forEach(c=>TYPES.forEach(t=>{for(let i=0;i<3;i++)arr.push({type:t,color:c})}));let r=rng(seed);for(let i=arr.length-1;i>0;i--){let j=Math.floor(r()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}arr.sort((a,b)=>({l:0,m:1,s:2}[a.type]-{l:0,m:1,s:2}[b.type]));return arr}
function makeSlots(seed){let r=rng(seed),slots=[],n=6,half=55*SPILL.spread,step=half*2/(n-1);for(let ix=0;ix<n;ix++)for(let iz=0;iz<n;iz++)slots.push({x:-half+ix*step+(r()-.5)*step*.32,z:-half+iz*step+(r()-.5)*step*.32});for(let i=slots.length-1;i>0;i--){let j=Math.floor(r()*(i+1));[slots[i],slots[j]]=[slots[j],slots[i]]}return slots}
function relax(list){for(let it=0;it<140;it++){for(let i=0;i<list.length;i++){let a=list[i];for(let j=i+1;j<list.length;j++){let b=list[j],dx=b.x-a.x,dz=b.z-a.z,dist=Math.hypot(dx,dz)||.001,need=(a.r+b.r)*SPILL.clearance*(a.layer===b.layer?1:.66);if(dist<need){let push=(need-dist)*.52,nx=dx/dist,nz=dz/dist;a.x-=nx*push;a.z-=nz*push;b.x+=nx*push;b.z+=nz*push}}}let half=61*SPILL.spread;for(let p of list){let lim=half-p.r-2;p.x=Math.max(-lim,Math.min(lim,p.x));p.z=Math.max(-lim,Math.min(lim,p.z))}}}
function genSpillStarts(){let r=rng(SPILL.seed),list=buildSpillList(SPILL.seed+17),slots=makeSlots(SPILL.seed+99),res=[];list.forEach((it,i)=>{let rad=(geos[it.type]?.userData.rad||8)*(it.type==='l'?1.08:it.type==='m'?1:.93),s=slots[i],layer=i<26?0:i<34?1:2,pose=r()<.72?'lay':'stand';res.push({type:it.type,color:it.color,r:rad,layer,pose,x:s.x,z:s.z})});relax(res);res.forEach((p,i)=>{let r2=rng(SPILL.seed+i*13+7),side=p.pose==='lay';p.px=+p.x.toFixed(2);p.pz=+p.z.toFixed(2);p.py=+(side?12+p.r*.72+p.layer*3.2*SPILL.height:9+p.layer*3.8*SPILL.height+r2()*1.8).toFixed(2);p.rz=+Math.round(r2()*360);if(side){p.rx=+(r2()<.5?0:-180)+(r2()*2-1)*9;p.ry=+(r2()*2-1)*22}else{p.rx=-90+(r2()*2-1)*10;p.ry=(r2()*2-1)*8}});return res}
function lidAt(ms){const p={...LID_START};if(ms<TLINE.lidShake){const f=1-ms/TLINE.lidShake,w=Math.sin(ms*.12)*2.8*f;p.rx+=w*.55;p.ry+=Math.cos(ms*.09)*1.1*f;p.rz+=Math.sin(ms*.07)*1.4*f;return p}p.py+=TLINE.lidH*ease((ms-TLINE.lidShake)/TLINE.lidLift);return p}
function wallAt(key,ms){const id='3-'+key,st=WALL_START[key],fn=baseA()[id],i=ORDER.indexOf(key),start=TLINE.lidShake+TLINE.wallStart+i*TLINE.wallDelay,up={...st,py:st.py+TLINE.wallRaise},upF={...fn,py:st.py+TLINE.wallRaise};let t=ms-start;if(t<=0)return st;if(t<TLINE.wallShake){const f=1-t/TLINE.wallShake,w=Math.sin(t*.06)*2.2*f;return{...st,rx:st.rx+w*.4,ry:st.ry+w*.25,rz:st.rz+w*.35}}t-=TLINE.wallShake;if(t<TLINE.wallLift)return mix(st,up,t/TLINE.wallLift);t-=TLINE.wallLift;if(t<TLINE.wallMove)return mix(up,upF,t/TLINE.wallMove);t-=TLINE.wallMove;if(t<TLINE.wallDrop)return mix(upF,fn,t/TLINE.wallDrop);return fn}
function pieceStart(p){const i=ORDER.indexOf(p.dir),drop=TLINE.lidShake+TLINE.wallStart+i*TLINE.wallDelay+TLINE.wallShake+TLINE.wallLift+TLINE.wallMove;return drop-TLINE.pieceLead+(p.side+1)*TLINE.pieceStagger}
function pieceAt(p,ms){const q=ease((ms-pieceStart(p))/TLINE.pieceMove),m=mix(p.start,p.final,q);m.py+=Math.sin(q*Math.PI)*TLINE.pieceArc;return m}
function apply(ms){tr(meshes['9'],baseA()['9']);if(lidMesh){tr(lidMesh,lidAt(ms));lidMesh.visible=ms<TLINE.lidShake+TLINE.lidLift}ORDER.forEach(k=>tr(meshes['3-'+k],wallAt(k,ms)));pieceMeshes.forEach(p=>tr(p.mesh,pieceAt(p,ms)));if(ms>=totalTime())snapFinal()}
function snapFinal(){tr(meshes['9'],baseA()['9']);ORDER.forEach(k=>tr(meshes['3-'+k],baseA()['3-'+k]));pieceMeshes.forEach(p=>tr(p.mesh,p.final));pInstances().forEach((p,i)=>tr(pMeshes[i],p));pMeshes.forEach(m=>m.visible=false);if(lidMesh)lidMesh.visible=false}
function totalTime(){const lidDone=TLINE.lidShake+TLINE.lidLift,wallDone=TLINE.lidShake+TLINE.wallStart+3*TLINE.wallDelay+TLINE.wallShake+TLINE.wallLift+TLINE.wallMove+TLINE.wallDrop+TLINE.pieceMove;return Math.max(lidDone,wallDone)+500}
function refresh(){if(!out)return;out.value='const YAKOLAK_GOLDEN_INTRO_FINAL = '+JSON.stringify({version:V,principle:'v058 spill preserved as independent meshes; final frame snaps to static golden state 100%',modelDir:MODEL_DIR,marbleUrl:MARBLE_URL,woodUrl:WOOD_URL,bigBackUrl:BIG_BACK_URL,tableObjUrl:TABLE_OBJ_URL,tableTextures:{albedo:TABLE_ALBEDO_URL,normal:TABLE_NORMAL_URL,roughness:TABLE_ROUGHNESS_URL},calibration:calibrationSnapshot(),timeline:TLINE,spill:SPILL,locked_layout:{stoneDistance:D,threeRadius:R3,pRadius:PR,pPieceGap:PG},models_alignment:{...baseA(),...pRows()},table:{visible:true,type:'OBJ table model',url:TABLE_OBJ_URL,targetTop:420,topY:-1,rotationY:45},background:{visible:true,url:BIG_BACK_URL,type:'scene background'},outer_stones:{visible:true,positions:outerPositions()},p_model:{visible:false,file:modelPath('p'),material:palette.p,texture:texState,rows:pRows(),instances:pInstances()}},null,2)+';'}
function restartIntro(){if(!loaded)return;started=performance.now();playing=true;if(lidMesh)lidMesh.visible=true;apply(0);log('replay')}
replayBtn.onclick=restartIntro;

function loadBase(id){return new Promise((res,rej)=>loader.load(modelPath(id==='9'?'9':'3')+'?v='+V+'-'+id,g=>{center(g);const m=setShadow(new THREE.Mesh(g,baseMat),true,true);meshes[id]=m;scene.add(m);tr(m,baseA()[id]);res(m)},undefined,e=>rej(new Error('model failed '+id))))}
function loadLid(){return new Promise((res,rej)=>loader.load(modelPath('9')+'?v='+V+'-lid',g=>{center(g);lidMesh=setShadow(new THREE.Mesh(g,baseMat),true,true);scene.add(lidMesh);tr(lidMesh,LID_START);res(lidMesh)},undefined,e=>rej(new Error('model failed lid'))))}
function loadPieceGeo(n){return new Promise((res,rej)=>loader.load(modelPath(n)+'?v='+V+'-'+n,g=>{bottom(g);geos[n]=g;res(g)},undefined,e=>rej(new Error('piece geometry failed '+n))))}
function makePieces(){const starts=genSpillStarts(),buckets={};starts.forEach(s=>{const k=s.color+'-'+s.type;(buckets[k]||(buckets[k]=[])).push(s)});outerPositions().forEach(pos=>TYPES.forEach(type=>{if(!geos[type])throw new Error('missing piece geometry '+type);const color=DIR_COLOR[pos.direction],st=(buckets[color+'-'+type]||[]).shift();if(!st)return;const mesh=setShadow(new THREE.Mesh(geos[type].clone(),mats[pos.direction]),true,true);const p={mesh,type,dir:pos.direction,side:pos.side,start:{px:st.px,py:st.py,pz:st.pz,rx:st.rx,ry:st.ry,rz:st.rz},final:{px:pos.px,py:pos.py,pz:pos.pz,rx:pos.rx,ry:pos.ry,rz:pos.rz}};pieceMeshes.push(p);scene.add(mesh);tr(mesh,p.start)}))}
function loadP(){return new Promise((res,rej)=>loader.load(modelPath('p')+'?v='+V,g=>{center(g);for(let i=0;i<28;i++){const m=setShadow(new THREE.Mesh(g.clone(),pMat),true,true);m.visible=false;pMeshes.push(m);scene.add(m)}pInstances().forEach((p,i)=>tr(pMeshes[i],p));res(pMeshes)},undefined,e=>rej(new Error('p model failed'))))}

async function boot(){
  try{
    applyLightingPreset(activeLightingPreset);
    applyMaterialState();
    status('تحميل المجسمات...');
    await Promise.all(['9','3-right','3-left','3-front','3-back'].map(loadBase).concat(loadLid()).concat(TYPES.map(loadPieceGeo)).concat(loadP()));
    status('تجهيز المشهد...');
    makePieces();
    status('تحميل الخامات...');
    await Promise.all([loadTextureTo(mats.right,'#ffffff','right pieces'),loadTextureTo(pMat,'#6f7378','hidden p model'),loadWoodSurface(),loadSceneBackground(),loadTableTextures()]);
    applyLightingState();
    applyMaterialState();
    status('تحميل الطاولة...');
    await loadRealTable();
    const box=new THREE.Box3();
    Object.values(meshes).forEach(m=>box.expandByObject(m));
    pieceMeshes.forEach(p=>box.expandByObject(p.mesh));
    const size=box.getSize(new THREE.Vector3()),dist=(Math.max(size.x,size.y,size.z)||1)*1.75;
    camera.position.set(dist,dist*.82,dist);
    camera.near=Math.max(dist/1000,.01);
    camera.far=dist*30;
    camera.updateProjectionMatrix();
    controls.target.set(0,0,0);
    controls.update();
    loaded=true;
    started=performance.now();
    playing=true;
    apply(0);
    refresh();
    status('جاهز');
    requestAnimationFrame(()=>requestAnimationFrame(reveal));
    log('loaded',V);
  }catch(e){fatal(e)}
}

addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
addEventListener('keydown',e=>{if(e.key.toLowerCase()==='r')restartIntro();const keys=Object.keys(LIGHTING_PRESETS);if(/^[1-9]$/.test(e.key)&&keys[Number(e.key)-1])applyLightingPreset(keys[Number(e.key)-1]);if(e.key.toLowerCase()==='c')copyCalibration()});
function animate(){requestAnimationFrame(animate);controls.update();if(loaded&&playing){const e=performance.now()-started;apply(Math.min(e,totalTime()));if(e>totalTime()){snapFinal();playing=false}}renderer.render(scene,camera)}

animate();
refresh();
boot();
