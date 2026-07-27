console.info('[Yakolak] APP GAME v126 UNIFIED GAMEPLAY LOADED');

await import('./app-game-v125.js?v=126-unified-gameplay-base');

globalThis.__yakolakV126 = {
  build: 126,
  base: 125,
  change: 'named-room-browser-shared-rules-player-camera'
};
