import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('THREEJS-024 canonical neutral/player materials remain single-source and non-color-state-safe', () => {
  const result = spawnSync(process.execPath, ['scripts/verify-threejs-materials.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /THREEJS024_VERIFY_OK/);
  assert.match(result.stdout, /"duplicatePaletteHardCodes": 0/);
  assert.match(result.stdout, /"displayName": "white marble"/);
  assert.match(result.stdout, /"materialKey": "marble"/);
  assert.match(result.stdout, /hue-only and brightness-only are forbidden/);
});
