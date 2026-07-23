const response=await fetch('./src/app-game-v085.js?v=104-direct-source',{cache:'no-store'});
if(!response.ok)throw new Error(`v104 source load failed: ${response.status}`);
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
replaceExact("const BUILD='97';","const BUILD='104';",'build number');

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
globalThis.__yakolakPerformance={enabled:true,profile:'v104-bright-neutral',mobileHighQuality:MOBILE_HIGH_QUALITY,get pixelRatio(){return renderer?.getPixelRatio?.()||performancePixelRatio()}};
`,
  'balanced performance profile'
);

replaceRegex(
  /const DEFAULT_CALIBRATION=\{.*?\n\};\nconst SURFACE_KEYS=/s,
  `const DEFAULT_CALIBRATION={
  scene:{background:'#d7dee5',exposure:.96,fog:false,fogColor:'#d7dee5',fogNear:1800,fogFar:6200,fov:43,minDistance:180,maxDistance:1350,minPolar:32,maxPolar:112,markers:false,pixelRatio:1.1,cameraX:520,cameraY:430,cameraZ:520,targetX:0,targetY:0,targetZ:0},
  room:{
    floor:{color:'#bdc7d0',roughness:.88,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    ceiling:{color:'#f4f6f8',roughness:.94,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    backWall:{color:'#dfe5ea',roughness:.92,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    leftWall:{color:'#d5dde4',roughness:.92,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    rightWall:{color:'#e6ebef',roughness:.92,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    frontWall:{color:'#f1f3f5',roughness:.94,metalness:0,opacity:.025,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    trim:{color:'#aab5bf',roughness:.84,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    edges:{color:'#82909c',opacity:.26,visible:true},
    grid:{color:'#aeb9c4',opacity:.07,visible:true}
  },
  game:{
    board:{color:'#242b34',roughness:.58,metalness:0,emissive:'#000000',emissiveIntensity:0},
    right:{color:'#f8f8f3',roughness:.4,metalness:0,emissive:'#000000',emissiveIntensity:0,marble:false},
    left:{color:'#e0ad2f',roughness:.32,metalness:0,emissive:'#000000',emissiveIntensity:0},
    front:{color:'#0eaa7c',roughness:.36,metalness:0,emissive:'#000000',emissiveIntensity:0},
    back:{color:'#2b67e8',roughness:.34,metalness:0,emissive:'#000000',emissiveIntensity:0}
  },
  table:{color:'#cbd2d8',roughness:.64,metalness:0,normalScale:.2,texture:false,repeatX:1,repeatY:1,opacity:1,emissive:'#000000',emissiveIntensity:0,wireframe:false},
  lights:[],
  play:{dragPieces:true,snapToZones:true,showZones:false,zoneSize:36,zoneColor:'#70a7ff',zoneOpacity:.2,dropRadius:42,turnSeconds:18,winnerHighlightPreset:'clean',winnerBlinkCount:5,winnerBlinkDuration:3000,winnerGlowColor:'#ffffff'}
};
const SURFACE_KEYS=`,
  'fixed v104 art direction'
);

replaceRegex(
  /const renderer=new THREE\.WebGLRenderer\(.*?root\.appendChild\(renderer\.domElement\);/s,
  `const renderer=new THREE.WebGLRenderer({antialias:!MOBILE_VIEW||MOBILE_HIGH_QUALITY,alpha:false,powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.setPixelRatio(performancePixelRatio());
renderer.setSize(innerWidth,innerHeight);
renderer.toneMapping=THREE.AgXToneMapping||THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=.96;
renderer.shadowMap.enabled=false;
root.appendChild(renderer.domElement);`,
  'bright neutral renderer'
);

replaceExact('RectAreaLightUniformsLib.init();\n','', 'remove RectAreaLight initialization');

replaceRegex(
  /const makeMat=p=>new THREE\.MeshStandardMaterial\(p\);\nconst baseMat=[^\n]+\nconst mats=[^\n]+\n/,
  `const makeMat=p=>new THREE.MeshStandardMaterial(p);
const baseMat=makeMat({color:'#242b34',roughness:.58,metalness:0});
const mats={right:makeMat({color:'#f8f8f3',roughness:.4,metalness:0}),left:makeMat({color:'#e0ad2f',roughness:.32,metalness:0}),front:makeMat({color:'#0eaa7c',roughness:.36,metalness:0}),back:makeMat({color:'#2b67e8',roughness:.34,metalness:0})};
`,
  'clean vivid materials'
);

replaceRegex(
  /function buildLighting\(\)\{.*?\n\}\nfunction applyCalibration\(\)/s,
  `function buildLighting(){
  while(lightRig.children.length){const child=lightRig.children.pop();disposeObject(child)}
  dragLightHandles=[];
  const hemi=new THREE.HemisphereLight(0xffffff,0x8b96a3,.72);
  lightRig.add(hemi);
  const key=new THREE.DirectionalLight(0xfff0dc,.9);
  key.position.set(-430,720,500);
  key.target.position.set(0,0,0);
  lightRig.add(key,key.target);
  const fill=new THREE.DirectionalLight(0xddeaff,.28);
  fill.position.set(520,360,-300);
  fill.target.position.set(0,20,0);
  lightRig.add(fill,fill.target);
}
function applyCalibration()`,
  'bright balanced three-light rig'
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
  injectCalibrationCss();
  ensureGameChrome();
  attachGameDebug();
  applyCalibration();
  setLoadingProgress(18,'تجهيز الإضاءة والخامات');
  await boot();
}
startApp().catch(fail);`,
  'remove calibration panel creation'
);

source=source.replace("lightRig.name='yakolak-calibration-light-rig';","lightRig.name='yakolak-v104-bright-neutral-rig';");
source+='\n//# sourceURL=yakolak-v104-bright-neutral-runtime.js\n';

globalThis.__yakolakV104={build:104,style:'bright-neutral-playful',lights:3};
const moduleUrl=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
try{
  await import(moduleUrl);
}finally{
  setTimeout(()=>URL.revokeObjectURL(moduleUrl),15000);
}
