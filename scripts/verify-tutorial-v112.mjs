import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const index = read('index.html');
const app = read('app.js');
const runtime = read('src/app-game-v112.js');
const version = JSON.parse(read('version.json'));

assert.match(index, /yakolak-version" content="v112-action-tutorial"/);
assert.match(index, /const BUILD='112'/);
assert.match(app, /const BUILD='112'/);
assert.match(app, /src\/app-game-v112\.js/);
assert.equal(version.version, 'v112-action-tutorial');
assert.equal(version.build, 112);

assert.match(runtime, /const BUILD='112'/);
assert.match(runtime, /تخطي التعليم/);
assert.match(runtime, /ابدأ اللعب/);
assert.match(runtime, /yakolak-tutorial-v112-complete/);
assert.match(runtime, /firstMoveGuide/);
assert.match(runtime, /خطوتك الأولى/);
assert.match(runtime, /replace passive tutorial with first real move guidance/);
assert.match(runtime, /short-skippable-action-led/);
assert.match(runtime, /app-game-v085\.js\?v=112-action-tutorial-source/);
assert.match(runtime, /v110-readable-charcoal/);

assert.doesNotMatch(app, /app-game-v111/);
assert.doesNotMatch(index, /BUILD='111'/);

console.log('v112 tutorial contract passed');
