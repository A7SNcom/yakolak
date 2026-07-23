const response=await fetch('./src/app-game-v085.js?v=105-direct-source',{cache:'no-store'});
if(!response.ok)throw new Error(`v105 source load failed: ${response.status}`);
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
replaceExact("const BUILD='97';","const BUILD='105';",'build number');

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
globalThis.__yakolakPerformance={enabled:true,profile:'v105-mature-neutral',mobileHighQuality:MOBILE_HIGH_QUALITY,get pixelRatio(){return renderer?.getPixelRatio?.()||performancePixelRatio()}};
`,
  'balanced performance profile'
);

replaceRegex(
  /const DEFAULT_CALIBRATION=\{.*?\n\};\nconst SURFACE_KEYS=/s,
  `const DEFAULT_CALIBRATION={
  scene:{background:'#d2d5d8',exposure:.92,fog:false,fogColor:'#d2d5d8',fogNear:1800,fogFar:6200,fov:43,minDistance:180,maxDistance:1350,minPolar:32,maxPolar:112,markers:false,pixelRatio:1.1,cameraX:520,cameraY:430,cameraZ:520,targetX:0,targetY:0,targetZ:0},
  room:{
    floor:{color:'#bfc3c7',roughness:.9,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    ceiling:{color:'#e2e4e6',roughness:.94,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    backWall:{color:'#d4d7da',roughness:.93,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    leftWall:{color:'#d0d3d6',roughness:.93,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    rightWall:{color:'#d7d9dc',roughness:.93,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    frontWall:{color:'#d5d8db',roughness:.94,metalness:0,opacity:.02,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    trim:{color:'#aeb3b8',roughness:.86,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    edges:{color:'#91979d',opacity:.18,visible:true},
    grid:{color:'#aeb3b8',opacity:.04,visible:true}
  },
  game:{
    board:{color:'#272b31',roughness:.62,metalness:0,emissive:'#000000',emissiveIntensity:0},
    right:{color:'#f2f0e8',roughness:.46,metalness:0,emissive:'#000000',emissiveIntensity:0,marble:false},
    left:{color:'#b7892f',roughness:.42,metalness:0,emissive:'#000000',emissiveIntensity:0},
    front:{color:'#13795b',roughness:.42,metalness:0,emissive:'#000000',emissiveIntensity:0},
    back:{color:'#2a4f91',roughness:.42,metalness:0,emissive:'#000000',emissiveIntensity:0}
  },
  table:{color:'#c3c6ca',roughness:.72,metalness:0,normalScale:.15,texture:false,repeatX:1,repeatY:1,opacity:1,emissive:'#000000',emissiveIntensity:0,wireframe:false},
  lights:[],
  play:{dragPieces:true,snapToZones:true,showZones:false,zoneSize:36,zoneColor:'#6f91c8',zoneOpacity:.18,dropRadius:42,turnSeconds:18,winnerHighlightPreset:'clean',winnerBlinkCount:5,winnerBlinkDuration:3000,winnerGlowColor:'#ffffff'}
};
const SURFACE_KEYS=`,
  'fixed v105 art direction'
);

replaceRegex(
  /const renderer=new THREE\.WebGLRenderer\(.*?root\.appendChild\(renderer\.domElement\);/s,
  `const renderer=new THREE.WebGLRenderer({antialias:!MOBILE_VIEW||MOBILE_HIGH_QUALITY,alpha:false,powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.setPixelRatio(performancePixelRatio());
renderer.setSize(innerWidth,innerHeight);
renderer.toneMapping=THREE.NeutralToneMapping||THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=.92;
renderer.shadowMap.enabled=false;
root.appendChild(renderer.domElement);`,
  'mature neutral renderer'
);

replaceExact('RectAreaLightUniformsLib.init();\n','', 'remove RectAreaLight initialization');

replaceRegex(
  /const makeMat=p=>new THREE\.MeshStandardMaterial\(p\);\nconst baseMat=[^\n]+\nconst mats=[^\n]+\n/,
  `const makeMat=p=>new THREE.MeshStandardMaterial(p);
const baseMat=makeMat({color:'#272b31',roughness:.62,metalness:0});
const mats={right:makeMat({color:'#f2f0e8',roughness:.46,metalness:0}),left:makeMat({color:'#b7892f',roughness:.42,metalness:0}),front:makeMat({color:'#13795b',roughness:.42,metalness:0}),back:makeMat({color:'#2a4f91',roughness:.42,metalness:0})};
`,
  'mature restrained materials'
);

replaceRegex(
  /const COLOR_INFO=\{.*?\n\};\nfunction cssRgb/s,
  `const COLOR_INFO={
  right:{label:'الأبيض',short:'أبيض',css:'#f2f0e8',power:.74},
  back:{label:'الأزرق',short:'أزرق',css:'#2a4f91',power:.88},
  left:{label:'الذهبي',short:'ذهبي',css:'#b7892f',power:.66},
  front:{label:'الأخضر',short:'أخضر',css:'#13795b',power:.8}
};
function cssRgb`,
  'unified interface colors'
);

replaceRegex(
  /function buildLighting\(\)\{.*?\n\}\nfunction applyCalibration\(\)/s,
  `function buildLighting(){
  while(lightRig.children.length){const child=lightRig.children.pop();disposeObject(child)}
  dragLightHandles=[];
  const hemi=new THREE.HemisphereLight(0xf7f8f9,0x858b92,.6);
  lightRig.add(hemi);
  const key=new THREE.DirectionalLight(0xfff4e8,.8);
  key.position.set(-430,720,500);
  key.target.position.set(0,0,0);
  lightRig.add(key,key.target);
  const fill=new THREE.DirectionalLight(0xe7eef8,.16);
  fill.position.set(500,340,-280);
  fill.target.position.set(0,20,0);
  lightRig.add(fill,fill.target);
}
function applyCalibration()`,
  'stable product-light rig'
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

source=source.replace("lightRig.name='yakolak-calibration-light-rig';","lightRig.name='yakolak-v105-mature-neutral-rig';");
source+='\n//# sourceURL=yakolak-v105-mature-neutral-runtime.js\n';

globalThis.__yakolakV105={build:105,style:'mature-neutral-product',lights:3};
const moduleUrl=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
try{
  await import(moduleUrl);
}finally{
  setTimeout(()=>URL.revokeObjectURL(moduleUrl),15000);
}
