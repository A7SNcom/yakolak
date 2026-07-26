const MOBILE_VIEW=innerWidth<=900;

await import('./app-game-v114.js?v=121-piece-edge-base');

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

function applyMobilePieceClarity(){
  const seen=new Set();
  const materials={};
  for(const piece of game.pieces){
    const material=piece?.mesh?.material;
    if(!material||seen.has(material))continue;
    seen.add(material);
    const before={roughness:Number(material.roughness),metalness:Number(material.metalness)};
    const style=policy.pieceStyleFor(before,piece.dir,MOBILE_VIEW)||before;
    if(Number.isFinite(Number(style.roughness)))material.roughness=Number(style.roughness);
    material.needsUpdate=true;
    materials[piece.dir]={
      roughness:material.roughness,
      metalness:material.metalness,
      color:material.color?`#${material.color.getHexString()}`:null
    };
  }
  game.render?.();
  return materials;
}

const materials=applyMobilePieceClarity();
globalThis.__yakolakPieceClarityV121={
  mobile:MOBILE_VIEW,
  apply:applyMobilePieceClarity,
  materials
};
globalThis.__yakolakV121={
  build:121,
  base:120,
  change:'mobile-piece-edge-clarity-without-render-cost'
};
