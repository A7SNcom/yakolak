import { createResourceRegistry, RESOURCE_OWNERSHIP } from '../core/resource-registry.js';

export function installFatalErrorHandlers({ statusElement, unsupportedElement, resourceRegistry = null }) {
  const ownsRegistry = !resourceRegistry;
  const registry = resourceRegistry || createResourceRegistry({ platform: window });
  const lifecycle = registry.createScope('fatal-error-handlers', {
    ownership: RESOURCE_OWNERSHIP.GENERATION_SCOPED,
  });

  const showFatal = (message) => {
    if (statusElement) statusElement.textContent = message;
    document.documentElement.dataset.bootState = 'failed';
  };

  lifecycle.listen(window, 'error', (event) => {
    if (event?.error?.name === 'WebGLNotSupportedError') return;
    showFatal('Preview boot failed. Reload to retry.');
    console.error('[threejs-shell] uncaught error', event.error ?? event.message);
  }, undefined, { label: 'window-error' });

  lifecycle.listen(window, 'unhandledrejection', (event) => {
    showFatal('Preview boot failed. Reload to retry.');
    console.error('[threejs-shell] unhandled rejection', event.reason);
  }, undefined, { label: 'window-unhandledrejection' });

  function release() {
    lifecycle.release('fatal-error-handlers-released');
    if (ownsRegistry) registry.dispose('fatal-error-owned-registry-released');
  }

  return Object.freeze({
    showUnsupportedWebGL() {
      if (unsupportedElement) unsupportedElement.hidden = false;
      if (statusElement) statusElement.textContent = 'WebGL 2 unavailable';
      document.documentElement.dataset.bootState = 'unsupported-webgl';
    },
    release,
  });
}
