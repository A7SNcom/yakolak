import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...segments) => readFile(path.join(repoRoot, ...segments), 'utf8');
const readJson = async (...segments) => JSON.parse(await read(...segments));

const contract = await readJson('YAKOLAK_PORTABLE_KIT', 'assets', 'reference', 'approved-contract.json');
const runtimeDataSource = await read('web', 'app', 'data', 'runtime-data.js');
const materialSource = await read('web', 'app', 'materials', 'canonical-materials.js');
const playerBaseSource = await read('web', 'app', 'scene', 'player-bases.js');
const tableScoreSource = await read('web', 'app', 'scene', 'table-and-score.js');
const bootSource = await read('web', 'app', 'boot', 'boot.js');

const expectedPalette = Object.freeze({
  wall: '#f7f7f4',
  floor: '#deddd7',
  table: '#aeb2b6',
  board: '#4a5562',
  marble: '#f1eee6',
  blue: '#3769a5',
  gold: '#b78a44',
  green: '#2f856a',
  ink: '#3f3f3f',
});
const playerIds = ['marble', 'blue', 'gold', 'green'];
const expectedFinishes = Object.freeze({
  marble: Object.freeze({ roughness: 0.88, metalness: 0, cue: 'marble-vein' }),
  blue: Object.freeze({ roughness: 0.72, metalness: 0, cue: 'double-band' }),
  gold: Object.freeze({ roughness: 0.38, metalness: 0.12, cue: 'single-notch' }),
  green: Object.freeze({ roughness: 0.56, metalness: 0, cue: 'dot-band' }),
});

assert.deepEqual(contract.materials?.palette, expectedPalette, 'approved neutral/player palette drift');
assert.deepEqual(contract.rules?.colors, playerIds, 'canonical playable color order drift');
assert.deepEqual(contract.colorIdentity?.canonicalPlayableIds, playerIds, 'colorIdentity playable IDs drift');
assert.deepEqual(contract.colorIdentity?.displayMaterial?.marble, { displayName: 'white marble', materialKey: 'marble' });
assert.match(contract.colorIdentity?.rule || '', /white is a visual\/material description of marble/);

assert.match(runtimeDataSource, /colorIdentity: clonePlain\(contract\.colorIdentity, 'colorIdentity'\)/, 'color identity must be carried by immutable runtime data');
assert.match(bootSource, /createCanonicalMaterialSystem\(\{ runtimeData: canonicalRuntimeData \}\)/, 'boot must build materials from validated runtime data');
assert.match(bootSource, /dataset\.canonicalMaterials = 'ready'/, 'boot must not report canonical materials ready before creation');
assert.match(materialSource, /export function derivePlayerPresentationMap\(runtimeData\)/);
assert.match(materialSource, /gameplayId: colorId/);
assert.match(materialSource, /materialKey: colorId/);
assert.match(materialSource, /displayNameFor\(colorId, colorIdentity\)/);
assert.match(materialSource, /whiteMarble = true/);
assert.match(materialSource, /externalMutableTextureUrls = false/);
assert.match(materialSource, /proceduralVeining = Object\.freeze\(\{ allowed: true, enabled: false, externalImageRequired: false \}\)/);

for (const [id, finish] of Object.entries(expectedFinishes)) {
  const pattern = new RegExp(`${id}: Object\\.freeze\\(\\{ roughness: ${finish.roughness}, metalness: ${finish.metalness}, finishClass: '[^']+', nonColorIdentityCue: '${finish.cue}' \\}\\)`);
  assert.match(materialSource, pattern, `${id} finish/accessibility cue drift`);
}
for (const state of ['selected', 'active', 'winner']) {
  const stateBlock = materialSource.match(new RegExp(`${state}: Object\\.freeze\\(\\{([\\s\\S]*?)\\n  \\}\\)`))?.[1] || '';
  assert.match(stateBlock, /requiresNonColorCue: true/, `${state} must require a non-color cue`);
  assert.match(stateBlock, /hueOnlyAllowed: false/, `${state} must not rely on hue alone`);
  assert.match(stateBlock, /brightnessOnlyAllowed: false/, `${state} must not rely on brightness alone`);
}

assert.doesNotMatch(playerBaseSource, /PLAYER_BASE_COLOR_BY_SEAT/, 'seat→color mapping must come from world-layout identities');
assert.match(playerBaseSource, /worldLayout\.identities\[seatId\]/, 'player bases must consume authoritative identity data');
assert.doesNotMatch(tableScoreSource, /\['marble', 'blue', 'gold', 'green'\]/, 'score renderer must not duplicate canonical player IDs');
assert.match(tableScoreSource, /approvedContract\?\.rules\?\.colors/, 'score materials must derive IDs from canonical rules');

async function listJsFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listJsFiles(full));
    else if (entry.isFile() && /\.(?:js|mjs)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const appFiles = await listJsFiles(path.join(repoRoot, 'web', 'app'));
const paletteHardCodes = [];
for (const file of appFiles) {
  const source = await readFile(file, 'utf8');
  for (const [key, hex] of Object.entries(expectedPalette)) {
    if (source.toLowerCase().includes(hex)) paletteHardCodes.push({ file: path.relative(repoRoot, file), key, hex });
  }
}
assert.deepEqual(paletteHardCodes, [], 'canonical palette hex values must live in approved runtime data, not renderer source');

function srgbToLinear(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function linearRgb(hex) {
  return [1, 3, 5].map((offset) => srgbToLinear(Number.parseInt(hex.slice(offset, offset + 2), 16)));
}
function transform(rgb, matrix) {
  return matrix.map((row) => Math.max(0, Math.min(1, row.reduce((sum, weight, index) => sum + weight * rgb[index], 0))));
}
function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function finishDistance(a, b) {
  return Math.hypot(a.roughness - b.roughness, a.metalness - b.metalness);
}

const cvdMatrices = Object.freeze({
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
});
const cvdReport = {};
for (const [mode, matrix] of Object.entries(cvdMatrices)) {
  const simulated = Object.fromEntries(playerIds.map((id) => [id, transform(linearRgb(expectedPalette[id]), matrix)]));
  const pairs = [];
  for (let i = 0; i < playerIds.length; i += 1) {
    for (let j = i + 1; j < playerIds.length; j += 1) {
      const a = playerIds[i];
      const b = playerIds[j];
      const colorDistance = distance(simulated[a], simulated[b]);
      const independentFinishDistance = finishDistance(expectedFinishes[a], expectedFinishes[b]);
      const cuesDistinct = expectedFinishes[a].cue !== expectedFinishes[b].cue;
      if (colorDistance < 0.2) {
        assert.ok(independentFinishDistance >= 0.15, `${mode} weak color pair ${a}/${b} needs a materially distinct finish`);
        assert.ok(cuesDistinct, `${mode} weak color pair ${a}/${b} needs a distinct non-color identity cue`);
      }
      pairs.push({ a, b, colorDistance, finishDistance: independentFinishDistance, cuesDistinct });
    }
  }
  cvdReport[mode] = pairs;
}

console.log('THREEJS024_VERIFY_BEGIN');
console.log(JSON.stringify({
  palette: expectedPalette,
  playerIds,
  marbleDisplay: contract.colorIdentity.displayMaterial.marble,
  finishes: expectedFinishes,
  stateCuePolicy: 'selected/active/winner require geometry/text/motion cues; hue-only and brightness-only are forbidden',
  cvdReport,
  rendererFilesScanned: appFiles.length,
  duplicatePaletteHardCodes: paletteHardCodes.length,
}, null, 2));
console.log('THREEJS024_VERIFY_OK');
