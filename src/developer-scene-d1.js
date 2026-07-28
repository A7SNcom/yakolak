import {SVGLoader} from 'three/addons/loaders/SVGLoader.js';

console.info('[Yakolak] DEVELOPER D1 SCENE RUNNER LOADED');

const params=new URLSearchParams(location.search);
const elementId=params.get('element')||'';
const sceneId=elementId?'':(params.get('scene')||'loading-star');
const entityKind=elementId?'element':'scene';
const entityId=elementId||sceneId;
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
document.body.dataset.developerEntityKind=entityKind;
document.body.dataset.developerEntity=entityId;
if(sceneId)document.body.dataset.developerScene=sceneId;
if(elementId)document.body.dataset.developerElement=elementId;
if(status)status.textContent=`D1 · ${entityId}`;

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
  globalThis.__yakolakDeveloperD1Scene={build:'D1',entityKind,entityId,sceneId,elementId,preview,...details};
  parent.postMessage({type:'yakolak-developer-scene-ready',entityKind,entityId,scene:sceneId,element:elementId,build:'D1',details},'*');
}

async function waitForGame(){
  for(let index=0;index<800;index++){
    const game=globalThis.__yakolakGame;
    if(game?.THREE&&game?.renderer&&game?.camera&&game?.gameGroup?.parent&&game?.meshes&&document.body.classList.contains('yakolak-ready'))return game;
    await wait(25);
  }
  throw new Error(`Developer D1 could not load ${entityKind} ${entityId}`);
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
  game.camera.near=.1;
  game.camera.far=12000;
  game.camera.updateProjectionMatrix();
  game.camera.lookAt(new game.THREE.Vector3(...target));
  renderGame(game);
}

function frameObjects(game,objects,{direction=[1,.72,1],fov=44,padding=1.12,targetOffset=[0,0,0]}={}){
  const valid=objects.filter(Boolean);
  if(!valid.length)return false;
  const box=new game.THREE.Box3();
  valid.forEach(object=>{object.updateMatrixWorld(true);box.expandByObject(object,true)});
  if(box.isEmpty())return false;
  const center=box.getCenter(new game.THREE.Vector3());
  center.add(new game.THREE.Vector3(...targetOffset));
  const sphere=box.getBoundingSphere(new game.THREE.Sphere());
  const vertical=rad(fov);
  const horizontal=2*Math.atan(Math.tan(vertical/2)*Math.max(.35,game.camera.aspect));
  const limiting=Math.min(vertical,horizontal);
  const distance=(sphere.radius/Math.max(.18,Math.sin(limiting/2)))*padding;
  const vector=new game.THREE.Vector3(...direction).normalize().multiplyScalar(distance);
  setCamera(game,center.clone().add(vector).toArray(),center.toArray(),fov);
  return true;
}

function findTable(scene){
  return scene.getObjectByName('yakolak-svg-table')||scene.getObjectByName('yakolak-fallback-simple-table');
}

function hideGameChildren(game){
  game.gameGroup.traverse?.(object=>{if(object!==game.gameGroup)object.visible=false});
}

function resetGameTransform(game){
  game.gameGroup.position.set(0,0,0);
  game.gameGroup.rotation.set(0,0,0);
  game.gameGroup.scale.set(1,1,1);
}

function configureEmptyTable(game){
  const scene=prepareRoom(game);
  game.gameGroup.visible=false;
  const table=findTable(scene);
  const portrait=innerHeight>innerWidth*1.18;
  if(!frameObjects(game,[table],{direction:portrait?[1,.78,1]:[1,.68,1],fov:portrait?49:43,padding:portrait?1.2:1.08})){
    setCamera(game,portrait?[980,420,1120]:[1150,430,1250],[0,-300,0],portrait?49:43);
  }
  return{mode:'static',composition:'empty-table',framing:'object-fit'};
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
  resetGameTransform(game);
  game.gameGroup.visible=true;
  const meshes=game.meshes||{};
  const selected=[];
  const add=(mesh,p,r)=>{if(applyMeshPose(mesh,p,r))selected.push(mesh)};
  add(meshes['9'],[0,6,0],[-90,0,0]);
  add(meshes['3-right'],[135,6,0],[-90,0,0]);
  add(meshes['3-left'],[-135,6,0],[-90,0,180]);
  add(meshes['3-front'],[0,6,135],[-90,0,90]);
  add(meshes['3-back'],[0,6,-135],[-90,0,-90]);
  const portrait=innerHeight>innerWidth*1.18;
  frameObjects(game,selected,{direction:portrait?[1,1.25,1]:[1,1,1],fov:portrait?48:40,padding:portrait?1.35:1.22});
  return{mode:'static',composition:'board-and-four-bases',visibleObjects:String(selected.length),framing:'named-object-fit'};
}

function loadOfficialSvg(url){
  return new Promise((resolve,reject)=>new SVGLoader().load(url,resolve,undefined,reject));
}

function officialLogo(THREE,svgData,width,name){
  const raw=new THREE.Group();
  svgData.paths.forEach((path,pathIndex)=>{
    const material=new THREE.MeshBasicMaterial({
      color:path.color||'#242421',
      transparent:false,
      depthTest:false,
      depthWrite:false,
      toneMapped:false,
      side:THREE.DoubleSide
    });
    SVGLoader.createShapes(path).forEach(shape=>{
      const geometry=new THREE.ShapeGeometry(shape,18);
      geometry.scale(1,-1,1);
      const mesh=new THREE.Mesh(geometry,material);
      mesh.position.z=pathIndex*.02;
      mesh.renderOrder=9000+pathIndex;
      raw.add(mesh);
    });
  });
  if(!raw.children.length)throw new Error(`${name} has no drawable SVG shapes`);
  raw.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(raw);
  const size=box.getSize(new THREE.Vector3());
  const center=box.getCenter(new THREE.Vector3());
  raw.position.set(-center.x,-center.y,0);
  const wrapper=new THREE.Group();
  wrapper.name=name;
  wrapper.scale.setScalar(width/Math.max(1,size.x));
  wrapper.add(raw);
  return wrapper;
}

async function configureLogoWall(game){
  const scene=prepareRoom(game);
  game.gameGroup.visible=false;
  const old=scene.getObjectByName('yakolak-developer-d1-logo-wall');
  if(old)scene.remove(old);
  const [yakolakSvg,mtkyfSvg]=await Promise.all([
    loadOfficialSvg('./assets/YAKOLAK.svg?v=D1-approved'),
    loadOfficialSvg('./assets/MTKYF.svg?v=D1-approved')
  ]);
  const portrait=innerHeight>innerWidth*1.18;
  const group=new game.THREE.Group();
  group.name='yakolak-developer-d1-logo-wall';
  group.position.set(2374,265,0);
  group.rotation.y=-Math.PI/2;
  const yakolak=officialLogo(game.THREE,yakolakSvg,portrait?340:650,'d1-yakolak-logo');
  yakolak.position.set(0,portrait?145:220,0);
  const mtkyf=officialLogo(game.THREE,mtkyfSvg,portrait?280:520,'d1-mtkyf-logo');
  mtkyf.position.set(0,portrait?-145:-220,0);
  group.add(yakolak,mtkyf);
  scene.add(group);
  setCamera(game,portrait?[1320,265,0]:[1120,260,0],[2380,265,0],portrait?49:42);
  return{mode:'static',composition:'two-tone-logo-wall',logoRendering:'svg-geometry-two-tone'};
}

async function configureLogoElement(game,id){
  const scene=prepareRoom(game);
  game.gameGroup.visible=false;
  scene.background?.set?.('#d8d7d1');
  const url=id==='logo-yakolak'?'./assets/YAKOLAK.svg?v=D1-element':'./assets/MTKYF.svg?v=D1-element';
  const svg=await loadOfficialSvg(url);
  const logo=officialLogo(game.THREE,svg,id==='logo-yakolak'?640:560,`d1-element-${id}`);
  logo.position.set(0,0,0);
  scene.add(logo);
  frameObjects(game,[logo],{direction:[0,0,1],fov:40,padding:1.18});
  return{mode:'element',composition:id,source:id==='logo-yakolak'?'assets/YAKOLAK.svg':'assets/MTKYF.svg'};
}

function isolateMeshElement(game,mesh,id,{rotation=[-90,0,0],direction=[1,.85,1],fov=40,padding=1.35}={}){
  prepareRoom(game);
  hideGameChildren(game);
  resetGameTransform(game);
  game.gameGroup.visible=true;
  if(!mesh)throw new Error(`Missing D1 element ${id}`);
  mesh.visible=true;
  mesh.position.set(0,0,0);
  mesh.rotation.set(...rotation.map(rad));
  frameObjects(game,[mesh],{direction,fov,padding});
  return{mode:'element',composition:id,visibleObjects:'1'};
}

async function configureElement(game,id){
  const scene=game.gameGroup.parent;
  if(id==='table'){
    prepareRoom(game);
    game.gameGroup.visible=false;
    const table=findTable(scene);
    if(!table)throw new Error('Missing D1 table element');
    frameObjects(game,[table],{direction:[1,.72,1],fov:42,padding:1.12});
    return{mode:'element',composition:'table',visibleObjects:'1'};
  }
  if(id==='logo-yakolak'||id==='logo-mtkyf')return configureLogoElement(game,id);
  if(id==='base-large')return isolateMeshElement(game,game.meshes?.['9'],id,{padding:1.28});
  if(id==='base-small')return isolateMeshElement(game,game.meshes?.['3-right'],id,{padding:1.42});
  const type={
    'stone-large':'l',
    'stone-medium':'m',
    'stone-small':'s'
  }[id];
  if(type){
    const piece=game.pieces?.find(candidate=>candidate.type===type&&candidate.dir==='front')||game.pieces?.find(candidate=>candidate.type===type);
    return isolateMeshElement(game,piece?.mesh,id,{direction:[1,.7,1],fov:38,padding:1.7});
  }
  throw new Error(`Unknown D1 element ${id}`);
}

function enforceIntroIsolation(game){
  hideDeveloperNoise(game);
  if(game.setupGroup)game.setupGroup.visible=false;
  HIDDEN_UI.forEach(id=>document.getElementById(id)?.remove());
}

function triggerIntroReplay(){
  globalThis.dispatchEvent(new KeyboardEvent('keydown',{key:'r',code:'KeyR',bubbles:true}));
}

async function configureUnboxing(game){
  prepareRoom(game);
  game.gameGroup.visible=true;
  enforceIntroIsolation(game);
  const portrait=innerHeight>innerWidth*1.18;
  setCamera(game,portrait?[430,560,620]:[520,430,520],[0,0,0],portrait?48:43);
  realRemoveLoader();
  triggerIntroReplay();
  for(let index=0;index<18;index++){
    enforceIntroIsolation(game);
    renderGame(game);
    await wait(50);
  }
  if(preview){
    replayTimer=setInterval(()=>{
      enforceIntroIsolation(game);
      triggerIntroReplay();
    },6800);
  }
  return{mode:'sequence',composition:'unboxing-only',setupHidden:'true',replaySource:'keyboard-runtime'};
}

async function loadThreeEntity(){
  if(loader){
    loader.id='yakolakLoader';
    loader.remove=()=>{loader.dataset.removePending='1'};
  }
  await import('./mobile-clarity-v120.js?v=D1-developer');
  await import('./app-game-v114.js?v=D1-developer');
  const game=await waitForGame();

  if(elementId){
    const details=await configureElement(game,elementId);
    realRemoveLoader();
    renderGame(game);
    markReady(details);
    return;
  }

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

if(sceneId==='loading-star'||elementId==='loading-star-element'){
  markReady({mode:elementId?'element':'single',composition:elementId?'loading-star-element':'approved-loading-star'});
}else{
  loadThreeEntity().catch(error=>{
    console.error('[Yakolak] Developer D1 entity failed',error);
    if(status)status.textContent='D1 · ERROR';
    document.body.dataset.sceneError=String(error?.message||error);
    parent.postMessage({type:'yakolak-developer-scene-error',entityKind,entityId,scene:sceneId,element:elementId,error:String(error?.message||error)},'*');
  });
}
