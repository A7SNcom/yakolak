console.info('[Yakolak] APP.JS v101 STUDIO ART DIRECTION LOADED');

const BUILD='101';
import('./src/app-game-v101.js?v='+BUILD).catch(error=>{
  console.error('[Yakolak] v101 bootstrap failed',error);
  globalThis.__yakolakLoading?.set?.(100,'تعذر تحميل النسخة 101');
});
