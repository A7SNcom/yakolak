import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('THREEJS-022 definitive neutral room stays enclosed and every scripted camera travel remains in bounds', () => {
  const result = spawnSync(process.execPath, ['scripts/verify-threejs-room.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /THREEJS022_VERIFY_OK/);
  assert.match(result.stdout, /"width": 4800/);
  assert.match(result.stdout, /"height": 1900/);
  assert.match(result.stdout, /"depth": 4800/);
  assert.match(result.stdout, /"inset": 14/);
  assert.match(result.stdout, /"count": 16/);
  assert.match(result.stdout, /"scriptedTravelPairs": 10/);
  assert.match(result.stdout, /"allInterpolatedSamplesInside": true/);
  assert.match(result.stdout, /"defaultFrontWallVisible": true/);
});
