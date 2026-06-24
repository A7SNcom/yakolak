// Yakolak premium live boot bridge.
// Restored route: index.html -> room-boot-v049.js -> app.js -> src/app-live.js
// Keeps cache-friendly stable versioning and strong clear button from v060.

console.info('[Yakolak] APP.JS v061 PREMIUM LIVE BRIDGE RESTORED');

const BUILD='61';
import('./src/app-live.js?v='+BUILD);
