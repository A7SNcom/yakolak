import assert from 'node:assert/strict';

import {
  createCanonicalSessionState,
  parseCanonicalSessionState,
  serializeCanonicalSessionState,
} from '../web/app/session/canonical-session-state.js';
import {
  derivePersistentScoreMarkerState,
  rebuildPersistentScoreMarkerInstances,
  syncPersistentScoreMarkerInstances,
} from '../web/app/scene/score-marker-presentation.js';

const allSeats = [
  { seatId: 'right', type: 'host-human', color: 'marble', ready: true },
  { seatId: 'back', type: 'computer', color: 'blue', ready: true },
  { seatId: 'left', type: 'computer', color: 'gold', ready: true },
  { seatId: 'front', type: 'computer', color: 'green', ready: true },
];

function canonicalState({
  scores = { right: 4, back: 3, left: 1, front: 0 },
  round = 7,
  completedRounds = 6,
  roundEndRevision = null,
  revision = 80,
  lifecycle = { phase: 'round-ready' },
  seats = allSeats,
  targetPlayers = seats.length,
  preferredColor = 'marble',
} = {}) {
  return createCanonicalSessionState({
    preferredColor,
    targetPlayers,
    winsToMatch: 5,
    seats,
    scores,
    round,
    completedRounds,
    roundEndRevision,
    revision,
    lifecycle,
  });
}

function fakeInstances({ capacity = 7, colorOverride = null, omittedSeat = null } = {}) {
  const physical = [
    ['right', 'marble'],
    ['back', 'blue'],
    ['left', 'gold'],
    ['front', 'green'],
  ].filter(([seatId]) => seatId !== omittedSeat);
  const counts = new Map(physical.map(([seatId]) => [seatId, 0]));
  const records = physical.map(([seatId, colorId]) => ({
    seatId,
    colorId: colorOverride?.seatId === seatId ? colorOverride.colorId : colorId,
    slots: Array.from({ length: capacity }, (_, index) => ({ index })),
    mesh: { userData: { capacity } },
  }));
  const seatByColor = new Map(records.map(record => [record.colorId, record.seatId]));
  return {
    records,
    setScores(scoresByColor) {
      for (const record of records) counts.set(record.seatId, scoresByColor[record.colorId] ?? 0);
    },
    snapshot() {
      return {
        seats: records.map(record => ({
          seatId: record.seatId,
          colorId: record.colorId,
          count: counts.get(record.seatId),
          capacity,
        })),
      };
    },
    countForColor(colorId) {
      return counts.get(seatByColor.get(colorId));
    },
  };
}

const authoritative = canonicalState();
const derived = derivePersistentScoreMarkerState(authoritative);
assert.deepEqual(derived.countsBySeat, { right: 4, back: 3, left: 1, front: 0 });
assert.deepEqual(derived.countsByColor, { marble: 4, blue: 3, gold: 1, green: 0 });
assert.deepEqual(derived.markers.map(marker => [marker.seatId, marker.colorId, marker.count]), [
  ['right', 'marble', 4],
  ['back', 'blue', 3],
  ['left', 'gold', 1],
  ['front', 'green', 0],
]);

const instances = fakeInstances();
const synced = syncPersistentScoreMarkerInstances(instances, authoritative);
assert.deepEqual(synced.renderedCountsBySeat, { right: 4, back: 3, left: 1, front: 0 });
assert.equal(instances.countForColor('marble'), 4);
assert.equal(instances.countForColor('blue'), 3);
assert.equal(instances.countForColor('gold'), 1);
assert.equal(instances.countForColor('green'), 0);

// Hydration deterministically rebuilds physical marker counts from canonical score.
const hydrated = parseCanonicalSessionState(serializeCanonicalSessionState(authoritative));
const rebuiltInstances = fakeInstances();
const rebuilt = rebuildPersistentScoreMarkerInstances(rebuiltInstances, hydrated);
assert.deepEqual(rebuilt.countsBySeat, synced.countsBySeat);
assert.deepEqual(rebuilt.renderedCountsBySeat, synced.renderedCountsBySeat);

// A round reset changes board/round/lifecycle but keeps cumulative authoritative
// scores. Markers therefore persist exactly; there is no presentation clearRound().
const nextRound = canonicalState({
  scores: { right: 4, back: 3, left: 1, front: 0 },
  round: 8,
  completedRounds: 7,
  revision: 81,
  lifecycle: { phase: 'round-ready' },
});
const retained = syncPersistentScoreMarkerInstances(instances, nextRound);
assert.deepEqual(retained.renderedCountsBySeat, { right: 4, back: 3, left: 1, front: 0 });

// Only an authoritative fresh match/rematch score reset removes the markers.
const freshMatch = canonicalState({
  scores: { right: 0, back: 0, left: 0, front: 0 },
  round: 1,
  completedRounds: 0,
  revision: 82,
  lifecycle: { phase: 'round-ready' },
});
const reset = syncPersistentScoreMarkerInstances(instances, freshMatch);
assert.deepEqual(reset.renderedCountsBySeat, { right: 0, back: 0, left: 0, front: 0 });

// Unconfigured physical seats stay at zero; the renderer still owns the same four
// stable physical meshes/transforms, but authority supplies no score for those seats.
const twoSeatState = canonicalState({
  seats: allSeats.slice(0, 2),
  targetPlayers: 2,
  scores: { right: 2, back: 1 },
  revision: 83,
});
const twoSeat = syncPersistentScoreMarkerInstances(fakeInstances(), twoSeatState);
assert.deepEqual(twoSeat.renderedCountsBySeat, { right: 2, back: 1, left: 0, front: 0 });

// Presentation cannot silently remap stable seat/color identity or overrun the
// canonical physical slot capacity.
assert.throws(() => syncPersistentScoreMarkerInstances(fakeInstances({
  colorOverride: { seatId: 'right', colorId: 'blue' },
}), authoritative), /score_marker_color_binding_mismatch/);
assert.throws(() => syncPersistentScoreMarkerInstances(fakeInstances({ omittedSeat: 'front' }), authoritative), /score_marker_seat_set_mismatch/);
assert.throws(() => syncPersistentScoreMarkerInstances(fakeInstances({ capacity: 3 }), authoritative), /authoritative_score_exceeds_marker_capacity/);

// No score cache is accepted as input: changing only canonical scores changes the
// next render deterministically, regardless of previous instance counts.
const changed = canonicalState({
  scores: { right: 1, back: 0, left: 4, front: 2 },
  revision: 84,
});
const changedSync = syncPersistentScoreMarkerInstances(instances, changed);
assert.deepEqual(changedSync.renderedCountsBySeat, { right: 1, back: 0, left: 4, front: 2 });

console.log('THREEJS-053 persistent score markers contract: PASS');
