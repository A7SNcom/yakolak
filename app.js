console.info('[Yakolak] APP.JS v104 BRIGHT NEUTRAL LOADED');

const BUILD='104';
import('./src/app-game-v104.js?v='+BUILD+'-release').catch(error=>{
  console.error('[Yakolak] v104 bootstrap failed',error);
  globalThis.__yakolakLoading?.set?.(100,'تعذر تحميل النسخة 104');
});