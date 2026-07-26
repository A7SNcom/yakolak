console.info('[Yakolak] APP.JS v121 WALL ENTRY JOURNEY HOTFIX LOADED');

const BUILD='121';
import('./src/mobile-clarity-v120.js?v='+BUILD+'-policy')
  .then(()=>import('./src/app-game-v121.js?v='+BUILD+'-entry-hotfix-1'))
  .then(()=>import('./src/online-rounds-v118.js?v='+BUILD+'-rounds'))
  .then(()=>import('./src/online-last-move-v119.js?v='+BUILD+'-marker'))
  .catch(error=>{
    console.error('[Yakolak] v121 bootstrap failed',error);
    globalThis.__yakolakLoading?.set?.(100,'تعذر تحميل النسخة 121');
  });
