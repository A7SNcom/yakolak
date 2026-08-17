import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCanonicalRuntimeData } from '../web/app/data/runtime-data.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readText = (...segments) => readFile(path.join(repoRoot, ...segments), 'utf8');
const readJson = async (...segments) => JSON.parse(await readText(...segments));

const [worldLayout, introScatterText, approvedContract] = await Promise.all([
  readJson('YAKOLAK_PORTABLE_KIT', 'assets', 'layout', 'world-layout.json'),
  readText('YAKOLAK_PORTABLE_KIT', 'assets', 'layout', 'intro-scatter.csv'),
  readJson('YAKOLAK_PORTABLE_KIT', 'assets', 'reference', 'approved-contract.json'),
]);

const runtimeData = createCanonicalRuntimeData({ worldLayout, introScatterText, approvedContract });

function assertDeepFrozen(value, label = 'runtimeData') {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true, `${label} must be frozen`);
  for (const [key, child] of Object.entries(value)) assertDeepFrozen(child, `${label}.${key}`);
}

assertDeepFrozen(runtimeData);
assert.deepEqual(runtimeData.counts, { cells: 9, seats: 4, homeStacks: 12, cameras: 16, introStarts: 36, pieces: 36 });
assert.deepEqual(runtimeData.source, {
  worldLayout: 'data.world-layout',
  introScatter: 'data.intro-scatter',
  approvedContract: 'data.approved-contract',
});
assert.deepEqual(runtimeData.cells.map((cell) => cell.id), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
assert.deepEqual(runtimeData.seats.order, ['right', 'back', 'left', 'front']);
assert.deepEqual(runtimeData.seats.identities, { right: 'marble', back: 'blue', left: 'gold', front: 'green' });
assert.deepEqual(runtimeData.score, { radius: 85, gap: 11, order: [0, -1, 1, -2, 2, -3, 3] });
assert.equal(runtimeData.motion.unboxing.finalSnapMs, 4010);
assert.equal(runtimeData.motion.piecePlacementMs, 520);
assert.equal(runtimeData.network.normalPollMs, 900);
assert.equal(runtimeData.network.maximumBackoffMs, 8000);
assert.equal(runtimeData.network.requestTimeoutMs, 6500);
assert.equal(new Set(runtimeData.introStarts.map((entry) => entry.id)).size, 36);
assert.equal(new Set(runtimeData.introStarts.map((entry) => entry.logicalSlotId)).size, 36);
assert.deepEqual(runtimeData.introStarts.map((entry) => entry.id), Array.from({ length: 36 }, (_, index) => index));

const expectFailure = (label, fn, pattern) => {
  assert.throws(fn, pattern, label);
};
const lines = introScatterText.trim().split(/\r?\n/);
const duplicateId = [lines[0], lines[1], lines[2].replace(/^1,/, '0,'), ...lines.slice(3)].join('\n');
expectFailure('duplicate scatter IDs fail closed', () => createCanonicalRuntimeData({ worldLayout, introScatterText: duplicateId, approvedContract }), /Duplicate intro-scatter ID 0/);
const missingRow = lines.slice(0, -1).join('\n');
expectFailure('missing scatter rows fail closed', () => createCanonicalRuntimeData({ worldLayout, introScatterText: missingRow, approvedContract }), /exactly 36 starts/);
const malformedTransform = introScatterText.replace('3.767912,10.522798,-5.311414', 'NaN,10.522798,-5.311414');
expectFailure('malformed scatter transforms fail closed', () => createCanonicalRuntimeData({ worldLayout, introScatterText: malformedTransform, approvedContract }), /must be finite/);
const duplicateCellLayout = structuredClone(worldLayout);
duplicateCellLayout.zones[1].id = duplicateCellLayout.zones[0].id;
expectFailure('duplicate cell IDs fail closed', () => createCanonicalRuntimeData({ worldLayout: duplicateCellLayout, introScatterText, approvedContract }), /Duplicate board cell ID/);
const malformedCameraLayout = structuredClone(worldLayout);
malformedCameraLayout.cameras.playDesktop.position = [520, null, 520];
expectFailure('malformed camera transforms fail closed', () => createCanonicalRuntimeData({ worldLayout: malformedCameraLayout, introScatterText, approvedContract }), /must be finite/);

async function collectJsFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectJsFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
  }
  return files;
}

function canonicalVectors(layout) {
  const vectors = [];
  const add = (value, label) => {
    if (Array.isArray(value) && value.length >= 3 && value.every(Number.isFinite)) vectors.push({ value, label });
  };
  layout.zones.forEach((zone) => add(zone.position, `zones.${zone.id}.position`));
  add(layout.board.position, 'board.position');
  add(layout.board.rotationDegrees, 'board.rotationDegrees');
  for (const [seatId, base] of Object.entries(layout.bases)) {
    add(base.position, `bases.${seatId}.position`);
    add(base.rotationDegrees, `bases.${seatId}.rotationDegrees`);
  }
  for (const [seatId, stacks] of Object.entries(layout.homeStacks)) stacks.forEach((center, index) => add(center, `homeStacks.${seatId}.${index}`));
  add(layout.pieceRotationDegrees, 'pieceRotationDegrees');
  for (const [cameraId, camera] of Object.entries(layout.cameras)) {
    add(camera.position, `cameras.${cameraId}.position`);
    add(camera.target, `cameras.${cameraId}.target`);
  }
  return vectors;
}

function numericLeafEntries(value, prefix = '') {
  const result = [];
  for (const [key, child] of Object.entries(value || {})) {
    const label = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'number') result.push({ key, value: child, label });
    else if (child && typeof child === 'object' && !Array.isArray(child)) result.push(...numericLeafEntries(child, label));
  }
  return result;
}

const rendererFiles = await collectJsFiles(path.join(repoRoot, 'web', 'app'));
const ownershipModule = path.normalize(path.join(repoRoot, 'web', 'app', 'data', 'runtime-data.js'));
const duplicateHardCodes = [];
const vectors = canonicalVectors(worldLayout)
  // Avoid banning the all-zero vector, which is generic math rather than a useful canonical signature.
  .filter(({ value }) => value.some((entry) => entry !== 0));
const timingLeaves = [
  ...numericLeafEntries(approvedContract.motion, 'motion'),
  ...numericLeafEntries(approvedContract.network, 'network'),
];

for (const file of rendererFiles) {
  if (path.normalize(file) === ownershipModule) continue;
  const source = await readFile(file, 'utf8');
  const compact = source.replace(/\s+/g, '');
  for (const { value, label } of vectors) {
    const signature = JSON.stringify(value);
    if (compact.includes(signature)) duplicateHardCodes.push(`${path.relative(repoRoot, file)} duplicates ${label} = ${signature}`);
  }
  for (const { key, value, label } of timingLeaves) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const assignment = new RegExp(`\\b${escapedKey}\\s*[:=]\\s*${String(value).replace('.', '\\.')}(?![\\d.])`);
    if (assignment.test(source)) duplicateHardCodes.push(`${path.relative(repoRoot, file)} duplicates ${label} = ${value}`);
  }
}

assert.deepEqual(duplicateHardCodes, [], `Canonical coordinates/timings must come from runtime data only:\n${duplicateHardCodes.join('\n')}`);

console.log('THREEJS023_VERIFY_BEGIN');
console.log(JSON.stringify({
  schemaVersion: runtimeData.schemaVersion,
  counts: runtimeData.counts,
  seats: runtimeData.seats.order,
  colors: runtimeData.rules.colors,
  sizes: runtimeData.rules.sizes,
  score: runtimeData.score,
  motionKeys: Object.keys(runtimeData.motion).length,
  networkKeys: Object.keys(runtimeData.network).length,
  firstIntroStart: runtimeData.introStarts[0],
  lastIntroStart: runtimeData.introStarts.at(-1),
  deepFrozen: true,
  corruptionChecks: 5,
  rendererFilesScanned: rendererFiles.length,
  duplicateCanonicalHardCodes: duplicateHardCodes.length,
}, null, 2));
console.log('THREEJS023_VERIFY_OK');
