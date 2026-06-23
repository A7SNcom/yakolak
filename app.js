// Yakolak live boot file.
// This file intentionally stays tiny so the live route is obvious:
// index.html -> app.js -> app-hejaz-v043.js
// Do not change LIVE_APP unless the new page is visually approved.

const LIVE_APP = './app-hejaz-v043.js';
const bust = Date.now();

import(LIVE_APP + '?b=' + bust);
