import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root));
const text = (path) => read(path).toString('utf8');

function gitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`);
  return createHash('sha1').update(header).update(buffer).digest('hex');
}

const expected = new Map([
  ['web/vendor/three/r185/three.module.js', 'ad13abf7d128bee607a7672646ca543327e258d3'],
  ['web/vendor/three/r185/three.core.js', '0bb9262cd029f411933d077fd44197a51ec5e8e9'],
  ['web/vendor/three/r185/addons/loaders/STLLoader.js', '45f8ddfcab5882d938cceb0527e83a6a586bfd17'],
  ['web/vendor/three/r185/LICENSE', '8ada2a5f982916b0ba4b7a0aa7de347587e745d7'],
]);

for (const [path, sha] of expected) {
  assert.equal(gitBlobSha(read(path)), sha, `${path} must match pinned upstream bytes`);
}

const index = text('web/index.html');
assert.match(index, /"three"\s*:\s*"\.\/vendor\/three\/r185\/three\.module\.js"/);
assert.match(index, /"three\/addons\/"\s*:\s*"\.\/vendor\/three\/r185\/addons\/"/);
assert.doesNotMatch(index, /https?:\/\//i, 'runtime import map must stay local');
assert.doesNotMatch(index, /\blatest\b/i, 'runtime must never target latest');

const runtimeFiles = [
  'web/index.html',
  'web/app/boot/boot.js',
  'web/app/scene/renderer.js',
];
for (const path of runtimeFiles) {
  const source = text(path);
  assert.doesNotMatch(source, /(unpkg|jsdelivr|esm\.sh|skypack|cdn\.jsdelivr)/i, `${path} must not depend on a CDN`);
}

const addonsRoot = new URL('web/vendor/three/r185/addons/', root);
const addonFiles = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else addonFiles.push(relative(addonsRoot.pathname, full).replaceAll('\\', '/'));
  }
}
walk(addonsRoot.pathname);
assert.deepEqual(addonFiles.sort(), ['loaders/STLLoader.js'], 'only the required STLLoader addon may be vendored');

const loader = text('web/vendor/three/r185/addons/loaders/STLLoader.js');
assert.match(loader, /from 'three';/);
assert.doesNotMatch(loader, /https?:\/\//i);

const notices = text('THIRD_PARTY_NOTICES.md');
assert.match(notices, /0\.185\.1/);
assert.match(notices, /2431a09f46f34c560bc8e44b33be0e567723d5b9/);
assert.match(notices, /MIT/);
assert.match(notices, /STLLoader/);

console.log('THREEJS-011 vendor contract: PASS');
