import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  applyOnlineMove,
  createOnlineState,
  emptyOnlineBoard,
  joinOnlineState,
  nextOnlineColor,
  onlineWinner,
  requestOnlineRematch
} from '../src/online-rules-v114.js';

const [index, app, wrapper, client, api, css, version] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app-game-v114.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/online-client-v114.js', import.meta.url), 'utf8'),
  readFile(new URL('../api/rooms.js', import.meta.url), 'utf8'),
  readFile(new URL('../styles/v114-online.css', import.meta.url), 'utf8'),
  readFile(new URL('../version.json', import.meta.url), 'utf8').then(JSON.parse)
]);

assert.match(index, /yakolak-version" content="v114-online-mobile-foundation"/);
assert.match(index, /styles\/v114-online\.css/);
assert.match(app, /app-game-v114\.js/);
assert.equal(version.build, 114);
assert.equal(version.version, 'v114-online-mobile-foundation');
assert.match(wrapper, /setResponsiveOverview/);
assert.match(wrapper, /function fit\(objects\)\{const box=new THREE\.Box3/);
assert.match(wrapper, /switch to play framing only after setup is confirmed/);
assert.match(wrapper, /if\(gameState\.configured\)setResponsiveOverview\(\);else/);
assert.match(wrapper, /sharpen mobile rendering without uncapped DPR/);
assert.match(wrapper, /expose narrow online rendering hooks/);
assert.match(client, /POLL_BASE_MS = 1200/);
assert.match(client, /sessionStorage/);
assert.match(client, /moved > 9/);
assert.match(client, /authorization: `Bearer/);
assert.match(api, /version = version \+ 1/);
assert.match(api, /WHERE room_code = \? AND version = \?/);
assert.match(api, /createHash\('sha256'\)/);
assert.match(api, /ROOM_TTL_MS/);
assert.doesNotMatch(api, /console\.log\(.*token/i);
assert.match(css, /safe-area-inset-bottom/);
assert.match(css, /min-height:48px/);

assert.equal(nextOnlineColor('right'), 'back');
assert.equal(nextOnlineColor('front'), 'right');

let state = createOnlineState('right');
assert.equal(state.status, 'waiting');
state = joinOnlineState(state, 'back');
assert.equal(state.status, 'playing');
assert.deepEqual(state.players.map(player => player.seat), ['host', 'guest']);

assert.throws(
  () => applyOnlineMove(state, 'guest', { zone: 0, size: 'l' }),
  /not_your_turn/
);

state = applyOnlineMove(state, 'host', { zone: 0, size: 'l' });
assert.equal(state.turnIndex, 1);
assert.equal(state.board['0'].l, 'right');
assert.throws(
  () => applyOnlineMove(state, 'guest', { zone: 0, size: 'l' }),
  /occupied_slot/
);
state = applyOnlineMove(state, 'guest', { zone: 3, size: 'l' });
state = applyOnlineMove(state, 'host', { zone: 1, size: 'l' });
state = applyOnlineMove(state, 'guest', { zone: 4, size: 'l' });
state = applyOnlineMove(state, 'host', { zone: 2, size: 'l' });
assert.equal(state.status, 'finished');
assert.equal(state.winner.color, 'right');
assert.equal(state.winner.type, 'same-size');
assert.equal(state.moveNumber, 5);

state = requestOnlineRematch(state, 'host');
assert.equal(state.status, 'finished');
assert.equal(state.rematch.host, true);
state = requestOnlineRematch(state, 'guest');
assert.equal(state.status, 'playing');
assert.equal(state.round, 2);
assert.equal(state.board['0'].l, null);
assert.equal(state.turnIndex, 1);

const graded = emptyOnlineBoard();
graded['0'].s = 'front';
graded['4'].m = 'front';
graded['8'].l = 'front';
assert.equal(onlineWinner(graded, 'front')?.type, 'graded');

const cell = emptyOnlineBoard();
cell['5'].s = cell['5'].m = cell['5'].l = 'left';
assert.equal(onlineWinner(cell, 'left')?.type, 'cell');
assert.equal(onlineWinner(cell, 'right'), null);

console.log('v114 online/mobile contracts and authoritative rules passed');
