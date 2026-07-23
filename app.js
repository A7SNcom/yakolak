console.info('[Yakolak] APP.JS v112 ACTION TUTORIAL LOADED');

const BUILD='112';
import('./src/app-game-v112.js?v='+BUILD+'-release').catch(error=>{
  console.error('[Yakolak] v112 bootstrap failed',error);
  globalThis.__yakolakLoading?.set?.(100,'تعذر تحميل النسخة 112');
});
