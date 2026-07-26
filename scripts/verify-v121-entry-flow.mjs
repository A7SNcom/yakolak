import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const runtime = readFileSync(new URL('../src/app-game-v121.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const version = JSON.parse(readFileSync(new URL('../version.json', import.meta.url), 'utf8'));

for (const text of ['ألعب أونلاين', 'مع الكمبيوتر', 'اشرحلي اللعبة', 'العربية', 'English · لاحقًا']) {
  assert.ok(runtime.includes(text), `missing entry copy: ${text}`);
}
for (const hook of ['v121SetWallCamera', 'setCameraView', 'yakolakFloatingSettings', 'yakolakOnlineEntry', 'v121ShowHowTo']) {
  assert.ok(runtime.includes(hook), `missing entry hook: ${hook}`);
}
assert.match(app, /BUILD='121'/);
assert.ok(app.includes('app-game-v121.js'));
assert.ok(index.includes("const BUILD='121'"));
assert.equal(version.build, 121);
assert.equal(version.version, 'v121-wall-entry-journey');

console.log('v121 entry-flow verification passed');
