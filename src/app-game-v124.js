console.info('[Yakolak] APP GAME v124 ROOM SERVICES STAGE 3 LOADED');

await import('./app-game-v123.js?v=126-unified-gameplay-stage3');

const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const ease=t=>{t=clamp(t,0,1);return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2};
const VALID_CODE=/^[A-HJ-NP-Z2-9]{6}$/;
const KEYS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.split('');

function injectCss(){
  if(document.getElementById('yakolakRoomServicesCss'))return;
  const link=document.createElement('link');
  link.id='yakolakRoomServicesCss';
  link.rel='stylesheet';
  link.href='./styles/v124-room-services.css?v=124-stage3';
  document.head.append(link);
}
injectCss();

async function waitForStageTwo(){
  for(let i=0;i<360;i++){
    const game=globalThis.__yakolakGame;
    const entry=globalThis.__yakolakV121Entry;
    const roomMenu=globalThis.__yakolakV122RoomMenu;
    const tabletop=globalThis.__yakolakV123TabletopSetup;
    if(game?.THREE&&game?.renderer&&game?.camera&&game?.gameGroup&&entry?.choose&&roomMenu?.stage===1&&tabletop?.stage===2){
      return{game,entry,roomMenu,tabletop};
    }
    await wait(25);
  }
  throw new Error('v124 stage 3 base did not become ready');
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

function textButton(ctx,actions,id,label,x,y,w,h,{active=false,small=false}={}){
  ctx.save();
  ctx.shadowColor=active?'rgba(105,225,255,.72)':'rgba(44,160,194,.34)';
  ctx.shadowBlur=active?28:16;
  roundRect(ctx,x,y,w,h,26);
  ctx.fillStyle=active?'rgba(73,174,205,.30)':'rgba(12,58,75,.30)';
  ctx.fill();
  ctx.shadowBlur=0;
  ctx.strokeStyle=active?'rgba(214,250,255,.95)':'rgba(157,225,242,.62)';
  ctx.lineWidth=active?5:3;
  ctx.stroke();
  ctx.direction='rtl';
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillStyle='rgba(242,253,255,.98)';
  ctx.font=`900 ${small?27:40}px ExpoYakolak, system-ui, sans-serif`;
  ctx.fillText(label,x+w/2,y+h/2+2);
  ctx.restore();
  actions.push({id,x,y,w,h});
}

function hitFromUv(hit,canvas,actions){
  if(!hit?.uv)return'';
  const x=hit.uv.x*canvas.width;
  const y=(1-hit.uv.y)*canvas.height;
  return actions.find(action=>x>=action.x&&x<=action.x+action.w&&y>=action.y&&y<=action.y+action.h)?.id||'';
}

async function initStageThree(){
  const {game,entry}=await waitForStageTwo();
  const {THREE,renderer,camera,gameGroup,render,setResponsiveOverview,setupGroup}=game;
  const scene=gameGroup.parent;
  document.body.classList.add('yakolak-stage3-room-services');

  const raycaster=new THREE.Raycaster();
  const pointer=new THREE.Vector2();
  function rayHit(event,object){
    const rect=renderer.domElement.getBoundingClientRect();
    pointer.x=((event.clientX-rect.left)/rect.width)*2-1;
    pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;
    raycaster.setFromCamera(pointer,camera);
    return raycaster.intersectObject(object,false)[0]||null;
  }

  function cameraPoseForSideWall(){
    const portrait=innerHeight>innerWidth*1.18;
    if(portrait)return{pos:[820,280,0],target:[2386,280,0],fov:49};
    if(innerWidth<=900||innerHeight<=600)return{pos:[980,250,0],target:[2386,250,0],fov:47};
    return{pos:[1080,260,0],target:[2386,260,0],fov:43};
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

  const serviceCanvas=document.createElement('canvas');
  serviceCanvas.width=1400;
  serviceCanvas.height=1600;
  const serviceCtx=serviceCanvas.getContext('2d');
  const serviceTexture=new THREE.CanvasTexture(serviceCanvas);
  serviceTexture.colorSpace=THREE.SRGBColorSpace;
  serviceTexture.minFilter=THREE.LinearFilter;
  serviceTexture.magFilter=THREE.LinearFilter;
  const serviceMat=new THREE.MeshBasicMaterial({map:serviceTexture,transparent:true,opacity:0,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
  const serviceScreen=new THREE.Mesh(new THREE.PlaneGeometry(980,1120),serviceMat);
  serviceScreen.name='yakolak-room-online-service-screen';
  serviceScreen.renderOrder=9040;
  const serviceHaloMat=new THREE.MeshBasicMaterial({color:0x55c9e8,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,side:THREE.DoubleSide});
  const serviceHalo=new THREE.Mesh(new THREE.PlaneGeometry(1040,1180),serviceHaloMat);
  serviceHalo.position.z=-3;
  serviceHalo.renderOrder=9039;
  const serviceGroup=new THREE.Group();
  serviceGroup.name='yakolak-room-online-service';
  serviceGroup.position.set(2386,260,0);
  serviceGroup.rotation.y=-Math.PI/2;
  serviceGroup.visible=false;
  serviceGroup.add(serviceHalo,serviceScreen);
  scene.add(serviceGroup);

  let serviceActive=false;
  let serviceOpacity=0;
  let serviceState='home';
  let roomCode='';
  let serviceStatus='';
  let serviceHover='';
  let serviceActions=[];

  function serviceSetOpacity(value){
    serviceOpacity=clamp(value,0,1);
    serviceMat.opacity=serviceOpacity;
    serviceHaloMat.opacity=serviceOpacity*.1;
    serviceGroup.visible=serviceOpacity>.002;
    render();
  }
  function serviceFade(to,ms){
    const from=serviceOpacity;
    if(ms<=20){serviceSetOpacity(to);return Promise.resolve()}
    const t0=performance.now();
    return new Promise(resolve=>{
      const step=now=>{
        const q=ease((now-t0)/ms);
        serviceSetOpacity(from+(to-from)*q);
        if(q<1)requestAnimationFrame(step);else resolve();
      };
      requestAnimationFrame(step);
    });
  }
  function drawService(){
    serviceActions=[];
    const ctx=serviceCtx;
    ctx.clearRect(0,0,1400,1600);
    const wash=ctx.createRadialGradient(700,760,80,700,760,820);
    wash.addColorStop(0,'rgba(77,194,226,.18)');
    wash.addColorStop(.65,'rgba(18,75,95,.08)');
    wash.addColorStop(1,'rgba(2,13,19,0)');
    ctx.fillStyle=wash;ctx.fillRect(0,0,1400,1600);
    ctx.direction='rtl';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle='rgba(184,230,242,.75)';ctx.font='800 31px system-ui, sans-serif';
    ctx.fillText('خدمة الأونلاين داخل غرفة ياكلك',700,120);
    ctx.fillStyle='rgba(244,253,255,.98)';ctx.shadowColor='rgba(89,207,239,.7)';ctx.shadowBlur=26;
    ctx.font='900 82px ExpoYakolak, system-ui, sans-serif';
    ctx.fillText(serviceState==='code'?'أدخل رمز الغرفة':'اللعب أونلاين',700,230);ctx.shadowBlur=0;

    if(serviceState==='home'){
      ctx.fillStyle='rgba(205,232,239,.86)';ctx.font='650 30px system-ui, sans-serif';
      ctx.fillText('اختر إنشاء غرفة جديدة أو الدخول إلى غرفة صديقك',700,325);
      textButton(ctx,serviceActions,'create','إنشاء غرفة',210,430,980,180,{active:serviceHover==='create'});
      textButton(ctx,serviceActions,'join','دخول برمز',210,660,980,180,{active:serviceHover==='join'});
      textButton(ctx,serviceActions,'home','العودة للقائمة الرئيسية',330,1135,740,120,{small:true,active:serviceHover==='home'});
    }else if(serviceState==='code'){
      ctx.fillStyle='rgba(203,231,239,.82)';ctx.font='650 28px system-ui, sans-serif';
      ctx.fillText('اكتب من لوحة المفاتيح أو المس الحروف المعروضة',700,318);
      const sx=260,sw=880,gap=18,box=(sw-gap*5)/6;
      for(let i=0;i<6;i++){
        roundRect(ctx,sx+i*(box+gap),372,box,104,20);
        ctx.fillStyle=i<roomCode.length?'rgba(77,174,204,.28)':'rgba(10,50,65,.26)';ctx.fill();
        ctx.strokeStyle='rgba(163,229,245,.66)';ctx.lineWidth=3;ctx.stroke();
        ctx.fillStyle='rgba(244,253,255,.98)';ctx.font='900 48px system-ui, sans-serif';
        ctx.fillText(roomCode[i]||'—',sx+i*(box+gap)+box/2,425);
      }
      const cols=8,keyW=132,keyH=98,gx=15,gy=16,startX=120,startY=540;
      KEYS.forEach((key,index)=>{
        const col=index%cols,row=Math.floor(index/cols);
        textButton(ctx,serviceActions,'key:'+key,key,startX+col*(keyW+gx),startY+row*(keyH+gy),keyW,keyH,{small:true,active:serviceHover==='key:'+key});
      });
      textButton(ctx,serviceActions,'erase','حذف',120,1020,300,108,{small:true,active:serviceHover==='erase'});
      textButton(ctx,serviceActions,'clear','مسح',445,1020,300,108,{small:true,active:serviceHover==='clear'});
      textButton(ctx,serviceActions,'submit','دخول',770,1020,510,108,{small:true,active:serviceHover==='submit'});
      textButton(ctx,serviceActions,'back','رجوع',330,1190,740,112,{small:true,active:serviceHover==='back'});
    }else{
      ctx.fillStyle='rgba(210,237,244,.9)';ctx.font='750 34px system-ui, sans-serif';
      ctx.fillText(serviceStatus||'جاري تجهيز الخدمة…',700,600);
      ctx.fillStyle='rgba(122,220,246,.9)';ctx.font='900 72px system-ui, sans-serif';
      ctx.fillText('•••',700,720);
      if(serviceState==='error')textButton(ctx,serviceActions,'back','العودة وإعادة المحاولة',310,980,780,130,{active:serviceHover==='back'});
    }
    ctx.fillStyle='rgba(166,211,223,.58)';ctx.font='650 23px system-ui, sans-serif';
    ctx.fillText('لا توجد نافذة خارجية — كل الخطوات معروضة على جدار الغرفة',700,1450);
    serviceTexture.needsUpdate=true;
    render();
  }

  function backendButton(label){
    return [...document.querySelectorAll('#yakolakOnlineDialog button')].find(button=>button.textContent.trim()===label)||null;
  }
  function openBackendHome(){
    const onlineEntry=document.getElementById('yakolakOnlineEntry');
    if(!onlineEntry)throw new Error('تعذر تجهيز نظام الأونلاين.');
    onlineEntry.click();
  }
  async function finishServiceToTable(){
    await serviceFade(0,reduced?10:360);
    serviceActive=false;
    serviceGroup.visible=false;
    document.body.classList.remove('yakolak-room-service-active');
    renderer.domElement.style.cursor='';
    setResponsiveOverview();
    render();
  }
  async function beginCreate(){
    serviceState='loading';serviceStatus='نجهز إنشاء الغرفة فوق الطاولة…';drawService();
    try{
      openBackendHome();
      await wait(80);
      const create=backendButton('إنشاء غرفة');
      if(!create)throw new Error('تعذر العثور على خيار إنشاء الغرفة.');
      create.click();
      for(let i=0;i<50;i++){
        if(document.body.classList.contains('yakolak-online-native-setup')){await finishServiceToTable();return}
        await wait(60);
      }
      throw new Error('تأخر تجهيز إعداد الغرفة.');
    }catch(error){serviceState='error';serviceStatus=error.message||'تعذر إنشاء الغرفة.';drawService()}
  }
  async function beginJoin(){
    if(!VALID_CODE.test(roomCode)){serviceState='error';serviceStatus='اكتب رمزًا صحيحًا من 6 خانات.';drawService();return}
    serviceState='loading';serviceStatus='نتحقق من رمز الغرفة داخل النظام…';drawService();
    try{
      openBackendHome();
      await wait(80);
      const input=document.getElementById('yakolakRoomCode');
      const join=backendButton('دخول برمز');
      if(!input||!join)throw new Error('تعذر تجهيز إدخال الرمز.');
      input.value=roomCode;
      input.dispatchEvent(new Event('input',{bubbles:true}));
      join.click();
      for(let i=0;i<130;i++){
        if(document.body.classList.contains('yakolak-online-native-setup')){await finishServiceToTable();return}
        const status=document.querySelector('#yakolakOnlineDialog .yo-status')?.textContent?.trim();
        if(status&&/(غير موجودة|اكتمل|تأكد|تعذر|انتهت)/.test(status))throw new Error(status);
        await wait(60);
      }
      throw new Error(document.querySelector('#yakolakOnlineDialog .yo-status')?.textContent?.trim()||'تأخر التحقق من الغرفة.');
    }catch(error){serviceState='error';serviceStatus=error.message||'تعذر دخول الغرفة.';drawService()}
  }
  function handleServiceAction(action){
    if(!action)return;
    if(action==='create'){void beginCreate();return}
    if(action==='join'){serviceState='code';serviceStatus='';drawService();return}
    if(action==='home'){location.reload();return}
    if(action==='back'){serviceState='home';serviceStatus='';drawService();return}
    if(action==='erase'){roomCode=roomCode.slice(0,-1);drawService();return}
    if(action==='clear'){roomCode='';drawService();return}
    if(action==='submit'){void beginJoin();return}
    if(action.startsWith('key:')&&roomCode.length<6){roomCode+=action.slice(4);drawService()}
  }
  async function showOnlineService(){
    serviceActive=true;
    serviceState='home';serviceStatus='';roomCode='';serviceHover='';drawService();serviceSetOpacity(0);
    document.body.classList.add('yakolak-room-service-active');
    await wait(reduced?10:820);
    await moveCamera(cameraPoseForSideWall(),reduced?10:980);
    await serviceFade(1,reduced?10:460);
  }

  const learnCanvas=document.createElement('canvas');
  learnCanvas.width=1400;
  learnCanvas.height=900;
  const learnCtx=learnCanvas.getContext('2d');
  const learnTexture=new THREE.CanvasTexture(learnCanvas);
  learnTexture.colorSpace=THREE.SRGBColorSpace;
  const learnMat=new THREE.MeshBasicMaterial({map:learnTexture,transparent:true,opacity:0,depthWrite:false,depthTest:false,toneMapped:false,side:THREE.DoubleSide});
  const learnScreen=new THREE.Mesh(new THREE.PlaneGeometry(610,392),learnMat);
  learnScreen.name='yakolak-room-howto-screen';
  learnScreen.position.set(0,235,-245);
  learnScreen.rotation.x=-0.1;
  learnScreen.renderOrder=10080;
  const learnGlowMat=new THREE.MeshBasicMaterial({color:0x55c9e8,transparent:true,opacity:0,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,toneMapped:false,side:THREE.DoubleSide});
  const learnGlow=new THREE.Mesh(new THREE.PlaneGeometry(645,420),learnGlowMat);
  learnGlow.position.copy(learnScreen.position);learnGlow.position.z-=3;learnGlow.rotation.copy(learnScreen.rotation);learnGlow.renderOrder=10079;
  gameGroup.add(learnGlow,learnScreen);
  let learnActive=false,learnOpacity=0,learnPage=0,learnHover='',learnActions=[];
  const lessons=[
    {title:'ثلاث قطع من الحجم نفسه',note:'ضع ثلاث قطع متساوية الحجم على خط أفقي أو رأسي أو قطري.',type:'same'},
    {title:'صغير ووسط وكبير على خط',note:'يمكن أن تربح بخط متدرج من الأحجام الثلاثة.',type:'graded'},
    {title:'الأحجام الثلاثة في خانة واحدة',note:'اجمع الصغير والوسط والكبير داخل الدائرة نفسها.',type:'cell'}
  ];
  function drawLessonDiagram(type){
    const ctx=learnCtx,ox=250,oy=365,step=105;
    ctx.strokeStyle='rgba(168,228,243,.42)';ctx.lineWidth=3;
    for(let i=0;i<3;i++)for(let j=0;j<3;j++){ctx.beginPath();ctx.arc(ox+j*step,oy+i*step,38,0,Math.PI*2);ctx.stroke()}
    ctx.strokeStyle='rgba(205,249,255,.95)';ctx.fillStyle='rgba(91,205,235,.32)';ctx.lineWidth=8;ctx.shadowColor='rgba(83,213,246,.75)';ctx.shadowBlur=20;
    const ring=(x,y,r)=>{ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke()};
    if(type==='same'){[0,1,2].forEach(j=>ring(ox+j*step,oy+step,28))}
    if(type==='graded'){ring(ox,oy+step*2,16);ring(ox+step,oy+step,25);ring(ox+step*2,oy,34)}
    if(type==='cell'){ring(ox+step,oy+step,13);ring(ox+step,oy+step,25);ring(ox+step,oy+step,36)}
    ctx.shadowBlur=0;
  }
  function drawLearn(){
    learnActions=[];
    const ctx=learnCtx,lesson=lessons[learnPage];
    ctx.clearRect(0,0,1400,900);
    const wash=ctx.createLinearGradient(0,0,1400,900);wash.addColorStop(0,'rgba(5,29,39,.22)');wash.addColorStop(.5,'rgba(23,86,108,.42)');wash.addColorStop(1,'rgba(4,25,34,.22)');
    ctx.fillStyle=wash;roundRect(ctx,28,28,1344,844,42);ctx.fill();ctx.strokeStyle='rgba(166,231,247,.65)';ctx.lineWidth=4;ctx.stroke();
    ctx.direction='rtl';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle='rgba(174,225,239,.76)';ctx.font='750 26px system-ui, sans-serif';ctx.fillText(`طريقة الفوز ${learnPage+1} من 3`,700,90);
    ctx.fillStyle='rgba(245,253,255,.98)';ctx.shadowColor='rgba(89,207,239,.72)';ctx.shadowBlur=24;ctx.font='900 62px ExpoYakolak, system-ui, sans-serif';ctx.fillText(lesson.title,840,195);ctx.shadowBlur=0;
    ctx.fillStyle='rgba(210,236,243,.88)';ctx.font='650 28px system-ui, sans-serif';
    const words=lesson.note.split(' ');let line='',lines=[];for(const word of words){const next=line?line+' '+word:word;if(ctx.measureText(next).width>650&&line){lines.push(line);line=word}else line=next}if(line)lines.push(line);
    lines.forEach((txt,i)=>ctx.fillText(txt,840,285+i*40));
    drawLessonDiagram(lesson.type);
    if(learnPage>0)textButton(ctx,learnActions,'prev','السابق',100,730,300,105,{small:true,active:learnHover==='prev'});
    textButton(ctx,learnActions,learnPage===2?'start':'next',learnPage===2?'ابدأ التدريب':'التالي',learnPage>0?880:900,730,400,105,{small:true,active:learnHover===(learnPage===2?'start':'next')});
    textButton(ctx,learnActions,'exit','العودة للقائمة',450,730,390,105,{small:true,active:learnHover==='exit'});
    learnTexture.needsUpdate=true;render();
  }
  function learnSetOpacity(value){
    learnOpacity=clamp(value,0,1);learnMat.opacity=learnOpacity;learnGlowMat.opacity=learnOpacity*.12;learnScreen.visible=learnOpacity>.002;learnGlow.visible=learnOpacity>.002;render();
  }
  function learnFade(to,ms){
    const from=learnOpacity;if(ms<=20){learnSetOpacity(to);return Promise.resolve()}
    const t0=performance.now();return new Promise(resolve=>{const step=now=>{const q=ease((now-t0)/ms);learnSetOpacity(from+(to-from)*q);if(q<1)requestAnimationFrame(step);else resolve()};requestAnimationFrame(step)});
  }
  function prepareComputerFromRoom(){
    try{localStorage.removeItem('yakolak-tutorial-v112-complete')}catch{}
    game.state.configured=false;game.state.started=false;game.state.locked=false;game.state.humanColor=null;game.state.players=[];game.state.setupStep='color';
    document.body.classList.remove('yakolak-online-native-setup','yakolak-online-waiting');
    setupGroup.visible=true;
    game.renderSetup3D();
    setResponsiveOverview();
    render();
  }
  async function startTraining(){
    await learnFade(0,reduced?10:360);learnActive=false;learnScreen.visible=false;learnGlow.visible=false;renderer.domElement.style.cursor='';document.body.classList.remove('yakolak-room-howto-active');prepareComputerFromRoom();
  }
  function handleLearnAction(action){
    if(action==='next'){learnPage=Math.min(2,learnPage+1);drawLearn();return}
    if(action==='prev'){learnPage=Math.max(0,learnPage-1);drawLearn();return}
    if(action==='exit'){location.reload();return}
    if(action==='start')void startTraining();
  }
  async function showLearn(){
    learnActive=true;learnPage=0;learnHover='';drawLearn();learnSetOpacity(0);document.body.classList.add('yakolak-room-howto-active');
    await wait(reduced?10:700);
    setResponsiveOverview();
    await learnFade(1,reduced?10:460);
  }

  const lobbyCanvas=document.createElement('canvas');lobbyCanvas.width=1200;lobbyCanvas.height=500;
  const lobbyCtx=lobbyCanvas.getContext('2d');
  const lobbyTexture=new THREE.CanvasTexture(lobbyCanvas);lobbyTexture.colorSpace=THREE.SRGBColorSpace;
  const lobbyMat=new THREE.MeshBasicMaterial({map:lobbyTexture,transparent:true,opacity:0,depthWrite:false,depthTest:false,toneMapped:false,side:THREE.DoubleSide});
  const lobbyScreen=new THREE.Mesh(new THREE.PlaneGeometry(520,217),lobbyMat);lobbyScreen.name='yakolak-room-lobby-screen';lobbyScreen.position.set(0,196,-235);lobbyScreen.rotation.x=-.11;lobbyScreen.renderOrder=10082;
  gameGroup.add(lobbyScreen);
  let lobbyVisible=false,lobbyActions=[];
  function drawLobby(){
    lobbyActions=[];const code=document.querySelector('#yakolakOnlineDialog .yo-code')?.textContent?.trim()||new URL(location.href).searchParams.get('room')||'------';
    const players=document.querySelectorAll('#yakolakOnlineDialog .yo-lobby-player:not(.empty)').length;
    const total=document.querySelectorAll('#yakolakOnlineDialog .yo-lobby-player').length||'?';
    const status=document.querySelector('#yakolakOnlineDialog .yo-status')?.textContent?.trim()||'بانتظار بقية اللاعبين…';
    const ctx=lobbyCtx;ctx.clearRect(0,0,1200,500);ctx.fillStyle='rgba(8,42,56,.78)';roundRect(ctx,18,18,1164,464,36);ctx.fill();ctx.strokeStyle='rgba(167,232,248,.7)';ctx.lineWidth=4;ctx.stroke();
    ctx.direction='rtl';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='rgba(182,229,241,.76)';ctx.font='700 25px system-ui, sans-serif';ctx.fillText(`الغرفة جاهزة · ${players}/${total}`,600,72);
    ctx.fillStyle='rgba(245,253,255,.99)';ctx.shadowColor='rgba(89,207,239,.75)';ctx.shadowBlur=24;ctx.font='900 78px system-ui, sans-serif';ctx.fillText(code,600,165);ctx.shadowBlur=0;
    ctx.fillStyle='rgba(210,236,243,.88)';ctx.font='650 27px system-ui, sans-serif';ctx.fillText(status,600,238);
    textButton(ctx,lobbyActions,'copy','نسخ رابط الدعوة',95,315,475,105,{small:true});
    textButton(ctx,lobbyActions,'leave','إلغاء / مغادرة',630,315,475,105,{small:true});
    lobbyTexture.needsUpdate=true;render();
  }
  function syncLobby(){
    const should=document.body.classList.contains('yakolak-online-waiting');
    if(should){if(!lobbyVisible){lobbyVisible=true;lobbyScreen.visible=true;lobbyMat.opacity=1}drawLobby()}
    else if(lobbyVisible){lobbyVisible=false;lobbyMat.opacity=0;lobbyScreen.visible=false;render()}
  }
  async function handleLobbyAction(action){
    if(action==='copy'){
      const hidden=backendButton('نسخ رابط الدعوة');if(hidden)hidden.click();else try{await navigator.clipboard.writeText(location.href)}catch{}
      drawLobby();return;
    }
    if(action==='leave'){
      const hidden=[...document.querySelectorAll('#yakolakOnlineDialog button')].find(button=>/(إلغاء الغرفة|مغادرة الغرفة)/.test(button.textContent));
      hidden?.click();
    }
  }

  const previousChoose=entry.choose.bind(entry);
  entry.choose=mode=>{
    if(mode==='online')return showOnlineService();
    if(mode==='learn')return showLearn();
    return previousChoose(mode);
  };

  renderer.domElement.addEventListener('pointermove',event=>{
    if(serviceActive){const action=hitFromUv(rayHit(event,serviceScreen),serviceCanvas,serviceActions);if(action!==serviceHover){serviceHover=action;renderer.domElement.style.cursor=action?'pointer':'';drawService()}return}
    if(learnActive){const action=hitFromUv(rayHit(event,learnScreen),learnCanvas,learnActions);if(action!==learnHover){learnHover=action;renderer.domElement.style.cursor=action?'pointer':'';drawLearn()}return}
    if(lobbyVisible){const action=hitFromUv(rayHit(event,lobbyScreen),lobbyCanvas,lobbyActions);renderer.domElement.style.cursor=action?'pointer':''}
  },{passive:true,capture:true});

  renderer.domElement.addEventListener('pointerdown',event=>{
    if(serviceActive){const action=hitFromUv(rayHit(event,serviceScreen),serviceCanvas,serviceActions);if(!action)return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();handleServiceAction(action);return}
    if(learnActive){const action=hitFromUv(rayHit(event,learnScreen),learnCanvas,learnActions);if(!action)return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();handleLearnAction(action);return}
    if(lobbyVisible){const action=hitFromUv(rayHit(event,lobbyScreen),lobbyCanvas,lobbyActions);if(!action)return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();void handleLobbyAction(action)}
  },{passive:false,capture:true});

  addEventListener('keydown',event=>{
    if(!serviceActive||serviceState!=='code')return;
    const key=event.key.toUpperCase();
    if(KEYS.includes(key)&&roomCode.length<6){roomCode+=key;drawService();event.preventDefault();return}
    if(event.key==='Backspace'){roomCode=roomCode.slice(0,-1);drawService();event.preventDefault();return}
    if(event.key==='Enter'){void beginJoin();event.preventDefault();return}
    if(event.key==='Escape'){serviceState='home';drawService();event.preventDefault()}
  });

  const lobbyTimer=setInterval(syncLobby,260);
  addEventListener('pagehide',()=>clearInterval(lobbyTimer),{once:true});
  addEventListener('resize',()=>{
    if(serviceActive)setCamera(cameraPoseForSideWall());
    if(learnActive)setResponsiveOverview();
  },{passive:true});

  learnSetOpacity(0);lobbyScreen.visible=false;lobbyMat.opacity=0;serviceSetOpacity(0);
  globalThis.__yakolakV124RoomServices={
    stage:3,
    serviceGroup,
    learnScreen,
    lobbyScreen,
    showOnlineService,
    showLearn,
    get serviceState(){return serviceState},
    get roomCode(){return roomCode}
  };
}

void initStageThree().catch(error=>{
  console.error('[Yakolak] v124 stage 3 failed',error);
  globalThis.__yakolakLoading?.set?.(100,'تعذر تجهيز خدمات الغرفة');
});
