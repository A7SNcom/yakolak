import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const governor = await readFile('web/app/camera/frame-governor.js', 'utf8');
const renderer = await readFile('web/app/scene/renderer.js', 'utf8');
const preview = await readFile('web/app/scene/preview-scene.js', 'utf8');
const boot = await readFile('web/app/boot/boot.js', 'utf8');

assert.match(governor, /maxPixelRatio: 1\.5/, 'DPR cap must be explicit and centralized in the frame governor');
assert.match(governor, /maxFramesPerSecond: 60/, 'high-refresh displays must be frame-paced');
assert.match(governor, /resizeDebounceMs: 80/, 'costly drawing-buffer reallocations must be debounced');
assert.equal((governor.match(/window\.devicePixelRatio/g) || []).length, 1, 'the governor must be the single DPR reader');
assert.doesNotMatch(renderer, /devicePixelRatio|maxPixelRatio/, 'renderer owner must consume governor sizing policy, not invent its own DPR policy');
assert.match(renderer, /renderer\.setDrawingBufferSize\(displayWidth, displayHeight, ratio\)/, 'one committed layout must use one drawing-buffer resize call');
assert.match(governor, /rendererOwner\.resizeToDisplaySize\(\{[\s\S]*pixelRatio,[\s\S]*\}\)/, 'CSS size and capped DPR must be passed together by the governor');

assert.match(governor, /requestAnimationFrame\(tick\)/, 'frame work must use requestAnimationFrame');
assert.match(governor, /frameIntervalMs = 1000 \/ safeMaxFramesPerSecond/, 'continuous motion must obey an explicit frame interval');
assert.match(governor, /elapsedSincePresentation \+ 0\.5 >= frameIntervalMs/, 'high-refresh RAF callbacks must be skipped until the frame interval is due');
assert.match(governor, /window\.setTimeout\(\(\) => \{/, 'resize bursts must use one-shot debounce work');
assert.match(governor, /clearTimeout\(resizeTimer\)/, 'resize debounce must be cancellable');
assert.doesNotMatch(governor, /setInterval\(/, 'presentation governance must not run timer loops');

assert.match(governor, /ResizeObserver/, 'container resizing must invalidate layout');
assert.match(governor, /window\.visualViewport\?\.addEventListener\('resize'/, 'visual viewport changes must invalidate layout');
assert.match(governor, /window\.addEventListener\('orientationchange'/, 'orientation changes must invalidate layout');
assert.match(governor, /screen\.orientation\?\.addEventListener\?\.\('change'/, 'Screen Orientation changes must invalidate layout');
assert.match(governor, /safe-area-inset-top/, 'safe-area changes must participate in viewport reconciliation');
assert.match(governor, /refitPerspectiveFov/, 'perspective FOV must refit with aspect changes');
assert.match(governor, /camera\.updateProjectionMatrix\(\)/, 'camera projection must update after resize/FOV changes');

assert.match(governor, /visibilitychange/, 'document visibility must govern presentation work');
assert.match(governor, /pageshow/, 'browser resume must reconcile layout without rebooting');
assert.match(governor, /pagehide/, 'background/navigation suspension must pause presentation work');
assert.match(governor, /function pausePresentation\(\)[\s\S]*cancelScheduledFrame\(\);[\s\S]*cancelResizeDebounce\(\);/, 'backgrounding must cancel RAF and pending resize work');
assert.match(governor, /function resumePresentation\(\)[\s\S]*resumed = true;[\s\S]*invalidateLayout\(\{ immediate: true \}\)/, 'resume must reconcile presentation without replaying lifecycle');

assert.match(preview, /createFrameGovernor/, 'preview scene must delegate frame pacing/viewport work to the governor');
assert.match(preview, /setContinuous\(!reducedMotion\)/, 'continuous rendering must be enabled only while motion requires it');
assert.match(preview, /resumed/, 'preview animation must receive resume information and freeze hidden time');
assert.doesNotMatch(preview, /rendererOwner\.resizeToDisplaySize\(/, 'preview scene must not perform its own resize loop');
assert.doesNotMatch(preview, /requestAnimationFrame\(/, 'preview scene must not own a competing RAF loop');
assert.match(boot, /getPresentationSnapshot/, 'boot may expose read-only presentation diagnostics without owning presentation state');
assert.doesNotMatch(boot, /visibilitychange|pageshow|pagehide|orientationchange/, 'boot/lifecycle must not be replayed from presentation events');

console.log('Verified THREEJS-013 paced DPR, resize, orientation and visibility governance contract');
