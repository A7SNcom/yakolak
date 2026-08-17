import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('THREEJS-023 canonical layout scatter and approved contract become one immutable validated runtime dataset', () => {
  const result = spawnSync(process.execPath, ['scripts/verify-threejs-runtime-data.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /THREEJS023_VERIFY_OK/);
  assert.match(result.stdout, /"introStarts": 36/);
  assert.match(result.stdout, /"cameras": 16/);
  assert.match(result.stdout, /"deepFrozen": true/);
  assert.match(result.stdout, /"corruptionChecks": 5/);
  assert.match(result.stdout, /"duplicateCanonicalHardCodes": 0/);
});
