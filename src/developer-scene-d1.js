import {SVGLoader} from 'three/addons/loaders/SVGLoader.js';

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

function markReady(){
  document.body.dataset.sceneReady='true';
  parent.postMessage({type:'yakolak-developer-scene-ready',scene:sceneId,build:'D1'},'*');
}

async function waitForGame(){
  for(let index=0;index<800;index++){
    const game=globalThis.__yakolakGame;
    if(game?.THREE&&game?.renderer&&game?.camera&&game?.gameGroup?.parent&&document.body.classList.contains('yakolak-ready'))return game;
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
  return scene;
}

function setCamera(game,position,target,fov=44){
  game.camera.position.set(...position);
  game.camera.fov=fov;
  game.camera.updateProjectionMatrix();
  game.camera.lookAt(new game.THREE.Vector3(...target));
  renderGame(game);
}

function configureEmptyTable(game){
  prepareRoom(game);
  game.gameGroup.visible=false;
  const portrait=innerHeight>innerWidth*1.18;
  setCamera(game,portrait?[850,250,900]:[920,310,980],[0,-180,0],portrait?52:44);
}

function configureBoardBases(game){
  prepareRoom(game);
  const group=game.gameGroup;
  group.visible=true;
  group.children.forEach(child=>child.visible=false);
  const structural=group.children.filter(child=>child.isMesh&&!child.name).slice(0,6);
  const poses=[
    {p:[0,6,0],r:[-90,0,0]},
    {p:[135,6,0],r:[-90,0,0]},
    {p:[-135,6,0],r:[-90,0,180]},
    {p:[0,6,135],r:[-90,0,90]},
    {p:[0,6,-135],r:[-90,0,-90]}
  ];
  poses.forEach((pose,index)=>{
    const mesh=structural[index];
    if(!mesh)return;
    mesh.visible=true;
    mesh.position.set(...pose.p);
    mesh.rotation.set(...pose.r.map(rad));
  });
  if(structural[5])structural[5].visible=false;
  const portrait=innerHeight>innerWidth*1.18;
  setCamera(game,portrait?[520,520,700]:[650,470,720],[0,0,0],portrait?48:40);
}

function loadSvg(url){
  return new Promise((resolve,reject)=>new SVGLoader().load(url,resolve,undefined,reject));
}

function logoObject(THREE,svgData,width,name){
  const raw=new THREE.Group();
  svgData.paths.forEach((path,pathIndex)=>{
    const material=new THREE.MeshBasicMaterial({color:path.color||'#242421',transparent:false,depthTest:false,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
    SVGLoader.createShapes(path).forEach(shape=>{
      const geometry=new THREE.ShapeGeometry(shape,18);
      geometry.scale(1,-1,1);
      const mesh=new THREE.Mesh(geometry,material);
      mesh.position.z=pathIndex*.02;
      mesh.renderOrder=9000+pathIndex;
      raw.add(mesh);
    });
  });
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
    loadSvg('./assets/YAKOLAK.svg?v=D1'),
    loadSvg('./assets/MTKYF.svg?v=D1')
  ]);
  const portrait=innerHeight>innerWidth*1.18;
  const group=new game.THREE.Group();
  group.name='yakolak-developer-d1-logo-wall';
  group.position.set(2374,265,0);
  group.rotation.y=-Math.PI/2;
  const yakolak=logoObject(game.THREE,yakolakSvg,portrait?340:650,'d1-yakolak-logo');
  yakolak.position.set(0,portrait?145:220,0);
  const mtkyf=logoObject(game.THREE,mtkyfSvg,portrait?280:520,'d1-mtkyf-logo');
  mtkyf.position.set(0,portrait?-145:-220,0);
  group.add(yakolak,mtkyf);
  scene.add(group);
  setCamera(game,portrait?[1320,265,0]:[1120,260,0],[2380,265,0],portrait?49:42);
}

async function configureUnboxing(game){
  prepareRoom(game);
  game.gameGroup.visible=true;
  realRemoveLoader();
  const replay=document.getElementById('yakolakReplayBtn');
  replay?.click();
  if(preview){
    setInterval(()=>replay?.click(),6200);
  }
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
    markReady();
    return;
  }

  if(sceneId==='empty-table')configureEmptyTable(game);
  else if(sceneId==='board-bases')configureBoardBases(game);
  else if(sceneId==='logo-wall')await configureLogoWall(game);
  else if(sceneId==='unboxing-intro'){
    await configureUnboxing(game);
    markReady();
    return;
  }
  else configureEmptyTable(game);

  realRemoveLoader();
  markReady();
}

if(sceneId==='loading-star'){
  markReady();
}else{
  loadThreeScene().catch(error=>{
    console.error('[Yakolak] Developer D1 scene failed',error);
    if(status)status.textContent='D1 · ERROR';
    document.body.dataset.sceneError=String(error?.message||error);
  });
}
