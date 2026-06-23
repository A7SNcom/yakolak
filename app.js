// Yakolak clean boot file.
// Live route: index.html -> room-boot-v049.js -> app.js -> src/app-live.js
// Do not build rooms, patch renderers, or override texture loading here.

console.info('[Yakolak] APP.JS v052 CLEAN LIVE BRIDGE LOADED');

const LIVE_APP='./src/app-live.js';
import(LIVE_APP+'?b='+Date.now());
