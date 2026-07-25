console.info('[Yakolak] APP.JS v116 ONLINE LOBBY + MOBILE CLARITY LOADED');

const BUILD='116';
import('./src/app-game-v114.js?v='+BUILD+'-release').catch(error=>{
  console.error('[Yakolak] v116 bootstrap failed',error);
  globalThis.__yakolakLoading?.set?.(100,'تعذر تحميل النسخة 116');
});
