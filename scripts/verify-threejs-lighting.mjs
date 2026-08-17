import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readText = (...segments) => readFile(path.join(repoRoot, ...segments), 'utf8');
const readJson = async (...segments) => JSON.parse(await readText(...segments));
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

const BASELINES = Object.freeze([
  Object.freeze({ file: 'production-320x568.png', sha256: '4518eaf4416416cf23200813c78628c46f38b260ad4010d4903c62be0bfbdf37' }),
  Object.freeze({ file: 'production-390x844.png', sha256: 'a46f7180068b13c62eef158c5eb4b5b898a7c27f8e72d8c4716542e352923561' }),
  Object.freeze({ file: 'production-1440x900.png', sha256: 'dba7b25c571b49c609594fcbcdbd0aa423a084ca11f91ef405a42e193ae9baab' }),
]);

const [contract, baselineDoc, lightingSource, previewSource, bootSource, performanceBudgets] = await Promise.all([
  readJson('YAKOLAK_PORTABLE_KIT', 'assets', 'reference', 'approved-contract.json'),
  readText('docs', 'threejs-baseline', 'BASELINE.md'),
  readText('web', 'app', 'scene', 'lighting-rig.js'),
  readText('web', 'app', 'scene', 'preview-scene.js'),
  readText('web', 'app', 'boot', 'boot.js'),
  readText('THREEJS_PERFORMANCE_BUDGETS.md'),
]);

const ratios = contract.materials?.lightingReferenceOnly?.normalizedRatios;
assert.deepEqual(ratios, { hemisphere: 0.62, key: 1.15, fill: 0.28, rim: 0.38 });
assert.match(contract.materials.lightingReferenceOnly.note, /visual references, not engine-specific light units/i);

const baselineReports = [];
for (const baseline of BASELINES) {
  const bytes = await readFile(path.join(repoRoot, 'docs', 'threejs-baseline', 'screenshots', baseline.file));
  const digest = sha256(bytes);
  assert.equal(digest, baseline.sha256, `${baseline.file} frozen baseline hash drift`);
  assert.match(baselineDoc, new RegExp(`${baseline.file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\n]*${baseline.sha256}`));
  baselineReports.push({ file: baseline.file, bytes: bytes.length, sha256: digest });
}
assert.match(baselineDoc, /Production Git SHA \/ branch creation SHA: `04c75be60501778028e8107992e85c74d113b3da`/);

assert.match(lightingSource, /source: 'runtimeData\.materials\.lightingReferenceOnly\.normalizedRatios'/);
assert.match(lightingSource, /baselineTuningSource: 'docs\/threejs-baseline\/screenshots'/);
assert.match(lightingSource, /neutralLightCount: 3/);
assert.match(lightingSource, /fillFold: 'hemisphere'/);
assert.match(lightingSource, /environmentMap: false/);
assert.match(lightingSource, /shadows: false/);
assert.match(lightingSource, /turnEmphasisLightCount: 0/);
assert.match(lightingSource, /neutralMutationFromTurnState: false/);
assert.equal((lightingSource.match(/new THREE\.HemisphereLight\(/g) || []).length, 1, 'neutral rig must have exactly one hemisphere light');
assert.equal((lightingSource.match(/new THREE\.DirectionalLight\(/g) || []).length, 2, 'neutral rig must have exactly two directional lights');
assert.doesNotMatch(lightingSource, /new THREE\.(?:PointLight|SpotLight|AmbientLight|RectAreaLight)\(/, 'no extra light class allowed in minimal neutral rig');
assert.doesNotMatch(lightingSource, /(?:2\.15|3\.4|\b18\b)/, 'old placeholder/Godot-like intensity literals must not survive in canonical lighting rig');
assert.doesNotMatch(lightingSource, /\.gd['"]/i, 'Three.js lighting must not import Godot lighting code');

assert.match(previewSource, /createMinimalLightingRig/);
assert.match(previewSource, /createTurnEmphasisPresentation/);
assert.doesNotMatch(previewSource, /new THREE\.(?:HemisphereLight|DirectionalLight|PointLight|SpotLight|AmbientLight)/, 'preview scene must not own duplicate lighting');
assert.doesNotMatch(previewSource, /FogExp2/, 'neutral lighting comparison must not be distorted by placeholder fog');
assert.match(previewSource, /materialSystem\.getSurfaceMaterial\('board'\)/);
assert.match(previewSource, /materialSystem\.getPlayerMaterial\('marble'\)/);

assert.match(bootSource, /createPreviewScene\(rendererOwner, \{\s*runtimeData: canonicalRuntimeData,\s*materialSystem,/s);
assert.match(bootSource, /dataset\.canonicalLighting = 'ready'/);
assert.match(bootSource, /getLightingSnapshot/);
assert.match(bootSource, /setPreviewTurnEmphasis/);

assert.match(performanceBudgets, /Representative mobile profile/i);
assert.match(performanceBudgets, /390/);
assert.match(performanceBudgets, /844/);

console.log('THREEJS025_VERIFY_BEGIN');
console.log(JSON.stringify({
  sourceRatios: ratios,
  neutralPolicy: {
    lightCount: 3,
    classes: ['HemisphereLight', 'DirectionalLight', 'DirectionalLight'],
    fillFold: 'hemisphere',
    shadows: false,
    environmentMap: false,
  },
  turnEmphasis: {
    separatePresentationLayer: true,
    neutralMutation: false,
    lightCount: 0,
  },
  baselineScreenshots: baselineReports,
  tuningAuthority: 'frozen baseline screenshot pixels + portable normalized ratios; never Godot engine light units',
}, null, 2));
console.log('THREEJS025_VERIFY_OK');
