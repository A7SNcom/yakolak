import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const governor = await readFile('web/app/camera/frame-governor.js', 'utf8');
const preview = await readFile('web/app/scene/preview-scene.js', 'utf8');

assert.match(governor, /requestAnimationFrame\(tick\)/, 'frame work must be requestAnimationFrame paced');
assert.match(governor, /cancelAnimationFrame\(frameId\)/, 'scheduled work must be cancellable');
assert.match(governor, /ResizeObserver/, 'canvas/container resizing must invalidate layout');
assert.match(governor, /window\.visualViewport\?\.addEventListener\('resize'/, 'visual viewport changes must invalidate layout');
assert.match(governor, /window\.addEventListener\('orientationchange'/, 'orientation changes must invalidate layout');
assert.match(governor, /screen\.orientation\?\.addEventListener\?\.\('change'/, 'Screen Orientation changes must invalidate layout');
assert.match(governor, /visibilitychange/, 'document visibility must govern presentation work');
assert.match(governor, /pageshow/, 'browser resume must reconcile layout without rebooting');
assert.match(governor, /pagehide/, 'background/navigation suspension must cancel scheduled frames');
assert.match(governor, /\(resolution: \$\{dpr\}dppx\)/, 'devicePixelRatio changes must be observed');
assert.match(governor, /safe-area-inset-top/, 'safe-area changes must participate in viewport reconciliation');
assert.match(governor, /rendererOwner\.resizeToDisplaySize\(\)/, 'renderer allocation must occur only through the single renderer owner');
assert.match(governor, /refitPerspectiveFov/, 'perspective FOV must refit with aspect changes');
assert.match(governor, /camera\.updateProjectionMatrix\(\)/, 'camera projection must update after resize/FOV changes');
assert.match(governor, /if \(continuous \|\| renderRequested \|\| layoutDirty\) schedule\(\)/, 'idle scenes must not keep a permanent RAF loop');
assert.doesNotMatch(governor, /setInterval\(|setTimeout\(/, 'frame/layout governance must not use timer loops or resize timeouts');

assert.match(preview, /createFrameGovernor/, 'preview scene must delegate frame pacing/viewport work to the governor');
assert.match(preview, /setContinuous\(!reducedMotion\)/, 'continuous rendering must be enabled only when preview motion requires it');
assert.match(preview, /resumed/, 'preview animation must receive resume information');
assert.doesNotMatch(preview, /rendererOwner\.resizeToDisplaySize\(\)/, 'preview scene must not perform its own resize loop');
assert.doesNotMatch(preview, /requestAnimationFrame\(/, 'preview scene must not own a competing RAF loop');

console.log('Verified THREEJS-013 frame pacing, resize, orientation and visibility governance contract');
