console.info('[Yakolak] APP.JS v108 VIEWER LIGHT LOADED');

const BUILD='108';
import('./src/app-game-v108.js?v='+BUILD+'-release').catch(error=>{
  console.error('[Yakolak] v108 bootstrap failed',error);
  globalThis.__yakolakLoading?.set?.(100,'تعذر تحميل النسخة 108');
});