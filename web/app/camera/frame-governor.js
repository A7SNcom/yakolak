// THREEJS-013/014: presentation-only frame pacing / viewport and graphics-availability governance.
// This module never owns authoritative game or lifecycle state.

export const FRAME_GOVERNOR_POLICY = Object.freeze({
  maxPixelRatio: 1.5,
  maxFramesPerSecond: 60,
  resizeDebounceMs: 80,
  baseFov: 42,
  referenceAspect: 1,
  maxFov: 72,
});

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function readRawDevicePixelRatio() {
  return finitePositive(window.devicePixelRatio, 1);
}

function capPixelRatio(rawPixelRatio, maxPixelRatio) {
  return clamp(rawPixelRatio, 1, finitePositive(maxPixelRatio, FRAME_GOVERNOR_POLICY.maxPixelRatio));
}

export function refitPerspectiveFov({
  baseFov = FRAME_GOVERNOR_POLICY.baseFov,
  aspect,
  referenceAspect = FRAME_GOVERNOR_POLICY.referenceAspect,
  maxFov = FRAME_GOVERNOR_POLICY.maxFov,
}) {
  const safeBaseFov = finitePositive(baseFov, FRAME_GOVERNOR_POLICY.baseFov);
  const safeAspect = finitePositive(aspect, 1);
  const safeReferenceAspect = finitePositive(referenceAspect, FRAME_GOVERNOR_POLICY.referenceAspect);
  const safeMaxFov = Math.max(safeBaseFov, finitePositive(maxFov, FRAME_GOVERNOR_POLICY.maxFov));

  if (safeAspect >= safeReferenceAspect) return safeBaseFov;

  const baseRadians = safeBaseFov * Math.PI / 180;
  const referenceHorizontal = 2 * Math.atan(Math.tan(baseRadians / 2) * safeReferenceAspect);
  const fittedRadians = 2 * Math.atan(Math.tan(referenceHorizontal / 2) / safeAspect);
  return clamp(fittedRadians * 180 / Math.PI, safeBaseFov, safeMaxFov);
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

function measureCanvasCssSize(canvas) {
  const rect = canvas.getBoundingClientRect();
  return Object.freeze({
    width: Math.max(1, Math.round(rect.width || canvas.clientWidth || window.innerWidth || 1)),
    height: Math.max(1, Math.round(rect.height || canvas.clientHeight || window.innerHeight || 1)),
  });
}

function readOrientation(width, height) {
  return screen.orientation?.type || (width >= height ? 'landscape' : 'portrait');
}

export function createFrameGovernor({
  rendererOwner,
  camera,
  onFrame,
  maxPixelRatio = FRAME_GOVERNOR_POLICY.maxPixelRatio,
  maxFramesPerSecond = FRAME_GOVERNOR_POLICY.maxFramesPerSecond,
  resizeDebounceMs = FRAME_GOVERNOR_POLICY.resizeDebounceMs,
  baseFov = FRAME_GOVERNOR_POLICY.baseFov,
  referenceAspect = FRAME_GOVERNOR_POLICY.referenceAspect,
  maxFov = FRAME_GOVERNOR_POLICY.maxFov,
}) {
  if (!rendererOwner || typeof rendererOwner.resizeToDisplaySize !== 'function') {
    throw new TypeError('Frame governor requires the renderer owner');
  }
  if (typeof rendererOwner.subscribeContextState !== 'function') {
    throw new TypeError('Frame governor requires renderer context-state subscription');
  }
  if (!camera || typeof camera.updateProjectionMatrix !== 'function') {
    throw new TypeError('Frame governor requires a perspective camera');
  }
  if (typeof onFrame !== 'function') {
    throw new TypeError('Frame governor requires an onFrame callback');
  }

  const safeMaxPixelRatio = finitePositive(maxPixelRatio, FRAME_GOVERNOR_POLICY.maxPixelRatio);
  const safeMaxFramesPerSecond = finitePositive(maxFramesPerSecond, FRAME_GOVERNOR_POLICY.maxFramesPerSecond);
  const safeResizeDebounceMs = Math.max(0, Number(resizeDebounceMs) || 0);
  const frameIntervalMs = 1000 / safeMaxFramesPerSecond;
  const activePolicy = Object.freeze({
    maxPixelRatio: safeMaxPixelRatio,
    maxFramesPerSecond: safeMaxFramesPerSecond,
    resizeDebounceMs: safeResizeDebounceMs,
    baseFov: finitePositive(baseFov, FRAME_GOVERNOR_POLICY.baseFov),
    referenceAspect: finitePositive(referenceAspect, FRAME_GOVERNOR_POLICY.referenceAspect),
    maxFov: Math.max(finitePositive(baseFov, FRAME_GOVERNOR_POLICY.baseFov), finitePositive(maxFov, FRAME_GOVERNOR_POLICY.maxFov)),
  });

  let disposed = false;
  let started = false;
  let visible = document.visibilityState !== 'hidden';
  let graphicsAvailable = rendererOwner.getContextSnapshot?.().canUseGpu !== false;
  let continuous = false;
  let layoutDirty = true;
  let layoutReady = true;
  let renderRequested = true;
  let resumed = false;
  let frameId = 0;
  let resizeTimer = 0;
  let resizeObserver = null;
  let dprMedia = null;
  let safeAreaProbe = null;
  let unsubscribeContextState = null;
  let safeArea = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });
  let viewport = null;
  let lastPresentedAt = Number.NEGATIVE_INFINITY;
  let frameCount = 0;
  let layoutCommitCount = 0;

  function assertLive() {
    if (disposed) throw new Error('Frame governor has been disposed');
  }

  function cancelScheduledFrame() {
    if (!frameId) return;
    cancelAnimationFrame(frameId);
    frameId = 0;
  }

  function cancelResizeDebounce() {
    if (!resizeTimer) return;
    clearTimeout(resizeTimer);
    resizeTimer = 0;
  }

  function schedule() {
    if (!started || disposed || !visible || !graphicsAvailable || frameId) return;
    frameId = requestAnimationFrame(tick);
  }

  function requestRender() {
    assertLive();
    renderRequested = true;
    schedule();
  }

  function invalidateLayout({ immediate = false } = {}) {
    if (disposed) return;
    layoutDirty = true;
    renderRequested = true;
    cancelResizeDebounce();

    if (!graphicsAvailable) {
      layoutReady = true;
      return;
    }

    if (immediate || safeResizeDebounceMs === 0 || !visible) {
      layoutReady = true;
      schedule();
      return;
    }

    layoutReady = false;
    resizeTimer = window.setTimeout(() => {
      resizeTimer = 0;
      if (disposed || !visible || !graphicsAvailable) return;
      layoutReady = true;
      schedule();
    }, safeResizeDebounceMs);
  }

  function bindDprWatcher() {
    if (dprMedia?.removeEventListener) dprMedia.removeEventListener('change', onDprChange);
    const rawPixelRatio = readRawDevicePixelRatio();
    dprMedia = window.matchMedia?.(`(resolution: ${rawPixelRatio}dppx)`) || null;
    dprMedia?.addEventListener?.('change', onDprChange);
  }

  function onDprChange() {
    bindDprWatcher();
    invalidateLayout();
  }

  function pausePresentation() {
    visible = false;
    cancelScheduledFrame();
    cancelResizeDebounce();
  }

  function resumePresentation() {
    if (disposed) return;
    visible = true;
    resumed = true;
    invalidateLayout({ immediate: true });
  }

  function onContextStateChange(contextState) {
    const wasAvailable = graphicsAvailable;
    graphicsAvailable = contextState?.state === 'ready' && contextState?.canUseGpu !== false;

    if (!graphicsAvailable) {
      cancelScheduledFrame();
      cancelResizeDebounce();
      return;
    }

    if (!wasAvailable) {
      resumed = true;
      layoutDirty = true;
      layoutReady = true;
      renderRequested = true;
      schedule();
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      pausePresentation();
      return;
    }
    resumePresentation();
  }

  function onPageHide() {
    pausePresentation();
  }

  function onPageShow() {
    if (document.visibilityState === 'hidden') return;
    resumePresentation();
  }

  function applyLayout() {
    const nextSafeArea = readSafeArea(safeAreaProbe);
    const safeAreaChanged = !sameInsets(nextSafeArea, safeArea);
    safeArea = nextSafeArea;

    const cssSize = measureCanvasCssSize(rendererOwner.canvas);
    const rawPixelRatio = readRawDevicePixelRatio();
    const pixelRatio = capPixelRatio(rawPixelRatio, activePolicy.maxPixelRatio);
    const display = rendererOwner.resizeToDisplaySize({
      width: cssSize.width,
      height: cssSize.height,
      pixelRatio,
    });

    if (display.skipped) return null;

    const aspect = display.width / display.height;
    const nextFov = refitPerspectiveFov({
      baseFov: activePolicy.baseFov,
      aspect,
      referenceAspect: activePolicy.referenceAspect,
      maxFov: activePolicy.maxFov,
    });
    const cameraChanged = Math.abs(camera.aspect - aspect) > 0.0001 || Math.abs(camera.fov - nextFov) > 0.0001;

    if (cameraChanged) {
      camera.aspect = aspect;
      camera.fov = nextFov;
      camera.updateProjectionMatrix();
    }

    const visualViewport = window.visualViewport;
    viewport = Object.freeze({
      width: display.width,
      height: display.height,
      pixelRatio: display.pixelRatio,
      rawDevicePixelRatio: rawPixelRatio,
      drawingBufferWidth: display.drawingBufferWidth,
      drawingBufferHeight: display.drawingBufferHeight,
      visualWidth: Math.max(1, Math.round(visualViewport?.width || window.innerWidth || display.width)),
      visualHeight: Math.max(1, Math.round(visualViewport?.height || window.innerHeight || display.height)),
      scale: finitePositive(visualViewport?.scale, 1),
      orientation: readOrientation(display.width, display.height),
      safeArea,
    });

    layoutDirty = false;
    layoutReady = true;
    layoutCommitCount += 1;

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
    if (!started || disposed || !visible || !graphicsAvailable) return;

    const layout = layoutDirty && layoutReady ? applyLayout() : null;
    if (!graphicsAvailable) return;
    if (layoutDirty && !layoutReady) return;

    const didResume = resumed;
    const hasWork = renderRequested || continuous || Boolean(layout) || didResume;
    const elapsedSincePresentation = now - lastPresentedAt;
    const pacingReady = Boolean(layout) || didResume || elapsedSincePresentation + 0.5 >= frameIntervalMs;

    if (hasWork && pacingReady) {
      resumed = false;
      renderRequested = false;
      lastPresentedAt = now;
      frameCount += 1;
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

  function snapshot() {
    return Object.freeze({
      started,
      disposed,
      visible,
      graphicsAvailable,
      continuous,
      layoutDirty,
      framePending: Boolean(frameId),
      resizeDebouncePending: Boolean(resizeTimer),
      frameCount,
      layoutCommitCount,
      lastPresentedAt: Number.isFinite(lastPresentedAt) ? lastPresentedAt : null,
      viewport,
      policy: activePolicy,
    });
  }

  function start() {
    assertLive();
    if (started) return;
    started = true;
    visible = document.visibilityState !== 'hidden';
    safeAreaProbe = createSafeAreaProbe();
    unsubscribeContextState = rendererOwner.subscribeContextState(onContextStateChange);

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('resize', invalidateLayout, { passive: true });
    window.addEventListener('orientationchange', invalidateLayout, { passive: true });
    window.visualViewport?.addEventListener('resize', invalidateLayout, { passive: true });
    screen.orientation?.addEventListener?.('change', invalidateLayout);

    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(invalidateLayout);
      if (rendererOwner.canvas.parentElement) resizeObserver.observe(rendererOwner.canvas.parentElement);
    }

    bindDprWatcher();
    invalidateLayout({ immediate: true });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    started = false;
    cancelScheduledFrame();
    cancelResizeDebounce();
    unsubscribeContextState?.();
    unsubscribeContextState = null;
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
    snapshot,
    dispose,
    get visible() {
      return visible;
    },
    get graphicsAvailable() {
      return graphicsAvailable;
    },
    get continuous() {
      return continuous;
    },
    get viewport() {
      return viewport;
    },
  });
}
