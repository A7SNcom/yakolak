import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('THREEJS-021 score marker, authoritative table footprint and reusable score layout stay locked', () => {
  const result = spawnSync(process.execPath, ['scripts/verify-threejs-table-score.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /THREEJS021_VERIFY_OK/);
  assert.match(result.stdout, /"runtimeBytes": 12408/);
  assert.match(result.stdout, /"topY": -16/);
  assert.match(result.stdout, /"radius": 85/);
  assert.match(result.stdout, /"gap": 11/);
  assert.match(result.stdout, /"sharedGeometryPolicy": "one decoded BufferGeometry shared by four InstancedMesh score rows"/);
  assert.match(result.stdout, /"hiddenGameOffsetApplied": false/);
});
