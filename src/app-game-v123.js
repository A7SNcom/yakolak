console.info('[Yakolak] APP GAME v123 TABLETOP SETUP STAGE 2 LOADED');

await import('./app-game-v122.js?v=126-unified-gameplay-stage2');

const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const ease=t=>{t=clamp(t,0,1);return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2};

function injectCss(){
  if(document.getElementById('yakolakTabletopSetupCss'))return;
  const link=document.createElement('link');
  link.id='yakolakTabletopSetupCss';
  link.rel='stylesheet';
  link.href='./styles/v123-tabletop-setup.css?v=123-stage2';
  document.head.append(link);
}
injectCss();

async function waitForStageOne(){
  for(let i=0;i<320;i++){
    const game=globalThis.__yakolakGame;
    const wall=globalThis.__yakolakV122RoomMenu;
    const entry=globalThis.__yakolakV121Entry;
    if(game?.THREE&&game?.camera&&game?.renderer&&game?.gameGroup&&game?.setupGroup&&wall?.stage===1&&entry?.choose){
      return{game,wall,entry};
    }
    await wait(25);
  }
  throw new Error('v123 stage 2 base did not become ready');
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

async function initStageTwo(){
  const {game,entry}=await waitForStageOne();
  const {THREE,renderer,camera,gameGroup,setupGroup,render}=game;
  const canvas=document.createElement('canvas');
  canvas.width=1200;
  canvas.height=420;
  const ctx=canvas.getContext('2d');
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;
  texture.magFilter=THREE.LinearFilter;

  const panelMat=new THREE.MeshBasicMaterial({
    map:texture,
    transparent:true,
    opacity:0,
    depthWrite:false,
    depthTest:false,
    toneMapped:false,
    side:THREE.DoubleSide
  });
  const panel=new THREE.Mesh(new THREE.PlaneGeometry(520,182),panelMat);
  panel.name='yakolak-tabletop-setup-instruction';
  panel.position.set(0,190,-235);
  panel.rotation.x=-0.12;
  panel.renderOrder=10060;

  const glowMat=new THREE.MeshBasicMaterial({
    color:0x55c9e8,
    transparent:true,
    opacity:0,
    depthWrite:false,
    depthTest:false,
    blending:THREE.AdditiveBlending,
    toneMapped:false,
    side:THREE.DoubleSide
  });
  const glow=new THREE.Mesh(new THREE.PlaneGeometry(560,208),glowMat);
  glow.name='yakolak-tabletop-setup-glow';
  glow.position.copy(panel.position);
  glow.position.z-=3;
  glow.rotation.copy(panel.rotation);
  glow.renderOrder=10059;

  const lockCanvas=document.createElement('canvas');
  lockCanvas.width=512;
  lockCanvas.height=512;
  const lockCtx=lockCanvas.getContext('2d');
  const lockTexture=new THREE.CanvasTexture(lockCanvas);
  lockTexture.colorSpace=THREE.SRGBColorSpace;
  const lockMat=new THREE.MeshBasicMaterial({
    map:lockTexture,
    transparent:true,
    opacity:0,
    depthWrite:false,
    depthTest:false,
    toneMapped:false,
    side:THREE.DoubleSide
  });
  const lockDisc=new THREE.Mesh(new THREE.CircleGeometry(48,64),lockMat);
  lockDisc.name='yakolak-tabletop-setup-lock';
  lockDisc.position.set(0,12,0);
  lockDisc.rotation.x=-Math.PI/2;
  lockDisc.renderOrder=10058;

  gameGroup.add(glow,panel,lockDisc);

  let active=false;
  let fading=false;
  let opacity=0;
  let lastStep='';
  let routeMode='';
  let pollTimer=0;

  function drawLock(){
    lockCtx.clearRect(0,0,512,512);
    const radial=lockCtx.createRadialGradient(256,256,30,256,256,248);
    radial.addColorStop(0,'rgba(80,197,229,.25)');
    radial.addColorStop(.72,'rgba(20,83,107,.12)');
    radial.addColorStop(1,'rgba(0,0,0,0)');
    lockCtx.fillStyle=radial;
    lockCtx.fillRect(0,0,512,512);
    lockCtx.strokeStyle='rgba(191,242,255,.82)';
    lockCtx.lineWidth=14;
    lockCtx.shadowColor='rgba(91,213,245,.8)';
    lockCtx.shadowBlur=24;
    roundRect(lockCtx,166,230,180,156,32);
    lockCtx.stroke();
    lockCtx.beginPath();
    lockCtx.arc(256,228,72,Math.PI,Math.PI*2);
    lockCtx.stroke();
    lockCtx.shadowBlur=0;
    lockCtx.fillStyle='rgba(226,250,255,.95)';
    lockCtx.beginPath();
    lockCtx.arc(256,302,16,0,Math.PI*2);
    lockCtx.fill();
    lockCtx.fillRect(248,302,16,43);
    lockTexture.needsUpdate=true;
  }

  function copyForStep(step){
    if(step==='bots'){
      return{
        kicker:'المرحلة الثانية داخل الغرفة',
        title:'كم لاعب تحب؟',
        note:'المس أحد الصفوف الظاهرة فوق الطاولة: لاعبان، 3 لاعبين، أو 4 لاعبين.'
      };
    }
    const online=routeMode==='online'||document.body.classList.contains('yakolak-online-native-setup');
    return{
      kicker:online?'إعداد الغرفة على الطاولة':'إعداد المباراة على الطاولة',
      title:'اختر لونك',
      note:'المس مجموعة القطع ذات اللون الذي تريده. اللعبة ستبقى مقفلة حتى يكتمل الإعداد.'
    };
  }

  function draw(step){
    const copy=copyForStep(step);
    ctx.clearRect(0,0,1200,420);
    const wash=ctx.createLinearGradient(0,0,1200,420);
    wash.addColorStop(0,'rgba(6,32,43,.18)');
    wash.addColorStop(.5,'rgba(22,82,104,.36)');
    wash.addColorStop(1,'rgba(5,27,37,.18)');
    ctx.fillStyle=wash;
    roundRect(ctx,28,32,1144,356,42);
    ctx.fill();
    ctx.strokeStyle='rgba(167,231,248,.62)';
    ctx.lineWidth=4;
    ctx.stroke();

    ctx.direction='rtl';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillStyle='rgba(174,225,239,.76)';
    ctx.font='700 27px system-ui, sans-serif';
    ctx.fillText(copy.kicker,600,95);

    ctx.fillStyle='rgba(242,253,255,.98)';
    ctx.shadowColor='rgba(89,207,239,.72)';
    ctx.shadowBlur=24;
    ctx.font='900 70px ExpoYakolak, system-ui, sans-serif';
    ctx.fillText(copy.title,600,190);
    ctx.shadowBlur=0;

    ctx.fillStyle='rgba(210,235,242,.88)';
    ctx.font='650 30px system-ui, sans-serif';
    ctx.fillText(copy.note,600,288);

    ctx.fillStyle='rgba(165,211,223,.58)';
    ctx.font='650 23px system-ui, sans-serif';
    ctx.fillText('لا توجد صفحة منفصلة — اختياراتك جزء من الطاولة نفسها',600,346);
    texture.needsUpdate=true;
    render();
  }

  function setOpacity(value){
    opacity=clamp(value,0,1);
    panelMat.opacity=opacity;
    glowMat.opacity=opacity*.13;
    lockMat.opacity=opacity*.74;
    panel.visible=opacity>.002;
    glow.visible=opacity>.002;
    lockDisc.visible=opacity>.002;
    render();
  }

  function fadeTo(to,ms){
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

  function shouldShow(){
    if(game.state.configured)return false;
    if(!setupGroup.visible)return false;
    return game.state.setupStep==='color'||game.state.setupStep==='bots';
  }

  async function activate(){
    if(active||fading)return;
    active=true;
    document.body.classList.add('yakolak-tabletop-setup-active');
    lastStep=game.state.setupStep||'color';
    draw(lastStep);
    lockDisc.rotation.z=0;
    setOpacity(0);
    await fadeTo(1,reduced?10:460);
  }

  async function deactivate(){
    if(!active||fading)return;
    fading=true;
    await fadeTo(0,reduced?10:420);
    active=false;
    fading=false;
    lastStep='';
    document.body.classList.remove('yakolak-tabletop-setup-active');
  }

  function sync(){
    const show=shouldShow();
    if(show&&!active&&!fading){
      void activate();
      return;
    }
    if(!show&&active&&!fading){
      void deactivate();
      return;
    }
    if(show&&active&&game.state.setupStep!==lastStep){
      lastStep=game.state.setupStep;
      draw(lastStep);
    }
    if(active){
      lockDisc.rotation.z+=0.0028;
      render();
    }
  }

  const originalChoose=entry.choose.bind(entry);
  entry.choose=async mode=>{
    routeMode=mode;
    const result=await originalChoose(mode);
    sync();
    return result;
  };

  drawLock();
  setOpacity(0);
  pollTimer=setInterval(sync,120);
  addEventListener('pagehide',()=>clearInterval(pollTimer),{once:true});
  addEventListener('resize',()=>{
    if(active){
      panel.position.y=innerHeight>innerWidth*1.18?205:190;
      glow.position.copy(panel.position);
      glow.position.z-=3;
      render();
    }
  },{passive:true});

  globalThis.__yakolakV123TabletopSetup={
    stage:2,
    panel,
    lockDisc,
    sync,
    get active(){return active},
    get mode(){return routeMode}
  };
}

void initStageTwo().catch(error=>{
  console.error('[Yakolak] v123 stage 2 failed',error);
  globalThis.__yakolakLoading?.set?.(100,'تعذر تجهيز إعدادات الطاولة');
});
