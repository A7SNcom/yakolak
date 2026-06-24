// Yakolak production bridge.
// Route: index.html -> src/core/app.js -> src/app-prod-stage1.js

console.info('[Yakolak] CORE APP v067 LOADED');

const BUILD = '67';
import('../app-prod-stage1.js?v=' + BUILD);
