// Yakolak boot file.
// Keep the repository root clean for GitHub Pages.
// Live route: index.html -> app.js -> src/app-live.js

const LIVE_APP = './src/app-live.js';
const bust = Date.now();

import(LIVE_APP + '?b=' + bust);
