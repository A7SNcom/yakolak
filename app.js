console.info('[Yakolak] APP.JS v124 ROOM SERVICES STAGE 3 LOADED');

const BUILD='124';
import('./src/mobile-clarity-v120.js?v='+BUILD+'-policy')
  .then(()=>import('./src/app-game-v124.js?v='+BUILD+'-room-services-stage3'))
  .then(()=>import('./src/online-rounds-v118.js?v='+BUILD+'-rounds'))
  .then(()=>import('./src/online-last-move-v119.js?v='+BUILD+'-marker'))
  .catch(error=>{
    console.error('[Yakolak] v124 bootstrap failed',error);
    globalThis.__yakolakLoading?.set?.(100,'تعذر تحميل النسخة 124');
  });
