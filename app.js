console.info('[Yakolak] APP.JS v121 MOBILE PIECE EDGE CLARITY LOADED');

const BUILD='121';
import('./src/mobile-clarity-v120.js?v='+BUILD+'-board-policy')
  .then(()=>import('./src/mobile-piece-clarity-v121.js?v='+BUILD+'-piece-policy'))
  .then(()=>import('./src/app-game-v121.js?v='+BUILD+'-release'))
  .then(()=>import('./src/online-rounds-v118.js?v='+BUILD+'-rounds'))
  .then(()=>import('./src/online-last-move-v119.js?v='+BUILD+'-marker'))
  .catch(error=>{
    console.error('[Yakolak] v121 bootstrap failed',error);
    globalThis.__yakolakLoading?.set?.(100,'تعذر تحميل النسخة 121');
  });
