import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { AssetConversionCheckError, runAssetConversionPipeline } from '../scripts/lib/asset-conversion-pipeline.mjs';
import { sha256, stlToGlb } from '../scripts/lib/stl-glb-converter.mjs';

function binaryStl(triangles) {
  const buffer = Buffer.alloc(84 + triangles.length * 50);
  buffer.writeUInt32LE(triangles.length, 80);
  let offset = 84;
  for (const triangle of triangles) {
    for (const value of triangle.normal) { buffer.writeFloatLE(value, offset); offset += 4; }
    for (const vertex of triangle.vertices) {
      for (const value of vertex) { buffer.writeFloatLE(value, offset); offset += 4; }
    }
    buffer.writeUInt16LE(0, offset); offset += 2;
  }
  return buffer;
}

function glbJson(glb) {
  assert.equal(glb.readUInt32LE(0), 0x46546c67);
  assert.equal(glb.readUInt32LE(4), 2);
  const jsonLength = glb.readUInt32LE(12);
  assert.equal(glb.readUInt32LE(16), 0x4e4f534a);
  return JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8').trimEnd());
}

async function fixtureRepo() {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'yakolak-assets-'));
  await mkdir(path.join(repoRoot, 'canonical'), { recursive: true });
  const sourceA = binaryStl([
    { normal: [0, 0, 1], vertices: [[100, -2, 5], [110, -2, 5], [100, 8, 5]] },
    { normal: [0, 0, 1], vertices: [[110, -2, 5], [110, 8, 5], [100, 8, 5]] },
    { normal: [0, 1, 0], vertices: [[-50, 0, 0], [-40, 0, 0], [-50, 0, 10]] },
  ]);
  const sourceB = binaryStl([
    { normal: [1, 0, 0], vertices: [[1, 2, 3], [1, 3, 3], [1, 2, 4]] },
  ]);
  await writeFile(path.join(repoRoot, 'canonical/a.stl'), sourceA);
  await writeFile(path.join(repoRoot, 'canonical/b.stl'), sourceB);
  const plan = [
    { logicalId: 'model.a', sourcePath: 'canonical/a.stl', outputPath: 'web/assets/models/a.glb' },
    { logicalId: 'model.b', sourcePath: 'canonical/b.stl', outputPath: 'web/assets/models/b.glb' },
  ];
  return { repoRoot, plan, sourceA, sourceB, statePath: 'web/assets/models/conversion-state.json' };
}

test('STL -> GLB is byte-deterministic and preserves raw units/pivot plus disconnected object separation', () => {
  const source = binaryStl([
    { normal: [0, 0, 1], vertices: [[100, -2, 5], [110, -2, 5], [100, 8, 5]] },
    { normal: [0, 0, 1], vertices: [[110, -2, 5], [110, 8, 5], [100, 8, 5]] },
    { normal: [0, 1, 0], vertices: [[-50, 0, 0], [-40, 0, 0], [-50, 0, 10]] },
  ]);
  const first = stlToGlb(source, { sourcePath: 'canonical/example.stl' });
  const second = stlToGlb(source, { sourcePath: 'canonical/example.stl' });
  assert.deepEqual(first.glb, second.glb);
  assert.equal(first.outputSha256, second.outputSha256);
  const json = glbJson(first.glb);
  assert.equal(json.nodes.length, 2, 'disconnected STL components must stay separately addressable');
  assert.deepEqual(json.accessors[0].min, [100, -2, 5]);
  assert.deepEqual(json.accessors[0].max, [110, 8, 5]);
  assert.equal(json.extras.yakolakConversion.geometry.transformPolicy, 'identity-no-center-no-scale-no-rotation');
  assert.equal(json.extras.yakolakConversion.geometry.normalPolicy, 'source-face-normal-normalized; computed only when source normal is zero/invalid');
});

test('pipeline converts only changed STL sources, preserves canonical bytes and records hash/version provenance', async () => {
  const fixture = await fixtureRepo();
  try {
    const beforeA = sha256(await readFile(path.join(fixture.repoRoot, 'canonical/a.stl')));
    const beforeB = sha256(await readFile(path.join(fixture.repoRoot, 'canonical/b.stl')));
    const first = await runAssetConversionPipeline(fixture);
    assert.deepEqual(first.converted, ['model.a', 'model.b']);
    assert.deepEqual(first.skipped, []);
    assert.equal(sha256(await readFile(path.join(fixture.repoRoot, 'canonical/a.stl'))), beforeA);
    assert.equal(sha256(await readFile(path.join(fixture.repoRoot, 'canonical/b.stl'))), beforeB);

    const state = JSON.parse(await readFile(path.join(fixture.repoRoot, fixture.statePath), 'utf8'));
    assert.equal(state.converter.id, 'yakolak-stl-to-glb');
    assert.equal(state.converter.version, '1.0.0');
    assert.match(state.targets['model.a'].sourceSha256, /^[0-9a-f]{64}$/);
    assert.match(state.targets['model.a'].sourceGitBlobSha1, /^[0-9a-f]{40}$/);
    assert.match(state.targets['model.a'].outputSha256, /^[0-9a-f]{64}$/);
    assert.equal(state.targets['model.a'].componentCount, 2);

    const second = await runAssetConversionPipeline(fixture);
    assert.deepEqual(second.converted, []);
    assert.deepEqual(second.skipped, ['model.a', 'model.b']);

    const changedA = binaryStl([
      { normal: [0, 0, 1], vertices: [[100, -2, 5], [120, -2, 5], [100, 8, 5]] },
    ]);
    await writeFile(path.join(fixture.repoRoot, 'canonical/a.stl'), changedA);
    const third = await runAssetConversionPipeline(fixture);
    assert.deepEqual(third.converted, ['model.a']);
    assert.deepEqual(third.skipped, ['model.b']);
  } finally {
    await rm(fixture.repoRoot, { recursive: true, force: true });
  }
});

test('--check semantics detect stale/corrupt committed runtime output without mutating it', async () => {
  const fixture = await fixtureRepo();
  try {
    await runAssetConversionPipeline(fixture);
    const output = path.join(fixture.repoRoot, 'web/assets/models/a.glb');
    await writeFile(output, Buffer.from('corrupt'));
    const corruptHash = sha256(await readFile(output));
    await assert.rejects(
      runAssetConversionPipeline({ ...fixture, mode: 'check' }),
      (error) => error instanceof AssetConversionCheckError && error.stale.some((entry) => entry.logicalId === 'model.a'),
    );
    assert.equal(sha256(await readFile(output)), corruptHash, 'check mode must never rewrite outputs');
  } finally {
    await rm(fixture.repoRoot, { recursive: true, force: true });
  }
});

test('canonical conversion is an explicit maintenance command, never a normal Vercel/build lifecycle step', async () => {
  const [vercel, verifyShell, packageJson] = await Promise.all([
    readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/verify-threejs-shell.sh', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  assert.doesNotMatch(vercel, /convert-threejs-assets|assets:convert/);
  assert.doesNotMatch(verifyShell, /node\s+scripts\/convert-threejs-assets\.mjs/);
  assert.equal(packageJson.scripts?.prebuild, undefined);
  assert.equal(packageJson.scripts?.postinstall, undefined);
});
