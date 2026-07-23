console.info('[Yakolak] APP.JS v114 ONLINE + MOBILE FOUNDATION LOADED');

const BUILD='114';
import('./src/app-game-v114.js?v='+BUILD+'-release').catch(error=>{
  console.error('[Yakolak] v114 bootstrap failed',error);
  globalThis.__yakolakLoading?.set?.(100,'تعذر تحميل النسخة 114');
});
