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

const [index, app, markerSource, api, version] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/online-last-move-v119.js', import.meta.url), 'utf8'),
  readFile(new URL('../api/rooms-v118.js', import.meta.url), 'utf8'),
  readFile(new URL('../version.json', import.meta.url), 'utf8').then(JSON.parse)
]);

assert.match(index, /yakolak-version" content="v119-subtle-last-move-marker"/);
assert.match(index, /const BUILD='119'/);
assert.match(app, /online-rounds-v118\.js/);
assert.match(app, /online-last-move-v119\.js/);
assert.equal(version.build, 119);
assert.equal(version.version, 'v119-subtle-last-move-marker');
assert.match(markerSource, /TARGET_INNER = 30\.5/);
assert.match(markerSource, /TARGET_OUTER = 33/);
assert.match(markerSource, /ACTIVE_OPACITY = 0\.42/);
assert.match(markerSource, /FINISHED_OPACITY = 0\.28/);
assert.match(api, /yakolak_online_rooms_v3/);

assert.equal(validOnlineRoundCount(3), true);
assert.equal(validOnlineRoundCount(5), true);
assert.equal(validOnlineRoundCount(4), false);
assert.throws(() => createOnlineState('right', 2), /invalid_round_count/);

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
  state = applyOnlineMove(state, loserSeat, { zone: 3, size: 'l' });
  assert.equal(state.board['0'].l, winnerColor);
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
assert.equal(state.scores.p1, 1);
assert.equal(state.matchComplete, false);
state = startNext(state);
assert.equal(state.round, 2);
state = winCurrentRound(state, 'p2');
state = startNext(state);
state = winCurrentRound(state, 'p1');
assert.equal(state.completedRounds, 3);
assert.equal(state.matchComplete, true);
assert.equal(state.matchWinner.seat, 'p1');

class RingGeometry {
  constructor(innerRadius, outerRadius, thetaSegments) {
    this.type = 'RingGeometry';
    this.parameters = { innerRadius, outerRadius, thetaSegments };
    this.disposed = false;
  }
  dispose() {
    this.disposed = true;
  }
}

function ring(innerRadius, outerRadius) {
  return {
    geometry: new RingGeometry(innerRadius, outerRadius, 48),
    material: {
      transparent: true,
      opacity: 0.86,
      depthTest: false,
      depthWrite: false,
      needsUpdate: false
    },
    renderOrder: 10040,
    userData: {}
  };
}

const existingFinishedMarker = ring(31, 35);
const gameGroup = {
  children: [existingFinishedMarker],
  add(...objects) {
    this.children.push(...objects);
    return this;
  }
};
const roomState = { status: 'finished' };
globalThis.__yakolakGame = { THREE: { RingGeometry }, gameGroup };
globalThis.__yakolakOnlineV114 = { get room() { return roomState; } };

await import(`../src/online-last-move-v119.js?verify=${Date.now()}`);

assert.equal(existingFinishedMarker.geometry.parameters.innerRadius, 30.5);
assert.equal(existingFinishedMarker.geometry.parameters.outerRadius, 33);
assert.equal(existingFinishedMarker.material.opacity, 0.28);
assert.equal(existingFinishedMarker.material.depthTest, true);
assert.equal(existingFinishedMarker.renderOrder, 10010);
assert.equal(existingFinishedMarker.userData.v119SubtleLastMove, true);

roomState.status = 'playing';
const activeMarker = ring(31, 35);
gameGroup.add(activeMarker);
assert.equal(activeMarker.geometry.parameters.innerRadius, 30.5);
assert.equal(activeMarker.geometry.parameters.outerRadius, 33);
assert.equal(activeMarker.material.opacity, 0.42);
assert.equal(activeMarker.material.depthTest, true);

const legalZoneMarker = ring(23, 30);
const originalLegalGeometry = legalZoneMarker.geometry;
gameGroup.add(legalZoneMarker);
assert.equal(legalZoneMarker.geometry, originalLegalGeometry);
assert.equal(legalZoneMarker.material.opacity, 0.86);
assert.equal(legalZoneMarker.material.depthTest, false);
assert.equal(legalZoneMarker.userData.v119SubtleLastMove, undefined);

console.log('v119 subtle last-move marker and v118 match lifecycle passed');
