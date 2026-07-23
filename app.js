console.info('[Yakolak] APP.JS v103 MOTION OPTIMIZED LOADED');

const BUILD='103';
import('./src/app-game-v103.js?v='+BUILD).catch(error=>{
  console.error('[Yakolak] v103 bootstrap failed',error);
  globalThis.__yakolakLoading?.set?.(100,'تعذر تحميل النسخة 103');
});
