import { hydrateBuildMarker } from './build-marker.js';
import { installFatalErrorHandlers } from './fatal-error.js';
import { createRendererShell, WebGLNotSupportedError } from '../scene/renderer.js';

const statusElement = document.querySelector('#boot-status');
const buildMarkerElement = document.querySelector('#build-marker');
const unsupportedElement = document.querySelector('#unsupported-webgl');
const canvas = document.querySelector('#scene');

const fatal = installFatalErrorHandlers({ statusElement, unsupportedElement });

async function boot() {
  document.documentElement.dataset.runtime = 'threejs-static-esm';
  document.documentElement.dataset.bootState = 'booting';

  const markerPromise = hydrateBuildMarker(buildMarkerElement);

  try {
    const shell = createRendererShell(canvas);
    window.__YAKOLAK_THREEJS_SHELL__ = Object.freeze({
      runtime: 'threejs-static-esm',
      renderer: shell.renderer,
      dispose: () => shell.dispose(),
    });

    if (statusElement) statusElement.textContent = 'Static Three.js shell ready';
    document.documentElement.dataset.bootState = 'ready';
  } catch (error) {
    if (error instanceof WebGLNotSupportedError) {
      fatal.showUnsupportedWebGL();
      return;
    }
    throw error;
  } finally {
    await markerPromise;
  }
}

boot();
