console.info('[Yakolak] APP.JS v117 ONLINE NATIVE GAMEPLAY LOADED');

const BUILD='117';
import('./src/app-game-v114.js?v='+BUILD+'-release').catch(error=>{
  console.error('[Yakolak] v117 bootstrap failed',error);
  globalThis.__yakolakLoading?.set?.(100,'تعذر تحميل النسخة 117');
});
