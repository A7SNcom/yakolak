import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPlayerBases } from '../scripts/verify-threejs-player-bases.mjs';

test('THREEJS-019 four player bases share one canonical geometry contract and keep explicit seat ownership', async () => {
  const report = await verifyPlayerBases();
  assert.deepEqual(report.sourcePivot, [33, 84.5, 6]);
  assert.equal(report.triangleCount, 199100);
  assert.equal(report.componentCount, 12);
  assert.deepEqual(report.seatOrder, ['right', 'back', 'left', 'front']);
  assert.deepEqual(report.ownership, [
    { seatId: 'right', colorId: 'marble' },
    { seatId: 'back', colorId: 'blue' },
    { seatId: 'left', colorId: 'gold' },
    { seatId: 'front', colorId: 'green' },
  ]);
  assert.ok(report.maxHomeErrorXZ <= report.homeAlignmentTolerance);
  assert.equal(report.ownershipDerivedFromMeshPosition, false);
  assert.equal(report.seats.length, 4);
  for (const seat of report.seats) {
    assert.equal(seat.homeAlignment.matches.length, 3);
    assert.ok(seat.homeAlignment.maxErrorXZ <= report.homeAlignmentTolerance);
  }
});
