console.info('[Yakolak] APP.JS v106 UNIFIED STUDIO LOADED');

const BUILD='106';
import('./src/app-game-v106.js?v='+BUILD+'-release').catch(error=>{
  console.error('[Yakolak] v106 bootstrap failed',error);
  globalThis.__yakolakLoading?.set?.(100,'تعذر تحميل النسخة 106');
});