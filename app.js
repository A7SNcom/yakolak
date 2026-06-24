// Yakolak stage 1 production bridge.
// Route: index.html -> app.js -> src/app-prod-stage1.js
// Keeps intro and visual composition while removing development-heavy calibration/rendering.

console.info('[Yakolak] APP.JS v063 STAGE 1 PRODUCTION BRIDGE LOADED');

const BUILD='63';
import('./src/app-prod-stage1.js?v='+BUILD);
