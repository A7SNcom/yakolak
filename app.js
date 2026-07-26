console.info('[Yakolak] APP.JS v123 TABLETOP SETUP STAGE 2 LOADED');

const BUILD='123';
import('./src/mobile-clarity-v120.js?v='+BUILD+'-policy')
  .then(()=>import('./src/app-game-v123.js?v='+BUILD+'-tabletop-stage2'))
  .then(()=>import('./src/online-rounds-v118.js?v='+BUILD+'-rounds'))
  .then(()=>import('./src/online-last-move-v119.js?v='+BUILD+'-marker'))
  .catch(error=>{
    console.error('[Yakolak] v123 bootstrap failed',error);
    globalThis.__yakolakLoading?.set?.(100,'تعذر تحميل النسخة 123');
  });
