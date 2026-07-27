console.info('[Yakolak] APP.JS v130 APPROVED ROOM CONTINUITY LOADED');

const BUILD='130';

globalThis.__yakolakLoading?.set?.(8,'تجهيز اللعبة');

import('./src/game-rules-v126.js?v='+BUILD+'-shared-rules')
  .then(rules=>{globalThis.__yakolakRulesV126=rules})
  .then(()=>import('./src/mobile-clarity-v120.js?v='+BUILD+'-policy'))
  .then(()=>import('./src/app-game-v130.js?v='+BUILD+'-approved-room-continuity'))
  .then(()=>Promise.allSettled([
    import('./src/online-last-move-v119.js?v='+BUILD+'-marker'),
    import('./src/room-browser-v126.js?v='+BUILD+'-named-rooms')
  ]))
  .catch(error=>{
    console.error('[Yakolak] v130 bootstrap failed',error);
    globalThis.__yakolakLoading?.set?.(100,'تعذر تجهيز اللعبة');
    document.body.dataset.phase='error';
  });
