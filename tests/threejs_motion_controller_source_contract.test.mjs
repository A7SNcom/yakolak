import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => readFileSync(path.join(root, relativePath), 'utf8');
const source = read('web/app/gameplay/motion-controller.js');

assert.doesNotMatch(source, /\brequestAnimationFrame\s*\(/, 'motion controller must schedule only through resourceRegistry.requestFrame');
assert.doesNotMatch(source, /\bcancelAnimationFrame\s*\(/, 'motion controller must cancel only registry-owned frame tokens');
assert.doesNotMatch(source, /\bsetTimeout\s*\(/, 'motion controller must not use raw setTimeout');
assert.doesNotMatch(source, /\bsetInterval\s*\(/, 'motion controller must not use raw setInterval');
assert.doesNotMatch(source, /\.then\s*\(/, 'controller must not create free-running Promise chains');
assert.doesNotMatch(source, /\bnew\s+Audio\s*\(|\bAudioContext\s*\(|\.play\s*\(/, 'audio must remain outside authoritative motion scheduling/completion');
assert.match(source, /lifecycle\.requestFrame\s*\(/, 'all tween frames must use the THREEJS-027 resource scope');
assert.match(source, /lifecycle\.listen\s*\(reducedMotionQuery/, 'Reduced Motion subscription must be resource-owned');
assert.match(source, /assertSessionLifecycleState\s*\(sessionLifecycle\)/, 'THREEJS-060 lifecycle state must gate presentation generation sync');
assert.match(source, /sessionLifecycle\.presentationGeneration/, 'THREEJS-060 presentationGeneration must feed motion authority');
assert.match(source, /requestedRevision\s*!==\s*currentRevision/, 'authoritative revision must reject stale sequence submission');
assert.match(source, /motion_snap_to_canonical_required/, 'every cancellable motion must supply a canonical final snap callback');
assert.match(source, /reducedDurationMs/, 'approved Reduced Motion timing must be accepted by the single controller');
assert.match(source, /retimeEntry\s*\(/, 'Reduced Motion preference changes must retime owned work instead of creating another scheduler');

for (const relativePath of [
  'web/app/gameplay/stack-motion-sequences.js',
  'web/app/gameplay/accepted-piece-travel.js',
]) {
  const consumer = read(relativePath);
  assert.doesNotMatch(consumer, /\brequestAnimationFrame\s*\(/, `${relativePath} must not own a tween loop`);
  assert.doesNotMatch(consumer, /\bcancelAnimationFrame\s*\(/, `${relativePath} must not own tween cancellation`);
  assert.doesNotMatch(consumer, /\bsetInterval\s*\(/, `${relativePath} must not own a tween interval`);
  assert.doesNotMatch(consumer, /\bsetTimeout\s*\(/, `${relativePath} must not own a tween timeout`);
  assert.match(consumer, /\.animate\s*\(/, `${relativePath} must submit motion to THREEJS-096`);
}

console.log('THREEJS-096 motion scheduling ownership contract: PASS');
