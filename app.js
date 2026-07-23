console.info('[Yakolak] APP.JS v109 CLEAR PLAYFIELD LOADED');

const BUILD='109';
import('./src/app-game-v109.js?v='+BUILD+'-release').catch(error=>{
  console.error('[Yakolak] v109 bootstrap failed',error);
  globalThis.__yakolakLoading?.set?.(100,'تعذر تحميل النسخة 109');
});