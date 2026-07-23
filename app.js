console.info('[Yakolak] APP.JS v103 MOTION OPTIMIZED FIX 2 LOADED');

const BUILD='103';
import('./src/app-game-v103.js?v='+BUILD+'-fix2').catch(error=>{
  console.error('[Yakolak] v103 bootstrap failed',error);
  globalThis.__yakolakLoading?.set?.(100,'تعذر تحميل النسخة 103');
});
