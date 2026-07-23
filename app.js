console.info('[Yakolak] APP.JS v107 BALANCED CONTRAST LOADED');

const BUILD='107';
import('./src/app-game-v107.js?v='+BUILD+'-release').catch(error=>{
  console.error('[Yakolak] v107 bootstrap failed',error);
  globalThis.__yakolakLoading?.set?.(100,'تعذر تحميل النسخة 107');
});
