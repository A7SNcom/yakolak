import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('THREEJS-025 minimal lighting stays baseline-derived, neutral and separated from turn emphasis', () => {
  const result = spawnSync(process.execPath, ['scripts/verify-threejs-lighting.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /THREEJS025_VERIFY_OK/);
  assert.match(result.stdout, /"lightCount": 3/);
  assert.match(result.stdout, /"fillFold": "hemisphere"/);
  assert.match(result.stdout, /"environmentMap": false/);
  assert.match(result.stdout, /"separatePresentationLayer": true/);
});
