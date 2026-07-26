console.info('[Yakolak] APP GAME v125 WHITE WALL CONTINUITY LOADED');

await import('./app-game-v124.js?v=125-white-wall-base');

const WALL_COLOR='#f7f7f4';
const INK='#242421';
const MUTED='#77736c';
const LINE='#cbc7bf';
const SURFACE='#efede7';
const SURFACE_HOVER='#e7e3dc';
const SURFACE_SELECTED='#ded8ce';
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const ease=t=>{t=clamp(t,0,1);return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2};

function roundRect(ctx,x,y,w,h,r){
  const radius=Math.min(r,w/2,h/2);
  ctx.beginPath();
  ctx.moveTo(x+radius,y);
  ctx.arcTo(x+w,y,x+w,y+h,radius);
  ctx.arcTo(x+w,y+h,x,y+h,radius);
  ctx.arcTo(x,y+h,x,y,radius);
  ctx.arcTo(x,y,x+w,y,radius);
  ctx.closePath();
}

async function waitForWallStage(){
  for(let i=0;i<520;i++){
    const game=globalThis.__yakolakGame;
    const roomMenu=globalThis.__yakolakV122RoomMenu;
    if(game?.THREE&&game?.renderer&&game?.camera&&game?.gameGroup?.parent&&game?.render&&roomMenu?.choose&&roomMenu?.group){
      return{game,roomMenu};
    }
    await wait(25);
  }
  throw new Error('v125 could not find the white-wall entry stage');
}

function setMaterialColor(object,color,{opacity,visible}={}){
  if(!object)return;
  if(visible!==undefined)object.visible=visible;
  const materials=Array.isArray(object.material)?object.material:[object.material];
  materials.filter(Boolean).forEach(material=>{
    material.color?.set?.(color);
    material.emissive?.set?.('#000000');
    if('emissiveIntensity' in material)material.emissiveIntensity=0;
    if(opacity!==undefined){
      material.opacity=opacity;
      material.transparent=opacity<1;
      material.depthWrite=opacity>=1;
    }
    material.needsUpdate=true;
  });
}

function applyWhiteRoom(scene){
  scene.background?.set?.(WALL_COLOR);
  setMaterialColor(scene.getObjectByName('room-back-wall'),WALL_COLOR,{opacity:1,visible:true});
  setMaterialColor(scene.getObjectByName('room-left-wall'),'#f3f2ed',{opacity:1,visible:true});
  setMaterialColor(scene.getObjectByName('room-right-wall'),'#f3f2ed',{opacity:1,visible:true});
  setMaterialColor(scene.getObjectByName('room-ceiling'),WALL_COLOR,{opacity:1,visible:true});
  setMaterialColor(scene.getObjectByName('room-floor'),'#deddd7',{opacity:1,visible:true});
  setMaterialColor(scene.getObjectByName('room-front-wall'),WALL_COLOR,{opacity:0,visible:false});
  const room=scene.getObjectByName('yakolak-soft-empty-room');
  room?.traverse?.(object=>{
    if(object.isLine&&object.material){
      object.material.color?.set?.('#bcb9b2');
      object.material.opacity=Math.min(object.material.opacity||1,.12);
      object.material.transparent=true;
      object.material.needsUpdate=true;
    }
    if(object.isMesh&&/^(base-|ceiling-)/.test(object.name||''))setMaterialColor(object,'#d5d2ca',{opacity:1});
  });
}

function wallPose(){
  const portrait=innerHeight>innerWidth*1.18;
  if(portrait)return{pos:[0,250,-260],target:[0,250,-2386],fov:48};
  if(innerWidth<=900||innerHeight<=600)return{pos:[0,245,-560],target:[0,245,-2386],fov:46};
  return{pos:[0,250,-820],target:[0,250,-2386],fov:42};
}

async function initWhiteWall(){
  const {game,roomMenu}=await waitForWallStage();
  const {THREE,renderer,camera,gameGroup,render}=game;
  const scene=gameGroup.parent;
  applyWhiteRoom(scene);

  roomMenu.group.visible=false;

  const rows=[
    {mode:'online',mark:'01',title:'ألعب أونلاين',note:'أنشئ غرفة أو ادخل برمز صديقك',y:575},
    {mode:'computer',mark:'02',title:'مع الكمبيوتر',note:'ابدأ مباراة سريعة ضد الكمبيوتر',y:805},
    {mode:'learn',mark:'03',title:'اشرحلي اللعبة',note:'تعلم طرق الفوز ثم جرّب بنفسك',y:1035}
  ];

  const canvas=document.createElement('canvas');
  canvas.width=1200;
  canvas.height=1600;
  const ctx=canvas.getContext('2d');
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;
  texture.magFilter=THREE.LinearFilter;

  const material=new THREE.MeshBasicMaterial({
    map:texture,
    transparent:true,
    opacity:1,
    depthTest:false,
    depthWrite:false,
    toneMapped:false,
    side:THREE.DoubleSide
  });
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(900,1200),material);
  screen.name='yakolak-v125-white-wall-menu-surface';
  screen.renderOrder=11020;

  const group=new THREE.Group();
  group.name='yakolak-v125-white-wall-menu';
  group.position.set(0,250,-2360);
  group.add(screen);

  const hiddenMaterial=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthTest:false,depthWrite:false,side:THREE.DoubleSide});
  const hits=rows.map(row=>{
    const hit=new THREE.Mesh(new THREE.PlaneGeometry(750,142),hiddenMaterial.clone());
    hit.position.set(0,(0.5-((row.y+90)/1600))*1200,5);
    hit.userData.mode=row.mode;
    hit.renderOrder=11030;
    group.add(hit);
    return hit;
  });
  scene.add(group);

  let active=true;
  let choosing=false;
  let hover='';
  let selected='';
  let opacity=1;

  function draw(){
    ctx.clearRect(0,0,1200,1600);
    ctx.direction='rtl';
    ctx.textAlign='center';
    ctx.textBaseline='middle';

    ctx.fillStyle=MUTED;
    ctx.font='750 25px system-ui, sans-serif';
    ctx.fillText('YAKOLAK',600,135);

    ctx.fillStyle=INK;
    ctx.font='900 116px ExpoYakolak, system-ui, sans-serif';
    ctx.fillText('ياكلك',600,280);

    ctx.fillStyle=MUTED;
    ctx.font='650 31px system-ui, sans-serif';
    ctx.fillText('اختر كيف تحب تبدأ اللعبة',600,390);

    ctx.strokeStyle=LINE;
    ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(190,474);
    ctx.lineTo(1010,474);
    ctx.stroke();

    rows.forEach(row=>{
      const isHover=hover===row.mode;
      const isSelected=selected===row.mode;
      const x=120,w=960,h=180;
      roundRect(ctx,x,row.y,w,h,22);
      ctx.fillStyle=isSelected?SURFACE_SELECTED:isHover?SURFACE_HOVER:SURFACE;
      ctx.fill();
      ctx.strokeStyle=isSelected?INK:LINE;
      ctx.lineWidth=isSelected?3:2;
      ctx.stroke();

      ctx.textAlign='right';
      ctx.fillStyle=INK;
      ctx.font='900 47px ExpoYakolak, system-ui, sans-serif';
      ctx.fillText(row.title,980,row.y+64);
      ctx.fillStyle=MUTED;
      ctx.font='600 25px system-ui, sans-serif';
      ctx.fillText(row.note,980,row.y+120);

      ctx.textAlign='center';
      ctx.fillStyle=isSelected?INK:'#8b867e';
      ctx.font='800 27px system-ui, sans-serif';
      ctx.fillText(row.mark,205,row.y+90);
      ctx.beginPath();
      ctx.arc(205,row.y+90,45,0,Math.PI*2);
      ctx.strokeStyle=isSelected?INK:'#bbb6ad';
      ctx.lineWidth=2;
      ctx.stroke();
    });

    ctx.textAlign='center';
    ctx.fillStyle='#918d85';
    ctx.font='600 22px system-ui, sans-serif';
    ctx.fillText('العربية',600,1400);
    texture.needsUpdate=true;
    render();
  }

  function setOpacity(value){
    opacity=clamp(value,0,1);
    material.opacity=opacity;
    material.needsUpdate=true;
    group.visible=opacity>.002;
    render();
  }

  function fade(to,ms){
    const from=opacity;
    if(ms<=20){setOpacity(to);return Promise.resolve()}
    const t0=performance.now();
    return new Promise(resolve=>{
      const step=now=>{
        const q=ease((now-t0)/ms);
        setOpacity(from+(to-from)*q);
        if(q<1)requestAnimationFrame(step);else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  const pointer=new THREE.Vector2();
  const raycaster=new THREE.Raycaster();
  function modeAt(event){
    const rect=renderer.domElement.getBoundingClientRect();
    pointer.x=((event.clientX-rect.left)/rect.width)*2-1;
    pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;
    raycaster.setFromCamera(pointer,camera);
    return raycaster.intersectObjects(hits,false)[0]?.object?.userData?.mode||'';
  }

  async function choose(mode){
    if(choosing||!mode)return;
    choosing=true;
    active=false;
    selected=mode;
    hover='';
    renderer.domElement.style.cursor='';
    draw();
    await wait(reduced?10:140);
    const route=roomMenu.choose(mode);
    await wait(reduced?10:160);
    await fade(0,reduced?10:520);
    group.visible=false;
    await route;
  }

  function onPointerMove(event){
    if(!active||choosing)return;
    event.stopImmediatePropagation();
    event.stopPropagation();
    const mode=modeAt(event);
    if(mode===hover)return;
    hover=mode;
    renderer.domElement.style.cursor=mode?'pointer':'';
    draw();
  }

  function onPointerDown(event){
    if(!active||choosing)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    const mode=modeAt(event);
    if(mode)void choose(mode);
  }

  window.addEventListener('pointermove',onPointerMove,{capture:true,passive:false});
  window.addEventListener('pointerdown',onPointerDown,{capture:true,passive:false});
  addEventListener('resize',()=>{
    if(!active||choosing)return;
    const pose=wallPose();
    camera.position.set(...pose.pos);
    camera.fov=pose.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(new THREE.Vector3(...pose.target));
    render();
  },{passive:true});

  const pose=wallPose();
  camera.position.set(...pose.pos);
  camera.fov=pose.fov;
  camera.updateProjectionMatrix();
  camera.lookAt(new THREE.Vector3(...pose.target));
  draw();
  setOpacity(1);
  document.body.classList.add('yakolak-v125-white-wall');

  globalThis.__yakolakV125WhiteWall={
    build:125,
    group,
    choose,
    finalize(){
      roomMenu.group.visible=false;
      applyWhiteRoom(scene);
      const next=wallPose();
      camera.position.set(...next.pos);
      camera.fov=next.fov;
      camera.updateProjectionMatrix();
      camera.lookAt(new THREE.Vector3(...next.target));
      draw();
      setOpacity(1);
      globalThis.__yakolakLoading?.set?.(100,'جاهز');
      globalThis.__yakolakReleaseWallLoader?.();
      console.info('[Yakolak] v125 white wall continuity active');
    }
  };
}

await initWhiteWall();
