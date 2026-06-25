// Yakolak stage 1 production bridge.
// Route: index.html -> app.js -> src/app-prod-stage1.js

console.info('[Yakolak] APP.JS v069 LOADED');

const BUILD='69';
import('./src/app-prod-stage1.js?v='+BUILD);
