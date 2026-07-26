import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const runtime = readFileSync(new URL('../src/app-game-v122.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/v122-room-menu.css', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const version = JSON.parse(readFileSync(new URL('../version.json', import.meta.url), 'utf8'));

for (const text of ['ألعب أونلاين', 'مع الكمبيوتر', 'اشرحلي اللعبة', 'العربية', 'English · لاحقًا']) {
  assert.ok(runtime.includes(text), `missing wall copy: ${text}`);
}
for (const hook of ['THREE.CanvasTexture', 'raycaster.intersectObjects', 'lockClosedTable', 'moveCamera', 'fade(0', 'yakolak-diegetic-wall-menu']) {
  assert.ok(runtime.includes(hook), `missing room journey hook: ${hook}`);
}
assert.ok(runtime.includes("await import('./app-game-v121.js"), 'stage 1 must preserve the working v121 game flow');
assert.ok(css.includes('#yakolakEntry{display:none!important}'), 'the former full-screen entry must stay hidden');
assert.ok(css.includes('body.yakolak-room-sequence'));
assert.match(app, /BUILD='122'/);
assert.ok(app.includes('app-game-v122.js'));
assert.ok(index.includes("const BUILD='122'"));
assert.equal(version.build, 122);
assert.equal(version.version, 'v122-diegetic-wall-menu-stage1');

console.log('v122 diegetic wall-menu stage 1 verification passed');
