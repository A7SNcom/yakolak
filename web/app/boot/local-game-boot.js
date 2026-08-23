import { createAssetManager, AssetGroupLoadError, AssetGroupNotReadyError, AssetLoadCancelledError } from '../assets/asset-manager.js';
import { createResourceRegistry, RESOURCE_OWNERSHIP } from '../core/resource-registry.js';
import { createCanonicalRuntimeData } from '../data/runtime-data.js';
import { createFastplaySeats } from '../fastplay/local-match-config.js';
import { createCanonicalMaterialSystem } from '../materials/canonical-materials.js';
import { markOnce, STARTUP_MARKS, startupMarkSnapshot } from '../perf/startup-marks.js';
import { createLocalGameScene } from '../scene/local-game-scene.js';
import { createRendererOwner, WebGLNotSupportedError } from '../scene/renderer.js';
import { advanceCanonicalRound } from '../session/round-advance.js';
import { hydrateBuildMarker } from './build-marker.js';
import { installFatalErrorHandlers } from './fatal-error.js';

const appElement = document.querySelector('#app');
const overlayElement = document.querySelector('.overlay');
const statusElement = document.querySelector('#boot-status');
const buildMarkerElement = document.querySelector('#build-marker');
const unsupportedElement = document.querySelector('#unsupported-webgl');
const recoveryElement = document.querySelector('#graphics-recovery');
const recoveryReloadButton = document.querySelector('#graphics-recovery-reload');
const assetErrorElement = document.querySelector('#asset-load-error');
const assetErrorMessageElement = document.querySelector('#asset-load-error-message');
const assetRetryButton = document.querySelector('#asset-load-retry');
const setupElement = document.querySelector('#local-setup');
const seatCountElement = document.querySelector('#local-seat-count');
const seatOptionsElement = document.querySelector('#local-seat-options');
const startButton = document.querySelector('#local-start');
const hudElement = document.querySelector('#game-hud');
const hudTurnElement = document.querySelector('#hud-turn');
const hudTimerElement = document.querySelector('#hud-timer');
const hudScoresElement = document.querySelector('#hud-scores');
const hudSelectionElement = document.querySelector('#hud-selection');
const hudLegalElement = document.querySelector('#hud-legal');
const hudLastMoveElement = document.querySelector('#hud-last-move');
const resultElement = document.querySelector('#round-result');
const resultTitleElement = document.querySelector('#result-title');
const resultDetailElement = document.querySelector('#result-detail');
const nextRoundButton = document.querySelector('#next-round');
const rematchButton = document.querySelector('#rematch');
const returnSetupButton = document.querySelector('#return-setup');

const COLOR_LABELS = Object.freeze({ marble: 'Marble', blue: 'Blue', gold: 'Gold', green: 'Green' });
const SIZE_LABELS = Object.freeze({ small: 'Small', medium: 'Medium', large: 'Large' });

function formatProgress(group) {
  if (!group) return '';
  return `${group.readyAssets}/${group.totalAssets} · ${Math.floor(group.percent)}% bytes`;
}

function colorLabel(color) {
  return COLOR_LABELS[color] || color || '—';
}

function seatTypeLabel(type) {
  return type === 'computer' ? 'Computer' : 'Human';
}

function renderSeatOptions() {
  if (!seatOptionsElement || !seatCountElement) return;
  const count = Number(seatCountElement.value);
  const defaults = createFastplaySeats({ targetPlayers: count });
  seatOptionsElement.replaceChildren(...defaults.map((seat, index) => {
    const row = document.createElement('label');
    row.className = 'seat-option';
    row.dataset.seatId = seat.seatId;

    const label = document.createElement('span');
    label.className = 'seat-label';
    const swatch = document.createElement('span');
    swatch.className = 'seat-swatch';
    swatch.dataset.color = seat.color;
    const text = document.createElement('span');
    text.textContent = `Seat ${index + 1} · ${colorLabel(seat.color)}`;
    label.append(swatch, text);

    const select = document.createElement('select');
    select.className = 'seat-type';
    select.dataset.seatIndex = String(index);
    select.setAttribute('aria-label', `Seat ${index + 1} type`);
    for (const type of ['human', 'computer']) {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = seatTypeLabel(type);
      option.selected = type === seat.type;
      select.append(option);
    }
    row.append(label, select);
    return row;
  }));
}

function readGameConfig() {
  const targetPlayers = Number(seatCountElement?.value || 2);
  const seatTypes = [...(seatOptionsElement?.querySelectorAll('.seat-type') || [])].map(select => select.value);
  return { targetPlayers, seatTypes };
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
  let worldLayout = null;
  let approvedContract = null;
  let actionInFlight = false;

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
  }

  function showSetup() {
    gameScene?.release();
    gameScene = null;
    actionInFlight = false;
    if (overlayElement) overlayElement.hidden = false;
    if (setupElement) setupElement.hidden = false;
    if (hudElement) hudElement.hidden = true;
    if (resultElement) resultElement.hidden = true;
    if (statusElement) statusElement.textContent = 'Choose 2–4 local seats and start.';
    document.documentElement.dataset.bootState = 'setup-ready';
    document.documentElement.dataset.fastplayScene = 'setup';
    renderSeatOptions();
  }

  function updateScores(state) {
    if (!hudScoresElement) return;
    hudScoresElement.replaceChildren(...state.seats.map(seat => {
      const item = document.createElement('span');
      item.className = 'hud-score';
      item.textContent = `${colorLabel(seat.color)} ${state.scores[seat.seatId] ?? 0}/3`;
      return item;
    }));
  }

  function updateResult(state) {
    if (!resultElement || !resultTitleElement || !resultDetailElement) return;
    const ended = state.roundEndRevision !== null && (state.winner || state.draw);
    resultElement.hidden = !ended;
    if (!ended) return;

    if (state.matchComplete && state.winner) {
      resultTitleElement.textContent = `${colorLabel(state.winner.color)} wins the match`;
      resultDetailElement.textContent = `Final score ${state.scores[state.winner.seatId]}/3`;
      if (nextRoundButton) nextRoundButton.hidden = true;
      if (rematchButton) rematchButton.hidden = false;
      return;
    }

    if (state.draw) {
      resultTitleElement.textContent = 'Round draw';
      resultDetailElement.textContent = `Round ${state.round} complete`;
    } else {
      resultTitleElement.textContent = `${colorLabel(state.winner?.color)} wins the round`;
      resultDetailElement.textContent = `Score ${state.scores[state.winner?.seatId] ?? 0}/3`;
    }
    if (nextRoundButton) nextRoundButton.hidden = false;
    if (rematchButton) rematchButton.hidden = true;
  }

  function renderHud() {
    if (!gameScene || hudElement?.hidden) return;
    const snapshot = gameScene.getPresentationSnapshot();
    const state = snapshot?.state;
    if (!state) return;
    const seat = state.seats.find(candidate => candidate.seatId === state.activeSeatId) || null;
    if (hudTurnElement) hudTurnElement.textContent = seat
      ? `${colorLabel(seat.color)} · ${seatTypeLabel(seat.type)}`
      : 'Round complete';
    if (hudTimerElement) {
      const remaining = state.deadlineAtMs === null ? 0 : Math.max(0, Math.ceil((state.deadlineAtMs - Date.now()) / 1000));
      hudTimerElement.textContent = state.deadlineAtMs === null ? '—' : `${remaining}s`;
    }
    updateScores(state);

    const selection = snapshot.tap?.selection;
    if (hudSelectionElement) hudSelectionElement.textContent = `Selected ${selection?.selectedSize ? SIZE_LABELS[selection.selectedSize] : '—'}`;
    if (hudLegalElement) {
      const legal = selection?.legalCells?.length ? selection.legalCells.map(cell => cell + 1).join(', ') : '—';
      hudLegalElement.textContent = `Legal ${legal}`;
    }
    if (hudLastMoveElement) {
      const move = state.lastMove;
      hudLastMoveElement.textContent = move
        ? `Last ${colorLabel(move.color)} ${SIZE_LABELS[move.size] || move.size} → ${move.cell + 1}`
        : 'Last —';
    }
    updateResult(state);
  }

  const hudInterval = window.setInterval(renderHud, 100);
  bootLifecycle.registerCleanup(() => window.clearInterval(hudInterval), { label: 'fastplay-hud-refresh' });

  async function createGameScene({ gameConfig = null, initialState = null } = {}) {
    if (!rendererOwner || !canonicalRuntimeData || !worldLayout || !approvedContract || !materialSystem) {
      throw new Error('fastplay_assets_not_ready');
    }
    gameScene?.release();
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
        scoreMarker: assetManager.get('model.score-marker'),
      },
      materialSystem,
      resourceRegistry,
      gameConfig,
      initialState,
    });
    gameScene.start();
    if (overlayElement) overlayElement.hidden = true;
    if (setupElement) setupElement.hidden = true;
    if (hudElement) hudElement.hidden = false;
    if (resultElement) resultElement.hidden = true;
    document.documentElement.dataset.bootState = 'ready';
    document.documentElement.dataset.fastplayScene = 'real-local-game';
    renderHud();
    return gameScene;
  }

  async function guardedAction(action) {
    if (actionInFlight || disposed) return;
    actionInFlight = true;
    for (const button of [startButton, nextRoundButton, rematchButton, returnSetupButton]) {
      if (button) button.disabled = true;
    }
    try {
      await action();
    } catch (error) {
      console.error('[fastplay] action failed', error);
      if (statusElement) statusElement.textContent = `Action failed: ${error?.code || error?.message || error}`;
      if (overlayElement) overlayElement.hidden = false;
    } finally {
      actionInFlight = false;
      for (const button of [startButton, nextRoundButton, rematchButton, returnSetupButton]) {
        if (button) button.disabled = false;
      }
      renderHud();
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

  const loadRequired = ({ retry = false } = {}) => {
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
      worldLayout = assetManager.get('data.world-layout');
      approvedContract = assetManager.get('data.approved-contract');
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
      document.documentElement.dataset.canonicalLighting = 'ready';
      if (assetErrorElement) assetErrorElement.hidden = true;
      exposeReadyShell();
      showSetup();
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

  if (seatCountElement) bootLifecycle.listen(seatCountElement, 'change', renderSeatOptions, undefined, { label: 'fastplay-seat-count' });
  if (startButton) bootLifecycle.listen(startButton, 'click', () => guardedAction(async () => {
    await createGameScene({ gameConfig: readGameConfig() });
  }), undefined, { label: 'fastplay-start-match' });
  if (nextRoundButton) bootLifecycle.listen(nextRoundButton, 'click', () => guardedAction(async () => {
    const state = await gameScene?.getCanonicalState();
    if (!state) return;
    const advanced = advanceCanonicalRound(state, { expectedRevision: state.revision }).state;
    await createGameScene({ initialState: advanced });
  }), undefined, { label: 'fastplay-next-round' });
  if (rematchButton) bootLifecycle.listen(rematchButton, 'click', () => guardedAction(async () => {
    if (!gameScene) return;
    const rematched = await gameScene.submitRematch();
    await createGameScene({ initialState: rematched.snapshot });
  }), undefined, { label: 'fastplay-rematch' });
  if (returnSetupButton) bootLifecycle.listen(returnSetupButton, 'click', () => guardedAction(async () => {
    showSetup();
  }), undefined, { label: 'fastplay-return-setup' });
  if (recoveryReloadButton) {
    bootLifecycle.listen(recoveryReloadButton, 'click', () => window.location.reload(), undefined, { label: 'graphics-recovery-reload' });
  }
  if (assetRetryButton) {
    bootLifecycle.listen(assetRetryButton, 'click', () => loadRequired({ retry: true }), undefined, { label: 'asset-load-retry' });
  }

  window.__YAKOLAK_ASSET_LOADING__ = Object.freeze({
    getProgress: (group = null) => assetManager.snapshot(group),
    getAssetState: id => assetManager.getState(id),
    cancel: (reason = 'diagnostic-cancel') => assetManager.cancelAll(reason),
    retry: () => loadRequired({ retry: true }),
  });

  try {
    await loadRequired();
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

renderSeatOptions();
boot();
