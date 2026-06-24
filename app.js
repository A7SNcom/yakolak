// Yakolak stage 1 production bridge.
// Route: index.html -> app.js -> src/app-prod-stage1.js
// Keeps intro and visual composition while adding the bounded soft room.

console.info('[Yakolak] APP.JS v064 STAGE 1 ROOM BOUNDS LOADED');

const BUILD='64';
import('./src/app-prod-stage1.js?v='+BUILD);
