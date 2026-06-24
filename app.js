// Yakolak production boot bridge.
// Keep imports stable so the browser can cache heavy 3D code and assets.

console.info('[Yakolak] APP.JS v060 FAST CACHED BRIDGE LOADED');

const BUILD='60';
import('./src/app-live.js?v='+BUILD);
