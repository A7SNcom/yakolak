export function installFatalErrorHandlers({ statusElement, unsupportedElement }) {
  const showFatal = (message) => {
    if (statusElement) statusElement.textContent = message;
    document.documentElement.dataset.bootState = 'failed';
  };

  window.addEventListener('error', (event) => {
    if (event?.error?.name === 'WebGLNotSupportedError') return;
    showFatal('Preview boot failed. Reload to retry.');
    console.error('[threejs-shell] uncaught error', event.error ?? event.message);
  });

  window.addEventListener('unhandledrejection', (event) => {
    showFatal('Preview boot failed. Reload to retry.');
    console.error('[threejs-shell] unhandled rejection', event.reason);
  });

  return {
    showUnsupportedWebGL() {
      if (unsupportedElement) unsupportedElement.hidden = false;
      if (statusElement) statusElement.textContent = 'WebGL 2 unavailable';
      document.documentElement.dataset.bootState = 'unsupported-webgl';
    },
  };
}
