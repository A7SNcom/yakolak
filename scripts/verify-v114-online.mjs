import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  applyOnlineMove,
  availableOnlineColors,
  createOnlineState,
  emptyOnlineBoard,
  joinOnlineState,
  leaveOnlineState,
  hasOnlineLegalMove,
  onlinePiecesUsed,
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

assert.match(index, /yakolak-version" content="v116-online-lobby-mobile-clarity"/);
assert.match(index, /styles\/v114-online\.css/);
assert.match(app, /app-game-v114\.js/);
assert.equal(version.build, 116);
assert.equal(version.version, 'v116-online-lobby-mobile-clarity');
assert.match(wrapper, /setResponsiveOverview/);
assert.match(wrapper, /function fit\(objects\)\{const box=new THREE\.Box3/);
assert.match(wrapper, /switch to play framing only after setup is confirmed/);
assert.match(wrapper, /if\(gameState\.configured\)setResponsiveOverview\(\);else/);
assert.match(wrapper, /raise bounded mobile clarity for simple board geometry/);
assert.match(wrapper, /expose narrow online rendering hooks/);
assert.match(client, /POLL_BASE_MS = 900/);
assert.match(client, /sessionStorage/);
assert.match(client, /moved > 9/);
assert.match(client, /authorization: `Bearer/);
assert.match(client, /prepareInvite/);
assert.match(client, /renderPlayerCountChoice/);
assert.match(client, /targetPlayers/);
assert.match(api, /version = version \+ 1/);
assert.match(api, /WHERE room_code = \? AND version = \?/);
assert.match(api, /createHash\('sha256'\)/);
assert.match(api, /ROOM_TTL_MS/);
assert.match(api, /yakolak_online_rooms_v2/);
assert.match(api, /action === 'preview'/);
assert.doesNotMatch(api, /console\.log\(.*token/i);
assert.match(css, /safe-area-inset-bottom/);
assert.match(css, /min-height:48px/);
assert.match(css, /yo-counts/);
assert.match(css, /yg-score\.yo-roster/);

let state = createOnlineState('right', 3);
assert.equal(state.status, 'waiting');
assert.equal(state.targetPlayers, 3);
assert.deepEqual(availableOnlineColors(state), ['back', 'left', 'front']);
state = joinOnlineState(state, 'p2', 'back');
assert.equal(state.status, 'waiting');
state = joinOnlineState(state, 'p3', 'left');
assert.equal(state.status, 'playing');
assert.deepEqual(state.players.map(player => player.seat), ['p1', 'p2', 'p3']);
assert.throws(() => joinOnlineState(state, 'p4', 'front'), /room_not_joinable/);

assert.throws(
  () => applyOnlineMove(state, 'p2', { zone: 0, size: 'l' }),
  /not_your_turn/
);

state = applyOnlineMove(state, 'p1', { zone: 0, size: 'l' });
assert.equal(state.turnIndex, 1);
assert.equal(state.board['0'].l, 'right');
assert.throws(
  () => applyOnlineMove(state, 'p2', { zone: 0, size: 'l' }),
  /occupied_slot/
);
state = applyOnlineMove(state, 'p2', { zone: 3, size: 'l' });
state = applyOnlineMove(state, 'p3', { zone: 6, size: 'l' });
state = applyOnlineMove(state, 'p1', { zone: 1, size: 'l' });
state = applyOnlineMove(state, 'p2', { zone: 4, size: 'l' });
state = applyOnlineMove(state, 'p3', { zone: 7, size: 'l' });
state = applyOnlineMove(state, 'p1', { zone: 2, size: 'l' });
assert.equal(state.status, 'finished');
assert.equal(state.winner.color, 'right');
assert.equal(state.winner.type, 'same-size');
assert.equal(state.moveNumber, 7);

state = requestOnlineRematch(state, 'p1');
assert.equal(state.status, 'finished');
assert.equal(state.rematch.p1, true);
state = requestOnlineRematch(state, 'p2');
assert.equal(state.status, 'finished');
state = requestOnlineRematch(state, 'p3');
assert.equal(state.status, 'playing');
assert.equal(state.round, 2);
assert.equal(state.board['0'].l, null);
assert.equal(state.turnIndex, 1);

let waiting = createOnlineState('front', 4);
waiting = joinOnlineState(waiting, 'p2', 'right');
waiting = joinOnlineState(waiting, 'p3', 'back');
waiting = leaveOnlineState(waiting, 'p2');
assert.equal(waiting.status, 'waiting');
assert.deepEqual(waiting.players.map(player => player.seat), ['p1', 'p3']);
waiting = leaveOnlineState(waiting, 'p1');
assert.equal(waiting.status, 'cancelled');

const exhausted = createOnlineState('right', 2);
exhausted.status = 'playing';
exhausted.players.push({ seat: 'p2', color: 'back' });
exhausted.board['0'].l = 'right';
exhausted.board['1'].l = 'right';
exhausted.board['3'].l = 'right';
assert.equal(onlinePiecesUsed(exhausted.board, 'right', 'l'), 3);
assert.throws(
  () => applyOnlineMove(exhausted, 'p1', { zone: 8, size: 'l' }),
  /no_piece_remaining/
);
assert.equal(hasOnlineLegalMove(exhausted.board, 'right'), true);

const drawState = createOnlineState('right', 2);
drawState.status = 'playing';
drawState.players.push({ seat: 'p2', color: 'back' });
for (const slot of Object.values(drawState.board)) {
  slot.s = 'back';
  slot.m = 'back';
  slot.l = 'back';
}
drawState.board['8'].s = null;
const drawn = applyOnlineMove(drawState, 'p1', { zone: 8, size: 's' });
assert.equal(drawn.status, 'finished');
assert.equal(drawn.draw, true);
assert.equal(drawn.winner, null);

const graded = emptyOnlineBoard();
graded['0'].s = 'front';
graded['4'].m = 'front';
graded['8'].l = 'front';
assert.equal(onlineWinner(graded, 'front')?.type, 'graded');

const cell = emptyOnlineBoard();
cell['5'].s = cell['5'].m = cell['5'].l = 'left';
assert.equal(onlineWinner(cell, 'left')?.type, 'cell');
assert.equal(onlineWinner(cell, 'right'), null);

console.log('v116 lobby/mobile contracts and authoritative rules passed');
