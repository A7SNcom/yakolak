console.info('[Yakolak] APP.JS v125 WHITE WALL CONTINUITY LOADED');

const BUILD='125';

async function installRoomConnections(){
  globalThis.__yakolakLoading?.set?.(100,'تجهيز الجدار');
  for(let i=0;i<520;i++){
    const game=globalThis.__yakolakGame;
    const entry=globalThis.__yakolakV121Entry;
    const wall=globalThis.__yakolakV122RoomMenu;
    const services=globalThis.__yakolakV124RoomServices;
    const whiteWall=globalThis.__yakolakV125WhiteWall;
    if(game?.render&&entry?.choose&&wall?.group&&services?.serviceGroup&&whiteWall?.group){
      const exposeService=(object,axis,value)=>{
        object.position[axis]=value;
        object.traverse?.(child=>{
          child.frustumCulled=false;
          const materials=Array.isArray(child.material)?child.material:[child.material];
          materials.filter(Boolean).forEach(material=>{
            material.depthTest=false;
            material.depthWrite=false;
            if(!material.map){
              material.color?.set?.('#b9b5ad');
              if('blending' in material)material.blending=game.THREE.NormalBlending;
            }
            material.needsUpdate=true;
          });
        });
      };

      wall.group.visible=false;
      exposeService(services.serviceGroup,'x',2360);
      services.learnScreen?.traverse?.(child=>{child.frustumCulled=false});
      services.lobbyScreen?.traverse?.(child=>{child.frustumCulled=false});

      const previousChoose=entry.choose.bind(entry);
      entry.choose=mode=>{
        if(mode==='online')return services.showOnlineService();
        if(mode==='learn')return services.showLearn();
        return previousChoose(mode);
      };

      const style=document.createElement('style');
      style.id='yakolakV125LegacyUiKillSwitch';
      style.textContent=`
        #yakolakEntry,#yakolakOnlineDialog,#yakolakHowTo{display:none!important;visibility:hidden!important;pointer-events:none!important}
        body.yakolak-room-service-active #yakolakGameHud,
        body.yakolak-room-service-active #yakolakGameScore,
        body.yakolak-room-howto-active #yakolakGameHud,
        body.yakolak-room-howto-active #yakolakGameScore{opacity:0!important;visibility:hidden!important;pointer-events:none!important}
        body.yakolak-v125-white-wall #view canvas{background:#f7f7f4}
      `;
      document.head.append(style);
      whiteWall.finalize();
      game.render();
      console.info('[Yakolak] v125 room connections active');
      return;
    }
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  throw new Error('v125 room connections could not find all stages');
}

import('./src/mobile-clarity-v120.js?v='+BUILD+'-policy')
  .then(()=>import('./src/app-game-v125.js?v='+BUILD+'-white-wall-continuity-1'))
  .then(()=>installRoomConnections())
  .then(()=>import('./src/online-rounds-v118.js?v='+BUILD+'-rounds'))
  .then(()=>import('./src/online-last-move-v119.js?v='+BUILD+'-marker'))
  .catch(error=>{
    console.error('[Yakolak] v125 bootstrap failed',error);
    globalThis.__yakolakLoading?.set?.(100,'تعذر تجهيز الجدار');
    document.getElementById('yakolakLoader')?.classList.add('error');
  });
