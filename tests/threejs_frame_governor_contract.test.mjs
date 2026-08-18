import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const governor = await readFile('web/app/camera/frame-governor.js', 'utf8');
const renderer = await readFile('web/app/scene/renderer.js', 'utf8');
const preview = await readFile('web/app/scene/preview-scene.js', 'utf8');
const registry = await readFile('web/app/core/resource-registry.js', 'utf8');
const boot = await readFile('web/app/boot/boot.js', 'utf8');

assert.match(governor, /maxPixelRatio: 1\.5/, 'DPR cap must be explicit and centralized in the frame governor');
assert.match(governor, /maxFramesPerSecond: 60/, 'high-refresh displays must be frame-paced');
assert.match(governor, /resizeDebounceMs: 80/, 'costly drawing-buffer reallocations must be debounced');
assert.equal((governor.match(/window\.devicePixelRatio/g) || []).length, 1, 'the governor must be the single DPR reader');
assert.doesNotMatch(renderer, /devicePixelRatio|maxPixelRatio/, 'renderer owner must consume governor sizing policy, not invent its own DPR policy');
assert.match(renderer, /renderer\.setDrawingBufferSize\(displayWidth, displayHeight, ratio\)/, 'one committed layout must use one drawing-buffer resize call');
assert.match(governor, /rendererOwner\.resizeToDisplaySize\(\{[\s\S]*pixelRatio,[\s\S]*\}\)/, 'CSS size and capped DPR must be passed together by the governor');

assert.match(governor, /lifecycle\.requestFrame\(tick/, 'frame work must use registry-owned requestAnimationFrame');
assert.match(governor, /frameIntervalMs = 1000 \/ safeMaxFramesPerSecond/, 'continuous motion must obey an explicit frame interval');
assert.match(governor, /elapsedSincePresentation \+ 0\.5 >= frameIntervalMs/, 'high-refresh RAF callbacks must be skipped until the frame interval is due');
assert.match(governor, /lifecycle\.setTimeout\(\(\) => \{/, 'resize bursts must use one registry-owned one-shot debounce');
assert.match(governor, /resizeToken\?\.cancel\('resize-debounce-cancelled'\)/, 'resize debounce must be cancellable through the registry token');
assert.doesNotMatch(governor, /\bsetInterval\(/, 'presentation governance must not run timer loops');
assert.match(registry, /requestAnimationFrame/, 'registry must own browser RAF handles');
assert.match(registry, /clearTimeout/, 'registry must own timeout cancellation');

assert.match(governor, /ResizeObserver/, 'container resizing must invalidate layout');
assert.match(governor, /lifecycle\.listen\(window\.visualViewport, 'resize'/, 'visual viewport changes must be registry-owned');
assert.match(governor, /lifecycle\.listen\(window, 'orientationchange'/, 'orientation changes must be registry-owned');
assert.match(governor, /lifecycle\.listen\(screen\.orientation, 'change'/, 'Screen Orientation changes must be registry-owned');
assert.match(governor, /safe-area-inset-top/, 'safe-area changes must participate in viewport reconciliation');
assert.match(governor, /refitPerspectiveFov/, 'perspective FOV must refit with aspect changes');
assert.match(governor, /camera\.updateProjectionMatrix\(\)/, 'camera projection must update after resize/FOV changes');

assert.match(governor, /visibilitychange/, 'document visibility must govern presentation work');
assert.match(governor, /pageshow/, 'browser resume must reconcile layout without rebooting');
assert.match(governor, /pagehide/, 'background/navigation suspension must pause presentation work');
assert.match(governor, /function pausePresentation\(\)[\s\S]*cancelScheduledFrame\(\);[\s\S]*cancelResizeDebounce\(\);/, 'backgrounding must cancel registry-owned RAF and resize work');
assert.match(governor, /function resumePresentation\(\)[\s\S]*resumed = true;[\s\S]*invalidateLayout\(\{ immediate: true \}\)/, 'resume must reconcile presentation without replaying lifecycle');

assert.match(preview, /createFrameGovernor/, 'preview scene must delegate frame pacing/viewport work to the governor');
assert.match(preview, /resourceRegistry: registry/, 'preview and frame governor must share one root registry');
assert.match(preview, /setContinuous\(!reducedMotion\)/, 'continuous rendering must be enabled only while motion requires it');
assert.match(preview, /resumed/, 'preview animation must receive resume information and freeze hidden time');
assert.doesNotMatch(preview, /rendererOwner\.resizeToDisplaySize\(/, 'preview scene must not perform its own resize loop');
assert.doesNotMatch(preview, /\brequestAnimationFrame\(/, 'preview scene must not own a competing RAF loop');
assert.match(boot, /getPresentationSnapshot/, 'boot may expose read-only presentation diagnostics without owning presentation state');
assert.doesNotMatch(boot, /visibilitychange|pageshow|pagehide|orientationchange/, 'boot/lifecycle must not be replayed from presentation events');

console.log('Verified THREEJS-013 paced DPR, resize, orientation, visibility and registry-owned handle contract');
