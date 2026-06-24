// Yakolak premium live boot bridge.
// Restored route: index.html -> app.js -> src/app-live.js
// Uses cache-busted stable versioning controlled by index.html.

console.info('[Yakolak] APP.JS v062 PREMIUM LIVE BRIDGE HARD CLEAR ALIGNED');

const BUILD='62';
import('./src/app-live.js?v='+BUILD);
