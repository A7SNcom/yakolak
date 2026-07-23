const response=await fetch('./src/app-game-v085.js?v=103-direct-source',{cache:'no-store'});
if(!response.ok)throw new Error(`v103 source load failed: ${response.status}`);
let source=await response.text();

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

replaceExact("import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';\n",'', 'remove RectAreaLight import');
replaceExact("const BUILD='97';","const BUILD='103';",'build number');

replaceRegex(
  /const PERF_PARAMS=.*?globalThis\.__yakolakPerformance=.*?;\n/s,
  `const PERFORMANCE_MODE=true;
const MOBILE_VIEW=innerWidth<=900;
const DEVICE_MEMORY=Number(navigator.deviceMemory||4);
const CPU_CORES=Number(navigator.hardwareConcurrency||4);
const MOBILE_HIGH_QUALITY=MOBILE_VIEW&&DEVICE_MEMORY>=4&&CPU_CORES>=6;
const performancePixelRatio=()=>{
  const dpr=Math.max(devicePixelRatio||1,1);
  if(!MOBILE_VIEW)return Math.min(dpr,1.0);
  if(MOBILE_HIGH_QUALITY)return Math.min(dpr,1.15);
  if(DEVICE_MEMORY>=4||CPU_CORES>=6)return Math.min(dpr,1.05);
  return Math.min(dpr,.9);
};
globalThis.__yakolakPerformance={enabled:true,profile:'v103-direct-motion',mobileHighQuality:MOBILE_HIGH_QUALITY,get pixelRatio(){return renderer?.getPixelRatio?.()||performancePixelRatio()}};
`,
  'direct motion profile'
);

replaceRegex(
  /const DEFAULT_CALIBRATION=\{.*?\n\};\nconst SURFACE_KEYS=/s,
  `const DEFAULT_CALIBRATION={
  scene:{background:'#96938d',exposure:.88,fog:false,fogColor:'#96938d',fogNear:1800,fogFar:6200,fov:43,minDistance:180,maxDistance:1350,minPolar:32,maxPolar:112,markers:false,pixelRatio:1.1,cameraX:520,cameraY:430,cameraZ:520,targetX:0,targetY:0,targetZ:0},
  room:{
    floor:{color:'#716e68',roughness:.9,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    ceiling:{color:'#b6b1a8',roughness:.94,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    backWall:{color:'#aaa59c',roughness:.92,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    leftWall:{color:'#a39f97',roughness:.92,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    rightWall:{color:'#b0aba2',roughness:.92,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    frontWall:{color:'#bbb6ad',roughness:.94,metalness:0,opacity:.035,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    trim:{color:'#807c75',roughness:.86,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    edges:{color:'#5d5954',opacity:.34,visible:true},
    grid:{color:'#716c65',opacity:.1,visible:true}
  },
  game:{
    board:{color:'#20242b',roughness:.62,metalness:0,emissive:'#000000',emissiveIntensity:0},
    right:{color:'#f5f2e9',roughness:.42,metalness:0,emissive:'#000000',emissiveIntensity:0,marble:false},
    left:{color:'#d8a62b',roughness:.34,metalness:0,emissive:'#000000',emissiveIntensity:0},
    front:{color:'#0b8f68',roughness:.38,metalness:0,emissive:'#000000',emissiveIntensity:0},
    back:{color:'#2858d7',roughness:.36,metalness:0,emissive:'#000000',emissiveIntensity:0}
  },
  table:{color:'#ffffff',roughness:.78,metalness:0,normalScale:.35,texture:true,repeatX:1,repeatY:1,opacity:1,emissive:'#000000',emissiveIntensity:0,wireframe:false},
  lights:[],
  play:{dragPieces:true,snapToZones:true,showZones:false,zoneSize:36,zoneColor:'#79a7ff',zoneOpacity:.22,dropRadius:42,turnSeconds:18,winnerHighlightPreset:'clean',winnerBlinkCount:5,winnerBlinkDuration:3000,winnerGlowColor:'#ffffff'}
};
const SURFACE_KEYS=`,
  'fixed v103 art direction'
);

replaceRegex(
  /const renderer=new THREE\.WebGLRenderer\(.*?root\.appendChild\(renderer\.domElement\);/s,
  `const renderer=new THREE.WebGLRenderer({antialias:!MOBILE_VIEW||MOBILE_HIGH_QUALITY,alpha:false,powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.setPixelRatio(performancePixelRatio());
renderer.setSize(innerWidth,innerHeight);
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=.88;
renderer.shadowMap.enabled=false;
root.appendChild(renderer.domElement);`,
  'lightweight renderer'
);

replaceExact('RectAreaLightUniformsLib.init();\n','', 'remove RectAreaLight initialization');

replaceRegex(
  /const makeMat=p=>new THREE\.MeshStandardMaterial\(p\);\nconst baseMat=[^\n]+\nconst mats=[^\n]+\n/,
  `const makeMat=p=>new THREE.MeshStandardMaterial(p);
const baseMat=makeMat({color:'#20242b',roughness:.62,metalness:0});
const mats={right:makeMat({color:'#f5f2e9',roughness:.42,metalness:0}),left:makeMat({color:'#d8a62b',roughness:.34,metalness:0}),front:makeMat({color:'#0b8f68',roughness:.38,metalness:0}),back:makeMat({color:'#2858d7',roughness:.36,metalness:0})};
`,
  'motion-friendly materials'
);

replaceRegex(
  /function buildLighting\(\)\{.*?\n\}\nfunction applyCalibration\(\)/s,
  `function buildLighting(){
  while(lightRig.children.length){const child=lightRig.children.pop();disposeObject(child)}
  dragLightHandles=[];
  const hemi=new THREE.HemisphereLight(0xf5f7fa,0x484b51,.56);
  lightRig.add(hemi);
  const key=new THREE.DirectionalLight(0xffead2,1.22);
  key.position.set(-520,760,480);
  key.target.position.set(0,0,0);
  lightRig.add(key,key.target);
}
function applyCalibration()`,
  'two-light motion rig'
);

replaceRegex(
  /function marble\(\)\{.*?\}\nasync function boot/s,
  `function marble(){}
async function boot`,
  'remove legacy marble request'
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

source=source.replace("lightRig.name='yakolak-calibration-light-rig';","lightRig.name='yakolak-v103-direct-motion-rig';");
source+='\n//# sourceURL=yakolak-v103-direct-runtime.js\n';

globalThis.__yakolakV103={build:103,style:'direct-motion-two-light'};
const moduleUrl=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
try{
  await import(moduleUrl);
}finally{
  setTimeout(()=>URL.revokeObjectURL(moduleUrl),15000);
}
