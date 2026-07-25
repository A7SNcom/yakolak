import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  applyOnlineMove,
  availableOnlineColors,
  createOnlineState,
  joinOnlineState,
  requestOnlineRematch,
  validOnlineRoundCount
} from '../src/online-rules-v118.js';

const [index, app, patch, api, version] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/online-rounds-v118.js', import.meta.url), 'utf8'),
  readFile(new URL('../api/rooms-v118.js', import.meta.url), 'utf8'),
  readFile(new URL('../version.json', import.meta.url), 'utf8').then(JSON.parse)
]);

assert.match(index, /yakolak-version" content="v118-online-round-selection"/);
assert.match(index, /const BUILD='118'/);
assert.match(app, /online-rounds-v118\.js/);
assert.equal(version.build, 118);
assert.equal(version.version, 'v118-online-round-selection');
assert.match(patch, /3 جولات/);
assert.match(patch, /5 جولات/);
assert.match(patch, /targetRounds/);
assert.match(patch, /rooms-v118/);
assert.match(patch, /مباراة جديدة/);
assert.match(api, /yakolak_online_rooms_v3/);
assert.match(api, /validOnlineRoundCount/);
assert.match(api, /Number\(body\.targetRounds\)/);
assert.doesNotMatch(api, /console\.log\(.*token/i);

assert.equal(validOnlineRoundCount(3), true);
assert.equal(validOnlineRoundCount(5), true);
assert.equal(validOnlineRoundCount(4), false);
assert.throws(() => createOnlineState('right', 2), /invalid_round_count/);
assert.throws(() => createOnlineState('right', 2, 4), /invalid_round_count/);

function createMatch(rounds = 3) {
  let state = createOnlineState('right', 2, rounds);
  assert.equal(state.status, 'waiting');
  assert.equal(state.targetRounds, rounds);
  assert.deepEqual(availableOnlineColors(state), ['back', 'left', 'front']);
  state = joinOnlineState(state, 'p2', 'back');
  assert.equal(state.status, 'playing');
  assert.deepEqual(state.scores, { p1: 0, p2: 0 });
  return state;
}

function winCurrentRound(state, winnerSeat) {
  const loserSeat = winnerSeat === 'p1' ? 'p2' : 'p1';
  const winnerColor = state.players.find(player => player.seat === winnerSeat).color;
  const loserColor = state.players.find(player => player.seat === loserSeat).color;
  assert.equal(state.players[state.turnIndex].seat, winnerSeat);
  state = applyOnlineMove(state, winnerSeat, { zone: 0, size: 'l' });
  assert.equal(state.board['0'].l, winnerColor);
  state = applyOnlineMove(state, loserSeat, { zone: 3, size: 'l' });
  assert.equal(state.board['3'].l, loserColor);
  state = applyOnlineMove(state, winnerSeat, { zone: 1, size: 'l' });
  state = applyOnlineMove(state, loserSeat, { zone: 4, size: 'l' });
  state = applyOnlineMove(state, winnerSeat, { zone: 2, size: 'l' });
  assert.equal(state.status, 'finished');
  assert.equal(state.winner.color, winnerColor);
  return state;
}

function startNext(state) {
  for (const player of state.players) state = requestOnlineRematch(state, player.seat);
  return state;
}

let state = createMatch(3);
state = winCurrentRound(state, 'p1');
assert.equal(state.round, 1);
assert.equal(state.completedRounds, 1);
assert.equal(state.scores.p1, 1);
assert.equal(state.matchComplete, false);
state = requestOnlineRematch(state, 'p1');
assert.equal(state.status, 'finished');
assert.equal(state.rematch.p1, true);
state = requestOnlineRematch(state, 'p2');
assert.equal(state.status, 'playing');
assert.equal(state.round, 2);
assert.equal(state.turnIndex, 1);
assert.equal(state.board['0'].l, null);

state = winCurrentRound(state, 'p2');
assert.deepEqual(state.scores, { p1: 1, p2: 1 });
assert.equal(state.completedRounds, 2);
state = startNext(state);
assert.equal(state.round, 3);
assert.equal(state.turnIndex, 0);

state = winCurrentRound(state, 'p1');
assert.equal(state.completedRounds, 3);
assert.equal(state.matchComplete, true);
assert.deepEqual(state.scores, { p1: 2, p2: 1 });
assert.equal(state.matchWinner.seat, 'p1');
assert.equal(state.matchWinner.wins, 2);
assert.deepEqual(state.matchWinners.map(player => player.seat), ['p1']);

state = startNext(state);
assert.equal(state.status, 'playing');
assert.equal(state.round, 1);
assert.equal(state.completedRounds, 0);
assert.deepEqual(state.scores, { p1: 0, p2: 0 });
assert.equal(state.matchComplete, false);
assert.equal(state.moveNumber, 0);

const fiveRoundState = createMatch(5);
assert.equal(fiveRoundState.targetRounds, 5);
assert.equal(fiveRoundState.protocol, 3);

console.log('v118 mandatory 3/5 round selection and authoritative match lifecycle passed');
