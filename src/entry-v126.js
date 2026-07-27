import {SVGLoader} from 'three/addons/loaders/SVGLoader.js';

console.info('[Yakolak] ENTRY v126 CLEAN WALL-TO-WALL JOURNEY LOADED');

const BUILD=126;
const WHITE='#ffffff';
const INK='#242421';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const smoother=t=>{t=clamp(t,0,1);return t*t*t*(t*(t*6-15)+10)};

async function waitForStableRoom(){
  for(let i=0;i<800;i++){
    const game=globalThis.__yakolakGame;
    if(game?.THREE&&game?.renderer&&game?.camera&&game?.gameGroup?.parent&&game?.render&&document.body.classList.contains('yakolak-ready'))return game;
    await wait(25);
  }
  throw new Error('v126 could not find the stable v120 room and table');
}

function setSolidColor(object,color){
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

function cleanStableRoom(scene,gameGroup){
  scene.background?.set?.(WHITE);
  setSolidColor(scene.getObjectByName('room-back-wall'),WHITE);
  setSolidColor(scene.getObjectByName('room-left-wall'),WHITE);
  setSolidColor(scene.getObjectByName('room-right-wall'),WHITE);
  setSolidColor(scene.getObjectByName('room-ceiling'),WHITE);
  setSolidColor(scene.getObjectByName('room-floor'),'#deddd7');
  const front=scene.getObjectByName('room-front-wall');
  if(front)front.visible=false;
  gameGroup.visible=false;
  document.body.classList.add('yakolak-v126-entry');
}

function poseSet(){
  const portrait=innerHeight>innerWidth*1.18;
  const compact=!portrait&&(innerWidth<=900||innerHeight<=620);
  const start=portrait
    ?{position:[0,250,-720],target:[0,250,-2385],fov:49}
    :compact
      ?{position:[0,250,-930],target:[0,250,-2385],fov:46}
      :{position:[0,250,-1120],target:[0,250,-2385],fov:42};
  const end=portrait
    ?{position:[1320,265,0],target:[2380,265,0],fov:49}
    :compact
      ?{position:[1240,260,0],target:[2380,260,0],fov:46}
      :{position:[1120,260,0],target:[2380,260,0],fov:42};
  return{portrait,compact,start,end};
}

function applyPose(camera,THREE,pose){
  camera.position.set(...pose.position);
  camera.fov=pose.fov;
  camera.updateProjectionMatrix();
  camera.lookAt(new THREE.Vector3(...pose.target));
}

function loadOfficialSvg(url){
  return new Promise((resolve,reject)=>new SVGLoader().load(url,resolve,undefined,reject));
}

function officialLogo(THREE,svgData,width,name){
  const raw=new THREE.Group();
  svgData.paths.forEach((path,pathIndex)=>{
    const material=new THREE.MeshBasicMaterial({
      color:path.color||INK,
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

async function createOfficialLogoWall(scene,THREE,render){
  const portrait=innerHeight>innerWidth*1.18;
  const [yakolakSvg,mtkyfSvg]=await Promise.all([
    loadOfficialSvg(`./assets/YAKOLAK.svg?v=${BUILD}`),
    loadOfficialSvg(`./assets/MTKYF.svg?v=${BUILD}`)
  ]);
  const group=new THREE.Group();
  group.name='yakolak-v126-official-logo-wall';
  group.position.set(2374,265,0);
  group.rotation.y=-Math.PI/2;

  const yakolak=officialLogo(THREE,yakolakSvg,portrait?340:650,'yakolak-v126-logo-yakolak');
  yakolak.position.set(0,portrait?145:220,0);
  const mtkyf=officialLogo(THREE,mtkyfSvg,portrait?280:520,'yakolak-v126-logo-mtkyf');
  mtkyf.position.set(0,portrait?-145:-220,0);
  group.add(yakolak,mtkyf);
  scene.add(group);
  render();
  return group;
}

function projectLoaderAnchor(camera,THREE,worldPoint){
  const loader=globalThis.__yakolakEntryLoader;
  if(!loader?.anchor)return false;
  const direction=new THREE.Vector3();
  camera.getWorldDirection(direction);
  const toward=worldPoint.clone().sub(camera.position);
  if(direction.dot(toward)<=0){
    loader.anchor(-180,innerHeight/2);
    return false;
  }
  const point=worldPoint.clone().project(camera);
  const x=(point.x*.5+.5)*innerWidth;
  const y=(-point.y*.5+.5)*innerHeight;
  loader.anchor(x,y);
  return x>-90&&x<innerWidth+90&&y>-90&&y<innerHeight+90&&point.z>-1&&point.z<1;
}

function createJourneyCurves(THREE,start,end,portrait){
  const cameraPoints=portrait?[
    new THREE.Vector3(...start.position),
    new THREE.Vector3(0,430,-650),
    new THREE.Vector3(0,1250,-300),
    new THREE.Vector3(450,1150,850),
    new THREE.Vector3(950,520,420),
    new THREE.Vector3(...end.position)
  ]:[
    new THREE.Vector3(...start.position),
    new THREE.Vector3(0,360,-800),
    new THREE.Vector3(0,760,-250),
    new THREE.Vector3(380,760,650),
    new THREE.Vector3(850,450,350),
    new THREE.Vector3(...end.position)
  ];
  const targetPoints=[
    new THREE.Vector3(...start.target),
    new THREE.Vector3(0,120,-1400),
    new THREE.Vector3(0,-15,0),
    new THREE.Vector3(120,-15,40),
    new THREE.Vector3(1150,140,0),
    new THREE.Vector3(...end.target)
  ];
  return{
    cameraCurve:new THREE.CatmullRomCurve3(cameraPoints,false,'centripetal',.5),
    targetCurve:new THREE.CatmullRomCurve3(targetPoints,false,'centripetal',.5)
  };
}

async function runJourney(game){
  const {THREE,renderer,camera,gameGroup,render}=game;
  const scene=gameGroup.parent;
  cleanStableRoom(scene,gameGroup);
  renderer.domElement.style.pointerEvents='none';

  const logos=await createOfficialLogoWall(scene,THREE,render);
  const wallAnchor=new THREE.Vector3(0,250,-2370);
  let poses=poseSet();
  applyPose(camera,THREE,poses.start);
  render();
  projectLoaderAnchor(camera,THREE,wallAnchor);

  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  globalThis.__yakolakEntryLoader?.handoff?.();

  const duration=reduced?1200:3000;
  const {cameraCurve,targetCurve}=createJourneyCurves(THREE,poses.start,poses.end,poses.portrait);
  const started=performance.now();
  await new Promise(resolve=>{
    const frame=now=>{
      const raw=clamp((now-started)/duration,0,1);
      const t=smoother(raw);
      const position=cameraCurve.getPoint(t);
      const target=targetCurve.getPoint(t);
      camera.position.copy(position);
      const baseFov=poses.start.fov+(poses.end.fov-poses.start.fov)*t;
      camera.fov=baseFov+(poses.portrait?9:4)*Math.sin(Math.PI*t);
      camera.updateProjectionMatrix();
      camera.lookAt(target);
      projectLoaderAnchor(camera,THREE,wallAnchor);
      render();
      if(raw<1)requestAnimationFrame(frame);else resolve();
    };
    requestAnimationFrame(frame);
  });

  applyPose(camera,THREE,poses.end);
  const anchorVisible=projectLoaderAnchor(camera,THREE,wallAnchor);
  render();
  if(anchorVisible)await wait(120);
  globalThis.__yakolakEntryLoader?.finish?.();
  document.body.dataset.yakolakEntry='complete';

  addEventListener('resize',()=>{
    poses=poseSet();
    applyPose(camera,THREE,poses.end);
    render();
  },{passive:true});

  globalThis.__yakolakV126Entry={
    build:BUILD,
    phase:'complete',
    source:'v120-stable-room-table',
    logos,
    logoInk:INK,
    gameGroupHidden:!gameGroup.visible
  };
  console.info('[Yakolak] v126 clean entry journey complete');
}

const game=await waitForStableRoom();
await runJourney(game);
