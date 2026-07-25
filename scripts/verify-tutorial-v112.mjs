import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtime = readFileSync(new URL('../src/app-game-v112.js', import.meta.url), 'utf8');

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

console.log('v112 tutorial module contract passed');
