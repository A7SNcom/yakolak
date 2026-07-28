const params=new URLSearchParams(location.search);
const sceneId=params.get('scene')||'';
const SPECIAL=new Set(['color-selection','player-count-selection','clean-entry','unboxing-intro']);

if(!SPECIAL.has(sceneId)){
  await import('./developer-scene-d1.js?v=D1-review-center-base');
}else{
  const preview=params.get('preview')==='1';
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const loader=document.getElementById('sceneLoading');
  const loaderProjection=loader?.querySelector('.loaderProjection');
  const status=document.getElementById('sceneStatus');
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  const smoother=value=>{const t=clamp(value,0,1);return t*t*t*(t*(t*6-15)+10)};
  const TABLE_COLOR='#c2c3bf',WALL_COLOR='#fafaf8',OUTLINE_COLOR='#aaa8a1';
  const HIDDEN_UI=['yakolakGameHud','yakolakGameScore','yakolakGameSetup','yakolakTools','yakolakCalibrationPanel','yakolakOnlineDialog','yakolakTutorialDialog','yakolakOnlineEntry','yakolakHowTo','yakolakEntry','yakolakFloatingSettings','yakolakEntrySettings'];
  let replayTimer=0;

  Object.assign(document.body.dataset,{preview:preview?'1':'0',developerEntityKind:'scene',developerEntity:sceneId,developerScene:sceneId});
  if(status)status.textContent=`D1 · ${sceneId}`;
  const removeLoader=()=>{if(loader?.parentNode)loader.parentNode.removeChild(loader)};
  globalThis.__yakolakLoading={set(_value,text){if(status&&text)status.textContent=`D1 · ${text}`}};
  globalThis.__yakolakEntryLoader={
    anchor(x,y){if(!loaderProjection?.isConnected)return;loaderProjection.style.position='absolute';loaderProjection.style.left=`${Math.round(x-48)}px`;loaderProjection.style.top=`${Math.round(y-66)}px`},
    handoff(){if(!loader?.isConnected)return;loader.style.background='transparent';loader.style.pointerEvents='none'},
    finish:removeLoader
  };
  function markReady(details={}){Object.assign(document.body.dataset,{sceneReady:'true',...details});globalThis.__yakolakDeveloperD1Scene={build:'D1-review-center',entityKind:'scene',entityId:sceneId,sceneId,preview,...details};parent.postMessage({type:'yakolak-developer-scene-ready',entityKind:'scene',entityId:sceneId,scene:sceneId,build:'D1-review-center',details},'*')}
  async function waitForGame(){for(let index=0;index<800;index++){const game=globalThis.__yakolakGame;if(game?.THREE&&game?.renderer&&game?.camera&&game?.controls&&game?.gameGroup?.parent&&game?.meshes&&document.body.classList.contains('yakolak-ready'))return game;await wait(25)}throw new Error(`D1 special scene failed to load ${sceneId}`)}
  function render(game){if(typeof game.render==='function')game.render();else game.renderer.render(game.gameGroup.parent,game.camera)}
  function solid(object,color){if(!object)return;object.visible=true;const materials=Array.isArray(object.material)?object.material:[object.material];materials.filter(Boolean).forEach(material=>{material.color?.set?.(color);material.emissive?.set?.('#000000');if('emissiveIntensity' in material)material.emissiveIntensity=0;if('roughness' in material)material.roughness=.9;if('metalness' in material)material.metalness=0;material.transparent=false;material.opacity=1;material.depthWrite=true;material.needsUpdate=true})}
  function findTable(scene){return scene.getObjectByName('yakolak-svg-table')||scene.getObjectByName('yakolak-fallback-simple-table')}
  function styleTable(scene){const table=findTable(scene);if(!table)return null;table.visible=true;table.traverse?.(object=>{if(!object.isMesh||!object.material)return;for(const material of (Array.isArray(object.material)?object.material:[object.material])){if(!material)continue;material.color?.set?.(TABLE_COLOR);material.emissive?.set?.('#000000');if('emissiveIntensity' in material)material.emissiveIntensity=0;if('roughness' in material)material.roughness=.82;if('metalness' in material)material.metalness=0;if('map' in material)material.map=null;if('normalMap' in material)material.normalMap=null;if('roughnessMap' in material)material.roughnessMap=null;material.transparent=false;material.opacity=1;material.depthWrite=true;material.needsUpdate=true}});return table}
  function styleRoom(game){const scene=game.gameGroup.parent;scene.background?.set?.('#ffffff');solid(scene.getObjectByName('room-back-wall'),WALL_COLOR);solid(scene.getObjectByName('room-left-wall'),WALL_COLOR);solid(scene.getObjectByName('room-right-wall'),WALL_COLOR);solid(scene.getObjectByName('room-ceiling'),WALL_COLOR);solid(scene.getObjectByName('room-floor'),'#deddd7');const front=scene.getObjectByName('room-front-wall');if(front)front.visible=false;const room=scene.getObjectByName('yakolak-soft-empty-room'),lines=room?.children?.filter(object=>object.isLine)||[];lines.forEach((line,index)=>{line.visible=index<12;if(!line.visible)return;line.material.color?.set?.(OUTLINE_COLOR);line.material.transparent=true;line.material.opacity=.58;line.material.depthTest=true;line.material.depthWrite=false;line.material.needsUpdate=true});styleTable(scene);return scene}
  function setCamera(game,position,target,fov=44){const targetVector=new game.THREE.Vector3(...target);game.camera.position.set(...position);game.camera.fov=fov;game.camera.near=.1;game.camera.far=12000;game.camera.updateProjectionMatrix();game.controls.target.copy(targetVector);game.controls.minDistance=140;game.controls.maxDistance=3000;game.camera.lookAt(targetVector);game.controls.update();render(game)}
  function hideDom(exceptSetup=false){for(const id of HIDDEN_UI){if(exceptSetup&&id==='yakolakGameSetup')continue;const element=document.getElementById(id);if(element){element.hidden=true;element.style.display='none';element.setAttribute('aria-hidden','true')}}}
  function prepareSetup(game,step){styleRoom(game);hideDom(true);game.state.configured=false;game.state.setupStep=step;if(step==='bots'&&!game.state.humanColor)game.state.humanColor='front';game.gameGroup.visible=true;game.setupGroup.visible=true;game.renderSetup3D?.();const portrait=innerHeight>innerWidth*1.18;setCamera(game,portrait?[0,710,520]:[0,620,690],[0,-20,0],portrait?49:43);game.controls.enabled=!preview;game.renderer.domElement.style.pointerEvents=preview?'none':'auto';render(game);return{mode:'interactive-setup',composition:step==='color'?'color-selection':'player-count-selection',setupStep:step,interactive:String(!preview),source:'native-renderSetup3D'}}
  function blockSceneInput(game){game.controls.enabled=false;game.renderer.domElement.style.pointerEvents='none';for(const type of ['click','pointerdown','pointerup','touchstart','touchend'])game.renderer.domElement.addEventListener(type,event=>{event.preventDefault();event.stopImmediatePropagation()},{capture:true,passive:false})}
  function enforceIntro(game){hideDom();if(game.setupGroup){game.setupGroup.visible=false;game.setupGroup.children.forEach(child=>child.visible=false)}const mainBase=game.meshes?.['9'];if(mainBase)mainBase.visible=true;game.clearHighlights?.();game.syncZoneMarkers?.(false);for(const id of HIDDEN_UI)document.getElementById(id)?.remove()}
  function triggerReplay(){globalThis.dispatchEvent(new KeyboardEvent('keydown',{key:'r',code:'KeyR',bubbles:true}))}
  async function configureUnboxing(game){styleRoom(game);game.gameGroup.visible=true;blockSceneInput(game);enforceIntro(game);const portrait=innerHeight>innerWidth*1.18;setCamera(game,portrait?[430,560,620]:[520,430,520],[0,0,0],portrait?48:43);removeLoader();triggerReplay();for(let i=0;i<30;i++){enforceIntro(game);render(game);await wait(50)}if(preview)replayTimer=setInterval(()=>{enforceIntro(game);triggerReplay()},6800);return{mode:'sequence',composition:'unboxing-clean-input-isolation',setupHidden:'true',largeBaseVisible:String(Boolean(game.meshes?.['9']?.visible)),interactionResidue:'blocked',replaySource:'keyboard-runtime'}}
  function projectLoader(game,point){if(!globalThis.__yakolakEntryLoader?.anchor)return;const projected=point.clone().project(game.camera),x=(projected.x*.5+.5)*innerWidth,y=(-projected.y*.5+.5)*innerHeight;globalThis.__yakolakEntryLoader.anchor(x,y)}
  async function configureCleanEntry(game){
    styleRoom(game);hideDom();game.gameGroup.visible=false;game.setupGroup.visible=false;
    await import('./developer-scene-d1-logo-helper.js?v=D1-review-center').then(module=>module.buildLogoWall(game));
    const portrait=innerHeight>innerWidth*1.18,compact=!portrait&&(innerWidth<=900||innerHeight<=620);
    const start=portrait?[0,250,-720]:compact?[0,250,-930]:[0,250,-1120];
    const overview=portrait?[0,1030,920]:compact?[0,920,1120]:[0,1080,1350];
    const bridge=portrait?[820,620,520]:[900,560,580];
    const end=portrait?[1320,265,0]:compact?[1240,260,0]:[1120,260,0];
    const startTarget=[0,250,-2300],overviewTarget=[0,-210,0],bridgeTarget=[980,40,0],endTarget=[2300,265,0];
    const positions=[start,overview,bridge,end].map(value=>new game.THREE.Vector3(...value));
    const targets=[startTarget,overviewTarget,bridgeTarget,endTarget].map(value=>new game.THREE.Vector3(...value));
    const positionCurve=new game.THREE.CatmullRomCurve3(positions,false,'centripetal',.25),targetCurve=new game.THREE.CatmullRomCurve3(targets,false,'centripetal',.25),wallAnchor=new game.THREE.Vector3(0,250,-2370);
    setCamera(game,start,startTarget,portrait?49:compact?46:42);game.renderer.domElement.style.pointerEvents='none';game.controls.enabled=false;projectLoader(game,wallAnchor);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));globalThis.__yakolakEntryLoader?.handoff?.();
    const duration=reduced?1800:5900,started=performance.now();
    await new Promise(resolve=>{const frame=now=>{const raw=clamp((now-started)/duration,0,1),t=smoother(raw),position=positionCurve.getPoint(t),target=targetCurve.getPoint(t);game.camera.position.copy(position);game.controls.target.copy(target);game.camera.lookAt(target);const overviewBoost=Math.sin(Math.PI*clamp(t/.67,0,1));game.camera.fov=(portrait?49:compact?46:42)+overviewBoost*(portrait?8:10);game.camera.updateProjectionMatrix();projectLoader(game,wallAnchor);render(game);if(raw<1)requestAnimationFrame(frame);else resolve()};requestAnimationFrame(frame)});
    game.camera.position.set(...end);game.controls.target.set(...endTarget);game.camera.lookAt(game.controls.target);game.camera.fov=portrait?49:compact?46:42;game.camera.updateProjectionMatrix();game.controls.enabled=!preview;game.renderer.domElement.style.pointerEvents=preview?'none':'auto';game.controls.update();render(game);globalThis.__yakolakEntryLoader?.finish?.();document.body.dataset.yakolakEntry='complete';globalThis.__yakolakV126Entry={build:'D1-review-center',phase:'complete',source:'table-centered-room-tour',cameraMotion:'single-catmull-room-tour',continuity:'no-cuts',overview:'table-centered-full-room'};return{mode:'sequence',composition:'clean-entry-room-overview',cameraMotion:'single-catmull-room-tour',continuity:'no-cuts',duration:String(duration),overview:'table-centered-full-room',controlsTarget:'room-wall'}
  }
  async function run(){
    if(loader){loader.id='yakolakLoader';loader.remove=()=>{loader.dataset.removePending='1'}}
    await import('./mobile-clarity-v120.js?v=D1-review-center');
    await import('./app-game-developer-d1.js?v=D1-review-center');
    const game=await waitForGame();let details;
    if(sceneId==='color-selection')details=prepareSetup(game,'color');
    else if(sceneId==='player-count-selection')details=prepareSetup(game,'bots');
    else if(sceneId==='clean-entry')details=await configureCleanEntry(game);
    else details=await configureUnboxing(game);
    removeLoader();render(game);markReady(details);
  }
  addEventListener('pagehide',()=>{if(replayTimer)clearInterval(replayTimer)});
  run().catch(error=>{console.error('[Yakolak] D1 special scene failed',error);if(status)status.textContent='D1 · ERROR';document.body.dataset.sceneError=String(error?.message||error);parent.postMessage({type:'yakolak-developer-scene-error',entityKind:'scene',entityId:sceneId,scene:sceneId,error:String(error?.message||error)},'*')});
}
