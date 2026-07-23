const sourceResponse=await fetch('./src/app-game-v085.js?v=101-source',{cache:'no-store'});
if(!sourceResponse.ok)throw new Error(`v101 source load failed: ${sourceResponse.status}`);
let source=await sourceResponse.text();

function replaceExact(oldValue,newValue,label){
  const count=source.split(oldValue).length-1;
  if(count!==1)throw new Error(`${label}: expected one match, found ${count}`);
  source=source.replace(oldValue,newValue);
}

function replaceRegex(pattern,replacement,label){
  if(!pattern.test(source))throw new Error(`${label}: source pattern not found`);
  pattern.lastIndex=0;
  source=source.replace(pattern,replacement);
}

replaceExact(
  "import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';",
  "import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';\nimport {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';",
  'RoomEnvironment import'
);
replaceExact("const BUILD='97';","const BUILD='101';",'build number');

replaceRegex(
  /const PERF_PARAMS=.*?globalThis\.__yakolakPerformance=.*?;\n/s,
  `const PERFORMANCE_MODE=false;
const MOBILE_VIEW=innerWidth<=900;
const DEVICE_MEMORY=Number(navigator.deviceMemory||4);
const CPU_CORES=Number(navigator.hardwareConcurrency||4);
const MOBILE_HIGH_QUALITY=MOBILE_VIEW&&DEVICE_MEMORY>=4&&CPU_CORES>=6;
const performancePixelRatio=()=>{
  const dpr=Math.max(devicePixelRatio||1,1);
  if(!MOBILE_VIEW)return Math.min(dpr,1.45);
  if(MOBILE_HIGH_QUALITY)return Math.min(dpr,1.75);
  if(DEVICE_MEMORY>=4||CPU_CORES>=6)return Math.min(dpr,1.55);
  return Math.min(dpr,1.3);
};
globalThis.__yakolakPerformance={enabled:true,profile:'v101-quality-first',mobileHighQuality:MOBILE_HIGH_QUALITY,get pixelRatio(){return renderer?.getPixelRatio?.()||performancePixelRatio()}};
`,
  'quality-first profile'
);

replaceRegex(
  /const DEFAULT_CALIBRATION=\{.*?\n\};\nconst SURFACE_KEYS=/s,
  `const DEFAULT_CALIBRATION={
  scene:{background:'#d4d0c8',exposure:1.0,fog:false,fogColor:'#d4d0c8',fogNear:1800,fogFar:6200,fov:43,minDistance:180,maxDistance:1350,minPolar:32,maxPolar:112,markers:false,pixelRatio:1.55,cameraX:520,cameraY:430,cameraZ:520,targetX:0,targetY:0,targetZ:0},
  room:{
    floor:{color:'#b9b2a7',roughness:.88,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    ceiling:{color:'#f3f0e9',roughness:.94,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    backWall:{color:'#e7e2d9',roughness:.9,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    leftWall:{color:'#e5e0d7',roughness:.9,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    rightWall:{color:'#ebe7df',roughness:.9,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    frontWall:{color:'#f2eee7',roughness:.92,metalness:0,opacity:.06,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    trim:{color:'#aaa39a',roughness:.8,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    edges:{color:'#817b73',opacity:.42,visible:true},
    grid:{color:'#9f988e',opacity:.16,visible:true}
  },
  game:{
    board:{color:'#252930',roughness:.56,metalness:.04,emissive:'#000000',emissiveIntensity:0},
    right:{color:'#f5f2e9',roughness:.38,metalness:0,emissive:'#000000',emissiveIntensity:0,marble:false},
    left:{color:'#d8a62b',roughness:.28,metalness:.72,emissive:'#000000',emissiveIntensity:0},
    front:{color:'#0b8f68',roughness:.34,metalness:0,emissive:'#000000',emissiveIntensity:0},
    back:{color:'#2858d7',roughness:.32,metalness:0,emissive:'#000000',emissiveIntensity:0}
  },
  table:{color:'#ffffff',roughness:.72,metalness:0,normalScale:.42,texture:true,repeatX:1,repeatY:1,opacity:1,emissive:'#000000',emissiveIntensity:0,wireframe:false},
  lights:[
    {id:'studioKey',name:'Studio Key',type:'rect',enabled:true,color:'#fff1dc',intensity:6.4,width:720,height:460,x:-350,y:640,z:390,rx:-44,ry:-18,rz:0},
    {id:'studioFill',name:'Studio Fill',type:'rect',enabled:true,color:'#dceaff',intensity:2.35,width:520,height:360,x:420,y:350,z:260,rx:-62,ry:28,rz:0},
    {id:'studioRim',name:'Studio Rim',type:'directional',enabled:true,color:'#e4edff',intensity:.62,x:260,y:500,z:-540,targetX:0,targetY:0,targetZ:0},
    {id:'studioShadow',name:'Studio Shadow',type:'directional',enabled:true,color:'#fff7e9',intensity:1.85,x:-280,y:720,z:430,targetX:0,targetY:0,targetZ:0}
  ],
  play:{dragPieces:true,snapToZones:true,showZones:false,zoneSize:36,zoneColor:'#79a7ff',zoneOpacity:.22,dropRadius:42,turnSeconds:18,winnerHighlightPreset:'clean',winnerBlinkCount:5,winnerBlinkDuration:3000,winnerGlowColor:'#ffffff'}
};
const SURFACE_KEYS=`,
  'fixed v101 style'
);

replaceRegex(
  /const renderer=new THREE\.WebGLRenderer\(.*?root\.appendChild\(renderer\.domElement\);/s,
  `const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.setPixelRatio(performancePixelRatio());
renderer.setSize(innerWidth,innerHeight);
renderer.toneMapping=THREE.AgXToneMapping||THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.0;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
root.appendChild(renderer.domElement);
const pmremGenerator=new THREE.PMREMGenerator(renderer);
scene.environment=pmremGenerator.fromScene(new RoomEnvironment(),.05).texture;
scene.environmentIntensity=MOBILE_VIEW?.8:.9;
pmremGenerator.dispose();`,
  'renderer and environment'
);

replaceRegex(
  /const makeMat=p=>new THREE\.MeshStandardMaterial\(p\);\nconst baseMat=[^\n]+\nconst mats=[^\n]+\n/,
  `const makeMat=p=>new THREE.MeshStandardMaterial({envMapIntensity:1,...p});
const baseMat=makeMat({color:'#252930',roughness:.56,metalness:.04,envMapIntensity:.82});
const mats={right:makeMat({color:'#f5f2e9',roughness:.38,metalness:0,envMapIntensity:.9}),left:makeMat({color:'#d8a62b',roughness:.28,metalness:.72,envMapIntensity:1.28}),front:makeMat({color:'#0b8f68',roughness:.34,metalness:0,envMapIntensity:1}),back:makeMat({color:'#2858d7',roughness:.32,metalness:0,envMapIntensity:1.04})};
`,
  'materials'
);

replaceExact(
  "renderer.setPixelRatio(PERFORMANCE_MODE?performancePixelRatio():Math.min(Math.max(+calibration.scene.pixelRatio||1,1),2));",
  "renderer.setPixelRatio(performancePixelRatio());",
  'adaptive pixel ratio'
);

replaceRegex(
  /function buildLighting\(\)\{.*?\n\}\nfunction applyCalibration\(\)/s,
  `function buildLighting(){
  while(lightRig.children.length){const child=lightRig.children.pop();disposeObject(child)}
  dragLightHandles=[];
  scene.environmentIntensity=MOBILE_VIEW?.8:.9;

  const hemi=new THREE.HemisphereLight(0xf8fbff,0x5e626a,.34);
  lightRig.add(hemi);

  const key=new THREE.RectAreaLight(0xfff0dc,6.4,720,460);
  key.position.set(-350,640,390);
  key.lookAt(0,0,0);
  lightRig.add(key);

  const fill=new THREE.RectAreaLight(0xdceaff,2.35,520,360);
  fill.position.set(420,350,260);
  fill.lookAt(0,0,0);
  lightRig.add(fill);

  const rim=new THREE.DirectionalLight(0xe4edff,.62);
  rim.position.set(260,500,-540);
  rim.target.position.set(0,0,0);
  lightRig.add(rim,rim.target);

  const shadowKey=new THREE.DirectionalLight(0xfff7e9,1.85);
  shadowKey.position.set(-280,720,430);
  shadowKey.target.position.set(0,0,0);
  shadowKey.castShadow=true;
  const shadowSize=MOBILE_VIEW?1024:2048;
  shadowKey.shadow.mapSize.set(shadowSize,shadowSize);
  shadowKey.shadow.camera.left=-360;
  shadowKey.shadow.camera.right=360;
  shadowKey.shadow.camera.top=360;
  shadowKey.shadow.camera.bottom=-360;
  shadowKey.shadow.camera.near=20;
  shadowKey.shadow.camera.far=1800;
  shadowKey.shadow.bias=-.00035;
  shadowKey.shadow.normalBias=.025;
  shadowKey.shadow.radius=3;
  lightRig.add(shadowKey,shadowKey.target);
}
function applyCalibration()`,
  'studio light rig'
);

replaceExact(
  "function set(o){o.castShadow=false;o.receiveShadow=false;return o}",
  "function set(o){if(o?.isMesh){o.castShadow=true;o.receiveShadow=true}return o}",
  'soft shadows'
);

replaceRegex(
  /function marble\(\)\{.*?\}\nasync function boot/s,
  `function marble(){}
async function boot`,
  'remove legacy marble screenshot'
);

replaceRegex(
  /async function startApp\(\)\{.*?\n\}\nstartApp\(\)\.catch\(fail\);/s,
  `async function startApp(){
  setLoadingProgress(8,'تجهيز الواجهة');
  createCalibrationChrome();
  const tools=document.getElementById('yakolakTools');if(tools)tools.style.display='none';
  const panel=document.getElementById('yakolakCalibrationPanel');if(panel)panel.style.display='none';
  ensureGameChrome();
  attachGameDebug();
  applyCalibration();
  setLoadingProgress(18,'تجهيز الإضاءة والخامات');
  await boot();
}
startApp().catch(fail);`,
  'remove runtime calibration override'
);

source=source.replace("lightRig.name='yakolak-calibration-light-rig';","lightRig.name='yakolak-v101-studio-light-rig';");
source+='\n//# sourceURL=yakolak-v101-runtime.js\n';

globalThis.__yakolakV101={build:101,style:'fixed-studio-art-direction'};
const moduleUrl=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
try{
  await import(moduleUrl);
}finally{
  setTimeout(()=>URL.revokeObjectURL(moduleUrl),15000);
}
