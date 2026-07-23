console.info('[Yakolak] APP.JS v113 FIRST-MOVE BREATHING ROOM LOADED');

const BUILD='113';
import('./src/app-game-v113.js?v='+BUILD+'-release').catch(error=>{
  console.error('[Yakolak] v113 bootstrap failed',error);
  globalThis.__yakolakLoading?.set?.(100,'تعذر تحميل النسخة 113');
});
