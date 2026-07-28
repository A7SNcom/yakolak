import {resolvePreviewRequest} from './developer-d4-registry.js?v=D4-preview-contract';

const request=resolvePreviewRequest(location.search,document.baseURI);
if(!request||request.definition.kind!=='element'||request.previewMode!=='variant')throw new Error(`Invalid D4 element variant: ${location.search}`);
const {definition,variant}=request;
const elementId=definition.id;
const variantId=variant.id;

await import('./developer-scene-d1.js?v=D4-element-variant-base');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function gameReady(){for(let index=0;index<500;index++){const game=globalThis.__yakolakGame;if(game?.renderer&&game?.pieces?.length&&document.body.dataset.sceneReady==='true')return game;await wait(20)}throw new Error(`D4 element variant did not load ${elementId}`)}
const game=await gameReady();
if(elementId==='base-small'){
  for(const color of ['front','back','left','right']){const mesh=game.meshes?.[`3-${color}`];if(mesh)mesh.visible=false}
  const mesh=game.meshes?.[`3-${variantId}`];if(!mesh)throw new Error(`D4 base variant missing: ${variantId}`);mesh.visible=true;mesh.position.set(0,0,0);mesh.rotation.set(-Math.PI/2,0,0);
}else{
  const type={'stone-large':'l','stone-medium':'m','stone-small':'s'}[elementId];if(!type)throw new Error(`Unknown D4 element variant ${elementId}`);
  game.pieces.forEach(piece=>piece.mesh.visible=false);const piece=game.pieces.find(item=>item.type===type&&item.dir===variantId);if(!piece)throw new Error(`D4 stone variant missing: ${elementId}/${variantId}`);piece.mesh.visible=true;piece.mesh.position.set(0,0,0);piece.mesh.rotation.set(-Math.PI/2,0,0);
}
game.render?.();
Object.assign(document.body.dataset,{developerVariant:variantId,developerEntityKind:'element',developerEntity:elementId});
globalThis.__yakolakDeveloperD4Variant={build:'D4',elementId,variant:variantId};
parent.postMessage({type:'yakolak-developer-scene-ready',entityKind:'element',entityId:elementId,element:elementId,variant:variantId,build:'D4',details:{mode:'element-variant',composition:elementId,color:variantId}},'*');
