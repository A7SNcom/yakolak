import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const runtime=readFileSync(new URL('../src/app-game-v123.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles/v123-tabletop-setup.css',import.meta.url),'utf8');
const version=JSON.parse(readFileSync(new URL('../version.json',import.meta.url),'utf8'));

for(const hook of [
  'THREE.CanvasTexture',
  'yakolak-tabletop-setup-instruction',
  'yakolak-tabletop-setup-lock',
  'setupGroup.visible',
  "game.state.setupStep==='color'",
  "game.state.setupStep==='bots'",
  'entry.choose=async mode=>'
]){
  assert.ok(runtime.includes(hook),`missing stage 2 hook: ${hook}`);
}
for(const text of ['اختر لونك','كم لاعب تحب؟','جزء من الطاولة نفسها']){
  assert.ok(runtime.includes(text),`missing stage 2 copy: ${text}`);
}
assert.ok(css.includes('#yakolakGameSetup'));
assert.ok(css.includes('yakolak-tabletop-setup-active'));
assert.match(app,/BUILD='123'/);
assert.ok(app.includes('app-game-v123.js'));
assert.ok(index.includes("const BUILD='123'"));
assert.equal(version.build,123);
assert.equal(version.version,'v123-tabletop-setup-stage2');
console.log('v123 tabletop setup verification passed');
