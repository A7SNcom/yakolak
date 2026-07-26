console.info('[Yakolak] APP GAME v122 DIEGETIC WALL MENU STAGE 1 LOADED');

await import('./app-game-v121.js?v=122-stage1-base');

const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const ease=t=>{t=Math.max(0,Math.min(1,t));return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2};

function injectCss(){
  if(document.getElementById('yakolakRoomMenuCss'))return;
  const link=document.createElement('link');
  link.id='yakolakRoomMenuCss';
  link.rel='stylesheet';
  link.href='./styles/v122-room-menu.css?v=122-stage1';
  document.head.append(link);
}
injectCss();

async function waitForBase(){
  for(let i=0;i<240;i++){
    const game=globalThis.__yakolakGame;
    const entry=globalThis.__yakolakV121Entry;
    if(game?.camera&&game?.renderer&&game?.gameGroup?.parent&&entry?.choose)return{game,entry};
    await wait(25);
  }
  throw new Error('v122 base scene did not become ready');
}

function createSettings(){
  if(document.getElementById('yakolakFloatingSettings'))return;
  const button=document.createElement('button');
  button.id='yakolakFloatingSettings';
  button.type='button';
  button.setAttribute('aria-label','الإعدادات');
  button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z"></path><path d="M19.2 13.5v-3l-2.1-.7a7 7 0 0 0-.7-1.6l1-2-2.1-2.1-2 .9a7 7 0 0 0-1.6-.7L11 2.2H8l-.7 2.1a7 7 0 0 0-1.6.7l-2-.9-2.1 2.1 1 2a7 7 0 0 0-.7 1.6l-1 2 2.1 2.1 2-.9c.5.3 1 .5 1.6.7l.7 2.1h3l.7-2.1c.6-.2 1.1-.4 1.6-.7l2 .9 2.1-2.1-1-2c.3-.5.5-1 .7-1.6l2.1-.7Z" transform="translate(1.5 0)"></path></svg>';
  const panel=document.createElement('div');
  panel.id='yakolakEntrySettings';
  const home=document.createElement('button');
  home.type='button';
  home.textContent='العودة إلى الجدار الرئيسي';
  home.onclick=()=>location.reload();
  const language=document.createElement('button');
  language.type='button';
  language.textContent='اللغة: العربية';
  const note=document.createElement('small');
  note.textContent='English سيتم تطويرها لاحقًا';
  panel.append(home,language,note);
  button.onclick=e=>{e.stopPropagation();panel.classList.toggle('open')};
  document.addEventListener('pointerdown',e=>{
    if(!panel.contains(e.target)&&e.target!==button)panel.classList.remove('open');
  });
  document.body.append(button,panel);
}

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
function drawGlobe(ctx,x,y,r){
  ctx.save();
  ctx.strokeStyle='rgba(222,247,255,.92)';
  ctx.lineWidth=4;
  ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();
  ctx.beginPath();ctx.ellipse(x,y,r*.48,r,0,0,Math.PI*2);ctx.stroke();
  ctx.beginPath();ctx.ellipse(x,y,r*.78,r,0,0,Math.PI*2);ctx.stroke();
  ctx.beginPath();ctx.moveTo(x-r,y-r*.34);ctx.lineTo(x+r,y-r*.34);ctx.stroke();
  ctx.beginPath();ctx.moveTo(x-r,y+r*.34);ctx.lineTo(x+r,y+r*.34);ctx.stroke();
  ctx.restore();
}

async function initStageOne(){
  const {game,entry}=await waitForBase();
  const {THREE,camera,renderer,gameGroup,setupGroup,pieces,meshes,render,setResponsiveOverview}=game;
  const scene=gameGroup.parent;
  const rows=[
    {mode:'online',icon:'◉',title:'ألعب أونلاين',note:'أنشئ غرفة أو ادخل برمز صديقك',y:560},
    {mode:'computer',icon:'▣',title:'مع الكمبيوتر',note:'ابدأ مباراة سريعة ضد الكمبيوتر',y:800},
    {mode:'learn',icon:'؟',title:'اشرحلي اللعبة',note:'تعلم طرق الفوز ثم جرّب بنفسك',y:1040}
  ];
  const canvas=document.createElement('canvas');
  canvas.width=1200;
  canvas.height=1600;
  const ctx=canvas.getContext('2d');
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;
  texture.magFilter=THREE.LinearFilter;

  let active=false,choosing=false,hover='',selected='',opacity=0;
  const group=new THREE.Group();
  group.name='yakolak-diegetic-wall-menu';
  group.position.set(0,250,-2386);
  const materials=[];

  const haloMat=new THREE.MeshBasicMaterial({
    color:0x55c9e8,transparent:true,opacity:0,depthWrite:false,
    blending:THREE.AdditiveBlending,side:THREE.DoubleSide,toneMapped:false
  });
  haloMat.userData.baseOpacity=.08;
  const halo=new THREE.Mesh(new THREE.PlaneGeometry(1008,1272),haloMat);
  halo.position.z=-1;
  halo.renderOrder=9000;
  group.add(halo);
  materials.push(haloMat);

  const menuMat=new THREE.MeshBasicMaterial({
    map:texture,transparent:true,opacity:0,depthWrite:false,
    side:THREE.DoubleSide,toneMapped:false
  });
  menuMat.userData.baseOpacity=1;
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(900,1200),menuMat);
  screen.name='yakolak-wall-projection-surface';
  screen.renderOrder=9010;
  group.add(screen);
  materials.push(menuMat);

  const hitMaterial=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
  const hits=rows.map(row=>{
    const hit=new THREE.Mesh(new THREE.PlaneGeometry(720,145),hitMaterial.clone());
    hit.position.set(0,(0.5-((row.y+95)/1600))*1200,4);
    hit.userData.mode=row.mode;
    hit.name='yakolak-wall-choice-'+row.mode;
    hit.renderOrder=9020;
    group.add(hit);
    return hit;
  });
  scene.add(group);

  function draw(){
    ctx.clearRect(0,0,1200,1600);
    const wash=ctx.createRadialGradient(600,760,80,600,760,760);
    wash.addColorStop(0,'rgba(93,211,242,.15)');
    wash.addColorStop(.62,'rgba(24,83,108,.07)');
    wash.addColorStop(1,'rgba(4,17,24,0)');
    ctx.fillStyle=wash;
    ctx.fillRect(0,0,1200,1600);

    ctx.save();
    ctx.shadowColor='rgba(117,226,255,.72)';
    ctx.shadowBlur=24;
    ctx.fillStyle='rgba(224,249,255,.94)';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.direction='ltr';
    ctx.font='900 34px system-ui, sans-serif';
    ctx.fillText('YAKOLAK',600,155);
    ctx.restore();

    ctx.save();
    ctx.direction='rtl';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillStyle='rgba(242,252,255,.98)';
    ctx.shadowColor='rgba(87,203,238,.72)';
    ctx.shadowBlur=28;
    ctx.font='900 112px ExpoYakolak, system-ui, sans-serif';
    ctx.fillText('ياكلك',600,285);
    ctx.shadowBlur=0;
    ctx.fillStyle='rgba(208,232,240,.88)';
    ctx.font='700 31px system-ui, sans-serif';
    ctx.fillText('اختر كيف تحب تبدأ اللعبة',600,385);
    ctx.restore();

    drawGlobe(ctx,980,432,35);
    ctx.save();
    ctx.direction='rtl';
    ctx.textAlign='right';
    ctx.textBaseline='middle';
    ctx.fillStyle='rgba(224,247,253,.92)';
    ctx.font='800 27px system-ui, sans-serif';
    ctx.fillText('العربية',920,423);
    ctx.fillStyle='rgba(179,207,216,.55)';
    ctx.font='650 21px system-ui, sans-serif';
    ctx.fillText('English · لاحقًا',920,458);
    ctx.restore();

    rows.forEach(row=>{
      const isSelected=selected===row.mode;
      const isHover=hover===row.mode;
      const x=120,w=960,h=190;
      ctx.save();
      ctx.shadowColor=isSelected?'rgba(118,229,255,.75)':isHover?'rgba(88,205,239,.5)':'rgba(33,151,187,.25)';
      ctx.shadowBlur=isSelected?34:isHover?25:16;
      roundRect(ctx,x,row.y,w,h,30);
      ctx.fillStyle=isSelected?'rgba(89,190,222,.26)':isHover?'rgba(68,142,168,.20)':'rgba(15,54,69,.15)';
      ctx.fill();
      ctx.shadowBlur=0;
      ctx.strokeStyle=isSelected?'rgba(190,244,255,.95)':isHover?'rgba(165,231,247,.8)':'rgba(156,220,236,.46)';
      ctx.lineWidth=isSelected?5:3;
      ctx.stroke();
      ctx.direction='rtl';
      ctx.textAlign='right';
      ctx.textBaseline='middle';
      ctx.fillStyle='rgba(244,253,255,.98)';
      ctx.font='900 47px ExpoYakolak, system-ui, sans-serif';
      ctx.fillText(row.title,970,row.y+70);
      ctx.fillStyle='rgba(201,226,234,.8)';
      ctx.font='650 25px system-ui, sans-serif';
      ctx.fillText(row.note,970,row.y+128);
      ctx.textAlign='center';
      ctx.fillStyle=isSelected?'rgba(226,251,255,1)':'rgba(203,238,247,.92)';
      ctx.font='900 58px system-ui, sans-serif';
      ctx.fillText(row.icon,205,row.y+95);
      ctx.restore();
    });

    ctx.save();
    ctx.direction='rtl';
    ctx.textAlign='center';
    ctx.fillStyle='rgba(188,218,228,.62)';
    ctx.font='650 23px system-ui, sans-serif';
    ctx.fillText('القائمة معروضة من داخل غرفة ياكلك',600,1405);
    ctx.restore();
    texture.needsUpdate=true;
    render();
  }

  function setOpacity(value){
    opacity=value;
    materials.forEach(mat=>{
      mat.opacity=(mat.userData.baseOpacity||1)*value;
      mat.needsUpdate=true;
    });
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
  function overviewPose(){
    const portrait=innerHeight>innerWidth*1.18;
    const compact=!portrait&&(innerWidth<=900||innerHeight<=600);
    if(portrait)return{pos:[330,560,455],target:[0,18,0],fov:46};
    if(compact)return{pos:[245,325,285],target:[0,0,0],fov:45};
    return{pos:[520,430,520],target:[0,0,0],fov:43};
  }
  function wallPose(){
    const portrait=innerHeight>innerWidth*1.18;
    if(portrait)return{pos:[0,250,-180],target:[0,250,-2386],fov:48};
    if(innerWidth<=900||innerHeight<=600)return{pos:[0,245,-520],target:[0,245,-2386],fov:46};
    return{pos:[0,250,-800],target:[0,250,-2386],fov:42};
  }
  function setCamera(pose){
    camera.position.set(...pose.pos);
    camera.fov=pose.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(new THREE.Vector3(...pose.target));
    render();
  }
  function moveCamera(pose,ms){
    if(ms<=20){setCamera(pose);return Promise.resolve()}
    const fromPos=camera.position.clone();
    const toPos=new THREE.Vector3(...pose.pos);
    const fromQuat=camera.quaternion.clone();
    const probe=camera.clone();
    probe.position.copy(toPos);
    probe.lookAt(new THREE.Vector3(...pose.target));
    const toQuat=probe.quaternion.clone();
    const fromFov=camera.fov;
    const t0=performance.now();
    return new Promise(resolve=>{
      const step=now=>{
        const q=ease((now-t0)/ms);
        camera.position.lerpVectors(fromPos,toPos,q);
        camera.quaternion.slerpQuaternions(fromQuat,toQuat,q);
        camera.fov=fromFov+(pose.fov-fromFov)*q;
        camera.updateProjectionMatrix();
        render();
        if(q<1)requestAnimationFrame(step);else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  function lockClosedTable(){
    const state=game.state;
    state.configured=false;
    state.started=false;
    state.locked=true;
    state.winner=null;
    setupGroup.visible=false;
    document.getElementById('yakolakGameSetup')?.classList.add('hidden');
    pieces.forEach(piece=>piece.mesh.visible=false);
    Object.values(meshes).forEach(mesh=>{if(mesh)mesh.visible=true});
    const known=new Set([...Object.values(meshes),...pieces.map(piece=>piece.mesh)]);
    const lid=gameGroup.children.find(child=>child.isMesh&&!known.has(child)&&child.geometry===meshes['9']?.geometry);
    if(lid)lid.visible=true;
    render();
  }

  const pointer=new THREE.Vector2();
  const raycaster=new THREE.Raycaster();
  function modeAt(e){
    const rect=renderer.domElement.getBoundingClientRect();
    pointer.x=((e.clientX-rect.left)/rect.width)*2-1;
    pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;
    raycaster.setFromCamera(pointer,camera);
    return raycaster.intersectObjects(hits,false)[0]?.object?.userData?.mode||'';
  }
  function onMove(e){
    if(!active||choosing)return;
    const mode=modeAt(e);
    if(mode===hover)return;
    hover=mode;
    renderer.domElement.style.cursor=mode?'pointer':'';
    draw();
  }
  async function choose(mode){
    if(choosing)return;
    choosing=true;
    active=false;
    selected=mode;
    hover='';
    renderer.domElement.style.cursor='';
    draw();
    await wait(reduced?10:210);
    await moveCamera(overviewPose(),reduced?10:1250);
    setResponsiveOverview();
    document.body.classList.remove('yakolak-room-sequence','yakolak-wall-menu-active');
    document.body.classList.add('yakolak-entry-complete');
    const route=entry.choose(mode);
    await wait(reduced?10:650);
    await fade(0,reduced?10:820);
    group.visible=false;
    await route;
  }
  function onDown(e){
    if(!active||choosing)return;
    const mode=modeAt(e);
    if(!mode)return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    void choose(mode);
  }

  renderer.domElement.addEventListener('pointermove',onMove,{passive:true,capture:true});
  renderer.domElement.addEventListener('pointerdown',onDown,{passive:false,capture:true});
  addEventListener('resize',()=>{
    if(active&&!choosing)setCamera(wallPose());
  },{passive:true});

  document.body.classList.add('yakolak-room-sequence');
  createSettings();
  lockClosedTable();
  draw();
  setOpacity(0);
  setCamera(overviewPose());
  await wait(reduced?10:900);
  await moveCamera(wallPose(),reduced?10:1450);
  await fade(1,reduced?10:620);
  active=true;
  document.body.classList.add('yakolak-wall-menu-active');
  globalThis.__yakolakV122RoomMenu={stage:1,choose,group,returnToWall:()=>location.reload()};
}

void initStageOne().catch(error=>{
  console.error('[Yakolak] v122 stage 1 failed',error);
  globalThis.__yakolakLoading?.set?.(100,'تعذر تجهيز القائمة الجدارية');
});
