console.info('[Yakolak] APP.JS v122 DIEGETIC WALL MENU STAGE 1 LOADED');

const BUILD='122';
import('./src/mobile-clarity-v120.js?v='+BUILD+'-policy')
  .then(()=>import('./src/app-game-v122.js?v='+BUILD+'-diegetic-stage1'))
  .then(()=>import('./src/online-rounds-v118.js?v='+BUILD+'-rounds'))
  .then(()=>import('./src/online-last-move-v119.js?v='+BUILD+'-marker'))
  .catch(error=>{
    console.error('[Yakolak] v122 bootstrap failed',error);
    globalThis.__yakolakLoading?.set?.(100,'تعذر تحميل النسخة 122');
  });
