import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const index = read('index.html');
const app = read('app.js');
const runtime = read('src/app-game-v113.js');
const version = JSON.parse(read('version.json'));
const pkg = JSON.parse(read('package.json'));

assert.match(index, /yakolak-version" content="v113-first-move-breathing-room"/);
assert.match(index, /const BUILD='113'/);
assert.match(app, /const BUILD='113'/);
assert.match(app, /src\/app-game-v113\.js/);
assert.equal(version.version, 'v113-first-move-breathing-room');
assert.equal(version.build, 113);
assert.equal(pkg.version, '0.113.0');

assert.match(runtime, /firstGuidedTurn=gameState\.firstMoveGuide&&currentPlayer\(\)===gameState\.humanColor/);
assert.match(runtime, /gameState\.turnDeadline=0/);
assert.match(runtime, /' · تعلّم'/);
assert.match(runtime, /first-guided-turn-has-no-deadline/);
assert.match(runtime, /app-game-v112\.js\?v=113-first-move-breathing-room-wrapper/);
assert.match(runtime, /app-game-v085\.js\?v=113-first-move-breathing-room-source/);
assert.doesNotMatch(app, /app-game-v112\.js/);
assert.doesNotMatch(index, /BUILD='112'/);

console.log('v113 first guided move contract passed');
