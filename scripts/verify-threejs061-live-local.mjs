import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import {
  THREEJS061_LIVE_URL,
  assertThreejs061RootStillGodot,
  deriveThreejs061PagesUrls,
  normalizeThreejs061LiveUrl,
  validateThreejs061DeploymentManifest,
  validateThreejs061RuntimeConfig,
} from './threejs061-live-acceptance-lib.mjs';

const expectedCandidateSha = String(process.env.THREEJS061_EXPECTED_CANDIDATE_SHA || '').trim().toLowerCase();
const liveUrl = normalizeThreejs061LiveUrl(process.env.THREEJS061_BASE_URL || THREEJS061_LIVE_URL);
const evidencePath = process.env.THREEJS061_EVIDENCE_PATH || 'threejs061-live-local-evidence.json';
const urls = deriveThreejs061PagesUrls(liveUrl);

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchNoCache(url, { binary = false } = {}) {
  const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}threejs061=${Date.now()}-${Math.random()}`, {
    redirect: 'follow',
    headers: {
      'Cache-Control': 'no-cache, max-age=0',
      Pragma: 'no-cache',
    },
  });
  if (!response.ok) throw new Error(`THREEJS-061 HTTP ${response.status} for ${url}`);
  return binary ? Buffer.from(await response.arrayBuffer()) : response.text();
}

async function waitForExactLiveGeneration() {
  let last = null;
  for (let attempt = 1; attempt <= 36; attempt += 1) {
    try {
      const text = await fetchNoCache(urls.manifestUrl);
      const manifest = JSON.parse(text);
      last = manifest;
      try {
        return {
          attempt,
          manifest,
          identity: validateThreejs061DeploymentManifest(manifest, { expectedCandidateSha }),
        };
      } catch (error) {
        if (error?.code !== 'threejs061_live_candidate_mismatch') throw error;
      }
    } catch (error) {
      last = { error: error?.code || error?.message || String(error) };
    }
    await delay(5_000);
  }
  const error = new Error('threejs061_exact_live_generation_not_ready');
  error.code = 'threejs061_exact_live_generation_not_ready';
  error.lastObservation = last;
  throw error;
}

async function verifyLiveHttpIdentity(liveIdentity) {
  const [rootHtml, threejsHtml, runtimeBytes] = await Promise.all([
    fetchNoCache(urls.rootUrl),
    fetchNoCache(urls.threejsUrl),
    fetchNoCache(urls.runtimeConfigUrl, { binary: true }),
  ]);
  assertThreejs061RootStillGodot(rootHtml, threejsHtml);
  const runtime = validateThreejs061RuntimeConfig(runtimeBytes, liveIdentity);
  return {
    rootStillGodot: true,
    threejsMarkerPresent: true,
    runtime,
  };
}

async function waitForReady(page) {
  await page.waitForFunction(() => document.documentElement.dataset.bootState === 'ready', null, { timeout: 45_000 });
  await page.waitForFunction(() => Boolean(window.__YAKOLAK_THREEJS_SHELL__?.getRuntimeData?.()), null, { timeout: 45_000 });
}

async function runBasePathProbe(page) {
  return page.evaluate(async (baseUrl) => {
    const appUrl = await import(new URL('app/core/app-url.js', baseUrl).href);
    const expected = new URL(baseUrl).href;
    const base = appUrl.APP_BASE_URL.href;
    const asset = appUrl.assetHref('data/world-layout.json');
    if (base !== expected) throw new Error(`THREEJS-061 APP_BASE_URL mismatch: ${base} != ${expected}`);
    if (!asset.startsWith(expected)) throw new Error('THREEJS-061 asset escaped deployed base path');
    if (new URL(asset).pathname.startsWith('/assets/')) throw new Error('THREEJS-061 asset incorrectly resolved from origin root');
    return {
      appBaseUrl: base,
      assetUrl: asset,
      pathname: location.pathname,
    };
  }, liveUrl);
}

async function runContextRecoveryProbe(page) {
  const available = await page.evaluate(() => {
    const shell = window.__YAKOLAK_THREEJS_SHELL__;
    const gl = shell?.canvas?.getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    window.__THREEJS061_LOSE_CONTEXT__ = extension;
    return true;
  });
  assert.equal(available, true, 'THREEJS-061 requires WEBGL_lose_context in acceptance Chromium');

  const before = await page.evaluate(() => ({
    context: window.__YAKOLAK_THREEJS_SHELL__.getGraphicsContextSnapshot(),
    presentation: window.__YAKOLAK_THREEJS_SHELL__.getPresentationSnapshot(),
  }));
  assert.equal(before.context.state, 'ready');

  await page.evaluate(() => window.__THREEJS061_LOSE_CONTEXT__.loseContext());
  await page.waitForFunction(() => window.__YAKOLAK_THREEJS_SHELL__?.getGraphicsContextSnapshot()?.state === 'lost');
  const lostStart = await page.evaluate(() => ({
    context: window.__YAKOLAK_THREEJS_SHELL__.getGraphicsContextSnapshot(),
    presentation: window.__YAKOLAK_THREEJS_SHELL__.getPresentationSnapshot(),
  }));
  await page.waitForTimeout(220);
  const lostEnd = await page.evaluate(() => window.__YAKOLAK_THREEJS_SHELL__.getPresentationSnapshot());
  assert.equal(lostEnd.frameCount, lostStart.presentation.frameCount, 'frame count must freeze while context is lost');
  assert.equal(lostEnd.framePending, false, 'no RAF may remain pending while context is lost');

  await page.evaluate(() => window.__THREEJS061_LOSE_CONTEXT__.restoreContext());
  await page.waitForFunction((expectedRestoreCount) => {
    const snapshot = window.__YAKOLAK_THREEJS_SHELL__?.getGraphicsContextSnapshot();
    return snapshot?.state === 'ready' && snapshot.restoreCount === expectedRestoreCount;
  }, before.context.restoreCount + 1);
  const restored = await page.evaluate(() => ({
    context: window.__YAKOLAK_THREEJS_SHELL__.getGraphicsContextSnapshot(),
    presentation: window.__YAKOLAK_THREEJS_SHELL__.getPresentationSnapshot(),
    bootState: document.documentElement.dataset.bootState,
  }));
  assert.equal(restored.context.generation, before.context.generation + 1);
  assert.equal(restored.presentation.restoredResourceGeneration, restored.context.generation);
  assert.equal(restored.bootState, 'ready');
  await page.waitForTimeout(180);
  const resumed = await page.evaluate(() => window.__YAKOLAK_THREEJS_SHELL__.getPresentationSnapshot());
  assert.ok(resumed.frameCount > lostEnd.frameCount, 'rendering must resume after WebGL restoration');

  return {
    before: before.context,
    lost: lostStart.context,
    restored: restored.context,
    frameCountWhileLost: lostEnd.frameCount,
    frameCountAfterResume: resumed.frameCount,
  };
}

async function runDeployedGameplayProbe(page) {
  return page.evaluate(async (baseUrl) => {
    const mod = (relativePath) => import(new URL(relativePath, baseUrl).href);
    const [
      rules,
      seatOrder,
      canonicalState,
      localAuthority,
      gameplayIntent,
      roundAdvance,
      matchEnd,
      localTimeout,
      localRestart,
      computerTurn,
      resourceRegistryModule,
      tapClick,
      navigation,
      sizeSelectionModule,
      dragModule,
      motionModule,
    ] = await Promise.all([
      mod('app/shared/rules.js'),
      mod('app/shared/seat-order.js'),
      mod('app/session/canonical-session-state.js'),
      mod('app/session/local-authority-adapter.js'),
      mod('app/gameplay/gameplay-intent.js'),
      mod('app/session/round-advance.js'),
      mod('app/session/match-end.js'),
      mod('app/session/local-timeout.js'),
      mod('app/session/local-restart.js'),
      mod('app/gameplay/computer-turn.js'),
      mod('app/core/resource-registry.js'),
      mod('app/gameplay/tap-click-confirmation.js'),
      mod('app/gameplay/keyboard-gamepad-navigation.js'),
      mod('app/gameplay/size-selection.js'),
      mod('app/gameplay/drag-interaction.js'),
      mod('app/gameplay/motion-controller.js'),
    ]);

    const shell = window.__YAKOLAK_THREEJS_SHELL__;
    if (!shell?.getAsset) throw new Error('THREEJS-061 shell asset bridge missing');
    const worldLayout = shell.getAsset('data.world-layout');
    const approvedContract = shell.getAsset('data.approved-contract');
    if (!worldLayout?.zones || !approvedContract?.rules) throw new Error('THREEJS-061 canonical runtime source assets missing');

    const isOnlineSeatType = type => type === 'online';
    const isComputerSeatType = type => type === 'computer';
    const clone = value => JSON.parse(JSON.stringify(value));
    const report = {
      fullMatches: [],
      inputPaths: {},
      timer: null,
      skip: null,
      draw: null,
      restart: null,
      rematch: null,
      deployedModules: [],
    };

    function recordModule(path) {
      const href = new URL(path, baseUrl).href;
      if (!href.startsWith(baseUrl)) throw new Error(`THREEJS-061 deployed module escaped base path: ${href}`);
      report.deployedModules.push(href);
    }
    [
      'app/shared/rules.js',
      'app/session/canonical-session-state.js',
      'app/session/local-authority-adapter.js',
      'app/gameplay/tap-click-confirmation.js',
      'app/gameplay/keyboard-gamepad-navigation.js',
      'app/gameplay/drag-interaction.js',
      'app/gameplay/computer-turn.js',
    ].forEach(recordModule);

    function configuredSeats(playerCount, mixed) {
      return seatOrder.configuredSeatOrder('marble', playerCount).map((slot, index) => ({
        seatId: slot.seatId,
        type: mixed && index > 0 ? 'computer' : 'human',
        color: slot.color,
        ready: true,
      }));
    }

    function initialRoundReadyState(playerCount, mixed, generation = 1) {
      const seats = configuredSeats(playerCount, mixed);
      return canonicalState.createCanonicalSessionState({
        preferredColor: 'marble',
        targetPlayers: playerCount,
        winsToMatch: 3,
        seats,
        board: rules.emptyBoard(),
        activeSeatId: seats[0].seatId,
        deadlineAtMs: null,
        round: 1,
        revision: 0,
        lifecycle: { phase: 'round-ready', presentationGeneration: generation },
      });
    }

    function legalMoves(state, seatId) {
      const moves = [];
      for (let cell = 0; cell < rules.RULES.cellCount; cell += 1) {
        for (const size of rules.SIZES) {
          const move = { cell, size };
          if (rules.validatePlacementForSeat(state, seatId, move).ok) moves.push(move);
        }
      }
      return moves;
    }

    function preferredMove(state, seatId) {
      const seat = state.seats.find(candidate => candidate.seatId === seatId);
      const moves = legalMoves(state, seatId);
      for (const move of moves) {
        const placed = rules.placePiece(state.board, seat.color, move);
        if (rules.winningPatterns(placed, seat.color).length > 0) return move;
      }
      const center = moves.find(move => move.cell === 4);
      return center || moves[0] || null;
    }

    function humanIntent(state, move, source = gameplayIntent.GAMEPLAY_PRESENTATION_SOURCES.CLICK) {
      return gameplayIntent.createGameplayIntent({
        kind: gameplayIntent.GAMEPLAY_INTENT_KINDS.MOVE,
        origin: gameplayIntent.GAMEPLAY_INTENT_ORIGINS.HUMAN,
        seat: state.activeSeatId,
        revision: state.revision,
        payload: move,
        source,
        adapter: gameplayIntent.GAMEPLAY_AUTHORITY_ADAPTERS.LOCAL,
      });
    }

    async function playFullMatch({ playerCount, mixed }) {
      let nowMs = 1_000_000 + playerCount * 100_000 + (mixed ? 50_000 : 0);
      let state = initialRoundReadyState(playerCount, mixed, 100 + playerCount + (mixed ? 10 : 0));
      let authority = localAuthority.createLocalAuthorityAdapter({
        initialState: state,
        isOnlineSeatType,
        clock: () => nowMs,
      });
      let steps = 0;
      let roundWins = 0;
      let draws = 0;
      let botMoves = 0;
      let humanMoves = 0;
      let skipCount = 0;
      let deadlineChecks = 0;
      let finalMatchEnd = null;

      while (steps < 700) {
        state = await authority.snapshot();
        canonicalState.assertCanonicalSessionState(state);

        if (state.matchComplete) {
          const committed = matchEnd.commitCanonicalMatchEnd(state, { expectedRevision: state.revision });
          finalMatchEnd = committed.state;
          break;
        }

        if (state.lifecycle.phase === 'win' || state.lifecycle.phase === 'draw') {
          if (state.lifecycle.phase === 'win') roundWins += 1;
          else draws += 1;
          const advanced = roundAdvance.advanceCanonicalRound(state, { expectedRevision: state.revision });
          nowMs += 250;
          state = roundAdvance.beginCommittedLocalRoundTurn(advanced.state, {
            expectedRevision: advanced.state.revision,
            nowMs,
            isOnlineSeatType,
          });
          if (state.deadlineAtMs !== nowMs + 18_000) throw new Error('THREEJS-061 round-start deadline is not 18 seconds');
          deadlineChecks += 1;
          authority = localAuthority.createLocalAuthorityAdapter({ initialState: state, isOnlineSeatType, clock: () => nowMs });
          continue;
        }

        if (state.lifecycle.phase !== 'turn-loop') throw new Error(`THREEJS-061 unexpected phase ${state.lifecycle.phase}`);
        if (state.deadlineAtMs !== nowMs + 18_000 && steps === 0) throw new Error('THREEJS-061 initial deadline is not 18 seconds');
        const activeSeat = state.seats.find(seat => seat.seatId === state.activeSeatId);
        if (!activeSeat) throw new Error('THREEJS-061 active seat missing');

        let result;
        if (activeSeat.type === 'computer') {
          const intents = computerTurn.enumerateComputerLegalMoveIntents(state, activeSeat.seatId);
          if (intents.length === 0) throw new Error('THREEJS-061 computer active seat had no legal move');
          const preferred = preferredMove(state, activeSeat.seatId);
          const preferredIndex = Math.max(0, intents.findIndex(intent => (
            intent.payload.cell === preferred?.cell && intent.payload.size === preferred?.size
          )));
          const registry = resourceRegistryModule.createResourceRegistry({ platform: window });
          const producer = computerTurn.createComputerTurnProducer({
            authority,
            isComputerSeatType,
            resourceRegistry: registry,
            strategyRandom: () => Math.min(0.999999, (preferredIndex + 0.25) / intents.length),
            presentationRandom: () => 0,
            clock: () => nowMs,
          });
          const played = await producer.playCurrentTurn({ reducedMotion: true });
          producer.release();
          registry.dispose('threejs061-bot-turn-complete');
          if (played.status !== 'submitted') throw new Error(`THREEJS-061 bot move status ${played.status}`);
          result = played.result;
          botMoves += 1;
        } else {
          const move = preferredMove(state, activeSeat.seatId);
          if (!move) throw new Error('THREEJS-061 human active seat had no legal move');
          result = await authority.submit(humanIntent(state, move));
          humanMoves += 1;
        }

        if (!result?.accepted) throw new Error('THREEJS-061 authority did not accept local move');
        canonicalState.assertCanonicalSessionState(result.snapshot);
        if (result.outcome === 'move') {
          if (result.snapshot.deadlineAtMs !== nowMs + 18_000) throw new Error('THREEJS-061 handoff deadline is not 18 seconds');
          deadlineChecks += 1;
          skipCount += result.details?.handoff?.skips?.length || 0;
        } else if (!['round-win', 'match-win', 'draw'].includes(result.outcome)) {
          throw new Error(`THREEJS-061 unexpected move outcome ${result.outcome}`);
        }
        nowMs += 250;
        steps += 1;
      }

      if (!finalMatchEnd) throw new Error(`THREEJS-061 full match did not finish (${playerCount}, mixed=${mixed})`);
      canonicalState.assertCanonicalSessionState(finalMatchEnd);
      if (finalMatchEnd.lifecycle.phase !== 'match-end' || !finalMatchEnd.matchComplete) {
        throw new Error('THREEJS-061 full match did not commit MATCH_END');
      }
      if (finalMatchEnd.matchWinner?.wins !== 3) throw new Error('THREEJS-061 match winner did not reach winsToMatch=3');

      return {
        playerCount,
        configuration: mixed ? 'human+computer' : 'all-human',
        steps,
        rounds: finalMatchEnd.round,
        roundWins,
        draws,
        botMoves,
        humanMoves,
        skipCount,
        deadlineChecks,
        winner: clone(finalMatchEnd.matchWinner),
        scores: clone(finalMatchEnd.scores),
        finalRevision: finalMatchEnd.revision,
        finalState: canonicalState.serializeCanonicalSessionState(finalMatchEnd),
      };
    }

    for (const playerCount of [2, 3, 4]) {
      report.fullMatches.push(await playFullMatch({ playerCount, mixed: false }));
      report.fullMatches.push(await playFullMatch({ playerCount, mixed: true }));
    }
    if (report.fullMatches.some(match => match.configuration === 'human+computer' && match.botMoves === 0)) {
      throw new Error('THREEJS-061 mixed full match did not execute computer turns');
    }

    function turnLoopState({ playerCount = 2, board = rules.emptyBoard(), revision = 50, generation = 50, deadlineAtMs = 900_000 } = {}) {
      const seats = configuredSeats(playerCount, false);
      return canonicalState.createCanonicalSessionState({
        preferredColor: 'marble',
        targetPlayers: playerCount,
        winsToMatch: 3,
        seats,
        board,
        activeSeatId: seats[0].seatId,
        deadlineAtMs,
        round: 1,
        revision,
        lifecycle: { phase: 'turn-loop', presentationGeneration: generation },
      });
    }

    function rayAtCell(cell) {
      const zone = worldLayout.zones.find(candidate => candidate.id === cell);
      if (!zone) throw new Error(`THREEJS-061 world-layout cell ${cell} missing`);
      return { origin: [zone.position[0], zone.position[1] + 100, zone.position[2]], direction: [0, -1, 0] };
    }

    async function tapOrClickProbe(source) {
      const state = turnLoopState({ revision: source === 'tap' ? 60 : 61, generation: 60 });
      const authority = localAuthority.createLocalAuthorityAdapter({ initialState: state, isOnlineSeatType, clock: () => 880_000 });
      const controller = tapClick.createTapClickConfirmationController({
        authority,
        intentFactory: input => gameplayIntent.createGameplayIntent({ ...input, adapter: gameplayIntent.GAMEPLAY_AUTHORITY_ADAPTERS.LOCAL }),
        onFeedback() {},
        worldLayout,
        approvedContract,
      });
      const selected = controller.tapSize({ state, stackTargetId: 'stack:right:0', size: 'large', source });
      const cell = selected.selection.legalCells[0];
      const pending = controller.tapBoard({
        state,
        ray: rayAtCell(cell),
        pointerType: source === 'tap' ? 'touch' : 'mouse',
        source,
      });
      if (pending.status !== 'pending') throw new Error(`THREEJS-061 ${source} did not enter pending`);
      const result = await pending.submission;
      if (!result.accepted || pending.intent.presentation.source !== source) throw new Error(`THREEJS-061 ${source} submission failed`);
      controller.reconcileCanonical({ state: result.snapshot, clearReason: 'accepted-resync' });
      return { source, cell, size: 'large', outcome: result.outcome, revision: result.revision };
    }

    report.inputPaths.tap = await tapOrClickProbe(gameplayIntent.GAMEPLAY_PRESENTATION_SOURCES.TAP);
    report.inputPaths.click = await tapOrClickProbe(gameplayIntent.GAMEPLAY_PRESENTATION_SOURCES.CLICK);

    async function navigationProbe(kind) {
      const state = turnLoopState({ revision: kind === 'keyboard' ? 62 : 63, generation: 61 });
      const authority = localAuthority.createLocalAuthorityAdapter({ initialState: state, isOnlineSeatType, clock: () => 880_000 });
      const controller = navigation.createKeyboardGamepadNavigationController({
        authority,
        intentFactory: input => gameplayIntent.createGameplayIntent({ ...input, adapter: gameplayIntent.GAMEPLAY_AUTHORITY_ADAPTERS.LOCAL }),
        onFeedback() {},
      });
      controller.begin({ state });
      let pending;
      if (kind === 'keyboard') {
        controller.handleKeyboard({ state, event: { key: 'Enter' } });
        pending = controller.handleKeyboard({ state, event: { key: 'Enter' } }).result;
      } else {
        const neutral = { buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })), axes: [0, 0] };
        const confirm = clone(neutral);
        confirm.buttons[0] = { pressed: true, value: 1 };
        controller.handleGamepad({ state, gamepad: confirm, previousGamepad: neutral });
        pending = controller.handleGamepad({ state, gamepad: confirm, previousGamepad: neutral }).result;
      }
      if (pending?.status !== 'pending') throw new Error(`THREEJS-061 ${kind} did not submit`);
      const result = await pending.submission;
      if (!result.accepted) throw new Error(`THREEJS-061 ${kind} authority submission failed`);
      const expectedSource = kind === 'keyboard'
        ? gameplayIntent.GAMEPLAY_PRESENTATION_SOURCES.KEYBOARD_CONFIRM
        : gameplayIntent.GAMEPLAY_PRESENTATION_SOURCES.GAMEPAD_CONFIRM;
      if (pending.intent.presentation.source !== expectedSource) throw new Error(`THREEJS-061 ${kind} source mismatch`);
      controller.reconcileCanonical({ state: result.snapshot, clearReason: 'accepted-resync' });
      return { source: expectedSource, move: clone(pending.intent.payload), outcome: result.outcome, revision: result.revision };
    }

    report.inputPaths.keyboard = await navigationProbe('keyboard');
    report.inputPaths.gamepad = await navigationProbe('gamepad');

    async function dragProbe() {
      const state = turnLoopState({ revision: 64, generation: 62 });
      const authority = localAuthority.createLocalAuthorityAdapter({ initialState: state, isOnlineSeatType, clock: () => 880_000 });
      const registry = resourceRegistryModule.createResourceRegistry({ platform: window });
      const motion = motionModule.createMotionController({
        resourceRegistry: registry,
        reducedMotion: true,
        generation: state.lifecycle.presentationGeneration,
        revision: state.revision,
        clock: () => 0,
      });
      const selectionController = sizeSelectionModule.createSizeSelectionController();
      const selection = selectionController.select(state, { stackTargetId: 'stack:right:0', size: 'medium' });
      const pieceId = selection.selectedPieceTargetId;
      const zone = worldLayout.zones.find(candidate => candidate.id === selection.legalCells[0]);
      const homeCenter = worldLayout.homeStacks.right[0];
      let currentTransform = { position: [...homeCenter], rotationDegrees: [...worldLayout.pieceRotationDegrees], scale: [1, 1, 1] };
      const canonicalTransform = clone(currentTransform);
      const presentation = {
        readPieceTransform: id => id === pieceId ? clone(currentTransform) : null,
        readCanonicalPieceTransform: id => id === pieceId ? clone(canonicalTransform) : null,
        applyDragTransform(id, transform) { if (id === pieceId) currentTransform = clone(transform); },
        snapPieceCanonical(id) { if (id === pieceId) currentTransform = clone(canonicalTransform); },
        isPieceLive: id => id === pieceId,
      };
      const drag = dragModule.createDragInteractionController({
        motionController: motion,
        authority,
        intentFactory: input => gameplayIntent.createGameplayIntent({ ...input, adapter: gameplayIntent.GAMEPLAY_AUTHORITY_ADAPTERS.LOCAL }),
        presentation,
        setCameraGesturesEnabled() {},
        clearSelection(reason, nextState = null) { return selectionController.clear(reason, nextState); },
        approvedContract,
        worldLayout,
      });
      drag.begin({ state, selection, pointerId: 77, pointerType: 'touch' });
      const ray = { origin: [zone.position[0], zone.position[1] + 100, zone.position[2]], direction: [0, -1, 0] };
      drag.update({ state, selection, pointerId: 77, pointerType: 'touch', ray });
      const pending = drag.release({ state, selection, pointerId: 77, pointerType: 'touch', ray });
      if (pending.status !== 'pending') throw new Error('THREEJS-061 drag did not enter pending');
      const result = await pending.submission;
      if (!result.accepted || pending.intent.presentation.source !== gameplayIntent.GAMEPLAY_PRESENTATION_SOURCES.DRAG_RELEASE) {
        throw new Error('THREEJS-061 drag submission failed');
      }
      motion.release();
      registry.dispose('threejs061-drag-probe-complete');
      return { source: pending.intent.presentation.source, move: clone(pending.intent.payload), outcome: result.outcome, revision: result.revision };
    }
    report.inputPaths.drag = await dragProbe();
    report.inputPaths.computer = {
      source: 'bot',
      exercisedMoves: report.fullMatches.filter(match => match.configuration === 'human+computer').reduce((sum, match) => sum + match.botMoves, 0),
    };

    // Explicit 18-second timeout handoff on deployed local authority.
    {
      let nowMs = 2_000_001;
      const state = turnLoopState({ revision: 70, generation: 70, deadlineAtMs: 2_000_000 });
      const attempt = localTimeout.createExpiredLocalTimeoutIntent(state, { nowMs, isOnlineSeatType });
      if (!attempt) throw new Error('THREEJS-061 timeout intent missing');
      const authority = localAuthority.createLocalAuthorityAdapter({ initialState: state, isOnlineSeatType, clock: () => nowMs });
      const result = await authority.submit(attempt.intent);
      if (result.outcome !== 'timeout' || result.snapshot.deadlineAtMs !== nowMs + 18_000) {
        throw new Error('THREEJS-061 timeout handoff/deadline mismatch');
      }
      report.timer = {
        durationMs: 18_000,
        fromSeatId: state.activeSeatId,
        toSeatId: result.snapshot.activeSeatId,
        deadlineAtMs: result.snapshot.deadlineAtMs,
      };
    }

    function exhaustColor(board, color, cells) {
      for (const size of rules.SIZES) for (const cell of cells) board[String(cell)][size] = color;
      return board;
    }

    // Real skip through local authority: back+left are exhausted, so right hands to front.
    {
      let board = rules.emptyBoard();
      board = exhaustColor(board, 'blue', [0, 1, 2]);
      board = exhaustColor(board, 'gold', [3, 4, 5]);
      const state = turnLoopState({ playerCount: 4, board, revision: 71, generation: 71 });
      const move = legalMoves(state, state.activeSeatId).find(candidate => {
        const next = rules.placePiece(state.board, 'marble', candidate);
        return rules.winningPatterns(next, 'marble').length === 0;
      });
      if (!move) throw new Error('THREEJS-061 skip fixture has no non-winning move');
      const authority = localAuthority.createLocalAuthorityAdapter({ initialState: state, isOnlineSeatType, clock: () => 880_000 });
      const result = await authority.submit(humanIntent(state, move));
      const skipped = result.details?.handoff?.skips || [];
      if (result.outcome !== 'move' || result.snapshot.activeSeatId !== 'front' || skipped.map(item => item.seatId).join(',') !== 'back,left') {
        throw new Error('THREEJS-061 canonical skip order mismatch');
      }
      report.skip = { move, skipped: clone(skipped), nextSeatId: result.snapshot.activeSeatId };
    }

    // Deterministic true-draw fixture; shared rules prove no winner and no legal mover.
    {
      const placements = [
        ...[2, 5, 6].map(cell => ({ color: 'marble', size: 'small', cell })),
        ...[1, 3, 7].map(cell => ({ color: 'blue', size: 'small', cell })),
        ...[1, 5, 8].map(cell => ({ color: 'marble', size: 'medium', cell })),
        ...[3, 4, 7].map(cell => ({ color: 'blue', size: 'medium', cell })),
        ...[1, 3, 7].map(cell => ({ color: 'marble', size: 'large', cell })),
        ...[0, 2, 4].map(cell => ({ color: 'blue', size: 'large', cell })),
      ];
      let board = rules.emptyBoard();
      for (const placement of placements) {
        if (placement.color === 'marble' && placement.size === 'small' && placement.cell === 2) continue;
        board = rules.placePiece(board, placement.color, placement);
      }
      const state = turnLoopState({ board, revision: 72, generation: 72 });
      const move = { cell: 2, size: 'small' };
      const authority = localAuthority.createLocalAuthorityAdapter({ initialState: state, isOnlineSeatType, clock: () => 880_000 });
      const result = await authority.submit(humanIntent(state, move));
      if (result.outcome !== 'draw' || !result.snapshot.draw || result.snapshot.winner !== null) throw new Error('THREEJS-061 true draw mismatch');
      if (rules.winningPatterns(result.snapshot.board, 'marble').length || rules.winningPatterns(result.snapshot.board, 'blue').length) {
        throw new Error('THREEJS-061 draw fixture produced a winning pattern');
      }
      report.draw = { outcome: result.outcome, revision: result.revision, skips: clone(result.snapshot.skips) };
    }

    // Restart is legal only before a committed placement; scores/round persist and deadline restarts at +18s.
    {
      let nowMs = 3_000_000;
      const initial = initialRoundReadyState(2, false, 73);
      const authority = localAuthority.createLocalAuthorityAdapter({ initialState: initial, isOnlineSeatType, clock: () => nowMs });
      const state = await authority.snapshot();
      const request = localRestart.createLocalRestartRequest(state, {
        isOnlineSeatType,
        source: gameplayIntent.GAMEPLAY_PRESENTATION_SOURCES.CLICK,
      });
      const result = await authority.submit(request.intent);
      if (result.outcome !== 'restart' || result.snapshot.deadlineAtMs !== nowMs + 18_000 || result.snapshot.round !== state.round) {
        throw new Error('THREEJS-061 restart mismatch');
      }
      report.restart = { outcome: result.outcome, round: result.snapshot.round, deadlineAtMs: result.snapshot.deadlineAtMs };
    }

    // Rematch from one real completed full match, preserving seat topology but resetting score/round.
    {
      const sourceMatch = report.fullMatches[0];
      let nowMs = 4_000_000;
      const matchState = canonicalState.parseCanonicalSessionState(sourceMatch.finalState);
      const authority = localAuthority.createLocalAuthorityAdapter({ initialState: matchState, isOnlineSeatType, clock: () => nowMs });
      const request = matchEnd.createLocalRematchRequest(matchState, {
        isOnlineSeatType,
        source: gameplayIntent.GAMEPLAY_PRESENTATION_SOURCES.CLICK,
      });
      const result = await authority.submit(request.intent);
      if (result.outcome !== 'rematch' || result.snapshot.round !== 1 || result.snapshot.completedRounds !== 0) {
        throw new Error('THREEJS-061 rematch lifecycle mismatch');
      }
      if (Object.values(result.snapshot.scores).some(score => score !== 0)) throw new Error('THREEJS-061 rematch did not reset score');
      if (result.snapshot.deadlineAtMs !== nowMs + 18_000) throw new Error('THREEJS-061 rematch deadline mismatch');
      report.rematch = { outcome: result.outcome, round: 1, scores: clone(result.snapshot.scores), deadlineAtMs: result.snapshot.deadlineAtMs };
    }

    return report;
  }, liveUrl);
}

async function createResumeSnapshot(page) {
  return page.evaluate(async (baseUrl) => {
    const mod = path => import(new URL(path, baseUrl).href);
    const [rules, seatOrder, stateModule, authorityModule, intentModule] = await Promise.all([
      mod('app/shared/rules.js'),
      mod('app/shared/seat-order.js'),
      mod('app/session/canonical-session-state.js'),
      mod('app/session/local-authority-adapter.js'),
      mod('app/gameplay/gameplay-intent.js'),
    ]);
    const seats = seatOrder.configuredSeatOrder('marble', 2).map(slot => ({
      seatId: slot.seatId, type: 'human', color: slot.color, ready: true,
    }));
    const initial = stateModule.createCanonicalSessionState({
      preferredColor: 'marble', targetPlayers: 2, winsToMatch: 3, seats,
      board: rules.emptyBoard(), activeSeatId: seats[0].seatId, deadlineAtMs: 5_018_000,
      round: 1, revision: 80, lifecycle: { phase: 'turn-loop', presentationGeneration: 80 },
    });
    const authority = authorityModule.createLocalAuthorityAdapter({ initialState: initial, isOnlineSeatType: () => false, clock: () => 5_000_000 });
    const intent = intentModule.createGameplayIntent({
      kind: intentModule.GAMEPLAY_INTENT_KINDS.MOVE,
      origin: intentModule.GAMEPLAY_INTENT_ORIGINS.HUMAN,
      seat: initial.activeSeatId,
      revision: initial.revision,
      payload: { cell: 4, size: 'large' },
      source: intentModule.GAMEPLAY_PRESENTATION_SOURCES.CLICK,
      adapter: intentModule.GAMEPLAY_AUTHORITY_ADAPTERS.LOCAL,
    });
    const result = await authority.submit(intent);
    return {
      serialized: stateModule.serializeCanonicalSessionState(result.snapshot),
      revision: result.snapshot.revision,
      activeSeatId: result.snapshot.activeSeatId,
    };
  }, liveUrl);
}

async function continueResumeSnapshot(page, serialized) {
  return page.evaluate(async ({ baseUrl, serializedState }) => {
    const mod = path => import(new URL(path, baseUrl).href);
    const [rules, stateModule, authorityModule, intentModule] = await Promise.all([
      mod('app/shared/rules.js'),
      mod('app/session/canonical-session-state.js'),
      mod('app/session/local-authority-adapter.js'),
      mod('app/gameplay/gameplay-intent.js'),
    ]);
    const resumed = stateModule.parseCanonicalSessionState(serializedState);
    const authority = authorityModule.createLocalAuthorityAdapter({ initialState: resumed, isOnlineSeatType: () => false, clock: () => 5_000_250 });
    let move = null;
    for (let cell = 0; cell < rules.RULES.cellCount && !move; cell += 1) {
      for (const size of rules.SIZES) {
        if (rules.validatePlacementForSeat(resumed, resumed.activeSeatId, { cell, size }).ok) {
          move = { cell, size };
          break;
        }
      }
    }
    if (!move) throw new Error('THREEJS-061 resumed state has no legal move');
    const intent = intentModule.createGameplayIntent({
      kind: intentModule.GAMEPLAY_INTENT_KINDS.MOVE,
      origin: intentModule.GAMEPLAY_INTENT_ORIGINS.HUMAN,
      seat: resumed.activeSeatId,
      revision: resumed.revision,
      payload: move,
      source: intentModule.GAMEPLAY_PRESENTATION_SOURCES.CLICK,
      adapter: intentModule.GAMEPLAY_AUTHORITY_ADAPTERS.LOCAL,
    });
    const result = await authority.submit(intent);
    return {
      beforeRevision: resumed.revision,
      afterRevision: result.snapshot.revision,
      resumedActiveSeatId: resumed.activeSeatId,
      move,
      outcome: result.outcome,
    };
  }, { baseUrl: liveUrl, serializedState: serialized });
}

const evidence = {
  schema: 'yakolak.threejs061-live-local-acceptance/v1',
  status: 'running',
  liveUrl,
  expectedCandidateSha,
  startedAt: new Date().toISOString(),
  manifest: null,
  httpIdentity: null,
  basePath: null,
  contextRecovery: null,
  gameplay: null,
  refreshResume: null,
  pageErrors: [],
  failures: [],
};

let browser;
try {
  if (!/^[a-f0-9]{40}$/.test(expectedCandidateSha)) throw new Error('THREEJS061_EXPECTED_CANDIDATE_SHA must be one exact 40-hex commit SHA');
  const live = await waitForExactLiveGeneration();
  evidence.manifest = { pollAttempt: live.attempt, ...live.identity };
  evidence.httpIdentity = await verifyLiveHttpIdentity(live.identity);

  browser = await chromium.launch({
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', error => evidence.pageErrors.push(error.message));
  await page.goto(`${liveUrl}?threejs061=${encodeURIComponent(live.identity.deploymentGeneration)}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await waitForReady(page);

  evidence.basePath = await runBasePathProbe(page);
  evidence.gameplay = await runDeployedGameplayProbe(page);

  const beforeRefresh = await createResumeSnapshot(page);
  await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
  await waitForReady(page);
  const afterRefresh = await continueResumeSnapshot(page, beforeRefresh.serialized);
  if (afterRefresh.beforeRevision !== beforeRefresh.revision || afterRefresh.afterRevision <= afterRefresh.beforeRevision) {
    throw new Error('THREEJS-061 refresh/resume revision continuity failed');
  }
  evidence.refreshResume = {
    source: 'canonical-serialized-snapshot-across-real-page-reload',
    beforeRevision: beforeRefresh.revision,
    afterRevision: afterRefresh.afterRevision,
    activeSeatBeforeReload: beforeRefresh.activeSeatId,
    resumedActiveSeatId: afterRefresh.resumedActiveSeatId,
    resumedMove: afterRefresh.move,
    outcome: afterRefresh.outcome,
  };

  evidence.contextRecovery = await runContextRecoveryProbe(page);
  if (evidence.pageErrors.length) throw new Error(`THREEJS-061 page errors: ${evidence.pageErrors.join('; ')}`);

  evidence.status = 'passed';
  evidence.completedAt = new Date().toISOString();
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence));
  console.log('THREEJS-061 exact-generation live local slice: PASS');
} catch (error) {
  evidence.status = 'failed';
  evidence.completedAt = new Date().toISOString();
  evidence.failures.push({
    code: error?.code || 'threejs061_acceptance_failed',
    message: error?.message || String(error),
    details: error?.details || error?.lastObservation || null,
  });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
}
