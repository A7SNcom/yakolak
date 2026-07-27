import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('app.js');
const index = read('index.html');
const version = JSON.parse(read('version.json'));
const menu = read('src/app-game-v125.js');
const runtime = read('src/app-game-v114.js');
const client = read('src/online-client-v114.js');
const wall = read('src/app-game-v125.js');
const browser = read('src/room-browser-v126.js');
const api = read('api/rooms-v126.js');

const checks = [
  ['build metadata', version.build === 126 && /BUILD='126'/.test(app) && /BUILD='126'/.test(index)],
  ['shared rules load first', app.indexOf('game-rules-v126') < app.indexOf('app-game-v126')],
  ['rounds interceptor removed', !app.includes('online-rounds-v118')],
  ['named room browser loaded', app.includes('room-browser-v126') && index.includes('v126-rooms.css')],
  ['no manual room-code menu', menu.includes('تصفح الغرف المفتوحة') && !menu.includes('ادخل برمز صديقك')],
  ['canonical offline rules', runtime.includes('share canonical winner resolution') && runtime.includes('__yakolakRulesV126.listLegalMoves') && runtime.includes('__yakolakRulesV126.nextPlayableTurn')],
  ['matching round order', runtime.includes('rotate the round starter in offline and online play')],
  ['player-oriented camera', runtime.includes('function setPlayerView') && runtime.includes('controls,render') && runtime.includes('setPlayerView,renderSetup3D')],
  ['single gameplay input', !client.includes('installOnlineInput') && client.includes('__yakolakOnlineGameplayBridge')],
  ['reconnect releases menu input', wall.includes('deactivate(){') && wall.includes('__yakolakOnlineGameplayBridge?.active') && client.includes('__yakolakV125WhiteWall?.deactivate?.()')],
  ['v126 room endpoint', client.includes("const API = '/api/rooms-v126'")],
  ['public room discovery', api.includes("action === 'list'") && api.includes('ORDER BY updated_at DESC')],
  ['room names persisted', api.includes('invalid_room_name') && browser.includes('yakolak-room-name-history-v126')],
  ['visible round completion', browser.includes('renderFinished') && browser.includes('client.rematch')]
];

let failed = false;
for (const [label, pass] of checks) {
  console.log(`${pass ? '✓' : '✗'} ${label}`);
  if (!pass) failed = true;
}
if (failed) process.exit(1);
console.log('Build 126 unified gameplay verification passed.');
