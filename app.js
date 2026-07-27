console.info('[Yakolak] APP.JS v126 CLEAN ENTRY JOURNEY LOADED');

const BUILD='126';

import('./src/mobile-clarity-v120.js?v='+BUILD+'-policy')
  .then(()=>import('./src/app-game-v114.js?v='+BUILD+'-stable-room-table'))
  .then(()=>import('./src/entry-v126.js?v='+BUILD+'-clean-entry'))
  .then(()=>import('./src/online-rounds-v118.js?v='+BUILD+'-rounds'))
  .then(()=>import('./src/online-last-move-v119.js?v='+BUILD+'-marker'))
  .catch(error=>{
    console.error('[Yakolak] v126 bootstrap failed',error);
    globalThis.__yakolakLoading?.set?.(100,'تعذر تجهيز رحلة البداية');
    document.getElementById('yakolakLoader')?.classList.add('error');
  });
