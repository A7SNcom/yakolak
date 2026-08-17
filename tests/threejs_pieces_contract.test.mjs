import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPieces } from '../scripts/verify-threejs-pieces.mjs';

test('THREEJS-020 converts and verifies 36 stable S/M/L piece instances on canonical centers', async () => {
  const report = await verifyPieces();
  assert.equal(report.totalInstances, 36);
  assert.equal(report.sizes.small.instances, 12);
  assert.equal(report.sizes.medium.instances, 12);
  assert.equal(report.sizes.large.instances, 12);
  assert.equal(new Set(report.logicalIds).size, 36);
  assert.equal(report.homePlacementsVerified, 36);
  assert.equal(report.boardSlotDestinationsVerified, 27);
  assert.equal(report.boardPlacementCandidatesVerified, 324);
  assert.equal(report.stableIdentityIndependentOfMesh, true);
  assert.equal(report.perPieceMagicOffsets, 0);
  assert.ok(report.sizes.small.radialEnvelope.max < report.sizes.medium.radialEnvelope.min);
  assert.ok(report.sizes.medium.radialEnvelope.max < report.sizes.large.radialEnvelope.min);
});
