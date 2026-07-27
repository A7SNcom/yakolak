console.info('[Yakolak] DEVELOPER D1 SCENE RUNNER LOADED');

const params=new URLSearchParams(location.search);
const sceneId=params.get('scene')||'loading-star';
const preview=params.get('preview')==='1';
const loader=document.getElementById('sceneLoading');
const loaderProjection=loader?.querySelector('.loaderProjection');
const status=document.getElementById('sceneStatus');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const rad=value=>value*Math.PI/180;
const realRemoveLoader=()=>{if(loader?.parentNode)loader.parentNode.removeChild(loader)};
let replayTimer=0;

const HIDDEN_UI=['yakolakGameHud','yakolakGameScore','yakolakGameSetup','yakolakTools','yakolakCalibrationPanel','yakolakOnlineDialog','yakolakTutorialDialog','yakolakOnlineEntry','yakolakHowTo','yakolakEntry','yakolakFloatingSettings','yakolakEntrySettings'];

document.body.dataset.preview=preview?'1':'0';
document.body.dataset.developerScene=sceneId;
if(status)status.textContent=`D1 · ${sceneId}`;

globalThis.__yakolakLoading={set(_value,text){if(status&&text)status.textContent=`D1 · ${text}`}};
globalThis.__yakolakEntryLoader={
  anchor(x,y){
    if(!loaderProjection?.isConnected)return;
    loaderProjection.style.position='absolute';
    loaderProjection.style.left=`${Math.round(x-48)}px`;
    loaderProjection.style.top=`${Math.round(y-66)}px`;
  },
  handoff(){
    if(!loader?.isConnected)return;
    loader.style.background='transparent';
    loader.style.pointerEvents='none';
  },
  finish(){realRemoveLoader()}
};

function markReady(details={}){
  Object.assign(document.body.dataset,{sceneReady:'true',...details});
  globalThis.__yakolakDeveloperD1Scene={build:'D1',sceneId,preview,...details};
  parent.postMessage({type:'yakolak-developer-scene-ready',scene:sceneId,build:'D1',details},'*');
}

async function waitForGame(){
  for(let index=0;index<800;index++){
    const game=globalThis.__yakolakGame;
    if(game?.THREE&&game?.renderer&&game?.camera&&game?.gameGroup?.parent&&game?.meshes&&document.body.classList.contains('yakolak-ready'))return game;
    await wait(25);
  }
  throw new Error(`Developer D1 could not load ${sceneId}`);
}

function renderGame(game){
  const scene=game.gameGroup.parent;
  if(typeof game.render==='function')game.render();
  else game.renderer.render(scene,game.camera);
}

function solid(object,color){
  if(!object)return;
  object.visible=true;
  const materials=Array.isArray(object.material)?object.material:[object.material];
  materials.filter(Boolean).forEach(material=>{
    material.color?.set?.(color);
    material.emissive?.set?.('#000000');
    if('emissiveIntensity' in material)material.emissiveIntensity=0;
    material.opacity=1;
    material.transparent=false;
    material.depthWrite=true;
    material.needsUpdate=true;
  });
}

function hideDeveloperNoise(game){
  HIDDEN_UI.forEach(id=>{
    const element=document.getElementById(id);
    if(element){element.hidden=true;element.style.display='none';element.setAttribute('aria-hidden','true')}
  });
  if(game.setupGroup){game.setupGroup.visible=false;game.setupGroup.children.forEach(child=>child.visible=false)}
  if(game.gameHighlightGroup)game.gameHighlightGroup.visible=false;
  game.clearHighlights?.();
  game.syncZoneMarkers?.(false);
  if(preview)game.renderer.domElement.style.pointerEvents='none';
}

function prepareRoom(game){
  const scene=game.gameGroup.parent;
  scene.background?.set?.('#ffffff');
  solid(scene.getObjectByName('room-back-wall'),'#ffffff');
  solid(scene.getObjectByName('room-left-wall'),'#ffffff');
  solid(scene.getObjectByName('room-right-wall'),'#ffffff');
  solid(scene.getObjectByName('room-ceiling'),'#ffffff');
  solid(scene.getObjectByName('room-floor'),'#deddd7');
  const front=scene.getObjectByName('room-front-wall');
  if(front)front.visible=false;
  const room=scene.getObjectByName('yakolak-soft-empty-room');
  room?.traverse?.(object=>{
    if(object.isLine)object.visible=false;
    if(/trim|grid|edge/i.test(object.name||''))object.visible=false;
  });
  hideDeveloperNoise(game);
  return scene;
}

function setCamera(game,position,target,fov=44){
  game.camera.position.set(...position);
  game.camera.fov=fov;
  game.camera.updateProjectionMatrix();
  game.camera.lookAt(new game.THREE.Vector3(...target));
  renderGame(game);
}

function hideGameChildren(game){
  game.gameGroup.traverse?.(object=>{if(object!==game.gameGroup)object.visible=false});
}

function configureEmptyTable(game){
  prepareRoom(game);
  game.gameGroup.visible=false;
  const portrait=innerHeight>innerWidth*1.18;
  setCamera(game,portrait?[720,310,860]:[860,300,920],[0,-120,0],portrait?50:43);
  return{mode:'static',composition:'empty-table'};
}

function applyMeshPose(mesh,position,rotation){
  if(!mesh)return false;
  mesh.visible=true;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation.map(rad));
  return true;
}

function configureBoardBases(game){
  prepareRoom(game);
  hideGameChildren(game);
  game.gameGroup.visible=true;
  const meshes=game.meshes||{};
  const visible=[
    applyMeshPose(meshes['9'],[0,6,0],[-90,0,0]),
    applyMeshPose(meshes['3-right'],[135,6,0],[-90,0,0]),
    applyMeshPose(meshes['3-left'],[-135,6,0],[-90,0,180]),
    applyMeshPose(meshes['3-front'],[0,6,135],[-90,0,90]),
    applyMeshPose(meshes['3-back'],[0,6,-135],[-90,0,-90])
  ].filter(Boolean).length;
  const portrait=innerHeight>innerWidth*1.18;
  setCamera(game,portrait?[470,500,650]:[590,430,670],[0,0,0],portrait?47:39);
  return{mode:'static',composition:'board-and-four-bases',visibleObjects:String(visible)};
}

function loadTexture(THREE,url){
  return new Promise((resolve,reject)=>new THREE.TextureLoader().load(url,texture=>{
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.minFilter=THREE.LinearFilter;
    texture.magFilter=THREE.LinearFilter;
    texture.generateMipmaps=false;
    texture.needsUpdate=true;
    resolve(texture);
  },undefined,reject));
}

function logoPlane(THREE,texture,width,name){
  const image=texture.image;
  const aspect=(image?.naturalWidth||image?.width||1)/(image?.naturalHeight||image?.height||1);
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.01,depthTest:false,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,width/Math.max(.2,aspect)),material);
  mesh.name=name;
  mesh.renderOrder=9500;
  return mesh;
}

async function configureLogoWall(game){
  const scene=prepareRoom(game);
  game.gameGroup.visible=false;
  const old=scene.getObjectByName('yakolak-developer-d1-logo-wall');
  if(old)scene.remove(old);
  const [yakolakTexture,mtkyfTexture]=await Promise.all([
    loadTexture(game.THREE,'./assets/YAKOLAK.svg?v=D1-two-tone'),
    loadTexture(game.THREE,'./assets/MTKYF.svg?v=D1-two-tone')
  ]);
  const portrait=innerHeight>innerWidth*1.18;
  const group=new game.THREE.Group();
  group.name='yakolak-developer-d1-logo-wall';
  group.position.set(2374,265,0);
  group.rotation.y=-Math.PI/2;
  const yakolak=logoPlane(game.THREE,yakolakTexture,portrait?340:650,'d1-yakolak-logo');
  yakolak.position.set(0,portrait?145:220,0);
  const mtkyf=logoPlane(game.THREE,mtkyfTexture,portrait?280:520,'d1-mtkyf-logo');
  mtkyf.position.set(0,portrait?-145:-220,0);
  group.add(yakolak,mtkyf);
  scene.add(group);
  setCamera(game,portrait?[1320,265,0]:[1120,260,0],[2380,265,0],portrait?49:42);
  return{mode:'static',composition:'two-tone-logo-wall',logoRendering:'svg-texture'};
}

function enforceIntroIsolation(game){
  hideDeveloperNoise(game);
  if(game.setupGroup)game.setupGroup.visible=false;
  HIDDEN_UI.forEach(id=>document.getElementById(id)?.remove());
}

async function configureUnboxing(game){
  prepareRoom(game);
  game.gameGroup.visible=true;
  enforceIntroIsolation(game);
  const portrait=innerHeight>innerWidth*1.18;
  setCamera(game,portrait?[430,560,620]:[520,430,520],[0,0,0],portrait?48:43);
  realRemoveLoader();
  const replay=document.getElementById('yakolakReplayBtn');
  if(!replay)throw new Error('D1 intro replay control is unavailable');
  replay.click();
  for(let index=0;index<12;index++){
    enforceIntroIsolation(game);
    renderGame(game);
    await wait(50);
  }
  if(preview){
    replayTimer=setInterval(()=>{
      enforceIntroIsolation(game);
      replay.click();
    },6800);
  }
  return{mode:'sequence',composition:'unboxing-only',setupHidden:'true'};
}

async function loadThreeScene(){
  if(loader){
    loader.id='yakolakLoader';
    loader.remove=()=>{loader.dataset.removePending='1'};
  }
  await import('./mobile-clarity-v120.js?v=D1-developer');
  await import('./app-game-v114.js?v=D1-developer');
  const game=await waitForGame();

  if(sceneId==='clean-entry'){
    await import('./entry-v126.js?v=D1-developer');
    for(let index=0;index<400&&!globalThis.__yakolakV126Entry?.phase;index++)await wait(25);
    markReady({mode:'sequence',composition:'clean-entry'});
    return;
  }

  let details;
  if(sceneId==='empty-table')details=configureEmptyTable(game);
  else if(sceneId==='board-bases')details=configureBoardBases(game);
  else if(sceneId==='logo-wall')details=await configureLogoWall(game);
  else if(sceneId==='unboxing-intro')details=await configureUnboxing(game);
  else details=configureEmptyTable(game);

  realRemoveLoader();
  renderGame(game);
  markReady(details);
}

addEventListener('pagehide',()=>{if(replayTimer)clearInterval(replayTimer)});

if(sceneId==='loading-star'){
  markReady({mode:'single',composition:'approved-loading-star'});
}else{
  loadThreeScene().catch(error=>{
    console.error('[Yakolak] Developer D1 scene failed',error);
    if(status)status.textContent='D1 · ERROR';
    document.body.dataset.sceneError=String(error?.message||error);
    parent.postMessage({type:'yakolak-developer-scene-error',scene:sceneId,error:String(error?.message||error)},'*');
  });
}
