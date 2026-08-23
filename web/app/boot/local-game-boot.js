import { createAssetManager, AssetGroupLoadError, AssetGroupNotReadyError, AssetLoadCancelledError } from '../assets/asset-manager.js';
import { createResourceRegistry, RESOURCE_OWNERSHIP } from '../core/resource-registry.js';
import { createCanonicalRuntimeData } from '../data/runtime-data.js';
import { createCanonicalMaterialSystem } from '../materials/canonical-materials.js';
import { markOnce, STARTUP_MARKS, startupMarkSnapshot } from '../perf/startup-marks.js';
import { createLocalGameScene } from '../scene/local-game-scene.js';
import { createRendererOwner, WebGLNotSupportedError } from '../scene/renderer.js';
import { hydrateBuildMarker } from './build-marker.js';
import { installFatalErrorHandlers } from './fatal-error.js';

const appElement = document.querySelector('#app');
const statusElement = document.querySelector('#boot-status');
const buildMarkerElement = document.querySelector('#build-marker');
const unsupportedElement = document.querySelector('#unsupported-webgl');
const recoveryElement = document.querySelector('#graphics-recovery');
const recoveryReloadButton = document.querySelector('#graphics-recovery-reload');
const assetErrorElement = document.querySelector('#asset-load-error');
const assetErrorMessageElement = document.querySelector('#asset-load-error-message');
const assetRetryButton = document.querySelector('#asset-load-retry');

function formatProgress(group) {
  if (!group) return '';
  return `${group.readyAssets}/${group.totalAssets} · ${Math.floor(group.percent)}% bytes`;
}

async function boot() {
  const resourceRegistry = createResourceRegistry({ platform: window });
  resourceRegistry.beginGeneration('fastplay-local-game-1');
  const bootLifecycle = resourceRegistry.createScope('fastplay-boot', {
    ownership: RESOURCE_OWNERSHIP.GENERATION_SCOPED,
  });
  const fatal = installFatalErrorHandlers({ statusElement, unsupportedElement, resourceRegistry });

  markOnce(STARTUP_MARKS.bootStart);
  document.documentElement.dataset.runtime = 'threejs-fastplay-local';
  document.documentElement.dataset.bootState = 'booting';
  document.documentElement.dataset.requiredAssets = 'pending';
  document.documentElement.dataset.optionalAssets = 'idle';

  const markerPromise = hydrateBuildMarker(buildMarkerElement);
  const assetManager = createAssetManager({
    resourceRegistry,
    onProgress: ({ group }) => {
      if (!group) return;
      if (group.group === 'boot-critical') document.documentElement.dataset.assetBootCritical = group.status || 'idle';
      if (group.group === 'scene-critical') document.documentElement.dataset.assetSceneCritical = group.status || 'idle';
      if (group.group === 'optional') document.documentElement.dataset.optionalAssets = group.status || 'idle';
      if (statusElement && ['boot-critical', 'scene-critical'].includes(group.group) && group.status === 'loading') {
        const label = group.group === 'boot-critical' ? 'boot assets' : 'game assets';
        statusElement.textContent = `Loading ${label} · ${formatProgress(group)}`;
      }
    },
  });

  let rendererOwner = null;
  let gameScene = null;
  let canonicalRuntimeData = null;
  let materialSystem = null;
  let contextSubscriptionToken = null;
  let shell = null;
  let requiredOperation = null;
  let disposed = false;

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
    if (contextState.restoreCount > 0 && document.documentElement.dataset.bootState === 'ready' && statusElement) {
      statusElement.textContent = 'YAKOLAK local game ready';
    }
  }

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    assetManager.cancelAll('disposed');
    contextSubscriptionToken?.release('fastplay-context-subscription-released');
    contextSubscriptionToken = null;
    gameScene?.release();
    gameScene = null;
    materialSystem?.release();
    materialSystem = null;
    canonicalRuntimeData = null;
    rendererOwner?.release();
    rendererOwner = null;
    assetManager.release();
    fatal.release();
    bootLifecycle.release('fastplay-boot-released');
    resourceRegistry.dispose('fastplay-shell-disposed');
    if (window.__YAKOLAK_THREEJS_SHELL__ === shell) delete window.__YAKOLAK_THREEJS_SHELL__;
    delete window.__YAKOLAK_ASSET_LOADING__;
  };

  const exposeReadyShell = () => {
    if (shell) return shell;
    shell = Object.freeze({
      runtime: 'threejs-fastplay-local',
      canvas: rendererOwner.canvas,
      getPresentationSnapshot: () => gameScene?.getPresentationSnapshot() || null,
      getLightingSnapshot: () => gameScene?.getLightingSnapshot() || null,
      getCanonicalState: () => gameScene?.getCanonicalState() || null,
      setPreviewTurnEmphasis: (playerId = null) => gameScene?.setTurnEmphasis(playerId) || null,
      getGraphicsContextSnapshot: () => rendererOwner?.getContextSnapshot() || null,
      getResourceRegistrySnapshot: () => resourceRegistry.snapshot(),
      getAssetState: id => assetManager.getState(id),
      getAssetProgress: (group = null) => assetManager.snapshot(group),
      getAsset: id => assetManager.get(id),
      getRuntimeData: () => canonicalRuntimeData,
      getMaterialSnapshot: () => materialSystem?.snapshot() || null,
      getStartupMarks: startupMarkSnapshot,
      dispose,
    });
    window.__YAKOLAK_THREEJS_SHELL__ = shell;
    return shell;
  };

  const showAssetFailure = error => {
    const group = error?.group || 'required';
    const firstFailure = error?.failures?.[0];
    const detail = firstFailure?.id
      ? `${firstFailure.id} failed verification/loading. The game was not initialized.`
      : `${group} assets are unavailable. The game was not initialized.`;
    if (assetErrorMessageElement) assetErrorMessageElement.textContent = detail;
    if (assetErrorElement) assetErrorElement.hidden = false;
    if (statusElement) statusElement.textContent = error instanceof AssetLoadCancelledError
      ? 'Required asset loading cancelled'
      : 'Required startup assets failed';
    document.documentElement.dataset.requiredAssets = error instanceof AssetLoadCancelledError ? 'cancelled' : 'failed';
    document.documentElement.dataset.bootState = 'asset-load-failed';
  };

  const loadRequiredAndStart = ({ retry = false } = {}) => {
    if (disposed) return Promise.resolve(null);
    if (requiredOperation && !retry) return requiredOperation;
    if (retry) {
      if (assetErrorElement) assetErrorElement.hidden = true;
      document.documentElement.dataset.requiredAssets = 'pending';
      document.documentElement.dataset.bootState = 'booting';
    }

    requiredOperation = (async () => {
      const bootRetry = retry && ['failed', 'cancelled'].includes(assetManager.snapshot('boot-critical').status);
      await assetManager.loadGroup('boot-critical', { retry: bootRetry });
      markOnce(STARTUP_MARKS.bootCriticalReady);

      if (!rendererOwner) {
        rendererOwner = createRendererOwner({ mount: appElement, resourceRegistry });
        contextSubscriptionToken = bootLifecycle.subscribe(
          listener => rendererOwner.subscribeContextState(listener),
          presentGraphicsState,
          { label: 'fastplay-graphics-context-state' },
        );
      }

      const sceneRetry = retry && ['failed', 'cancelled'].includes(assetManager.snapshot('scene-critical').status);
      await assetManager.loadGroup('scene-critical', { retry: sceneRetry });
      const worldLayout = assetManager.get('data.world-layout');
      const approvedContract = assetManager.get('data.approved-contract');
      canonicalRuntimeData = createCanonicalRuntimeData({
        worldLayout,
        introScatterText: assetManager.get('data.intro-scatter'),
        approvedContract,
      });
      materialSystem?.release();
      materialSystem = createCanonicalMaterialSystem({ runtimeData: canonicalRuntimeData, resourceRegistry });
      markOnce(STARTUP_MARKS.criticalAssetsReady);

      document.documentElement.dataset.requiredAssets = 'ready';
      document.documentElement.dataset.canonicalRuntimeData = 'validated';
      document.documentElement.dataset.canonicalMaterials = 'ready';

      if (!gameScene) {
        gameScene = await createLocalGameScene(rendererOwner, {
          runtimeData: canonicalRuntimeData,
          worldLayout,
          approvedContract,
          roomSpecText: assetManager.get('scene.room-spec'),
          assets: {
            tableFootprint: assetManager.get('scene.table-footprint'),
            boardAndLid: assetManager.get('model.board-and-lid'),
            playerBase: assetManager.get('model.player-base'),
            pieceSmall: assetManager.get('model.piece-small'),
            pieceMedium: assetManager.get('model.piece-medium'),
            pieceLarge: assetManager.get('model.piece-large'),
          },
          materialSystem,
          resourceRegistry,
        });
        gameScene.start();
      }

      document.documentElement.dataset.canonicalLighting = 'ready';
      document.documentElement.dataset.fastplayScene = 'real-local-game';
      exposeReadyShell();
      if (assetErrorElement) assetErrorElement.hidden = true;
      if (statusElement) statusElement.textContent = 'YAKOLAK local game ready';
      document.documentElement.dataset.bootState = 'ready';
      markOnce(STARTUP_MARKS.firstInteractive);

      assetManager.loadGroup('optional').then(result => {
        if (disposed) return;
        document.documentElement.dataset.optionalAssets = result.progress.status;
        if (result.progress.status === 'degraded') console.warn('[fastplay-assets] optional assets degraded safely', result.degraded);
      }).catch(error => {
        if (disposed || error instanceof AssetLoadCancelledError) return;
        document.documentElement.dataset.optionalAssets = 'degraded';
        console.warn('[fastplay-assets] optional asset group degraded safely', error);
      });

      return shell;
    })().catch(error => {
      if (disposed) return null;
      if (error instanceof AssetGroupLoadError || error instanceof AssetGroupNotReadyError || error instanceof AssetLoadCancelledError) {
        showAssetFailure(error);
        return null;
      }
      throw error;
    }).finally(() => { requiredOperation = null; });

    return requiredOperation;
  };

  window.__YAKOLAK_ASSET_LOADING__ = Object.freeze({
    getProgress: (group = null) => assetManager.snapshot(group),
    getAssetState: id => assetManager.getState(id),
    cancel: (reason = 'diagnostic-cancel') => assetManager.cancelAll(reason),
    retry: () => loadRequiredAndStart({ retry: true }),
  });

  if (recoveryReloadButton) {
    bootLifecycle.listen(recoveryReloadButton, 'click', () => window.location.reload(), undefined, { label: 'graphics-recovery-reload' });
  }
  if (assetRetryButton) {
    bootLifecycle.listen(assetRetryButton, 'click', () => loadRequiredAndStart({ retry: true }), undefined, { label: 'asset-load-retry' });
  }

  try {
    await loadRequiredAndStart();
    markerPromise.then(buildInfo => {
      if (buildInfo.environment !== 'production' && rendererOwner && !rendererOwner.disposed) {
        rendererOwner.exposeDevelopmentDiagnostics(window);
      }
    });
  } catch (error) {
    if (error instanceof WebGLNotSupportedError) {
      dispose();
      fatal.showUnsupportedWebGL();
      return;
    }
    dispose();
    throw error;
  } finally {
    await markerPromise;
  }
}

boot();
