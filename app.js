console.info('[Yakolak] APP.JS v124 BLOB IMPORT RUNTIME FIX LOADED');

const BUILD='124';

async function installVisualConnectionHotfix(){
  for(let i=0;i<420;i++){
    const game=globalThis.__yakolakGame;
    const entry=globalThis.__yakolakV121Entry;
    const wall=globalThis.__yakolakV122RoomMenu;
    const services=globalThis.__yakolakV124RoomServices;
    if(game?.render&&entry?.choose&&wall?.group&&services?.serviceGroup){
      const exposeProjection=(object,axis,value)=>{
        object.position[axis]=value;
        object.visible=true;
        object.traverse?.(child=>{
          child.frustumCulled=false;
          const materials=Array.isArray(child.material)?child.material:[child.material];
          materials.filter(Boolean).forEach(material=>{
            material.depthTest=false;
            material.depthWrite=false;
            material.needsUpdate=true;
          });
        });
      };

      exposeProjection(wall.group,'z',-2360);
      exposeProjection(services.serviceGroup,'x',2360);
      services.learnScreen?.traverse?.(child=>{child.frustumCulled=false});
      services.lobbyScreen?.traverse?.(child=>{child.frustumCulled=false});

      const previousChoose=entry.choose.bind(entry);
      entry.choose=mode=>{
        if(mode==='online')return services.showOnlineService();
        if(mode==='learn')return services.showLearn();
        return previousChoose(mode);
      };

      document.addEventListener('click',event=>{
        const choice=event.target?.closest?.('#yakolakEntry .ye-choice');
        const mode=choice?.dataset?.mode;
        if(mode!=='online'&&mode!=='learn')return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        document.getElementById('yakolakEntry')?.setAttribute('hidden','');
        document.body.classList.remove('yakolak-entry-open');
        document.body.classList.add('yakolak-entry-complete');
        if(mode==='online')void services.showOnlineService();
        else void services.showLearn();
      },true);

      const style=document.createElement('style');
      style.id='yakolakV124LegacyUiKillSwitch';
      style.textContent=`
        #yakolakEntry,#yakolakOnlineDialog,#yakolakHowTo{display:none!important;visibility:hidden!important;pointer-events:none!important}
        body.yakolak-room-service-active #yakolakGameHud,
        body.yakolak-room-service-active #yakolakGameScore,
        body.yakolak-room-howto-active #yakolakGameHud,
        body.yakolak-room-howto-active #yakolakGameScore{opacity:0!important;visibility:hidden!important;pointer-events:none!important}
      `;
      document.head.append(style);
      game.render();
      console.info('[Yakolak] v124 visual connection hotfix active');
      return;
    }
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  throw new Error('v124 visual connection hotfix could not find the room stages');
}

import('./src/mobile-clarity-v120.js?v='+BUILD+'-policy')
  .then(()=>import('./src/app-game-v124.js?v='+BUILD+'-room-services-stage3-blob-runtime-fix-3'))
  .then(()=>installVisualConnectionHotfix())
  .then(()=>import('./src/online-rounds-v118.js?v='+BUILD+'-rounds'))
  .then(()=>import('./src/online-last-move-v119.js?v='+BUILD+'-marker'))
  .catch(error=>{
    console.error('[Yakolak] v124 bootstrap failed',error);
    globalThis.__yakolakLoading?.set?.(100,'تعذر تحميل النسخة 124');
  });
