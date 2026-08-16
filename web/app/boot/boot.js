import { hydrateBuildMarker } from './build-marker.js';
import { installFatalErrorHandlers } from './fatal-error.js';
import { createRendererOwner, WebGLNotSupportedError } from '../scene/renderer.js';
import { createPreviewScene } from '../scene/preview-scene.js';

const appElement = document.querySelector('#app');
const statusElement = document.querySelector('#boot-status');
const buildMarkerElement = document.querySelector('#build-marker');
const unsupportedElement = document.querySelector('#unsupported-webgl');

const fatal = installFatalErrorHandlers({ statusElement, unsupportedElement });

async function boot() {
  document.documentElement.dataset.runtime = 'threejs-static-esm';
  document.documentElement.dataset.bootState = 'booting';

  const markerPromise = hydrateBuildMarker(buildMarkerElement);
  let rendererOwner = null;
  let previewScene = null;

  try {
    rendererOwner = createRendererOwner({ mount: appElement });
    previewScene = createPreviewScene(rendererOwner);
    previewScene.start();

    let shell = null;
    const dispose = () => {
      previewScene?.dispose();
      rendererOwner?.dispose();
      if (window.__YAKOLAK_THREEJS_SHELL__ === shell) {
        delete window.__YAKOLAK_THREEJS_SHELL__;
      }
    };

    shell = Object.freeze({
      runtime: 'threejs-static-esm',
      canvas: rendererOwner.canvas,
      dispose,
    });
    window.__YAKOLAK_THREEJS_SHELL__ = shell;

    markerPromise.then((buildInfo) => {
      if (buildInfo.environment !== 'production' && !rendererOwner.disposed) {
        rendererOwner.exposeDevelopmentDiagnostics(window);
      }
    });

    if (statusElement) statusElement.textContent = 'Static Three.js shell ready';
    document.documentElement.dataset.bootState = 'ready';
  } catch (error) {
    previewScene?.dispose();
    rendererOwner?.dispose();

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
