console.info('[Yakolak] APP.JS v111 CLEAN PLAYER SHELL LOADED');

const BUILD='111';
import('./src/app-game-v111.js?v='+BUILD+'-release').catch(error=>{
  console.error('[Yakolak] v111 bootstrap failed',error);
  globalThis.__yakolakLoading?.set?.(100,'تعذر تحميل النسخة 111');
});
