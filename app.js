// Yakolak production boot bridge.
// Fast route: index.html -> room-boot-v049.js -> app.js -> src/app-fast.js

console.info('[Yakolak] APP.JS v060 FAST PRODUCTION BRIDGE LOADED');

const BUILD='60';
import('./src/app-fast.js?v='+BUILD);
