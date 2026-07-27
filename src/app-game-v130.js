console.info('[Yakolak] APP GAME v130 APPROVED ROOM CONTINUITY LOADED');

await import('./app-game-v126.js?v=130-approved-room-table-base');

const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const clamp=(value,min=0,max=1)=>Math.min(max,Math.max(min,value));
const ease=t=>{t=clamp(t);return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2};
const STAR_PATH='M0,-191.393L-20.116,-183.832L-40.232,-191.393L-55.534,-176.304L-76.986,-175.028L-84.828,-155.02L-103.907,-145.13L-102.932,-123.662L-116.339,-106.867L-106.717,-87.651L-112.134,-66.855L-95.528,-53.214L-92.018,-32.013L-71.299,-26.306L-59.469,-8.364L-38.22,-11.578L-20.116,0L-2.012,-11.578L19.237,-8.364L31.067,-26.306L51.786,-32.013L55.296,-53.214L71.902,-66.855L66.486,-87.651L76.108,-106.867L62.7,-123.662L63.675,-145.13L44.596,-155.02L36.754,-175.028L15.302,-176.304L0,-191.393Z';

async function waitForApprovedRoom(){
  for(let i=0;i<520;i++){
    const game=globalThis.__yakolakGame;
    const wall=globalThis.__yakolakV125WhiteWall;
    if(game?.THREE&&game?.camera&&game?.controls&&game?.renderer&&game?.gameGroup?.parent&&game?.render&&wall?.group)return{game,wall};
    await wait(25);
  }
  throw new Error('v130 could not find the approved v125 room and table');
}

function hideLegacyPresentation(wall){
  wall.group.visible=false;
  const known=[
    globalThis.__yakolakV122RoomMenu?.group,
    globalThis.__yakolakV124RoomServices?.serviceGroup,
    globalThis.__yakolakV124RoomServices?.learnScreen,
    globalThis.__yakolakV124RoomServices?.lobbyScreen
  ];
  known.filter(Boolean).forEach(object=>{object.visible=false});
  ['yakolakEntry','yakolakFloatingSettings','yakolakEntrySettings','yakolakHowTo','yakolakOnlineDialog','yakolakGameHud','yakolakGameScore','yakolakGameSetup'].forEach(id=>{
    const node=document.getElementById(id);
    if(node)node.style.setProperty('display','none','important');
  });
}

function createStarTexture(THREE){
  const canvas=document.createElement('canvas');
  canvas.width=512;canvas.height=512;
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,512,512);
  ctx.save();
  ctx.translate(299,460);
  ctx.scale(2.14,2.14);
  ctx.fillStyle='#3f3f3f';
  ctx.fill(new Path2D(STAR_PATH));
  ctx.restore();
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;
  texture.magFilter=THREE.LinearFilter;
  return texture;
}

function createShadowTexture(THREE){
  const canvas=document.createElement('canvas');
  canvas.width=256;canvas.height=64;
  const ctx=canvas.getContext('2d');
  const gradient=ctx.createRadialGradient(128,32,2,128,32,112);
  gradient.addColorStop(0,'rgba(0,0,0,.18)');
  gradient.addColorStop(.55,'rgba(0,0,0,.08)');
  gradient.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,256,64);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;
  texture.magFilter=THREE.LinearFilter;
  return texture;
}

function createWallStar(game,scene){
  const {THREE}=game;
  const group=new THREE.Group();
  group.name='yakolak-v130-loading-star-on-approved-wall';
  group.position.set(0,250,-2354);

  const starMaterial=new THREE.MeshBasicMaterial({
    map:createStarTexture(THREE),transparent:true,depthTest:false,depthWrite:false,toneMapped:false,side:THREE.DoubleSide
  });
  const star=new THREE.Mesh(new THREE.PlaneGeometry(100,100),starMaterial);
  star.position.set(0,18,2);
  star.renderOrder=12020;

  const shadowMaterial=new THREE.MeshBasicMaterial({
    map:createShadowTexture(THREE),transparent:true,opacity:.075,depthTest:false,depthWrite:false,toneMapped:false,side:THREE.DoubleSide
  });
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(72,18),shadowMaterial);
  shadow.position.set(0,-53,1);
  shadow.renderOrder=12010;

  group.add(shadow,star);
  scene.add(group);
  return{group,star,shadow,shadowMaterial};
}

function createSampleWallText(game,scene){
  const {THREE}=game;
  const canvas=document.createElement('canvas');
  canvas.width=1200;canvas.height=600;
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,1200,600);
  ctx.direction='rtl';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle='#3d3d3a';ctx.font='500 112px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillText('نص تجريبي',600,300);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;
  texture.magFilter=THREE.LinearFilter;
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(900,450),material);
  mesh.name='yakolak-v130-sample-text-existing-on-second-wall';
  mesh.position.set(2354,260,0);
  mesh.rotation.y=-Math.PI/2;
  mesh.renderOrder=12000;
  scene.add(mesh);
  return mesh;
}

function sampleKeys(keys,p){
  for(let i=1;i<keys.length;i++){
    if(p<=keys[i][0]){
      const [p0,v0]=keys[i-1];const [p1,v1]=keys[i];
      const q=(p-p0)/(p1-p0||1);
      return v0+(v1-v0)*q;
    }
  }
  return keys[keys.length-1][1];
}

function animateWallStar(game,parts){
  const started=Number(globalThis.__yakolakLoadingStarStartedAt)||performance.now();
  let running=true;
  const cycle=reduced?1100:820;
  const yKeys=[[0,18],[.43,-15],[.5,-18],[.58,-12],[.78,13],[1,18]];
  const rotKeys=[[0,0],[.43,10],[.5,12],[.58,14],[.78,20],[1,24]];
  const sxKeys=[[0,1],[.43,1.01],[.5,1.17],[.58,.94],[.78,1.01],[1,1]];
  const syKeys=[[0,1],[.43,.99],[.5,.72],[.58,1.09],[.78,.99],[1,1]];
  const shKeys=[[0,.66],[.43,1.02],[.5,1.28],[.58,1.04],[.78,.72],[1,.66]];
  const opKeys=[[0,.055],[.43,.105],[.5,.14],[.58,.105],[.78,.065],[1,.055]];
  const frame=now=>{
    if(!running)return;
    const p=((now-started)%cycle)/cycle;
    parts.star.position.y=sampleKeys(yKeys,p);
    parts.star.rotation.z=sampleKeys(rotKeys,p)*Math.PI/180;
    parts.star.scale.set(sampleKeys(sxKeys,p),sampleKeys(syKeys,p),1);
    const shadowScale=sampleKeys(shKeys,p);
    parts.shadow.scale.set(shadowScale,1,1);
    parts.shadowMaterial.opacity=sampleKeys(opKeys,p);
    parts.shadowMaterial.needsUpdate=true;
    game.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return()=>{running=false};
}

function poses(){
  const portrait=innerHeight>innerWidth*1.18;
  const compact=!portrait&&(innerWidth<=900||innerHeight<=600);
  return{
    star:{pos:[0,250,-1534],target:[0,250,-2354],fov:portrait?48:compact?46:42},
    reveal:portrait
      ?{pos:[330,560,455],target:[0,18,-80],fov:46}
      :compact
        ?{pos:[245,325,285],target:[0,0,-80],fov:45}
        :{pos:[520,430,520],target:[0,0,-80],fov:43},
    second:portrait
      ?{pos:[650,350,0],target:[2354,260,0],fov:48}
      :compact
        ?{pos:[820,285,0],target:[2354,255,0],fov:46}
        :{pos:[1050,275,0],target:[2354,260,0],fov:42}
  };
}

function setCamera(game,pose){
  const {THREE,camera,controls,render}=game;
  controls.enabled=false;
  camera.position.set(...pose.pos);
  camera.fov=pose.fov;
  camera.near=.5;camera.far=12000;
  camera.updateProjectionMatrix();
  controls.target.set(...pose.target);
  camera.lookAt(new THREE.Vector3(...pose.target));
  render();
}

function moveCamera(game,pose,ms){
  if(ms<=20){setCamera(game,pose);return Promise.resolve()}
  const {THREE,camera,controls,render}=game;
  const fromPos=camera.position.clone();
  const toPos=new THREE.Vector3(...pose.pos);
  const fromQuat=camera.quaternion.clone();
  const probe=camera.clone();
  probe.position.copy(toPos);probe.lookAt(new THREE.Vector3(...pose.target));
  const toQuat=probe.quaternion.clone();
  const fromTarget=controls.target.clone();
  const toTarget=new THREE.Vector3(...pose.target);
  const fromFov=camera.fov;
  const t0=performance.now();
  return new Promise(resolve=>{
    const step=now=>{
      const q=ease((now-t0)/ms);
      camera.position.lerpVectors(fromPos,toPos,q);
      camera.quaternion.slerpQuaternions(fromQuat,toQuat,q);
      controls.target.lerpVectors(fromTarget,toTarget,q);
      camera.fov=fromFov+(pose.fov-fromFov)*q;
      camera.updateProjectionMatrix();render();
      if(q<1)requestAnimationFrame(step);else resolve();
    };
    requestAnimationFrame(step);
  });
}

async function initApprovedRoomContinuity(){
  const {game,wall}=await waitForApprovedRoom();
  const scene=game.gameGroup.parent;
  hideLegacyPresentation(wall);

  const sampleText=createSampleWallText(game,scene);
  const starParts=createWallStar(game,scene);
  const stopStar=animateWallStar(game,starParts);
  const current=poses();
  setCamera(game,current.star);

  const view=document.getElementById('view');
  if(view){view.style.transition='none';view.style.opacity='1'}
  document.body.dataset.phase='wall-loading';
  globalThis.__yakolakLoading?.set?.(100,'جاهز');
  game.render();
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

  globalThis.__yakolakReleaseWallLoader?.();
  document.body.dataset.phase='room-reveal';
  await wait(reduced?120:280);
  await moveCamera(game,current.reveal,reduced?700:2200);
  await wait(reduced?180:620);

  document.body.dataset.phase='second-wall';
  await moveCamera(game,current.second,reduced?850:2050);
  await wait(80);
  starParts.group.visible=false;
  stopStar();
  game.render();
  document.body.dataset.phase='sample-wall';

  globalThis.__yakolakV130={
    build:130,
    base:126,
    roomSource:'approved-v125-room',
    tableSource:'established-neutral-table',
    starLeavesViewBeforeHide:true,
    sampleTextPresentBeforeCameraTurn:true,
    starGroup:starParts.group,
    sampleText,
    replay:()=>location.reload()
  };
  console.info('[Yakolak] v130 approved room continuity active');
}

await initApprovedRoomContinuity();
