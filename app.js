console.info('[Yakolak] APP.JS v110 READABLE CHARCOAL LOADED');

const BUILD='110';
import('./src/app-game-v110.js?v='+BUILD+'-release').catch(error=>{
  console.error('[Yakolak] v110 bootstrap failed',error);
  globalThis.__yakolakLoading?.set?.(100,'تعذر تحميل النسخة 110');
});