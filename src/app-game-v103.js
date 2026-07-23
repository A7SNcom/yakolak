const response=await fetch('./src/app-game-v102.js?v=103-source',{cache:'no-store'});
if(!response.ok)throw new Error(`v103 source load failed: ${response.status}`);
let patch=await response.text();

function replaceOne(from,to,label){
  const count=patch.split(from).length-1;
  if(count!==1)throw new Error(`${label}: expected one match, found ${count}`);
  patch=patch.replace(from,to);
}

replaceOne(`"const BUILD='102';",'build number'`,`"const BUILD='103';",'build number'`,'build');
replaceOne("profile:'v102-balanced-studio'","profile:'v103-motion-optimized'",'profile');
replaceOne(
`  if(!MOBILE_VIEW)return Math.min(dpr,1.12);
  if(MOBILE_HIGH_QUALITY)return Math.min(dpr,1.35);
  if(DEVICE_MEMORY>=4||CPU_CORES>=6)return Math.min(dpr,1.2);
  return Math.min(dpr,1.0);`,
`  if(!MOBILE_VIEW)return Math.min(dpr,1.0);
  if(MOBILE_HIGH_QUALITY)return Math.min(dpr,1.15);
  if(DEVICE_MEMORY>=4||CPU_CORES>=6)return Math.min(dpr,1.05);
  return Math.min(dpr,.9);`,
'pixel ratio tiers');
replaceOne('scene.environmentIntensity=MOBILE_VIEW?.5:.58;','scene.environmentIntensity=MOBILE_VIEW?.38:.45;','environment intensity');
replaceOne('const key=new THREE.RectAreaLight(0xffedd7,3.65,720,460);','const key=new THREE.DirectionalLight(0xffedd7,1.05);','cheap key light');
replaceOne('const fill=new THREE.RectAreaLight(0xdce9fb,1.15,520,360);','const fill=new THREE.AmbientLight(0xdce9fb,.08);','cheap fill light');
replaceOne('const rim=new THREE.DirectionalLight(0xe3ebfa,.42);','const rim=new THREE.DirectionalLight(0xe3ebfa,.28);','lighter rim');
replaceOne("sourceURL=yakolak-v102-runtime.js","sourceURL=yakolak-v103-runtime.js",'source url');
replaceOne("globalThis.__yakolakV102={build:102,style:'balanced-studio-art-direction'};","globalThis.__yakolakV103={build:103,style:'motion-optimized-studio'};",'diagnostic');

const marker="const moduleUrl=URL.createObjectURL(new Blob([patch],{type:'text/javascript'}));";
const renderFrom='function render(){keepInsideRoom();renderer.render(scene,camera)}';
const renderTo=`let lastRenderAt=0,pendingRender=0;
function drawSceneNow(){
  pendingRender=0;
  keepInsideRoom();
  lastRenderAt=performance.now();
  renderer.render(scene,camera);
}
function render(){
  const now=performance.now();
  const minGap=MOBILE_VIEW?20:14;
  const wait=minGap-(now-lastRenderAt);
  if(wait<=0){drawSceneNow();return}
  if(!pendingRender)pendingRender=setTimeout(drawSceneNow,Math.max(0,wait));
}`;
const rendererFrom="const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});";
const rendererTo="const renderer=new THREE.WebGLRenderer({antialias:!MOBILE_VIEW||MOBILE_HIGH_QUALITY,alpha:false,powerPreference:'high-performance'});";
const extraOps=[
  `replaceOne(${JSON.stringify('  lightRig.add(fill);')},${JSON.stringify('  // v103 omits the extra fill light')},'remove fill light');`,
  `replaceOne(${JSON.stringify('  lightRig.add(shadowKey,shadowKey.target);')},${JSON.stringify('  // v103 omits the extra directional light')},'remove extra directional');`,
  `replaceOne(${JSON.stringify(rendererFrom)},${JSON.stringify(rendererTo)},'adaptive antialias');`,
  `replaceOne(${JSON.stringify(renderFrom)},${JSON.stringify(renderTo)},'coalesced rendering');`
].join('\n');
replaceOne(marker,extraOps+'\n'+marker,'inject motion optimizations');

const moduleUrl=URL.createObjectURL(new Blob([patch],{type:'text/javascript'}));
try{
  await import(moduleUrl);
}finally{
  setTimeout(()=>URL.revokeObjectURL(moduleUrl),15000);
}
