// Yakolak boot file.
// Keep this file clean: no scene patching, no renderer monkey-patching, no forced objects.
// Live route: index.html -> app.js -> src/app-live.js

console.info('[Yakolak] APP.JS v047 CLEAN BOOT LOADED');

const LIVE_APP = './src/app-live.js';
const bust = Date.now();

import(LIVE_APP + '?b=' + bust);
