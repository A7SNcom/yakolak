import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [html, app, entry, versionText] = await Promise.all([
  read('index.html'),
  read('app.js'),
  read('src/app-game-v111.js'),
  read('version.json')
]);

const version = JSON.parse(versionText);

assert.match(html, /<meta name="yakolak-version" content="v111-clean-player-shell">/, 'HTML release marker must be v111');
assert.match(html, /const BUILD='111';/, 'HTML build marker must be 111');
assert.match(html, /id="clearCacheBtn"[^>]*\shidden(?:\s|>)/, 'Maintenance control must be hidden in markup');
assert.match(html, /const debugMode=params\.get\('debug'\)==='1';/, 'Debug mode must require ?debug=1');
assert.match(html, /clearBtn\.hidden=!debugMode;/, 'Maintenance control visibility must follow debug mode');
assert.match(html, /if\(!debugMode\|\|!clearBtn\|\|clearBtn\.disabled\)return;/, 'Maintenance action must reject normal player mode');

assert.match(app, /const BUILD='111';/, 'Bootstrap build marker must be 111');
assert.match(app, /import\('\.\/src\/app-game-v111\.js\?v='/, 'Bootstrap must load v111 entrypoint');
assert.match(entry, /await import\('\.\/app-game-v110\.js\?v=111-clean-player-shell'\);/, 'v111 must preserve the v110 gameplay runtime');

assert.equal(version.version, 'v111-clean-player-shell', 'version.json release marker must be v111');
assert.equal(version.build, 111, 'version.json build must be 111');

console.log('Yakolak v111 player-shell contract verified.');
