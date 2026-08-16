import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyBoardAndLid } from '../scripts/verify-threejs-board-lid.mjs';

test('THREEJS-018 board and intro lid geometry stays aligned to authoritative layout', async () => {
  const report = await verifyBoardAndLid();
  assert.equal(report.profile, 'yakolak-board-intro-lid-v2');
  assert.deepEqual(report.boardPose.position, [0, 6, 0]);
  assert.deepEqual(report.boardPose.rotationDegrees, [-90, 0, 0]);
  assert.ok(report.maxCellCenterError <= report.cellCenterTolerance);
  assert.deepEqual(report.lid.closed.position, [0, 62.5, 0]);
  assert.deepEqual(report.lid.open.position, [0, 802.5, 0]);
  assert.equal(report.lid.final.visible, false);
  assert.equal(report.lid.final.snapMs, 4010);
  assert.equal(report.rulesCoordinatesAdjusted, false);
});
