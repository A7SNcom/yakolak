// Yakolak stage 1 production bridge.
// Route: index.html -> app.js -> src/app-prod-stage1.js
// Keeps intro and visual composition while adding the bounded soft room and original OBJ table.

console.info('[Yakolak] APP.JS v065 REAL TABLE ROOM LOADED');

const BUILD='65';
import('./src/app-prod-stage1.js?v='+BUILD);
