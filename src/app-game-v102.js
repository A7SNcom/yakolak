const patchResponse=await fetch('./src/app-game-v101.js?v=102-source',{cache:'no-store'});
if(!patchResponse.ok)throw new Error(`v102 source load failed: ${patchResponse.status}`);
let patch=await patchResponse.text();

function replaceOne(from,to,label){
  const count=patch.split(from).length-1;
  if(count!==1)throw new Error(`${label}: expected one match, found ${count}`);
  patch=patch.replace(from,to);
}
function replaceAll(from,to,label,expected){
  const count=patch.split(from).length-1;
  if(expected!=null&&count!==expected)throw new Error(`${label}: expected ${expected} matches, found ${count}`);
  if(!count)throw new Error(`${label}: no matches`);
  patch=patch.split(from).join(to);
}

replaceOne(`"const BUILD='101';",'build number'`,`"const BUILD='102';",'build number'`,'build');
replaceOne('const PERFORMANCE_MODE=false;','const PERFORMANCE_MODE=true;','static performance mode');
replaceOne(
`  if(!MOBILE_VIEW)return Math.min(dpr,1.45);
  if(MOBILE_HIGH_QUALITY)return Math.min(dpr,1.75);
  if(DEVICE_MEMORY>=4||CPU_CORES>=6)return Math.min(dpr,1.55);
  return Math.min(dpr,1.3);`,
`  if(!MOBILE_VIEW)return Math.min(dpr,1.12);
  if(MOBILE_HIGH_QUALITY)return Math.min(dpr,1.35);
  if(DEVICE_MEMORY>=4||CPU_CORES>=6)return Math.min(dpr,1.2);
  return Math.min(dpr,1.0);`,
'pixel ratio tiers');
replaceOne("profile:'v101-quality-first'","profile:'v102-balanced-studio'",'profile');

replaceOne("scene:{background:'#d4d0c8',exposure:1.0","scene:{background:'#96938d',exposure:.82",'scene exposure');
replaceOne("fogColor:'#d4d0c8'","fogColor:'#96938d'",'fog color');
replaceOne("pixelRatio:1.55","pixelRatio:1.2",'calibration pixel ratio');
replaceOne("floor:{color:'#b9b2a7'","floor:{color:'#716e68'",'floor');
replaceOne("ceiling:{color:'#f3f0e9'","ceiling:{color:'#b6b1a8'",'ceiling');
replaceOne("backWall:{color:'#e7e2d9'","backWall:{color:'#aaa59c'",'back wall');
replaceOne("leftWall:{color:'#e5e0d7'","leftWall:{color:'#a39f97'",'left wall');
replaceOne("rightWall:{color:'#ebe7df'","rightWall:{color:'#b0aba2'",'right wall');
replaceOne("frontWall:{color:'#f2eee7'","frontWall:{color:'#bbb6ad'",'front wall');
replaceOne("opacity:.06","opacity:.035",'front opacity');
replaceOne("trim:{color:'#aaa39a'","trim:{color:'#807c75'",'trim');
replaceOne("edges:{color:'#817b73',opacity:.42","edges:{color:'#5d5954',opacity:.34",'edges');
replaceOne("grid:{color:'#9f988e',opacity:.16","grid:{color:'#716c65',opacity:.1",'grid');
replaceOne("board:{color:'#252930'","board:{color:'#20242b'",'board calibration');
replaceOne("const baseMat=makeMat({color:'#252930'","const baseMat=makeMat({color:'#20242b'",'board material');

replaceOne('renderer.toneMappingExposure=1.0;','renderer.toneMappingExposure=.82;','renderer exposure');
replaceOne('renderer.shadowMap.enabled=true;','renderer.shadowMap.enabled=false;','disable shadow map');
replaceAll('scene.environmentIntensity=MOBILE_VIEW?.8:.9;','scene.environmentIntensity=MOBILE_VIEW?.5:.58;','environment intensity',2);

replaceOne('const hemi=new THREE.HemisphereLight(0xf8fbff,0x5e626a,.34);','const hemi=new THREE.HemisphereLight(0xf4f7fb,0x4c4e53,.22);','hemisphere');
replaceOne('const key=new THREE.RectAreaLight(0xfff0dc,6.4,720,460);','const key=new THREE.RectAreaLight(0xffedd7,3.65,720,460);','key light');
replaceOne('const fill=new THREE.RectAreaLight(0xdceaff,2.35,520,360);','const fill=new THREE.RectAreaLight(0xdce9fb,1.15,520,360);','fill light');
replaceOne('const rim=new THREE.DirectionalLight(0xe4edff,.62);','const rim=new THREE.DirectionalLight(0xe3ebfa,.42);','rim light');
replaceOne('const shadowKey=new THREE.DirectionalLight(0xfff7e9,1.85);','const shadowKey=new THREE.DirectionalLight(0xfff2df,.72);','soft directional');
replaceOne('shadowKey.castShadow=true;','shadowKey.castShadow=false;','disable caster');
replaceOne(
'"function set(o){if(o?.isMesh){o.castShadow=true;o.receiveShadow=true}return o}",',
'"function set(o){if(o?.isMesh){o.castShadow=false;o.receiveShadow=false}return o}",',
'disable mesh shadows');

replaceOne("lightRig.name='yakolak-v101-studio-light-rig'","lightRig.name='yakolak-v102-balanced-studio-light-rig'",'light rig name');
replaceOne("sourceURL=yakolak-v101-runtime.js","sourceURL=yakolak-v102-runtime.js",'source url');
replaceOne("globalThis.__yakolakV101={build:101,style:'fixed-studio-art-direction'};","globalThis.__yakolakV102={build:102,style:'balanced-studio-art-direction'};",'diagnostic');

const moduleUrl=URL.createObjectURL(new Blob([patch],{type:'text/javascript'}));
try{
  await import(moduleUrl);
}finally{
  setTimeout(()=>URL.revokeObjectURL(moduleUrl),15000);
}
