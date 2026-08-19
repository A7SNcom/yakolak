import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'web/app/gameplay/motion-controller.js'), 'utf8');

assert.doesNotMatch(source, /\brequestAnimationFrame\s*\(/, 'motion controller must schedule only through resourceRegistry.requestFrame');
assert.doesNotMatch(source, /\bcancelAnimationFrame\s*\(/, 'motion controller must cancel only registry-owned frame tokens');
assert.doesNotMatch(source, /\bsetTimeout\s*\(/, 'non-camera tweens must not use raw setTimeout');
assert.doesNotMatch(source, /\bsetInterval\s*\(/, 'non-camera tweens must not use raw setInterval');
assert.doesNotMatch(source, /\.then\s*\(/, 'controller must not create free-running Promise chains');
assert.match(source, /lifecycle\.requestFrame\s*\(/, 'all tween frames must use the THREEJS-027 resource scope');
assert.match(source, /lifecycle\.listen\s*\(reducedMotionQuery/, 'Reduced Motion subscription must be resource-owned');

console.log('THREEJS-096 motion scheduling ownership contract: PASS');
