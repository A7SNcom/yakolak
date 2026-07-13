console.info('[Yakolak] APP.JS v094 INTERACTIVE ONBOARDING LOADED');

globalThis.__yakolakV094=true;
const BUILD='94';
await import('./src/app-game-v085.js?v='+BUILD);
await import('./src/onboarding-v094.js?v='+BUILD);
