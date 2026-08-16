import { hydrateBuildMarker } from './build-marker.js';
import { installFatalErrorHandlers } from './fatal-error.js';
import { createRendererOwner, WebGLNotSupportedError } from '../scene/renderer.js';
import { createPreviewScene } from '../scene/preview-scene.js';
import { createAssetManager } from '../assets/asset-manager.js';

const appElement = document.querySelector('#app');
const statusElement = document.querySelector('#boot-status');
const buildMarkerElement = document.querySelector('#build-marker');
const unsupportedElement = document.querySelector('#unsupported-webgl');
const recoveryElement = document.querySelector('#graphics-recovery');
const recoveryReloadButton = document.querySelector('#graphics-recovery-reload');

const fatal = installFatalErrorHandlers({ statusElement, unsupportedElement });
recoveryReloadButton?.addEventListener('click', () => window.location.reload());

function presentGraphicsState(contextState) {
  document.documentElement.dataset.graphicsState = contextState.state;

  if (contextState.state === 'lost') {
    if (statusElement) statusElement.textContent = 'Graphics context lost — pausing safely…';
    return;
  }

  if (contextState.state === 'restoring') {
    if (statusElement) statusElement.textContent = 'Restoring graphics…';
    return;
  }

  if (contextState.state === 'failed') {
    if (statusElement) statusElement.textContent = 'Graphics recovery failed';
    if (recoveryElement) recoveryElement.hidden = false;
    document.documentElement.dataset.bootState = 'graphics-recovery-failed';
    return;
  }

  if (recoveryElement) recoveryElement.hidden = true;
  if (contextState.restoreCount > 0 && statusElement) statusElement.textContent = 'Static Three.js shell ready';
  if (document.documentElement.dataset.bootState !== 'booting') {
    document.documentElement.dataset.bootState = 'ready';
  }
}

function createBootAssetManager() {
  return createAssetManager({
    onProgress: ({ group }) => {
      if (!statusElement || group.group !== 'boot-critical') return;
      const progress = group.percent === null
        ? `${group.readyAssets}/${group.totalAssets}`
        : `${Math.round(group.percent)}%`;
      statusElement.textContent = `Loading required assets… ${progress}`;
    },
  });
}

async function boot() {
  document.documentElement.dataset.runtime = 'threejs-static-esm';
  document.documentElement.dataset.bootState = 'booting';

  const markerPromise = hydrateBuildMarker(buildMarkerElement);
  const assetManager = createBootAssetManager();
  let rendererOwner = null;
  let previewScene = null;
  let unsubscribeContextState = null;

  try {
    await assetManager.loadGroup('boot-critical');
    document.documentElement.dataset.assetState = 'boot-critical-ready';

    rendererOwner = createRendererOwner({ mount: appElement });
    unsubscribeContextState = rendererOwner.subscribeContextState(presentGraphicsState);
    previewScene = createPreviewScene(rendererOwner);
    previewScene.start();

    let shell = null;
    const dispose = () => {
      unsubscribeContextState?.();
      unsubscribeContextState = null;
      previewScene?.dispose();
      rendererOwner?.dispose();
      assetManager.clear();
      if (window.__YAKOLAK_THREEJS_SHELL__ === shell) {
        delete window.__YAKOLAK_THREEJS_SHELL__;
      }
    };

    shell = Object.freeze({
      runtime: 'threejs-static-esm',
      canvas: rendererOwner.canvas,
      getPresentationSnapshot: () => previewScene?.getPresentationSnapshot() || null,
      getGraphicsContextSnapshot: () => rendererOwner?.getContextSnapshot() || null,
      getAssetState: (id) => assetManager.getState(id),
      getAssetProgress: (group = null) => assetManager.snapshot(group),
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
    unsubscribeContextState?.();
    previewScene?.dispose();
    rendererOwner?.dispose();

    if (error instanceof WebGLNotSupportedError) {
      fatal.showUnsupportedWebGL();
      return;
    }

    if (!rendererOwner) {
      document.documentElement.dataset.assetState = 'boot-critical-failed';
      document.documentElement.dataset.bootState = 'asset-load-failed';
      if (statusElement) statusElement.textContent = 'Required startup assets failed — reload or retry before entering the game.';
    }
    throw error;
  } finally {
    await markerPromise;
  }
}

boot();
