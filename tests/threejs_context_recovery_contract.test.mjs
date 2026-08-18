import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContextRecoveryController } from '../web/app/scene/context-recovery.js';
import { createCanonicalOnlineSession } from '../web/app/session/canonical-online-session.js';

const rendererSource = await readFile('web/app/scene/renderer.js', 'utf8');
const governorSource = await readFile('web/app/camera/frame-governor.js', 'utf8');
const previewSource = await readFile('web/app/scene/preview-scene.js', 'utf8');
const bootSource = await readFile('web/app/boot/boot.js', 'utf8');
const registrySource = await readFile('web/app/core/resource-registry.js', 'utf8');
const htmlSource = await readFile('web/index.html', 'utf8');
const sessionSource = await readFile('web/app/session/canonical-online-session.js', 'utf8');

assert.match(rendererSource, /createContextRecoveryController/, 'renderer owner must own context recovery');
assert.match(rendererSource, /if \(!contextRecovery\.canUseGpu\)[\s\S]*skipped: true/, 'drawing-buffer work must be skipped while context is unavailable');
assert.match(rendererSource, /if \(!contextRecovery\.canUseGpu\) return false;[\s\S]*renderer\.render\(scene, camera\)/, 'render calls must be blocked while context is unavailable');
assert.match(rendererSource, /registerResourceRestorer/, 'renderer owner must expose one controlled resource-rebind boundary');
assert.match(governorSource, /graphicsAvailable/, 'frame governor must model graphics availability');
assert.match(governorSource, /!graphicsAvailable \|\| frameToken\?\.active/, 'registry-owned RAF scheduling must stop while graphics are unavailable');
assert.match(previewSource, /registerResourceRestorer\(\(\{ generation \}\)/, 'preview GPU-facing resources must rebind through the renderer recovery boundary');
assert.match(previewSource, /generation <= restoredResourceGeneration/, 'resource rebind must be idempotent per recovery generation');
assert.match(previewSource, /resources\.release\(\);[\s\S]*createGpuFacingPreviewResources/, 'old generation resources must release before restored resources are created');
assert.match(registrySource, /markContextLost/, 'registry must explicitly model context loss');
assert.match(registrySource, /if \(!contextLost\) resource\.forceContextLoss\?\.\(\)/, 'registry teardown must be safe after an already-lost context');
assert.match(bootSource, /getGraphicsContextSnapshot/, 'shell must expose read-only context diagnostics');
assert.match(bootSource, /window\.location\.reload\(\)/, 'failed recovery must expose one actionable reload path');
assert.equal((htmlSource.match(/id="graphics-recovery"/g) || []).length, 1, 'there must be exactly one graphics recovery failure state');
assert.equal((htmlSource.match(/id="graphics-recovery-reload"/g) || []).length, 1, 'there must be exactly one graphics recovery action');
assert.doesNotMatch(sessionSource, /\bTHREE\b|WebGLRenderer|canvas|getContext\(/, 'canonical online session state must not depend on GPU objects');

let transportSubmissions = 0;
const session = createCanonicalOnlineSession({
  roomId: 'ROOM-014',
  seatId: 'seat-4',
  playerId: 'player-4',
  async submitMove(intent, seatIdentity) {
    transportSubmissions += 1;
    return Object.freeze({ accepted: true, moveId: intent.moveId, seatId: seatIdentity.seatId });
  },
});

const seatIdentityBeforeRecovery = session.seatIdentity;
const firstSubmission = await session.submitMoveIntent({ moveId: 'mutation-014-1', cell: 5, size: 'M' });
const duplicateSubmission = await session.submitMoveIntent({ moveId: 'mutation-014-1', cell: 5, size: 'M' });
assert.equal(firstSubmission.submitted, true);
assert.equal(duplicateSubmission.duplicate, true);
assert.equal(transportSubmissions, 1, 'same mutation id must never be submitted twice');

const canvas = new EventTarget();
let restoreResourcesCalls = 0;
let guardedGpuCalls = 0;
const states = [];
const recovery = createContextRecoveryController({
  canvas,
  async restoreResources({ generation }) {
    restoreResourcesCalls += 1;
    assert.equal(generation, 1);
  },
});
recovery.subscribe((snapshot) => states.push(snapshot.state));

function issueGuardedGpuWork() {
  if (!recovery.canUseGpu) return false;
  guardedGpuCalls += 1;
  return true;
}

assert.equal(issueGuardedGpuWork(), true);
const lostEvent = new Event('webglcontextlost', { cancelable: true });
canvas.dispatchEvent(lostEvent);
assert.equal(lostEvent.defaultPrevented, true, 'context loss must be prevented so browser restoration remains possible');
assert.equal(recovery.snapshot().state, 'lost');
assert.equal(issueGuardedGpuWork(), false, 'GPU work must stop while context is lost');
assert.equal(guardedGpuCalls, 1);

canvas.dispatchEvent(new Event('webglcontextrestored'));
canvas.dispatchEvent(new Event('webglcontextrestored'));
await recovery.whenSettled();
assert.equal(recovery.snapshot().state, 'ready');
assert.equal(recovery.snapshot().restoreCount, 1);
assert.equal(restoreResourcesCalls, 1, 'one loss generation must rebind resources exactly once');
assert.deepEqual(states, ['ready', 'lost', 'restoring', 'ready']);
assert.equal(issueGuardedGpuWork(), true);

const sessionAfterRecovery = session.snapshot();
assert.equal(session.seatIdentity, seatIdentityBeforeRecovery, 'seat identity object must survive graphics recovery unchanged');
assert.equal(sessionAfterRecovery.seatIdentity, seatIdentityBeforeRecovery);
assert.deepEqual(sessionAfterRecovery.submittedMoveIds, ['mutation-014-1']);
assert.equal(transportSubmissions, 1, 'graphics restoration must not replay an already-submitted move');

const failedCanvas = new EventTarget();
const failedRecovery = createContextRecoveryController({
  canvas: failedCanvas,
  restoreResources() {
    throw new Error('synthetic restore failure');
  },
});
failedCanvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
failedCanvas.dispatchEvent(new Event('webglcontextrestored'));
await failedRecovery.whenSettled();
assert.equal(failedRecovery.snapshot().state, 'failed');
assert.equal(failedRecovery.snapshot().canUseGpu, false);
assert.match(failedRecovery.snapshot().failure.message, /synthetic restore failure/);

recovery.dispose();
failedRecovery.dispose();

console.log('Verified THREEJS-014 context loss/restore, exactly-once registry rebind, seat identity and move dedupe invariants');
