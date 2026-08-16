// THREEJS-013: presentation-only frame pacing / viewport governance.
// This module never owns authoritative game or lifecycle state.

const DEFAULT_BASE_FOV = 42;
const DEFAULT_REFERENCE_ASPECT = 1;
const DEFAULT_MAX_FOV = 72;

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function refitPerspectiveFov({
  baseFov = DEFAULT_BASE_FOV,
  aspect,
  referenceAspect = DEFAULT_REFERENCE_ASPECT,
  maxFov = DEFAULT_MAX_FOV,
}) {
  const safeBaseFov = finitePositive(baseFov, DEFAULT_BASE_FOV);
  const safeAspect = finitePositive(aspect, 1);
  const safeReferenceAspect = finitePositive(referenceAspect, DEFAULT_REFERENCE_ASPECT);
  const safeMaxFov = Math.max(safeBaseFov, finitePositive(maxFov, DEFAULT_MAX_FOV));

  if (safeAspect >= safeReferenceAspect) return safeBaseFov;

  const baseRadians = safeBaseFov * Math.PI / 180;
  const referenceHorizontal = 2 * Math.atan(Math.tan(baseRadians / 2) * safeReferenceAspect);
  const fittedRadians = 2 * Math.atan(Math.tan(referenceHorizontal / 2) / safeAspect);
  const fittedDegrees = fittedRadians * 180 / Math.PI;
  return clamp(fittedDegrees, safeBaseFov, safeMaxFov);
}

function createSafeAreaProbe() {
  const probe = document.createElement('div');
  probe.dataset.safeAreaProbe = 'true';
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = [
    'position:fixed',
    'inset:0',
    'visibility:hidden',
    'pointer-events:none',
    'z-index:-1',
    'padding-top:env(safe-area-inset-top)',
    'padding-right:env(safe-area-inset-right)',
    'padding-bottom:env(safe-area-inset-bottom)',
    'padding-left:env(safe-area-inset-left)',
  ].join(';');
  document.body.append(probe);
  return probe;
}

function readSafeArea(probe) {
  const style = getComputedStyle(probe);
  const px = (value) => Math.max(0, Number.parseFloat(value) || 0);
  return Object.freeze({
    top: px(style.paddingTop),
    right: px(style.paddingRight),
    bottom: px(style.paddingBottom),
    left: px(style.paddingLeft),
  });
}

function sameInsets(a, b) {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

function readViewportSnapshot(safeArea) {
  const visualViewport = window.visualViewport;
  return Object.freeze({
    width: Math.max(1, Math.round(visualViewport?.width || window.innerWidth || 1)),
    height: Math.max(1, Math.round(visualViewport?.height || window.innerHeight || 1)),
    scale: finitePositive(visualViewport?.scale, 1),
    devicePixelRatio: finitePositive(window.devicePixelRatio, 1),
    orientation: screen.orientation?.type || (window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait'),
    safeArea,
  });
}

export function createFrameGovernor({
  rendererOwner,
  camera,
  onFrame,
  baseFov = DEFAULT_BASE_FOV,
  referenceAspect = DEFAULT_REFERENCE_ASPECT,
  maxFov = DEFAULT_MAX_FOV,
}) {
  if (!rendererOwner || typeof rendererOwner.resizeToDisplaySize !== 'function') {
    throw new TypeError('Frame governor requires the renderer owner');
  }
  if (!camera || typeof camera.updateProjectionMatrix !== 'function') {
    throw new TypeError('Frame governor requires a perspective camera');
  }
  if (typeof onFrame !== 'function') {
    throw new TypeError('Frame governor requires an onFrame callback');
  }

  let disposed = false;
  let started = false;
  let visible = document.visibilityState !== 'hidden';
  let continuous = false;
  let layoutDirty = true;
  let renderRequested = true;
  let resumed = false;
  let frameId = 0;
  let resizeObserver = null;
  let dprMedia = null;
  let safeAreaProbe = null;
  let safeArea = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });
  let viewport = null;

  function assertLive() {
    if (disposed) throw new Error('Frame governor has been disposed');
  }

  function cancelScheduledFrame() {
    if (!frameId) return;
    cancelAnimationFrame(frameId);
    frameId = 0;
  }

  function schedule() {
    if (!started || disposed || !visible || frameId) return;
    frameId = requestAnimationFrame(tick);
  }

  function requestRender() {
    assertLive();
    renderRequested = true;
    schedule();
  }

  function invalidateLayout() {
    if (disposed) return;
    layoutDirty = true;
    renderRequested = true;
    schedule();
  }

  function bindDprWatcher() {
    if (dprMedia?.removeEventListener) dprMedia.removeEventListener('change', onDprChange);
    const dpr = finitePositive(window.devicePixelRatio, 1);
    dprMedia = window.matchMedia?.(`(resolution: ${dpr}dppx)`) || null;
    dprMedia?.addEventListener?.('change', onDprChange);
  }

  function onDprChange() {
    bindDprWatcher();
    invalidateLayout();
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      visible = false;
      cancelScheduledFrame();
      return;
    }
    visible = true;
    resumed = true;
    invalidateLayout();
  }

  function onPageHide() {
    visible = false;
    cancelScheduledFrame();
  }

  function onPageShow() {
    if (disposed) return;
    visible = document.visibilityState !== 'hidden';
    resumed = true;
    invalidateLayout();
  }

  function applyLayout() {
    const nextSafeArea = readSafeArea(safeAreaProbe);
    const safeAreaChanged = !sameInsets(nextSafeArea, safeArea);
    safeArea = nextSafeArea;

    const display = rendererOwner.resizeToDisplaySize();
    const aspect = display.width / display.height;
    const nextFov = refitPerspectiveFov({ baseFov, aspect, referenceAspect, maxFov });
    const cameraChanged = Math.abs(camera.aspect - aspect) > 0.0001 || Math.abs(camera.fov - nextFov) > 0.0001;

    if (cameraChanged) {
      camera.aspect = aspect;
      camera.fov = nextFov;
      camera.updateProjectionMatrix();
    }

    viewport = readViewportSnapshot(safeArea);
    layoutDirty = false;

    return Object.freeze({
      width: display.width,
      height: display.height,
      resized: display.resized,
      cameraChanged,
      safeAreaChanged,
      viewport,
    });
  }

  function tick(now) {
    frameId = 0;
    if (!started || disposed || !visible) return;

    const layout = layoutDirty ? applyLayout() : null;
    const shouldDraw = renderRequested || continuous || Boolean(layout);
    const didResume = resumed;
    resumed = false;

    if (shouldDraw) {
      renderRequested = false;
      onFrame(Object.freeze({
        now,
        resumed: didResume,
        layoutChanged: Boolean(layout),
        layout,
        viewport,
      }));
    }

    if (continuous || renderRequested || layoutDirty) schedule();
  }

  function setContinuous(value) {
    assertLive();
    continuous = Boolean(value);
    renderRequested = true;
    schedule();
  }

  function start() {
    assertLive();
    if (started) return;
    started = true;
    visible = document.visibilityState !== 'hidden';
    safeAreaProbe = createSafeAreaProbe();

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('resize', invalidateLayout, { passive: true });
    window.addEventListener('orientationchange', invalidateLayout, { passive: true });
    window.visualViewport?.addEventListener('resize', invalidateLayout, { passive: true });
    screen.orientation?.addEventListener?.('change', invalidateLayout);

    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(invalidateLayout);
      resizeObserver.observe(rendererOwner.canvas);
      if (rendererOwner.canvas.parentElement) resizeObserver.observe(rendererOwner.canvas.parentElement);
    }

    bindDprWatcher();
    invalidateLayout();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    started = false;
    cancelScheduledFrame();
    resizeObserver?.disconnect();
    resizeObserver = null;

    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('resize', invalidateLayout);
    window.removeEventListener('orientationchange', invalidateLayout);
    window.visualViewport?.removeEventListener('resize', invalidateLayout);
    screen.orientation?.removeEventListener?.('change', invalidateLayout);
    dprMedia?.removeEventListener?.('change', onDprChange);
    dprMedia = null;
    safeAreaProbe?.remove();
    safeAreaProbe = null;
  }

  return Object.freeze({
    start,
    requestRender,
    invalidateLayout,
    setContinuous,
    dispose,
    get visible() {
      return visible;
    },
    get continuous() {
      return continuous;
    },
    get viewport() {
      return viewport;
    },
  });
}
