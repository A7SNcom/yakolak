console.info('[Yakolak] APP.JS v105 MATURE NEUTRAL LOADED');

const BUILD='105';
import('./src/app-game-v105.js?v='+BUILD+'-release').catch(error=>{
  console.error('[Yakolak] v105 bootstrap failed',error);
  globalThis.__yakolakLoading?.set?.(100,'تعذر تحميل النسخة 105');
});