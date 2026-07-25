console.info('[Yakolak] APP.JS v118 ONLINE ROUND SELECTION LOADED');

const BUILD='118';
import('./src/app-game-v114.js?v='+BUILD+'-release')
  .then(()=>import('./src/online-rounds-v118.js?v='+BUILD+'-rounds'))
  .catch(error=>{
    console.error('[Yakolak] v118 bootstrap failed',error);
    globalThis.__yakolakLoading?.set?.(100,'تعذر تحميل النسخة 118');
  });
