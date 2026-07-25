console.info('[Yakolak] APP.JS v119 SUBTLE LAST MOVE MARKER LOADED');

const BUILD='119';
import('./src/app-game-v114.js?v='+BUILD+'-release')
  .then(()=>import('./src/online-rounds-v118.js?v='+BUILD+'-rounds'))
  .then(()=>import('./src/online-last-move-v119.js?v='+BUILD+'-marker'))
  .catch(error=>{
    console.error('[Yakolak] v119 bootstrap failed',error);
    globalThis.__yakolakLoading?.set?.(100,'تعذر تحميل النسخة 119');
  });
