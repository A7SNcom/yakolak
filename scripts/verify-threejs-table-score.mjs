import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ASSETS } from '../web/app/assets/asset-manifest.js';
import {
  deriveAuthoritativeScoreLayout,
  deriveScoreMarkerContactPivot,
  deriveTableGameContactReport,
  parseAuthoritativeTableFootprint,
} from '../web/app/scene/table-score-layout.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...segments) => readFile(path.join(repoRoot, ...segments));
const readJson = async (...segments) => JSON.parse(await readFile(path.join(repoRoot, ...segments), 'utf8'));
const near = (actual, expected, epsilon = 1e-6) => Math.abs(actual - expected) <= epsilon;
const nearArray = (actual, expected, epsilon = 1e-6) => Array.isArray(actual)
  && actual.length === expected.length
  && actual.every((value, index) => near(value, expected[index], epsilon));

function gitBlobSha1(bytes) {
  return crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function parseGlb(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x46546c67, 'score GLB magic');
  assert.equal(view.getUint32(4, true), 2, 'score GLB version');
  assert.equal(view.getUint32(8, true), bytes.length, 'score GLB declared length');
  const jsonLength = view.getUint32(12, true);
  assert.equal(view.getUint32(16, true), 0x4e4f534a, 'score GLB JSON chunk');
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).trim());
}

const worldLayout = await readJson('YAKOLAK_PORTABLE_KIT', 'assets', 'layout', 'world-layout.json');
const boardLayout = await readJson('web', 'assets', 'models', 'board-and-lid-layout.json');
const conversionState = await readJson('web', 'assets', 'models', 'conversion-state.json');
const tableSvg = await readFile(path.join(repoRoot, 'YAKOLAK_PORTABLE_KIT/assets/table/table.svg'), 'utf8');
const runtimeSource = await readFile(path.join(repoRoot, 'web/app/scene/table-and-score.js'), 'utf8');
const sourceOfTruth = await readFile(path.join(repoRoot, 'THREEJS_SOURCE_OF_TRUTH.md'), 'utf8');

const scoreAsset = ASSETS.scoreMarker;
assert.equal(scoreAsset.source.path, 'models/score-marker.stl');
assert.equal(scoreAsset.source.gitBlobSha, 'feb5d59eafe4547a529876344ff88d05ca95b37c');
assert.equal(scoreAsset.runtime.type, 'glb-components');
assert.equal(scoreAsset.runtime.url, '/assets/models/score-marker.glb?v=f5385f033a9ade6b195abed58bdba97aeaadb247');
assert.equal(scoreAsset.runtime.bytes, 12408);

const scoreGlbBytes = await read('web', 'assets', 'models', 'score-marker.glb');
assert.equal(scoreGlbBytes.length, 12408);
assert.equal(gitBlobSha1(scoreGlbBytes), 'f5385f033a9ade6b195abed58bdba97aeaadb247');
const scoreGlb = parseGlb(scoreGlbBytes);
const conversion = scoreGlb.extras?.yakolakConversion;
assert.equal(conversion?.source?.gitBlobSha1, scoreAsset.source.gitBlobSha);
assert.equal(conversion?.source?.bytes, scoreAsset.source.bytes);
assert.equal(conversion?.geometry?.triangleCount, 256);
assert.equal(conversion?.geometry?.componentCount, 1);
assert.equal(conversion?.geometry?.transformPolicy, 'identity-no-center-no-scale-no-rotation');
const positionAccessor = scoreGlb.accessors?.[scoreGlb.meshes?.[0]?.primitives?.[0]?.attributes?.POSITION];
assert.ok(positionAccessor?.min && positionAccessor?.max, 'score marker GLB must preserve source bounds');
assert.ok(nearArray(positionAccessor.min, [15, -57, 5.329070518200751e-15], 1e-9));
assert.ok(nearArray(positionAccessor.max, [25, -47, 10], 1e-9));
const markerPivot = deriveScoreMarkerContactPivot({ min: positionAccessor.min, max: positionAccessor.max });
assert.ok(nearArray(markerPivot, [20, -52, 5.329070518200751e-15], 1e-9));

const scoreState = conversionState.targets?.['model.score-marker'];
assert.equal(scoreState?.sourceGitBlobSha1, scoreAsset.source.gitBlobSha);
assert.equal(scoreState?.outputBytes, scoreGlbBytes.length);
assert.equal(scoreState?.outputSha256, sha256(scoreGlbBytes));
assert.equal(scoreState?.triangleCount, 256);
assert.equal(scoreState?.componentCount, 1);

const footprint = parseAuthoritativeTableFootprint(tableSvg);
assert.equal(footprint.sourcePointCount, 30);
assert.ok(nearArray(footprint.matrix, [4.166667, 0, 0, 4.166667, 484.7475, 797.470417], 1e-9));
assert.ok(nearArray(footprint.transformedSpan, [801.862564149, 797.470897131], 1e-6));
assert.ok(nearArray(footprint.transformedCenter, [400.9329099615, 398.7349684345], 1e-6));

const scoreLayout = deriveAuthoritativeScoreLayout(worldLayout);
assert.equal(scoreLayout.radius, 85);
assert.equal(scoreLayout.gap, 11);
assert.deepEqual(scoreLayout.order, [0, -1, 1, -2, 2, -3, 3]);
assert.equal(scoreLayout.scorePlaneY, 2);
assert.deepEqual(scoreLayout.seats.map((seat) => [seat.seatId, seat.colorId]), [
  ['right', 'marble'],
  ['back', 'blue'],
  ['left', 'gold'],
  ['front', 'green'],
]);
for (const seat of scoreLayout.seats) {
  assert.ok(near(Math.hypot(seat.sideCenter[0], seat.sideCenter[2]), scoreLayout.radius), `${seat.seatId} score radius`);
  assert.equal(seat.slots.length, scoreLayout.order.length);
  for (const slot of seat.slots) {
    const tangentDelta = (slot.position[0] - seat.sideCenter[0]) * seat.tangent[0]
      + (slot.position[2] - seat.sideCenter[2]) * seat.tangent[1];
    assert.ok(near(tangentDelta, slot.orderValue * scoreLayout.gap), `${seat.seatId} score gap/order at ${slot.index}`);
    assert.equal(slot.position[1], scoreLayout.scorePlaneY);
  }
}

const contact = deriveTableGameContactReport({ worldLayout, boardLayout });
assert.equal(contact.tableTopY, -16);
assert.equal(contact.declaredGameClearance, 0.8);
assert.equal(contact.declaredGameContactY, -15.2);
assert.equal(contact.boardBottomY, 0);
assert.equal(contact.measuredBoardGap, 16);
assert.equal(contact.declaredClearanceMatchesBoardBounds, false);
assert.equal(contact.hiddenGameOffsetApplied, false);
assert.match(sourceOfTruth, /SRC-012 — Table top and game-clearance contact plane — OPEN/);

assert.match(runtimeSource, /new THREE\.ShapeGeometry\(shape\)/, 'table must be built from the parsed authoritative shape');
assert.match(runtimeSource, /new THREE\.InstancedMesh\(geometry, material, seat\.slots\.length\)/, 'score points must be instanced');
assert.doesNotMatch(runtimeSource, /new THREE\.(?:Box|Plane|Circle|Cylinder|Sphere)Geometry/, 'table/score runtime must not replace canonical geometry with an approximation');
assert.match(runtimeSource, /Geometry is owned by the decoded asset cache; materials are owned by the caller/, 'score instances must not dispose shared geometry/material per point');
for (const textureAsset of [ASSETS.tableAlbedo, ASSETS.tableNormal, ASSETS.tableRoughness]) {
  assert.equal(textureAsset.group, 'optional');
  assert.equal(textureAsset.runtimeRequired, false);
}

console.log('THREEJS021_VERIFY_BEGIN');
console.log(JSON.stringify({
  scoreMarker: {
    runtimeBytes: scoreGlbBytes.length,
    triangleCount: conversion.geometry.triangleCount,
    componentCount: conversion.geometry.componentCount,
    sourceBounds: { min: positionAccessor.min, max: positionAccessor.max },
    sourceContactPivot: markerPivot,
  },
  table: {
    pointCount: footprint.sourcePointCount,
    transformedSpan: footprint.transformedSpan,
    transformedCenter: footprint.transformedCenter,
    topY: contact.tableTopY,
    surfaceOnly: true,
    optionalMapsRequired: false,
  },
  score: {
    radius: scoreLayout.radius,
    gap: scoreLayout.gap,
    order: scoreLayout.order,
    scorePlaneY: scoreLayout.scorePlaneY,
    seatCount: scoreLayout.seats.length,
    maxMarkersPerSeat: scoreLayout.order.length,
    sharedGeometryPolicy: 'one decoded BufferGeometry shared by four InstancedMesh score rows',
  },
  contact,
}, null, 2));
console.log('THREEJS021_VERIFY_OK');
