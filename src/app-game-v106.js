const response=await fetch('./src/app-game-v085.js?v=106-direct-source',{cache:'no-store'});
if(!response.ok)throw new Error(`v106 source load failed: ${response.status}`);
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
replaceExact("const BUILD='97';","const BUILD='106';",'build number');

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
globalThis.__yakolakPerformance={enabled:true,profile:'v106-unified-studio',mobileHighQuality:MOBILE_HIGH_QUALITY,get pixelRatio(){return renderer?.getPixelRatio?.()||performancePixelRatio()}};
`,
  'balanced performance profile'
);

replaceRegex(
  /const DEFAULT_CALIBRATION=\{.*?\n\};\nconst SURFACE_KEYS=/s,
  `const DEFAULT_CALIBRATION={
  scene:{background:'#c9cac9',exposure:.9,fog:false,fogColor:'#c9cac9',fogNear:1800,fogFar:6200,fov:43,minDistance:180,maxDistance:1350,minPolar:32,maxPolar:112,markers:false,pixelRatio:1.1,cameraX:520,cameraY:430,cameraZ:520,targetX:0,targetY:0,targetZ:0},
  room:{
    floor:{color:'#b9bbbd',roughness:.9,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    ceiling:{color:'#d5d6d5',roughness:.94,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    backWall:{color:'#c9cac9',roughness:.94,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    leftWall:{color:'#c9cac9',roughness:.94,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    rightWall:{color:'#c9cac9',roughness:.94,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    frontWall:{color:'#c9cac9',roughness:.94,metalness:0,opacity:0,emissive:'#000000',emissiveIntensity:0,visible:false,wireframe:false},
    trim:{color:'#adb0b2',roughness:.88,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    edges:{color:'#96999b',opacity:.11,visible:true},
    grid:{color:'#a6a9ab',opacity:.025,visible:true}
  },
  game:{
    board:{color:'#292d32',roughness:.6,metalness:0,emissive:'#000000',emissiveIntensity:0},
    right:{color:'#f0ede4',roughness:.48,metalness:0,emissive:'#000000',emissiveIntensity:0,marble:false},
    left:{color:'#b2863f',roughness:.4,metalness:0,emissive:'#000000',emissiveIntensity:0},
    front:{color:'#2a7d62',roughness:.43,metalness:0,emissive:'#000000',emissiveIntensity:0},
    back:{color:'#315a95',roughness:.41,metalness:0,emissive:'#000000',emissiveIntensity:0}
  },
  table:{color:'#bec1c4',roughness:.69,metalness:0,normalScale:.12,texture:false,repeatX:1,repeatY:1,opacity:1,emissive:'#000000',emissiveIntensity:0,wireframe:false},
  lights:[],
  play:{dragPieces:true,snapToZones:true,showZones:false,zoneSize:36,zoneColor:'#7694bc',zoneOpacity:.17,dropRadius:42,turnSeconds:18,winnerHighlightPreset:'clean',winnerBlinkCount:5,winnerBlinkDuration:3000,winnerGlowColor:'#ffffff'}
};
const SURFACE_KEYS=`,
  'fixed v106 art direction'
);

replaceRegex(
  /const renderer=new THREE\.WebGLRenderer\(.*?root\.appendChild\(renderer\.domElement\);/s,
  `const renderer=new THREE.WebGLRenderer({antialias:!MOBILE_VIEW||MOBILE_HIGH_QUALITY,alpha:false,powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.setPixelRatio(performancePixelRatio());
renderer.setSize(innerWidth,innerHeight);
renderer.toneMapping=THREE.NeutralToneMapping||THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=.9;
renderer.shadowMap.enabled=false;
root.appendChild(renderer.domElement);`,
  'unified studio renderer'
);

replaceExact('RectAreaLightUniformsLib.init();\n','', 'remove RectAreaLight initialization');

replaceExact(
  "const mat=(color,opt={})=>new THREE.MeshStandardMaterial({color,roughness:opt.roughness??.94,metalness:0,side:THREE.DoubleSide,transparent:!!opt.transparent,opacity:opt.opacity??1,depthWrite:opt.depthWrite??true});",
  "const mat=(color,opt={})=>new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:!!opt.transparent,opacity:opt.opacity??1,depthWrite:opt.depthWrite??true,toneMapped:false});",
  'unlit uniform room backdrop'
);

replaceRegex(
  /const makeMat=p=>new THREE\.MeshStandardMaterial\(p\);\nconst baseMat=[^\n]+\nconst mats=[^\n]+\n/,
  `const makeMat=p=>new THREE.MeshStandardMaterial(p);
const baseMat=makeMat({color:'#292d32',roughness:.6,metalness:0});
const mats={right:makeMat({color:'#f0ede4',roughness:.48,metalness:0}),left:makeMat({color:'#b2863f',roughness:.4,metalness:0}),front:makeMat({color:'#2a7d62',roughness:.43,metalness:0}),back:makeMat({color:'#315a95',roughness:.41,metalness:0})};
`,
  'refined game materials'
);

replaceRegex(
  /const COLOR_INFO=\{.*?\n\};\nfunction cssRgb/s,
  `const COLOR_INFO={
  right:{label:'الأبيض',short:'أبيض',css:'#f0ede4',power:.74},
  back:{label:'الأزرق',short:'أزرق',css:'#315a95',power:.88},
  left:{label:'الذهبي',short:'ذهبي',css:'#b2863f',power:.66},
  front:{label:'الأخضر',short:'أخضر',css:'#2a7d62',power:.8}
};
function cssRgb`,
  'unified interface colors'
);

replaceExact(
  "if(state==='bright'||state==='active'||state==='win')base.setHSL(hsl.h,Math.min(1,hsl.s*1.2+.1),Math.min(.96,hsl.l*1.18+.1));",
  "if(state==='bright'||state==='active'||state==='win')base.setHSL(hsl.h,Math.min(.9,hsl.s*1.08+.03),Math.min(.86,hsl.l*1.1+.05));",
  'restrained active colors'
);

replaceRegex(
  /function buildLighting\(\)\{.*?\n\}\nfunction applyCalibration\(\)/s,
  `function buildLighting(){
  while(lightRig.children.length){const child=lightRig.children.pop();disposeObject(child)}
  dragLightHandles=[];
  const hemi=new THREE.HemisphereLight(0xf8f8f6,0x9fa3a6,.54);
  lightRig.add(hemi);
  const key=new THREE.DirectionalLight(0xfff6eb,.62);
  key.position.set(-100,820,620);
  key.target.position.set(0,0,0);
  lightRig.add(key,key.target);
  const fill=new THREE.DirectionalLight(0xeaf0f6,.1);
  fill.position.set(260,360,-200);
  fill.target.position.set(0,15,0);
  lightRig.add(fill,fill.target);
}
function applyCalibration()`,
  'central neutral studio rig'
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

source=source.replace("lightRig.name='yakolak-calibration-light-rig';","lightRig.name='yakolak-v106-unified-studio-rig';");
source+='\n//# sourceURL=yakolak-v106-unified-studio-runtime.js\n';

globalThis.__yakolakV106={build:106,style:'unified-neutral-studio',lights:3,room:'unlit-uniform'};
const moduleUrl=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
try{
  await import(moduleUrl);
}finally{
  setTimeout(()=>URL.revokeObjectURL(moduleUrl),15000);
}
