const MOBILE_VIEW=innerWidth<=900;

const wrapperResponse=await fetch('./src/app-game-v114.js?v=121-piece-state-wrapper',{cache:'no-store'});
if(!wrapperResponse.ok)throw new Error(`v121 wrapper load failed: ${wrapperResponse.status}`);
let wrapper=await wrapperResponse.text();

const pieceStateReplacement=`function applyMobilePieceClarityMaterial(mat,color,state='normal'){
  if(!mat||state==='win')return mat;
  const policy=globalThis.__yakolakMobilePieceClarityV121;
  const style=policy?.pieceStyleFor?.({
    roughness:Number(mat.roughness),
    metalness:Number(mat.metalness),
    emissiveIntensity:Number(mat.emissiveIntensity||0)
  },color,MOBILE_VIEW,state);
  if(Number.isFinite(Number(style?.emissiveIntensity)))mat.emissiveIntensity=Number(style.emissiveIntensity);
  mat.needsUpdate=true;
  return mat;
}
function pieceStateMaterial(color,state='normal'){
  const base=mats[color]||mats.right;
  if(state==='normal')return applyMobilePieceClarityMaterial(base,color,state);
  const mat=base.clone();
  mat.color.copy(tonedColor(color,state));
  if(mat.emissive){
    const preset=winHighlightPreset();
    mat.emissive.copy(state==='muted'?new THREE.Color(0x000000):tonedColor(color,'bright'));
    mat.emissiveIntensity=state==='win'?preset.emissive:state==='active'?.32:0;
  }
  return applyMobilePieceClarityMaterial(solidMaterial(mat),color,state);
}
function setPieceVisual`;

const releasePatchItems=[
  'replaceRegex(',
  "  /function pieceStateMaterial\\(color,state='normal'\\)\\{.*?\\n\\}\\nfunction setPieceVisual/s,",
  `  \`${pieceStateReplacement}\`,`,
  "  'apply v121 mobile clarity to active piece state'",
  ');'
];
const releasePatchTarget="\n].join('\\n');";
const releasePatchInsertion=',\n'+releasePatchItems.map(item=>`  ${JSON.stringify(item)}`).join(',\n')+releasePatchTarget;
if(wrapper.split(releasePatchTarget).length-1!==1)throw new Error('v121 release patch insertion target missing');
wrapper=wrapper.replace(releasePatchTarget,releasePatchInsertion);

const clientBefore="await import('./online-client-v114.js?v=120-mobile-board-separation-client');";
const clientUrl=new URL('./src/online-client-v114.js?v=121-piece-edge-client',location.href).href;
if(!wrapper.includes(clientBefore))throw new Error('v121 online client import target missing');
wrapper=wrapper.replace(clientBefore,`await import(${JSON.stringify(clientUrl)});`);

const wrapperUrl=URL.createObjectURL(new Blob([wrapper],{type:'text/javascript'}));
try{
  await import(wrapperUrl);
}finally{
  setTimeout(()=>URL.revokeObjectURL(wrapperUrl),15000);
}

function waitForGame(timeoutMs=55000){
  const started=performance.now();
  return new Promise((resolve,reject)=>{
    const check=()=>{
      const game=globalThis.__yakolakGame;
      if(document.body.classList.contains('yakolak-ready')&&game?.pieces?.length&&game?.renderer)return resolve(game);
      if(performance.now()-started>=timeoutMs)return reject(new Error('v121 game bridge timeout'));
      setTimeout(check,25);
    };
    check();
  });
}

const game=await waitForGame();
const policy=globalThis.__yakolakMobilePieceClarityV121;
if(!policy?.pieceStyleFor)throw new Error('v121 piece clarity policy missing');

function collectPieceMaterials(){
  const seen=new Set();
  const materials={};
  for(const piece of game.pieces){
    const material=piece?.mesh?.material;
    if(!material||seen.has(material))continue;
    seen.add(material);
    const before={
      roughness:Number(material.roughness),
      metalness:Number(material.metalness),
      emissiveIntensity:Number(material.emissiveIntensity||0)
    };
    const style=policy.pieceStyleFor(before,piece.dir,MOBILE_VIEW,'normal')||before;
    if(Number.isFinite(Number(style.emissiveIntensity)))material.emissiveIntensity=Number(style.emissiveIntensity);
    material.needsUpdate=true;
    materials[piece.dir]={
      roughness:material.roughness,
      metalness:material.metalness,
      emissive:material.emissive?`#${material.emissive.getHexString()}`:null,
      emissiveIntensity:Number(material.emissiveIntensity||0),
      color:material.color?`#${material.color.getHexString()}`:null
    };
  }
  game.render?.();
  return materials;
}

const materials=collectPieceMaterials();
globalThis.__yakolakPieceClarityV121={
  mobile:MOBILE_VIEW,
  collect:collectPieceMaterials,
  materials
};
globalThis.__yakolakV121={
  build:121,
  base:120,
  change:'mobile-active-piece-emissive-shaping-without-render-cost'
};
