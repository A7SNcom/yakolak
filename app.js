console.info('[Yakolak] APP.JS v102 BALANCED STUDIO LOADED');

const BUILD='102';
import('./src/app-game-v102.js?v='+BUILD).catch(error=>{
  console.error('[Yakolak] v102 bootstrap failed',error);
  globalThis.__yakolakLoading?.set?.(100,'تعذر تحميل النسخة 102');
});
