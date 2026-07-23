const response=await fetch('./src/app-game-v085.js?v=110-direct-source',{cache:'no-store'});
if(!response.ok)throw new Error(`v110 source load failed: ${response.status}`);
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
replaceExact("const BUILD='97';","const BUILD='110';",'build number');
replaceExact(
  "const camera=new THREE.PerspectiveCamera(calibration.scene.fov,innerWidth/innerHeight,.1,12000);",
  "const camera=new THREE.PerspectiveCamera(calibration.scene.fov,innerWidth/innerHeight,.1,12000);\nscene.add(camera);",
  'attach camera light carrier'
);

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
globalThis.__yakolakPerformance={enabled:true,profile:'v110-readable-charcoal',mobileHighQuality:MOBILE_HIGH_QUALITY,get pixelRatio(){return renderer?.getPixelRatio?.()||performancePixelRatio()}};
`,
  'preserve performance profile'
);

replaceRegex(
  /const DEFAULT_CALIBRATION=\{.*?\n\};\nconst SURFACE_KEYS=/s,
  `const DEFAULT_CALIBRATION={
  scene:{background:'#c1c3c2',exposure:.98,fog:false,fogColor:'#c1c3c2',fogNear:1800,fogFar:6200,fov:43,minDistance:180,maxDistance:1350,minPolar:32,maxPolar:112,markers:false,pixelRatio:1.1,cameraX:520,cameraY:430,cameraZ:520,targetX:0,targetY:0,targetZ:0},
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
    board:{color:'#4a5562',roughness:.48,metalness:0,emissive:'#25313d',emissiveIntensity:.2},
    right:{color:'#f1eee6',roughness:.45,metalness:0,emissive:'#2f2c25',emissiveIntensity:.08,marble:false},
    left:{color:'#b78a44',roughness:.4,metalness:0,emissive:'#2c1d08',emissiveIntensity:.11},
    front:{color:'#2f856a',roughness:.42,metalness:0,emissive:'#08251b',emissiveIntensity:.1},
    back:{color:'#3769a5',roughness:.4,metalness:0,emissive:'#0b1b31',emissiveIntensity:.11}
  },
  table:{color:'#aeb2b6',roughness:.71,metalness:0,normalScale:.12,texture:false,repeatX:1,repeatY:1,opacity:1,emissive:'#000000',emissiveIntensity:0,wireframe:false},
  lights:[],
  play:{dragPieces:true,snapToZones:true,showZones:false,zoneSize:36,zoneColor:'#7897c0',zoneOpacity:.18,dropRadius:42,turnSeconds:18,winnerHighlightPreset:'clean',winnerBlinkCount:5,winnerBlinkDuration:3000,winnerGlowColor:'#ffffff'}
};
const SURFACE_KEYS=`,
  'readable charcoal art direction'
);

replaceRegex(
  /const renderer=new THREE\.WebGLRenderer\(.*?root\.appendChild\(renderer\.domElement\);/s,
  `const renderer=new THREE.WebGLRenderer({antialias:!MOBILE_VIEW||MOBILE_HIGH_QUALITY,alpha:false,powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.setPixelRatio(performancePixelRatio());
renderer.setSize(innerWidth,innerHeight);
renderer.toneMapping=THREE.NeutralToneMapping||THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=.98;
renderer.shadowMap.enabled=false;
root.appendChild(renderer.domElement);`,
  'readable charcoal renderer'
);

replaceExact('RectAreaLightUniformsLib.init();\n','', 'remove RectAreaLight initialization');

replaceExact(
  "const mat=(color,opt={})=>new THREE.MeshStandardMaterial({color,roughness:opt.roughness??.94,metalness:0,side:THREE.DoubleSide,transparent:!!opt.transparent,opacity:opt.opacity??1,depthWrite:opt.depthWrite??true});",
  "const mat=(color,opt={})=>new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:!!opt.transparent,opacity:opt.opacity??1,depthWrite:opt.depthWrite??true,toneMapped:false});",
  'preserve unlit room'
);

replaceRegex(
  /const makeMat=p=>new THREE\.MeshStandardMaterial\(p\);\nconst baseMat=[^\n]+\nconst mats=[^\n]+\n/,
  `const makeMat=p=>new THREE.MeshStandardMaterial(p);
const baseMat=makeMat({color:'#4a5562',roughness:.48,metalness:0,emissive:'#25313d',emissiveIntensity:.2});
const mats={right:makeMat({color:'#f1eee6',roughness:.45,metalness:0,emissive:'#2f2c25',emissiveIntensity:.08}),left:makeMat({color:'#b78a44',roughness:.4,metalness:0,emissive:'#2c1d08',emissiveIntensity:.11}),front:makeMat({color:'#2f856a',roughness:.42,metalness:0,emissive:'#08251b',emissiveIntensity:.1}),back:makeMat({color:'#3769a5',roughness:.4,metalness:0,emissive:'#0b1b31',emissiveIntensity:.11})};
`,
  'readable charcoal materials'
);

replaceRegex(
  /const COLOR_INFO=\{.*?\n\};\nfunction cssRgb/s,
  `const COLOR_INFO={
  right:{label:'الأبيض',short:'أبيض',css:'#f1eee6',power:.74},
  back:{label:'الأزرق',short:'أزرق',css:'#3769a5',power:.88},
  left:{label:'الذهبي',short:'ذهبي',css:'#b78a44',power:.66},
  front:{label:'الأخضر',short:'أخضر',css:'#2f856a',power:.8}
};
function cssRgb`,
  'preserve interface colors'
);

replaceExact(
  "if(state==='bright'||state==='active'||state==='win')base.setHSL(hsl.h,Math.min(1,hsl.s*1.2+.1),Math.min(.96,hsl.l*1.18+.1));",
  "if(state==='bright'||state==='active'||state==='win')base.setHSL(hsl.h,Math.min(.92,hsl.s*1.05),Math.min(.88,hsl.l*1.04));",
  'restrained active colors'
);

replaceRegex(
  /function buildLighting\(\)\{.*?\n\}\nfunction applyCalibration\(\)/s,
  `function buildLighting(){
  while(lightRig.children.length){const child=lightRig.children.pop();disposeObject(child)}
  dragLightHandles=[];
  const oldViewer=camera.getObjectByName('yakolak-v110-viewer-light');
  const oldViewerTarget=camera.getObjectByName('yakolak-v110-viewer-target');
  if(oldViewer)camera.remove(oldViewer);
  if(oldViewerTarget)camera.remove(oldViewerTarget);
  const hemi=new THREE.HemisphereLight(0xffffff,0xaeb4ba,.62);
  lightRig.add(hemi);
  const key=new THREE.DirectionalLight(0xfff6e8,.9);
  key.position.set(-120,780,540);
  key.target.position.set(0,25,0);
  lightRig.add(key,key.target);
  const viewer=new THREE.DirectionalLight(0xfffdf8,.7);
  viewer.name='yakolak-v110-viewer-light';
  viewer.target.name='yakolak-v110-viewer-target';
  viewer.position.set(0,130,220);
  viewer.target.position.set(0,-40,-850);
  camera.add(viewer,viewer.target);
}
function applyCalibration()`,
  'preserve clear three-light playfield rig'
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

replaceExact("lightRig.name='yakolak-calibration-light-rig';","lightRig.name='yakolak-v110-readable-charcoal-rig';",'light rig name');
source+='\n//# sourceURL=yakolak-v110-readable-charcoal-runtime.js\n';

globalThis.__yakolakV110={build:110,style:'readable-charcoal',lights:3,room:'unlit-uniform'};
const moduleUrl=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
try{
  await import(moduleUrl);
}finally{
  setTimeout(()=>URL.revokeObjectURL(moduleUrl),15000);
}
