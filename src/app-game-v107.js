const response=await fetch('./src/app-game-v085.js?v=107-direct-source',{cache:'no-store'});
if(!response.ok)throw new Error(`v107 source load failed: ${response.status}`);
let source=await response.text();

function replaceExact(oldValue,newValue,label){
  const count=source.split(oldValue).length-1;
  if(count!==1)throw new Error(`${label}: expected one match, found ${count}`);
  source=source.replace(oldValue,newValue);
}

function replaceRegex(pattern,replacement,label){
  const flags=[...new Set((pattern.flags.replace(/g/g,'')+'g').split(''))].join('');
  const count=(source.match(new RegExp(pattern.source,flags))||[]).length;
  if(count!==1)throw new Error(`${label}: expected one match, found ${count}`);
  pattern.lastIndex=0;
  source=source.replace(pattern,replacement);
}

replaceExact("import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';\n",'', 'remove RectAreaLight import');
replaceExact("const BUILD='97';","const BUILD='107';",'build number');

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
globalThis.__yakolakPerformance={enabled:true,profile:'v107-balanced-contrast',mobileHighQuality:MOBILE_HIGH_QUALITY,get pixelRatio(){return renderer?.getPixelRatio?.()||performancePixelRatio()}};
`,
  'balanced performance profile'
);

replaceRegex(
  /const DEFAULT_CALIBRATION=\{.*?\n\};\nconst SURFACE_KEYS=/s,
  `const DEFAULT_CALIBRATION={
  scene:{background:'#c1c3c2',exposure:.93,fog:false,fogColor:'#c1c3c2',fogNear:1800,fogFar:6200,fov:43,minDistance:180,maxDistance:1350,minPolar:32,maxPolar:112,markers:false,pixelRatio:1.1,cameraX:520,cameraY:430,cameraZ:520,targetX:0,targetY:0,targetZ:0},
  room:{
    floor:{color:'#b2b5b7',roughness:.9,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    ceiling:{color:'#d0d2d1',roughness:.94,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    backWall:{color:'#c1c3c2',roughness:.94,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    leftWall:{color:'#c1c3c2',roughness:.94,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    rightWall:{color:'#c1c3c2',roughness:.94,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    frontWall:{color:'#c1c3c2',roughness:.94,metalness:0,opacity:0,emissive:'#000000',emissiveIntensity:0,visible:false,wireframe:false},
    trim:{color:'#a9acae',roughness:.88,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    edges:{color:'#929597',opacity:.11,visible:true},
    grid:{color:'#a1a4a6',opacity:.025,visible:true}
  },
  game:{
    board:{color:'#25292e',roughness:.6,metalness:0,emissive:'#000000',emissiveIntensity:0},
    right:{color:'#efece3',roughness:.5,metalness:0,emissive:'#000000',emissiveIntensity:0,marble:false},
    left:{color:'#ad8240',roughness:.43,metalness:0,emissive:'#000000',emissiveIntensity:0},
    front:{color:'#28775f',roughness:.45,metalness:0,emissive:'#000000',emissiveIntensity:0},
    back:{color:'#2f568f',roughness:.43,metalness:0,emissive:'#000000',emissiveIntensity:0}
  },
  table:{color:'#b4b8bc',roughness:.69,metalness:0,normalScale:.12,texture:false,repeatX:1,repeatY:1,opacity:1,emissive:'#000000',emissiveIntensity:0,wireframe:false},
  lights:[],
  play:{dragPieces:true,snapToZones:true,showZones:false,zoneSize:36,zoneColor:'#7694bc',zoneOpacity:.17,dropRadius:42,turnSeconds:18,winnerHighlightPreset:'clean',winnerBlinkCount:5,winnerBlinkDuration:3000,winnerGlowColor:'#ffffff'}
};
const SURFACE_KEYS=`,
  'fixed v107 art direction'
);

replaceRegex(
  /const renderer=new THREE\.WebGLRenderer\(.*?root\.appendChild\(renderer\.domElement\);/s,
  `const renderer=new THREE.WebGLRenderer({antialias:!MOBILE_VIEW||MOBILE_HIGH_QUALITY,alpha:false,powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.setPixelRatio(performancePixelRatio());
renderer.setSize(innerWidth,innerHeight);
renderer.toneMapping=THREE.NeutralToneMapping||THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=.93;
renderer.shadowMap.enabled=false;
root.appendChild(renderer.domElement);`,
  'balanced contrast renderer'
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
const baseMat=makeMat({color:'#25292e',roughness:.6,metalness:0});
const mats={right:makeMat({color:'#efece3',roughness:.5,metalness:0}),left:makeMat({color:'#ad8240',roughness:.43,metalness:0}),front:makeMat({color:'#28775f',roughness:.45,metalness:0}),back:makeMat({color:'#2f568f',roughness:.43,metalness:0})};
`,
  'balanced game materials'
);

replaceRegex(
  /const COLOR_INFO=\{.*?\n\};\nfunction cssRgb/s,
  `const COLOR_INFO={
  right:{label:'الأبيض',short:'أبيض',css:'#efece3',power:.74},
  back:{label:'الأزرق',short:'أزرق',css:'#2f568f',power:.88},
  left:{label:'الذهبي',short:'ذهبي',css:'#ad8240',power:.66},
  front:{label:'الأخضر',short:'أخضر',css:'#28775f',power:.8}
};
function cssRgb`,
  'balanced interface colors'
);

replaceExact(
  "if(state==='bright'||state==='active'||state==='win')base.setHSL(hsl.h,Math.min(1,hsl.s*1.2+.1),Math.min(.96,hsl.l*1.18+.1));",
  "if(state==='bright'||state==='active'||state==='win')base.setHSL(hsl.h,Math.min(.9,hsl.s*1.06),Math.min(.86,hsl.l*1.05));",
  'restrained active colors'
);

replaceRegex(
  /function buildLighting\(\)\{.*?\n\}\nfunction applyCalibration\(\)/s,
  `function buildLighting(){
  while(lightRig.children.length){const child=lightRig.children.pop();disposeObject(child)}
  dragLightHandles=[];
  const hemi=new THREE.HemisphereLight(0xf8f8f6,0x9b9fa2,.46);
  lightRig.add(hemi);
  const key=new THREE.DirectionalLight(0xfff7ed,.7);
  key.position.set(-80,830,625);
  key.target.position.set(0,0,0);
  lightRig.add(key,key.target);
  const fill=new THREE.DirectionalLight(0xedf1f5,.07);
  fill.position.set(260,360,-200);
  fill.target.position.set(0,15,0);
  lightRig.add(fill,fill.target);
}
function applyCalibration()`,
  'balanced three-light rig'
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

replaceExact("lightRig.name='yakolak-calibration-light-rig';","lightRig.name='yakolak-v107-balanced-contrast-rig';",'light rig name');
source+='\n//# sourceURL=yakolak-v107-balanced-contrast-runtime.js\n';

globalThis.__yakolakV107={build:107,style:'balanced-contrast',lights:3,room:'unlit-uniform'};
const moduleUrl=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
try{
  await import(moduleUrl);
}finally{
  setTimeout(()=>URL.revokeObjectURL(moduleUrl),15000);
}
